'use strict'

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
  return { inserted: result.affectedRows ?? 0 }
}
