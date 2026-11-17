#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"

case "$command" in
  on)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      db.setProfilingLevel(1, { slowms: 100 });
      printjson(db.getProfilingStatus());
    '
    ;;
  report)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      const rows = db.system.profile
        .find({ millis: { $gte: 100 } })
        .sort({ ts: -1 })
        .limit(20)
        .toArray()
        .map((entry) => ({
          op: entry.op,
          ns: entry.ns,
          millis: entry.millis,
          planSummary: entry.planSummary,
          keysExamined: entry.keysExamined,
          docsExamined: entry.docsExamined,
          ts: entry.ts,
        }));
      printjson(rows);
    '
    ;;
  off)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      db.setProfilingLevel(0);
      printjson(db.getProfilingStatus());
    '
    ;;
  *)
    echo "Usage: bash scripts/db-profiler.sh on|report|off" >&2
    exit 1
    ;;
esac
