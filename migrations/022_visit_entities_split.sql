-- Visite V2: zones/repères dédiés (système distinct des tâches)

CREATE TABLE IF NOT EXISTS visit_zones (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  points TEXT NOT NULL,
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_zones_map (map_id),
  INDEX idx_visit_zones_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_zones_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visit_markers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  x_pct DOUBLE NOT NULL,
  y_pct DOUBLE NOT NULL,
  label VARCHAR(255) NOT NULL,
  emoji VARCHAR(16) DEFAULT '📍',
  subtitle VARCHAR(255) DEFAULT '',
  short_description TEXT DEFAULT NULL,
  details_title VARCHAR(255) DEFAULT 'Détails',
  details_text TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_visit_markers_map (map_id),
  INDEX idx_visit_markers_active_sort (is_active, sort_order),
  CONSTRAINT fk_visit_markers_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration douce depuis le modèle V1: reprend uniquement les éléments explicitement configurés pour la visite.
INSERT IGNORE INTO visit_zones
  (id, map_id, name, points, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
SELECT
  z.id,
  z.map_id,
  z.name,
  COALESCE(z.points, '[]') AS points,
  COALESCE(vz.subtitle, ''),
  COALESCE(vz.short_description, ''),
  COALESCE(vz.details_title, 'Détails'),
  COALESCE(vz.details_text, ''),
  COALESCE(vz.is_active, 1),
  COALESCE(vz.sort_order, 0),
  NOW(),
  NOW()
FROM zones z
JOIN visit_zone_content vz ON vz.zone_id = z.id;

INSERT IGNORE INTO visit_markers
  (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
SELECT
  m.id,
  m.map_id,
  m.x_pct,
  m.y_pct,
  m.label,
  COALESCE(m.emoji, '📍'),
  COALESCE(vm.subtitle, ''),
  COALESCE(vm.short_description, ''),
  COALESCE(vm.details_title, 'Détails'),
  COALESCE(vm.details_text, ''),
  COALESCE(vm.is_active, 1),
  COALESCE(vm.sort_order, 0),
  NOW(),
  NOW()
FROM map_markers m
JOIN visit_marker_content vm ON vm.marker_id = m.id;

UPDATE schema_version SET version = 22;
