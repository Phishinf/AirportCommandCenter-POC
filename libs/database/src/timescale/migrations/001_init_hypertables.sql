-- TimescaleDB initialisation script
-- Run after TimescaleDB extension is enabled

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ─── flow_metrics — Core hypertable ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flow_metrics (
  time                  TIMESTAMPTZ   NOT NULL,
  zone_id               TEXT          NOT NULL,
  terminal_id           TEXT          NOT NULL,
  source_system         TEXT          NOT NULL, -- 'WIFI' | 'XOVIS' | 'AODB'
  occupancy_absolute    INTEGER,
  passenger_count_delta INTEGER,
  anonymised_device_id  TEXT,                   -- SHA-256 hashed MAC
  flight_ref            TEXT,
  metadata              JSONB
);

SELECT create_hypertable('flow_metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_zone_time
  ON flow_metrics (zone_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_terminal_time
  ON flow_metrics (terminal_id, time DESC);

-- ─── wifi_events — Short-retention Wi-Fi events ──────────────────────────────

CREATE TABLE IF NOT EXISTS wifi_events (
  time                  TIMESTAMPTZ NOT NULL,
  ap_location_id        TEXT        NOT NULL,
  zone_id               TEXT        NOT NULL,
  event_type            TEXT        NOT NULL, -- 'ASSOCIATION' | 'DISASSOCIATION'
  anonymised_device_id  TEXT        NOT NULL,
  rssi                  INTEGER
);

SELECT create_hypertable('wifi_events', 'time', if_not_exists => TRUE);

-- Retain only 24 hours of raw Wi-Fi events
SELECT add_retention_policy('wifi_events', INTERVAL '24 hours',
  if_not_exists => TRUE);

-- ─── Continuous Aggregates ────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS zone_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time)  AS bucket,
  zone_id,
  terminal_id,
  AVG(occupancy_absolute)      AS avg_occupancy,
  MAX(occupancy_absolute)      AS max_occupancy,
  SUM(passenger_count_delta)   AS total_flow
FROM flow_metrics
WHERE occupancy_absolute IS NOT NULL
GROUP BY bucket, zone_id, terminal_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('zone_hourly_avg',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);

-- 5-minute bucket view for dashboard charts
CREATE MATERIALIZED VIEW IF NOT EXISTS zone_5min_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS bucket,
  zone_id,
  terminal_id,
  AVG(occupancy_absolute)        AS avg_occupancy,
  MAX(occupancy_absolute)        AS max_occupancy,
  SUM(passenger_count_delta)     AS total_flow
FROM flow_metrics
WHERE occupancy_absolute IS NOT NULL
GROUP BY bucket, zone_id, terminal_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('zone_5min_avg',
  start_offset      => INTERVAL '30 minutes',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists     => TRUE);
