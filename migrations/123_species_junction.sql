-- Tables de liaison espèces (remplace progressivement living_beings JSON)

CREATE TABLE IF NOT EXISTS plant_name_aliases (
  alias varchar(255) NOT NULL,
  plant_id int unsigned NOT NULL,
  PRIMARY KEY (alias),
  KEY idx_alias_plant (plant_id),
  CONSTRAINT fk_alias_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zone_species (
  zone_id varchar(64) NOT NULL,
  plant_id int unsigned NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (zone_id, plant_id),
  KEY idx_zone_species_plant (plant_id),
  CONSTRAINT fk_zone_species_zone FOREIGN KEY (zone_id) REFERENCES zones (id) ON DELETE CASCADE,
  CONSTRAINT fk_zone_species_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marker_species (
  marker_id varchar(64) NOT NULL,
  plant_id int unsigned NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (marker_id, plant_id),
  KEY idx_marker_species_plant (plant_id),
  CONSTRAINT fk_marker_species_marker FOREIGN KEY (marker_id) REFERENCES map_markers (id) ON DELETE CASCADE,
  CONSTRAINT fk_marker_species_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_species (
  task_id varchar(64) NOT NULL,
  plant_id int unsigned NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (task_id, plant_id),
  KEY idx_task_species_plant (plant_id),
  CONSTRAINT fk_task_species_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_species_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
