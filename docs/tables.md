# テーブル構成

## 設計方針

- VMのスペック（cpu/memory/hdd）はTerraformが管理するためDBに持たない
- VMの実行状態（running/stopped）はProxmox APIから取得するためDBに持たない
- Kratosが管理する情報（email, password等）はDBに重複させない
- ProxmoxのAPI認証情報は環境変数で管理（全ユーザー共通）

## Kratosが管理するPostgreSQL（アプリから直接触らない）

| フィールド | 型 | 備考 |
|---|---|---|
| user_id | UUID | Kratosが自動採番 |
| user_name | TEXT | traits |
| email | TEXT | traits |
| password | TEXT | Kratosがハッシュ化して管理 |

## アプリ用PostgreSQL（Kratosとは別コンテナ）

### usersテーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 内部ID |
| kratos_id | TEXT | UNIQUE, NOT NULL | Kratos identity ID |
| role | TEXT | NOT NULL, DEFAULT 'user' | `admin` / `user` |
| vlan_id | INTEGER | UNIQUE | 割り当て済みVLAN ID |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

サブネットは `vlan_id` から `10.{vlan_id}.0.0/24` で導出するためカラムを持たない。

### vmsテーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 内部ID |
| user_id | INTEGER | FK → users.id, NOT NULL | 所有ユーザー |
| proxmox_vm_id | INTEGER | NOT NULL | Proxmoxが割り当てたVM ID（go-proxmox呼び出しに使用） |
| node_name | TEXT | NOT NULL | 稼働ノード名（go-proxmoxはノード指定が必要） |
| tf_workdir | TEXT | NOT NULL | Terraform実行ディレクトリ（destroy/retry用） |
| status | TEXT | NOT NULL, DEFAULT 'creating' | `creating` / `updating` / `deleting` / `active` / `error` |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

削除時はレコードごと消す。

### network_rulesテーブル(将来)

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
