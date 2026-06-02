-- Catalogue sortilèges G&L (catégories + fiches + liaison chapitre)

CREATE TABLE IF NOT EXISTS gl_spell_categories (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  nom VARCHAR(180) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_spell_categories_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_spells (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  spell_code VARCHAR(16) NOT NULL,
  category_slug VARCHAR(64) NOT NULL,
  nom VARCHAR(255) NOT NULL,
  emoji VARCHAR(32) DEFAULT NULL,
  cout_gemmes INT NOT NULL DEFAULT 0,
  cout_coeurs INT NOT NULL DEFAULT 0,
  cout_total_eq VARCHAR(120) DEFAULT NULL,
  portee VARCHAR(120) DEFAULT NULL,
  cible VARCHAR(120) DEFAULT NULL,
  timing VARCHAR(120) DEFAULT NULL,
  effet_court TEXT DEFAULT NULL,
  effet_detaille TEXT DEFAULT NULL,
  limite_usage VARCHAR(255) DEFAULT NULL,
  cumul VARCHAR(64) DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'officiel',
  source VARCHAR(255) DEFAULT NULL,
  notes_pedagogiques TEXT DEFAULT NULL,
  cree_le DATE DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_spells_code (spell_code),
  INDEX idx_gl_spells_category_statut (category_slug, statut),
  INDEX idx_gl_spells_nom (nom),
  CONSTRAINT fk_gl_spells_category FOREIGN KEY (category_slug) REFERENCES gl_spell_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_chapter_spells (
  chapter_id INT UNSIGNED NOT NULL,
  spell_code VARCHAR(16) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  PRIMARY KEY (chapter_id, spell_code),
  INDEX idx_gl_chapter_spells_order (chapter_id, order_index),
  CONSTRAINT fk_gl_chapter_spells_chapter FOREIGN KEY (chapter_id)
    REFERENCES gl_chapters(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_chapter_spells_spell FOREIGN KEY (spell_code)
    REFERENCES gl_spells(spell_code) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_chapters
  ADD COLUMN sortileges_markdown LONGTEXT DEFAULT NULL AFTER biocenose_markdown;

INSERT INTO gl_spell_categories (slug, nom, order_index, created_at, updated_at) VALUES
  ('vie', 'Vie', 10, NOW(), NOW()),
  ('mouvement', 'Mouvement', 20, NOW(), NOW()),
  ('meta_social', 'Méta / social', 30, NOW(), NOW()),
  ('pedagogique', 'Pédagogique', 40, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  nom = VALUES(nom),
  order_index = VALUES(order_index),
  updated_at = NOW();
