-- =====================================================================
-- ForetMap — Lien Moodle ↔ ForetMap / G&L : modèle de données de la synchronisation
-- (docs/AUDIT_MOODLE_IDENTITES_2026-09.md, section 5).
--
-- Principes gravés dans le schéma :
--  - I-4 « ce que la synchronisation n'a pas créé, elle ne le défait pas » :
--    `external_identities.origin`, `external_group_members.source` et l'existence même d'une
--    ligne `external_groups` sont les seules provenances qui autorisent une écriture destructive.
--  - I-5 « un objet, un maître » : `external_groups.master`.
--  - I-8 idempotence : `members_hash` / `members_json` mémorisent le dernier état commun.
--  - section 11 : `users.sync_exempt` / `groups.sync_exempt` priment sur tout.
--
-- `external_identities.provider` est un VARCHAR libre ('moodle' pour les Web Services, 'lti'
-- pour le lancement depuis un cours — lot M6) : la même personne porte deux lignes pour le
-- même `issuer`. Pas d'ENUM figé côté base.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ALTER gardés par INFORMATION_SCHEMA.
-- =====================================================================

CREATE TABLE IF NOT EXISTS external_identities (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,
  issuer        VARCHAR(255) NOT NULL,
  external_id   VARCHAR(64)  NOT NULL,
  external_idnumber VARCHAR(128) DEFAULT NULL,
  external_username VARCHAR(191) DEFAULT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  origin        ENUM('created','linked') NOT NULL,
  linked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME DEFAULT NULL,
  UNIQUE KEY uq_ext_ident_provider_ext (provider, issuer, external_id),
  UNIQUE KEY uq_ext_ident_provider_user (provider, issuer, user_id),
  INDEX idx_ext_ident_user (user_id),
  CONSTRAINT fk_ext_ident_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_groups (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32)  NOT NULL,
  issuer        VARCHAR(255) NOT NULL,
  kind          ENUM('cohort','course_group') NOT NULL,
  external_id   VARCHAR(64)  DEFAULT NULL,
  external_idnumber VARCHAR(191) DEFAULT NULL,
  external_name VARCHAR(255) DEFAULT NULL,
  course_external_id VARCHAR(64) DEFAULT NULL,
  master        ENUM('moodle','foretmap') NOT NULL,
  policy_key    VARCHAR(64) DEFAULT NULL,
  group_id      VARCHAR(64) DEFAULT NULL,
  gl_class_id   INT UNSIGNED DEFAULT NULL,
  gl_team_id    INT UNSIGNED DEFAULT NULL,
  members_hash  CHAR(64) DEFAULT NULL,
  -- Liste `users.id` triée derrière `members_hash` : une empreinte seule dit qu'il y a eu un
  -- changement, pas lequel — le rapport doit nommer les personnes (section 9).
  members_json  LONGTEXT DEFAULT NULL,
  last_synced_at DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ext_group_provider_ext (provider, issuer, kind, external_id),
  UNIQUE KEY uq_ext_group_idnumber (provider, issuer, external_idnumber),
  INDEX idx_ext_group_group (group_id),
  INDEX idx_ext_group_gl_class (gl_class_id),
  INDEX idx_ext_group_gl_team (gl_team_id),
  CONSTRAINT fk_ext_group_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE SET NULL,
  CONSTRAINT fk_ext_group_gl_class FOREIGN KEY (gl_class_id) REFERENCES gl_classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_ext_group_gl_team FOREIGN KEY (gl_team_id) REFERENCES gl_teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_group_members (
  external_group_id INT UNSIGNED NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  source        ENUM('sync','manual') NOT NULL DEFAULT 'sync',
  synced_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (external_group_id, user_id),
  INDEX idx_ext_gm_user (user_id),
  CONSTRAINT fk_ext_gm_group FOREIGN KEY (external_group_id) REFERENCES external_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_ext_gm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_runs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32) NOT NULL,
  mode          ENUM('dry_run','apply') NOT NULL,
  scope_json    LONGTEXT DEFAULT NULL,
  status        ENUM('running','succeeded','failed','aborted','undone') NOT NULL DEFAULT 'running',
  actor_user_id VARCHAR(64) DEFAULT NULL,
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME DEFAULT NULL,
  totals_json   LONGTEXT DEFAULT NULL,
  report_json   LONGTEXT DEFAULT NULL,
  error_text    TEXT DEFAULT NULL,
  INDEX idx_sync_runs_started (started_at),
  INDEX idx_sync_runs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_actions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id        INT UNSIGNED NOT NULL,
  seq           INT UNSIGNED NOT NULL,
  kind          VARCHAR(64) NOT NULL,
  target_type   VARCHAR(32) NOT NULL,
  target_id     VARCHAR(128) DEFAULT NULL,
  before_json   LONGTEXT DEFAULT NULL,
  after_json    LONGTEXT DEFAULT NULL,
  undone_at     DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sync_actions_seq (run_id, seq),
  INDEX idx_sync_actions_kind (kind),
  CONSTRAINT fk_sync_actions_run FOREIGN KEY (run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  external_group_id INT UNSIGNED NOT NULL,
  user_id       VARCHAR(64) DEFAULT NULL,
  kind          ENUM('member_added_on_mirror','member_removed_on_mirror','both_changed','name_changed') NOT NULL,
  moodle_state  VARCHAR(32) DEFAULT NULL,
  foretmap_state VARCHAR(32) DEFAULT NULL,
  detected_run_id INT UNSIGNED DEFAULT NULL,
  detected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME DEFAULT NULL,
  resolved_by_user_id VARCHAR(64) DEFAULT NULL,
  resolution    ENUM('keep_master','apply_other','ignore') DEFAULT NULL,
  INDEX idx_sync_conflicts_open (resolved_at),
  CONSTRAINT fk_sync_conflicts_group FOREIGN KEY (external_group_id) REFERENCES external_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rapprochements en attente (section 8.1, règle 3 : homonymes, et section 13) : le membre
-- Moodle, ses candidats ForetMap et la décision de l'administrateur. Persistés pour survivre
-- d'une exécution à l'autre et être traités depuis l'écran administrateur.
CREATE TABLE IF NOT EXISTS sync_pending_matches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32) NOT NULL,
  issuer        VARCHAR(255) NOT NULL,
  external_id   VARCHAR(64) NOT NULL,
  external_snapshot_json LONGTEXT DEFAULT NULL,
  cohort_idnumber VARCHAR(191) DEFAULT NULL,
  reason        VARCHAR(64) NOT NULL,
  candidates_json LONGTEXT DEFAULT NULL,
  detected_run_id INT UNSIGNED DEFAULT NULL,
  detected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME DEFAULT NULL,
  resolved_by_user_id VARCHAR(64) DEFAULT NULL,
  resolution    ENUM('link','create','ignore') DEFAULT NULL,
  resolved_user_id VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uq_sync_pending_ext (provider, issuer, external_id),
  INDEX idx_sync_pending_open (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marquage « hors synchronisation » (section 11) : posé et retiré depuis l'écran admin seulement.
SET @usersHasSyncExempt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sync_exempt'
);
SET @sql = IF(
  @usersHasSyncExempt = 0,
  'ALTER TABLE users ADD COLUMN sync_exempt TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @groupsHasSyncExempt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = 'sync_exempt'
);
SET @sql = IF(
  @groupsHasSyncExempt = 0,
  'ALTER TABLE `groups` ADD COLUMN sync_exempt TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Permission dédiée (section 13) : catalogue `lib/rbac.js` + rôle admin. Le bootstrap runtime la
-- pose aussi ; cette insertion couvre les bases déjà initialisées sans redémarrage complet.
INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('integrations.moodle.manage', 'Intégration Moodle', 'Configurer, simuler et appliquer la synchronisation Moodle et l''entrée LTI');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'integrations.moodle.manage'
  FROM roles r
 WHERE r.slug = 'admin';
