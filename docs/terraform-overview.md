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

### ルート `.env`

```bash
PORT=8080
TF_VAR_proxmox_endpoint=https://192.168.1.10:8006/
TF_VAR_proxmox_username=root@pam
TF_VAR_proxmox_password=your-password
TF_VAR_node_name=Host-1
```

Terraform は `TF_VAR_` プレフィックス付き環境変数を自動的に変数として読み込みます。認証情報は `proxmox.auto.tfvars` に書き出さず、ルート `.env` からアプリプロセス経由で Terraform に引き継ぎます。

## 関連ドキュメント

- [Provider設定](terraform-provider.md)
- [VMリソース定義](terraform-vm.md)
- [cloud-init設定](terraform-cloudinit.md)
- [bpg/proxmox Provider リファレンス](https://registry.terraform.io/providers/bpg/proxmox/latest/docs)
