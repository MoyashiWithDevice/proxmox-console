# Proxmox Console - Frontend Refactoring 完了報告

## 解決した問題点

| 問題 | 対処 |
|------|------|
| React CDN直書き（全ページ） | Go html/template SSR に移行、React CDN削除 |
| auth_ui.go にReact SPAが埋め込み | templates/auth.html に分離（Kratos Flow動的レンダリング） |
| CSSがインライン style タグに直書き | static/css/* に全CSS外出し（8ファイル） |
| JSがインライン script タグに直書き | static/js/* に全JS外出し（8ファイル） |
| SVGアイコン重複（全ファイルに同一パス） | templates/_icon.html で19種の名前付きテンプレートに集約 |
| ログアウト/ヘッダー重複 | _base.html の page-header, dash-header パーシャルで共通化 |
| handler.go の構文エラー | chStateHandler のstruct初期化・if-else構文・型変換を修正 |

## 現在のアーキテクチャ

templates/  ← Go html/template（SSR）
  _base.html       共通HTML骨格 + reset.css link
  _icon.html       全19種SVGアイコン（名前付きテンプレート）
  auth.html        ログイン/登録/エラーページ
  dashboard.html   VM一覧 + ポーリング
  vm.html          VM詳細 + 編集 + ジョブ進捗 + サイドバー
  info.html / resource.html / support.html / terminal.html / error.html

static/
  css/     reset.css / auth.css / dashboard.css / vm.css / 他5ファイル
  js/      common.js / auth.js / dashboard.js / vm.js / 他5ファイル

cmd/proxmox-console/
  main.go          ルーティング + templateパース
  auth_ui.go       認証ハンドラ（template呼び出し）
  handler.go       APIハンドラ（構文エラー修正済）

## ルーティング

| パス | テンプレート | 認証 |
|------|-------------|------|
| / | dashboard.html | requireLogin |
| /vm /info /resource /support | 各テンプレート | requireLogin |
| /terminal | terminal.html (vmid) | requireLogin |
| /login /registration /error | auth.html | none |
| /error.html | static/error.html (互換) | none |
| /css/* /js/* | 静的ファイル | none |

## 残作業

- 実際のブラウザで全ページのピクセル一致確認
- 古い static/*.html の削除（確認後）
- 依存ライブラリの整理
