-- telemetry db, run: mysql -h 127.0.0.1 -u root -p < sql/001_create_telemetry_db.sql

CREATE DATABASE IF NOT EXISTS telemetry_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE telemetry_db;

-- one row per (device_id, event_ts_ms), unique key handles duplicates
CREATE TABLE IF NOT EXISTS telemetry_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id     VARCHAR(64)     NOT NULL,
  event_ts_ms   BIGINT          NOT NULL,
  event_time    DATETIME(3)     NOT NULL,
  lat           DECIMAL(10, 7)  NOT NULL,
  lon           DECIMAL(10, 7)  NOT NULL,
  speed_kmph    DECIMAL(7, 2)   NOT NULL,
  accel_x       FLOAT           NOT NULL,
  accel_y       FLOAT           NOT NULL,
  accel_z       FLOAT           NOT NULL,
  gyro_x        FLOAT           NOT NULL,
  gyro_y        FLOAT           NOT NULL,
  gyro_z        FLOAT           NOT NULL,
  created_at    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_device_ts (device_id, event_ts_ms),
  KEY idx_event_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devices (
  device_id   VARCHAR(64) NOT NULL,
  first_seen  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
