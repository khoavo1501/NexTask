#!/usr/bin/env bash
set -euo pipefail

label="${1:-manual}"
mkdir -p backups
timestamp="$(date +%Y%m%d-%H%M%S)"
file="backups/nextask-${label}-${timestamp}.gz"

docker compose exec -T mongo mongodump --db nextask --archive --gzip > "$file"
gzip -t "$file"
ls -lh "$file"
