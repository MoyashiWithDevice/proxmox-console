#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Proxmox Console 認証フローテストスクリプト
  アカウント作成／ログイン時の303リダイレクト＋ネットワークエラーを診断
.DESCRIPTION
  サービスが起動している前提で Kratos / Go Proxy の各エンドポイントを
  直接叩き、どの段階で問題が発生しているかを切り分けます。
#>

param(
    [string]$BaseUrl = "http://100.99.181.127:8080",
    [string]$KratosUrl = "http://100.99.181.127:4433",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Test-Endpoint($name, $url, $method="GET", $body=$null, $expectedStatus=200) {
    try {
        $params = @{
            Uri = $url
            Method = $method
            UseBasicParsing = $true
            TimeoutSec = 10
            MaximumRedirection = 0  # リダイレクトを手動制御
        }
        if ($body) {
            $params.Body = $body
        }
        $r = Invoke-WebRequest @params -ErrorAction SilentlyContinue
        $status = $r.StatusCode
        $ok = $status -eq $expectedStatus -or ($expectedStatus -eq -1 -and $status -in 200,302,303)
        $detail = ""
        if ($r.Headers.ContainsKey("Location")) {
            $detail = " -> $($r.Headers['Location'])"
        }
        if ($status -eq 303 -and $r.Headers.ContainsKey("Set-Cookie")) {
            $detail += " [Cookieあり]"
        }
        Write-Host "  $name`t$status $detail" -ForegroundColor $(if($ok){"Green"}else{"Red"})
        return $r
    } catch {
        Write-Host "  $name`tERROR: $_" -ForegroundColor Red
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Proxmox Console 認証フローテスト" -ForegroundColor Yellow
Write-Host "  App: $BaseUrl" -ForegroundColor Yellow
Write-Host "  Kratos: $KratosUrl" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# -------------------------------------------------------
# 1. 基本死活確認
# -------------------------------------------------------
Write-Step "1. サービス死活確認"
Test-Endpoint "App(/) " "$BaseUrl/" -expectedStatus -1
Test-Endpoint "Kratos/health" "$KratosUrl/health/alive" -expectedStatus -1

# -------------------------------------------------------
# 2. ログインフロー: Kratos → UIリダイレクトまで
# -------------------------------------------------------
Write-Step "2. ログインフロー開始"
$loginResp = Test-Endpoint "Login Init" "$KratosUrl/self-service/login/browser" -expectedStatus 303
if ($loginResp -and $loginResp.Headers.ContainsKey("Location")) {
    $loginFlowUrl = $loginResp.Headers['Location']
    Write-Host "  -> Kratos redirects to: $loginFlowUrl" -ForegroundColor Gray
    $cookiesFromKratos = $loginResp.Headers['Set-Cookie']
    if ($cookiesFromKratos) {
        Write-Host "  -> Set-Cookie (from Kratos): $($cookiesFromKratos -join ', ')" -ForegroundColor Gray
    }

    # Kratosからのリダイレクト先（Appの`/login?flow=ID`）をフォロー
    $flowResp = Test-Endpoint "Fetch Flow" $loginFlowUrl -expectedStatus 200
    if ($flowResp -and $flowResp.Content) {
        $contentType = $flowResp.Headers.'Content-Type'
        Write-Host "  -> Content-Type: $contentType" -ForegroundColor Gray
        # HTMLが返るはず（backend-rendered UI）
        if ($contentType -match "html") {
            Write-Host "  -> HTMLレンダリング形式: OK (バックエンドレンダリング)" -ForegroundColor Green
        }
    }
}

# -------------------------------------------------------
# 3. 登録フロー開始
# -------------------------------------------------------
Write-Step "3. 登録フロー開始"
$regResp = Test-Endpoint "Reg Init" "$KratosUrl/self-service/registration/browser" -expectedStatus 303
if ($regResp -and $regResp.Headers.ContainsKey("Location")) {
    $regFlowUrl = $regResp.Headers['Location']
    Write-Host "  -> Kratos redirects to: $regFlowUrl" -ForegroundColor Gray
    $cookiesFromKratos = $regResp.Headers['Set-Cookie']
    if ($cookiesFromKratos) {
        Write-Host "  -> Set-Cookie: $($cookiesFromKratos -join ', ')" -ForegroundColor Gray
    }

    $flowResp = Test-Endpoint "Fetch Reg Flow" $regFlowUrl -expectedStatus 200
}

# -------------------------------------------------------
# 4. proxyAuthHandler の直接テスト
# -------------------------------------------------------
Write-Step "4. Proxy エンドポイントの直接テスト"

# まずログインページを開いてcsrf_token + flow_idを入手
# (これはブラウザベースのレンダリングなので、実際のフロー値が必要)
$loginPageResp = Test-Endpoint "GET /login" "$BaseUrl/login" -expectedStatus -1
if ($loginPageResp -and $loginPageResp.StatusCode -eq 200) {
    Write-Host "  -> ログインページ取得: OK" -ForegroundColor Green
}

# -------------------------------------------------------
# 5. リダイレクトチェーン分析
# -------------------------------------------------------
Write-Step "5. リダイレクト追跡 (fetch redirect followシミュレーション)"
Write-Host @"
想定リダイレクトチェーン:
  1) Browser POST /api/auth/login  →  Proxy
  2) Proxy → Kratos (POST /self-service/login?flow=ID)
  3) Kratos returns 303 + Set-Cookie (ory_kratos_session)
  4) Proxy forwards 303 + Set-Cookie → Browser (fetch)
  5) fetch (redirect:follow) → GET / (dashboard)
  6) requireLogin → whoami → 200 → dashboard.html

エラーが発生しうる箇所:
  [A] Proxy→Kratos 間の接続 (BROWSERURL が内部ホスト名か外部IPか)
  [B] Kratos の戻り値が 303 以外 (422, 200, 500 等)
  [C] rewriteLocation で Location が壊れる
  [D] fetch がクロスオリジンリダイレクトをフォローできない (credentials問題)
  [E] Set-Cookie (ory_kratos_session) が fetch 経由でブラウザに保存されない
"@

# -------------------------------------------------------
# 6. rewriteLocation のテスト (Goコードを模倣)
# -------------------------------------------------------
Write-Step "6. rewriteLocation ロジック検証"
$testCases = @(
    @{Location="http://100.99.181.127:8080/"; Host="100.99.181.127:8080"; Desc="同一ホスト・同一ポート"},
    @{Location="http://100.99.181.127:8080/login"; Host="100.99.181.127:8080"; Desc="同一ホスト・パス違い"},
    @{Location="http://100.99.181.127:8080/"; Host="localhost:8080"; Desc="localhostアクセス時"},
    @{Location="http://100.99.181.127:4433/self-service/login"; Host="100.99.181.127:8080"; Desc="Kratos自身へのリダイレクト(未書き換え)"},
    @{Location="http://100.99.181.127:8080/?login=true"; Host="100.99.181.127:8080"; Desc="クエリ付き"},
    @{Location=""; Host="100.99.181.127:8080"; Desc="空Location"}
)

$kratosUiUrl = "http://100.99.181.127:8080"
$appUrl = "http://100.99.181.127:8080"

foreach ($tc in $testCases) {
    $loc = $tc.Location
    $hostHeader = $tc.Host
    $origin = "http://$hostHeader"

    if ([string]::IsNullOrEmpty($loc)) {
        $result = "/"
    } elseif ($loc -match "^https?://") {
        if ($loc.StartsWith($kratosUiUrl) -or $loc.StartsWith($appUrl)) {
            $trimmed = $loc -replace "^https?://[^/]+", ""
            if ($trimmed.StartsWith("/")) { $trimmed = $trimmed.Substring(1) }
            $result = $origin + $trimmed
            if ($result -eq "$origin/") { $result = $origin }
        } else {
            $result = $loc  # 書き換えなし
        }
    } else {
        $result = $loc
    }

    $crossOrigin = $false
    if ($result -match "^https?://[^/]+") {
        $resultHost = ($result -replace "^https?://([^/]+).*", '$1')
        if ($resultHost -ne $hostHeader) {
            $crossOrigin = $true
        }
    }

    $status = "OK"
    $color = "Green"
    if ($crossOrigin) {
        $status = "警告: クロスオリジン → fetchがエラーになる可能性"
        $color = "Yellow"
    }

    Write-Host "  [$($tc.Desc)]" -ForegroundColor Gray
    Write-Host "    Input:  Location=$($tc.Location), Host=$($tc.Host)" -ForegroundColor DarkGray
    Write-Host "    Output: $result  [$status]" -ForegroundColor $color
}

# -------------------------------------------------------
# 7. docker-compose 環境変数との整合性チェック
# -------------------------------------------------------
Write-Step "7. 設定値整合性チェック"
Write-Host "  APP_URL:         $BaseUrl" -ForegroundColor Gray
Write-Host "  KRATOS_BROWSER_URL: $KratosUrl (Go→Kratos間)" -ForegroundColor Gray
Write-Host "  KRATOS_UI_URL:   $BaseUrl (Kratosからのリダイレクト先)" -ForegroundColor Gray
Write-Host @"

確認ポイント:
  [1] KRATOS_BROWSER_URL は Go が Kratos と通信するためのURL
      Docker内 → http://kratos:4433
      .env → http://100.99.181.127:4433
      上記が正しいか確認

  [2] rewriteLocation は KRATOS_UI_URL or APP_URL で始まる
      Location のみ書き換える
      → Kratosが別ポート(4433)へリダイレクトする場合、書き換えられず
        クロスオリジンリダイレクトになる

  [3] fetch → 303 の flow で、credentials が same-origin のため
      クロスオリジンリダイレクト時にクッキーが送られない
      → auth.js で credentials: "include" が必要かも

  [4] proxyAuthHandler が Set-Cookie を転送しているが、
      fetchKratosFlow では Set-Cookie が無視されている
"@

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "  テスト完了" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
