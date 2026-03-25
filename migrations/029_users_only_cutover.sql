-- Bascule finale: identités 100% users (suppression students/teachers)

-- 1) Backfill users à partir des tables legacy si nécessaire
INSERT INTO users (
  id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
  description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen
)
SELECT
  s.id, 'student', NULL, s.email, s.pseudo, s.first_name, s.last_name,
  TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ' '))),
  s.description, s.avatar_path, COALESCE(s.affiliation, 'both'), s.password, 'local', 1, s.last_seen
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = s.id OR (u.user_type = 'student' AND u.legacy_user_id = s.id)
);

INSERT INTO users (
  id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
  description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen
)
SELECT
  t.id, 'teacher', NULL, t.email, LOWER(SUBSTRING_INDEX(t.email, '@', 1)), NULL, NULL,
  COALESCE(NULLIF(t.display_name, ''), t.email),
  NULL, NULL, 'both', t.password_hash, 'local', COALESCE(t.is_active, 1), t.last_seen
FROM teachers t
WHERE NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = t.id OR (u.user_type = 'teacher' AND u.legacy_user_id = t.id)
);

-- 2) Migration des tables relationnelles vers users.id
UPDATE user_roles ur
JOIN users u ON u.user_type = ur.user_type AND (u.id = ur.user_id OR u.legacy_user_id = ur.user_id)
SET ur.user_id = u.id;

UPDATE elevation_audit ea
JOIN users u ON u.user_type = ea.user_type AND (u.id = ea.user_id OR u.legacy_user_id = ea.user_id)
SET ea.user_id = u.id;

UPDATE password_reset_tokens prt
JOIN users u ON u.user_type = prt.user_type AND (u.id = prt.user_id OR u.legacy_user_id = prt.user_id)
SET prt.user_id = u.id;

UPDATE task_assignments ta
JOIN users u ON u.user_type = 'student' AND (u.id = ta.student_id OR u.legacy_user_id = ta.student_id)
SET ta.student_id = u.id
WHERE ta.student_id IS NOT NULL;

UPDATE task_logs tl
JOIN users u ON u.user_type = 'student' AND (u.id = tl.student_id OR u.legacy_user_id = tl.student_id)
SET tl.student_id = u.id
WHERE tl.student_id IS NOT NULL;

UPDATE visit_seen_students vss
JOIN users u ON u.user_type = 'student' AND (u.id = vss.student_id OR u.legacy_user_id = vss.student_id)
SET vss.student_id = u.id;

UPDATE observation_logs o
JOIN users u ON u.user_type = 'student' AND (u.id = o.student_id OR u.legacy_user_id = o.student_id)
SET o.student_id = u.id;

-- 3) Recréer les FK des entités métier vers users
SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_assignments'
    AND COLUMN_NAME = 'student_id'
    AND REFERENCED_TABLE_NAME = 'students'
  LIMIT 1
);
SET @sql = IF(@fk_name IS NULL, 'SELECT 1', CONCAT('ALTER TABLE task_assignments DROP FOREIGN KEY ', @fk_name));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_logs'
    AND COLUMN_NAME = 'student_id'
    AND REFERENCED_TABLE_NAME = 'students'
  LIMIT 1
);
SET @sql = IF(@fk_name IS NULL, 'SELECT 1', CONCAT('ALTER TABLE task_logs DROP FOREIGN KEY ', @fk_name));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'visit_seen_students'
    AND COLUMN_NAME = 'student_id'
    AND REFERENCED_TABLE_NAME = 'students'
  LIMIT 1
);
SET @sql = IF(@fk_name IS NULL, 'SELECT 1', CONCAT('ALTER TABLE visit_seen_students DROP FOREIGN KEY ', @fk_name));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'observation_logs'
    AND COLUMN_NAME = 'student_id'
    AND REFERENCED_TABLE_NAME = 'students'
  LIMIT 1
);
SET @sql = IF(@fk_name IS NULL, 'SELECT 1', CONCAT('ALTER TABLE observation_logs DROP FOREIGN KEY ', @fk_name));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE task_assignments
  ADD CONSTRAINT fk_task_assignments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_logs
  ADD CONSTRAINT fk_task_logs_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE visit_seen_students
  ADD CONSTRAINT fk_visit_seen_students_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE observation_logs
  ADD CONSTRAINT fk_observation_logs_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4) Suppression des tables legacy
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS students;

UPDATE schema_version SET version = 29;
