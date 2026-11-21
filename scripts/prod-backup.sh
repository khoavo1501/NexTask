#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
env_file="${ENV_FILE:-.env.production}"
compose_file="${COMPOSE_FILE:-docker-compose.prod.yml}"
backup_dir="${BACKUP_DIR:-backups/prod}"
set -a
source "$env_file"
set +a
mkdir -p "$backup_dir"

timestamp="$(date +%Y%m%d-%H%M%S)"
file="${backup_dir}/nextask-${BACKUP_LABEL:-prod}-${timestamp}.gz"

docker compose --env-file "$env_file" -f "$compose_file" exec -T mongo \
  mongodump --host localhost \
  --username "$MONGO_ROOT_USERNAME" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db nextask --archive --gzip > "$file"

gzip -t "$file"
find "$backup_dir" -name "nextask-${BACKUP_LABEL:-prod}-*.gz" -mtime +14 -delete
ls -lh "$file"
