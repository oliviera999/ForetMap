-- Médiathèque sprites visite réutilisable par carte (référence packs mascotte v2+)
CREATE TABLE IF NOT EXISTS visit_mascot_sprite_library (
  id CHAR(36) NOT NULL PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  filename VARCHAR(128) NOT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uq_visit_mascot_sprite_lib_map_file (map_id, filename),
  INDEX idx_visit_mascot_sprite_lib_map (map_id),
  CONSTRAINT fk_visit_mascot_sprite_lib_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT,
  CONSTRAINT fk_visit_mascot_sprite_lib_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
