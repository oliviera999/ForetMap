-- Schéma ForetMap pour MySQL (InnoDB, utf8mb4)
-- Idempotent : CREATE TABLE IF NOT EXISTS
-- À exécuter une fois (db:init) ou manuellement sur la BDD hébergée.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- maps (cartes de travail: foret, n3, ...)
CREATE TABLE IF NOT EXISTS maps (
  id VARCHAR(32) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  map_image_url VARCHAR(512) DEFAULT NULL,
  sort_order INT UNSIGNED DEFAULT 0,
  frame_padding_px INT UNSIGNED DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO maps (id, label, map_image_url, sort_order) VALUES
  ('foret', 'Forêt comestible', '/maps/map-foret.svg', 1),
  ('n3', 'N3', '/maps/plan%20n3.jpg', 2);

-- app_settings (réglages applicatifs pilotables depuis la GUI admin)
CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(191) NOT NULL PRIMARY KEY,
  scope ENUM('public','teacher','admin') NOT NULL DEFAULT 'public',
  value_json LONGTEXT NOT NULL,
  updated_by_user_type VARCHAR(32) DEFAULT NULL,
  updated_by_user_id VARCHAR(64) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- zones (zones du jardin, rect ou polygon)
CREATE TABLE IF NOT EXISTS zones (
  id VARCHAR(64) PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL DEFAULT 'foret',
  name VARCHAR(255) NOT NULL,
  x DOUBLE DEFAULT NULL,
  y DOUBLE DEFAULT NULL,
  width DOUBLE DEFAULT NULL,
  height DOUBLE DEFAULT NULL,
  current_plant VARCHAR(255) DEFAULT '',
  living_beings TEXT DEFAULT NULL,
  stage VARCHAR(64) DEFAULT 'empty',
  special TINYINT(1) DEFAULT 0,
  shape VARCHAR(32) DEFAULT 'rect',
  points TEXT DEFAULT NULL,
  color VARCHAR(32) DEFAULT '#86efac80',
  description TEXT DEFAULT NULL,
  INDEX idx_zones_map_id (map_id),
  CONSTRAINT fk_zones_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- zone_history (historique récoltes par zone)
CREATE TABLE IF NOT EXISTS zone_history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  zone_id VARCHAR(64) NOT NULL,
  plant VARCHAR(255) NOT NULL,
  harvested_at VARCHAR(32) NOT NULL,
  INDEX idx_zone_history_zone_id (zone_id),
  CONSTRAINT fk_zone_history_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- plants (catalogue des plantes)
CREATE TABLE IF NOT EXISTS plants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  emoji VARCHAR(16) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  second_name VARCHAR(255) DEFAULT NULL,
  scientific_name VARCHAR(255) DEFAULT NULL,
  group_1 VARCHAR(255) DEFAULT NULL,
  group_2 VARCHAR(255) DEFAULT NULL,
  group_3 VARCHAR(255) DEFAULT NULL,
  group_4 VARCHAR(255) DEFAULT NULL,
  habitat VARCHAR(255) DEFAULT NULL,
  photo TEXT DEFAULT NULL,
  nutrition TEXT DEFAULT NULL,
  agroecosystem_category VARCHAR(255) DEFAULT NULL,
  longevity VARCHAR(255) DEFAULT NULL,
  remark_1 TEXT DEFAULT NULL,
  remark_2 TEXT DEFAULT NULL,
  remark_3 TEXT DEFAULT NULL,
  reproduction VARCHAR(255) DEFAULT NULL,
  size VARCHAR(255) DEFAULT NULL,
  sources TEXT DEFAULT NULL,
  ideal_temperature_c VARCHAR(64) DEFAULT NULL,
  optimal_ph VARCHAR(64) DEFAULT NULL,
  ecosystem_role TEXT DEFAULT NULL,
  geographic_origin VARCHAR(255) DEFAULT NULL,
  human_utility TEXT DEFAULT NULL,
  harvest_part VARCHAR(255) DEFAULT NULL,
  planting_recommendations TEXT DEFAULT NULL,
  preferred_nutrients TEXT DEFAULT NULL,
  photo_species TEXT DEFAULT NULL,
  photo_leaf TEXT DEFAULT NULL,
  photo_flower TEXT DEFAULT NULL,
  photo_fruit TEXT DEFAULT NULL,
  photo_harvest_part TEXT DEFAULT NULL,
  INDEX idx_plants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_projects (regroupement de tâches par projet)
CREATE TABLE IF NOT EXISTS task_projects (
  id VARCHAR(64) PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_projects_map_id (map_id),
  INDEX idx_task_projects_title (title),
  CONSTRAINT fk_task_projects_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tasks (tâches assignables aux élèves)
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  description TEXT DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  map_id VARCHAR(32) DEFAULT NULL,
  project_id VARCHAR(64) DEFAULT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  marker_id VARCHAR(64) DEFAULT NULL,
  start_date VARCHAR(32) DEFAULT NULL,
  due_date VARCHAR(32) DEFAULT NULL,
  required_students INT UNSIGNED DEFAULT 1,
  completion_mode VARCHAR(32) NOT NULL DEFAULT 'single_done',
  danger_level VARCHAR(32) DEFAULT NULL,
  difficulty_level VARCHAR(32) DEFAULT NULL,
  importance_level VARCHAR(32) DEFAULT NULL,
  living_beings TEXT DEFAULT NULL,
  status VARCHAR(32) DEFAULT 'available',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_tasks_map_id (map_id),
  INDEX idx_tasks_project_id (project_id),
  INDEX idx_tasks_zone_id (zone_id),
  INDEX idx_tasks_marker_id (marker_id),
  INDEX idx_tasks_start_date (start_date),
  INDEX idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liens N-N tâches / zones et tâches / repères (zone_id et marker_id sur tasks = premier lien pour compat)
CREATE TABLE IF NOT EXISTS task_zones (
  task_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, zone_id),
  INDEX idx_task_zones_zone (zone_id),
  CONSTRAINT fk_task_zones_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_zones_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_markers (
  task_id VARCHAR(64) NOT NULL,
  marker_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, marker_id),
  INDEX idx_task_markers_marker (marker_id),
  CONSTRAINT fk_task_markers_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_markers_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tutorials (ressources pédagogiques HTML/lien/PDF)
CREATE TABLE IF NOT EXISTS tutorials (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(190) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'html',
  summary TEXT DEFAULT NULL,
  cover_image_url VARCHAR(512) DEFAULT NULL,
  html_content LONGTEXT DEFAULT NULL,
  source_url TEXT DEFAULT NULL,
  source_file_path VARCHAR(512) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  UNIQUE KEY uq_tutorials_slug (slug),
  INDEX idx_tutorials_type (type),
  INDEX idx_tutorials_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lien N-N tâches / tutoriels
CREATE TABLE IF NOT EXISTS task_tutorials (
  task_id VARCHAR(64) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, tutorial_id),
  INDEX idx_task_tutorials_tutorial (tutorial_id),
  CONSTRAINT fk_task_tutorials_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liens N-N tutoriels / zones et repères (indication sur la carte)
CREATE TABLE IF NOT EXISTS tutorial_zones (
  tutorial_id INT UNSIGNED NOT NULL,
  zone_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (tutorial_id, zone_id),
  INDEX idx_tutorial_zones_zone (zone_id),
  CONSTRAINT fk_tutorial_zones_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE,
  CONSTRAINT fk_tutorial_zones_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tutorial_markers (
  tutorial_id INT UNSIGNED NOT NULL,
  marker_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (tutorial_id, marker_id),
  INDEX idx_tutorial_markers_marker (marker_id),
  CONSTRAINT fk_tutorial_markers_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE,
  CONSTRAINT fk_tutorial_markers_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lien N-N tâches / utilisateurs référents (contact questions)
CREATE TABLE IF NOT EXISTS task_referents (
  task_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, user_id),
  INDEX idx_task_referents_user (user_id),
  CONSTRAINT fk_task_referents_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_referents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liens N-N projets de tâches / zones, repères et tutoriels
CREATE TABLE IF NOT EXISTS project_zones (
  project_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (project_id, zone_id),
  INDEX idx_project_zones_zone (zone_id),
  CONSTRAINT fk_project_zones_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_zones_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_markers (
  project_id VARCHAR(64) NOT NULL,
  marker_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (project_id, marker_id),
  INDEX idx_project_markers_marker (marker_id),
  CONSTRAINT fk_project_markers_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_markers_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_tutorials (
  project_id VARCHAR(64) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (project_id, tutorial_id),
  INDEX idx_project_tutorials_tutorial (tutorial_id),
  CONSTRAINT fk_project_tutorials_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lectures attestées par l’utilisateur (tutoriels)
CREATE TABLE IF NOT EXISTS user_tutorial_reads (
  user_id VARCHAR(64) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  acknowledged_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, tutorial_id),
  INDEX idx_user_tutorial_reads_tutorial (tutorial_id),
  CONSTRAINT fk_user_tutorial_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_tutorial_reads_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Observations attestées par espèce (catalogue biodiversité / plants ; plusieurs par utilisateur)
CREATE TABLE IF NOT EXISTS user_plant_observation_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plant_id INT UNSIGNED NOT NULL,
  observed_at VARCHAR(32) NOT NULL,
  INDEX idx_upoe_user_plant (user_id, plant_id),
  INDEX idx_upoe_plant (plant_id),
  CONSTRAINT fk_upoe_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upoe_plant FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tutorials
  (title, slug, type, summary, source_file_path, sort_order, created_at, updated_at)
VALUES
  ('Arrosage au potager', 'arrosage-potager', 'html', 'Tutoriel pratique pour bien arroser au potager.', '/tutos/fiche-arrosage-punk.html', 1, NOW(), NOW()),
  ('Désherbage doux', 'desherbage-doux', 'html', 'Méthodes de désherbage respectueuses du sol vivant.', '/tutos/fiche-desherbage-punk.html', 2, NOW(), NOW()),
  ('Jardin N3', 'jardin-n3', 'html', 'Repères et bonnes pratiques sur la zone N3.', '/tutos/fiche-jardin-punk-n3.html', 3, NOW(), NOW()),
  ('Rempotage', 'rempotage', 'html', 'Tutoriel pas à pas pour le rempotage.', '/tutos/fiche-rempotage-punk.html', 4, NOW(), NOW()),
  ('Associations de plantes', 'associations-plantes', 'html', 'Associer les plantes pour favoriser la biodiversité et les récoltes.', '/tutos/fiche-associations-punk.html', 5, NOW(), NOW()),
  ('Compostage', 'compostage', 'html', 'Comprendre et réussir le compostage au jardin.', '/tutos/fiche-compost-punk.html', 6, NOW(), NOW()),
  ('Eau au jardin', 'eau-au-jardin', 'html', 'Mieux gérer l’eau au jardin et limiter le gaspillage.', '/tutos/fiche-eau-punk.html', 7, NOW(), NOW()),
  ('Semences', 'semences', 'html', 'Récolter, conserver et utiliser les semences.', '/tutos/fiche-semences-punk.html', 8, NOW(), NOW()),
  ('Lire son sol', 'lire-son-sol', 'html', 'Observer et interpréter les caractéristiques du sol.', '/tutos/fiche-sol-punk.html', 9, NOW(), NOW()),
  ('Sol vivant', 'sol-vivant', 'html', 'Découvrir le rôle du sol vivant dans la santé du jardin.', '/tutos/fiche-sol-vivant-punk.html', 10, NOW(), NOW());

-- task_assignments (élèves assignés à une tâche)
CREATE TABLE IF NOT EXISTS task_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) DEFAULT NULL,
  student_first_name VARCHAR(255) NOT NULL,
  student_last_name VARCHAR(255) NOT NULL,
  done_at VARCHAR(32) DEFAULT NULL,
  assigned_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_assignments_task_id (task_id),
  INDEX idx_task_assignments_student_id (student_id),
  CONSTRAINT fk_task_assignments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- forum global (threads, posts, signalements)
CREATE TABLE IF NOT EXISTS forum_threads (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_post_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_forum_threads_last_post (is_pinned, last_post_at, created_at),
  INDEX idx_forum_threads_author (author_user_type, author_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_posts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  thread_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  image_paths_json TEXT NULL DEFAULT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_posts_thread_created (thread_id, created_at),
  INDEX idx_forum_posts_author (author_user_type, author_user_id, created_at),
  CONSTRAINT fk_forum_posts_thread FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  reporter_user_type VARCHAR(16) NOT NULL,
  reporter_user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_forum_reports_post (post_id, created_at),
  INDEX idx_forum_reports_status (status, created_at),
  INDEX idx_forum_reports_reporter (reporter_user_type, reporter_user_id, created_at),
  CONSTRAINT fk_forum_reports_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_post_reactions (
  post_id VARCHAR(64) NOT NULL,
  reactor_user_type VARCHAR(16) NOT NULL,
  reactor_user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, reactor_user_type, reactor_user_id, emoji),
  INDEX idx_forum_post_reactions_post (post_id, created_at),
  INDEX idx_forum_post_reactions_reactor (reactor_user_type, reactor_user_id, created_at),
  CONSTRAINT fk_forum_post_reactions_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- commentaires contextuels (tâches, projets, zones)
CREATE TABLE IF NOT EXISTS context_comments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  context_type VARCHAR(16) NOT NULL,
  context_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  image_paths_json TEXT NULL DEFAULT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_context_comments_context_created (context_type, context_id, created_at),
  INDEX idx_context_comments_author (author_user_type, author_user_id, created_at),
  INDEX idx_context_comments_deleted (context_type, context_id, is_deleted, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS context_comment_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  comment_id VARCHAR(64) NOT NULL,
  reporter_user_type VARCHAR(16) NOT NULL,
  reporter_user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_context_comment_reports_comment (comment_id, created_at),
  INDEX idx_context_comment_reports_status (status, created_at),
  INDEX idx_context_comment_reports_reporter (reporter_user_type, reporter_user_id, created_at),
  CONSTRAINT fk_context_comment_reports_comment FOREIGN KEY (comment_id) REFERENCES context_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS context_comment_reactions (
  comment_id VARCHAR(64) NOT NULL,
  reactor_user_type VARCHAR(16) NOT NULL,
  reactor_user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, reactor_user_type, reactor_user_id, emoji),
  INDEX idx_context_comment_reactions_comment (comment_id, created_at),
  INDEX idx_context_comment_reactions_reactor (reactor_user_type, reactor_user_id, created_at),
  CONSTRAINT fk_context_comment_reactions_comment FOREIGN KEY (comment_id) REFERENCES context_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users (identité unifiée progressive, compatible students/teachers)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  user_type VARCHAR(16) NOT NULL,
  legacy_user_id VARCHAR(64) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  pseudo VARCHAR(50) DEFAULT NULL,
  first_name VARCHAR(255) DEFAULT NULL,
  last_name VARCHAR(255) DEFAULT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  avatar_path VARCHAR(512) DEFAULT NULL,
  affiliation VARCHAR(16) DEFAULT 'both',
  password_hash VARCHAR(255) DEFAULT NULL,
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'local',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen VARCHAR(32) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_type_legacy (user_type, legacy_user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_pseudo (pseudo),
  INDEX idx_users_type_active (user_type, is_active),
  INDEX idx_users_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- password_reset_tokens (usage unique, hash du token uniquement)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_type VARCHAR(16) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_lookup (user_type, user_id),
  INDEX idx_password_reset_expires (expires_at),
  INDEX idx_password_reset_used (used_at),
  UNIQUE KEY uq_password_reset_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC: profils et permissions configurables
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  emoji VARCHAR(16) DEFAULT NULL,
  min_done_tasks INT UNSIGNED DEFAULT NULL,
  display_order INT NOT NULL DEFAULT 0,
  `rank` INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  forum_participate TINYINT(1) NOT NULL DEFAULT 1,
  context_comment_participate TINYINT(1) NOT NULL DEFAULT 1,
  max_concurrent_tasks INT UNSIGNED NULL DEFAULT NULL,
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

-- security_events (historique structuré des actions utilisateur)
CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  actor_user_type VARCHAR(16) DEFAULT NULL,
  action VARCHAR(96) NOT NULL,
  target_type VARCHAR(32) DEFAULT NULL,
  target_id VARCHAR(64) DEFAULT NULL,
  result VARCHAR(16) NOT NULL DEFAULT 'success',
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  payload_json JSON DEFAULT NULL,
  INDEX idx_security_events_occurred (occurred_at),
  INDEX idx_security_events_actor (actor_user_id, occurred_at),
  INDEX idx_security_events_action (action, occurred_at),
  INDEX idx_security_events_target (target_type, target_id, occurred_at),
  CONSTRAINT fk_security_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit_log (historique consultable en UI prof)
CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) DEFAULT NULL,
  details TEXT DEFAULT NULL,
  actor_user_type VARCHAR(16) DEFAULT NULL,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  result VARCHAR(16) NOT NULL DEFAULT 'success',
  created_at VARCHAR(32) DEFAULT NULL,
  occurred_at DATETIME DEFAULT NULL,
  payload_json JSON DEFAULT NULL,
  INDEX idx_audit_actor (actor_user_type, actor_user_id, id),
  INDEX idx_audit_action (action, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- observation_logs (carnet d'observation élève, hors tâches)
CREATE TABLE IF NOT EXISTS observation_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  content TEXT NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_observation_logs_student (student_id),
  CONSTRAINT fk_observation_logs_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_observation_logs_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_logs (commentaires / images de réalisation d'une tâche)
-- image_path : chemin relatif vers uploads/ (source unique des images)
CREATE TABLE IF NOT EXISTS task_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) DEFAULT NULL,
  student_first_name VARCHAR(255) NOT NULL,
  student_last_name VARCHAR(255) NOT NULL,
  comment TEXT DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_logs_task_id (task_id),
  INDEX idx_task_logs_student_id (student_id),
  CONSTRAINT fk_task_logs_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_logs_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- zone_photos (photos par zone)
CREATE TABLE IF NOT EXISTS zone_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  zone_id VARCHAR(64) NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_zone_photos_zone_id (zone_id),
  CONSTRAINT fk_zone_photos_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- map_markers (repères sur la carte)
CREATE TABLE IF NOT EXISTS map_markers (
  id VARCHAR(64) PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL DEFAULT 'foret',
  x_pct DOUBLE NOT NULL,
  y_pct DOUBLE NOT NULL,
  label VARCHAR(255) NOT NULL,
  plant_name VARCHAR(255) DEFAULT '',
  living_beings TEXT DEFAULT NULL,
  note TEXT DEFAULT NULL,
  emoji VARCHAR(16) DEFAULT '🌱',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_map_markers_map_id (map_id),
  CONSTRAINT fk_map_markers_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  INDEX idx_map_markers_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- marker_photos (photos par repère carte)
CREATE TABLE IF NOT EXISTS marker_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  marker_id VARCHAR(64) NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_marker_photos_marker_id (marker_id),
  CONSTRAINT fk_marker_photos_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : contenus éditoriaux par zone (publics)
CREATE TABLE IF NOT EXISTS visit_zones (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  points TEXT NOT NULL,
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_zones_map (map_id),
  INDEX idx_visit_zones_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_zones_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visit_markers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  x_pct DOUBLE NOT NULL,
  y_pct DOUBLE NOT NULL,
  label VARCHAR(255) NOT NULL,
  emoji VARCHAR(16) DEFAULT '📍',
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_markers_map (map_id),
  INDEX idx_visit_markers_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_markers_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy V1 (visit_zone_content / visit_marker_content) conservées pour rétrocompatibilité.
CREATE TABLE IF NOT EXISTS visit_zone_content (
  zone_id VARCHAR(64) NOT NULL PRIMARY KEY,
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_zone_content_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_zone_content_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : contenus éditoriaux par repère (publics)
CREATE TABLE IF NOT EXISTS visit_marker_content (
  marker_id VARCHAR(64) NOT NULL PRIMARY KEY,
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_marker_content_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_marker_content_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : photos (zone ou repère)
CREATE TABLE IF NOT EXISTS visit_media (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  image_url VARCHAR(512) DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_media_target (target_type, target_id),
  INDEX idx_visit_media_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : sélection de tutoriels affichés sous la carte (par plan map_id)
CREATE TABLE IF NOT EXISTS visit_tutorials (
  map_id VARCHAR(32) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  updated_at VARCHAR(32) DEFAULT NULL,
  PRIMARY KEY (map_id, tutorial_id),
  INDEX idx_visit_tutorials_active_sort (map_id, is_active, sort_order),
  CONSTRAINT fk_visit_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_tutorials_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : packs mascotte sprite_cut (JSON + publication par carte)
CREATE TABLE IF NOT EXISTS visit_mascot_packs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  catalog_id VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  pack_json LONGTEXT NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uq_visit_mascot_packs_map_catalog (map_id, catalog_id),
  INDEX idx_visit_mascot_packs_map_published (map_id, is_published),
  CONSTRAINT fk_visit_mascot_packs_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_visit_mascot_packs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : sprites partagés par carte (bibliothèque réutilisable entre packs)
CREATE TABLE IF NOT EXISTS visit_mascot_sprite_library (
  id CHAR(36) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  filename VARCHAR(128) NOT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uq_visit_mascot_sprite_lib_map_file (map_id, filename),
  INDEX idx_visit_mascot_sprite_lib_map (map_id),
  CONSTRAINT fk_visit_mascot_sprite_lib_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_visit_mascot_sprite_lib_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : progression vue/non-vu pour élèves connectés
CREATE TABLE IF NOT EXISTS visit_seen_students (
  student_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, target_type, target_id),
  INDEX idx_visit_seen_students_target (target_type, target_id),
  CONSTRAINT fk_visit_seen_students_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : progression vue/non-vu pour visiteurs anonymes (TTL applicatif 1 jour)
CREATE TABLE IF NOT EXISTS visit_seen_anonymous (
  anon_token VARCHAR(128) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (anon_token, target_type, target_id),
  INDEX idx_visit_seen_anonymous_target (target_type, target_id),
  INDEX idx_visit_seen_anonymous_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
