-- 204_location_categories.sql
-- Catégories de lieux (zones et repères), rattachables à une carte ou globales.
--
-- Remplace deux mécanismes hétérogènes :
--   * `zones.special` (drapeau bâtiment / infrastructure) → catégorie « Infrastructure »
--     portant `is_infrastructure = 1` ;
--   * `zones.stage` (Vide / En croissance / Prêt à récolter) → supprimé côté application
--     (état jamais consommé : ni statistique, ni alerte ; l'historique de récolte
--     `zone_history` dépend de `current_plant`, pas de `stage`).
--
-- Les colonnes `zones.stage` et `zones.special` sont CONSERVÉES (dépréciées) : elles
-- restent écrites par la synchronisation carte → visite et par l'export SQL. `special`
-- devient un miroir dérivé des catégories, la source de vérité étant la jonction.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS location_categories (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) DEFAULT NULL,
  slug VARCHAR(120) NOT NULL,
  label VARCHAR(120) NOT NULL,
  emoji VARCHAR(16) NOT NULL DEFAULT '',
  color VARCHAR(32) NOT NULL DEFAULT '#86efac90',
  description VARCHAR(512) NOT NULL DEFAULT '',
  applies_to ENUM('zone','marker','both') NOT NULL DEFAULT 'both',
  is_infrastructure TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_location_categories_map (map_id),
  INDEX idx_location_categories_slug (slug),
  CONSTRAINT fk_location_categories_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zone_categories (
  zone_id VARCHAR(64) NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (zone_id, category_id),
  INDEX idx_zone_categories_category (category_id),
  CONSTRAINT fk_zone_categories_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE,
  CONSTRAINT fk_zone_categories_category FOREIGN KEY (category_id) REFERENCES location_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marker_categories (
  marker_id VARCHAR(64) NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marker_id, category_id),
  INDEX idx_marker_categories_category (category_id),
  CONSTRAINT fk_marker_categories_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE,
  CONSTRAINT fk_marker_categories_category FOREIGN KEY (category_id) REFERENCES location_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catégorie de reprise : toutes cartes, applicable zones + repères.
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active)
VALUES
  ('cat-infrastructure', NULL, 'infrastructure', 'Infrastructure', '🏗️', '#dbeafe90',
   'Bâtiment ou aménagement (mare, ruches, compostage, cuve…) plutôt qu''une culture.',
   'both', 1, 10, 1);

-- Reprise des zones spéciales existantes.
-- Limite connue : les scripts d'import historiques (scripts/migrate-sqlite-to-mysql.js,
-- lib/sqliteGardenSqlExport.js) écrivent encore `special` en direct. Une zone importée
-- APRÈS cette migration avec `special = 1` devra être recatégorisée à la main — la
-- jonction, pas la colonne, fait foi côté application.
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT z.id, 'cat-infrastructure' FROM zones z WHERE z.special = 1;
