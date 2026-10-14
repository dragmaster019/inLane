'use strict'

export class RequestValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RequestValidationError'
    this.statusCode = 400
  }
}

const REQUIRED_EVENT_FIELDS = [
  'timestamp',
  'lat',
  'lon',
  'speed_kmph',
  'accel_x',
  'accel_y',
  'accel_z',
  'gyro_x',
  'gyro_y',
  'gyro_z'
]

export const MAX_BATCH_SIZE = 500
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000

const isNumeric = (v) => typeof v === 'number' && Number.isFinite(v)

export const validateIngestRequest = (body) => {
  if (!body || typeof body !== 'object') {
    throw new RequestValidationError('Request body must be a JSON object.')
  }
  const { device_id, events } = body

  if (typeof device_id !== 'string' || device_id.trim().length === 0) {
    throw new RequestValidationError('device_id is required and must be a non-empty string.')
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new RequestValidationError('events must be a non-empty array.')
  }
  if (events.length > MAX_BATCH_SIZE) {
    throw new RequestValidationError(
      `events batch too large: got ${events.length}, max ${MAX_BATCH_SIZE}.`
    )
  }
}

export const validateEvent = (ev, nowMs) => {
  if (!ev || typeof ev !== 'object') return 'event must be an object'

  for (const f of REQUIRED_EVENT_FIELDS) {
    if (ev[f] === undefined || ev[f] === null) return `missing required field: ${f}`
  }

  if (!Number.isInteger(ev.timestamp) || ev.timestamp <= 0) {
    return 'timestamp must be a positive integer (epoch millis)'
  }
  if (ev.timestamp > nowMs + MAX_FUTURE_SKEW_MS) {
    return 'timestamp more than 24h in the future'
  }

  if (!isNumeric(ev.lat) || ev.lat < -90 || ev.lat > 90) {
    return 'lat out of range (-90..90)'
  }
  if (!isNumeric(ev.lon) || ev.lon < -180 || ev.lon > 180) {
    return 'lon out of range (-180..180)'
  }
  if (!isNumeric(ev.speed_kmph) || ev.speed_kmph < 0 || ev.speed_kmph > 300) {
    return 'speed_kmph out of range (0..300)'
  }

  for (const f of ['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z']) {
    if (!isNumeric(ev[f])) return `${f} must be numeric`
  }

  return null
}
