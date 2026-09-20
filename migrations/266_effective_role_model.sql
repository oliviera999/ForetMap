-- Politique de profil unique : « le plus élevé l'emporte » (docs/AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md,
-- CDG-43 ; docs/reference/foretmap/comptes-roles-et-groupes.md, « Comment le profil est décidé »).
--
-- Avant : le profil principal (`user_roles.is_primary`) mélangeait le profil attribué à la main,
-- le « plancher » conféré par les groupes, la montée automatique par tâches validées et le profil
-- imposé — quatre mécaniques, trois réglages, deux boutons, et des gardes qui se contredisaient.
--
-- Après :
--   * `users.assigned_role_id` = le profil **attribué** (à la main, à l'import, ou relevé par la
--     progression automatique). C'est la seule chose qu'un administrateur écrit.
--   * `user_roles.is_primary = 1` = le profil **effectif**, recalculé par `lib/effectiveRole.js` :
--     le plus élevé entre le profil attribué et le profil par défaut de chacun des groupes actifs
--     du compte ; un groupe qui **impose** son profil (`groups.force_default_role`) passe devant.
--   * Le drapeau `groups.grants_n3beur_access` disparaît : « groupe n3beur » = groupe dont le
--     profil par défaut est un palier n3beur. Les groupes qui le cochaient sans profil reçoivent
--     « n3beur novice », pour ne rétrograder personne.
--   * `users.affiliation` (restriction de cartes individuelle, modifiable par l'élève lui-même)
--     disparaît : seul le périmètre cartes des groupes borne les cartes.
--   * `group_members.role_in_group` (responsable / membre) disparaît : le périmètre d'un
--     enseignant est son appartenance, le rôle de membre n'avait aucun effet.
--
-- Les trois colonnes retirées restent déclarées dans sql/schema_foretmap.sql (les migrations
-- 024, 076, 079, 146, 167 et 265 les lisent ou les écrivent sur une base neuve) et sont
-- supprimées après chaque passage de migrations par lib/legacySchemaCleanup.js — même
-- mécanique que `role_permissions.requires_elevation`.
--
-- Idempotente : chaque étape est gardée par INFORMATION_SCHEMA.

-- ---------------------------------------------------------------------------------------
-- 1. users.assigned_role_id
-- ---------------------------------------------------------------------------------------
SET @usersHasAssignedRole = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'assigned_role_id'
);
SET @sql = IF(
  @usersHasAssignedRole = 0,
  'ALTER TABLE users ADD COLUMN assigned_role_id INT UNSIGNED DEFAULT NULL AFTER user_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @usersHasAssignedRoleIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_assigned_role'
);
SET @sql = IF(
  @usersHasAssignedRoleIndex = 0,
  'CREATE INDEX idx_users_assigned_role ON users (assigned_role_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Un profil supprimé ne laisse pas un compte pointer dans le vide : le profil attribué
-- retombe à NULL et le recalcul repose le défaut (visiteur / prof de classe).
SET @usersHasAssignedRoleFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
     AND CONSTRAINT_NAME = 'fk_users_assigned_role' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @usersHasAssignedRoleFk = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_assigned_role FOREIGN KEY (assigned_role_id) REFERENCES roles(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reprise : le profil principal actuel devient le profil attribué (une seule fois).
UPDATE users u
  INNER JOIN user_roles ur
          ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
   SET u.assigned_role_id = ur.role_id
 WHERE u.assigned_role_id IS NULL;

-- ---------------------------------------------------------------------------------------
-- 2. groupes « accorde le statut n3beur » sans profil → n3beur novice
-- ---------------------------------------------------------------------------------------
SET @groupsHasGrants = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = 'grants_n3beur_access'
);
SET @noviceRoleId = (SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1);
SET @sql = IF(
  @groupsHasGrants > 0 AND @noviceRoleId IS NOT NULL,
  CONCAT('UPDATE `groups` SET default_role_id = ', @noviceRoleId, ' WHERE grants_n3beur_access = 1 AND default_role_id IS NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
