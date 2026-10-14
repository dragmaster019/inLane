# inLane Telemetry

Small backend for motion telemetry, running locally on MySQL.

## What it does

- `POST /api/v1/telemetry/ingest` — takes a batch of events, stores the valid ones
- `GET /api/v1/telemetry/summary?device_id=&from=&to=` — avg speed, max accel, count for a window
- `GET /health` — checks the db connection

## Files

```
sql/001_create_telemetry_db.sql
src/utils/db.js, src/utils/logger.js
src/telemetry/controller/create-telemetry-ingest/   # POST handler + validation + model
src/telemetry/controller/get-telemetry-summary/     # GET handler + validation + model
server.js
scripts/test-edgecases.mjs
screenshot/   # postman + db screenshots
```

## Run it

```bash
npm install
cp .env.example .env        # put your local mysql password in DB_PASSWORD
mysql -h 127.0.0.1 -u root -p < sql/001_create_telemetry_db.sql
npm start
curl http://localhost:3000/health
```

## Try it

```bash
# ingest, 2 events
TS=$(node -e "console.log(Date.now()-60000)") && TS2=$(node -e "console.log(Date.now()-59950)") && curl -X POST http://localhost:3000/api/v1/telemetry/ingest \
  -H 'Content-Type: application/json' \
  -d "{\"device_id\":\"DVC-1029\",\"events\":[{\"timestamp\":$TS,\"lat\":12.9716,\"lon\":77.5946,\"speed_kmph\":42.5,\"accel_x\":0.12,\"accel_y\":-0.03,\"accel_z\":9.81,\"gyro_x\":0.002,\"gyro_y\":-0.001,\"gyro_z\":0.0},{\"timestamp\":$TS2,\"lat\":12.9716,\"lon\":77.5947,\"speed_kmph\":42.8,\"accel_x\":0.14,\"accel_y\":-0.02,\"accel_z\":9.80,\"gyro_x\":0.001,\"gyro_y\":-0.001,\"gyro_z\":0.0}]}"

# summary
curl "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1730894520000&to=1730894580000"

# empty window
curl "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1000000000000&to=1000000001000"
```

Or run the full check: `node scripts/test-edgecases.mjs` (33 cases).

## DB

One table `telemetry_events`. `(device_id, event_ts_ms)` is unique — that handles
duplicate retries and keeps the time-range lookup fast. Same key the summary query uses.
