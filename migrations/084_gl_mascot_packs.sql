CREATE TABLE IF NOT EXISTS gl_mascot_packs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  chapter_id INT UNSIGNED DEFAULT NULL,
  name VARCHAR(160) NOT NULL,
  version VARCHAR(32) NOT NULL DEFAULT '1.0',
  payload_json LONGTEXT NOT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_mascot_packs_chapter (chapter_id),
  CONSTRAINT fk_gl_mascot_packs_chapter
    FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE SET NULL,
  CONSTRAINT fk_gl_mascot_packs_created_by
    FOREIGN KEY (created_by) REFERENCES gl_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_mascot_pack_assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pack_id INT UNSIGNED NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  asset_path VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_mascot_pack_asset (pack_id, filename),
  CONSTRAINT fk_gl_mascot_pack_assets_pack
    FOREIGN KEY (pack_id) REFERENCES gl_mascot_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_mascot_sprite_library (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  chapter_id INT UNSIGNED DEFAULT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  asset_path VARCHAR(512) NOT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_mascot_sprite_library (chapter_id, filename),
  CONSTRAINT fk_gl_mascot_sprite_library_chapter
    FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE SET NULL,
  CONSTRAINT fk_gl_mascot_sprite_library_admin
    FOREIGN KEY (created_by) REFERENCES gl_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
