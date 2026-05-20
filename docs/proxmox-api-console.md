# Proxmox VE API - コンソール・VNCアクセス

## VNCプロキシ取得（QEMU VM）

```
POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `websocket` | boolean | WebSocket VNCを使用 |
| `generate-password` | boolean | ランダムパスワード生成 |

**レスポンス例**:

```json
{
  "data": {
    "port": 5900,
    "ticket": "PVEVNC:...",
    "cert": "-----BEGIN CERTIFICATE-----...",
    "user": "root@pam",
    "upid": "UPID:pve:...",
    "host": "192.168.1.10"
  }
}
```

### VNC接続フロー

1. VNC Proxy APIを呼んで `ticket` と `port` を取得
2. VNCクライアントで `{host}:{port}` に接続
3. 認証に `ticket` を使用

## VNC WebSocket（ブラウザコンソール）

```
POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy?websocket=1
```

WebSocket URL:
```
wss://{host}:8006/api2/json/nodes/{node}/qemu/{vmid}/vncproxy?port={port}&vncticket={ticket}
```

### noVNCによるブラウザコンソール実装

Proxmox標準のnoVNC統合を使う場合:

```
https://{host}:8006/?console=kvm&novnc=1&vmid={vmid}&vmname={name}&node={node}
```

## VNCプロキシ取得（LXCコンテナ）

```
POST /api2/json/nodes/{node}/lxc/{vmid}/vncproxy
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `websocket` | boolean | WebSocket VNC |
| `width` | integer | コンソール幅 |
| `height` | integer | コンソール高さ |

## Termproxy（ターミナルアクセス）

### QEMU VM

```
POST /api2/json/nodes/{node}/qemu/{vmid}/termproxy
```

### LXCコンテナ

```
POST /api2/json/nodes/{node}/lxc/{vmid}/termproxy
```

**レスポンス例**:

```json
{
  "data": {
    "port": 12345,
    "ticket": "...",
    "user": "root@pam",
    "upid": "UPID:pve:..."
  }
}
```

WebSocketで `{host}:{port}` に接続してターミナルセッションを確立。

## SPICEコンソール

```
POST /api2/json/nodes/{node}/qemu/{vmid}/spiceproxy
```

SPICEプロトコルでのリモートコンソールアクセス用。VNCより高機能（音声、USBリダイレクト等）。

---

## 当プロジェクトへの適用イメージ

将来的にブラウザから直接VMコンソールを提供する場合:

### 方式1: iframe で Proxmox noVNC を埋め込み

```html
<iframe src="https://pve-host:8006/?console=kvm&novnc=1&vmid=100&node=pve"></iframe>
```

- 簡単だがProxmoxのログインが別途必要
- 認証の統合が難しい

### 方式2: API Token で VNC Proxy → 独自 noVNC

```javascript
// 1. バックエンドでVNC Proxy取得
const proxy = await fetch('/api/vnc-proxy?vmid=100');
const { port, ticket } = await proxy.json();

// 2. noVNCクライアントで接続
const rfb = new RFB(document.getElementById('console'), 
  `wss://pve-host:${port}`,
  { credentials: { password: ticket } }
);
```

### 方式3: バックエンドプロキシ（推奨）

```
ブラウザ → Go Backend (WebSocket Proxy) → Proxmox VNC
```

GoバックエンドがProxmoxのVNCセッションを中継:
- 認証はバックエンドで一元管理
- フロントエンドはProxmoxを意識しない
- CORSや証明書の問題を回避

```go
// Go バックエンド側のプロキシ実装イメージ
func vncProxyHandler(w http.ResponseWriter, r *http.Request) {
    vmid := r.URL.Query().Get("vmid")
    
    // Proxmox APIでVNC Proxy取得
    ticket := getVNCTicket(vmid)
    
    // WebSocketをProxmoxに中継
    proxyWebSocket(w, r, "wss://pve:8006/...", ticket)
}
```
