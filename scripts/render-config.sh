#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-.env}"
KRATOS_TEMPLATE="${KRATOS_TEMPLATE:-kratos/kratos.yaml.example}"
KRATOS_OUTPUT="${KRATOS_OUTPUT:-kratos/kratos.yaml}"
export ENV_FILE KRATOS_TEMPLATE KRATOS_OUTPUT

python3 - <<'PY'
from pathlib import Path
import os
import sys

env_file = Path(os.environ["ENV_FILE"])
if not env_file.exists():
    print(f"error: {env_file} が見つかりません。cp .env.example .env を実行してください。", file=sys.stderr)
    sys.exit(1)

def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[key] = value
    return values

values = parse_env(env_file)
required = ["KRATOS_DSN", "KRATOS_BROWSER_URL", "KRATOS_ADMIN_URL", "KRATOS_UI_URL", "APP_URL"]
missing = [key for key in required if not values.get(key)]
if missing:
    print(f"error: {env_file} に {', '.join(missing)} を設定してください。", file=sys.stderr)
    sys.exit(1)

template = Path(os.environ["KRATOS_TEMPLATE"]).read_text()
for key in required:
    template = template.replace("${" + key + "}", values[key])
kratos_output = Path(os.environ["KRATOS_OUTPUT"])
kratos_output.write_text(template)
print(f"generated: {kratos_output}")

PY
