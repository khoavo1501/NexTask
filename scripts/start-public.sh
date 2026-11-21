#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.public ]]; then
  : "${PUBLIC_DOMAIN:?Đặt PUBLIC_DOMAIN, ví dụ nextask.example.com}"
  : "${CLOUDFLARE_TUNNEL_TOKEN:?Đặt CLOUDFLARE_TUNNEL_TOKEN từ Cloudflare Zero Trust}"
  PUBLIC_DOMAIN="${PUBLIC_DOMAIN#https://}"
  PUBLIC_DOMAIN="${PUBLIC_DOMAIN%/}"

  public_url="https://${PUBLIC_DOMAIN}"
  owner_email="owner@${PUBLIC_DOMAIN}"
  owner_password="$(openssl rand -hex 16)"
  demo_password="$(openssl rand -hex 16)"
  jwt_secret="$(openssl rand -base64 48)"
  root_password="$(openssl rand -hex 24)"
  app_password="$(openssl rand -hex 24)"

  umask 077
  cat > .env.public <<EOF
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
PUBLIC_URL=${public_url}
CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
JWT_SECRET=${jwt_secret}
MONGO_ROOT_USERNAME=nextask_root
MONGO_ROOT_PASSWORD=${root_password}
MONGO_APP_USERNAME=nextask_app
MONGO_APP_PASSWORD=${app_password}
SEED_OWNER_EMAIL=${owner_email}
SEED_OWNER_PASSWORD=${owner_password}
SEED_OWNER_NAME=Owner
SEED_DEMO_MEMBER_PASSWORD=${demo_password}
SERVICE_VERSION=1.0.0
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=${NEXT_PUBLIC_TLDRAW_LICENSE_KEY:-}
EOF
  chmod 600 .env.public
  echo "Đã tạo .env.public (không commit)."
fi

set -a
source .env.public
set +a

compose=(docker compose --env-file .env.public -f docker-compose.public.yml)

echo "Đang build image..."
"${compose[@]}" build api web migrate seed

echo "Đang bootstrap Mongo..."
ENV_FILE=.env.public COMPOSE_FILE=docker-compose.public.yml \
  MONGO_MARKER=secrets/mongo-public-initialized bash scripts/prod-mongo-bootstrap.sh

"${compose[@]}" up -d mongo
for _ in $(seq 1 30); do
  state=$(docker inspect -f '{{.State.Health.Status}}' nextask-public-mongo-1 2>/dev/null || true)
  [[ "$state" == healthy ]] && break
  sleep 2
done

"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps seed
"${compose[@]}" up -d api web public-proxy cloudflared

echo "Đang chờ public link..."
ready=0
for _ in $(seq 1 60); do
  if curl -fsS "${PUBLIC_URL}/api/v1/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done
if [[ "$ready" -ne 1 ]]; then
  echo "Chưa truy cập được ${PUBLIC_URL}; kiểm tra Cloudflare Tunnel/DNS và log:" >&2
  "${compose[@]}" logs cloudflared public-proxy api --tail=80 >&2
  exit 1
fi

echo
echo "NexTask public: ${PUBLIC_URL}"
echo "Owner email: ${SEED_OWNER_EMAIL}"
echo "Owner password: ${SEED_OWNER_PASSWORD}"
echo "Dừng: bash scripts/stop-public.sh (volume dữ liệu được giữ)."
