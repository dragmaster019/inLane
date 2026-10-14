'use strict'
// scripts/test-edgecases.mjs — run: node scripts/test-edgecases.mjs
// Covers every edge case in Part 1 + Part 2. Server must be running on :3000.
const base = process.env.BASE_URL ?? 'http://localhost:3000'
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS ' + name) }
  else { fail++; console.log('FAIL ' + name + ' ' + JSON.stringify(extra)) }
}
const post = async (body) => {
  const r = await fetch(base + '/api/v1/telemetry/ingest', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  return { status: r.status, json: await r.json() }
}
const get = async (q) => {
  const r = await fetch(base + q)
  return { status: r.status, json: await r.json() }
}
const T = () => Date.now() - 60000 - Math.floor(Math.random() * 5000)
const ev = (o = {}) => ({
  timestamp: T(), lat: 12.9, lon: 77.5, speed_kmph: 42,
  accel_x: 0, accel_y: 0, accel_z: 9.8, gyro_x: 0, gyro_y: 0, gyro_z: 0, ...o
})

// ---- Part 1: request-level 400s ----
let r = await post({ events: [ev()] }); ok('P1 missing device_id ->400', r.status === 400, r)
r = await post({ device_id: '', events: [ev()] }); ok('P1 empty device_id ->400', r.status === 400, r)
r = await post({ device_id: 'D1' }); ok('P1 missing events ->400', r.status === 400, r)
r = await post({ device_id: 'D1', events: [] }); ok('P1 empty events ->400', r.status === 400, r)
r = await post({ device_id: 'D1', events: Array.from({ length: 501 }, () => ev()) }); ok('P1 501 events ->400', r.status === 400, r)

// ---- Part 1: per-event required ----
for (const f of ['timestamp','lat','lon','speed_kmph','accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z']) {
  const e = ev(); delete e[f]
  r = await post({ device_id: 'E-REQ', events: [e] })
  ok('P1 missing ' + f + ' rejected', r.status === 200 && r.json.rejected === 1 && r.json.errors[0].index === 0, r.json)
}
// ---- Part 1: ranges ----
r = await post({ device_id: 'E-TS', events: [ev({ timestamp: 0 })] }); ok('P1 ts=0 rejected', r.json.rejected === 1, r.json)
r = await post({ device_id: 'E-TS', events: [ev({ timestamp: Date.now() + 25*3600*1000 })] }); ok('P1 ts +25h rejected', r.json.rejected === 1, r.json)
r = await post({ device_id: 'E-TS', events: [ev({ timestamp: Date.now() + 23*3600*1000 })] }); ok('P1 ts +23h accepted', r.json.accepted === 1, r.json)
r = await post({ device_id: 'E-B1', events: [ev({ lat: -90 }), ev({ lat: 90 })] }); ok('P1 lat +-90 accepted', r.json.accepted === 2, r.json)
r = await post({ device_id: 'E-B1', events: [ev({ lat: 90.1 })] }); ok('P1 lat 90.1 rejected', r.json.rejected === 1, r.json)
r = await post({ device_id: 'E-B2', events: [ev({ lon: -180 }), ev({ lon: 180 })] }); ok('P1 lon +-180 accepted', r.json.accepted === 2, r.json)
r = await post({ device_id: 'E-B2', events: [ev({ lon: 181 })] }); ok('P1 lon 181 rejected', r.json.rejected === 1, r.json)
r = await post({ device_id: 'E-B3', events: [ev({ speed_kmph: 0 }), ev({ speed_kmph: 300 })] }); ok('P1 speed 0/300 accepted', r.json.accepted === 2, r.json)
r = await post({ device_id: 'E-B3', events: [ev({ speed_kmph: 300.1 })] }); ok('P1 speed 300.1 rejected', r.json.rejected === 1, r.json)
r = await post({ device_id: 'E-N', events: [ev({ accel_x: 'bad' })] }); ok('P1 accel string rejected', r.json.rejected === 1, r.json)

// ---- Part 1: partial + duplicates ----
const now = T()
const batch = []; for (let i = 0; i < 8; i++) batch.push(ev({ timestamp: now + i }))
batch.push(ev({ timestamp: now + 100, speed_kmph: 999 })); batch.push(ev({ timestamp: now + 101, lat: 200 }))
r = await post({ device_id: 'E-PART', events: batch })
ok('P1 8/10 partial', r.json.accepted === 8 && r.json.rejected === 2, r.json)
const dts = T()
r = await post({ device_id: 'E-DUP', events: [ev({ timestamp: dts }), ev({ timestamp: dts }), ev({ timestamp: dts })] })
ok('P1 in-batch dup acc1 dup2', r.json.accepted === 1 && r.json.duplicates === 2, r.json)
r = await post({ device_id: 'E-DUP', events: [ev({ timestamp: dts })] })
ok('P1 cross-req dup acc0 dup1', r.json.accepted === 0 && r.json.duplicates === 1, r.json)

// ---- Part 2 ----
const t1 = T(), t2 = t1 + 50
await post({ device_id: 'E-SUM', events: [
  { timestamp: t1, lat: 12.9, lon: 77.5, speed_kmph: 40, accel_x: 0, accel_y: 0, accel_z: 10, gyro_x: 0, gyro_y: 0, gyro_z: 0 },
  { timestamp: t2, lat: 12.9, lon: 77.5, speed_kmph: 50, accel_x: 0, accel_y: 0, accel_z: 0, gyro_x: 3, gyro_y: 4, gyro_z: 0 }
]})
r = await get(`/api/v1/telemetry/summary?device_id=E-SUM&from=${t1}&to=${t2}`)
ok('P2 avg=45 count=2 maxaccel=10', r.status === 200 && r.json.avg_speed_kmph === 45 && r.json.event_count === 2 && r.json.max_accel_magnitude === 10, r.json)
r = await get('/api/v1/telemetry/summary?device_id=E-SUM&from=1000000000000&to=1000000001000')
ok('P2 empty -> count0 nulls', r.status === 200 && r.json.event_count === 0 && r.json.avg_speed_kmph === null, r.json)
r = await get('/api/v1/telemetry/summary?device_id=E-SUM&from=2000&to=1000')
ok('P2 from>to ->400', r.status === 400, r.json)
r = await get('/api/v1/telemetry/summary?from=1&to=2')
ok('P2 missing device ->400', r.status === 400, r.json)
r = await get('/api/v1/telemetry/summary?device_id=E-SUM&from=1')
ok('P2 missing to ->400', r.status === 400, r.json)

console.log(`\nDONE pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
