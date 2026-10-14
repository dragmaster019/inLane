'use strict'
// server.js — local bootstrap (replaces AWS Lambda + API Gateway).
// Only the 2 required APIs + health.

import 'dotenv/config'
import express from 'express'
import { logger } from './src/utils/logger.js'
import { checkDbConnection } from './src/utils/db.js'
import { createTelemetryIngestHandler } from './src/telemetry/controller/create-telemetry-ingest/CreateTelemetryIngest.js'
import { getTelemetrySummaryHandler } from './src/telemetry/controller/get-telemetry-summary/GetTelemetrySummary.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

app.post('/api/v1/telemetry/ingest', createTelemetryIngestHandler)
app.get('/api/v1/telemetry/summary', getTelemetrySummaryHandler)

app.get('/health', async (_req, res) => {
  try {
    await checkDbConnection()
    return res.json({ ok: true, db: 'up' })
  } catch (e) {
    return res.status(500).json({ ok: false, db: 'down', error: e.message })
  }
})

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ error: err?.message }, 'Unhandled error.')
  res.status(500).json({ error: 'Internal server error.' })
})

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  logger.info({ port: PORT }, `Telemetry service listening (local, no AWS).`)
})
