#!/usr/bin/env bash
set -euo pipefail

archive="${1:-$(ls -t backups/nextask-*.gz | head -n 1)}"
if [[ ! -f "$archive" ]]; then
  echo "Không tìm thấy backup: $archive" >&2
  exit 1
fi
gzip -t "$archive"

docker compose exec -T mongo mongosh --quiet --eval '
  db.getSiblingDB("nextask_restore_drill").dropDatabase();
'

docker compose exec -T mongo mongorestore \
  --archive --gzip \
  --nsFrom='nextask.*' --nsTo='nextask_restore_drill.*' < "$archive"

docker compose exec -T mongo mongosh --quiet --eval '
const app = db.getSiblingDB("nextask");
const drill = db.getSiblingDB("nextask_restore_drill");
const names = ["users", "boards", "items", "tasks", "activities", "voter_budgets", "schema_migrations"];
const result = {};
let failed = false;
for (const name of names) {
  const expected = app.getCollection(name).countDocuments();
  const actual = drill.getCollection(name).countDocuments();
  result[name] = { expected, actual };
  if (expected !== actual) failed = true;
}
const sample = drill.boards.findOne({}, { name: 1 });
printjson({ result, sample, failed });
if (failed) quit(2);
drill.dropDatabase();
'
