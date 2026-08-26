-- =====================================================================
-- Conditionnement des lectures — portée du verrou (ForetMap + Gnomes & Licornes).
--
-- Le verrou posé après une erreur portait toujours sur la RESSOURCE ENTIÈRE : se
-- tromper à une question bloquait tout le tutoriel, y compris les questions qu'on
-- aurait su traiter. Le nouveau réglage `gating.cooldown_scope` permet de ne
-- verrouiller QUE la question ratée, l'élève pouvant continuer sur les autres.
--
-- La clé primaire s'enrichit donc du code de question. Convention : la chaîne vide
-- désigne un verrou de portée « ressource » — les lignes existantes, migrées
-- telles quelles, conservent exactement leur comportement.
--
-- Idempotent : chaque étape est protégée par un test sur information_schema, et
-- le lot est rejouable sans effet. Pré-requis : migrations 165 et 199.
-- =====================================================================

-- ── ForetMap ────────────────────────────────────────────────────────────────
ALTER TABLE resource_gating_cooldowns
  ADD COLUMN IF NOT EXISTS question_code VARCHAR(16) NOT NULL DEFAULT '';

SET @has_qc := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'resource_gating_cooldowns'
     AND INDEX_NAME = 'PRIMARY' AND COLUMN_NAME = 'question_code'
);
SET @sql := IF(@has_qc = 0,
  'ALTER TABLE resource_gating_cooldowns DROP PRIMARY KEY,
     ADD PRIMARY KEY (user_id, resource_type, resource_ref, question_code)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Gnomes & Licornes ───────────────────────────────────────────────────────
ALTER TABLE gl_resource_gating_cooldowns
  ADD COLUMN IF NOT EXISTS question_code VARCHAR(16) NOT NULL DEFAULT '';

SET @has_qc_gl := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_gating_cooldowns'
     AND INDEX_NAME = 'PRIMARY' AND COLUMN_NAME = 'question_code'
);
SET @sql_gl := IF(@has_qc_gl = 0,
  'ALTER TABLE gl_resource_gating_cooldowns DROP PRIMARY KEY,
     ADD PRIMARY KEY (reader_user_type, reader_user_id, resource_type, resource_ref, question_code)',
  'DO 0');
PREPARE stmt FROM @sql_gl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
