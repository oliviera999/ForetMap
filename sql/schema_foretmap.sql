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
  sort_order INT UNSIGNED DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO maps (id, label, map_image_url, sort_order) VALUES
  ('foret', 'Forêt comestible', '/maps/map-foret.svg', 1),
  ('n3', 'N3', '/maps/plan%20n3.jpg', 2);

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
  description TEXT DEFAULT '',
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

-- tasks (tâches assignables aux élèves)
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  description TEXT DEFAULT NULL,
  map_id VARCHAR(32) DEFAULT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  marker_id VARCHAR(64) DEFAULT NULL,
  due_date VARCHAR(32) DEFAULT NULL,
  required_students INT UNSIGNED DEFAULT 1,
  status VARCHAR(32) DEFAULT 'available',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_tasks_map_id (map_id),
  INDEX idx_tasks_zone_id (zone_id),
  INDEX idx_tasks_marker_id (marker_id),
  INDEX idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL,
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

INSERT IGNORE INTO tutorials
  (title, slug, type, summary, source_file_path, sort_order, created_at, updated_at)
VALUES
  ('Arrosage au potager', 'arrosage-potager', 'html', 'Tutoriel pratique pour bien arroser au potager.', '/tutos/fiche-arrosage-punk.html', 1, NOW(), NOW()),
  ('Désherbage doux', 'desherbage-doux', 'html', 'Méthodes de désherbage respectueuses du sol vivant.', '/tutos/fiche-desherbage-punk.html', 2, NOW(), NOW()),
  ('Jardin N3', 'jardin-n3', 'html', 'Repères et bonnes pratiques sur la zone N3.', '/tutos/fiche-jardin-punk-n3.html', 3, NOW(), NOW()),
  ('Rempotage', 'rempotage', 'html', 'Tutoriel pas à pas pour le rempotage.', '/tutos/fiche-rempotage-punk.html', 4, NOW(), NOW());

-- task_assignments (élèves assignés à une tâche)
CREATE TABLE IF NOT EXISTS task_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  student_first_name VARCHAR(255) NOT NULL,
  student_last_name VARCHAR(255) NOT NULL,
  assigned_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_assignments_task_id (task_id),
  CONSTRAINT fk_task_assignments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- students (comptes élèves, mot de passe hashé bcrypt)
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(64) PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  pseudo VARCHAR(50) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  avatar_path VARCHAR(512) DEFAULT NULL,
  password VARCHAR(255) DEFAULT NULL,
  last_seen VARCHAR(32) DEFAULT NULL,
  INDEX idx_students_names (first_name, last_name),
  UNIQUE KEY uq_students_pseudo (pseudo),
  UNIQUE KEY uq_students_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_logs (commentaires / images de réalisation d'une tâche)
-- image_path : chemin relatif vers uploads/ (source unique des images)
CREATE TABLE IF NOT EXISTS task_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  student_first_name VARCHAR(255) NOT NULL,
  student_last_name VARCHAR(255) NOT NULL,
  comment TEXT DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_logs_task_id (task_id),
  CONSTRAINT fk_task_logs_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- zone_photos (photos par zone)
CREATE TABLE IF NOT EXISTS zone_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  zone_id VARCHAR(64) NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
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
  note TEXT DEFAULT '',
  emoji VARCHAR(16) DEFAULT '🌱',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_map_markers_map_id (map_id),
  CONSTRAINT fk_map_markers_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  INDEX idx_map_markers_created (created_at)
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
  image_url VARCHAR(512) NOT NULL,
  caption VARCHAR(512) DEFAULT '',
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_media_target (target_type, target_id),
  INDEX idx_visit_media_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visite : sélection de tutoriels affichés sous la carte
CREATE TABLE IF NOT EXISTS visit_tutorials (
  tutorial_id INT UNSIGNED NOT NULL PRIMARY KEY,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_tutorials_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
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
  CONSTRAINT fk_visit_seen_students_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
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
