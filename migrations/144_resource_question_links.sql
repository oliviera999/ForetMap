-- =====================================================================
-- ForetMap — Liaison ressources <-> questions + politique de conditionnement
-- Backbone structurel (gating DESACTIVE par defaut : aucun changement de
-- comportement tant que learning.gating.enabled = false cote app_settings).
--
-- Modele polymorphe unifie : une ressource (fiche espece, tutoriel, terme de
-- glossaire...) peut etre liee a plusieurs questions et inversement.
--   resource_type : 'tutorial' | 'plant' | 'glossary' (liste ouverte, validee cote app)
--   resource_ref  : id numerique (stringifie) ou code stable de la ressource
--   question_code : code stable d'une question quiz_questions (QF####)
-- FK uniquement cote question (table unique) ; cote ressource = polymorphe sans FK
-- (refs souples, tolere l'evolution rapide du contenu ; nettoyage applicatif des orphelins).
-- Idempotent (CREATE TABLE IF NOT EXISTS, INSERT IGNORE). Pre-requis : migration 128 (quiz).
-- =====================================================================

CREATE TABLE IF NOT EXISTS resource_question_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  question_code VARCHAR(16) NOT NULL,
  is_gating TINYINT(1) NOT NULL DEFAULT 1,
  weight SMALLINT NOT NULL DEFAULT 1,
  origin VARCHAR(16) NOT NULL DEFAULT 'manual',
  confidence DECIMAL(4,3) DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'approved',
  note VARCHAR(255) DEFAULT NULL,
  created_by_user_type VARCHAR(16) DEFAULT NULL,
  created_by_user_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rql_resource_question (resource_type, resource_ref, question_code),
  KEY idx_rql_question (question_code),
  KEY idx_rql_resource (resource_type, resource_ref),
  KEY idx_rql_status (status),
  CONSTRAINT fk_rql_question FOREIGN KEY (question_code)
    REFERENCES quiz_questions (question_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Politique de conditionnement par ressource (surcharge des defauts du site).
--   mode = 'inherit' : herite de learning.gating.default_mode (app_settings)
--   mode = 'off'     : ressource non conditionnee (marquage libre)
--   mode = 'any'     : au moins 1 question liee repondue juste
--   mode = 'all'     : toutes les questions liees repondues juste
--   mode = 'threshold' : au moins required_correct questions liees repondues juste
CREATE TABLE IF NOT EXISTS resource_gating_policy (
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'inherit',
  required_correct SMALLINT NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_user_type VARCHAR(16) DEFAULT NULL,
  updated_by_user_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_type, resource_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reprise (non destructive) des liens d'enrichissement quiz deja existants vers le
-- modele unifie. Les tables d'origine (quiz_question_*) restent intactes et continuent
-- d'alimenter l'affichage actuel : convergence des lectures prevue dans un lot ulterieur.
INSERT IGNORE INTO resource_question_links (resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'tutorial', CAST(tutorial_id AS CHAR), question_code, 'import', 'approved', 1
    FROM quiz_question_tutorials;

INSERT IGNORE INTO resource_question_links (resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'glossary', glossary_code, question_code, 'import', 'approved', 1
    FROM quiz_question_glossary;

INSERT IGNORE INTO resource_question_links (resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'plant', CAST(plant_id AS CHAR), question_code, 'import', 'approved', 1
    FROM quiz_question_species;
