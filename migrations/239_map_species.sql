-- Espèces rattachées directement à une carte (sans zone / repère précis).
-- Complète zone_species / marker_species pour le filtre « présence sur la carte »
-- (biodiversité, réseau trophique). Ex. oiseaux présents sur le site.

CREATE TABLE IF NOT EXISTS map_species (
  map_id VARCHAR(32) NOT NULL,
  plant_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id, plant_id),
  KEY idx_map_species_plant (plant_id),
  CONSTRAINT fk_map_species_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE CASCADE,
  CONSTRAINT fk_map_species_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
