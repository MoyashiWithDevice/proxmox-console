# terraform-exec

https://github.com/hashicorp/terraform-exec

GoプログラムからTerraform CLIを操作するための公式ライブラリ。
`exec.Command("terraform", ...)` の代わりに型安全にTerraformを操作できる。

## インストール

```
go get github.com/hashicorp/terraform-exec/tfexec
```

関連パッケージ:
- `github.com/hashicorp/terraform-json` — TerraformのJSON出力型定義
- `github.com/hashicorp/hc-install` — Terraformバイナリの自動インストール

## Terraform struct

```go
type Terraform struct {
    execPath           string
    workingDir         string
    appendUserAgent    string
    disablePluginTLS   bool
    skipProviderVerify bool
    env                map[string]string
    stdout             io.Writer
    stderr             io.Writer
    logger             printfer
    log                string       // TF_LOG
    logCore            string       // TF_LOG_CORE
    logPath            string       // TF_LOG_PATH
    logProvider        string       // TF_LOG_PROVIDER
    waitDelay          time.Duration
    enableLegacyPipeClosing bool
}
```

### 初期化

```go
tf, err := tfexec.NewTerraform(workingDir, execPath)
```

- `workingDir` — Terraform設定ファイルのあるディレクトリ（空不可、存在必須）
- `execPath` — terraformバイナリのパス（空不可、hc-installや`os.LookPath`で取得推奨）
- デフォルト: `waitDelay=60s`, `logger=ioutil.Discard`, `env=nil`（os.Environをコピー）

### Terraformバイナリの自動インストール（hc-install使用）

```go
import (
    "github.com/hashicorp/go-version"
    "github.com/hashicorp/hc-install/product"
    "github.com/hashicorp/hc-install/releases"
)

installer := &releases.ExactVersion{
    Product: product.Terraform,
    Version: version.Must(version.NewVersion("1.7.0")),
}
execPath, err := installer.Install(context.Background())

tf, err := tfexec.NewTerraform(workingDir, execPath)
```

## Terraform struct 設定メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `SetEnv` | `(env map[string]string) error` | 環境変数の上書き。nilでos.Environをコピー。禁止変数設定時は`ErrManualEnvVar`を返す |
| `SetLogger` | `(logger printfer)` | ロガー設定（`Printf(format string, v ...interface{})`を実装するもの） |
| `SetStdout` | `(w io.Writer)` | 全コマンドのstdoutストリーミング先 |
| `SetStderr` | `(w io.Writer)` | 全コマンドのstderrストリーミング先 |
| `SetLog` | `(log string) error` | TF_LOGの設定。Terraform 0.15.0以降が必要 |
| `SetLogCore` | `(logCore string) error` | TF_LOG_COREの設定。0.15.0以降が必要 |
| `SetLogPath` | `(path string) error` | TF_LOG_PATHの設定。log/logCore/logProviderが未設定なら自動で`TRACE` |
| `SetLogProvider` | `(logProvider string) error` | TF_LOG_PROVIDERの設定。0.15.0以降が必要 |
| `SetAppendUserAgent` | `(ua string)` | TF_APPEND_USER_AGENTの設定 |
| `SetDisablePluginTLS` | `()` | TF_DISABLE_PLUGIN_TLSの設定 |
| `SetSkipProviderVerify` | `()` | TF_SKIP_PROVIDER_VERIFYの設定 |
| `SetWaitDelay` | `(delay time.Duration)` | exec.CmdのWaitDelayの設定 |
| `SetEnableLegacyPipeClosing` | `()` | stdout/stderrパイプをWait前に閉じる（レガシー対応） |
| `WorkingDir` | `() string` | ワーキングディレクトリ取得 |
| `ExecPath` | `() string` | バイナリパス取得 |

### 禁止環境変数（SetEnvで設定不可）

- `TF_APPEND_USER_AGENT`
- `TF_IN_AUTOMATION`
- `TF_INPUT`
- `TF_LOG`
- `TF_LOG_PATH`
- `TF_REATTACH_PROVIDERS`
- `TF_DISABLE_PLUGIN_TLS`
- `TF_SKIP_PROVIDER_VERIFY`

## オプション型（全コマンド共通）

すべてのオプションはコンストラクタ関数で生成する。

### コンストラクタ一覧

| コンストラクタ | 戻り型 | 対応フラグ | 説明 |
|---------------|--------|-----------|------|
| `AllowDeferral(bool)` | `*AllowDeferralOption` | `-allow-deferral` | 実験的機能（1.9.0以降・alpha/devビルドのみ） |
| `AllowMissing(bool)` | `*AllowMissingOption` | `-allow-missing` | リソース不在時のエラー無視 |
| `AllowMissingConfig(bool)` | `*AllowMissingConfigOption` | `-allow-missing-config` | 設定不在時のエラー無視（Import用） |
| `Backend(bool)` | `*BackendOption` | `-backend` | バックエンドの有効/無効 |
| `BackendConfig(string)` | `*BackendConfigOption` | `-backend-config` | バックエンド設定ファイルパス（複数可） |
| `Backup(string)` | `*BackupOption` | `-backup` | バックアップファイルパス |
| `DisableBackup()` | `*BackupOption` | `-backup=-` | バックアップ無効化 |
| `BackupOut(string)` | `*BackupOutOption` | `-backup-out` | バックアップ出力先 |
| `Config(string)` | `*ConfigOption` | `-config` | 設定ディレクトリパス（Import用） |
| `CopyState(string)` | `*CopyStateOption` | `-state` | ワークスペース新規作成時にコピーするstate |
| `Dir(string)` | `*DirOption` | 位置引数 | ディレクトリパス |
| `DirOrPlan(string)` | `*DirOrPlanOption` | 位置引数 | ディレクトリまたはプランファイルパス |
| `Destroy(bool)` | `*DestroyFlagOption` | `-destroy` | 削除プラン（Plan用）または削除適用（Apply用）。0.15.2以降 |
| `DrawCycles(bool)` | `*DrawCyclesOption` | `-draw-cycles` | グラフにサイクルを描画。0.5.0以降 |
| `DryRun(bool)` | `*DryRunOption` | `-dry-run` | ドライラン（StateMv/StateRm用） |
| `Force(bool)` | `*ForceOption` | `-force` | 強制実行 |
| `ForceCopy(bool)` | `*ForceCopyOption` | `-force-copy` | state移行時の強制コピー（Init用） |
| `FromModule(string)` | `*FromModuleOption` | `-from-module` | モジュールソース（Init用） |
| `FSMirror(string)` | `*FSMirrorOption` | `-fs-mirror` | ファイルシステムミラーディレクトリ |
| `GenerateConfigOut(string)` | `*GenerateConfigOutOption` | `-generate-config-out` | 設定ファイル自動生成先（Plan用）。1.5.0以降 |
| `Get(bool)` | `*GetOption` | `-get` | モジュールダウンロードの有効/無効 |
| `GetPlugins(bool)` | `*GetPluginsOption` | `-get-plugins` | プラグインダウンロード（0.15.0以前のみ） |
| `GraphPlan(string)` | `*GraphPlanOption` | `-plan` | プランファイル指定（Graph用）。0.15.0以降は`-plan=`、以前は位置引数 |
| `JSONNumber(bool)` | `*UseJSONNumberOption` | — | JSON数値のデコード方法（Show用） |
| `Lock(bool)` | `*LockOption` | `-lock` | stateロック。0.15.0以前のみ（Init）、全バージョン（その他） |
| `LockFile(bool)` | `*LockFileOption` | `-lock-file` | ロックファイルモード |
| `LockTimeout(string)` | `*LockTimeoutOption` | `-lock-timeout` | ロックタイムアウト（例: `"10s"`） |
| `NetMirror(string)` | `*NetMirrorOption` | `-net-mirror` | ネットワークミラーURL |
| `Out(string)` | `*OutOption` | `-out` | プランファイル出力先 |
| `Parallelism(int)` | `*ParallelismOption` | `-parallelism` | 並列度（デフォルト10） |
| `Platform(string)` | `*PlatformOption` | `-platform` | プラットフォーム指定（os_arch） |
| `PluginDir(string)` | `*PluginDirOption` | `-plugin-dir` | プラグインディレクトリ（複数可） |
| `Provider(string)` | `*ProviderOption` | 位置引数 | プロバイダーソースアドレス |
| `Reattach(ReattachInfo)` | `*ReattachOption` | `TF_REATTACH_PROVIDERS` | プロバイダー再アタッチ情報 |
| `Reconfigure(bool)` | `*ReconfigureOption` | `-reconfigure` | バックエンド再設定（Init用） |
| `Recursive(bool)` | `*RecursiveOption` | `-recursive` | 再帰的処理（Format用）。0.12.0以降 |
| `Refresh(bool)` | `*RefreshOption` | `-refresh` | 事前リフレッシュ |
| `RefreshOnly(bool)` | `*RefreshOnlyOption` | `-refresh-only` | リフレッシュ専用モード。0.15.4以降 |
| `Replace(string)` | `*ReplaceOption` | `-replace` | リソースの強制置き換え（複数可）。0.15.2以降 |
| `State(string)` | `*StateOption` | `-state` | stateファイルパス |
| `StateOut(string)` | `*StateOutOption` | `-state-out` | state出力先 |
| `Target(string)` | `*TargetOption` | `-target` | ターゲットリソース（複数可） |
| `TestsDirectory(string)` | `*TestsDirectoryOption` | `-tests-directory` | テストディレクトリ |
| `GraphType(string)` | `*GraphTypeOption` | `-type` | グラフタイプ。0.8.0以降 |
| `Update(bool)` | `*UpdateOption` | `-update` | アップデート |
| `Upgrade(bool)` | `*UpgradeOption` | `-upgrade` | プラグインアップグレード |
| `Var(string)` | `*VarOption` | `-var` | 変数の直接指定（例: `"foo=bar"`、複数可） |
| `VarFile(string)` | `*VarFileOption` | `-var-file` | .tfvarsファイルパス（複数可） |
| `VerifyPlugins(bool)` | `*VerifyPluginsOption` | `-verify-plugins` | プラグイン署名検証（0.15.0以前のみ） |

### ReattachInfo / ReattachConfig

```go
type ReattachInfo map[string]ReattachConfig

type ReattachConfig struct {
    Protocol        string
    ProtocolVersion int
    Pid             int
    Test            bool
    Addr            ReattachConfigAddr
}

type ReattachConfigAddr struct {
    Network string
    String  string
}
```

## コマンド一覧

### Init

```go
err := tf.Init(ctx, tfexec.Upgrade(true))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Init` | `(ctx context.Context, opts ...InitOption) error` | `terraform init` |
| `InitJSON` | `(ctx context.Context, w io.Writer, opts ...InitOption) error` | `terraform init -json`。1.9.0以降 |

**利用可能オプション**: `Backend`, `BackendConfig`, `Dir`, `ForceCopy`, `FromModule`, `Get`, `GetPlugins`, `Lock`, `LockTimeout`, `PluginDir`, `Reattach`, `Reconfigure`, `Upgrade`, `VerifyPlugins`

**デフォルト値**: `backend=true`, `forceCopy=false`, `get=true`, `getPlugins=true`, `lock=true`, `lockTimeout="0s"`, `reconfigure=false`, `upgrade=false`, `verifyPlugins=true`

### Plan

```go
hasChanges, err := tf.Plan(ctx, tfexec.VarFile("runtime.tfvars"))
// hasChanges: false = 変更なし, true = 変更あり
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Plan` | `(ctx context.Context, opts ...PlanOption) (bool, error)` | `terraform plan`。変更あり=true、なし=false |
| `PlanJSON` | `(ctx context.Context, w io.Writer, opts ...PlanOption) (bool, error)` | `terraform plan -json`。0.15.3以降 |

**利用可能オプション**: `AllowDeferral`, `Destroy`, `Dir`, `GenerateConfigOut`, `Lock`, `LockTimeout`, `Out`, `Parallelism`, `Reattach`, `Refresh`, `RefreshOnly`, `Replace`, `State`, `Target`, `Var`, `VarFile`

**デフォルト値**: `destroy=false`, `lock=true`, `lockTimeout="0s"`, `parallelism=10`, `refresh=true`

終了コード: 0 = 変更なし, 2 = 変更あり（trueを返す）, その他 = エラー

### Apply

```go
err := tf.Apply(ctx, tfexec.VarFile("runtime.tfvars"))
// プランファイルから適用
err := tf.Apply(ctx, tfexec.DirOrPlan("tfplan"))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Apply` | `(ctx context.Context, opts ...ApplyOption) error` | `terraform apply -auto-approve` |
| `ApplyJSON` | `(ctx context.Context, w io.Writer, opts ...ApplyOption) error` | `terraform apply -json`。0.15.3以降 |

**利用可能オプション**: `AllowDeferral`, `Backup`, `Destroy`, `DirOrPlan`, `Lock`, `LockTimeout`, `Parallelism`, `Reattach`, `Refresh`, `RefreshOnly`, `Replace`, `State`, `StateOut`, `Target`, `Var`, `VarFile`

**デフォルト値**: `destroy=false`, `lock=true`, `parallelism=10`, `refresh=true`

### Destroy

```go
err := tf.Destroy(ctx, tfexec.Target("module.vm"))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Destroy` | `(ctx context.Context, opts ...DestroyOption) error` | `terraform destroy -auto-approve` |
| `DestroyJSON` | `(ctx context.Context, w io.Writer, opts ...DestroyOption) error` | `terraform destroy -json`。0.15.3以降 |

**利用可能オプション**: `Backup`, `Dir`, `Lock`, `LockTimeout`, `Parallelism`, `Reattach`, `Refresh`, `State`, `StateOut`, `Target`, `Var`, `VarFile`

**デフォルト値**: `lock=true`, `lockTimeout="0s"`, `parallelism=10`, `refresh=true`

### Output

```go
outputs, err := tf.Output(ctx)
// outputs: map[string]OutputMeta

type OutputMeta struct {
    Sensitive bool            `json:"sensitive"`
    Type      json.RawMessage `json:"type"`
    Value     json.RawMessage `json:"value"`
}
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Output` | `(ctx context.Context, opts ...OutputOption) (map[string]OutputMeta, error)` | `terraform output -json` |

**利用可能オプション**: `State`

### Show

```go
// 現在のstate
state, err := tf.Show(ctx)

// stateファイル
state, err := tf.ShowStateFile(ctx, "terraform.tfstate")

// プランファイル（JSON）
plan, err := tf.ShowPlanFile(ctx, "tfplan")

// プランファイル（人間可読）
raw, err := tf.ShowPlanFileRaw(ctx, "tfplan")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Show` | `(ctx context.Context, opts ...ShowOption) (*tfjson.State, error)` | デフォルトstateの表示。0.12.0以降 |
| `ShowStateFile` | `(ctx context.Context, statePath string, opts ...ShowOption) (*tfjson.State, error)` | stateファイルの表示 |
| `ShowPlanFile` | `(ctx context.Context, planPath string, opts ...ShowOption) (*tfjson.Plan, error)` | プランファイルをJSONで表示 |
| `ShowPlanFileRaw` | `(ctx context.Context, planPath string, opts ...ShowOption) (string, error)` | プランファイルを人間可読形式で表示 |

**利用可能オプション**: `JSONNumber`, `Reattach`

### Import

```go
err := tf.Import(ctx, "aws_instance.example", "i-abc12345")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Import` | `(ctx context.Context, address, id string, opts ...ImportOption) error` | `terraform import` |

**利用可能オプション**: `AllowMissingConfig`, `Backup`, `Config`, `Lock`, `LockTimeout`, `Reattach`, `State`, `StateOut`, `Var`, `VarFile`

**デフォルト値**: `allowMissingConfig=false`, `lock=true`, `lockTimeout="0s"`

### Validate

```go
result, err := tf.Validate(ctx)
// result: *tfjson.ValidateOutput
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Validate` | `(ctx context.Context) (*tfjson.ValidateOutput, error)` | `terraform validate -json`。0.12.0以降 |

### Version

```go
tfVersion, providerVersions, err := tf.Version(ctx, false)
// tfVersion: *version.Version
// providerVersions: map[string]*version.Version
// skipCache=false でキャッシュ利用、true で再取得
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Version` | `(ctx context.Context, skipCache bool) (*version.Version, map[string]*version.Version, error)` | `terraform version -json` |

### Graph

```go
graphStr, err := tf.Graph(ctx, tfexec.GraphType("plan"))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Graph` | `(ctx context.Context, opts ...GraphOption) (string, error)` | `terraform graph` |

**利用可能オプション**: `DrawCycles`, `GraphPlan`, `GraphType`

### Refresh

```go
err := tf.Refresh(ctx, tfexec.VarFile("runtime.tfvars"))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Refresh` | `(ctx context.Context, opts ...RefreshCmdOption) error` | `terraform refresh` |
| `RefreshJSON` | `(ctx context.Context, w io.Writer, opts ...RefreshCmdOption) error` | `terraform refresh -json`。0.15.3以降 |

**利用可能オプション**: `Backup`, `Dir`, `Lock`, `LockTimeout`, `Reattach`, `State`, `StateOut`, `Target`, `Var`, `VarFile`

**デフォルト値**: `lock=true`, `lockTimeout="0s"`

### StateMv

```go
err := tf.StateMv(ctx, "aws_instance.old", "aws_instance.new")
// ドライラン
err := tf.StateMv(ctx, "aws_instance.old", "aws_instance.new", tfexec.DryRun(true))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `StateMv` | `(ctx context.Context, source, destination string, opts ...StateMvCmdOption) error` | `terraform state mv` |

**利用可能オプション**: `Backup`, `BackupOut`, `DryRun`, `Lock`, `LockTimeout`, `State`, `StateOut`

**デフォルト値**: `lock=true`, `lockTimeout="0s"`

### StateRm

```go
err := tf.StateRm(ctx, "aws_instance.example")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `StateRm` | `(ctx context.Context, address string, opts ...StateRmCmdOption) error` | `terraform state rm` |

**利用可能オプション**: `Backup`, `BackupOut`, `DryRun`, `Lock`, `LockTimeout`, `State`, `StateOut`

**デフォルト値**: `lock=true`, `lockTimeout="0s"`

### StatePull

```go
stateStr, err := tf.StatePull(ctx)
// stateStr: string（JSON形式のstate）
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `StatePull` | `(ctx context.Context, opts ...StatePullOption) (string, error)` | `terraform state pull` |

**利用可能オプション**: `Reattach`

### StatePush

```go
err := tf.StatePush(ctx, "/path/to/state")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `StatePush` | `(ctx context.Context, path string, opts ...StatePushCmdOption) error` | `terraform state push` |

**利用可能オプション**: `Force`, `Lock`, `LockTimeout`

**デフォルト値**: `lock=false`, `lockTimeout="0s"`

### Taint

```go
err := tf.Taint(ctx, "aws_instance.example")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Taint` | `(ctx context.Context, address string, opts ...TaintOption) error` | `terraform taint`。0.4.1以降 |

**利用可能オプション**: `AllowMissing`, `Lock`, `LockTimeout`, `State`

**デフォルト値**: `allowMissing=false`, `lock=true`

### Untaint

```go
err := tf.Untaint(ctx, "aws_instance.example")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Untaint` | `(ctx context.Context, address string, opts ...UntaintOption) error` | `terraform untaint`。0.6.13以降 |

**利用可能オプション**: `AllowMissing`, `Lock`, `LockTimeout`, `State`

**デフォルト値**: `allowMissing=false`, `lock=true`

### ForceUnlock

```go
err := tf.ForceUnlock(ctx, "lock-id-hex")
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `ForceUnlock` | `(ctx context.Context, lockID string, opts ...ForceUnlockOption) error` | `terraform force-unlock -force` |

**利用可能オプション**: `Dir`（0.15.0以前のみ）

### Format

```go
// 文字列のフォーマット
formatted, err := tf.FormatString(ctx, content)

// io.Reader→io.Writer のフォーマット
err := tf.Format(ctx, reader, writer)

// ファイルを直接フォーマット（上書き）
err := tf.FormatWrite(ctx, tfexec.Recursive(true))

// フォーマットチェック
ok, unformatted, err := tf.FormatCheck(ctx)
// ok: true = 整形済み, false = 未整形ファイルあり

// パッケージ関数（execPath指定）
formatted, err := tfexec.FormatString(ctx, execPath, content)
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Format` | `(ctx context.Context, unformatted io.Reader, formatted io.Writer) error` | `terraform fmt`。0.7.7以降 |
| `FormatString` | `(ctx context.Context, content string) (string, error)` | 文字列をフォーマット |
| `FormatString` (pkg) | `(ctx context.Context, execPath string, content string) (string, error)` | パッケージレベル関数 |
| `FormatWrite` | `(ctx context.Context, opts ...FormatOption) error` | ファイルを上書きフォーマット |
| `FormatCheck` | `(ctx context.Context, opts ...FormatOption) (bool, []string, error)` | フォーマットチェック。`(整形済み, 未整形ファイル一覧, エラー)` |

**利用可能オプション**: `Dir`, `Recursive`

### Query

```go
messages, err := tf.QueryJSON(ctx)
// messages: iter.Seq[NextMessage]
for msg := range messages {
    // メッセージを処理
}
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `QueryJSON` | `(ctx context.Context, opts ...QueryOption) (iter.Seq[NextMessage], error)` | `terraform query -json`。1.14.0以降 |

**利用可能オプション**: `Dir`, `GenerateConfigOut`, `Reattach`, `Var`, `VarFile`

### Test

```go
err := tf.Test(ctx, w, tfexec.TestsDirectory("tests/"))
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Test` | `(ctx context.Context, w io.Writer, opts ...TestOption) error` | `terraform test -json`。1.6.0以降 |

**利用可能オプション**: `TestsDirectory`

### Workspace操作

```go
// 作成
err := tf.WorkspaceNew(ctx, "staging")

// 切り替え
err := tf.WorkspaceSelect(ctx, "staging")

// 削除
err := tf.WorkspaceDelete(ctx, "staging")
// 強制削除
err := tf.WorkspaceDelete(ctx, "staging", tfexec.Force(true))

// 現在のワークスペース名
name, err := tf.WorkspaceShow(ctx)

// 一覧
workspaces, current, err := tf.WorkspaceList(ctx)
// workspaces: []string, current: string
```

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `WorkspaceNew` | `(ctx context.Context, workspace string, opts ...WorkspaceNewCmdOption) error` | ワークスペース作成 |
| `WorkspaceSelect` | `(ctx context.Context, workspace string, opts ...WorkspaceSelectOption) error` | ワークスペース切り替え |
| `WorkspaceDelete` | `(ctx context.Context, workspace string, opts ...WorkspaceDeleteCmdOption) error` | ワークスペース削除 |
| `WorkspaceShow` | `(ctx context.Context, opts ...WorkspaceShowOption) (string, error)` | 現在のワークスペース名。0.10.0以降 |
| `WorkspaceList` | `(ctx context.Context, opts ...WorkspaceListOption) ([]string, string, error)` | ワークスペース一覧とカレント |

**WorkspaceNew オプション**: `CopyState`, `Lock`, `LockTimeout`, `Reattach`（Lock/LockTimeoutは0.12.0以降）

**WorkspaceSelect オプション**: `Reattach`

**WorkspaceDelete オプション**: `Force`, `Lock`, `LockTimeout`, `Reattach`（Lock/LockTimeoutは0.12.0以降）

**WorkspaceShow オプション**: `Reattach`

**WorkspaceList オプション**: `Reattach`

## エラー型

| 型 | 説明 |
|----|------|
| `ErrNoSuitableBinary` | execPathが空の場合 |
| `ErrManualEnvVar` | 禁止環境変数をSetEnvで設定した場合 |
| `ErrVersionMismatch` | Terraformバージョンがコマンド/オプションの要件を満たさない場合 |

`ErrVersionMismatch` のフィールド:
```go
type ErrVersionMismatch struct {
    MinInclusive string
    MaxExclusive string
    Actual       string
}
```

## バージョン互換性要件（主要コマンド）

| コマンド/オプション | 最低バージョン | 備考 |
|-------------------|-------------|------|
| `Validate` | 0.12.0 | `-json`フラグ |
| `Show` | 0.12.0 | `-json`フラグ |
| `WorkspaceShow` | 0.10.0 | — |
| `Format` | 0.7.7 | — |
| `Format Recursive` | 0.12.0 | `-recursive` |
| `Taint` | 0.4.1 | — |
| `Untaint` | 0.6.13 | — |
| `Graph DrawCycles` | 0.5.0 | `-draw-cycles` |
| `Graph GraphType` | 0.8.0 | `-type` |
| `PlanJSON` | 0.15.3 | `-json` |
| `ApplyJSON` | 0.15.3 | `-json` |
| `DestroyJSON` | 0.15.3 | `-json` |
| `RefreshJSON` | 0.15.3 | `-json` |
| `Replace` (Plan/Apply) | 0.15.2 | `-replace` |
| `Destroy` (Plan flag) | 0.15.2 | `-destroy` |
| `RefreshOnly` | 0.15.4 | `-refresh-only` |
| `GenerateConfigOut` | 1.5.0 | `-generate-config-out` |
| `Test` | 1.6.0 | — |
| `InitJSON` | 1.9.0 | `-json` |
| `AllowDeferral` | 1.9.0 | alpha/devビルドのみ |
| `QueryJSON` | 1.14.0 | — |

## 現在のプロジェクトからの移行イメージ

現在のコード:
```go
initCmd := exec.Command("terraform", "init")
initCmd.Dir = workdir
out, err := runCmdWithLog(initCmd, logFile)
```

移行後:
```go
tf, err := tfexec.NewTerraform(workdir, terraformPath)
if err != nil {
    return err
}

logFile, _ := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY, 0644)
tf.SetStdout(logFile)
tf.SetStderr(logFile)

err = tf.Init(ctx, tfexec.Upgrade(true))
err = tf.Apply(ctx, tfexec.VarFile("runtime.tfvars"))

outputs, err := tf.Output(ctx)
// json.RawMessageとして取得
```

## 注意点

- v1.0.0未満のため、マイナーバージョンアップで破壊的変更の可能性あり
- Terraform v1.x 推奨（v0.12以降はベストエフォート）
- Go 1.24以降が必要（`iter.Seq`を使用するため）
- `SetEnv` で禁止環境変数を設定すると `ErrManualEnvVar` エラー
- `QueryJSON` はGo 1.24のrange over func機能（`iter.Seq`）を使用
