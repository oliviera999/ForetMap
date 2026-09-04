-- Lot 8 du plan de convergence (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6) : les **parcours**,
-- listes ordonnées de lieux, sans validation ni progression enregistrée.
--
-- Un parcours a un titre, une description, un public visé (« Nouveaux professeurs »,
-- « Portes ouvertes ») et des étapes numérotées qui pointent chacune vers une zone ou un
-- repère. Le couple `target_type` / `target_id` est celui déjà employé par `visit_media` et
-- `visit_seen_*` : un lieu n'est jamais dupliqué.
--
-- `surfaces` reprend le mécanisme du lot 4 : un parcours peut être publié sur le Plan
-- Lyautey, dans la Visite, sur la carte de travail, ou plusieurs à la fois. Idempotent.

CREATE TABLE IF NOT EXISTS map_routes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  audience VARCHAR(120) NOT NULL DEFAULT '',
  surfaces SET('map','visit','plan') NOT NULL DEFAULT 'plan',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_map_routes_map_slug (map_id, slug),
  INDEX idx_map_routes_map (map_id),
  CONSTRAINT fk_map_routes_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS map_route_steps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  route_id VARCHAR(64) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  target_type ENUM('zone','marker') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  step_title VARCHAR(180) NOT NULL DEFAULT '',
  step_text TEXT DEFAULT NULL,
  INDEX idx_map_route_steps_route_position (route_id, position),
  CONSTRAINT fk_map_route_steps_route FOREIGN KEY (route_id) REFERENCES map_routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
