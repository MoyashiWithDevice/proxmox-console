# Terraform VMリソース定義

## variables.tf

```hcl
# Proxmox接続情報
variable "proxmox_endpoint" {
  type        = string
  description = "Proxmox API endpoint"
}

variable "proxmox_username" {
  type        = string
  description = "Proxmox username"
  sensitive   = true
}

variable "proxmox_password" {
  type        = string
  description = "Proxmox password"
  sensitive   = true
}

# ノード・VM設定
variable "node_name"     {}
variable "servername"    {}
variable "cpu"           {}
variable "memory"        {}
variable "hdd"           {}
variable "username"      { sensitive = true }
variable "password_hash" { sensitive = true }
```

### 変数の値の流れ

```
ユーザー入力（HTMLフォーム）
    ↓
Go handler.go (VMRequest構造体)
    ↓ runtime.tfvars を動的生成
Terraform variable
    ↓
vm.tf / snippets.tf のリソース定義
```

## vm.tf

```hcl
resource "proxmox_virtual_environment_vm" "vm" {
  name      = var.servername
  node_name = var.node_name

  # テンプレートVM (ID: 9000) からクローン
  clone {
    vm_id = 9000
  }

  cpu {
    cores = var.cpu
  }

  memory {
    dedicated = var.memory
  }

  disk {
    datastore_id = "local-lvm"
    interface    = "scsi0"
    size         = var.hdd
  }

  network_device {
    bridge  = "vmbr0"
    model   = "virtio"
    vlan_id = 10
  }

  initialization {
    ip_config {
      ipv4 {
        address = "dhcp"
      }
    }
    user_data_file_id = proxmox_virtual_environment_file.cloudcfg.id
  }

  agent {
    enabled = true
  }
}

output "vm_ip" {
  value = try(
    proxmox_virtual_environment_vm.vm.ipv4_addresses[1],
    "waiting"
  )
}
```

## リソース設定詳細

### `proxmox_virtual_environment_vm` 全ブロック

#### clone（クローン元設定）

| パラメータ | 型 | 説明 |
|---|---|---|---|
| `vm_id` | integer | クローン元のVM ID |
| `retries` | integer | リトライ回数（デフォルト: 0） |

#### cpu

| パラメータ | 型 | 説明 |
|---|---|---|
| `cores` | integer | コア数（1-128） |
| `sockets` | integer | ソケット数（1-4） |
| `type` | string | CPUタイプ（`qemu64`, `host`, `kvm64`等） |
| `flags` | list | CPUフラグ |
| `limit` | integer | CPU制限（0=無制限） |
| `units` | integer | CPU配分（1-262144、デフォルト: 1024） |

#### memory

| パラメータ | 型 | 説明 |
|---|---|---|
| `dedicated` | integer | 専用メモリ（MB） |
| `floating` | integer | フローティングメモリ（MB） |
| `shared` | integer | 共有メモリ（MB） |

#### disk（ディスク）

| パラメータ | 型 | 説明 |
|---|---|---|
| `datastore_id` | string | ストレージ名 |
| `interface` | string | ディスクインターフェース（`scsi0`-`scsi30`, `ide0`-`ide3`, `sata0`-`sata5`, `virtio0`-`virtio15`） |
| `size` | integer | サイズ（GB） |
| `file_format` | string | `raw` or `qcow2` |
| `cache` | string | キャッシュモード（`none`, `writeback`, `writethrough`等） |
| `discard` | string | TRIMサポート（`ignore`, `on`） |
| `ssd` | boolean | SSD emulation |

#### network_device（ネットワーク）

| パラメータ | 型 | 説明 |
|---|---|---|
| `bridge` | string | ブリッジ名（例: `vmbr0`） |
| `model` | string | NICモデル（`virtio`, `e1000`, `rtl8139`等） |
| `vlan_id` | integer | VLAN ID（1-4094） |
| `mac_address` | string | MACアドレス（省略時は自動生成） |
| `firewall` | boolean | ファイアウォール有効 |
| `disconnected` | boolean | リンクダウン状態 |

複数NIC定義可能:
```hcl
network_device {
  bridge  = "vmbr0"
  model   = "virtio"
  vlan_id = 10
}
network_device {
  bridge  = "vmbr1"
  model   = "virtio"
}
```

#### initialization（cloud-init）

| パラメータ | 型 | 説明 |
|---|---|---|
| `interface` | string | cloud-init用NIC |
| `user_data_file_id` | string | user-dataファイルID |
| `meta_data_file_id` | string | meta-dataファイルID |
| `vendor_data_file_id` | string | vendor-dataファイルID |
| `network_data_file_id` | string | network-dataファイルID |

`ip_config` ブロック:
```hcl
ip_config {
  ipv4 {
    address = "dhcp"                           # DHCP
    # address = "192.168.1.100/24"             # 静的IP
    # gateway = "192.168.1.1"                  # ゲートウェイ
  }
  ipv6 {
    address = "auto"                           # SLAAC
    # address = "2001:db8::100/64"
    # gateway = "2001:db8::1"
  }
}
```

#### agent（QEMU Guest Agent）

```hcl
agent {
  enabled = true
  timeout = "15m"    # タイムアウト（エージェント応答待ち）
  trim    = true     # fstrimサポート
}
```

#### その他のブロック

> **注意**: 以下のブロック名・パラメータ名は `bpg/proxmox` のバージョンによって
> 変更される可能性がある。実際の利用時は
> [Provider Docs](https://registry.terraform.io/providers/bpg/proxmox/latest/docs/resources/virtual_environment_vm)
> で最新情報を確認すること。

```hcl
# ブート順序
boot {
  order = "scsi0"
}

# OS種別
operating_system {
  type = "l26"    # Linux 2.6+
}

# VGA表示
vga {
  type = "qxl"    # std, vmware, virtio, qxl, none
}

# シリアルコンソール
serial_device {
  device = "socket"
}

# 自動起動
started  = true
on_boot  = true

# 説明
description = "Created by proxmox-console"

# リソース制限
startup {
  order      = 3     # 起動順序
  up_delay   = 60    # 起動後待機（秒）
  down_delay = 60    # 停止前待機（秒）
}

# ホストPCI デバイスパススルー
host_pci {
  device  = "hostpci0"
  mapping = "gpu"
  pcie    = true
  rombar  = true
}

# USB デバイス
usb {
  host = "spice"
  # or mapping = "usb-device-name"
}
```

### output（出力値）

```hcl
output "vm_ip" {
  value = try(
    proxmox_virtual_environment_vm.vm.ipv4_addresses[1],
    "waiting"
  )
}
```

`ipv4_addresses` はリストで、インデックス0は `lo`、インデックス1以降が各NICのIP。
`try()` でVM作成直後（IP未割り当て）のエラーを回避。

### Go側でのIP取得

```go
// handler.go
func getVMIP(job *Job) string {
    cmd := exec.Command("terraform", "output", "-json", "vm_ip")
    cmd.Dir = job.Workdir
    out, err := runCmdWithLog(cmd, logFile)
    // → JSON配列としてパース ["192.168.10.50"]
    var ips []string
    json.Unmarshal(out, &ips)
    return ips[0]
}
```

## テンプレートVM (ID: 9000) の要件

クローン元のテンプレートVMに必要な設定:
- cloud-init がインストール済み (`cloud-init`, `cloud-init-local`)
- `qemu-guest-agent` がインストール済み
- cloud-init用のCDROMドライブが設定済み
- OSはLinux（Ubuntu, Debian, CentOS等）
- テンプレート化済み（Proxmox UIで「Convert to template」実行済み）
