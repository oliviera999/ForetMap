-- Schéma ForetMap pour MySQL (InnoDB, utf8mb4)
-- Idempotent : CREATE TABLE IF NOT EXISTS
-- À exécuter une fois (db:init) ou manuellement sur la BDD hébergée.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- zones (zones du jardin, rect ou polygon)
CREATE TABLE IF NOT EXISTS zones (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  x DOUBLE DEFAULT NULL,
  y DOUBLE DEFAULT NULL,
  width DOUBLE DEFAULT NULL,
  height DOUBLE DEFAULT NULL,
  current_plant VARCHAR(255) DEFAULT '',
  stage VARCHAR(64) DEFAULT 'empty',
  special TINYINT(1) DEFAULT 0,
  shape VARCHAR(32) DEFAULT 'rect',
  points TEXT DEFAULT NULL,
  color VARCHAR(32) DEFAULT '#86efac80',
  description TEXT DEFAULT ''
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
  INDEX idx_plants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tasks (tâches assignables aux élèves)
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  description TEXT DEFAULT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  due_date VARCHAR(32) DEFAULT NULL,
  required_students INT UNSIGNED DEFAULT 1,
  status VARCHAR(32) DEFAULT 'available',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_tasks_zone_id (zone_id),
  INDEX idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  password VARCHAR(255) DEFAULT NULL,
  last_seen VARCHAR(32) DEFAULT NULL,
  INDEX idx_students_names (first_name, last_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_logs (commentaires / images de réalisation d'une tâche)
-- image_path : chemin relatif vers uploads/ si image sur disque (sinon image_data legacy)
CREATE TABLE IF NOT EXISTS task_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  student_first_name VARCHAR(255) NOT NULL,
  student_last_name VARCHAR(255) NOT NULL,
  comment TEXT DEFAULT NULL,
  image_data LONGTEXT DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_logs_task_id (task_id),
  CONSTRAINT fk_task_logs_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- zone_photos (photos par zone ; image_path si sur disque, sinon image_data legacy)
CREATE TABLE IF NOT EXISTS zone_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  zone_id VARCHAR(64) NOT NULL,
  image_data LONGTEXT DEFAULT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
  uploaded_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_zone_photos_zone_id (zone_id),
  CONSTRAINT fk_zone_photos_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- map_markers (repères sur la carte)
CREATE TABLE IF NOT EXISTS map_markers (
  id VARCHAR(64) PRIMARY KEY,
  x_pct DOUBLE NOT NULL,
  y_pct DOUBLE NOT NULL,
  label VARCHAR(255) NOT NULL,
  plant_name VARCHAR(255) DEFAULT '',
  note TEXT DEFAULT '',
  emoji VARCHAR(16) DEFAULT '🌱',
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_map_markers_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
