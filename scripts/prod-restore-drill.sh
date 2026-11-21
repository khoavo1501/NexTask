#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
env_file="${ENV_FILE:-.env.production}"
compose_file="${COMPOSE_FILE:-docker-compose.prod.yml}"
backup_dir="${BACKUP_DIR:-backups/prod}"
set -a
source "$env_file"
set +a

archive="${1:-$(ls -t "$backup_dir"/nextask-*.gz | head -n 1)}"
[[ -f "$archive" ]] || { echo "Không tìm thấy backup: $archive" >&2; exit 1; }
gzip -t "$archive"

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" exec -T mongo mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval 'db.getSiblingDB("nextask_restore_drill").dropDatabase()'

"${compose[@]}" exec -T mongo mongorestore --archive --gzip \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --nsFrom='nextask.*' --nsTo='nextask_restore_drill.*' < "$archive"

"${compose[@]}" exec -T mongo mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval '
const app = db.getSiblingDB("nextask");
const drill = db.getSiblingDB("nextask_restore_drill");
const names = ["users","boards","items","tasks","activities","voter_budgets","schema_migrations"];
let failed = false;
for (const name of names) {
  const expected = app.getCollection(name).countDocuments();
  const actual = drill.getCollection(name).countDocuments();
  printjson({ name, expected, actual });
  if (expected !== actual) failed = true;
}
drill.dropDatabase();
if (failed) quit(2);
'
