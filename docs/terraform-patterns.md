# Terraform 実行パターン・Go統合

## 現在の実行パターン

GoバックエンドからTerraformをCLI経由で実行:

```go
// handler.go の runTerraformJob()

// 1. 実行用ディレクトリ作成
workdir := filepath.Join("terraform", fmt.Sprintf("run_%d", time.Now().Unix()))
os.MkdirAll(workdir, 0755)

// 2. tfvars動的生成
tfvars := fmt.Sprintf(`
    servername    = "%s"
    cpu           = %d
    memory        = %d
    hdd           = %d
    username      = "%s"
    password_hash = "%s"
`, req.Servername, req.CPU, req.Memory, req.HDD, req.Username, hash)
os.WriteFile(filepath.Join(workdir, "runtime.tfvars"), []byte(tfvars), 0600)

// 3. Terraformファイルをコピー
copyFile("terraform/provider.tf", filepath.Join(workdir, "provider.tf"))
copyFile("terraform/variables.tf", filepath.Join(workdir, "variables.tf"))
copyFile("terraform/proxmox.auto.tfvars", filepath.Join(workdir, "proxmox.auto.tfvars"))
copyFile("terraform/snippets.tf", filepath.Join(workdir, "snippets.tf"))
copyFile("terraform/vm.tf", filepath.Join(workdir, "vm.tf"))
copyFile("terraform/cloud-config.yaml", filepath.Join(workdir, "cloud-config.yaml"))

// 4. terraform init
initCmd := exec.Command("terraform", "init")
initCmd.Dir = workdir

// 5. terraform apply
applyCmd := exec.Command("terraform", "apply", "-auto-approve", "-var-file=runtime.tfvars")
applyCmd.Dir = workdir

// 6. IP取得
cmd := exec.Command("terraform", "output", "-json", "vm_ip")
cmd.Dir = workdir
```

## 代替パターン

### パターン1: terraform-exec ライブラリ使用

CLI呼び出しの代わりにGoライブラリ [`hashicorp/terraform-exec`](https://github.com/hashicorp/terraform-exec) を使用:

```go
import (
    "github.com/hashicorp/terraform-exec/tfexec"
    "github.com/hashicorp/terraform-exec/tfinstall"
)

func runTerraform(workdir string, vars map[string]string) error {
    execPath, _ := tfinstall.Find(
        tfinstall.LatestVersion(workdir, false),
    )

    tf, _ := tfexec.NewTerraform(workdir, execPath)

    tf.Init(tfexec.Upgrade(false))

    options := []tfexec.ApplyOption{
        tfexec.VarFile("runtime.tfvars"),
        tfexec.AutoApprove(),
    }
    tf.Apply(context.Background(), options...)

    // Output取得
    output, _ := tf.Output(context.Background())
    return output["vm_ip"].Value
}
```

メリット:
- コマンド文字列の組み立て不要
- 構造化されたエラー処理
- 並列実行の制御が容易

### パターン2: Proxmox API直接呼び出し（Terraform廃止）

Goから直接Proxmox APIを呼び出す:

```go
import "net/http"

type ProxmoxClient struct {
    client    *http.Client
    baseURL   string
    token     string
}

func (c *ProxmoxClient) CreateVM(req VMRequest) (string, error) {
    // 1. VMクローン
    body := url.Values{
        "newid":   {fmt.Sprintf("%d", nextID)},
        "name":    {req.Servername},
        "full":    {"1"},
        "storage": {"local-lvm"},
    }
    resp, _ := c.post("/nodes/"+c.node+"/qemu/9000/clone", body)
    upid := resp["data"].(string)

    // 2. 設定変更（CPU, Memory等）
    config := url.Values{
        "cores":  {fmt.Sprintf("%d", req.CPU)},
        "memory": {fmt.Sprintf("%d", req.Memory)},
    }
    c.put("/nodes/"+c.node+"/qemu/"+nextID+"/config", config)

    // 3. 起動
    c.post("/nodes/"+c.node+"/qemu/"+nextID+"/status/start", nil)

    // 4. IP取得（ポーリング）
    return c.waitForIP(nextID)
}
```

メリット:
- Terraform実行環境不要
- 高速（init不要）
- リソース管理がGo側で完結

デメリット:
- state管理が自前になる
- リソースのクリーンアップ処理を自前で実装

### パターン3: cdktf (Terraform CDK)

TypeScript/Python等でTerraformリソースを定義するアプローチ。Goからは不向き。

## ステート管理

### 現在の課題

各VM作成ごとに独立したディレクトリでTerraformを実行しているため:
- ステートファイル (`terraform.tfstate`) が各 `run_*` ディレクトリに散在
- VM削除時に元のディレクトリが必要（ステートがないとリソース追跡不可）
- ディレクトリ削除 = ステート喪失 = Terraform管理外の孤児VM

### 改善案

#### Remote State（推奨）

```hcl
terraform {
  backend "http" {
    address = "http://state-server:8080/states/{vmid}"
  }
}
```

Go側でステートを管理するHTTPエンドポイントを立てる。

#### 単一ステート

1つのTerraform構成で全VMを管理:

```hcl
# 各VMを別リソースとして定義せず、for_eachで管理
resource "proxmox_virtual_environment_vm" "vms" {
  for_each = var.vm_definitions

  name      = each.value.servername
  node_name = var.node_name
  # ...
}
```

ただし動的な追加・削除には不向き。

## クリーンアップ

VM削除時のリソース解放:

```bash
# 該当VMの実行ディレクトリで destroy
cd terraform/run_1706123456
terraform destroy -auto-approve -var-file=runtime.tfvars
```

または Proxmox API で直接削除（ステートとの不整合に注意）。
