-- Collations explicites et contraintes de valeurs des tâches (audit du 25/09/2026, piste C,
-- ligne « 304 » du tableau § 2.3 ; § 1.1.5 et § 1.2.6). Idempotente, rejouable sans erreur,
-- sans trigger ni procédure (MariaDB 11.4 mutualisé, sans SUPER).
--
-- ---------------------------------------------------------------------------------------
-- 1) Collations de `schema_version` et `rbac_seeded_permissions`
-- ---------------------------------------------------------------------------------------
--
-- Les migrations 001 et 241 créent ces deux tables avec `DEFAULT CHARSET=utf8mb4` sans
-- `COLLATE` : MariaDB prend alors la collation par défaut du jeu de caractères, pas celle de
-- la base. Mesuré sur une base neuve (MariaDB 10.11) : `utf8mb4_general_ci` pour ces deux
-- tables, `utf8mb4_unicode_ci` pour la base et pour les 175 autres tables ; en 11.4, le
-- défaut du jeu de caractères peut devenir `utf8mb4_uca1400_ai_ci`. Toute jointure future
-- entre `rbac_seeded_permissions` et `role_permissions` ou `permissions` lèverait
-- `ERROR 1267 Illegal mix of collations`. On aligne donc les deux tables sur la collation de
-- toutes les autres, **écrite en toutes lettres**. Garde : l'ALTER n'est lancé que si la
-- collation diffère (second passage : rien à faire). Tables minuscules (une ligne ; quelques
-- centaines de lignes), aucun verrou long. Les clés de permission sont en ASCII : aucune
-- collision de clé primaire possible au changement de collation.
--
-- ---------------------------------------------------------------------------------------
-- 2) Contraintes CHECK sur `tasks.status` et les trois niveaux de tâche
-- ---------------------------------------------------------------------------------------
--
-- Ces colonnes sont des `varchar(32)` sans contrainte : une valeur ajoutée à un seul endroit
-- du code serait lue comme « non renseigné » en silence. Les valeurs admises sont celles du
-- référentiel partagé `src/shared/enums/taskEnums.js` (miroir `lib/shared/taskEnums.js`) ;
-- `tests/enums-referential.test.js` vérifie que chaque contrainte posée ici les liste
-- exactement. NULL reste admis (« non renseigné » pour les niveaux ; statut lu comme « à
-- faire »).
--
-- MariaDB valide les lignes existantes à l'ajout d'un CHECK : une seule ligne hors liste
-- ferait échouer la migration (errno 4025, non toléré par le runner). D'où deux temps :
--
--   a) normalisation **sans effet visible**, calquée sur ce que l'application fait déjà à la
--      lecture : espaces et majuscules retirés (le front lit `trim().toLowerCase()`, le tri SQL
--      `LOWER(TRIM(…))`) ; niveau vide → NULL (le vide est déjà lu comme « non renseigné ») ;
--      statut vide ou alias français (`disponible`, `en cours`, `terminée`…) → valeur canonique,
--      comme `normalizeTaskStatusForRead` (lib/taskStatusRecalc.js). Chaque UPDATE est gardé
--      par son WHERE : second passage, 0 ligne ;
--   b) contrainte posée **seulement si** aucune ligne ne la viole encore et si elle n'existe
--      pas déjà (garde `SET @… = IF(…)` puis `PREPARE`). Une valeur réellement inconnue n'est
--      donc jamais écrasée : la contrainte attend qu'elle soit corrigée à la main.
--
-- Contrôles après passage (0 ligne attendue pour chaque contrainte posée) :
--   SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_TYPE = 'CHECK';
--   SELECT id, status FROM tasks WHERE status NOT IN
--     ('available','in_progress','done','validated','proposed','on_hold');
--   SELECT id, danger_level FROM tasks WHERE danger_level NOT IN
--     ('safe','potential_danger','dangerous','very_dangerous');
--   SELECT id, difficulty_level FROM tasks WHERE difficulty_level NOT IN
--     ('easy','medium','hard','very_hard');
--   SELECT id, importance_level FROM tasks WHERE importance_level NOT IN
--     ('not_important','low','medium','high','absolute');
-- Une contrainte absente de la première requête signale une ligne restée hors liste (trouvée
-- par la requête correspondante) : la corriger, puis rejouer ce fichier à la main.
--
-- Ajouter une valeur plus tard : l'ajouter au référentiel ET, dans une nouvelle migration,
-- `ALTER TABLE tasks DROP CONSTRAINT …` puis `ADD CONSTRAINT …` avec la nouvelle liste.
-- Aucune table `gl_*` n'est touchée.

-- 1) Collations -------------------------------------------------------------------------

SET @fm307_sv_collation = (
  SELECT TABLE_COLLATION FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_version'
);
SET @sql = IF(
  @fm307_sv_collation IS NOT NULL AND @fm307_sv_collation <> 'utf8mb4_unicode_ci',
  'ALTER TABLE schema_version CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;

SET @fm307_rsp_collation = (
  SELECT TABLE_COLLATION FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rbac_seeded_permissions'
);
SET @sql = IF(
  @fm307_rsp_collation IS NOT NULL AND @fm307_rsp_collation <> 'utf8mb4_unicode_ci',
  'ALTER TABLE rbac_seeded_permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;

-- 2a) Normalisation sans effet visible --------------------------------------------------

-- Espaces et majuscules (comparaison binaire : la collation `_ci` ignorerait la casse).
UPDATE tasks SET status = LOWER(TRIM(status))
 WHERE status IS NOT NULL AND CAST(status AS BINARY) <> CAST(LOWER(TRIM(status)) AS BINARY);
UPDATE tasks SET danger_level = LOWER(TRIM(danger_level))
 WHERE danger_level IS NOT NULL
   AND CAST(danger_level AS BINARY) <> CAST(LOWER(TRIM(danger_level)) AS BINARY);
UPDATE tasks SET difficulty_level = LOWER(TRIM(difficulty_level))
 WHERE difficulty_level IS NOT NULL
   AND CAST(difficulty_level AS BINARY) <> CAST(LOWER(TRIM(difficulty_level)) AS BINARY);
UPDATE tasks SET importance_level = LOWER(TRIM(importance_level))
 WHERE importance_level IS NOT NULL
   AND CAST(importance_level AS BINARY) <> CAST(LOWER(TRIM(importance_level)) AS BINARY);

-- Niveau vide : déjà lu comme « non renseigné ».
UPDATE tasks SET danger_level = NULL WHERE danger_level = '';
UPDATE tasks SET difficulty_level = NULL WHERE difficulty_level = '';
UPDATE tasks SET importance_level = NULL WHERE importance_level = '';

-- Statut vide ou alias français : mêmes équivalences que `normalizeTaskStatusForRead`
-- (la collation `_ci` rend `terminee` et `terminée` égales).
UPDATE tasks SET status = 'available' WHERE status IN ('', 'disponible');
UPDATE tasks SET status = 'in_progress' WHERE status IN ('en_cours', 'encours', 'en cours');
UPDATE tasks SET status = 'done' WHERE status IN ('terminee', 'terminée');
UPDATE tasks SET status = 'validated' WHERE status IN ('validee', 'validée');
UPDATE tasks SET status = 'proposed' WHERE status IN ('proposee', 'proposée');
UPDATE tasks SET status = 'on_hold' WHERE status IN ('en_attente', 'en attente', 'attente');

-- 2b) Contraintes, posées seulement si aucune ligne ne les viole -----------------------

SET @fm307_bad = (
  SELECT COUNT(*) FROM tasks
   WHERE status NOT IN ('available', 'in_progress', 'done', 'validated', 'proposed', 'on_hold')
);
SET @fm307_has = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_tasks_status'
);
SET @sql = IF(
  @fm307_bad = 0 AND @fm307_has = 0,
  'ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (status IS NULL OR status IN (''available'', ''in_progress'', ''done'', ''validated'', ''proposed'', ''on_hold''))',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;

SET @fm307_bad = (
  SELECT COUNT(*) FROM tasks
   WHERE danger_level NOT IN ('safe', 'potential_danger', 'dangerous', 'very_dangerous')
);
SET @fm307_has = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_tasks_danger_level'
);
SET @sql = IF(
  @fm307_bad = 0 AND @fm307_has = 0,
  'ALTER TABLE tasks ADD CONSTRAINT chk_tasks_danger_level CHECK (danger_level IS NULL OR danger_level IN (''safe'', ''potential_danger'', ''dangerous'', ''very_dangerous''))',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;

SET @fm307_bad = (
  SELECT COUNT(*) FROM tasks
   WHERE difficulty_level NOT IN ('easy', 'medium', 'hard', 'very_hard')
);
SET @fm307_has = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_tasks_difficulty_level'
);
SET @sql = IF(
  @fm307_bad = 0 AND @fm307_has = 0,
  'ALTER TABLE tasks ADD CONSTRAINT chk_tasks_difficulty_level CHECK (difficulty_level IS NULL OR difficulty_level IN (''easy'', ''medium'', ''hard'', ''very_hard''))',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;

SET @fm307_bad = (
  SELECT COUNT(*) FROM tasks
   WHERE importance_level NOT IN ('not_important', 'low', 'medium', 'high', 'absolute')
);
SET @fm307_has = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_tasks_importance_level'
);
SET @sql = IF(
  @fm307_bad = 0 AND @fm307_has = 0,
  'ALTER TABLE tasks ADD CONSTRAINT chk_tasks_importance_level CHECK (importance_level IS NULL OR importance_level IN (''not_important'', ''low'', ''medium'', ''high'', ''absolute''))',
  'SELECT 1'
);
PREPARE fm307_stmt FROM @sql;
EXECUTE fm307_stmt;
DEALLOCATE PREPARE fm307_stmt;
