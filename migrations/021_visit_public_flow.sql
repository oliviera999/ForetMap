-- Système de visite publique (contenu + progression connecté/anonyme)

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

CREATE TABLE IF NOT EXISTS visit_tutorials (
  tutorial_id INT UNSIGNED NOT NULL PRIMARY KEY,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_tutorials_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS visit_seen_anonymous (
  anon_token VARCHAR(128) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (anon_token, target_type, target_id),
  INDEX idx_visit_seen_anonymous_target (target_type, target_id),
  INDEX idx_visit_seen_anonymous_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE schema_version SET version = 21;
