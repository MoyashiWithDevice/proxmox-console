# Proxmox VE API - タスク・ジョブ管理

Proxmox APIの多くの操作（VM作成、起動、停止等）は非同期で実行され、UPID（Unique Process ID）が返る。

## UPID形式

```
UPID:{node}:{pid}:{starttime}:{pstart}:{type}:{id}:{user}:
```

例:
```
UPID:pve:00001234:56789012:65abc123:qmcreate:100:root@pam:
```

| フィールド | 説明 |
|---|---|
| `node` | 実行ノード |
| `pid` | プロセスID |
| `starttime` | 開始時刻（Unix timestamp） |
| `pstart` | プロセス開始時刻 |
| `type` | タスク種別（`qmcreate`, `qmstart`, `qmstop`, `vzcreate`等） |
| `id` | 対象ID（VMID等） |
| `user` | 実行ユーザー |

## タスク種別一覧

| UPID type | 説明 |
|---|---|
| `qmcreate` | QEMU VM作成 |
| `qmdestroy` | QEMU VM削除 |
| `qmstart` | QEMU VM起動 |
| `qmstop` | QEMU VM停止 |
| `qmreboot` | QEMU VM再起動 |
| `qmmigrate` | QEMU VMマイグレーション |
| `qmsnapshot` | QEMU スナップショット作成 |
| `vzcreate` | LXCコンテナ作成 |
| `vzdestroy` | LXCコンテナ削除 |
| `vzstart` | LXCコンテナ起動 |
| `vzstop` | LXCコンテナ停止 |
| `aptupdate` | APTアップデート |
| `vncproxy` | VNCプロキシ |

## ノードのタスク一覧

```
GET /api2/json/nodes/{node}/tasks
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `limit` | integer | 取得件数 |
| `start` | integer | オフセット |
| `userfilter` | string | ユーザーフィルタ |
| `vmid` | integer | VMIDフィルタ |
| `since` | integer | 開始日時（Unix timestamp） |
| `until` | integer | 終了日時（Unix timestamp） |
| `typefilter` | string | タスク種別フィルタ |
| `status` | string | ステータスフィルタ |

**レスポンス例**:

```json
{
  "data": [
    {
      "upid": "UPID:pve:00001234:56789012:65abc123:qmstart:100:root@pam:",
      "node": "pve",
      "pid": 1234,
      "pstart": 56789012,
      "starttime": 1706123456,
      "type": "qmstart",
      "id": "100",
      "user": "root@pam",
      "status": "OK",
      "endtime": 1706123460
    }
  ]
}
```

## タスクステータス取得

```
GET /api2/json/nodes/{node}/tasks/{upid}/status
```

**レスポンス例（完了）**:

```json
{
  "data": {
    "pid": 1234,
    "status": "OK",
    "exitstatus": "OK",
    "starttime": 1706123456,
    "endtime": 1706123460,
    "user": "root@pam",
    "upid": "UPID:pve:00001234:56789012:65abc123:qmstart:100:root@pam:",
    "type": "qmstart",
    "id": "100",
    "node": "pve"
  }
}
```

**ステータス値**:
- `OK` - 成功
- `running` - 実行中
- `stopped` - 停止
- `ERROR: ...` - エラー（エラーメッセージ付き）

## タスクログ取得

```
GET /api2/json/nodes/{node}/tasks/{upid}/log
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `limit` | integer | 取得行数 |
| `start` | integer | オフセット |

**レスポンス例**:

```json
{
  "data": [
    { "n": 1, "t": "TASK STARTED" },
    { "n": 2, "t": "starting VM" },
    { "n": 3, "t": "VM 100 started successfully" },
    { "n": 4, "t": "TASK OK" }
  ]
}
```

各エントリの `t` がログテキスト、`n` が行番号。

## タスク停止

```
DELETE /api2/json/nodes/{node}/tasks/{upid}
```

実行中のタスクをキャンセルする。

---

## 当プロジェクトでのタスク管理

現在の実装（`handler.go`）:

```go
// ジョブIDにタイムスタンプを使用
jobID := fmt.Sprintf("%d", time.Now().UnixNano())

// sync.Map でジョブ状態を管理
type Job struct {
    Status  string  // "running(init)", "running(apply)", "done", "error"
    Workdir string  // terraform実行ディレクトリ
    LogPath string  // ログファイルパス
    IP      string  // VM IPアドレス
}

// statusHandler でJSON形式でステータスを返却
// GET /status?id={jobID} → { status, ip, log }
```

### Goから直接APIを呼ぶ場合のタスク管理

VM作成APIを直接呼ぶ場合、UPIDが返るためポーリングで完了を待つ:

```go
func waitForTask(client *http.Client, node, upid string, timeout time.Duration) error {
    deadline := time.Now().Add(timeout)
    for time.Now().Before(deadline) {
        resp, _ := client.Get(
            fmt.Sprintf("https://pve:8006/api2/json/nodes/%s/tasks/%s/status", node, upid),
        )
        var result struct {
            Data struct {
                Status     string `json:"status"`
                ExitStatus string `json:"exitstatus"`
            } `json:"data"`
        }
        json.NewDecoder(resp.Body).Decode(&result)

        if result.Data.Status == "OK" {
            return nil
        }
        if strings.HasPrefix(result.Data.ExitStatus, "ERROR") {
            return fmt.Errorf("task failed: %s", result.Data.ExitStatus)
        }
        time.Sleep(2 * time.Second)
    }
    return fmt.Errorf("task timed out")
}
```
