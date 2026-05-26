package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"encoding/json"
	"context"
	tfexec "github.com/hashicorp/terraform-exec/tfexec"
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

	hash, err := hashPasswordForLinux(req.Password)
	if err != nil {
		fmt.Println("Error hashing password:", err)
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
password_hash = "%s"
`,
		req.Servername, req.CPU, req.Memory, req.HDD, req.Username, hash,
	)

	os.WriteFile(filepath.Join(workdir, "runtime.tfvars"), []byte(tfvars), 0600)
	// ファイルをコピー
	copyFile("terraform/provider.tf", filepath.Join(workdir, "provider.tf"))
	copyFile("terraform/variables.tf", filepath.Join(workdir, "variables.tf"))
	copyFile("terraform/proxmox.auto.tfvars", filepath.Join(workdir, "proxmox.auto.tfvars"))
	copyFile("terraform/snippets.tf", filepath.Join(workdir, "snippets.tf"))
	copyFile("terraform/vm.tf", filepath.Join(workdir, "vm.tf"))
	copyFile("terraform/cloud-config.yaml", filepath.Join(workdir, "cloud-config.yaml"))

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

	job.VMID = vmID

	// 完了後は DB で completed に変更してからログを破棄する
	if err := updateVMStatus(createdVM.ID, "completed"); err != nil {
		fmt.Println("Error updating VM status in database:", err)
		job.Status = "error"
		jobs.Store(jobID, job)
		return
	}

	job.IP = getVMIP(job)
	job.Status = "done"
	jobs.Store(jobID, job)

	if err := os.Remove(job.LogPath); err != nil && !os.IsNotExist(err) {
		fmt.Println("Error removing log file:", err)
	}
}

func getVMIP(job *Job) string {
	tf, err := tfexec.NewTerraform(job.Workdir, "terraform")
	if err != nil {
		job.Status = "error"
		return ""
	}

	ctx := context.Background()

	// terraform output -json と同じ
	out, err := tf.Output(ctx)
	if err != nil {
		job.Status = "error"
		return ""
	}

	// vm_ip という output 名を直接取得
	v, ok := out["vm_ip"]
	if !ok {
		return ""
	}

	// Value は interface{} なので JSON 経由で安全に []string に
	b, _ := json.Marshal(v.Value)

	var ips []string
	if err := json.Unmarshal(b, &ips); err != nil {
		return ""
	}

	if len(ips) > 0 {
		return ips[0]
	}
	return ""
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
		Password:   r.FormValue("password"),
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
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func atoiSafe(s string) int {
	i, _ := strconv.Atoi(s)
	return i
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

func updateVMResources(userID, servername string, vmid, cpu, memory, hdd int) error {

	// TODO: 要実装
	// workdir, err := findWorkdirByVMID(userID, vmid)
	// if err != nil {
	// 	return err
	// }

	workdir := filepath.Join("terraform", "vms", userID)
	dirs, _ := os.ReadDir(workdir)

	for _, d := range dirs {
		tfpath := filepath.Join(workdir, d.Name(), "runtime.tfvars")
		if _, err := os.Stat(tfpath); err == nil {
			workdir = filepath.Join(workdir, d.Name())
			break
		}
	}

	if err := rewriteTFVars(workdir, servername, cpu, memory, hdd); err != nil {
		return err
	}

	return applyTerraform(workdir)
}

func updateVMHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, _ := getKratosUserIDFromRequest(r)

	var req struct {
		VMID  int    `json:"vmid"`
		Name  string `json:"name"`
		Cores int    `json:"cores"`
		Memory int   `json:"memory"`
		HDD   int    `json:"hdd"`
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
	jobs.Store(jobID, &Job{Status: "running", Servername: req.Name})

	err := updateVMResources(
		userID,
		req.Name,
		req.VMID,
		req.Cores,
		req.Memory,
		req.HDD,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func settingsAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SettingsConf)
}