-- =====================================================================
-- Conditionnement « marquer comme acquis » — verrou de re-tentative (cooldown)
-- Apres une MAUVAISE reponse a une question bloquante DANS le flux de validation,
-- la ressource entiere est verrouillee pendant N jours (reglage, defaut 3).
-- Deux tables miroirs isolees (ForetMap + GL), aucune table partagee cross-produit.
--   locked_until : date/heure de fin de verrou ; tant que > NOW() la validation est bloquee.
-- Idempotent. Pre-requis : 126 (user_quiz_attempts), 145 (gl_qcm_attempts / liens GL).
-- =====================================================================

-- ForetMap : verrou par utilisateur x ressource.
CREATE TABLE IF NOT EXISTS resource_gating_cooldowns (
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  locked_until DATETIME NOT NULL,
  wrong_question_code VARCHAR(16) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_type, resource_ref),
  KEY idx_rgc_locked (locked_until),
  CONSTRAINT fk_rgc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GL : verrou par lecteur (joueur/invite/MJ) x ressource. Refs polymorphes : pas de FK ressource.
CREATE TABLE IF NOT EXISTS gl_resource_gating_cooldowns (
  reader_user_type VARCHAR(40) NOT NULL,
  reader_user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  locked_until DATETIME NOT NULL,
  wrong_question_code VARCHAR(16) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reader_user_type, reader_user_id, resource_type, resource_ref),
  KEY idx_glrgc_locked (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
