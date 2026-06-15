# Proxmox VE API 認証

## 1. Ticket認証（ユーザーログイン）

### ログイン

```
POST /api2/json/access/ticket
```

**リクエストボディ (form-data)**:

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `username` | string | ○ | `user@realm` 形式 (例: `root@pam`, `admin@pve`) |
| `password` | string | ○ | パスワード |
| `otp` | string | - | TOTPワンタイムパスワード（2FA有効時） |
| `realm` | string | - | 認証レルム (pam, pve, ldap等) |
| `new-format` | boolean | - | 新フォーマット使用 (true推奨) |

**レスポンス例**:

```json
{
  "data": {
    "username": "root@pam",
    "CSRFPreventionToken": "65abc123:def456...",
    "ticket": "PVE:root@pam:65abc123::...",
    "cap": {},
    "clustername": "pve-cluster"
  }
}
```

### 取得したTicketの使用方法

#### GET リクエスト（Cookieのみ）

```http
GET /api2/json/nodes
Cookie: PVEAuthCookie={ticket}
```

#### POST / PUT / DELETE リクエスト（Cookie + CSRF Token）

```http
POST /api2/json/nodes/pve/qemu
Cookie: PVEAuthCookie={ticket}
CSRFPreventionToken: {csrf_token}
Content-Type: application/x-www-form-urlencoded

name=test-vm&cores=2&memory=2048
```

### Ticket ログアウト

```
DELETE /api2/json/access/ticket
Cookie: PVEAuthCookie={ticket}
CSRFPreventionToken: {csrf_token}
```

### Ticket有効期限

- デフォルト: 2時間
- `/etc/pve/user.cfg` の設定で変更可能

---

## 2. API Token認証（推奨: バックエンド用途）

### トークン作成（手動）

Proxmox Web UI または API から作成:

**Web UI**: Datacenter → Permissions → API Tokens

**API**:
```
POST /api2/json/access/users/{userid}/token/{tokenid}
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `comment` | string | メモ |
| `expire` | integer | 有効期限（Unix timestamp、0=無期限） |
| `privsep` | boolean | `true`=トークン専用権限、`false`=ユーザー権限を継承 |

### トークン使用方法

```http
GET /api2/json/nodes
Authorization: PVEAPIToken=root@pam!mytoken=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- CookieやCSRF Tokenは不要
- すべてのHTTPメソッドで同じヘッダーを使用

### トークン権限設定

API Tokenに権限を付与:

**Web UI**: Datacenter → Permissions → Add（Pathに `/`, User/TokenにAPI Tokenを選択）

**API**:
```
PUT /api2/json/access/permissions
```

| パラメータ | 説明 |
|---|---|
| `path` | 対象パス (例: `/`, `/nodes/pve`, `/vms/{vmid}`) |
| `roles` | ロール (例: `PVEVMAdmin`, `PVEAdmin`) |
| `users` | `user@realm!tokenid` 形式 |

### 主要ロール

| ロール | 説明 |
|---|---|
| `Administrator` | 全権限 |
| `PVEAdmin` | ほぼ全権限（システム設定除く） |
| `PVEVMAdmin` | VM管理（作成・削除・設定変更） |
| `PVEVMUser` | VM操作（起動・停止・コンソール） |
| `PVEAuditor` | 読み取り専用 |

---

## 3. 当プロジェクトでの推奨構成

現在のTerraform構成では `.env` / `proxmox.auto.tfvars` に認証情報を格納:

```hcl
# terraform/provider.tf
provider "proxmox" {
  endpoint = var.proxmox_endpoint    # https://host:8006
  username = var.proxmox_username    # root@pam
  password = var.proxmox_password
  insecure = true                    # 自己署名証明書を許可
}
```

Goから直接APIを呼び出す場合は **API Token認証** を推奨:

```go
// API Token使用例
req, _ := http.NewRequest("GET", "https://pve-host:8006/api2/json/nodes", nil)
req.Header.Set("Authorization", "PVEAPIToken=root@pam!console-api=secret-token-here")
```

### セキュリティ上の注意

- API TokenのSecretは環境変数で管理（`.env` ファイルは `.gitignore` に追加済み）
- `privsep: true` で最小権限のトークンを作成
- VM作成に必要な最低権限: `PVEVMAdmin` on `/nodes/{node}`
