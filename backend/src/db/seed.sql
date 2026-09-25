-- Sample satellites and telemetry for local development.
-- Safe to run more than once: existing satellite and timestamp pairs are skipped.
-- Altitude is meters. Velocity is kilometers per second.

INSERT OR IGNORE INTO satellites (id, operator) VALUES
  ('PHOTON-01', 'Rocket Lab'),
  ('PHOTON-02', 'Rocket Lab'),
  ('AURORA-3', 'Aurora Space'),
  ('HARBOR-7', 'Harbor Imaging');

INSERT OR IGNORE INTO telemetry (
  satellite_id,
  latitude,
  longitude,
  timestamp,
  altitude,
  velocity,
  health_status
) VALUES
  ('PHOTON-01', -39.28, 177.86, '2026-09-25T16:00:00.000Z', 520000, 7.61, 'healthy'),
  ('PHOTON-01', 12.44, -148.02, '2026-09-25T16:30:00.000Z', 521400, 7.59, 'healthy'),
  ('PHOTON-01', 48.12, 11.58, '2026-09-25T17:00:00.000Z', 519800, 7.63, 'anomaly'),
  ('PHOTON-02', -33.87, 151.21, '2026-09-25T16:05:00.000Z', 610000, 7.55, 'healthy'),
  ('PHOTON-02', 1.35, 103.82, '2026-09-25T16:40:00.000Z', 608200, 7.56, 'healthy'),
  ('PHOTON-02', 35.68, 139.76, '2026-09-25T17:10:00.000Z', 607500, 7.54, 'critical'),
  ('AURORA-3', 64.15, -21.94, '2026-09-25T15:50:00.000Z', 780000, 7.46, 'healthy'),
  ('AURORA-3', NULL, NULL, '2026-09-25T16:20:00.000Z', 781100, 7.45, 'healthy'),
  ('AURORA-3', 40.71, -74.01, '2026-09-25T16:55:00.000Z', 779400, 7.47, 'anomaly'),
  ('HARBOR-7', 37.77, -122.42, '2026-09-25T16:12:00.000Z', 450000, 7.67, 'healthy'),
  ('HARBOR-7', -22.91, -43.17, '2026-09-25T16:48:00.000Z', 451200, 7.66, 'healthy'),
  ('HARBOR-7', 51.51, -0.13, '2026-09-25T17:18:00.000Z', 449600, 7.68, 'healthy');
