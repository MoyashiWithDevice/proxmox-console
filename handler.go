package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	tfexec "github.com/hashicorp/terraform-exec/tfexec"
	"golang.org/x/crypto/ssh"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func runTerraformJob(jobID string, req *VMRequest, httpreq *http.Request) {

	// Kratos からユーザーIDを取得
	kratosUserID, err := getKratosUserIDFromRequest(httpreq)
	if err != nil {
		fmt.Println("Error getting Kratos user ID:", err)
		jobAny, _ := jobs.Load(jobID)
		if job, ok := jobAny.(*Job); ok {
			job.Status = "error"
			jobs.Store(jobID, job)
		}
		return
	}

	// DB からユーザーIDを取得または作成
	dbUserID, err := getDatabaseUserID(kratosUserID)
	if err != nil {
		fmt.Println("Error getting database user ID:", err)
		jobAny, _ := jobs.Load(jobID)
		if job, ok := jobAny.(*Job); ok {
			job.Status = "error"
			jobs.Store(jobID, job)
		}
		return
	}

	// VMリクエストのハッシュを計算
	vmhash, err := hashRequest(req)
	if err != nil {
		fmt.Println("Error hashing request:", err)
		jobAny, _ := jobs.Load(jobID)
		if job, ok := jobAny.(*Job); ok {
			job.Status = "error"
			jobs.Store(jobID, job)
		}
		return
	}

	// ユーザディレクトリ配下に
	// ハッシュ値をディレクトリ名とする実行用ディレクトリを作成
	workdir := filepath.Join("terraform", "vms", kratosUserID, vmhash)
	os.MkdirAll(workdir, 0755)

	jobAny, _ := jobs.Load(jobID)
	job := jobAny.(*Job)

	job.Workdir = workdir
	job.LogPath = filepath.Join(workdir, "terraform.log")
	job.Status = "running(init)"
	jobs.Store(jobID, job)

	logFile, _ := os.Create(job.LogPath)
	defer logFile.Close()

	userPrivkey, userPubkey, err := generateSSHKeyPair()
	if err != nil {
		fmt.Println("Error creating key:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	agentUser := SettingsConf.Agent.User
	if agentUser == "" {
		agentUser = "agent"
	}

	agentPubkey := strings.TrimSpace(SettingsConf.Agent.PublicKey)
	if agentPubkey == "" {
		fmt.Println("Error missing agent public key in settings")
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	tfvars := fmt.Sprintf(`
servername    = "%s"
cpu           = %d
memory        = %d
hdd           = %d
username      = "%s"
user_pubkey   =<<EOT
%s
EOT
agent_user    = "%s"
agent_pubkey  =<<EOT
%s
EOT
`,
		req.Servername, req.CPU, req.Memory, req.HDD, req.Username, userPubkey,
		agentUser, agentPubkey,
	)

	os.WriteFile(filepath.Join(workdir, "runtime.tfvars"), []byte(tfvars), 0600)
	// ルートの共通テンプレートを各VMワークディレクトリにリンク
	if err := ensureTerraformTemplateLinks(workdir); err != nil {
		fmt.Println("Error linking Terraform templates:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	// Terraform実行
	tf, err := tfexec.NewTerraform(workdir, "terraform")
	if err != nil {
		job.Status = "error"
		fmt.Println("Error creating Terraform executor:", err)
		jobs.Store(jobID, job)
		return
	}
	tf.SetStdout(logFile)
	tf.SetStderr(logFile)

	ctx := context.Background()

	// init
	if err := tf.Init(ctx, tfexec.Upgrade(true)); err != nil {
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	job.Status = "running(apply)"
	jobs.Store(jobID, job)

	// apply
	if err := tf.Apply(ctx,
		tfexec.VarFile("runtime.tfvars"),
	); err != nil {
		job.Status = "error"
		fmt.Println("Error applying Terraform configuration:", err)
		jobs.Store(jobID, job)
		return
	}

	// Terraform state から VM ID とノード名を取得
	vmID, nodeName, err := getVMIDAndNode(workdir)
	if err != nil {
		fmt.Println("Error getting VM ID and node:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	// DB に VM を記録
	createdVM, err := createVM(dbUserID, vmID, nodeName, workdir)
	if err != nil {
		fmt.Println("Error creating VM in database:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	// VM の秘密鍵を一時的にワークディレクトリに保存
	userKeyPath := filepath.Join(workdir, "user_id_rsa")
	if err := os.WriteFile(userKeyPath, userPrivkey, 0600); err != nil {
		fmt.Println("Warning: failed to write user private key:", err)
	}

	job.VMID = vmID
	job.NodeName = nodeName

	// 完了後は DB で completed に変更してからログを破棄する
	if err := updateVMStatus(createdVM.ID, "completed"); err != nil {
		fmt.Println("Error updating VM status in database:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	if job.VMID != 0 {
		if ip, err := getProxmoxVMIP(context.Background(), job.NodeName, job.VMID); err == nil && ip != "" {
			job.IP = ip
		}
	}
	job.Status = "done"
	jobs.Store(jobID, job)

	if err := os.Remove(job.LogPath); err != nil && !os.IsNotExist(err) {
		fmt.Println("Error removing log file:", err)
	}
}

func ensureTerraformTemplateLinks(workdir string) error {
	templateFiles := []string{
		"provider.tf",
		"variables.tf",
		"proxmox.auto.tfvars",
		"snippets.tf",
		"vm.tf",
		"cloud-config.yaml",
	}

	for _, name := range templateFiles {
		dst := filepath.Join(workdir, name)
		if _, err := os.Lstat(dst); err == nil {
			continue
		}

		src := filepath.Join("terraform", name)
		rel, err := filepath.Rel(workdir, src)
		if err != nil {
			rel = src
		}

		if err := os.Symlink(rel, dst); err != nil {
			return fmt.Errorf("failed to create symlink for %s: %w", name, err)
		}
	}

	return nil
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

func createVMHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	jobID := fmt.Sprintf("%d", time.Now().UnixNano())

	kratosUserID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req := VMRequest{
		CPU:        atoiSafe(r.FormValue("cpu")),
		Memory:     atoiSafe(r.FormValue("memory")),
		HDD:        atoiSafe(r.FormValue("hdd")),
		Servername: r.FormValue("servername"),
		Username:   r.FormValue("username"),
	}

	jobs.Store(jobID, &Job{Status: "running", Servername: req.Servername, OwnerID: kratosUserID})

	go runTerraformJob(jobID, &req, r)

	if r.Header.Get("Accept") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"job_id": jobID})
		return
	}
	http.Redirect(w, r, "/vm.html?job_id="+jobID, http.StatusSeeOther)
}

func userVMListHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	vms, err := listUserVMs(userID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	type vmResponse struct {
		Type       string `json:"type"`
		Name       string `json:"Name,omitempty"`
		VMID       int    `json:"VMID,omitempty"`
		IP         string `json:"IP,omitempty"`
		Memory     int    `json:"Memory,omitempty"`
		Cores      int    `json:"Cores,omitempty"`
		Hdd        int    `json:"Hdd,omitempty"`
		Status     string `json:"status,omitempty"`
		Servername string `json:"servername,omitempty"`
		ID         string `json:"id,omitempty"`
	}

	var result []vmResponse
	for _, vm := range vms {
		if strings.ToLower(vm.Status) == "creating" {
			continue
		}
		result = append(result, vmResponse{
			Type:   "vm",
			Name:   vm.Name,
			VMID:   vm.VMID,
			IP:     vm.IP,
			Memory: vm.Memory,
			Cores:  vm.Cores,
			Hdd:    vm.Hdd,
			Status: vm.Status,
		})
	}

	jobs.Range(func(key, value interface{}) bool {
		job := value.(*Job)
		if job.OwnerID != userID || job.Status == "done" {
			return true
		}
		result = append(result, vmResponse{
			Type:       "job",
			ID:         key.(string),
			Status:     job.Status,
			Servername: job.Servername,
			IP:         job.IP,
		})
		return true
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func vmDetailHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		deleteVMHandler(w, r)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	vmidStr := r.URL.Query().Get("vmid")
	if vmidStr == "" {
		http.Error(w, "missing vmid", 400)
		return
	}

	vmid, _ := strconv.Atoi(vmidStr)

	vms, err := listUserVMs(userID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	for _, vm := range vms {
		if vm.VMID == vmid {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(vm)
			return
		}
	}

	http.Error(w, "vm not found", 404)
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")

	jobAny, ok := jobs.Load(id)
	if !ok {
		w.WriteHeader(404)
		return
	}

	job := jobAny.(*Job)
	logBytes, _ := os.ReadFile(job.LogPath)

	resp := map[string]interface{}{
		"status": job.Status,
		"ip":     job.IP,
		"log":    string(logBytes),
	}
	if job.VMID != 0 {
		resp["vmid"] = job.VMID
		if _, err := os.Stat(filepath.Join(job.Workdir, "user_id_rsa")); err == nil {
			resp["key_available"] = true
		} else {
			resp["key_available"] = false
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func vmPrivateKeyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vmidStr := r.URL.Query().Get("vmid")
	if vmidStr == "" {
		http.Error(w, "missing vmid", http.StatusBadRequest)
		return
	}

	vmid, err := strconv.Atoi(vmidStr)
	if err != nil {
		http.Error(w, "invalid vmid", http.StatusBadRequest)
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vm, err := getVMByProxmoxID(vmid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if vm.UserID != dbUserID {
		http.Error(w, "unauthorized", http.StatusForbidden)
		return
	}

	keyPath := filepath.Join(vm.TFWorkdir, "user_id_rsa")
	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "key not available", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"vm-%d-id_rsa\"", vmid))
	w.Header().Set("Cache-Control", "no-store")

	if _, err := w.Write(keyBytes); err != nil {
		fmt.Println("Error writing private key response:", err)
		return
	}

	if err := os.Remove(keyPath); err != nil && !os.IsNotExist(err) {
		fmt.Println("Warning: failed to remove user private key after download:", err)
	}
}

func nodeResourcesHandler(w http.ResponseWriter, r *http.Request) {
	client, err := newGoProxmoxClient()
	if err != nil {
		log.Printf("[node/resources] failed to create client: %v", err)
		http.Error(w, "failed to create proxmox client: "+err.Error(), 500)
		return
	}

	nodes, err := client.Nodes(r.Context())
	if err != nil {
		log.Printf("[node/resources] failed to list nodes: %v", err)
		http.Error(w, "failed to list nodes: "+err.Error(), 500)
		return
	}

	if len(nodes) == 0 {
		log.Printf("[node/resources] no nodes found")
		http.Error(w, "no nodes found", 404)
		return
	}

	node := nodes[0]

	// バイト単位をGiBに変換
	toGiB := func(bytes uint64) float64 {
		return float64(bytes) / 1024 / 1024 / 1024
	}

	resp := map[string]interface{}{
		"cpu": map[string]interface{}{
			"used":  node.CPU,
			"cores": node.MaxCPU,
		},
		"memory": map[string]interface{}{
			"used":  toGiB(node.Mem),
			"total": toGiB(node.MaxMem),
		},
		"disk": map[string]interface{}{
			"used":  toGiB(node.Disk),
			"total": toGiB(node.MaxDisk),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
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

func rewriteTFVars(workdir, name string, cpu, memory, hdd int) error {
	path := filepath.Join(workdir, "runtime.tfvars")

	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}

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

func applyTerraform(workdir string) error {
	tf, err := tfexec.NewTerraform(workdir, "terraform")
	if err != nil {
		return err
	}

	ctx := context.Background()

	if err := tf.Init(ctx); err != nil {
		return err
	}

	return tf.Apply(ctx, tfexec.VarFile("runtime.tfvars"))
}

func getVMWorkdirForUser(kratosID string, vmid int) (string, error) {
	dbUserID, err := getDatabaseUserID(kratosID)
	if err != nil {
		return "", err
	}

	vm, err := getVMByProxmoxID(vmid)
	if err != nil {
		return "", err
	}

	if vm.UserID != dbUserID {
		return "", fmt.Errorf("unauthorized")
	}

	return vm.TFWorkdir, nil
}

func deleteVMHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vmidStr := r.URL.Query().Get("vmid")
	if vmidStr == "" {
		http.Error(w, "missing vmid", http.StatusBadRequest)
		return
	}

	vmid, err := strconv.Atoi(vmidStr)
	if err != nil {
		http.Error(w, "invalid vmid", http.StatusBadRequest)
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	vm, err := getVMByProxmoxID(vmid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if vm.UserID != dbUserID {
		http.Error(w, "unauthorized", http.StatusForbidden)
		return
	}

	if err := deleteProxmoxVM(context.Background(), vm.NodeName, vm.ProxmoxVMID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := deleteVMByProxmoxID(vmid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "vm not found", http.StatusNotFound)
			return
		}
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

func updateVMResources(userID, servername string, vmid, cpu, memory, hdd int) error {
	workdir, err := getVMWorkdirForUser(userID, vmid)
	if err != nil {
		return err
	}

	if err := ensureTerraformTemplateLinks(workdir); err != nil {
		return err
	}

	if err := rewriteTFVars(workdir, servername, cpu, memory, hdd); err != nil {
		return err
	}

	return applyTerraform(workdir)
}

func runUpdateVMJob(jobID string, userID string, vmid int, servername string, cpu, memory, hdd int) {
	jobAny, _ := jobs.Load(jobID)
	job := jobAny.(*Job)

	job.Status = "running(modify)"
	job.VMID = vmid
	job.LogPath = filepath.Join("/tmp", jobID+".log")
	jobs.Store(jobID, job)

	logFile, _ := os.Create(job.LogPath)
	defer logFile.Close()

	err := updateVMResources(userID, servername, vmid, cpu, memory, hdd)
	if err != nil {
		job.Status = "error"
		fmt.Fprintf(logFile, "Error: %v\n", err)
	} else {
		job.Status = "done"
	}
	jobs.Store(jobID, job)
}

func sshExecuteCommand(ip, user, privateKeyPath, command string) (stdout, stderr string, exitCode int, err error) {
	keyBytes, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return "", "", -1, fmt.Errorf("could not read private key: %w", err)
	}

	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		return "", "", -1, fmt.Errorf("could not parse private key: %w", err)
	}

	config := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	addr := net.JoinHostPort(ip, "22")
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return "", "", -1, fmt.Errorf("ssh dial failed: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", "", -1, fmt.Errorf("failed to create ssh session: %w", err)
	}
	defer session.Close()

	var stdoutBuf, stderrBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	session.Stderr = &stderrBuf

	err = session.Run(command)
	stdout = stdoutBuf.String()
	stderr = stderrBuf.String()
	if err != nil {
		if exitErr, ok := err.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
			err = nil
			return stdout, stderr, exitCode, nil
		}
		return stdout, stderr, -1, err
	}

	exitCode = 0
	return stdout, stderr, exitCode, nil
}

func updateVMHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, _ := getKratosUserIDFromRequest(r)

	var req struct {
		VMID   int    `json:"vmid"`
		Name   string `json:"name"`
		Cores  int    `json:"cores"`
		Memory int    `json:"memory"`
		HDD    int    `json:"hdd"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if req.VMID == 0 {
		http.Error(w, "missing vmid", 400)
		return
	}

	jobID := fmt.Sprintf("%d", time.Now().UnixNano())
	jobs.Store(jobID, &Job{Status: "running", Servername: req.Name, VMID: req.VMID})

	// Run VM update in background
	go runUpdateVMJob(jobID, userID, req.VMID, req.Name, req.Cores, req.Memory, req.HDD)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"job_id": jobID,
		"status": "modified",
	})
}

func settingsAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SettingsConf)
}

// vmExecHandler はゲストエージェントを使ってコマンドを実行し、その結果を返します
func vmExecHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		VMID int    `json:"vmid"`
		Cmd  string `json:"cmd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if req.VMID == 0 || strings.TrimSpace(req.Cmd) == "" {
		writeJSONError(w, http.StatusBadRequest, "missing vmid or cmd")
		return
	}

	// 所有者チェック
	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal")
		return
	}

	vm, err := getVMByProxmoxID(req.VMID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "vm not found")
		return
	}
	if vm.UserID != dbUserID {
		writeJSONError(w, http.StatusForbidden, "forbidden")
		return
	}

	ip, err := getProxmoxVMIP(context.Background(), vm.NodeName, req.VMID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to resolve VM IP")
		return
	}
	if ip == "" {
		writeJSONError(w, http.StatusInternalServerError, "VM IP address is not available yet")
		return
	}

	agentUser := SettingsConf.Agent.User
	if agentUser == "" {
		agentUser = "agent"
	}
	privKeyPath := filepath.Join("cert", "agent_id_rsa")

	stdout, stderr, exitCode, err := sshExecuteCommand(ip, agentUser, privKeyPath, req.Cmd)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to execute command: %v", err))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ip":        ip,
		"stdout":    stdout,
		"stderr":    stderr,
		"exit_code": exitCode,
	})
}

// startVMHandler は VM を起動します
func startVMHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	var req struct{
		VMID int `json:"vmid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
		return
	}

	if req.VMID == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "missing vmid"})
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal"})
		return
	}

	vm, err := getVMByProxmoxID(req.VMID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "vm not found"})
		return
	}
	if vm.UserID != dbUserID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
		return
	}

	if err := startProxmoxVM(context.Background(), vm.NodeName, vm.ProxmoxVMID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status":"started"})
}

// stopVMHandler は VM を停止します
func stopVMHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	var req struct{
		VMID int `json:"vmid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
		return
	}

	if req.VMID == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "missing vmid"})
		return
	}

	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal"})
		return
	}

	vm, err := getVMByProxmoxID(req.VMID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "vm not found"})
		return
	}
	if vm.UserID != dbUserID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
		return
	}

	if err := stopProxmoxVM(context.Background(), vm.NodeName, vm.ProxmoxVMID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status":"stopped"})
}
