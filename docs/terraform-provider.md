# Terraform Provider 設定

## 使用Provider

[bpg/proxmox](https://registry.terraform.io/providers/bpg/proxmox/latest/docs) - Proxmox VE Terraform Provider

## provider.tf

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.60"
    }
  }
}

provider "proxmox" {
  endpoint = var.proxmox_endpoint    # https://host:8006
  username = var.proxmox_username    # root@pam
  password = var.proxmox_password
  insecure = true                    # 自己署名証明書を許可
}
```

## Provider設定オプション

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `endpoint` | string | ○ | Proxmox API URL（`https://host:8006`） |
| `username` | string | ○* | ユーザー名（`user@realm`形式）。API Token使用時は不要 |
| `password` | string | ○* | パスワード。API Token使用時は不要 |
| `api_token` | string | ○* | API Token（`user@realm!tokenid=secret`）。パスワード認証時は不要 |
| `insecure` | boolean | - | TLS証明書検証をスキップ（デフォルト: `false`） |
| `tmp_dir` | string | - | 一時ディレクトリパス |
| `proxmox_debug` | boolean | - | Proxmox APIのデバッグログ出力 |

## 認証方式

### パスワード認証（現在の構成）

```hcl
provider "proxmox" {
  endpoint = "https://192.168.1.10:8006"
  username = "root@pam"
  password = var.proxmox_password
  insecure = true
}
```

### API Token認証（推奨: 自動化用途）

```hcl
provider "proxmox" {
  endpoint  = "https://192.168.1.10:8006"
  api_token = "root@pam!terraform=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  insecure  = true
}
```

## Provider バージョンについて

`~> 0.60` は `0.60.x` に限定（`0.61` 以降はアップグレード対象外）。

主要バージョン変更時の注意:
- `0.x` 系は破壊的変更が入りうる
- アップグレード前に [CHANGELOG](https://github.com/bpg/terraform-provider-proxmox/releases) を確認
- `terraform state` の移行が必要な場合がある

## 主要リソース一覧

| リソース | 説明 |
|---|---|
| `proxmox_virtual_environment_vm` | QEMU VM |
| `proxmox_virtual_environment_container` | LXCコンテナ |
| `proxmox_virtual_environment_file` | ファイルアップロード（ISO, スニペット等） |
| `proxmox_virtual_environment_network_bridge` | ブリッジ |
| `proxmox_virtual_environment_network_vlan` | VLAN |
| `proxmox_virtual_environment_storage` | ストレージ |
| `proxmox_virtual_environment_hardware_mapping` | ハードウェアマッピング |
| `proxmox_virtual_environment_hagroup` | HAグループ |
| `proxmox_virtual_environment_haresource` | HAリソース |
| `proxmox_virtual_environment_cluster` | クラスタ設定 |

## 主要データソース一覧

| データソース | 説明 |
|---|---|
| `proxmox_virtual_environment_datastores` | ストレージ一覧 |
| `proxmox_virtual_environment_nodes` | ノード一覧 |
| `proxmox_virtual_environment_vms` | VM一覧 |
| `proxmox_virtual_environment_containers` | コンテナ一覧 |
| `proxmox_virtual_environment_files` | ファイル一覧 |
| `proxmox_virtual_environment_dns` | DNS設定 |
| `proxmox_virtual_environment_hosts` | hosts設定 |
| `proxmox_virtual_environment_time` | 時刻設定 |
| `proxmox_virtual_environment_version` | PVEバージョン |
