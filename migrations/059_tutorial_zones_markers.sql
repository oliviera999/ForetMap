-- Liens tutoriel <-> zones et tutoriel <-> repères (carte principale)
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
