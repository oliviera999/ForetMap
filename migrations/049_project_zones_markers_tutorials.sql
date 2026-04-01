-- Projets de tâches : liaisons zones / repères / tutoriels (idempotent)

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
