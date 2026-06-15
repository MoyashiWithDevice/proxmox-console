# Proxmox Console — 設計書

## 1. プロジェクト概要

**「これがおれたちのAWS」**

Proxmox VEの仮想マシン操作に必要な専門知識を不要にし、誰もが簡単にVMを作成・管理できるセルフサービスプラットフォームを構築する。将来的にはTerraformが対応する任意のクラウドプロバイダ（AWS等）へ拡張可能な設計とする。

### 開発体制

- 2名・制作授業期間内

### 機能要件

- VMの作成・削除・起動・停止・再起動・設定変更
- Webコンソール接続（VNCプロキシ）
- ユーザー認証・セッション管理
- ユーザーごとのVLAN・サブネット分離
- ルーティング・ファイアウォール制御
- cloud-initによるVM起動時のコマンド自動実行
- 管理者ダッシュボード

### 技術構成

| レイヤー | 技術 |
|---|---|
| バックエンド | Go |
| 認証 | Ory Kratos |
| VM作成・削除・ネットワーク | terraform-exec |
| VM起動・停止・操作・コンソール | go-proxmox |
| インフラ初期構築 | Terraform（確定） |
| ネットワーク制御 | nftables + VLAN |
| DB | PostgreSQL |
| 仮想化基盤 | Proxmox VE |
| サーバー | Ubuntu VM 1台（ルーター兼サービス統合） |

### 設計方針

- Ubuntu VM 1台にルーター機能（nftables）・Goアプリ・Kratosを統合
- ユーザーごとにVLANを割り当てて完全ネットワーク隔離
- ProxmoxのAPIトークンはGoアプリのみが保持
- ユーザー↔VMIDのマッピングはGoアプリのDBで管理
- 認可チェックはGoアプリ層で完結（Proxmoxのパーミッションに依存しない）
- VNCはブラウザ→Goアプリ経由のみでアクセス可能

## 2. アーキテクチャ

```
ブラウザ
  │
  ▼
Go HTTP Server (本アプリ)  ─── Ubuntu VM 上で稼働
  │
  ├── 認証 ──────────── Ory Kratos（同一VM上）
  │
  ├── インフラ操作 ──── terraform-exec
  │   VM作成・削除、ネットワーク構成、ストレージ割り当て
  │   バックアップスケジュール、ファイアウォールルール
  │
  ├── ランタイム操作 ── go-proxmox
  │   VM起動・停止・再起動、設定変更
  │   スナップショット、バックアップ即時実行
  │   メトリクス・モニタリング、VNCプロキシ
  │
  ├── ネットワーク制御 ─ nftables
  │   ユーザーVLAN間ルーティング、ファイアウォール
  │
  └── データ永続化 ──── PostgreSQL
      ユーザとVMの紐付け、VLAN割り当て管理
```

### terraform-exec vs go-proxmox の使い分け

| 操作 | terraform-exec | go-proxmox | 理由 |
|---|---|---|---|
| VM作成・削除 | ◎ | △ | 宣言的・冪等、状態管理、マルチクラウド対応 |
| VM起動・停止・再起動 | ✕ | ◎ | 即時操作、オーバーヘッドなし |
| VM設定変更 | ◎ | ◎ | スペック変更=Terraform、稼働中設定=go-proxmox |
| ライブマイグレーション | ✕ | ◎ | Proxmox固有機能 |
| スナップショット | △ | ◎ | Proxmox APIが得意 |
| ネットワーク構成 | ◎ | △ | Terraformで宣言的に管理 |
| ストレージ割り当て | ◎ | △ | Terraformで宣言的に管理 |
| バックアップスケジュール | ◎ | △ | Terraformで宣言的に管理 |
| バックアップ即時実行 | ✕ | ◎ | 即時操作 |
| メトリクス・モニタリング | ✕ | ◎ | Proxmox RRDデータ |
| ファイアウォールルール | ◎ | △ | Terraformで宣言的に管理 |
| コンソールアクセス | ✕ | ◎ | VNC/WebSocketプロキシ |

◎ = 得意、△ = できるが不向き、✕ = 不向き

## 3. ネットワークアーキテクチャ

### ネットワーク分離モデル

```
                    ┌─────────────────────────┐
                    │   Ubuntu VM (Router)    │
                    │   nftables + Go App     │
                    │                         │
                    │  eth0: 外部ネットワーク   │
                    │  eth1.10: VLAN 10 (管理) │
                    │  eth1.100: VLAN 100      │
                    │  eth1.101: VLAN 101      │
                    │  ...                     │
                    └────────┬────────────────┘
                             │ (trunk port)
                    ┌────────┴────────────────┐
                    │      Proxmox VE         │
                    │      vmbr0 (VLAN aware)  │
                    └──┬──────┬──────┬────────┘
                       │      │      │
                  ┌────┴─┐┌───┴──┐┌──┴───┐
                  │VM 101││VM 102││VM 103│
                  │VLAN100││VLAN100││VLAN101│
                  │User A ││User A ││User B │
                  └──────┘└──────┘└──────┘
```

### IPアドレッシング

各ユーザーに一意のVLAN IDとサブネットを割り当てる。

| ユーザー | VLAN ID | サブネット | Gateway |
|---|---|---|---|
| User A | 100 | 10.100.0.0/24 | 10.100.0.1 |
| User B | 101 | 10.101.0.0/24 | 10.101.0.1 |
| ... | N | 10.N.0.0/24 | 10.N.0.1 |

GatewayはUbuntu VMの該VLANインターフェースのIP。nftablesでVLAN間の転送を制御する。

### nftables制御

Goアプリからnftablesルールを動的に操作する。

- ユーザー登録時: VLAN作成 + ルーティングルール追加
- ユーザー削除時: VLAN削除 + ルーティングルール削除
- ファイアウォール: デフォルトでVLAN間通信を拒否、管理者が明示的に許可
- **起動時復元**: Goアプリ起動時にDB内の全ユーザーのVLAN情報からnftablesルールを再構築（VM再起動でルールが消えるため）

## 4. データベース設計

### 方針

- **識別子のみ保持** — VMのスペック・状態はProxmox APIから取得し、DBとの乖離を防ぐ。Terraformが管理する情報もDBに重複させない
- **PostgreSQL** — Kratosとは別コンテナで運用。将来の権限管理拡張に対応しやすい
- **ネットワーク情報はDB管理** — VLAN IDとサブネットの割り当て、ファイアウォールルール（nftables復元用）

### ER図

```
┌──────────────┐     ┌─────────────────────┐
│    users     │     │        vms          │
├──────────────┤     ├─────────────────────┤
│ id      [PK] │◄──┬─│ id           [PK]   │
│ kratos_id    │   │ │ user_id      [FK]   │
│ role         │   │ │ proxmox_vm_id       │
│ vlan_id      │   │ │ node_name           │
│ created_at   │   │ │ tf_workdir          │
└──────────────┘   │ │ status              │
       ▲           │ │ created_at          │
       │           │ └─────────────────────┘
┌──────┴───────────┐
│  network_rules   │
├──────────────────┤
│ id          [PK] │
│ user_id     [FK] │
│ action           │
│ direction        │
│ dest_vlan_id     │
│ protocol         │
│ dest_port        │
│ created_at       │
└──────────────────┘
```

### テーブル定義

#### users

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 内部ID |
| kratos_id | TEXT | UNIQUE, NOT NULL | Kratos identity ID |
| role | TEXT | NOT NULL, DEFAULT 'user' | `admin` / `user` |
| vlan_id | INTEGER | UNIQUE | 割り当て済みVLAN ID |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

サブネットは `vlan_id` から `10.{vlan_id}.0.0/24` で導出するためカラムを持たない。

#### vms

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 内部ID |
| user_id | INTEGER | FK → users.id, NOT NULL | 所有ユーザー |
| proxmox_vm_id | INTEGER | NOT NULL | Proxmoxが割り当てたVM ID（go-proxmox呼び出しに使用） |
| node_name | TEXT | NOT NULL | 稼働ノード名（go-proxmoxはノード指定が必要） |
| tf_workdir | TEXT | NOT NULL | Terraform実行ディレクトリ（destroy/retry用） |
| status | TEXT | NOT NULL, DEFAULT 'creating' | `creating` / `updating` / `deleting` / `active` / `error` |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| deleted_at | TIMESTAMP | | 論理削除日時（NULL = 有効） |

VMのスペック（cpu/memory/hdd）はTerraformが管理するため重複して持たない。
VMの実行状態（running/stopped）はProxmox APIから取得するため持たない。

#### network_rules

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 内部ID |
| user_id | INTEGER | FK → users.id, NOT NULL, ON DELETE CASCADE | 対象ユーザー |
| action | TEXT | NOT NULL | `accept` / `drop` |
| direction | TEXT | NOT NULL | `in` / `out` |
| dest_vlan_id | INTEGER | NULL可 | 通信先のVLAN ID。NULLの場合は外部（インターネット）を表す |
| protocol | TEXT | | `tcp` / `udp` / `icmp` 等 |
| dest_port | TEXT | | ポート番号（例: `443`, `8080-8090`） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

Goアプリ起動時にこのテーブルからnftablesルールを再構築する。

### status の値

| 値 | 説明 | 遷移先 |
|---|---|---|
| `creating` | terraform apply実行中 | → `active` / `error` |
| `updating` | terraform apply（設定変更）実行中 | → `active` / `error` |
| `deleting` | terraform destroy実行中 | → レコード削除 / `error` |
| `active` | 作業完了、Proxmoxで稼働可能 | → `updating` / `deleting` / `error` |
| `error` | エラー発生 | → `creating`（retry時） |

`active` のVMの実際の状態（running/stopped/paused）は Proxmox API から取得する。
削除は `deleted_at` に日時を設定（論理削除）。全クエリは `WHERE deleted_at IS NULL` を基本とする。

### VLAN管理

- VLAN IDの割り当て可能範囲: 設定ファイルで定義（例: 100-200）
- ユーザー登録時（初回ログイン時）に自動で未使用のVLAN IDを割り当て
- サブネットは `10.{vlan_id}.0.0/24` で自動生成（カラムは持たない）
- 同時にUbuntu VM上にVLANインターフェースとnftablesルールを設定

### マイグレーション

```sql
-- 001_init.sql
CREATE TABLE users (
    id         SERIAL PRIMARY KEY,
    kratos_id  TEXT      UNIQUE NOT NULL,
    role       TEXT      NOT NULL DEFAULT 'user',
    vlan_id    INTEGER   UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE vms (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER   NOT NULL REFERENCES users(id),
    proxmox_vm_id  INTEGER   NOT NULL,
    node_name      TEXT      NOT NULL,
    tf_workdir     TEXT      NOT NULL,
    status         TEXT      NOT NULL DEFAULT 'creating',
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

CREATE TABLE network_rules (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action       TEXT      NOT NULL,
    direction    TEXT      NOT NULL,
    dest_vlan_id INTEGER,
    protocol     TEXT,
    dest_port    TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vms_user_id ON vms(user_id);
CREATE INDEX idx_vms_proxmox_vm_id ON vms(proxmox_vm_id);
CREATE INDEX idx_vms_deleted_at ON vms(deleted_at);
CREATE INDEX idx_network_rules_user_id ON network_rules(user_id);
```

## 5. API設計

### 共通仕様

- 認証: 全 `/api/*` エンドポイントは `requireLogin` ミドルウェア経由
- ユーザー特定: KratosセッションCookie → whoami API → `kratos_id` でDB検索
- レスポンス: JSON
- エラーレスポンス: `{"error": "message"}`
- 認可: 全操作で所有者チェックを実施（adminロールは全リソースにアクセス可能）
- 自動登録: `requireLogin` ミドルウェア内でKratosセッション→`users`テーブル自動登録+VLAN割り当てを透過的に実行
- 排他制御: start/stop/restart等の操作時にProxmox APIで現在状態を確認し、不正な状態遷移は `409 Conflict` を返す

### 認証・ユーザー

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `GET` | `/api/user` | ログイン中ユーザー情報 | 本人のみ |
| `POST` | `/logout` | ログアウト（Kratos連携） | — |

#### `GET /api/user`

```
Response 200:
{
  "id": 1,
  "kratos_id": "abc123-def456",
  "role": "user",
  "vlan_id": 100,
  "subnet": "10.100.0.0/24",
  "email": "user@example.com"
}
```

`subnet` は `vlan_id` から `10.{vlan_id}.0.0/24` として計算。`email` はKratos whoami APIから取得。
初回アクセス時は `requireLogin` ミドルウェア内で自動登録 + VLAN割り当てを実行。

### VM操作

#### terraform-exec で実装

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `POST` | `/api/vms` | VM作成 | user/admin |
| `DELETE` | `/api/vms/:id` | VM削除 | 所有者/admin |
| `PUT` | `/api/vms/:id` | VM設定変更（スペック） | 所有者/admin |

#### go-proxmox で実装

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `GET` | `/api/vms` | VM一覧 | 所有VM / adminは全VM |
| `GET` | `/api/vms/:id` | VM詳細 | 所有者/admin |
| `POST` | `/api/vms/:id/start` | 起動 | 所有者/admin |
| `POST` | `/api/vms/:id/stop` | 停止 | 所有者/admin |
| `POST` | `/api/vms/:id/restart` | 再起動 | 所有者/admin |
| `GET` | `/api/vms/:id/console` | VNCコンソール | 所有者/admin |

#### 非同期操作（一時・メモリ）

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `GET` | `/api/vms/:id/creation-status` | terraform実行中のログ・進捗 | 所有者/admin |
| `POST` | `/api/vms/:id/retry` | エラー状態のVMを再作成 | 所有者/admin |
| `POST` | `/api/vms/:id/cancel` | terraform実行中のプロセスをキャンセル | 所有者/admin |

### ネットワーク管理

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `GET` | `/api/network/rules` | ユーザーのファイアウォールルール一覧 | 本人/admin |
| `POST` | `/api/network/rules` | ファイアウォールルール追加 | admin |
| `DELETE` | `/api/network/rules/:id` | ファイアウォールルール削除 | admin |

nftables経由でVLAN間の通信制御を管理。

### 管理者API

| メソッド | パス | 説明 | 認可 |
|---|---|---|---|
| `GET` | `/api/admin/users` | 全ユーザー一覧 | admin |
| `GET` | `/api/admin/users/:id` | ユーザー詳細 | admin |
| `PUT` | `/api/admin/users/:id` | ユーザー設定変更（ロール等） | admin |
| `DELETE` | `/api/admin/users/:id` | ユーザー削除（VLAN解放） | admin |
| `GET` | `/api/admin/vms` | 全VM一覧 | admin |
| `GET` | `/api/admin/dashboard` | ダッシュボードデータ | admin |

### API詳細

#### `POST /api/vms` — VM作成

```
Request:
{
  "servername": "my-vm",
  "cpu": 2,
  "memory": 4096,
  "hdd": 20,
  "username": "ubuntu",
  "password": "s3cret",
  "runcmd": ["apt update", "apt install -y nginx"]
}

Response 202:
{
  "id": 1,
  "status": "creating"
}
```

フロー:
1. Kratosセッションからユーザー特定
2. ユーザーの `vlan_id` を取得
3. DBに `vms` レコード（`status=creating`）挿入
4. goroutineで terraform apply 実行（VLAN指定込み）
5. 完了後、`terraform output` で `proxmox_vm_id` を取得してDB更新（`status=active`）
6. フロントエンドは `POST` レスポンスの `id` を使い `/vms/new/status?id=1` に遷移 → `/api/vms/:id/creation-status` をポーリング

`runcmd` バリデーション: 最大10行・1行255文字以内。

Terraformテンプレートに渡す変数に `vlan_id` を追加:
```hcl
variable "vlan_id" {}
```

#### `GET /api/vms` — VM一覧

```
Response 200:
[
  {
    "id": 1,
    "proxmox_vm_id": 101,
    "node_name": "pve",
    "status": "active",
    "name": "my-vm",
    "vm_status": "running",
    "cpu": 0.5,
    "cpus": 2,
    "mem": 2147483648,
    "maxmem": 4294967296,
    "uptime": 86400,
    "ip": "10.100.0.2"
  }
]
```

DB から該当ユーザーの `vms`（`WHERE deleted_at IS NULL`）を取得 → `proxmox_vm_id` で go-proxmox から状態を取得して結合。
`status=creating` / `updating` のVMは Proxmox API を呼ばず、そのまま返す。

#### `GET /api/vms/:id` — VM詳細

```
Response 200:
{
  "id": 1,
  "proxmox_vm_id": 101,
  "node_name": "pve",
  "name": "my-vm",
  "status": "running",
  "cpu": 0.5,
  "cpus": 2,
  "maxcpu": 2,
  "mem": 2147483648,
  "maxmem": 4294967296,
  "disk": 10737418240,
  "maxdisk": 21474836480,
  "uptime": 86400,
  "netin": 1048576,
  "netout": 2097152,
  "config": {
    "cores": 2,
    "memory": 4096,
    "boot": "order=scsi0"
  },
  "ifs": [
    { "name": "eth0", "ip": "10.100.0.2" }
  ]
}
```

go-proxmox で `VirtualMachine` + `Config` + `AgentGetNetworkIFaces` を取得。

#### `PUT /api/vms/:id` — VM設定変更

```
Request:
{
  "cpu": 4,
  "memory": 8192
}

Response 202:
{
  "id": 1,
  "status": "updating"
}
```

Terraformでスペック変更を行う。DBのstatusを`updating`に変更 → goroutineでterraform apply → 完了後`active`に更新。フロントエンドは `/api/vms/:id/creation-status` で進捗をポーリング可能。

#### `DELETE /api/vms/:id` — VM削除

```
Response 202:
{
  "id": 1,
  "status": "active"
}
```

フロー（論理削除）:
1. DBから `tf_workdir` を取得、所有者チェック
2. goroutine で `terraform destroy` 実行
3. 完了後、`UPDATE vms SET deleted_at = datetime('now') WHERE id = ?`
4. workdir喪失時のフォールバック: go-proxmox で VM を強制削除 → `deleted_at` 設定

#### `POST /api/vms/:id/start` — 起動

```
Response 202:
{
  "task_id": "UPID:pve:00012345:..."
}
```

go-proxmox の `vm.Start(ctx)` を呼び出し。現在状態が `running` の場合は `409 Conflict` を返す。

#### `POST /api/vms/:id/stop` — 停止

```
Response 202:
{
  "task_id": "UPID:pve:00012345:..."
}
```

go-proxmox の `vm.Stop(ctx)` を呼び出し。現在状態が `stopped` の場合は `409 Conflict` を返す。

#### `POST /api/vms/:id/restart` — 再起動

```
Response 202:
{
  "task_id": "UPID:pve:00012345:..."
}
```

go-proxmox の `vm.Reboot(ctx)` を呼び出し。

#### `GET /api/vms/:id/console` — VNCコンソール

```
Response 200:
{
  "ws_url": "wss://<go-app>/api/vms/1/vnc",
  "ticket": "..."
}
```

ブラウザ→Goアプリ→ProxmoxのWebSocketプロキシ。Proxmoxに直接アクセスさせない。
go-proxmox の `vm.VNCProxy(ctx, config)` + `VNCWebSocket` を使用。

#### `GET /api/vms/:id/creation-status` — 作成進捗

```
Response 200:
{
  "id": 1,
  "status": "running(apply)",
  "log": "terraform apply output..."
}
```

メモリ上のジョブ情報から取得。`status=active` になったら Proxmox API を使う。
`id` はDBのVM id。フロントエンドは `POST /api/vms` のレスポンスから取得し `/vms/new/status?id=1` のようにURLパラメータで渡す。

#### `POST /api/network/rules` — ファイアウォールルール追加

```
Request:
{
  "action": "accept",
  "direction": "out",
  "dest_vlan_id": 101,
  "protocol": "tcp",
  "dest_port": "443"
}
```

nftablesルールを追加。VLAN間通信の許可/拒否を制御。

#### `POST /api/vms/:id/retry` — VM再作成

```
Response 202:
{
  "id": 1,
  "status": "creating"
}
```

`status=error` のVMのみ対象。DBのstatusを`creating`に戻し、goroutineでterraform applyを再実行。

#### `POST /api/vms/:id/cancel` — キャンセル

```
Response 200:
{
  "id": 1,
  "status": "error"
}
```

terraform実行中のプロセスをkill。DBのstatusを`error`に更新。ユーザーはretryで再作成可能。

#### `GET /api/admin/users/:id` — ユーザー詳細

```
Response 200:
{
  "id": 1,
  "kratos_id": "abc123-def456",
  "role": "user",
  "vlan_id": 100,
  "subnet": "10.100.0.0/24",
  "email": "user@example.com",
  "created_at": "2026-04-01T00:00:00Z",
  "vm_count": 3,
  "vms": [
    {"id": 1, "proxmox_vm_id": 101, "status": "active", "name": "my-vm"}
  ]
}
```

#### `GET /api/admin/dashboard` — 管理者ダッシュボード

```
Response 200:
{
  "total_users": 10,
  "total_vms": 25,
  "running_vms": 18,
  "vlans": {
    "used": 10,
    "available": 90
  },
  "resources": {
    "cpu_usage": 45.2,
    "memory_usage": 67.8,
    "storage_usage": 32.1
  }
}
```

## 6. データフロー

### VM作成フロー（VLAN込み）

```
ブラウザ                Go Server             Terraform        Proxmox      SQLite    nftables
  │                       │                      │                │            │          │
  │  POST /api/vms        │                      │                │            │          │
  │ ──────────────────────► │                      │                │            │          │
  │                       │  SELECT user(vlan_id) │                │            │          │
  │                       │ ────────────────────────────────────────────────────►          │
  │                       │  INSERT vms(creating) │                │            │          │
  │                       │ ────────────────────────────────────────────────────►          │
  │  202 {id,"creating"}  │                      │                │            │          │
  │ ◄────────────────────── │                      │                │            │          │
  │                       │  goroutine:           │                │            │          │
  │                       │  terraform init       │                │            │          │
  │                       │ ─────────────────────► │                │            │          │
  │                       │  terraform apply      │                │            │          │
  │                       │  (vlan_id=100)        │                │            │          │
  │                       │ ─────────────────────► │  create VM    │            │          │
  │                       │                      │  (VLAN 100)    │            │          │
  │                       │                      │ ────────────────►            │          │
  │                       │                      │  VM ID: 101    │            │          │
  │                       │                      │ ◄────────────────            │          │
  │                       │  output: vm_id=101   │                │            │          │
  │                       │ ◄───────────────────── │                │            │          │
  │                       │  UPDATE vms(active)   │                │            │          │
  │                       │ ────────────────────────────────────────────────────►          │
```

### VM一覧表示フロー

```
ブラウザ                Go Server             go-proxmox       Proxmox      SQLite
  │                       │                      │                │            │
  │  GET /api/vms         │                      │                │            │
  │ ──────────────────────► │                      │                │            │
  │                       │  SELECT vms WHERE user_id=? AND deleted_at IS NULL │  │
  │                       │ ────────────────────────────────────────────────────►
  │                       │                      │                │            │
  │                       │  VM status batch GET  │                │            │
  │                       │ ─────────────────────► │                │            │
  │                       │                      │ ────────────────►            │
  │                       │                      │  status,cpu,mem │            │
  │                       │                      │ ◄────────────────            │
  │                       │  結合して返却          │                │            │
  │  200 [{vm details}]   │                      │                │            │
  │ ◄────────────────────── │                      │                │            │
```

### VM削除フロー（論理削除）

```
ブラウザ                Go Server             Terraform        Proxmox      SQLite
  │                       │                      │                │            │
  │  DELETE /api/vms/1    │                      │                │            │
  │ ──────────────────────► │                      │                │            │
  │                       │  SELECT tf_workdir   │                │            │
  │                       │ ────────────────────────────────────────────────────►
  │                       │  所有者チェック        │                │            │
  │  202 {id,"active"}   │                      │                │            │
  │ ◄────────────────────── │                      │                │            │
  │                       │  goroutine:           │                │            │
  │                       │  terraform destroy    │                │            │
  │                       │ ─────────────────────► │  delete VM    │            │
  │                       │                      │ ────────────────►            │
  │                       │                      │ ◄────────────────            │
  │                       │  UPDATE deleted_at=now │               │            │
  │                       │ ────────────────────────────────────────────────────►
  │                       │                      │                │            │
  │                       │  ※ 失敗時フォールバック:                │            │
  │                       │  go-proxmox強制削除   │                │            │
  │                       │ ───────────────────────────────────────►            │
```

## 7. Terraform設定の拡張

### vm.tf への追加

```hcl
# VM ID の output
output "vm_id" {
  value = proxmox_virtual_environment_vm.vm.vm_id
}

# VLAN ID 変数
variable "vlan_id" {}
```

### ネットワーク設定の変更

```hcl
network_device {
  bridge  = "vmbr0"
  model   = "virtio"
  vlan_id = var.vlan_id   # ユーザーごとのVLAN
}
```

### cloud-init の拡張

```hcl
variable "runcmd" {
  default = ""
}
```

`cloud-config.yaml` で `runcmd` を反映。Goアプリ側でテンプレート変数として渡す。

## 8. 認証・認可フロー

### ユーザー登録フロー（初回ログイン時 — ミドルウェア内）

```
ブラウザ                Go Server             Ory Kratos        SQLite         nftables
  │                       │                      │                │              │
  │  GET /api/vms         │                      │                │              │
  │ ──────────────────────► │                      │                │              │
  │                       │  [requireLogin内]      │                │              │
  │                       │  whoami (Cookie)      │                │              │
  │                       │ ─────────────────────► │                │              │
  │                       │  200 {identity_id}    │                │              │
  │                       │ ◄───────────────────── │                │              │
  │                       │                      │                │              │
  │                       │  SELECT user(kratos_id)                │              │
  │                       │ ──────────────────────────────────────────►          │
  │                       │  0 rows (新規ユーザー) │                │              │
  │                       │                      │                │              │
  │                       │  INSERT user          │                │              │
  │                       │  + vlan_id割り当て     │                │              │
  │                       │ ──────────────────────────────────────────►          │
  │                       │                      │                │              │
  │                       │  VLAN IF作成 + nftables rules          │              │
  │                       │ ──────────────────────────────────────────────────────►
  │                       │                      │                │              │
  │  200 [vms...]         │                      │                │              │
  │ ◄────────────────────── │                      │                │              │
```

### 認可チェック

```go
func authorize(vm *VM, user *User) error {
    if user.Role == "admin" {
        return nil
    }
    if vm.UserID != user.ID {
        return ErrForbidden
    }
    return nil
}
```

## 9. 実装フェーズ

### Phase 1: 基盤

- [ ] SQLite導入 + マイグレーション
- [ ] ユーザー自動登録（初回ログイン時）
- [ ] `users` テーブルに `role`, `vlan_id`, `subnet` 追加
- [ ] VM作成時のDB永続化（`vms` テーブル）
- [ ] `vm.tf` に `vm_id` output 追加

### Phase 2: VM操作

- [ ] `GET /api/vms` ユーザーごとVM一覧（DB + go-proxmox）
- [ ] `GET /api/vms/:id` VM詳細
- [ ] `DELETE /api/vms/:id` terraform destroy
- [ ] `POST /api/vms/:id/start` go-proxmox
- [ ] `POST /api/vms/:id/stop` go-proxmox
- [ ] `POST /api/vms/:id/restart` go-proxmox
- [ ] 認可チェック（所有者 or admin）

### Phase 3: ネットワーク分離

- [ ] VLAN自動割り当てロジック
- [ ] nftables連携（VLAN IF作成・ルーティング）
- [ ] `vm.tf` に `vlan_id` 変数追加
- [ ] ファイアウォールルールAPI

### Phase 4: コンソール・cloud-init

- [ ] VNC WebSocketプロキシ
- [ ] cloud-init `runcmd` 対応
- [ ] VM設定変更API

### Phase 5: 管理者機能

- [ ] 管理者ダッシュボード
- [ ] ユーザー管理API
- [ ] 全VM管理
- [ ] ネットワーク管理UI

## 10. フロントエンド設計

### 共通レイアウト

全ページ共通のレイアウト構成。

```
┌──────────────────────────────────────────────────┐
│ Header                                            │
│ [Logo] Proxmox Console    [User Menu ▼] [Logout] │
├────────┬─────────────────────────────────────────┤
│        │                                          │
│  Nav   │          Main Content                    │
│        │                                          │
│ ▸ Home │                                          │
│ ▸ VMs  │                                          │
│ ▸ 設定 │                                          │
│        │                                          │
│ ──管理──│                                          │
│ ▸ 管理  │  (adminのみ表示)                         │
│ ▸ Users│                                          │
│ ▸ NW   │                                          │
│        │                                          │
└────────┴─────────────────────────────────────────┘
```

- **Header**: ロゴ、パンくず、ユーザーメニュー、ログアウト
- **Nav（左サイドバー）**: 現在のコンテキストに応じたナビゲーション
- **Main Content**: 各ページのコンテンツ

### ページ一覧と導線図

```
                          ┌──────────────┐
                          │  ログイン画面  │ ← Kratos UI
                          └──────┬───────┘
                                 │ ログイン成功
                                 ▼
                          ┌──────────────┐
                    ┌─────│ ダッシュボード │─────┐
                    │     └──────┬───────┘     │
                    │            │              │
                    ▼            ▼              ▼
             ┌──────────┐ ┌──────────┐  ┌───────────┐
             │ VM一覧    │ │ VM作成   │  │ ユーザー設定│
             │ /vms      │ │ /vms/new │  │ /settings  │
             └────┬─────┘ └────┬─────┘  └───────────┘
                  │            │
                  ▼            ▼
             ┌──────────┐ ┌──────────────┐
             │ VM詳細    │ │ 作成進捗      │
             │ /vms/:id  │ │ /vms/new/status│
             └────┬─────┘ └──────────────┘
                  │
                  ▼
             ┌──────────┐
             │ VNCコンソール│ (モーダル or 別タブ)
             └──────────┘

     ── adminのみ ──────────────────────────

             ┌──────────────┐
             │ 管理ダッシュボード│
             │ /admin        │
             └──┬──────┬────┘
                │      │
       ┌────────┘      └────────┐
       ▼                        ▼
  ┌──────────┐          ┌──────────────┐
  │ ユーザー管理│          │ 全VM管理      │
  │ /admin/users│         │ /admin/vms    │
  └────┬─────┘          └──────────────┘
       │
       ▼
  ┌──────────────┐    ┌──────────────┐
  │ ユーザー詳細   │    │ ネットワーク管理│
  │ /admin/users/:id│  │ /admin/network│
  └──────────────┘    └──────────────┘
```

### 各ページの表示内容

#### ダッシュボード `/`

ユーザーのホーム画面。システム全体の状況を一望できる。

| セクション | 内容 | データソース |
|---|---|---|
| 統計カード | VM稼働数、エラー数、処理中 | DB + go-proxmox |
| リソース使用量 | CPU/メモリ/ディスク使用率 | go-proxmox (Node.Status) |
| VM一覧テーブル | 名前、ステータス、IP、uptime、アクション | DB + go-proxmox |
| VM作成ボタン | → `/vms/new` | — |

**サイドバー Nav**: Home, VMs, 設定

#### VM一覧 `/vms`

ユーザーの全VM一覧。ダッシュボードから移動不要で操作できる一覧特化ページ。

| セクション | 内容 | アクション |
|---|---|---|
| フィルター | ステータス (running/stopped/all) | — |
| VMテーブル | 名前、ステータス、IP、CPU、メモリ、uptime | 行クリック→VM詳細 |
| 一括操作 | 選択VMの起動/停止 | go-proxmox |
| VM作成 | 作成ボタン | → `/vms/new` |

#### VM作成 `/vms/new` (ウィザード)

3ステップのウィザード形式。現状の resource.html → info.html を統合。

| ステップ | 内容 | 入力項目 |
|---|---|---|
| Step 1: リソース選択 | CPU/メモリ/HDDのスライダー | cpu, memory, hdd |
| Step 2: サーバー情報 | 名前・認証情報・初期コマンド | servername, username, password, runcmd(任意) |
| Step 3: 確認・作成 | 入力内容の確認 → 作成実行 | — |

作成実行後 → `/vms/new/status` に遷移。

#### VM作成進捗 `/vms/new/status`

terraform実行中の進捗表示。現状の status.html に相当。

| セクション | 内容 | データソース |
|---|---|---|
| ステータス | creating/init/apply/done/error | メモリ (creation-status API) |
| IPアドレス | 割り当てられたIP | メモリ → go-proxmox |
| Terraformログ | リアルタイムログ表示 (ANSI色付き) | メモリ (creation-status API) |
| アクション | 完了後→VM詳細へ、エラー時→再試行/戻る | — |

自動ポーリング（2秒間隔）。完了したらVM詳細へのボタンを表示。

#### VM詳細 `/vms/:id`

個別VMの管理画面。全操作の起点。

| セクション | 内容 | データソース |
|---|---|---|
| ヘッダー | VM名、ステータスバッジ、アクションボタン | go-proxmox |
| アクション | 起動/停止/再起動/削除/コンソール | go-proxmox / terraform-exec |
| 基本情報 | VM ID、VLAN、ノード、IP、uptime | DB + go-proxmox |
| リソースメーター | CPU/メモリ/ディスク/ネットワーク使用量 | go-proxmox |
| 設定情報 | CPUコア数、メモリ量、ディスクサイズ、ネットワークIF | go-proxmox (Config) |
| ネットワーク | IPアドレス一覧、VLAN情報 | go-proxmox (AgentGetNetworkIFaces) |
| コンソール | VNC接続ボタン → モーダルで開く | go-proxmox (VNCProxy) |

**アクションボタンの状態管理**:

| VM状態 | 起動 | 停止 | 再起動 | 削除 | コンソール |
|---|---|---|---|---|---|
| running | disabled | ● | ● | ● | ● |
| stopped | ● | disabled | disabled | ● | disabled |
| creating | disabled | disabled | disabled | disabled | disabled |

#### VNCコンソール (モーダル)

VM詳細から開くモーダルまたはフルスクリーン表示。

- Goアプリ経由のWebSocketプロキシでProxmoxに接続
- noVNCライブラリを使用してブラウザ上で描画
- 閉じるボタンで切断

#### ユーザー設定 `/settings`

ログインユーザーの情報表示。

| セクション | 内容 |
|---|---|
| プロフィール | メールアドレス（Kratos）、ロール |
| ネットワーク情報 | VLAN ID、サブネット、Gateway |
| VM利用状況 | VM数、リソース合計 |

---

### 管理者ページ（adminロールのみアクセス可能）

#### 管理ダッシュボード `/admin`

システム全体の概要。

| セクション | 内容 | データソース |
|---|---|---|
| 統計カード | 総ユーザー数、総VM数、稼働VM数、VLAN使用率 | DB + go-proxmox |
| リソース概要 | ProxmoxノードのCPU/メモリ/ディスク/ネットワーク | go-proxmox (Node) |
| 最近のアクティビティ | 最近作成/削除されたVM | DB |
| アラート | エラー状態のVM、VLAN枯渇警告 | DB + go-proxmox |

**サイドバー Nav**: 管理ダッシュボード, ユーザー管理, 全VM管理, ネットワーク管理

#### ユーザー管理 `/admin/users`

全ユーザーの一覧と管理。

| セクション | 内容 | アクション |
|---|---|---|
| ユーザーテーブル | 名前(メール)、ロール、VLAN ID、VM数、登録日 | 行クリック→ユーザー詳細 |
| フィルター | ロール (admin/user)、VM数 | — |
| 操作 | ロール変更、ユーザー削除 | admin API |

#### ユーザー詳細 `/admin/users/:id`

個別ユーザーの管理画面。

| セクション | 内容 |
|---|---|
| プロフィール | メール、ロール、登録日 |
| ネットワーク | VLAN ID、サブネット、nftablesルール |
| VM一覧 | そのユーザーの全VM（一覧ページと同形式） |
| 操作 | ロール変更、VLAN再割り当て、ユーザー削除 |

#### 全VM管理 `/admin/vms`

全ユーザーのVMを横断的に管理。

| セクション | 内容 | アクション |
|---|---|---|
| VMテーブル | 名前、所有ユーザー、ステータス、IP、ノード、VLAN | 行クリック→VM詳細 |
| フィルター | ユーザー、ステータス、ノード | — |
| 一括操作 | 選択VMの起動/停止/削除 | admin API |

#### ネットワーク管理 `/admin/network`

VLANとファイアウォールの管理。

| セクション | 内容 | アクション |
|---|---|---|
| VLAN一覧 | VLAN ID、割り当てユーザー、サブネット、VM数 | — |
| VLAN使用率 | 使用済み/総VLAN数のプログレスバー | — |
| ファイアウォールルール | 方向、送信元/先VLAN、プロトコル、ポート、アクション | 追加/削除 |

### ナビゲーション構造

```
一般ユーザーのNav:
  Home       → /
  VMs        → /vms
  設定       → /settings

管理者のNav (追加):
  ── 管理 ──
  ダッシュボード → /admin
  ユーザー      → /admin/users
  全VM         → /admin/vms
  ネットワーク  → /admin/network
```

- 現在のページをNavでハイライト
- 管理者セクションは `role=admin` の場合のみ表示
- パンくずリストで階層を表示（例: Dashboard > VMs > my-vm）

### ページ→APIの対応

| ページ | 使用するAPI |
|---|---|
| ダッシュボード `/` | `GET /api/user`, `GET /api/vms` |
| VM一覧 `/vms` | `GET /api/vms` |
| VM作成 `/vms/new` | `POST /api/vms` |
| VM作成進捗 `/vms/new/status` | `GET /api/vms/:id/creation-status` |
| VM詳細 `/vms/:id` | `GET /api/vms/:id`, `POST /api/vms/:id/start` etc. |
| VNCコンソール | `GET /api/vms/:id/console` (WebSocket) |
| ユーザー設定 `/settings` | `GET /api/user` |
| 管理ダッシュボード `/admin` | `GET /api/admin/dashboard` |
| ユーザー管理 `/admin/users` | `GET /api/admin/users` |
| ユーザー詳細 `/admin/users/:id` | `GET /api/admin/users/:id` |
| 全VM管理 `/admin/vms` | `GET /api/admin/vms` |
| ネットワーク管理 `/admin/network` | `GET /api/network/rules`, `POST /api/network/rules` |

## 11. 将来拡張

### ページネーション

一覧系API（`/api/vms`, `/api/admin/users`, `/api/admin/vms`）に `?page=1&limit=20` クエリパラメータを追加可能。レスポンスに `total` フィールドを含める設計を予約。

### マルチプロバイダ対応

`POST /api/vms` に `provider` パラメータを追加し、Terraformのディレクトリ・テンプレートを切り替える。

```
POST /api/vms
{
  "provider": "proxmox",
  "servername": "my-vm",
  ...
}
```

Terraformテンプレート構成:
```
terraform/
├── providers/
│   ├── proxmox/
│   │   ├── provider.tf
│   │   ├── variables.tf
│   │   └── vm.tf
│   └── aws/
│       ├── provider.tf
│       ├── variables.tf
│       └── vm.tf
```
