-- Avatar élève stocké sur disque (chemin relatif sous uploads/)
-- Idempotence gérée côté runner de migrations (errno 1060)
ALTER TABLE students ADD COLUMN avatar_path VARCHAR(512) DEFAULT NULL;
