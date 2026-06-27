-- =====================================================================
-- ForetMap — Réparation de l'intégrité référentielle task_*/users (FK student).
--
-- Pourquoi : les FK fk_task_assignments_student et fk_task_logs_student
-- (student_id -> users(id) ON DELETE SET NULL) sont créées par les migrations
-- 027/029 mais sont ABSENTES en production (drift hors-migration : les FK ont
-- disparu du dump sans qu'aucun DROP ne soit tracé en git). Conséquence : la
-- suppression d'un compte élève ne nettoie plus task_assignments/task_logs, et
-- au moins un orphelin réel a été constaté dans task_logs (student_id pointant
-- vers un users.id inexistant).
--
-- Cette migration est purement réparatrice et IDEMPOTENTE (rejouable sans erreur) :
--   1) on nettoie les orphelins (student_id -> NULL) AVANT de poser les FK, car
--      le runner ne tolère pas l'errno 1452 (Cannot add or update a child row) ;
--   2) on garantit la présence des index sur la colonne référençante (InnoDB
--      exige un index AVANT d'accepter la FK) via une garde INFORMATION_SCHEMA ;
--   3) on (re)pose les deux FK via une garde COUNT sur TABLE_CONSTRAINTS.
-- student_id est nullable : ON DELETE SET NULL est cohérent avec 027/029.
-- =====================================================================

-- 1) Nettoyage des orphelins AVANT pose des FK (sinon errno 1452 non toléré).
UPDATE task_assignments
   SET student_id = NULL
 WHERE student_id IS NOT NULL
   AND student_id NOT IN (SELECT id FROM users);

UPDATE task_logs
   SET student_id = NULL
 WHERE student_id IS NOT NULL
   AND student_id NOT IN (SELECT id FROM users);

-- 2) Index sur la colonne référençante (pré-requis InnoDB pour la FK).
--    On vérifie d'abord qu'AUCUN index ne couvre déjà student_id en première
--    position (quel que soit son nom) afin d'éviter un index en double.
SET @taHasStudentIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_assignments'
     AND COLUMN_NAME = 'student_id'
     AND SEQ_IN_INDEX = 1
);
SET @sql = IF(
  @taHasStudentIndex = 0,
  'ALTER TABLE task_assignments ADD INDEX idx_task_assignments_student_id (student_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tlHasStudentIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_logs'
     AND COLUMN_NAME = 'student_id'
     AND SEQ_IN_INDEX = 1
);
SET @sql = IF(
  @tlHasStudentIndex = 0,
  'ALTER TABLE task_logs ADD INDEX idx_task_logs_student_id (student_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) (Re)pose de la FK task_assignments.student_id -> users(id) ON DELETE SET NULL.
SET @taHasStudentFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_assignments'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_assignments_student'
);
SET @sql = IF(
  @taHasStudentFk = 0,
  'ALTER TABLE task_assignments ADD CONSTRAINT fk_task_assignments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Idem pour task_logs.student_id -> users(id) ON DELETE SET NULL.
SET @tlHasStudentFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_logs'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_logs_student'
);
SET @sql = IF(
  @tlHasStudentFk = 0,
  'ALTER TABLE task_logs ADD CONSTRAINT fk_task_logs_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
