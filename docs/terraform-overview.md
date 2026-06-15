# Terraform 構成概要

## アーキテクチャ

```
Go Backend (handler.go)
    ↓ フォーム入力を受け取り
    ↓ runtime.tfvars を動的生成
    ↓ terraform/{run_<timestamp>}/ にファイルコピー
    ↓ terraform init → terraform apply
Terraform (bpg/proxmox provider)
    ↓ Proxmox API を呼び出し
Proxmox VE
```

## ファイル構成

```
terraform/
├── provider.tf                 # Provider定義・バージョン制約
├── variables.tf                # 変数宣言
├── proxmox.auto.tfvars.example # 認証情報テンプレート（.gitignore推奨）
├── vm.tf                       # VMリソース定義
├── snippets.tf                 # cloud-initスニペット定義
└── cloud-config.yaml           # cloud-init テンプレート
```

## 実行フロー（詳細）

1. ユーザーがフォームでCPU / Memory / HDD / Servername / Username / Passwordを入力
2. `handler.go` が `runtime.tfvars` を動的生成（パスワードはSHA-512ハッシュ化）
3. `terraform/run_<timestamp>/` ディレクトリに全ファイルをコピー
4. `terraform init` 実行
5. `terraform apply -auto-approve -var-file=runtime.tfvars` 実行
6. VM作成完了後、`terraform output -json vm_ip` でIP取得
7. ステータスページ（`status.html`）で進捗・ログ・IPを表示

## 環境変数

### アプリケーション (.env)

```bash
HOST_NAME=your-host-name    # Proxmoxノード名（node_nameに使用）
PORT=3000                    # Go サーバーのリッスンポート
```

### Terraform認証 (proxmox.auto.tfvars)

```bash
proxmox_endpoint = "https://192.168.1.10:8006"   # Proxmox API URL
proxmox_username = "root@pam"                      # Proxmoxユーザー
proxmox_password = "your-password"                  # Proxmoxパスワード
node_name        = "Host-1"                         # デフォルトノード名
```

`proxmox.auto.tfvars` は自動で読み込まれる。`.gitignore` に追加すること。

## 関連ドキュメント

- [Provider設定](terraform-provider.md)
- [VMリソース定義](terraform-vm.md)
- [cloud-init設定](terraform-cloudinit.md)
- [bpg/proxmox Provider リファレンス](https://registry.terraform.io/providers/bpg/proxmox/latest/docs)
