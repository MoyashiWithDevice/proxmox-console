# Proxmox VE API - VM操作 (QEMU)

## VM一覧取得

```
GET /api2/json/nodes/{node}/qemu
```

**レスポンス例**:

```json
{
  "data": [
    {
      "vmid": 100,
      "name": "test-vm",
      "status": "running",
      "cpu": 0.05,
      "cpus": 2,
      "mem": 1073741824,
      "maxmem": 2147483648,
      "diskread": 10485760,
      "diskwrite": 5242880,
      "netin": 1024000,
      "netout": 512000,
      "uptime": 86400,
      "pid": 12345
    }
  ]
}
```

## VM詳細取得

### VM設定取得

```
GET /api2/json/nodes/{node}/qemu/{vmid}/config
```

Proxmox APIはフラットなキー値ペアで返す（ネストオブジェクトではない）。

**レスポンス例**:

```json
{
  "data": {
    "cores": 2,
    "sockets": 1,
    "cpu": "qemu64",
    "memory": 2048,
    "scsi0": "local-lvm:vm-100-disk-0,size=10G",
    "net0": "virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0,tag=10",
    "agent": 1,
    "ostype": "l26",
    "boot": "order=scsi0",
    "name": "test-vm",
    "onboot": 1,
    "vmgenid": "...",
    "digest": "..."
  }
}
```

### VMステータス取得

```
GET /api2/json/nodes/{node}/qemu/{vmid}/status/current
```

```json
{
  "data": {
    "vmid": 100,
    "status": "running",
    "qmpstatus": "running",
    "name": "test-vm",
    "cpu": 0.05,
    "cpus": 2,
    "mem": 1073741824,
    "maxmem": 2147483648,
    "uptime": 86400,
    "pid": 12345,
    "ha": { "managed": 0 }
  }
}
```

## VM作成

```
POST /api2/json/nodes/{node}/qemu
```

### ゼロから作成

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `vmid` | integer | ○* | VM ID（省略時は自動採番） |
| `name` | string | - | VM名 |
| `cores` | integer | - | CPUコア数（デフォルト: 1） |
| `sockets` | integer | - | CPUソケット数（デフォルト: 1） |
| `memory` | integer | - | メモリ（MB） |
| `scsi0` | string | - | ディスク定義（例: `local-lvm:10`） |
| `net0` | string | - | ネットワーク定義 |
| `ostype` | string | - | OS種別（`l26`=Linux 2.6+, `l24`=Linux 2.4+, `win11`=Windows 11） |
| `boot` | string | - | ブート順序 |
| `agent` | boolean | - | QEMU Agent有効化 |
| `onboot` | boolean | - | ホスト起動時に自動起動 |
| `start` | boolean | - | 作成後すぐに起動 |
| `description` | string | - | 説明 |

### クローン作成（当プロジェクトで使用中）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `vmid` | integer | ○ | 新しいVM ID |
| `name` | string | - | VM名 |
| `newid` | integer | ○ | クローン先のVM ID |
| `node` | string | - | クローン先ノード |
| `storage` | string | - | ストレージ名 |
| `mode` | string | - | `copy`（完全クローン）or `linked`（リンククローン） |
| `target` | string | - | ターゲットノード（異なるノードへクローン時） |
| `description` | string | - | 説明 |

**リクエスト例（クローン）**:

```
POST /api2/json/nodes/pve/qemu/9000/clone

newid=100&name=my-vm&full=1&storage=local-lvm
```

### cloud-init による初期設定

| パラメータ | 型 | 説明 |
|---|---|---|
| `ciuser` | string | 初期ユーザー名 |
| `cipassword` | string | 初期パスワード（平文） |
| `sshkeys` | string | SSH公開鍵 |
| `ci-custom` | string | カスタムcloud-init設定 |
| `ipconfig0` | string | IP設定（例: `ip=dhcp` or `ip=192.168.1.100/24,gw=192.168.1.1`） |
| `nameserver` | string | DNSサーバー |
| `searchdomain` | string | 検索ドメイン |

**当プロジェクトのTerraform構成との対応**:

```hcl
# terraform/vm.tf の構成 → APIパラメータ
clone { vm_id = 9000 }          # → クローン元VM ID
cpu { cores = var.cpu }          # → cores
memory { dedicated = var.memory }# → memory (MB)
disk { size = var.hdd }          # → scsi0 = "local-lvm:{size}"
network_device { vlan_id = 10 }  # → net0 = "...,tag=10"
initialization { ... }           # → cloud-init parameters
```

## VM設定更新

```
PUT /api2/json/nodes/{node}/qemu/{vmid}/config
```

VM作成と同じパラメータが使用可能。変更したい項目のみ送信。

## VM起動

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/start
```

**レスポンス例**:

```json
{
  "data": "UPID:pve:00001234:56789012:65abc123:qmstart:100:root@pam:"
}
```

UPID（タスクID）が返る。タスク完了確認は [proxmox-api-tasks.md](proxmox-api-tasks.md) を参照。

## VM停止

### グレースフル停止

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/shutdown
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `timeout` | integer | タイムアウト（秒） |
| `forceStop` | boolean | タイムアウト後強制停止 |

### 強制停止（電源オフ相当）

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/stop
```

## VM再起動

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/reboot
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `timeout` | integer | タイムアウト（秒） |

## VMリセット

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/reset
```

## VM一時停止・再開

```
POST /api2/json/nodes/{node}/qemu/{vmid}/status/suspend
POST /api2/json/nodes/{node}/qemu/{vmid}/status/resume
```

## VM削除

```
DELETE /api2/json/nodes/{node}/qemu/{vmid}
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `destroy-unreferenced-disks` | boolean | 未参照ディスクも削除 |
| `purge` | boolean | ジョブ・レコードも完全削除 |

**注意**: VMが起動中の場合は先に停止する必要がある。

## VMステータス取得

```
GET /api2/json/nodes/{node}/qemu/{vmid}/status/current
```

```json
{
  "data": {
    "vmid": 100,
    "status": "running",
    "qmpstatus": "running",
    "cpu": 0.05,
    "mem": 1073741824,
    "maxmem": 2147483648,
    "uptime": 86400,
    "ha": { "managed": 0 }
  }
}
```

`status` 値: `running`, `stopped`, `paused`, `suspended`

## VMのIPアドレス取得（QEMU Agent経由）

```
GET /api2/json/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces
```

```json
{
  "data": {
    "result": [
      {
        "name": "eth0",
        "ip-addresses": [
          {
            "ip-address": "192.168.1.100",
            "ip-address-type": "ipv4",
            "prefix": 24
          }
        ]
      }
    ]
  }
}
```

**前提**: VM内で `qemu-guest-agent` が動作しており、VM設定で `agent: 1` が有効であること。

当プロジェクトではTerraformの `output "vm_ip"` で `ipv4_addresses` を使用している。

## 次のVM ID取得

```
GET /api2/json/cluster/nextid
```

```json
{
  "data": "101"
}
```

自動採番用。現在の最大VM ID + 1が返る。

## スナップショット

### 一覧

```
GET /api2/json/nodes/{node}/qemu/{vmid}/snapshot
```

### 作成

```
POST /api2/json/nodes/{node}/qemu/{vmid}/snapshot
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `snapname` | string | スナップショット名 |
| `description` | string | 説明 |
| `vmstate` | boolean | VMメモリ状態も保存 |

### ロールバック

```
POST /api2/json/nodes/{node}/qemu/{vmid}/snapshot/{snapname}/rollback
```

### 削除

```
DELETE /api2/json/nodes/{node}/qemu/{vmid}/snapshot/{snapname}
```

## ファイアウォール

### VM ファイアウォール設定

```
GET  /api2/json/nodes/{node}/qemu/{vmid}/firewall/options
PUT  /api2/json/nodes/{node}/qemu/{vmid}/firewall/options
```

### ルール管理

```
GET    /api2/json/nodes/{node}/qemu/{vmid}/firewall/rules
POST   /api2/json/nodes/{node}/qemu/{vmid}/firewall/rules
PUT    /api2/json/nodes/{node}/qemu/{vmid}/firewall/rules/{pos}
DELETE /api2/json/nodes/{node}/qemu/{vmid}/firewall/rules/{pos}
```
