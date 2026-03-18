-- Images sur disque : image_path + image_data nullable
-- Chaque ALTER est exécuté avec try/catch côté runner (colonne peut déjà exister)
ALTER TABLE zone_photos ADD COLUMN image_path VARCHAR(512) DEFAULT NULL;
ALTER TABLE zone_photos MODIFY image_data LONGTEXT DEFAULT NULL;
ALTER TABLE task_logs ADD COLUMN image_path VARCHAR(512) DEFAULT NULL;
ALTER TABLE task_logs MODIFY image_data LONGTEXT DEFAULT NULL;
