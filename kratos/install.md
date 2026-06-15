# Kratos / Docker Compose セットアップ

設定はルート直下の `.env` に集約しています。

```sh
cp .env.example .env
# .env を環境に合わせて編集
./scripts/render-config.sh
docker compose up
```

`./scripts/render-config.sh` は `.env` から `kratos/kratos.yaml` を生成します。

Terraform の `proxmox_endpoint` / `proxmox_username` / `node_name` などは、`.env` に定義した `TF_VAR_` 環境変数を Terraform が直接読み取ります。`terraform/proxmox.auto.tfvars` は作成・使用しません。

`kratos/kratos.yaml` は秘密情報や環境依存値を含むため、Git管理しません。
