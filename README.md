# inLane Telemetry — Ingestion + Summary API (local MySQL, no AWS)

Minimal backend for high-frequency motion telemetry. Follows the repo convention
`HANDLER → INPUT VALIDATION → PRE-PROCESSOR → PROCESSOR`, everything logged as JSON lines.

## Endpoints

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/telemetry/ingest` | `CreateTelemetryIngest` |
| GET | `/api/v1/telemetry/summary?device_id=&from=&to=` | `GetTelemetrySummary` |
| GET | `/health` | DB check |

## Project layout

```
sql/001_create_telemetry_db.sql
src/utils/db.js, src/utils/logger.js
src/telemetry/controller/create-telemetry-ingest/
  CreateTelemetryIngest.js (+InputValidation, +Model, .yml)
src/telemetry/controller/get-telemetry-summary/
  GetTelemetrySummary.js (+InputValidation, +Model, .yml)
server.js
scripts/test-edgecases.mjs   # 33 checks, run after server start
postman/inLane-telemetry.postman_collection.json
```

## Setup (local, no AWS / no CloudWatch)

```bash
npm install
cp .env.example .env        # fill DB_PASSWORD (local MySQL root pwd)
mysql -h 127.0.0.1 -u root -p < sql/001_create_telemetry_db.sql
npm start                   # :3000
curl http://localhost:3000/health   # {"ok":true,"db":"up"}
```

Logs go to stdout (JSON lines, `LOG_LEVEL=debug`). No AWS needed.

## Sample requests

```bash
# POST ingest — 2 valid
TS=$(node -e "console.log(Date.now()-60000)") && TS2=$(node -e "console.log(Date.now()-59950)") && curl -X POST http://localhost:3000/api/v1/telemetry/ingest \
  -H 'Content-Type: application/json' \
  -d "{\"device_id\":\"DVC-1029\",\"events\":[{\"timestamp\":$TS,\"lat\":12.9716,\"lon\":77.5946,\"speed_kmph\":42.5,\"accel_x\":0.12,\"accel_y\":-0.03,\"accel_z\":9.81,\"gyro_x\":0.002,\"gyro_y\":-0.001,\"gyro_z\":0.0},{\"timestamp\":$TS2,\"lat\":12.9716,\"lon\":77.5947,\"speed_kmph\":42.8,\"accel_x\":0.14,\"accel_y\":-0.02,\"accel_z\":9.80,\"gyro_x\":0.001,\"gyro_y\":-0.001,\"gyro_z\":0.0}]}"
# → {"device_id":"DVC-1029","accepted":2,"duplicates":0,"rejected":0,"errors":[]}

# POST ingest — partial + dup (send twice: 2nd shows cross-request dups)
TS=$(node -e "console.log(Date.now()-60000)") && curl -X POST http://localhost:3000/api/v1/telemetry/ingest \
  -H 'Content-Type: application/json' \
  -d "{\"device_id\":\"DVC-1029\",\"events\":[{\"timestamp\":$TS,\"lat\":12.9,\"lon\":77.5,\"speed_kmph\":42,\"accel_x\":0,\"accel_y\":0,\"accel_z\":9.8,\"gyro_x\":0,\"gyro_y\":0,\"gyro_z\":0},{\"timestamp\":$TS,\"lat\":12.9,\"lon\":77.5,\"speed_kmph\":42,\"accel_x\":0,\"accel_y\":0,\"accel_z\":9.8,\"gyro_x\":0,\"gyro_y\":0,\"gyro_z\":0},{\"timestamp\":$TS,\"lat\":12.9,\"lon\":77.5,\"speed_kmph\":999,\"accel_x\":0,\"accel_y\":0,\"accel_z\":9.8,\"gyro_x\":0,\"gyro_y\":0,\"gyro_z\":0}]}"

# GET summary — happy
curl "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1730894520000&to=1730894580000"
# → {"device_id":"DVC-1029","from":1730894520000,"to":1730894580000,"avg_speed_kmph":42.65,"max_accel_magnitude":9.8108,"event_count":2}

# GET summary — empty window
curl "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1000000000000&to=1000000001000"
# → {"event_count":0,"avg_speed_kmph":null,"max_accel_magnitude":null}
```

Postman: import `postman/inLane-telemetry.postman_collection.json` (9 requests with Tests assertions).

## DB design

`UNIQUE KEY uq_device_ts (device_id, event_ts_ms)` enforces dedupe (in-batch via Set,
cross-request via `INSERT IGNORE`) and serves `WHERE device_id=? AND event_ts_ms BETWEEN ? AND ?`
with a leftmost-prefix B-Tree range. Summary is a single indexed aggregate
(`COUNT, AVG, MAX(SQRT(...))`).

## Scaling note (for writeup)

Stateless Express behind ALB → horizontal scale; MySQL: single multi-row `INSERT IGNORE`
per batch, pool 10, read replica for summary, partition by `event_ts_ms` range or
`device_id` hash when single node saturates; hot devices shard by `device_id`.
