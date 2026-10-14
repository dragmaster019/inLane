'use strict'

const levelPriority = { debug: 10, info: 20, error: 30 }
const currentLevel = (process.env.LOG_LEVEL ?? 'debug').toLowerCase()
const threshold = levelPriority[currentLevel] ?? 10

let requestContext = {}

export const withRequest = (req, _context = {}) => {
  requestContext = {
    requestId: req?.requestId ?? `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    method: req?.method,
    url: req?.originalUrl ?? req?.url
  }
}

const log = (level, objOrMsg, msg) => {
  if ((levelPriority[level] ?? 20) < threshold) return
  let payload = {}
  let message = ''
  if (typeof objOrMsg === 'string') {
    message = msg ? `${objOrMsg} ${msg}` : objOrMsg
  } else {
    payload = objOrMsg ?? {}
    message = msg ?? ''
  }
  const line = {
    ts: new Date().toISOString(),
    level,
    ...requestContext,
    ...(message ? { msg: message } : {}),
    ...payload
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line))
}

export const logger = {
  debug: (o, m) => log('debug', o, m),
  info: (o, m) => log('info', o, m),
  error: (o, m) => log('error', o, m)
}
