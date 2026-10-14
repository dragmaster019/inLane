'use strict'
// CreateTelemetryIngestModel.js — MainModel file (SQL builders + DB access).
// Mirrors repo's AumQuarterlyReportModel.js (buildAccountDataQuery etc).
// All SQL is parameterised (? placeholders) — never string-interpolated.

/**
 * Bulk insert with duplicate-tolerance.
 * UNIQUE KEY uq_device_ts (device_id, event_ts_ms) + INSERT IGNORE means:
 * - new (device,timestamp) -> inserted (affectedRows 1)
 * - duplicate across requests -> silently skipped (affectedRows 0)
 * Single multi-row statement for up to 500 rows = 1 round-trip.
 */
export const buildBulkInsertIgnoreQuery = (rows) => {
  const placeholders = rows.map(() => '(?, ?, FROM_UNIXTIME(? / 1000), ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
  const query = `
    INSERT IGNORE INTO telemetry_events
      (device_id, event_ts_ms, event_time, lat, lon, speed_kmph,
       accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z)
    VALUES ${placeholders}
  `
  const params = []
  for (const r of rows) {
    params.push(
      r.device_id, r.timestamp, r.timestamp,
      r.lat, r.lon, r.speed_kmph,
      r.accel_x, r.accel_y, r.accel_z,
      r.gyro_x, r.gyro_y, r.gyro_z
    )
  }
  return { query, params }
}

export const insertEventsIgnore = async (connOrPool, rows) => {
  if (!rows.length) return { inserted: 0 }
  const { query, params } = buildBulkInsertIgnoreQuery(rows)
  const [result] = await connOrPool.query(query, params)
  // result.affectedRows counts only newly inserted rows with INSERT IGNORE
  return { inserted: result.affectedRows ?? 0 }
}
