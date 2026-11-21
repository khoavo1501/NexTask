#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "Thiếu .env.production; copy từ .env.production.example" >&2
  exit 1
fi

compose=(docker compose --env-file .env.production -f docker-compose.prod.yml)
marker="secrets/mongo-initialized"
mkdir -p secrets

if [[ -f "$marker" ]]; then
  echo "Mongo đã bootstrap; bỏ qua."
  exit 0
fi

"${compose[@]}" stop mongo >/dev/null 2>&1 || true
"${compose[@]}" --profile bootstrap up -d mongo-bootstrap

ready=0
for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T mongo-bootstrap mongosh --quiet \
    --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  "${compose[@]}" logs mongo-bootstrap >&2
  exit 1
fi

"${compose[@]}" exec -T mongo-bootstrap mongosh --quiet --file /scripts/bootstrap.js
"${compose[@]}" stop mongo-bootstrap
"${compose[@]}" rm -f mongo-bootstrap
touch "$marker"
chmod 600 "$marker"
echo "Mongo bootstrap xong."
