-- RBAC hard-switch: profils, permissions, PIN par profil, attribution utilisateurs

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  `rank` INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  `key` VARCHAR(120) NOT NULL PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  description TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_key VARCHAR(120) NOT NULL,
  requires_elevation TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_key) REFERENCES permissions(`key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_pin_secrets (
  role_id INT UNSIGNED NOT NULL PRIMARY KEY,
  pin_hash VARCHAR(128) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_role_pin_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_type VARCHAR(16) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_type, user_id, role_id),
  INDEX idx_user_roles_lookup (user_type, user_id, is_primary),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elevation_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_type VARCHAR(16) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_elevation_audit_user (user_type, user_id, created_at),
  CONSTRAINT fk_elevation_audit_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (slug, display_name, `rank`, is_system) VALUES
  ('admin', 'Admin', 500, 1),
  ('prof', 'Prof', 400, 1),
  ('eleve_chevronne', 'Élève chevronné', 300, 1),
  ('eleve_avance', 'Élève avancé', 200, 1),
  ('eleve_novice', 'Élève novice', 100, 1);

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('teacher.access', 'Accès interface professeur', 'Permet d’ouvrir l’interface professeur'),
  ('admin.roles.manage', 'Gestion des profils RBAC', 'Créer/renommer profils, permissions et PIN'),
  ('admin.users.assign_roles', 'Attribution des profils', 'Attribuer/retraiter un profil aux utilisateurs'),
  ('stats.read.all', 'Lecture stats globales', 'Consulter les stats de tous les élèves'),
  ('stats.export', 'Export stats', 'Exporter les stats élèves en CSV'),
  ('students.import', 'Import élèves', 'Importer des élèves via CSV/XLSX'),
  ('students.delete', 'Suppression élève', 'Supprimer un compte élève'),
  ('tasks.manage', 'Gestion tâches', 'Créer/éditer/supprimer les tâches'),
  ('tasks.validate', 'Validation tâches', 'Valider les tâches terminées'),
  ('tasks.propose', 'Proposition de tâches', 'Proposer de nouvelles tâches'),
  ('tasks.assign_self', 'Prise en charge tâche', 'S’assigner à une tâche'),
  ('tasks.unassign_self', 'Retrait de tâche', 'Se retirer d’une tâche'),
  ('tasks.done_self', 'Soumission de tâche', 'Marquer une tâche comme faite'),
  ('zones.manage', 'Gestion zones', 'Créer/éditer/supprimer zones et photos'),
  ('map.manage_markers', 'Gestion repères', 'Créer/éditer/supprimer repères'),
  ('plants.manage', 'Gestion biodiversité', 'Créer/éditer/supprimer/importer plantes'),
  ('tutorials.manage', 'Gestion tutoriels', 'Créer/éditer/supprimer tutoriels'),
  ('visit.manage', 'Gestion visite', 'Gérer la carte de visite publique'),
  ('audit.read', 'Lecture audit', 'Consulter le journal d’audit'),
  ('observations.read.all', 'Lecture observations globales', 'Consulter toutes les observations');

INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation)
SELECT r.id, p.permission_key, p.requires_elevation
FROM (
  SELECT 'admin' AS role_slug, 'teacher.access' AS permission_key, 0 AS requires_elevation UNION ALL
  SELECT 'admin','admin.roles.manage',1 UNION ALL
  SELECT 'admin','admin.users.assign_roles',1 UNION ALL
  SELECT 'admin','stats.read.all',0 UNION ALL
  SELECT 'admin','stats.export',1 UNION ALL
  SELECT 'admin','students.import',1 UNION ALL
  SELECT 'admin','students.delete',1 UNION ALL
  SELECT 'admin','tasks.manage',1 UNION ALL
  SELECT 'admin','tasks.validate',1 UNION ALL
  SELECT 'admin','tasks.propose',0 UNION ALL
  SELECT 'admin','tasks.assign_self',0 UNION ALL
  SELECT 'admin','tasks.unassign_self',0 UNION ALL
  SELECT 'admin','tasks.done_self',0 UNION ALL
  SELECT 'admin','zones.manage',1 UNION ALL
  SELECT 'admin','map.manage_markers',1 UNION ALL
  SELECT 'admin','plants.manage',1 UNION ALL
  SELECT 'admin','tutorials.manage',1 UNION ALL
  SELECT 'admin','visit.manage',1 UNION ALL
  SELECT 'admin','audit.read',1 UNION ALL
  SELECT 'admin','observations.read.all',1 UNION ALL

  SELECT 'prof','teacher.access',0 UNION ALL
  SELECT 'prof','stats.read.all',0 UNION ALL
  SELECT 'prof','stats.export',1 UNION ALL
  SELECT 'prof','students.import',1 UNION ALL
  SELECT 'prof','students.delete',1 UNION ALL
  SELECT 'prof','tasks.manage',1 UNION ALL
  SELECT 'prof','tasks.validate',1 UNION ALL
  SELECT 'prof','tasks.propose',0 UNION ALL
  SELECT 'prof','tasks.assign_self',0 UNION ALL
  SELECT 'prof','tasks.unassign_self',0 UNION ALL
  SELECT 'prof','tasks.done_self',0 UNION ALL
  SELECT 'prof','zones.manage',1 UNION ALL
  SELECT 'prof','map.manage_markers',1 UNION ALL
  SELECT 'prof','plants.manage',1 UNION ALL
  SELECT 'prof','tutorials.manage',1 UNION ALL
  SELECT 'prof','visit.manage',1 UNION ALL
  SELECT 'prof','audit.read',1 UNION ALL
  SELECT 'prof','observations.read.all',1 UNION ALL

  SELECT 'eleve_chevronne','tasks.propose',1 UNION ALL
  SELECT 'eleve_chevronne','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_chevronne','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_chevronne','tasks.done_self',0 UNION ALL

  SELECT 'eleve_avance','tasks.propose',0 UNION ALL
  SELECT 'eleve_avance','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_avance','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_avance','tasks.done_self',0 UNION ALL

  SELECT 'eleve_novice','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_novice','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_novice','tasks.done_self',0
) p
JOIN roles r ON r.slug = p.role_slug;

-- PIN initial par profil = "1234" (SHA-256), à changer ensuite via l'admin
INSERT IGNORE INTO role_pin_secrets (role_id, pin_hash)
SELECT id, SHA2('1234', 256) FROM roles;

-- Hard-switch: attribution des rôles existants
INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary)
SELECT 'teacher', t.id, r.id, 1
FROM users t
JOIN roles r ON r.slug = 'prof'
WHERE t.user_type = 'teacher';

INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary)
SELECT 'student', s.id, r.id, 1
FROM users s
JOIN roles r ON r.slug = 'eleve_novice'
WHERE s.user_type = 'student';

UPDATE schema_version SET version = 25;
