#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/.."

echo "=== git pull ==="
set -e
git pull
set +e

echo "=== 全停止 & 全削除（イメージ・ボリューム・orphan 含む） ==="
docker compose down --rmi all --volumes --remove-orphans
DOWN_RC=$?
echo "（down の終了コード: $DOWN_RC）"

echo "=== 再作成して起動（Ctrl+C で停止） ==="
docker compose up
RC=$?
if [ $RC -ne 0 ]; then
    echo "ERROR: docker compose up に失敗しました (exit=$RC)" >&2
    exit $RC
fi
echo "=== 完了 ==="
