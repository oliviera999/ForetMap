-- Catalogue QCM lore G&L (catégories + scopes chapitre + questions + liens glossaire narratif)

CREATE TABLE IF NOT EXISTS gl_qcm_lore_scopes (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  nom VARCHAR(180) NOT NULL,
  plateau TINYINT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_qcm_lore_scopes_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_qcm_lore_categories (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  nom VARCHAR(180) NOT NULL,
  emoji VARCHAR(16) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_qcm_lore_categories_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_qcm_lore_questions (
  question_code VARCHAR(16) NOT NULL PRIMARY KEY,
  chapitre_slug VARCHAR(64) NOT NULL,
  categorie_slug VARCHAR(64) NOT NULL,
  numero_dans_categorie INT NOT NULL DEFAULT 1,
  tier_lore ENUM('cle', 'recit') NOT NULL DEFAULT 'recit',
  question TEXT NOT NULL,
  choix_a TEXT NOT NULL,
  choix_b TEXT NOT NULL,
  choix_c TEXT NOT NULL,
  choix_d TEXT NOT NULL,
  choix_e TEXT NOT NULL DEFAULT '',
  reponse_correcte ENUM('A', 'B', 'C', 'D', 'E') NOT NULL,
  reponse_texte TEXT DEFAULT NULL,
  niveau VARCHAR(64) DEFAULT NULL,
  difficulte TINYINT UNSIGNED DEFAULT NULL,
  difficulte_label VARCHAR(64) DEFAULT NULL,
  notes_pedagogiques TEXT DEFAULT NULL,
  source_lore VARCHAR(255) DEFAULT NULL,
  tags TEXT DEFAULT NULL,
  mots_cles TEXT DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  feedback_correct TEXT DEFAULT NULL,
  feedback_a TEXT DEFAULT NULL,
  feedback_b TEXT DEFAULT NULL,
  feedback_c TEXT DEFAULT NULL,
  feedback_d TEXT DEFAULT NULL,
  feedback_e TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_qcm_lore_chap_cat_num (chapitre_slug, categorie_slug, numero_dans_categorie),
  INDEX idx_gl_qcm_lore_chap_cat (chapitre_slug, categorie_slug),
  INDEX idx_gl_qcm_lore_tier (tier_lore),
  INDEX idx_gl_qcm_lore_difficulte (difficulte),
  CONSTRAINT fk_gl_qcm_lore_questions_scope FOREIGN KEY (chapitre_slug) REFERENCES gl_qcm_lore_scopes(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_gl_qcm_lore_questions_categorie FOREIGN KEY (categorie_slug) REFERENCES gl_qcm_lore_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_qcm_lore_question_glossary (
  question_code VARCHAR(16) NOT NULL,
  lore_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (question_code, lore_code),
  INDEX idx_gl_qcm_lore_qg_term (lore_code),
  CONSTRAINT fk_gl_qcm_lore_qg_question FOREIGN KEY (question_code) REFERENCES gl_qcm_lore_questions(question_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gl_qcm_lore_qg_glossary FOREIGN KEY (lore_code) REFERENCES gl_lore_glossary_terms(lore_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
