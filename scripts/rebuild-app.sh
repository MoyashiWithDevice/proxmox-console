#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/.."

NO_CACHE="${NO_CACHE:-}"
set -e
git pull
set +e

echo "=== app イメージを再ビルド ==="
if [ -n "$NO_CACHE" ]; then
  echo "（--no-cache 有効）"
  docker compose build --no-cache app
else
  docker compose build app
fi

echo "=== app コンテナを作り直して起動 ==="
docker compose up -d --force-recreate app

echo "=== 完了（DB など他のコンテナはそのまま） ==="
