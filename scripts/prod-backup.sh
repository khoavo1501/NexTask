#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env.production
set +a
mkdir -p backups/prod

timestamp="$(date +%Y%m%d-%H%M%S)"
file="backups/prod/nextask-prod-${timestamp}.gz"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T mongo \
  mongodump --host localhost \
  --username "$MONGO_ROOT_USERNAME" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db nextask --archive --gzip > "$file"

gzip -t "$file"
find backups/prod -name 'nextask-prod-*.gz' -mtime +14 -delete
ls -lh "$file"
