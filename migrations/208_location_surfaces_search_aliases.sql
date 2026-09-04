-- Lot 4 du plan de convergence (docs/AUDIT_CONVERGENCE_APPS_2026-09.md §6, Plan Lyautey v1) :
-- un même lieu (zone ou repère) est affiché sur plusieurs « surfaces » — la carte de travail
-- ForetMap (`map`), la Visite (`visit`) et le Plan Lyautey (`plan`). La visibilité se règle à
-- deux niveaux, sans dupliquer les lieux :
--   - par catégorie : `location_categories.surfaces` (surfaces où la catégorie apparaît ;
--     décocher une surface retire d'un coup tous les lieux de la catégorie) ;
--   - par lieu : `zones.hidden_surfaces` / `map_markers.hidden_surfaces` (surfaces où ce lieu
--     précis est masqué, quelle que soit sa catégorie).
-- `search_aliases` : autres noms d'un lieu (séparés par « ; ») pour la recherche du plan
-- (« CDI » ↔ « bibliothèque »). Idempotent (ADD COLUMN IF NOT EXISTS, cf. 206).

ALTER TABLE location_categories
  ADD COLUMN IF NOT EXISTS surfaces SET('map','visit','plan') NOT NULL DEFAULT 'map,visit,plan'
    COMMENT 'Surfaces où la catégorie (et ses lieux) apparaît';

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS hidden_surfaces SET('map','visit','plan') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où cette zone est masquée',
  ADD COLUMN IF NOT EXISTS search_aliases TEXT NULL DEFAULT NULL
    COMMENT 'Autres noms pour la recherche, séparés par ;';

ALTER TABLE map_markers
  ADD COLUMN IF NOT EXISTS hidden_surfaces SET('map','visit','plan') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où ce repère est masqué',
  ADD COLUMN IF NOT EXISTS search_aliases TEXT NULL DEFAULT NULL
    COMMENT 'Autres noms pour la recherche, séparés par ;';
