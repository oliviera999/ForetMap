-- Carnet d'observation : entrées libres par élève (hors tâches)
CREATE TABLE IF NOT EXISTS observation_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  content TEXT NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL
);

UPDATE schema_version SET version = 3;
