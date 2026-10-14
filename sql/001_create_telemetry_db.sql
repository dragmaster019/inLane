-- ============================================================================
-- Telemetry DB DDL (MySQL 8.x, InnoDB)
-- Run: mysql -h 127.0.0.1 -u root -p < sql/001_create_telemetry_db.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS telemetry_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE telemetry_db;

-- ----------------------------------------------------------------------------
-- Core event store. One row = one (device_id, event_ts_ms).
-- Duplicate rule (assignment): same device_id + timestamp must NOT create a
-- second row, within a batch or across requests -> UNIQUE KEY enforces it at
-- the storage layer (race-safe), app uses INSERT IGNORE and counts duplicates.
--
-- Query pattern: time-range per device
--   WHERE device_id = ? AND event_ts_ms BETWEEN ? AND ?
-- UNIQUE KEY (device_id, event_ts_ms) is a leftmost-prefix B-Tree index, so
-- both equality on device_id and range on event_ts_ms are index-efficient.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id     VARCHAR(64)     NOT NULL COMMENT 'unique per device, top-level field',
  event_ts_ms   BIGINT          NOT NULL COMMENT 'epoch millis, event time (not server receipt time)',
  event_time    DATETIME(3)     NOT NULL COMMENT 'human-readable mirror of event_ts_ms, for ops/debugging',
  lat           DECIMAL(10, 7)  NOT NULL,
  lon           DECIMAL(10, 7)  NOT NULL,
  speed_kmph    DECIMAL(7, 2)   NOT NULL,
  accel_x       FLOAT           NOT NULL COMMENT 'm/s2',
  accel_y       FLOAT           NOT NULL COMMENT 'm/s2',
  accel_z       FLOAT           NOT NULL COMMENT 'm/s2',
  gyro_x        FLOAT           NOT NULL COMMENT 'rad/s',
  gyro_y        FLOAT           NOT NULL COMMENT 'rad/s',
  gyro_z        FLOAT           NOT NULL COMMENT 'rad/s',
  created_at    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'server receipt time',

  PRIMARY KEY (id),
  UNIQUE KEY uq_device_ts (device_id, event_ts_ms),
  KEY idx_event_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='High-frequency motion telemetry, deduped on (device_id, event_ts_ms)';

-- Optional device registry (useful for Part 2 query auth / onboarding).
-- Events table intentionally has NO FK to this, so ingestion never blocks on
-- unknown devices (high-throughput ingest must be append-only).
CREATE TABLE IF NOT EXISTS devices (
  device_id   VARCHAR(64) NOT NULL,
  first_seen  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
