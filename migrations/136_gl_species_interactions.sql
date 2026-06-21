-- Réseau trophique G&L : interactions biotiques entre espèces du catalogue gl_species.
-- Table miroir de `species_interactions` (ForetMap) pour réutiliser le noyau
-- partagé `lib/shared/foodWebCore.js`. Provisionnée en amont de l'UI GL.

CREATE TABLE IF NOT EXISTS gl_species_interactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_species_id INT UNSIGNED NOT NULL,
  to_species_id INT UNSIGNED DEFAULT NULL,
  interaction_type ENUM(
    'pollinisation','herbivorie','predation','plante_hote',
    'decomposition','nitrification','symbiose','competition'
  ) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_interaction (from_species_id, to_species_id, interaction_type),
  KEY idx_gl_si_from (from_species_id),
  KEY idx_gl_si_to (to_species_id),
  KEY idx_gl_si_type (interaction_type),
  CONSTRAINT fk_gl_si_from FOREIGN KEY (from_species_id) REFERENCES gl_species (id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_si_to FOREIGN KEY (to_species_id) REFERENCES gl_species (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vue de lecture parallèle à `v_food_web` (gl_species n'a pas d'emoji : NULL).
DROP VIEW IF EXISTS v_gl_food_web;
CREATE SQL SECURITY INVOKER VIEW v_gl_food_web AS
  SELECT si.id, si.interaction_type,
         sf.id AS from_id, sf.nom_commun AS from_name, NULL AS from_emoji,
         st.id AS to_id, st.nom_commun AS to_name, NULL AS to_emoji,
         si.description
    FROM gl_species_interactions si
    JOIN gl_species sf ON sf.id = si.from_species_id
    LEFT JOIN gl_species st ON st.id = si.to_species_id;
