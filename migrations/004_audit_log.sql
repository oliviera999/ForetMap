-- Historique d'actions prof (audit léger)
CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) DEFAULT NULL,
  details TEXT DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL
);

UPDATE schema_version SET version = 4;
