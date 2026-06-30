# deploy-remote.ps1 使い方

このスクリプトはあなたの端末専用です（git管理外）。

## 設定

scripts/deploy-config.yaml に書くだけ:

```yaml
server: u22@u22.tail324d28.ts.net
password: u22
remote_path: ~/proxmox-console
mode: app        # app=再起動のみ, full=全クリーンビルド
```

## 使い方

```powershell
# 変更を push してサーバ再起動 (超速)
.\scripts\deploy-remote.ps1

# 全クリーンビルドが必要なら config の mode を full に変更
```

- 初回のみ plink.exe を自動DLします（scripts/ に保存）
- 処理の流れ: git push → SSH(pull→checkout→rebuild)
