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

One table `telemetry_events` (see `sql/001_create_telemetry_db.sql`).
One row per event: `device_id`, `event_ts_ms` (epoch millis), lat/lon, speed,
accel x/y/z, gyro x/y/z, plus `event_time` (same instant as datetime, easier to read)
and `created_at` (when the server got it).

Indexes: `PRIMARY (id)`, `UNIQUE (device_id, event_ts_ms)`, plain index on `event_time`.
The unique key does two jobs — it stops duplicates and it serves the main lookup
`WHERE device_id=? AND event_ts_ms BETWEEN ? AND ?` (device equality + time range
off the same B-tree). The summary endpoint runs one aggregate over that range
(`COUNT, AVG(speed), MAX(...)`), no full scan.

Duplicates: in-batch ones are caught with a Set (first wins, rest counted as
duplicates). Across requests, `INSERT IGNORE` + the unique key means a retry just
skips the row — `affectedRows` tells us how many were actually new. If two requests
with the same device+timestamp arrive at the same time, the unique key still only
lets one row through; the loser is ignored and counted as a duplicate instead of
erroring. So concurrent retries stay correct, just one may do a bit of wasted work.

If this went to production I'd put a queue (SQS/Kafka) in front of the writer so
bursts don't hit MySQL directly, and split reads to a replica. Single change with
the most payoff at 10-50 events/sec/device.

