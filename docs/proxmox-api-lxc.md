# Proxmox VE API - LXCコンテナ操作

## コンテナ一覧取得

```
GET /api2/json/nodes/{node}/lxc
```

**レスポンス例**:

```json
{
  "data": [
    {
      "vmid": 200,
      "name": "web-container",
      "status": "running",
      "cpu": 0.02,
      "cpus": 1,
      "mem": 536870912,
      "maxmem": 1073741824,
      "disk": 2147483648,
      "maxdisk": 10737418240,
      "uptime": 172800,
      "pid": 23456,
      "type": "lxc"
    }
  ]
}
```

## コンテナ詳細取得

```
GET /api2/json/nodes/{node}/lxc/{vmid}
```

## コンテナ作成

```
POST /api2/json/nodes/{node}/lxc
```

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `vmid` | integer | ○* | コンテナID（省略時は自動採番） |
| `hostname` | string | - | ホスト名 |
| `password` | string | ○ | rootパスワード |
| `ostemplate` | string | ○ | OSテンプレート（例: `local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst`） |
| `cores` | integer | - | CPUコア数 |
| `memory` | integer | - | メモリ（MB） |
| `swap` | integer | - | スワップ（MB） |
| `rootfs` | string | - | ルートファイルシステム（例: `local-lvm:10`） |
| `net0` | string | - | ネットワーク（例: `name=eth0,bridge=vmbr0,ip=dhcp`） |
| `storage` | string | - | デフォルトストレージ |
| `onboot` | boolean | - | ホスト起動時に自動起動 |
| `start` | boolean | - | 作成後すぐに起動 |
| `unprivileged` | boolean | - | 非特権コンテナ（デフォルト: true推奨） |
| `ssh-public-keys` | string | - | SSH公開鍵 |
| `features` | string | - | 追加機能（例: `nesting=1`） |

**リクエスト例**:

```
POST /api2/json/nodes/pve/lxc

vmid=200&hostname=mycontainer&password=secret&ostemplate=local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst&cores=2&memory=2048&swap=512&rootfs=local-lvm:10&net0=name=eth0,bridge=vmbr0,ip=dhcp&unprivileged=1&start=1
```

## コンテナ設定更新

```
PUT /api2/json/nodes/{node}/lxc/{vmid}/config
```

## コンテナ起動

```
POST /api2/json/nodes/{node}/lxc/{vmid}/status/start
```

## コンテナ停止

```
POST /api2/json/nodes/{node}/lxc/{vmid}/status/stop
```

## コンテナ再起動

```
POST /api2/json/nodes/{node}/lxc/{vmid}/status/reboot
```

## コンテナ一時停止・再開

```
POST /api2/json/nodes/{node}/lxc/{vmid}/status/suspend
POST /api2/json/nodes/{node}/lxc/{vmid}/status/resume
```

## コンテナ削除

```
DELETE /api2/json/nodes/{node}/lxc/{vmid}
```

**注意**: コンテナが起動中の場合は先に停止する必要がある。`force` パラメータで強制削除可能だが非推奨。

## コンテナステータス

```
GET /api2/json/nodes/{node}/lxc/{vmid}/status/current
```

```json
{
  "data": {
    "vmid": 200,
    "status": "running",
    "cpu": 0.02,
    "mem": 536870912,
    "maxmem": 1073741824,
    "disk": 2147483648,
    "maxdisk": 10737418240,
    "uptime": 172800,
    "pid": 23456
  }
}
```

## コンテナ内コマンド実行

```
POST /api2/json/nodes/{node}/lxc/{vmid}/exec
```

## コンテナのIPアドレス取得

```
GET /api2/json/nodes/{node}/lxc/{vmid}/interfaces
```

```json
{
  "data": [
    {
      "name": "eth0",
      "hwaddr": "XX:XX:XX:XX:XX:XX",
      "inet": "192.168.1.200/24",
      "inet6": "fe80::xxxx/64"
    }
  ]
}
```

## QEMU vs LXC 選択基準

| 観点 | QEMU (VM) | LXC (コンテナ) |
|---|---|---|
| オーバーヘッド | 高い（完全仮想化） | 低い（OSレベル仮想化） |
| カーネル共有 | しない | ホストと共有 |
| OS種類 | 任意（Windows含む） | Linuxのみ |
| セキュリティ分離 | 高い | 中程度 |
| パフォーマンス | 中 | 高 |
| ディスク使用量 | 大きい | 小さい |
| 起動速度 | 遅い（数十秒） | 速い（数秒） |

当プロジェクトでは現在QEMU（テンプレートクローン）を使用中。
