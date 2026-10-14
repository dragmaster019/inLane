'use strict'

export const buildSummaryQuery = () => `
  SELECT
    COUNT(*) AS event_count,
    AVG(speed_kmph) AS avg_speed,
    MAX(SQRT(accel_x * accel_x + accel_y * accel_y + accel_z * accel_z)) AS max_accel
  FROM telemetry_events
  WHERE device_id = ?
    AND event_ts_ms BETWEEN ? AND ?
`

export const fetchSummary = async (connOrPool, { device_id, fromMs, toMs }) => {
  const [rows] = await connOrPool.query(buildSummaryQuery(), [device_id, fromMs, toMs])
  return rows[0] ?? { event_count: 0, avg_speed: null, max_accel: null }
}
