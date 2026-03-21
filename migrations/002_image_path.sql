-- Images sur disque : ajout historique de image_path.
-- Chaque ALTER est exécuté avec try/catch côté runner (colonne peut déjà exister).
ALTER TABLE zone_photos ADD COLUMN image_path VARCHAR(512) DEFAULT NULL;
ALTER TABLE task_logs ADD COLUMN image_path VARCHAR(512) DEFAULT NULL;
