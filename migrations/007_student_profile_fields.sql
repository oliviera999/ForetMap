-- Champs de profil élève (pseudo, email, description)
-- Idempotence gérée côté runner de migrations (errno 1060/1061)
ALTER TABLE students ADD COLUMN pseudo VARCHAR(50) DEFAULT NULL;
ALTER TABLE students ADD COLUMN email VARCHAR(255) DEFAULT NULL;
ALTER TABLE students ADD COLUMN description TEXT DEFAULT NULL;
ALTER TABLE students ADD UNIQUE INDEX uq_students_pseudo (pseudo);
ALTER TABLE students ADD UNIQUE INDEX uq_students_email (email);
