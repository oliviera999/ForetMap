-- Glossaire pédagogique ForetMap (hors gl_*)

CREATE TABLE IF NOT EXISTS glossary_terms (
  glossary_code varchar(16) NOT NULL COMMENT 'Code stable (FMxxxx)',
  terme varchar(120) NOT NULL,
  variantes varchar(255) DEFAULT NULL,
  categorie varchar(64) NOT NULL,
  niveau enum('base','approfondissement','avance') NOT NULL DEFAULT 'base',
  definition_courte varchar(255) DEFAULT NULL,
  definition_complete text DEFAULT NULL,
  exemple text DEFAULT NULL,
  etymologie varchar(255) DEFAULT NULL,
  illustration_idee text DEFAULT NULL,
  statut varchar(32) NOT NULL DEFAULT 'actif',
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  updated_at datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (glossary_code),
  KEY idx_glossary_terme (terme),
  KEY idx_glossary_categorie (categorie),
  KEY idx_glossary_niveau (niveau)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS glossary_term_relations (
  from_code varchar(16) NOT NULL,
  to_code varchar(16) NOT NULL,
  PRIMARY KEY (from_code, to_code),
  KEY idx_glossary_rel_from (from_code),
  CONSTRAINT fk_glossary_rel_from FOREIGN KEY (from_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_glossary_rel_to FOREIGN KEY (to_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS glossary_term_species (
  glossary_code varchar(16) NOT NULL,
  plant_id int unsigned NOT NULL,
  PRIMARY KEY (glossary_code, plant_id),
  KEY idx_gts_plant (plant_id),
  CONSTRAINT fk_gts_term FOREIGN KEY (glossary_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gts_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS glossary_term_tutorials (
  glossary_code varchar(16) NOT NULL,
  tutorial_id int unsigned NOT NULL,
  PRIMARY KEY (glossary_code, tutorial_id),
  KEY idx_gtt_tutorial (tutorial_id),
  CONSTRAINT fk_gtt_term FOREIGN KEY (glossary_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gtt_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS glossary_term_interactions (
  glossary_code varchar(16) NOT NULL,
  interaction_id int unsigned NOT NULL,
  PRIMARY KEY (glossary_code, interaction_id),
  KEY idx_gti_inter (interaction_id),
  CONSTRAINT fk_gti_term FOREIGN KEY (glossary_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gti_inter FOREIGN KEY (interaction_id) REFERENCES species_interactions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id int unsigned NOT NULL AUTO_INCREMENT,
  user_id varchar(64) NOT NULL,
  question_code varchar(16) NOT NULL,
  categorie_slug varchar(64) DEFAULT NULL,
  is_correct tinyint(1) NOT NULL DEFAULT 0,
  answered_at datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_uqa_user (user_id, answered_at),
  KEY idx_uqa_question (question_code),
  CONSTRAINT fk_uqa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
