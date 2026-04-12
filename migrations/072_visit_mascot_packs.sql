-- Packs mascotte visite (JSON sprite_cut, publication par carte)
CREATE TABLE IF NOT EXISTS visit_mascot_packs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  catalog_id VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  pack_json LONGTEXT NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uq_visit_mascot_packs_map_catalog (map_id, catalog_id),
  INDEX idx_visit_mascot_packs_map_published (map_id, is_published),
  CONSTRAINT fk_visit_mascot_packs_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_visit_mascot_packs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
