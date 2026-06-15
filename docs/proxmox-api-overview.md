# Proxmox VE API 概要

## ベースURL

```
https://{host}:8006/api2/json/{endpoint}
```

- デフォルトポート: `8006`
- すべてJSON形式 (`/api2/json/`)
- HTTPS必須（自己署名証明書）

## 認証方式

2種類の認証方式がある。

### 1. Ticket認証（ユーザーログイン）

ログインしてTicket + CSRFPreventionTokenを取得する方式。ブラウザセッション向き。

```
POST /api2/json/access/ticket
```

取得後のリクエストヘッダー:
```
Cookie: PVEAuthCookie={ticket}
CSRFPreventionToken: {token}   # POST/PUT/DELETE時のみ必要
```

### 2. API Token認証（推奨）

ユーザーに紐づくAPI Tokenを発行して使用。自動化・バックエンド向き。

```
Authorization: PVEAPIToken={user}!{token_id}={secret}
```

- Ticketの有効期限管理が不要
- 権限をToken単位で制御可能
- ユーザーパスワードをコードに含めなくてよい

詳細は [proxmox-api-auth.md](proxmox-api-auth.md) を参照。

## レスポンス形式

### 成功時

```json
{
  "data": { ... }
}
```

`data` の中身はエンドポイントによって異なる。

### エラー時

```json
{
  "errors": {
    "field": "error message"
  }
}
```

HTTPステータスコードも適切に返る（200, 400, 401, 403, 500等）。

## 主要エンドポイント一覧

| カテゴリ | エンドポイント | 説明 |
|---|---|---|
| 認証 | `POST /access/ticket` | ログイン・Ticket取得 |
| 認証 | `GET /access/users` | ユーザー一覧 |
| バージョン | `GET /version` | PVEバージョン情報 |
| ノード | `GET /nodes` | ノード一覧 |
| ノード | `GET /nodes/{node}/status` | ノードステータス |
| QEMU VM | `GET /nodes/{node}/qemu` | VM一覧 |
| QEMU VM | `POST /nodes/{node}/qemu` | VM作成 |
| QEMU VM | `GET /nodes/{node}/qemu/{vmid}` | VM詳細 |
| QEMU VM | `POST /nodes/{node}/qemu/{vmid}/status/start` | VM起動 |
| QEMU VM | `POST /nodes/{node}/qemu/{vmid}/status/stop` | VM停止 |
| QEMU VM | `POST /nodes/{node}/qemu/{vmid}/status/reboot` | VM再起動 |
| QEMU VM | `DELETE /nodes/{node}/qemu/{vmid}` | VM削除 |
| LXC | `GET /nodes/{node}/lxc` | コンテナ一覧 |
| LXC | `POST /nodes/{node}/lxc` | コンテナ作成 |
| LXC | `DELETE /nodes/{node}/lxc/{vmid}` | コンテナ削除 |
| ストレージ | `GET /nodes/{node}/storage` | ストレージ一覧 |
| ストレージ | `GET /nodes/{node}/storage/{storage}/content` | ストレージ内容 |
| ネットワーク | `GET /nodes/{node}/network` | ネットワークIF一覧 |
| スナップショット | `GET /nodes/{node}/qemu/{vmid}/snapshot` | スナップショット一覧 |
| タスク | `GET /nodes/{node}/tasks` | タスク一覧 |
| VNC | `POST /nodes/{node}/qemu/{vmid}/vncproxy` | VNCプロキシ取得 |

## 当プロジェクトでの利用状況

現在は **Terraform (bpg/proxmox provider)** 経由でAPIを利用している:

```
Go Backend → Terraform → bpg/proxmox Provider → Proxmox API
```

将来的にはGoから直接APIを呼び出す場合、以下のフローになる:

```
Go Backend → HTTP Client → Proxmox API (API Token認証)
```

## 関連ドキュメント

- [認証](proxmox-api-auth.md)
- [VM操作 (QEMU)](proxmox-api-vm.md)
- [コンテナ操作 (LXC)](proxmox-api-lxc.md)
- [ノード管理](proxmox-api-node.md)
- [ストレージ](proxmox-api-storage.md)
- [ネットワーク](proxmox-api-network.md)
- [タスク・ジョブ管理](proxmox-api-tasks.md)
- [コンソール・VNC](proxmox-api-console.md)

## 外部リファレンス

- [Proxmox VE API Documentation (公式)](https://pve.proxmox.com/pve-docs/api-viewer/apidoc.js)
- [Proxmox VE API Viewer](https://pve.proxmox.com/pve-docs/api-viewer/)
- [bpg/proxmox Terraform Provider](https://registry.terraform.io/providers/bpg/proxmox/latest/docs)
