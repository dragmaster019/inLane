'use strict'
// GetTelemetrySummary.js — main.js / HANDLER for Part 2.
// Flow: HANDLER -> INPUT VALIDATION -> PROCESSOR (single SQL aggregate) -> RESPONSE.
// Everything logged, same convention as ingest + AUM service.

import { logger, withRequest } from '../../../utils/logger.js'
import { getPool } from '../../../utils/db.js'
import {
  validateSummaryQuery,
  SummaryValidationError
} from './GetTelemetrySummaryInputValidation.js'
import { fetchSummary } from './GetTelemetrySummaryModel.js'

// PROCESSOR: one indexed aggregate query, then shape response.
// Empty window -> event_count 0, nulls for aggregates (per spec).
const processor = async ({ device_id, fromMs, toMs }) => {
  logger.info({ device_id, fromMs, toMs }, 'Summary processor: aggregate query started.')
  const pool = getPool()
  const row = await fetchSummary(pool, { device_id, fromMs, toMs })
  const event_count = Number(row.event_count ?? 0)
  logger.info({ event_count }, 'Summary processor: aggregate query finished.')

  if (event_count === 0) {
    return { device_id, from: fromMs, to: toMs, avg_speed_kmph: null, max_accel_magnitude: null, event_count: 0 }
  }

  return {
    device_id,
    from: fromMs,
    to: toMs,
    avg_speed_kmph: row.avg_speed === null ? null : Number(Number(row.avg_speed).toFixed(2)),
    max_accel_magnitude: row.max_accel === null ? null : Number(Number(row.max_accel).toFixed(4)),
    event_count
  }
}

// HANDLER (Express): GET /api/v1/telemetry/summary?device_id=&from=&to=
export const getTelemetrySummaryHandler = async (req, res, next) => {
  try {
    withRequest(req)
    logger.info({ query: req.query }, 'Telemetry summary handler triggered.')

    // 1) INPUT VALIDATION (missing / from>to -> 400)
    const { device_id, fromMs, toMs } = validateSummaryQuery(req.query)
    logger.info({ device_id, fromMs, toMs }, 'Summary request validation passed.')

    // 2) PROCESSOR
    const response = await processor({ device_id, fromMs, toMs })

    // 3) RESPONSE (assignment's exact shape)
    logger.info(response, 'Telemetry summary completed successfully.')
    return res.status(200).json(response)
  } catch (err) {
    if (err instanceof SummaryValidationError) {
      logger.error({ error: err.message }, 'Summary validation failed.')
      return res.status(400).json({ error: err.message })
    }
    logger.error({ error: err?.message, stack: err?.stack }, 'Error in telemetry summary handler.')
    return next(err)
  }
}
