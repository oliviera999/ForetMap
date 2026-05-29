-- Glossaire G&L (termes pédagogiques par biome)

CREATE TABLE IF NOT EXISTS gl_glossary_terms (
  glossary_code VARCHAR(16) NOT NULL PRIMARY KEY,
  terme VARCHAR(120) NOT NULL,
  variantes VARCHAR(255) DEFAULT NULL,
  categorie VARCHAR(64) NOT NULL,
  niveau ENUM('base', 'approfondissement', 'avance') NOT NULL DEFAULT 'base',
  definition_courte VARCHAR(255) DEFAULT NULL,
  definition_complete TEXT DEFAULT NULL,
  exemple TEXT DEFAULT NULL,
  etymologie VARCHAR(255) DEFAULT NULL,
  present_dans_qcm TEXT DEFAULT NULL,
  illustration_idee TEXT DEFAULT NULL,
  all_biomes TINYINT(1) NOT NULL DEFAULT 0,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_glossary_terme (terme),
  INDEX idx_gl_glossary_categorie (categorie),
  INDEX idx_gl_glossary_niveau (niveau),
  INDEX idx_gl_glossary_all_biomes (all_biomes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_glossary_term_biomes (
  glossary_code VARCHAR(16) NOT NULL,
  biome_slug VARCHAR(64) NOT NULL,
  PRIMARY KEY (glossary_code, biome_slug),
  INDEX idx_gl_glossary_term_biomes_biome (biome_slug),
  CONSTRAINT fk_gl_glossary_term_biomes_term FOREIGN KEY (glossary_code) REFERENCES gl_glossary_terms(glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gl_glossary_term_biomes_biome FOREIGN KEY (biome_slug) REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_glossary_term_relations (
  from_code VARCHAR(16) NOT NULL,
  to_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (from_code, to_code),
  INDEX idx_gl_glossary_relations_from (from_code),
  CONSTRAINT fk_gl_glossary_relations_from FOREIGN KEY (from_code) REFERENCES gl_glossary_terms(glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gl_glossary_relations_to FOREIGN KEY (to_code) REFERENCES gl_glossary_terms(glossary_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
