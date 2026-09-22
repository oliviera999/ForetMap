-- Suivi d'individus (arbres) et mesures (lot 7).
-- tracked_individuals + individual_measurements. Idempotent.

CREATE TABLE IF NOT EXISTS tracked_individuals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plant_id INT UNSIGNED NOT NULL,
  map_id VARCHAR(32) NOT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  marker_id VARCHAR(64) DEFAULT NULL,
  label VARCHAR(160) NOT NULL COMMENT 'Ex. « Grenadier n°2 »',
  planted_at DATE DEFAULT NULL,
  wood_density DECIMAL(4,3) DEFAULT NULL COMMENT 'g/cm³ ; NULL = valeur par défaut 0,6',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ind_plant (plant_id),
  KEY idx_ind_map (map_id),
  CONSTRAINT fk_ind_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE,
  CONSTRAINT fk_ind_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE CASCADE,
  CONSTRAINT fk_ind_zone FOREIGN KEY (zone_id) REFERENCES zones (id) ON DELETE SET NULL,
  CONSTRAINT fk_ind_marker FOREIGN KEY (marker_id) REFERENCES map_markers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS individual_measurements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  individual_id INT UNSIGNED NOT NULL,
  measured_at DATE NOT NULL,
  circumference_cm DECIMAL(6,1) DEFAULT NULL COMMENT 'Mesurée à 1,30 m du sol',
  height_m DECIMAL(5,2) DEFAULT NULL,
  crown_diameter_m DECIMAL(5,2) DEFAULT NULL,
  observer_user_id VARCHAR(64) DEFAULT NULL,
  group_id VARCHAR(64) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meas_ind (individual_id, measured_at),
  CONSTRAINT fk_meas_ind FOREIGN KEY (individual_id) REFERENCES tracked_individuals (id) ON DELETE CASCADE,
  CONSTRAINT fk_meas_user FOREIGN KEY (observer_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_meas_group FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
