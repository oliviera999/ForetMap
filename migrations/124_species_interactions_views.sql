-- Réseau trophique + vues de lecture (SQL SECURITY INVOKER)

CREATE TABLE IF NOT EXISTS species_interactions (
  id int unsigned NOT NULL AUTO_INCREMENT,
  from_plant_id int unsigned NOT NULL,
  to_plant_id int unsigned DEFAULT NULL,
  interaction_type enum(
    'pollinisation','herbivorie','predation','plante_hote',
    'decomposition','nitrification','symbiose','competition'
  ) NOT NULL,
  description varchar(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interaction (from_plant_id, to_plant_id, interaction_type),
  KEY idx_si_from (from_plant_id),
  KEY idx_si_to (to_plant_id),
  KEY idx_si_type (interaction_type),
  CONSTRAINT fk_si_from FOREIGN KEY (from_plant_id) REFERENCES plants (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_to FOREIGN KEY (to_plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP VIEW IF EXISTS v_food_web;
CREATE SQL SECURITY INVOKER VIEW v_food_web AS
  SELECT si.id, si.interaction_type,
         pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji,
         pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji,
         si.description
    FROM species_interactions si
    JOIN plants pf ON pf.id = si.from_plant_id
    LEFT JOIN plants pt ON pt.id = si.to_plant_id;

DROP VIEW IF EXISTS v_species;
CREATE SQL SECURITY INVOKER VIEW v_species AS
  SELECT p.id, p.name, p.emoji, p.scientific_name,
         p.taxon_kingdom, p.taxon_group, p.taxon_family, p.taxon_genus, p.gbif_key,
         p.trophic_role, p.is_ornamental, p.is_edible, p.life_cycle, p.habitat_type,
         p.ph_min, p.ph_max, p.temp_min_c, p.temp_max_c,
         p.description, p.ecosystem_role, p.human_utility, p.harvest_part, p.sources
    FROM plants p;

DROP VIEW IF EXISTS v_zone_inventory;
CREATE SQL SECURITY INVOKER VIEW v_zone_inventory AS
  SELECT z.id AS zone_id, z.name AS zone_name, z.map_id,
         p.id AS plant_id, p.name AS plant_name, p.emoji, p.trophic_role
    FROM zone_species zs
    JOIN zones z ON z.id = zs.zone_id
    JOIN plants p ON p.id = zs.plant_id;
