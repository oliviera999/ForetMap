-- Profil élève: appartenance N3 / Forêt / les deux
ALTER TABLE students
  ADD COLUMN affiliation VARCHAR(16) NOT NULL DEFAULT 'both';

UPDATE students
SET affiliation = 'both'
WHERE affiliation IS NULL
   OR affiliation NOT IN ('n3', 'foret', 'both');

UPDATE schema_version SET version = 24;
