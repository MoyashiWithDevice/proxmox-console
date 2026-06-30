<#
.SYNOPSIS
  Windows → リモート開発サーバへのデプロイ

.DESCRIPTION
  scripts/deploy-config.yaml の設定に従い:
  1. 現在のブランチを git push
  2. SSH でリモートサーバに接続 (plink.exe または Windows 標準 ssh.exe)
  3. 対象ブランチに切り替えて git pull
  4. rebuild-app.sh または rebuild.sh を実行

  設定項目 (deploy-config.yaml):
    server      - user@host
    password    - SSH パスワード (plink 使用時)
    identity    - 秘密鍵パス (ssh.exe 使用時、省略可)
    remote_path - リモートのプロジェクトパス
    mode        - "app" か "full"
    ssh_client  - "plink" / "ssh" / "auto" (デフォルト: auto)
#>

$ErrorActionPreference = "Stop"

# ---- 設定ファイルを読む ----
$scriptDir  = Split-Path -Parent $PSCommandPath
$configPath = Join-Path $scriptDir "deploy-config.yaml"

if (-not (Test-Path $configPath)) {
    Write-Error "設定ファイルが見つかりません: $configPath"
    exit 1
}

$config = @{}
Get-Content $configPath | ForEach-Object {
    if ($_ -match '^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*?)\s*$') {
        $config[$matches[1]] = $matches[2] -replace '^["'']|["'']$'
    }
}

$server      = if ($config.ContainsKey("server"))      { $config["server"] }      else { "u22@u22.tail324d28.ts.net" }
$password    = if ($config.ContainsKey("password"))    { $config["password"] }    else { $null }
$identity    = if ($config.ContainsKey("identity"))    { $config["identity"] }    else { $null }
$remotePath  = if ($config.ContainsKey("remote_path")) { $config["remote_path"] } else { "~/proxmox-console" }
$mode        = if ($config.ContainsKey("mode"))        { $config["mode"] }        else { "app" }
$sshClient   = if ($config.ContainsKey("ssh_client"))  { $config["ssh_client"] }  else { "auto" }

function log($msg) { Write-Host "  $msg" }
function done($msg) { Write-Host "  OK: $msg" -ForegroundColor Green }
function warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Yellow }
function fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# ---- 設定表示 ----
Write-Host "====== デプロイ設定 ======" -ForegroundColor Yellow
log "server:      $server"
log "auth:        $(
    if ($identity) { "鍵($identity)" }
    elseif ($password) { "パスワード" }
    else { "鍵(デフォルト)" }
)"
log "mode:        $mode"
log "remote_path: $remotePath"
log "ssh_client:  $sshClient"
Write-Host "==========================" -ForegroundColor Yellow

# ---- 到達性チェック ----
step "1. 到達性チェック"
$hostOnly = ($server -split "@")[-1]
try {
    $tn = Test-NetConnection -ComputerName $hostOnly -Port 22 -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($tn -ne $true) {
        fail "ポート22 に接続できません"
        exit 1
    }
    done "$hostOnly:22 接続可"
} catch {
    fail "到達不能: $_"
    exit 1
}

# ---- SSH クライアント選択 ----
step "2. SSH クライアント"
$usePlink = $false
if ($sshClient -eq "plink") { $usePlink = $true }
elseif ($sshClient -eq "auto" -and $password) { $usePlink = $true }
# ssh.exe は標準搭載確認
$sshPath = (Get-Command ssh -ErrorAction SilentlyContinue).Source

if ($usePlink) {
    $plinkPath = Join-Path $scriptDir "plink.exe"
    if (-not (Test-Path $plinkPath)) {
        log "plink.exe をダウンロード..."
        $urls = @(
            "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe",
            "https://chiark.greenend.org.uk/~sgtatham/putty/latest/w64/plink.exe"
        )
        $ok = $false
        foreach ($url in $urls) {
            try { Invoke-WebRequest -Uri $url -OutFile $plinkPath -UseBasicParsing -ErrorAction Stop; $ok = $true; break }
            catch { warn "$url から失敗" }
        }
        if (-not $ok) { Write-Error "plink.exe の入手に失敗"; exit 1 }
    }
    done "plink.exe"
} else {
    if (-not $sshPath) {
        warn "標準 ssh.exe が見つかりません → plink に fallback"
        $usePlink = $true
        $plinkPath = Join-Path $scriptDir "plink.exe"
        # plink ダウンロード
        if (-not (Test-Path $plinkPath)) {
            log "plink.exe をダウンロード..."
            $urls = @(
                "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe",
                "https://chiark.greenend.org.uk/~sgtatham/putty/latest/w64/plink.exe"
            )
            $ok = $false
            foreach ($url in $urls) {
                try { Invoke-WebRequest -Uri $url -OutFile $plinkPath -UseBasicParsing -ErrorAction Stop; $ok = $true; break }
                catch { warn "$url から失敗" }
            }
            if (-not $ok) { Write-Error "plink.exe の入手に失敗"; exit 1 }
        }
        done "plink.exe (fallback)"
    } else {
        done "ssh.exe ($sshPath)"
    }
}

# ---- ブランチ取得 ----
$branch = git rev-parse --abbrev-ref HEAD
if (-not $branch -or $branch -eq "HEAD") {
    Write-Error "ブランチが取得できません"
    exit 1
}
done "ブランチ: $branch"

# ---- git push ----
step "3. git push origin $branch"
git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Error "push 失敗"; exit 1 }
done "push 完了"

# ---- リモートコマンド ----
$rebuildScript = if ($mode -eq "full") { "./scripts/rebuild.sh" } else { "./scripts/rebuild-app.sh" }
$remoteCommands = @"
set -e
cd $remotePath
echo "[remote] project: `$(pwd)"
echo "[remote] branch: $branch"
git fetch origin
git checkout "$branch" 2>/dev/null || git checkout -b "$branch" origin/"$branch"
git pull origin "$branch"
echo "[remote] build: $rebuildScript"
bash $rebuildScript
echo "[remote] done"
"@

# ---- SSH 実行 ----
step "4. リモートデプロイ"

if ($usePlink) {
    # --- plink ---
    # 事前にホストキーを自動キャッシュ
    $testOut = & $plinkPath -ssh -pw $password $server "echo plink_ok" 2>&1
    $hostkey = $null
    if ($LASTEXITCODE -ne 0 -and $testOut -match '(SHA256:[A-Za-z0-9+/=]+)') {
        $hostkey = $Matches[1]
        warn "ホストキー未登録 → -hostkey $hostkey"
    }

    $args = @("-ssh", "-batch")
    if ($password) { $args += @("-pw", $password) }
    if ($hostkey)  { $args += @("-hostkey", $hostkey) }
    $args += @($server, $remoteCommands)

    log "接続中..."
    & $plinkPath @args
    $rc = $LASTEXITCODE
} else {
    # --- ssh.exe ---
    $tmpFile = Join-Path $env:TEMP "deploy-$(Get-Random).sh"
    Set-Content -Path $tmpFile -Value $remoteCommands -Encoding UTF8 -NoNewline

    $args = @(
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "LogLevel=ERROR"
    )
    if ($identity) { $args += @("-i", $identity) }
    $args += @($server, "-m", $tmpFile)

    log "接続中..."
    try { ssh @args 2>&1; $rc = $LASTEXITCODE }
    finally { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
}

if ($rc -ne 0) {
    Write-Error "リモートデプロイに失敗しました (exit: $rc)"
    exit 1
}

Write-Host "`n====== デプロイ完了 ($mode) ======" -ForegroundColor Green
done "対象: $server / $remotePath @ $branch"
