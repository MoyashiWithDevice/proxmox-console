package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hashicorp/terraform-exec/tfexec"
)

var jobs sync.Map

func runTerraformJob(jobID string, req *VMRequest, httpreq *http.Request) {

	// Kratos からユーザーIDを取得
	kratosUserID, err := getKratosUserIDFromRequest(httpreq)
	if err != nil {
		failJob(jobID, "Error getting Kratos user ID:", err)
		return
	}

	// ---------------- バリデーション----------------
	// --- OS バリデーション ---
	var selectedOS *OSOption
	for i := range SettingsConf.OS {
		if SettingsConf.OS[i].ID == req.OS {
			selectedOS = &SettingsConf.OS[i]
			break
		}
	}
	if selectedOS == nil {
		failJob(jobID, "Requested value is invalid【OS】 :", err)
		return
	}

	if req.Username == "" {
		failJob(jobID, "Requested value is invalid【Username】 :", err)
		return
	}

	// --- リソース範囲バリデーション ---
	res := SettingsConf.Resources
	if req.CPU < res.CPU.Min || req.CPU > res.CPU.Max {
		failJob(jobID, "Requested value is invalid【CPU】 :", err)
		return
	}
	if req.Memory < res.Memory.Min || req.Memory > res.Memory.Max {
		failJob(jobID, "Requested value is invalid【Memory】 :", err)
		return
	}
	if req.HDD < res.HDD.Min || req.HDD > res.HDD.Max {
		failJob(jobID, "Requested value is invalid【HDD】 :", err)
		return
	}

	// DB からユーザー情報を取得または作成
	user, err := getOrCreateUser(kratosUserID)
	if err != nil {
		failJob(jobID, "Error getting database user:", err)
		return
	}
	dbUserID := user.ID

	// 単一サブネット (10.0.0.0/24) でIPを計算
	_, vmGateway, vmNetmask := vmSubnetInfo()
	vmCount, errCount := getTotalVMCount()
	if errCount != nil {
		vmCount = 0
	}
	vmIP := vmIPFromIndex(vmCount)

	// VMリクエストのハッシュを計算
	vmhash, err := hashRequest(req)
	if err != nil {
		failJob(jobID, "Error hashing request:", err)
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

	useISO := req.ISOVolume != ""

	logTicker := time.NewTicker(2 * time.Second)
	defer logTicker.Stop()
	go func() {
		for range logTicker.C {
			b, err := os.ReadFile(job.LogPath)
			if err == nil {
				job.Log = string(b)
				jobs.Store(jobID, job)
			}
		}
	}()


	userPrivkey, userPubkey, err := generateSSHKeyPair()
	if err != nil {
		failJob(jobID, "Error creating key:", err)
		return
	}

	agentUser := SettingsConf.Agent.User
	if agentUser == "" {
		agentUser = "agent"
	}

	agentPubkey := strings.TrimSpace(SettingsConf.Agent.PublicKey)
	if agentPubkey == "" {
		failJob(jobID, "Error missing agent public key in settings", err)
		return
	}

	cloudinitID := uuid.Must(uuid.NewV7()).String()

	var tfvars string
	if useISO {
		tfvars = fmt.Sprintf(`
servername      = "%s"
cpu             = %d
memory          = %d
hdd             = %d
iso_volume_id   = "%s"
cloudinit_id    = "%s"
`,
			req.Servername, req.CPU, req.Memory, req.HDD, req.ISOVolume,
			cloudinitID,
		)
	} else {
		tfvars = fmt.Sprintf(`
servername    = "%s"
cpu           = %d
memory        = %d
hdd           = %d
username      = "%s"
template_id   = %d
user_pubkey   =<<EOT
%s
EOT
agent_user    = "%s"
agent_pubkey  =<<EOT
%s
EOT
runcmd        =<<EOT
%s
EOT
vm_ip         = "%s"
vm_gateway    = "%s"
vm_netmask    = "%s"
cloudinit_id  = "%s"
`,
			req.Servername, req.CPU, req.Memory, req.HDD, req.Username, selectedOS.TemplateID,
			userPubkey, agentUser, agentPubkey, req.Runcmd,
			vmIP, vmGateway, vmNetmask, cloudinitID,
		)
	}

	os.WriteFile(filepath.Join(workdir, "runtime.tfvars"), []byte(tfvars), 0600)
	// ルートの共通テンプレートを各VMワークディレクトリにリンク
	if err := ensureTerraformTemplateLinks(workdir, req.ISOVolume); err != nil {
		failJob(jobID, "Error linking Terraform templates:", err)
		return
	}

	// Terraform実行
	tf, err := tfexec.NewTerraform(workdir, "terraform")
	if err != nil {
		failJob(jobID, "Error creating Terraform executor:", err)
		return
	}
	tf.SetStdout(logFile)
	tf.SetStderr(logFile)

	ctx := context.Background()

	// init
	if err := tf.Init(ctx, tfexec.Upgrade(true)); err != nil {
		failJob(jobID, "Error during initialization:", err)
		return
	}

	job.Status = "running(apply)"
	jobs.Store(jobID, job)

	// apply
	if err := tf.Apply(ctx,
		tfexec.VarFile("runtime.tfvars"),
	); err != nil {
		failJob(jobID, "Error applying Terraform configuration:", err)
		return
	}

	// Terraform state から VM ID とノード名を取得
	vmID, nodeName, err := getVMIDAndNode(workdir)
	if err != nil {
		failJob(jobID, "Error getting VM ID and node:", err)
		return
	}

	// cloudinit ファイルは不要になったので削除
	deleteCloudInitFile(ctx, nodeName, cloudinitID)

	// DB に VM を記録
	createdVM, err := createVM(dbUserID, vmID, nodeName, workdir)
	if err != nil {
		failJob(jobID, "Error creating VM in database:", err)
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
		failJob(jobID, "Error updating VM status in database:", err)
		return
	}
	// 最終ログをキャプチャ
	if b, err := os.ReadFile(job.LogPath); err == nil {
		job.Log = string(b)
	}
	if job.VMID != 0 {
		if vm, err := getProxmoxVMInfo(context.Background(), job.NodeName, job.VMID); err == nil && vm.IP != "-" {
			job.IP = vm.IP
		}
	}
	job.Status = "done"
	jobs.Store(jobID, job)
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

func ensureTerraformTemplateLinks(workdir string, isoVolumeID string) error {
	var templateFiles []string

	if isoVolumeID != "" {
		templateFiles = []string{
			"provider.tf",
			"variables.tf",
			"vm-iso.tf",
		}
	} else {
		templateFiles = []string{
			"provider.tf",
			"variables.tf",
			"snippets.tf",
			"vm.tf",
			"cloud-config.yaml",
		}
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

func failJob(jobID, msg string, args ...any) {
	fmt.Printf(msg+"\n", args...)
	jobAny, _ := jobs.Load(jobID)
	if job, ok := jobAny.(*Job); ok {
		job.Status = "error"
		jobs.Store(jobID, job)
	}
}
