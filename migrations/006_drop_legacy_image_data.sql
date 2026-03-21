-- Retrait final du legacy base64 après migration complète vers image_path.
-- Idempotence gérée côté runner (errno 1091 colonne absente).
ALTER TABLE zone_photos DROP COLUMN image_data;
ALTER TABLE task_logs DROP COLUMN image_data;
