-- Affiliation élève : autoriser un identifiant de carte (jusqu’à 32 caractères) en plus de n3 / foret / both
ALTER TABLE users MODIFY COLUMN affiliation VARCHAR(32) NOT NULL DEFAULT 'both';

UPDATE schema_version SET version = 76;
