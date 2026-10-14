'use strict'

export class SummaryValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SummaryValidationError'
    this.statusCode = 400
  }
}

export const validateSummaryQuery = (query) => {
  const { device_id, from, to } = query ?? {}

  if (typeof device_id !== 'string' || device_id.trim().length === 0) {
    throw new SummaryValidationError('device_id is required and must be a non-empty string.')
  }
  if (from === undefined || from === null || String(from).trim() === '') {
    throw new SummaryValidationError('from is required (epoch millis, inclusive).')
  }
  if (to === undefined || to === null || String(to).trim() === '') {
    throw new SummaryValidationError('to is required (epoch millis, inclusive).')
  }

  const fromMs = Number(from)
  const toMs = Number(to)

  if (!Number.isInteger(fromMs) || fromMs < 0) {
    throw new SummaryValidationError('from must be a positive integer (epoch millis).')
  }
  if (!Number.isInteger(toMs) || toMs < 0) {
    throw new SummaryValidationError('to must be a positive integer (epoch millis).')
  }
  if (fromMs > toMs) {
    throw new SummaryValidationError('from must not be greater than to.')
  }

  return { device_id: device_id.trim(), fromMs, toMs }
}
