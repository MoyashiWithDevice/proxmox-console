# Proxmox VE API - ノード管理

## ノード一覧取得

```
GET /api2/json/nodes
```

**レスポンス例**:

```json
{
  "data": [
    {
      "node": "pve",
      "status": "online",
      "cpu": 0.15,
      "maxcpu": 8,
      "mem": 8589934592,
      "maxmem": 17179869184,
      "disk": 10737418240,
      "maxdisk": 107374182400,
      "ssl_fingerprint": "AB:CD:EF:...",
      "type": "node",
      "level": "",
      "uptime": 1209600
    }
  ]
}
```

## ノードステータス取得

```
GET /api2/json/nodes/{node}/status
```

```json
{
  "data": {
    "cpu": 0.15,
    "memory": {
      "used": 8589934592,
      "total": 17179869184,
      "free": 8589934592
    },
    "swap": {
      "used": 0,
      "total": 4294967296,
      "free": 4294967296
    },
    "uptime": 1209600,
    "kernel": "6.5.11-7-pve",
    "pveversion": "pve-manager/8.1.3/...",
    "cpuinfo": { ... },
    "loadavg": ["0.15", "0.20", "0.18"]
  }
}
```

## ノードリソース使用量（RRDデータ）

```
GET /api2/json/nodes/{node}/rrddata
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `timeframe` | string | `hour`, `day`, `week`, `month`, `year` |
| `cf` | string | `AVERAGE`, `MAX` |

CPU、メモリ、ネットワーク、ディスクIOの時系列データが返る。

## ノード上のリソース一覧（VM + コンテナ統合）

```
GET /api2/json/cluster/resources
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `type` | string | フィルタ: `vm`, `storage`, `node`, `sdn` |

**レスポンス例**:

```json
{
  "data": [
    {
      "id": "node/pve",
      "type": "node",
      "node": "pve",
      "status": "online",
      "cpu": 0.15,
      "maxcpu": 8,
      "mem": 8589934592,
      "maxmem": 17179869184,
      "uptime": 1209600
    },
    {
      "id": "qemu/100",
      "type": "qemu",
      "vmid": 100,
      "name": "test-vm",
      "node": "pve",
      "status": "running",
      "cpu": 0.05,
      "maxcpu": 2,
      "mem": 1073741824,
      "maxmem": 2147483648,
      "disk": 0,
      "maxdisk": 10737418240,
      "uptime": 86400
    }
  ]
}
```

このエンドポイントは全ノードの全リソースを一括取得できて便利。

## ノードのDNS設定

```
GET /api2/json/nodes/{node}/dns
PUT /api2/json/nodes/{node}/dns
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `search` | string | 検索ドメイン |
| `dns1` | string | プライマリDNS |
| `dns2` | string | セカンダリDNS |
| `dns3` | string | サードDNS |

## ノードのホスト名設定

```
GET  /api2/json/nodes/{node}/hostname
PUT  /api2/json/nodes/{node}/hostname
```

## ノードの時刻設定

```
GET  /api2/json/nodes/{node}/time
PUT  /api2/json/nodes/{node}/time
```

## ノードのAPT情報

```
GET /api2/json/nodes/{node}/apt
```

利用可能なアップデート一覧。

## ノード再起動

```
POST /api2/json/nodes/{node}/status
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `command` | string | `reboot` or `shutdown` |

## Syslog取得

```
GET /api2/json/nodes/{node}/syslog
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `start` | integer | オフセット |
| `limit` | integer | 取得件数 |
| `since` | string | 開始日時 |
| `until` | string | 終了日時 |
| `service` | string | サービス名フィルタ |
