-- =====================================================================
-- GL (Gnomes & Licornes) — Liaison ressources <-> questions QCM + conditionnement
-- Miroir ISOLE du backbone ForetMap (prefixe gl_, aucune table partagee cross-produit).
-- Gating DESACTIVE par defaut (gl_settings 'gating.enabled' = false).
--
--   question_dataset : 'qcm' (ecologie) | 'qcm_lore' (narratif)
--   resource_type    : 'species' | 'glossary' | 'lore_glossary' | 'tutorial' | 'feuillet'
--                      (liste ouverte, validee cote app)
--   resource_ref     : code stable (species_code, glossary_code, feuillet_code...) ou id stringifie
-- Refs polymorphes des deux cotes (deux tables de questions GL) : pas de FK, validation applicative.
-- Idempotent. Pre-requis : 096 (qcm), 138 (qcm lore), 081 (chapitres/parties).
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_resource_question_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_dataset VARCHAR(16) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  question_code VARCHAR(16) NOT NULL,
  is_gating TINYINT(1) NOT NULL DEFAULT 1,
  weight SMALLINT NOT NULL DEFAULT 1,
  origin VARCHAR(16) NOT NULL DEFAULT 'manual',
  confidence DECIMAL(4,3) DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'approved',
  note VARCHAR(255) DEFAULT NULL,
  created_by_user_type VARCHAR(40) DEFAULT NULL,
  created_by_user_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_glrql (question_dataset, resource_type, resource_ref, question_code),
  KEY idx_glrql_question (question_dataset, question_code),
  KEY idx_glrql_resource (resource_type, resource_ref),
  KEY idx_glrql_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_resource_gating_policy (
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'inherit',
  required_correct SMALLINT NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_user_type VARCHAR(40) DEFAULT NULL,
  updated_by_user_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_type, resource_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persistance des tentatives QCM GL PAR LECTEUR (joueur/invite/MJ) : absente jusqu'ici
-- (les reponses en partie ne vivaient que dans gl_game_events, par equipe). Necessaire au
-- mode de granularite 'player'. game_id/team_id nullables (reponses hors partie possibles) ;
-- ON DELETE SET NULL pour preserver le fait d'apprentissage si la partie est supprimee.
CREATE TABLE IF NOT EXISTS gl_qcm_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reader_user_type VARCHAR(40) NOT NULL,
  reader_user_id VARCHAR(64) NOT NULL,
  question_dataset VARCHAR(16) NOT NULL,
  question_code VARCHAR(16) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  game_id INT UNSIGNED DEFAULT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gl_qcm_attempts_reader (reader_user_type, reader_user_id, question_code),
  KEY idx_gl_qcm_attempts_question (question_dataset, question_code),
  KEY idx_gl_qcm_attempts_game (game_id, team_id),
  CONSTRAINT fk_gl_qcm_attempts_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE SET NULL,
  CONSTRAINT fk_gl_qcm_attempts_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Surcharge de granularite du gating au niveau chapitre de jeu et scope lore narratif.
-- NULL = herite de la granularite du site (gl_settings 'gating.granularity').
ALTER TABLE gl_chapters
  ADD COLUMN gating_granularity VARCHAR(16) DEFAULT NULL
  COMMENT 'Granularite gating player team per_resource - NULL herite du site';

ALTER TABLE gl_qcm_lore_scopes
  ADD COLUMN gating_granularity VARCHAR(16) DEFAULT NULL
  COMMENT 'Granularite gating player team per_resource - NULL herite du site';

-- Reprise des liens question <-> terme de glossaire deja existants vers le modele unifie.
-- gl_qcm_question_glossary -> glossaire ecologie ; gl_qcm_lore_question_glossary -> glossaire lore.
INSERT IGNORE INTO gl_resource_question_links
    (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'qcm', 'glossary', glossary_code, question_code, 'import', 'approved', 1
    FROM gl_qcm_question_glossary;

INSERT IGNORE INTO gl_resource_question_links
    (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'qcm_lore', 'lore_glossary', lore_code, question_code, 'import', 'approved', 1
    FROM gl_qcm_lore_question_glossary;
