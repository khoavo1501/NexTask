#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.public ]]; then
  echo "Không có .env.public." >&2
  exit 1
fi

docker compose --env-file .env.public -f docker-compose.public.yml down
echo "Đã dừng NexTask public; volume dữ liệu được giữ."
