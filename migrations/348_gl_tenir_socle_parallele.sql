-- =====================================================================
-- 348 — G&L « Tenir à deux » : socle du jeu en parallèle (lot 2, étape 2.1).
--
-- 1. `gl_guest_tokens` : jetons invités révocables (session d'équipe d'une tablette de classe ;
--    la projection garde son hachage dans `gl_games.projection_token_hash`). Seul le hachage
--    SHA-256 du `jti` est stocké ; aucun nom d'élève.
-- 2. `gl_game_demandes` : tout ce qui attend un geste du prof (dés à valider, sort à appliquer,
--    présence à confirmer, défi à juger…) y écrit une ligne. C'est elle que vide la sortie
--    automatique des états d'attente (changement de phase, clôture du tour, Seuil).
-- 3. Grand livre : cause `sort_rembourse` (remboursement d'un sort refusé ou sans objet).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, MODIFY gardé par INFORMATION_SCHEMA. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_guest_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind ENUM('team_session') NOT NULL,
  jti_hash CHAR(64) NOT NULL,
  class_id INT UNSIGNED NULL,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_guest_tokens_jti (jti_hash),
  KEY idx_gl_guest_tokens_game (game_id, kind, revoked_at),
  CONSTRAINT fk_gl_guest_tokens_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_demandes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL DEFAULT 0,
  team_id INT UNSIGNED NULL,
  kind VARCHAR(32) NOT NULL,
  ref_id VARCHAR(64) NULL,
  payload_json LONGTEXT NULL,
  statut ENUM('en_attente','traitee','annulee') NOT NULL DEFAULT 'en_attente',
  created_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_gl_game_demandes_game (game_id, statut, created_at),
  KEY idx_gl_game_demandes_ref (game_id, kind, ref_id),
  CONSTRAINT fk_gl_game_demandes_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @fm348 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'cause' AND COLUMN_TYPE LIKE '%sort_rembourse%');
SET @sql = IF(@fm348 = 0, "ALTER TABLE gl_resource_ledger MODIFY COLUMN cause ENUM('page_tenue','trame','case_positive','case_souffle','carnet_complet','sort_pot','echange','don','parure','chapardeur','nid','heritage','reparation','geste_prof','migration','case_plateau','feuillet','defaut','reserve_entree','reserve_sortie','reserve_seuil','sort_rembourse') NOT NULL DEFAULT 'geste_prof'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
