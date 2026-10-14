'use strict'
// CreateTelemetryIngest.js — main.js / HANDLER.
// Flow (same convention as AUM Quarterly Report):
//   HANDLER -> INPUT VALIDATION -> PRE-PROCESSOR -> PROCESSOR -> RESPONSE
// Every stage is logged via utils/logger (like the repo does in AWS/CloudWatch).

import { logger, withRequest } from '../../../utils/logger.js'
import { getPool } from '../../../utils/db.js'
import {
  validateIngestRequest,
  validateEvent,
  RequestValidationError
} from './CreateTelemetryIngestInputValidation.js'
import { insertEventsIgnore } from './CreateTelemetryIngestModel.js'

// ---------------------------------------------------------------------------
// PRE-PROCESSOR: per-event validation + in-batch dedupe.
// - Validates each event independently (partial success expected).
// - Dedupes on (device_id + timestamp) WITHIN the batch: first occurrence wins,
//   later repeats count as duplicates (not rejections).
// Returns { validRows, duplicates, rejected, errors[] }.
// ---------------------------------------------------------------------------
const preProcessor = (device_id, events, nowMs) => {
  logger.info({ device_id, batchSize: events.length }, 'Pre-processor started.')

  const validRows = []
  const errors = []
  let rejected = 0
  let inBatchDuplicates = 0
  const seenTimestamps = new Set()

  events.forEach((ev, index) => {
    const reason = validateEvent(ev, nowMs)
    if (reason) {
      rejected += 1
      errors.push({ index, reason })
      logger.debug({ index, reason }, 'Event rejected by validation.')
      return
    }
    if (seenTimestamps.has(ev.timestamp)) {
      inBatchDuplicates += 1
      logger.debug({ index, timestamp: ev.timestamp }, 'In-batch duplicate skipped.')
      return
    }
    seenTimestamps.add(ev.timestamp)
    validRows.push({ device_id, ...ev })
  })

  logger.info(
    { valid: validRows.length, inBatchDuplicates, rejected },
    'Pre-processor finished.'
  )
  return { validRows, inBatchDuplicates, rejected, errors }
}

// ---------------------------------------------------------------------------
// PROCESSOR: persists deduped valid rows. INSERT IGNORE turns cross-request
// duplicates into no-ops (no second row). accepted = inserted,
// dbDuplicates = submitted-to-DB minus inserted.
// ---------------------------------------------------------------------------
const processor = async (validRows) => {
  if (!validRows.length) {
    logger.info('Processor skipped: no valid rows to store.')
    return { accepted: 0, dbDuplicates: 0 }
  }
  logger.info({ count: validRows.length }, 'Processor: bulk INSERT IGNORE started.')
  const pool = getPool()
  const { inserted } = await insertEventsIgnore(pool, validRows)
  const dbDuplicates = validRows.length - inserted
  logger.info({ inserted, dbDuplicates }, 'Processor: bulk insert finished.')
  return { accepted: inserted, dbDuplicates }
}

// ---------------------------------------------------------------------------
// HANDLER (Express): POST /api/v1/telemetry/ingest
// Request-level failures -> 400 (whole request rejected).
// Otherwise -> 200 { device_id, accepted, duplicates, rejected, errors[] }.
// ---------------------------------------------------------------------------
export const createTelemetryIngestHandler = async (req, res, next) => {
  try {
    withRequest(req)
    logger.info({ bodyKeys: Object.keys(req.body ?? {}) }, 'Telemetry ingest handler triggered.')

    // 1) INPUT VALIDATION (request-level)
    validateIngestRequest(req.body)
    const { device_id, events } = req.body
    logger.info({ device_id, batchSize: events.length }, 'Request-level validation passed.')

    // 2) PRE-PROCESSOR
    const nowMs = Date.now()
    const { validRows, inBatchDuplicates, rejected, errors } = preProcessor(device_id, events, nowMs)

    // 3) PROCESSOR
    const { accepted, dbDuplicates } = await processor(validRows)

    // 4) RESPONSE (assignment's exact shape)
    const response = {
      device_id,
      accepted,
      duplicates: inBatchDuplicates + dbDuplicates,
      rejected,
      errors
    }
    logger.info(response, 'Telemetry ingest completed successfully.')
    return res.status(200).json(response)
  } catch (err) {
    if (err instanceof RequestValidationError) {
      logger.error({ error: err.message }, 'Request-level validation failed.')
      return res.status(400).json({ error: err.message })
    }
    logger.error({ error: err?.message, stack: err?.stack }, 'Error in telemetry ingest handler.')
    return next(err)
  }
}
