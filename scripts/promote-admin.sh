#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <email>"
  exit 1
fi

EMAIL=$1
COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Promoting $EMAIL to admin..."

# Find Kratos identity ID for the given email
KID=$(docker compose -f "$COMPOSE_DIR/docker-compose.yaml" exec -T kratos-postgres \
  psql -U "${KRATOS_DB_USER:-kratos}" -d "${KRATOS_DB_NAME:-kratos}" -t -A -c \
  "SELECT id FROM identities WHERE traits->>'email' = '$EMAIL'")

if [ -z "$KID" ]; then
  echo "No identity found for email: $EMAIL"
  exit 1
fi

echo "Found Kratos ID: $KID"

# Update the role in the application database
docker compose -f "$COMPOSE_DIR/docker-compose.yaml" exec -T app-postgres \
  psql -U "${DB_USER:-pguser}" -d "${DB_NAME:-app}" -c \
  "UPDATE users SET role = 'admin' WHERE kratos_id = '$KID';"

echo "Done."
