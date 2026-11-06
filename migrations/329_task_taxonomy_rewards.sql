-- =====================================================================
-- Tâches : métier, format, phase de projet et auteur d'une proposition ; projets : type ;
-- badges : attribution manuelle (adulte + mot) et annonce vue.
--
-- `tasks.category`            métier (jardinage, animaux, entretien…) ;
-- `tasks.format`              flash | routine | seance ;
-- `tasks.project_phase`       concevoir | preparer | realiser | tester | transmettre (NULL hors projet) ;
-- `tasks.proposed_by_user_id` élève auteur d'une proposition (rempli par la route de
--                             proposition, jamais modifiable par l'API) ;
-- `task_projects.project_type` amenagement | construction | dispositif_technique | evenement | campagne ;
-- `user_rewards.awarded_by_user_id` / `note` : badges manuels seulement ;
-- `user_rewards.seen_at`      annonce vue par l'élève (pas de réannonce).
--
-- Colonnes en VARCHAR, sans ENUM ni CHECK SQL : les valeurs admises vivent dans le référentiel
-- `src/shared/enums/taskEnums.js` (miroir `lib/shared/taskEnums.js`) et le module
-- `src/shared/taskTaxonomyCore.js` ; une valeur inconnue est refusée en 400 par l'API, jamais
-- remise à NULL en silence. Aucun classement des tâches existantes ici : il est fait par
-- `scripts/backfill-task-taxonomy.js`, relu avant application.
--
-- Reprise des auteurs : `tasks.proposed_by_user_id` rempli depuis `audit_log`
-- (`action = 'propose_task'`, `target_type = 'task'`, plus ancienne ligne par tâche), seulement
-- si la tâche existe encore et que l'acteur existe dans `users`.
--
-- Permission RBAC semée : `rewards.award` (admin, prof) — `POST /api/rewards/award`.
--
-- IDEMPOTENCE : ADD COLUMN IF NOT EXISTS ; index et clés étrangères gardés par
-- INFORMATION_SCHEMA ; reprise limitée aux auteurs encore NULL ; INSERT IGNORE.
-- Retour arrière :
--   ALTER TABLE tasks DROP FOREIGN KEY fk_tasks_proposed_by_user;
--   ALTER TABLE user_rewards DROP FOREIGN KEY fk_user_rewards_awarded_by;
--   ALTER TABLE tasks DROP INDEX idx_tasks_category, DROP INDEX idx_tasks_project_phase,
--     DROP INDEX idx_tasks_proposed_by_user, DROP COLUMN category, DROP COLUMN format,
--     DROP COLUMN project_phase, DROP COLUMN proposed_by_user_id;
--   ALTER TABLE task_projects DROP COLUMN project_type;
--   ALTER TABLE user_rewards DROP INDEX idx_user_rewards_awarded_by,
--     DROP COLUMN awarded_by_user_id, DROP COLUMN note, DROP COLUMN seen_at;
--   DELETE FROM role_permissions WHERE permission_key = 'rewards.award';
--   DELETE FROM rbac_seeded_permissions WHERE permission_key = 'rewards.award';
--   DELETE FROM permissions WHERE `key` = 'rewards.award';
-- =====================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category VARCHAR(32) NULL DEFAULT NULL COMMENT 'Métier (référentiel taskEnums)',
  ADD COLUMN IF NOT EXISTS format VARCHAR(16) NULL DEFAULT NULL COMMENT 'flash | routine | seance',
  ADD COLUMN IF NOT EXISTS project_phase VARCHAR(16) NULL DEFAULT NULL COMMENT 'Phase dans le projet ; NULL hors projet',
  ADD COLUMN IF NOT EXISTS proposed_by_user_id VARCHAR(64) NULL DEFAULT NULL COMMENT 'Auteur d''une proposition acceptée';

ALTER TABLE task_projects
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(24) NULL DEFAULT NULL COMMENT 'Type de projet (référentiel taskEnums)';

ALTER TABLE user_rewards
  ADD COLUMN IF NOT EXISTS awarded_by_user_id VARCHAR(64) NULL DEFAULT NULL COMMENT 'Adulte qui a décerné un badge manuel',
  ADD COLUMN IF NOT EXISTS note VARCHAR(280) NULL DEFAULT NULL COMMENT 'Mot de l''adulte (badge manuel)',
  ADD COLUMN IF NOT EXISTS seen_at DATETIME NULL DEFAULT NULL COMMENT 'Annonce vue par l''élève';

-- Index ---------------------------------------------------------------------------------

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_category'
);
SET @sql = IF(@fm329 = 0, 'CREATE INDEX idx_tasks_category ON tasks (category)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_project_phase'
);
SET @sql = IF(@fm329 = 0, 'CREATE INDEX idx_tasks_project_phase ON tasks (project_id, project_phase)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_proposed_by_user'
);
SET @sql = IF(@fm329 = 0, 'CREATE INDEX idx_tasks_proposed_by_user ON tasks (proposed_by_user_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_rewards' AND INDEX_NAME = 'idx_user_rewards_awarded_by'
);
SET @sql = IF(@fm329 = 0, 'CREATE INDEX idx_user_rewards_awarded_by ON user_rewards (awarded_by_user_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Clés étrangères -------------------------------------------------------------------------

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
     AND CONSTRAINT_NAME = 'fk_tasks_proposed_by_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @fm329 = 0,
  'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_proposed_by_user FOREIGN KEY (proposed_by_user_id) REFERENCES users (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm329 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_rewards'
     AND CONSTRAINT_NAME = 'fk_user_rewards_awarded_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @fm329 = 0,
  'ALTER TABLE user_rewards ADD CONSTRAINT fk_user_rewards_awarded_by FOREIGN KEY (awarded_by_user_id) REFERENCES users (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reprise des auteurs de propositions -----------------------------------------------------

UPDATE tasks t
  JOIN (
    SELECT a.target_id, a.actor_user_id
      FROM audit_log a
      JOIN (
        SELECT target_id, MIN(id) AS first_id
          FROM audit_log
         WHERE action = 'propose_task' AND target_type = 'task' AND target_id IS NOT NULL
         GROUP BY target_id
      ) f ON f.first_id = a.id
  ) src ON src.target_id = t.id
  JOIN users u ON u.id = src.actor_user_id
   SET t.proposed_by_user_id = u.id
 WHERE t.proposed_by_user_id IS NULL;

-- Permission `rewards.award` --------------------------------------------------------------

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('rewards.award', 'Décerner un badge', 'Décerner un badge manuel (sauvetage, guide, coup de main) à un élève de son périmètre, avec un mot');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'rewards.award' FROM roles r WHERE r.slug IN ('admin', 'prof');

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'rewards.award' FROM roles r WHERE r.slug IN ('admin', 'prof');
