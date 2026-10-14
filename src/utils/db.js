'use strict'
// utils/db.js — local MySQL connection (replaces AWS getDbConnection + SSM params).
// Usage: import { getDbConnection, closePool } from '../../../utils/db.js'
// Env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_CONNECTION_LIMIT

import mysql from 'mysql2/promise'
import { logger } from './logger.js'

let pool = null

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME']

export const getPool = () => {
  if (pool) return pool

  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var ${key}. Copy .env.example to .env and fill it.`)
    }
  }

  logger.info(
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ?? '3306',
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    },
    'Creating MySQL connection pool.'
  )

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: '+00:00' // store/compare in UTC, epoch millis is TZ-safe
  })

  return pool
}

// Mirror of repo's getDbConnection(dbConnection, useReaderInstance) signature
// so handler code reads the same as the AUM service.
export const getDbConnection = async () => {
  const p = getPool()
  const conn = await p.getConnection()
  logger.debug('Acquired MySQL connection from pool.')
  return conn
}

export const checkDbConnection = async () => {
  const p = getPool()
  const [rows] = await p.query('SELECT 1 AS ok')
  logger.info({ rows }, 'MySQL connectivity check succeeded.')
  return rows
}

export const closePool = async () => {
  if (pool) {
    await pool.end()
    pool = null
    logger.info('MySQL pool closed.')
  }
}
