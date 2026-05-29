-- Catalogue QCM G&L (catégories + questions + liens glossaire)

CREATE TABLE IF NOT EXISTS gl_qcm_categories (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  nom VARCHAR(180) NOT NULL,
  emoji VARCHAR(16) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_qcm_categories_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_qcm_questions (
  question_code VARCHAR(16) NOT NULL PRIMARY KEY,
  biome_slug VARCHAR(64) NOT NULL,
  categorie_slug VARCHAR(64) NOT NULL,
  numero_dans_categorie INT NOT NULL DEFAULT 1,
  question TEXT NOT NULL,
  choix_a TEXT NOT NULL,
  choix_b TEXT NOT NULL,
  choix_c TEXT NOT NULL,
  choix_d TEXT NOT NULL,
  choix_e TEXT NOT NULL,
  reponse_correcte ENUM('A', 'B', 'C', 'D', 'E') NOT NULL,
  reponse_texte TEXT DEFAULT NULL,
  niveau VARCHAR(64) DEFAULT NULL,
  difficulte TINYINT UNSIGNED DEFAULT NULL,
  difficulte_label VARCHAR(64) DEFAULT NULL,
  notes_pedagogiques TEXT DEFAULT NULL,
  tags TEXT DEFAULT NULL,
  mots_cles TEXT DEFAULT NULL,
  photo_url VARCHAR(512) DEFAULT NULL,
  photo_url_hd VARCHAR(512) DEFAULT NULL,
  photo_description_url VARCHAR(512) DEFAULT NULL,
  photo_filename VARCHAR(255) DEFAULT NULL,
  photo_credit VARCHAR(512) DEFAULT NULL,
  photo_licence VARCHAR(120) DEFAULT NULL,
  photo_licence_url VARCHAR(512) DEFAULT NULL,
  photo_legende TEXT DEFAULT NULL,
  photo_sujet VARCHAR(255) DEFAULT NULL,
  wikipedia_title VARCHAR(255) DEFAULT NULL,
  wikipedia_url VARCHAR(512) DEFAULT NULL,
  photo_method VARCHAR(64) DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_qcm_biome_cat_num (biome_slug, categorie_slug, numero_dans_categorie),
  INDEX idx_gl_qcm_biome_cat (biome_slug, categorie_slug),
  INDEX idx_gl_qcm_difficulte (difficulte),
  CONSTRAINT fk_gl_qcm_questions_biome FOREIGN KEY (biome_slug) REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_gl_qcm_questions_categorie FOREIGN KEY (categorie_slug) REFERENCES gl_qcm_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_qcm_question_glossary (
  question_code VARCHAR(16) NOT NULL,
  glossary_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (question_code, glossary_code),
  INDEX idx_gl_qcm_question_glossary_term (glossary_code),
  CONSTRAINT fk_gl_qcm_qg_question FOREIGN KEY (question_code) REFERENCES gl_qcm_questions(question_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gl_qcm_qg_glossary FOREIGN KEY (glossary_code) REFERENCES gl_glossary_terms(glossary_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
