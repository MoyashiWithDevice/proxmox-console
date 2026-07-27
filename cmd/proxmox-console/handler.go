package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const maxISOSize = 10 << 30 // 10GB max ISO upload size

var wsUpgrader = websocket.Upgrader{
	HandshakeTimeout: 10 * time.Second,
	// 必要に応じてOriginを検証してください
	CheckOrigin: func(r *http.Request) bool { return true },
}

// getVMIDAndNode は Terraform state から VM ID とノード名を取得します
func getVMIDAndNode(workdir string) (int, string, error) {
	tfstatePath := filepath.Join(workdir, "terraform.tfstate")
	b, err := os.ReadFile(tfstatePath)
	if err != nil {
		return 0, "", fmt.Errorf("failed to read tfstate: %w", err)
	}

	var tfstate TFState
	if err := json.Unmarshal(b, &tfstate); err != nil {
		return 0, "", fmt.Errorf("failed to unmarshal tfstate: %w", err)
	}

	for _, resource := range tfstate.Resources {
		if resource.Type == "proxmox_virtual_environment_vm" && len(resource.Instances) > 0 {
			attrs := resource.Instances[0].Attributes
			vmID := int(attrs["vm_id"].(float64))
			nodeName := fmt.Sprint(attrs["node_name"])
			return vmID, nodeName, nil
		}
	}

	return 0, "", fmt.Errorf("vm not found in tfstate")
}

// GET: /api/vms
func userVMListHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("userVMListHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, err.Error(), 500)
		return
	}

	vms, err := listUserVMs(userID)
	if err != nil {
		log.Printf("userVMListHandler: listUserVMs: %v", err)
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vms)
}

// GET: /api/vms/{id}
func vmDetailGetHandler(w http.ResponseWriter, r *http.Request) {
	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("vmDetailGetHandler: missing uuid")
		writeJSONError(w, http.StatusBadRequest, "invalid vm id")
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("vmDetailGetHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("vmDetailGetHandler: getDatabaseUserID: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	dbVm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		log.Printf("vmDetailGetHandler: getVMByUUID(%s): %v", uuid, err)
		writeJSONError(w, http.StatusNotFound, "vm not found")
		return
	}

	tfstatePath := filepath.Join(dbVm.TFWorkdir, "terraform.tfstate")
	b, err := os.ReadFile(tfstatePath)
	if err != nil {
		log.Printf("vmDetailGetHandler: read tfstate: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to read vm state")
		return
	}
	var state TFState
	if err := json.Unmarshal(b, &state); err != nil {
		log.Printf("vmDetailGetHandler: parse tfstate: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to parse vm state")
		return
	}

	vm := VMResponse{
		UUID:   dbVm.UUID,
		VMID:   dbVm.ProxmoxVMID,
		Status: dbVm.Status,
		IP:     "-",
	}
	for _, res := range state.Resources {
		if res.Type != "proxmox_virtual_environment_vm" || len(res.Instances) == 0 {
			continue
		}
		attr := res.Instances[0].Attributes
		vm.Servername = parseString(attr["name"])
		if parsed, ok := parseInt(attr["vm_id"]); ok {
			vm.VMID = parsed
		}
		if cores, ok := parseFirstMapInt(attr["cpu"], "cores"); ok {
			vm.CPU = cores
		}
		if mem, ok := parseFirstMapInt(attr["memory"], "dedicated"); ok {
			vm.Memory = mem
		}
		if hdd, ok := parseFirstMapInt(attr["disk"], "size"); ok {
			vm.HDD = hdd
		}
		break
	}

	if strings.EqualFold(dbVm.Status, "completed") {
		ctx := context.Background()
		if info, err := getProxmoxVMInfo(ctx, dbVm.NodeName, dbVm.ProxmoxVMID); err == nil {
			vm.Status = info.Status
			vm.IP = info.IP
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vm)
}

// POST: /api/vms
func createVMHandler(w http.ResponseWriter, r *http.Request) {
	jobID := fmt.Sprintf("%d", time.Now().UnixNano())

	kratosUserID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("createVMHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var req VMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("createVMHandler: decode request: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	reqCopy := req
	jobs.Store(jobID, &Job{Status: "running", Servername: req.Servername, OwnerID: kratosUserID, Request: &reqCopy})

	go runTerraformJob(jobID, &req, r)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID})
}

// POST: /api/vm/retry
func retryVMHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("retryVMHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	jobID := r.PathValue("id")
	if jobID == "" {
		log.Printf("retryVMHandler: missing job_id")
		writeJSONError(w, http.StatusBadRequest, "missing job_id")
		return
	}

	jobAny, ok := jobs.Load(jobID)
	if !ok {
		log.Printf("retryVMHandler: job not found: %s", jobID)
		writeJSONError(w, http.StatusNotFound, "job not found")
		return
	}

	job := jobAny.(*Job)
	if job.OwnerID != userID {
		log.Printf("retryVMHandler: forbidden: job=%s, owner=%s, user=%s", jobID, job.OwnerID, userID)
		writeJSONError(w, http.StatusForbidden, "forbidden")
		return
	}

	if job.Status != "error" {
		log.Printf("retryVMHandler: job %s not in error state: %s", jobID, job.Status)
		writeJSONError(w, http.StatusBadRequest, "job is not in error state")
		return
	}

	if job.Request == nil {
		log.Printf("retryVMHandler: job %s missing original request", jobID)
		writeJSONError(w, http.StatusBadRequest, "original request not found")
		return
	}

	// Clean up old workdir
	if job.Workdir != "" {
		if err := os.RemoveAll(job.Workdir); err != nil {
			fmt.Println("Warning: failed to clean up old workdir:", err)
		}
	}

	// Mark old job as retried
	job.Status = "retried"
	jobs.Store(jobID, job)

	// Create new job with the same request
	newJobID := fmt.Sprintf("%d", time.Now().UnixNano())
	newReq := *job.Request

	newJob := &Job{
		Status:     "running",
		Servername: newReq.Servername,
		OwnerID:    userID,
		Request:    &newReq,
	}
	jobs.Store(newJobID, newJob)

	go runTerraformJob(newJobID, &newReq, r)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"job_id": newJobID})
}

// PATCH: /api/vm
func updateVMHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("updateVMHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("updateVMHandler: missing uuid")
		http.Error(w, "invalid vmid", http.StatusBadRequest)
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("updateVMHandler: getDatabaseUserID: %v", err)
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}

	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		log.Printf("updateVMHandler: getVMByUUID(%s): %v", uuid, err)
		http.Error(w, "vm not found", http.StatusNotFound)
		return
	}

	var req VMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("updateVMHandler: decode request: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.VMID = vm.ProxmoxVMID

	jobID := fmt.Sprintf("%d", time.Now().UnixNano())
	jobs.Store(jobID, &Job{Status: "running", Servername: req.Servername, OwnerID: userID, VMID: vm.ProxmoxVMID, UUID: uuid})

	// Run VM update in background
	go runUpdateVMJob(jobID, userID, uuid, req)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"job_id": jobID,
		"status": "modified",
	})
}

// DELETE: /api/vm
func deleteVMHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("deleteVMHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("deleteVMHandler: missing uuid")
		http.Error(w, "invalid vmid", http.StatusBadRequest)
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("deleteVMHandler: getDatabaseUserID: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Printf("deleteVMHandler: vm %s not found", uuid)
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
		log.Printf("deleteVMHandler: getVMByUUID(%s): %v", uuid, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := deleteProxmoxVM(context.Background(), vm.NodeName, vm.ProxmoxVMID); err != nil {
		log.Printf("deleteVMHandler: deleteProxmoxVM(node=%s, vmid=%d): %v", vm.NodeName, vm.ProxmoxVMID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := deleteVMByUUID(uuid, dbUserID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Printf("deleteVMHandler: deleteVMByUUID(%s): not found", uuid)
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
		log.Printf("deleteVMHandler: deleteVMByUUID(%s): %v", uuid, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := os.RemoveAll(vm.TFWorkdir); err != nil && !os.IsNotExist(err) {
		fmt.Println("failed to remove VM workdir:", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// GET: /api/jobs
func listJobsHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("listJobsHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var result []JobResponse
	jobs.Range(func(key, value interface{}) bool {
		j := value.(*Job)
		if j.OwnerID != userID || j.Status == "done" || j.Status == "retried" {
			return true
		}
		result = append(result, JobResponse{
			ID:         key.(string),
			Status:     j.Status,
			Servername: j.Servername,
			IP:         j.IP,
			UUID:       j.UUID,
		})
		return true
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GET: /api/jobs/{id}
func jobDetailGetHandler(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if jobID == "" {
		log.Printf("jobDetailGetHandler: missing job id")
		writeJSONError(w, http.StatusBadRequest, "missing job id")
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("jobDetailGetHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	jobAny, ok := jobs.Load(jobID)
	if !ok {
		log.Printf("jobDetailGetHandler: job not found: %s", jobID)
		writeJSONError(w, http.StatusNotFound, "job not found")
		return
	}

	job := jobAny.(*Job)
	if job.OwnerID != userID {
		log.Printf("jobDetailGetHandler: forbidden: job=%s, owner=%s, user=%s", jobID, job.OwnerID, userID)
		writeJSONError(w, http.StatusForbidden, "forbidden")
		return
	}

	b, err := os.ReadFile(job.LogPath)
	if err == nil {
		job.Log = string(b)
	}

	resp := JobResponse{
		ID:         jobID,
		Status:     job.Status,
		Servername: job.Servername,
		IP:         job.IP,
		Log:        job.Log,
		VMID:       job.VMID,
		UUID:       job.UUID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func vmTerminalHandler(w http.ResponseWriter, r *http.Request) {

	// ── 認証 ──────────────────────────────────────────────────────────────
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("vmTerminalHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// ── パラメータ取得 ────────────────────────────────────────────────────
	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("vmTerminalHandler: missing uuid")
		http.Error(w, "missing vmid", http.StatusBadRequest)
		return
	}

	// ── 所有者チェック ────────────────────────────────────────────────────
	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("vmTerminalHandler: getDatabaseUserID: %v", err)
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}
	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		log.Printf("vmTerminalHandler: getVMByUUID(%s): %v", uuid, err)
		http.Error(w, "vm not found", http.StatusNotFound)
		return
	}

	// ── VM IPアドレス取得 ─────────────────────────────────────────────────
	info, err := getProxmoxVMInfo(context.Background(), vm.NodeName, vm.ProxmoxVMID)
	if err != nil || info.IP == "-" {
		log.Printf("vmTerminalHandler: getProxmoxVMInfo(node=%s, vmid=%d): err=%v, ip=%q", vm.NodeName, vm.ProxmoxVMID, err, info.IP)
		http.Error(w, "VM IP not available", http.StatusInternalServerError)
		return
	}

	// ── SSH接続 ───────────────────────────────────────────────────────────
	agentUser := SettingsConf.Agent.User
	if agentUser == "" {
		agentUser = "agent"
	}
	privKeyPath := filepath.Join("cert", "agent_id_rsa")

	sshClient, err := createSSHClient(info.IP, agentUser, privKeyPath)
	if err != nil {
		log.Printf("vmTerminalHandler: createSSHClient(ip=%s, user=%s): %v", info.IP, agentUser, err)
		http.Error(w, "ssh connection failed", http.StatusInternalServerError)
		return
	}
	defer sshClient.Close()

	session, err := sshClient.NewSession()
	if err != nil {
		log.Printf("vmTerminalHandler: NewSession: %v", err)
		http.Error(w, "ssh session failed", http.StatusInternalServerError)
		return
	}
	defer session.Close()

	// ── PTY設定 ───────────────────────────────────────────────────────────
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 80, modes); err != nil {
		log.Printf("vmTerminalHandler: RequestPty: %v", err)
		http.Error(w, "pty request failed", http.StatusInternalServerError)
		return
	}

	// ── stdin/stdout/stderr パイプ ─────────────────────────────────────────
	sshIn, err := session.StdinPipe()
	if err != nil {
		log.Printf("vmTerminalHandler: StdinPipe: %v", err)
		http.Error(w, "stdin pipe failed", http.StatusInternalServerError)
		return
	}
	sshOut, err := session.StdoutPipe()
	if err != nil {
		log.Printf("vmTerminalHandler: StdoutPipe: %v", err)
		http.Error(w, "stdout pipe failed", http.StatusInternalServerError)
		return
	}
	sshErr, err := session.StderrPipe()
	if err != nil {
		log.Printf("vmTerminalHandler: StderrPipe: %v", err)
		http.Error(w, "stderr pipe failed", http.StatusInternalServerError)
		return
	}

	// ── シェル起動 ────────────────────────────────────────────────────────
	// Shell()を呼ぶだけでインタラクティブシェルが開始される。
	// Run()やWait()は呼ばない（WebSocketが切れるまで維持するため）。
	if err := session.Shell(); err != nil {
		log.Printf("vmTerminalHandler: Shell: %v", err)
		http.Error(w, "shell start failed", http.StatusInternalServerError)
		return
	}

	// ── WebSocketアップグレード ───────────────────────────────────────────
	// SSH確立後にアップグレードすることで、失敗時にHTTPエラーを返せる
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade: %v", err)
		return
	}
	defer conn.Close()

	done := make(chan struct{})

	// SSH stdout → WebSocket (BinaryMessage)
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := sshOut.Read(buf)
			if n > 0 {
				if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("sshOut read: %v", err)
				}
				return
			}
		}
	}()

	// SSH stderr → WebSocket (BinaryMessage)
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := sshErr.Read(buf)
			if n > 0 {
				conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	// WebSocket → SSH stdin
	// テキストメッセージ: {"type":"resize","cols":N,"rows":N} でウィンドウリサイズ
	// バイナリメッセージ: キー入力をそのままstdinへ
	go func() {
		for {
			mt, data, err := conn.ReadMessage()
			if err != nil {
				session.Close()
				return
			}
			if mt == websocket.TextMessage {
				var msg struct {
					Type string `json:"type"`
					Cols uint32 `json:"cols"`
					Rows uint32 `json:"rows"`
				}
				if json.Unmarshal(data, &msg) == nil && msg.Type == "resize" {
					_ = session.WindowChange(int(msg.Rows), int(msg.Cols))
					continue
				}
			}
			if _, err := sshIn.Write(data); err != nil {
				return
			}
		}
	}()

	// stdoutが閉じるまで（セッション終了まで）待つ
	<-done
}

// POST: /api/vm/state
func chStateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		log.Printf("chStateHandler: method not allowed: %s", r.Method)
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "method not allowed",
		})
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("chStateHandler: getKratosUserIDFromRequest: %v", err)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "unauthorized",
		})
		return
	}

	var req struct {
		State string `json:"state"`
	}

	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("chStateHandler: missing uuid")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid vmid",
		})
		return
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("chStateHandler: decode request: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid request",
		})
		return
	}

	if req.State != "start" && req.State != "stop" {
		log.Printf("chStateHandler: invalid state: %q", req.State)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid state",
		})
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("chStateHandler: getDatabaseUserID: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "internal",
		})
		return
	}

	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		log.Printf("chStateHandler: getVMByUUID(%s): %v", uuid, err)
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "vm not found",
		})
		return
	}

	switch req.State {
	case "start":
		err = startProxmoxVM(
			context.Background(),
			vm.NodeName,
			vm.ProxmoxVMID,
		)
	case "stop":
		err = stopProxmoxVM(
			context.Background(),
			vm.NodeName,
			vm.ProxmoxVMID,
		)
	}

	if err != nil {
		log.Printf("chStateHandler: %s vm %d (node=%s): %v", req.State, vm.ProxmoxVMID, vm.NodeName, err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": req.State + "ed",
	})
}

func vmPrivateKeyHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("vmPrivateKeyHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	uuid := r.PathValue("id")
	if uuid == "" {
		log.Printf("vmPrivateKeyHandler: missing uuid")
		http.Error(w, "missing vmid", http.StatusBadRequest)
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("vmPrivateKeyHandler: getDatabaseUserID: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Printf("vmPrivateKeyHandler: vm %s not found", uuid)
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
		log.Printf("vmPrivateKeyHandler: getVMByUUID(%s): %v", uuid, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	keyPath := filepath.Join(vm.TFWorkdir, "user_id_rsa")
	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("vmPrivateKeyHandler: key not available for vm %s: %v", uuid, err)
			http.Error(w, "key not available", http.StatusNotFound)
			return
		}
		log.Printf("vmPrivateKeyHandler: read key for vm %s: %v", uuid, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"vm-%s-id_rsa\"", uuid))
	w.Header().Set("Cache-Control", "no-store")

	if _, err := w.Write(keyBytes); err != nil {
		fmt.Println("Error writing private key response:", err)
		return
	}

	if err := os.Remove(keyPath); err != nil && !os.IsNotExist(err) {
		fmt.Println("Warning: failed to remove user private key after download:", err)
	}
}

func atoiSafe(s string) int {
	i, _ := strconv.Atoi(s)
	return i
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func rewriteTFVars(workdir string, req VMRequest) error {
	// 【追加】すべてのリクエスト値が空または0（変更なし）の場合は、何もせず正常終了する
	if req.Servername == "" && req.CPU == 0 && req.Memory == 0 && req.HDD == 0 {
		return nil
	}

	path := filepath.Join(workdir, "runtime.tfvars")

	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	name := req.Servername
	cpu := req.CPU
	memory := req.Memory
	hdd := req.HDD

	lines := strings.Split(string(b), "\n")
	out := make([]string, 0, len(lines))

	for _, line := range lines {
		trim := strings.TrimSpace(line)

		switch {
		case strings.HasPrefix(trim, "servername"):
			if name != "" {
				out = append(out, fmt.Sprintf(`servername    = "%s"`, name))
			} else {
				out = append(out, line)
			}

		case strings.HasPrefix(trim, "cpu"):
			if cpu > 0 {
				out = append(out, fmt.Sprintf(`cpu           = %d`, cpu))
			} else {
				out = append(out, line)
			}

		case strings.HasPrefix(trim, "memory"):
			if memory > 0 {
				out = append(out, fmt.Sprintf(`memory        = %d`, memory))
			} else {
				out = append(out, line)
			}

		case strings.HasPrefix(trim, "hdd"):
			if hdd > 0 {
				out = append(out, fmt.Sprintf(`hdd           = %d`, hdd))
			} else {
				out = append(out, line)
			}

		default:
			out = append(out, line)
		}
	}

	return os.WriteFile(path, []byte(strings.Join(out, "\n")), 0600)
}

func getVMWorkdirForUser(kratosID string, uuid string) (string, error) {
	dbUserID, err := getDatabaseUserID(kratosID)
	if err != nil {
		return "", err
	}

	vm, err := getVMByUUID(uuid, dbUserID)
	if err != nil {
		return "", err
	}

	return vm.TFWorkdir, nil
}

func updateVMResources(userID string, uuid string, req VMRequest) error {
	workdir, err := getVMWorkdirForUser(userID, uuid)
	if err != nil {
		return err
	}

	if err := ensureTerraformTemplateLinks(workdir, ""); err != nil {
		return err
	}

	if err := rewriteTFVars(workdir, req); err != nil {
		return err
	}
	updateVMStatus(req.VMID, "modifying")

	return applyTerraform(workdir)
}

func runUpdateVMJob(jobID string, userID string, uuid string, req VMRequest) {
	jobAny, _ := jobs.Load(jobID)
	job := jobAny.(*Job)
	job.Status = "running(modify)"
	job.VMID = req.VMID
	job.UUID = uuid
	job.LogPath = filepath.Join("/tmp", jobID+".log")
	jobs.Store(jobID, job)

	logFile, _ := os.Create(job.LogPath)
	defer logFile.Close()

	err := updateVMResources(userID, uuid, req)
	if err != nil {
		job.Status = "error"
		fmt.Fprintf(logFile, "Error: %v\n", err)
	} else {
		job.Status = "done"
	}
	jobs.Store(jobID, job)
}

func createSSHClient(ip, user, keyPath string) (*ssh.Client, error) {
	key, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}

	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, err
	}

	config := &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	return ssh.Dial("tcp", ip+":22", config)
}

var userSettings sync.Map

type UserSettings struct {
	Os       string `json:"Os"`
	Hostname string `json:"Hostname"`
	SSHPort  string `json:"SSHPort"`
	Runcmd   string `json:"Runcmd"`
}

// GET/POST: /api/settings
func settingsAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("settingsAPIHandler: getKratosUserIDFromRequest: %v", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method == http.MethodPost {
		var us UserSettings
		if err := json.NewDecoder(r.Body).Decode(&us); err != nil {
			log.Printf("settingsAPIHandler: decode request: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		userSettings.Store(userID, us)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	type OSOptionPublic struct {
		ID    string `json:"id"`
		Label string `json:"label"`
		Image string `json:"image,omitempty"`
	}

	// 内部で使用するOSテンプレートID以外を返す
	osList := make([]OSOptionPublic, len(SettingsConf.OS))
	for i, o := range SettingsConf.OS {
		osList[i] = OSOptionPublic{ID: o.ID, Label: o.Label, Image: o.Image}
	}

	resp := map[string]any{
		"cpu":    SettingsConf.Resources.CPU,
		"memory": SettingsConf.Resources.Memory,
		"hdd":    SettingsConf.Resources.HDD,
		"os":     osList,
	}

	if val, ok := userSettings.Load(userID); ok {
		us := val.(UserSettings)
		resp["Os"] = us.Os
		resp["Hostname"] = us.Hostname
		resp["SSHPort"] = us.SSHPort
		resp["Runcmd"] = us.Runcmd
	}

	json.NewEncoder(w).Encode(resp)
}

// POST /api/iso/upload
func uploadISOHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("uploadISOHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("uploadISOHandler: getDatabaseUserID: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxISOSize)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		log.Printf("uploadISOHandler: parse form: %v", err)
		writeJSONError(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("iso")
	if err != nil {
		log.Printf("uploadISOHandler: form file: %v", err)
		writeJSONError(w, http.StatusBadRequest, "missing iso file")
		return
	}
	defer file.Close()

	filename := header.Filename
	if !strings.HasSuffix(strings.ToLower(filename), ".iso") {
		log.Printf("uploadISOHandler: not an ISO: %q", filename)
		writeJSONError(w, http.StatusBadRequest, "file must be an ISO image")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	volumeID, err := uploadISOToProxmox(ctx, filename, file, header.Size)
	if err != nil {
		log.Printf("uploadISOHandler: upload to proxmox failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "ISO upload failed: "+err.Error())
		return
	}

	iso, err := createISO(dbUserID, filename, volumeID, header.Size)
	if err != nil {
		log.Printf("uploadISOHandler: createISO: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save ISO record")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ISOInfo{
		ID:        iso.ID,
		Filename:  iso.Filename,
		VolumeID:  iso.VolumeID,
		Size:      iso.Size,
		CreatedAt: iso.CreatedAt.Format(time.RFC3339),
	})
}

// POST /api/iso/download
func downloadISOHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		log.Printf("downloadISOHandler: method not allowed: %s", r.Method)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("downloadISOHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("downloadISOHandler: getDatabaseUserID: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req struct {
		URL      string `json:"url"`
		Filename string `json:"filename,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("downloadISOHandler: decode request: %v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if req.URL == "" {
		log.Printf("downloadISOHandler: missing url")
		writeJSONError(w, http.StatusBadRequest, "missing url")
		return
	}

	filename := req.Filename
	if filename == "" {
		parts := strings.Split(strings.TrimRight(req.URL, "/"), "/")
		filename = parts[len(parts)-1]
		if filename == "" || !strings.HasSuffix(strings.ToLower(filename), ".iso") {
			filename = "downloaded.iso"
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	volumeID, err := downloadISOFromURL(ctx, req.URL, filename)
	if err != nil {
		log.Printf("downloadISOHandler: download failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "ISO download failed: "+err.Error())
		return
	}

	iso, err := createISO(dbUserID, filename, volumeID, 0)
	if err != nil {
		log.Printf("downloadISOHandler: createISO: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save ISO record")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ISOInfo{
		ID:        iso.ID,
		Filename:  iso.Filename,
		VolumeID:  iso.VolumeID,
		Size:      iso.Size,
		CreatedAt: iso.CreatedAt.Format(time.RFC3339),
	})
}

// GET /api/isos
func listISOsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		log.Printf("listISOsHandler: method not allowed: %s", r.Method)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		log.Printf("listISOsHandler: getKratosUserIDFromRequest: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		log.Printf("listISOsHandler: getDatabaseUserID: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	isos, err := getUserISOs(dbUserID)
	if err != nil {
		log.Printf("listISOsHandler: getUserISOs: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to list ISOs")
		return
	}

	var result []ISOInfo
	for _, iso := range isos {
		result = append(result, ISOInfo{
			ID:        iso.ID,
			Filename:  iso.Filename,
			VolumeID:  iso.VolumeID,
			Size:      iso.Size,
			CreatedAt: iso.CreatedAt.Format(time.RFC3339),
		})
	}

	if result == nil {
		result = []ISOInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GET /api/admin/users
func adminUsersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT u.id, u.kratos_id, u.role, u.created_at
		FROM users u
		ORDER BY u.created_at DESC
	`)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	defer rows.Close()

	type AdminUser struct {
		ID        int       `json:"id"`
		KratosID  string    `json:"kratos_id"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"created_at"`
		Email     string    `json:"email"`
	}

	var users []AdminUser
	var kratosIDs []string
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.KratosID, &u.Role, &u.CreatedAt); err != nil {
			continue
		}
		kratosIDs = append(kratosIDs, u.KratosID)
		users = append(users, u)
	}

	emails := getEmailsByKratosIDs(kratosIDs)
	for i := range users {
		users[i].Email = emails[users[i].KratosID]
	}

	if users == nil {
		users = []AdminUser{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// GET /api/admin/settings
func adminSettingsGetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SettingsConf)
}

// PUT /api/admin/settings
func adminSettingsPutHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Resources ResourceConstraints `json:"resources"`
		OS        []OSOption          `json:"os"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid settings data")
		return
	}

	SettingsConf.Resources = payload.Resources
	SettingsConf.OS = payload.OS

	// Save to file
	fileConf := SettingsConfig{
		Resources: payload.Resources,
		OS:        payload.OS,
		Agent: AgentConfig{
			User: SettingsConf.Agent.User,
		},
	}

	data, err := json.MarshalIndent(fileConf, "", "  ")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to marshal settings")
		return
	}

	if err := os.WriteFile("setting.json", data, 0644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to write setting.json")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GET /api/admin/support
func adminSupportHandler(w http.ResponseWriter, r *http.Request) {
	reqs, err := getAllSupportRequests()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list support requests")
		return
	}

	if reqs == nil {
		reqs = []*SupportRequest{}
	}

	var kratosIDs []string
	for _, req := range reqs {
		kratosIDs = append(kratosIDs, req.KratosID)
	}
	emails := getEmailsByKratosIDs(kratosIDs)

	type SupportRequestWithEmail struct {
		ID        int       `json:"id"`
		UserID    *int      `json:"user_id"`
		KratosID  string    `json:"kratos_id"`
		Subject   string    `json:"subject"`
		VMID      *string   `json:"vmid"`
		Details   string    `json:"details"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
		Email     string    `json:"email"`
	}

	var result []SupportRequestWithEmail
	for _, req := range reqs {
		result = append(result, SupportRequestWithEmail{
			ID:        req.ID,
			UserID:    req.UserID,
			KratosID:  req.KratosID,
			Subject:   req.Subject,
			VMID:      req.VMID,
			Details:   req.Details,
			Status:    req.Status,
			CreatedAt: req.CreatedAt,
			Email:     emails[req.KratosID],
		})
	}

	if result == nil {
		result = []SupportRequestWithEmail{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// PATCH /api/admin/support/{id}
func adminSupportUpdateHandler(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id := 0
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid support request id")
		return
	}

	var payload struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	validStatuses := map[string]bool{"pending": true, "in_progress": true, "resolved": true}
	if !validStatuses[payload.Status] {
		writeJSONError(w, http.StatusBadRequest, "invalid status value")
		return
	}

	if err := updateSupportRequestStatus(id, payload.Status); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update status")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GET /api/admin/dashboard
func adminDashboardHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbVMs, err := getAllVMsWithUsers()
	if err != nil {
		log.Printf("adminDashboardHandler: getAllVMsWithUsers: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to list vms")
		return
	}

	// サマリー集計
	summary := struct {
		TotalVMs  int `json:"total_vms"`
		Running   int `json:"running"`
		Stopped   int `json:"stopped"`
		Error     int `json:"error"`
		TotalUsers int `json:"total_users"`
	}{TotalVMs: len(dbVMs)}

	userIDs := make(map[int]bool)
	for _, vm := range dbVMs {
		userIDs[vm.UserID] = true
		switch strings.ToLower(vm.Status) {
		case "running":
			summary.Running++
		case "stopped":
			summary.Stopped++
		case "error":
			summary.Error++
		}
	}
	summary.TotalUsers = len(userIDs)

	// ノード名を集計してProxmoxから情報を取得
	nodeNames := make(map[string]bool)
	for _, vm := range dbVMs {
		nodeNames[vm.NodeName] = true
	}

	type nodeInfo struct {
		Name    string  `json:"name"`
		CPU     float64 `json:"cpu_percent"`
		MaxCPU  int     `json:"cpu_cores"`
		Mem     uint64  `json:"mem_used"`
		MaxMem  uint64  `json:"mem_total"`
		Disk    uint64  `json:"disk_used"`
		MaxDisk uint64  `json:"disk_total"`
	}

	var nodes []nodeInfo
	// nodeName → map[vmid]ProxmoxVMUsage
	allVMUsage := make(map[string]map[int]ProxmoxVMUsage)

	for nodeName := range nodeNames {
		stats, err := getProxmoxNodeStats(ctx, nodeName)
		if err != nil {
			log.Printf("adminDashboardHandler: getProxmoxNodeStats(%s): %v", nodeName, err)
			continue
		}
		nodes = append(nodes, nodeInfo{
			Name:    stats.Name,
			CPU:     stats.CPU * 100,
			MaxCPU:  stats.MaxCPU,
			Mem:     stats.Mem,
			MaxMem:  stats.MaxMem,
			Disk:    stats.Disk,
			MaxDisk: stats.MaxDisk,
		})

		vmUsage, err := getProxmoxAllVMStatus(ctx, nodeName)
		if err != nil {
			log.Printf("adminDashboardHandler: getProxmoxAllVMStatus(%s): %v", nodeName, err)
			continue
		}
		allVMUsage[nodeName] = vmUsage
	}

	if nodes == nil {
		nodes = []nodeInfo{}
	}

	// VM一覧を構築
	type dashVM struct {
		UUID          string  `json:"uuid"`
		VMID          int     `json:"vmid"`
		Servername    string  `json:"servername"`
		UserEmail     string  `json:"user_email"`
		Status        string  `json:"status"`
		IP            string  `json:"ip"`
		CPUCores      int     `json:"cpu_cores"`
		CPUUsage      float64 `json:"cpu_usage_percent"`
		MemUsed       uint64  `json:"mem_used"`
		MemTotal      uint64  `json:"mem_total"`
		DiskUsed      uint64  `json:"disk_used"`
		DiskTotal     uint64  `json:"disk_total"`
		CreatedAt     string  `json:"created_at"`
	}

	var dashVMs []dashVM
	for _, dbVM := range dbVMs {
		dv := dashVM{
			UUID:       dbVM.UUID,
			VMID:       dbVM.ProxmoxVMID,
			UserEmail:  dbVM.Email,
			Status:     dbVM.Status,
			IP:         "-",
			CreatedAt:  dbVM.CreatedAt.Format(time.RFC3339),
		}

		// terraform.tfstate からVM設定値を読み込み
		tfstatePath := filepath.Join(dbVM.TFWorkdir, "terraform.tfstate")
		if b, err := os.ReadFile(tfstatePath); err == nil {
			var state TFState
			if err := json.Unmarshal(b, &state); err == nil {
				for _, res := range state.Resources {
					if res.Type != "proxmox_virtual_environment_vm" || len(res.Instances) == 0 {
						continue
					}
					attr := res.Instances[0].Attributes
					dv.Servername = parseString(attr["name"])
					if cores, ok := parseFirstMapInt(attr["cpu"], "cores"); ok {
						dv.CPUCores = cores
					}
					if mem, ok := parseFirstMapInt(attr["memory"], "dedicated"); ok {
						dv.MemTotal = uint64(mem) * 1024 * 1024 // MB → bytes
					}
					if hdd, ok := parseFirstMapInt(attr["disk"], "size"); ok {
						dv.DiskTotal = uint64(hdd) * 1024 * 1024 * 1024 // GB → bytes
					}
					break
				}
			}
		}

		// Proxmoxからの実使用率を適用
		if vmUsageMap, ok := allVMUsage[dbVM.NodeName]; ok {
			if usage, ok := vmUsageMap[dbVM.ProxmoxVMID]; ok {
				dv.Status = usage.Status
				dv.CPUUsage = usage.CPU * 100
				dv.MemUsed = usage.Mem
				if usage.MaxMem > 0 {
					dv.MemTotal = usage.MaxMem
				}
				dv.DiskUsed = usage.Disk
				if usage.MaxDisk > 0 {
					dv.DiskTotal = usage.MaxDisk
				}
			}
		}

		dashVMs = append(dashVMs, dv)
	}

	if dashVMs == nil {
		dashVMs = []dashVM{}
	}

	resp := map[string]any{
		"summary": summary,
		"nodes":   nodes,
		"vms":     dashVMs,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type flushWriter struct {
	w http.ResponseWriter
}

func (fw flushWriter) Write(p []byte) (int, error) {
	n, err := fw.w.Write(p)

	if f, ok := fw.w.(http.Flusher); ok {
		f.Flush()
	}

	return n, err
}
