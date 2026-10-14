'use strict'

import { logger, withRequest } from '../../../utils/logger.js'
import { getPool } from '../../../utils/db.js'
import {
  validateIngestRequest,
  validateEvent,
  RequestValidationError
} from './CreateTelemetryIngestInputValidation.js'
import { insertEventsIgnore } from './CreateTelemetryIngestModel.js'

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

export const createTelemetryIngestHandler = async (req, res, next) => {
  try {
    withRequest(req)
    logger.info({ bodyKeys: Object.keys(req.body ?? {}) }, 'Telemetry ingest handler triggered.')

    validateIngestRequest(req.body)
    const { device_id, events } = req.body
    logger.info({ device_id, batchSize: events.length }, 'Request-level validation passed.')

    const nowMs = Date.now()
    const { validRows, inBatchDuplicates, rejected, errors } = preProcessor(device_id, events, nowMs)

    const { accepted, dbDuplicates } = await processor(validRows)

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
