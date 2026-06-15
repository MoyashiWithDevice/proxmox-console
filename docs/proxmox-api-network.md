# Proxmox VE API - ネットワーク管理

## ネットワークインターフェース一覧

```
GET /api2/json/nodes/{node}/network
```

**レスポンス例**:

```json
{
  "data": [
    {
      "iface": "lo",
      "type": "loopback",
      "active": 1,
      "method": "loopback",
      "address": "127.0.0.1",
      "netmask": "8"
    },
    {
      "iface": "eno1",
      "type": "eth",
      "active": 1,
      "method": "static",
      "address": "192.168.1.10",
      "netmask": "24",
      "gateway": "192.168.1.1",
      "bridge_ports": "",
      "cidr": "192.168.1.10/24"
    },
    {
      "iface": "vmbr0",
      "type": "bridge",
      "active": 1,
      "method": "static",
      "address": "192.168.1.10",
      "netmask": "24",
      "gateway": "192.168.1.1",
      "bridge_ports": "eno1",
      "bridge_stp": "off",
      "bridge_fd": "0",
      "autostart": 1
    },
    {
      "iface": "vmbr1",
      "type": "bridge",
      "active": 1,
      "bridge_ports": "",
      "bridge_vids": "2-4094",
      "bridge_vlan_aware": 1
    }
  ]
}
```

## インターフェース作成

```
POST /api2/json/nodes/{node}/network
```

### ブリッジ作成例

| パラメータ | 型 | 説明 |
|---|---|---|
| `type` | string | `bridge` |
| `iface` | string | インターフェース名（例: `vmbr2`） |
| `bridge_ports` | string | ブリッジに含める物理IF |
| `bridge_vids` | string | VLAN ID範囲（例: `2-4094`） |
| `bridge_vlan_aware` | boolean | VLAN Aware ブリッジ |
| `address` | string | IPアドレス |
| `netmask` | string | サブネットマスク |
| `gateway` | string | ゲートウェイ |
| `autostart` | boolean | 自動起動 |

### VLAN Bridge作成

```
type=bridge&iface=vmbr1&bridge_vlan_aware=1&bridge_vids=2-4094&autostart=1
```

## インターフェース更新

```
PUT /api2/json/nodes/{node}/network/{iface}
```

## インターフェース削除

```
DELETE /api2/json/nodes/{node}/network/{iface}
```

## ネットワーク設定適用

```
POST /api2/json/nodes/{node}/network
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `node` | string | ノード名 |

設定変更後、反映するためにコミットが必要。

## ネットワーク設定の差分確認

```
GET /api2/json/nodes/{node}/network?qemu=1
```

## DNS設定

```
GET  /api2/json/nodes/{node}/dns
PUT  /api2/json/nodes/{node}/dns
```

## ホスト名設定

```
GET  /api2/json/nodes/{node}/hostname
PUT  /api2/json/nodes/{node}/hostname
```

## VLAN構成（当プロジェクト）

当プロジェクトではVLAN 10を使用:

```hcl
# terraform/vm.tf
network_device {
  bridge  = "vmbr0"
  model   = "virtio"
  vlan_id = 10
}
```

APIパラメータでは:

```
net0=virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0,tag=10
```

`tag=10` がVLAN IDを指定するパラメータ。
