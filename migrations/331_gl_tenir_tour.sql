-- =====================================================================
-- 331 — G&L « Tenir à deux » v2, étape 2 : tour à phases, surfaces, dés, Team Spirit.
--
-- `gl_game_rounds` : phase (`ouverture → jeu → souffle → clos`), ordre figé des équipes
-- (inverse du plateau), équipe active (surface `tableau`), vent de la caravane, dé gris du
-- Souffle, mot du Passeur, erreur du jour d'Olu, chapardeur, opérateurs saisis (facultatif).
-- Absences du tour, saisies de dés (physiques en attente de validation, avance libre),
-- bilans Team Spirit par séance, Lumière par partie.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN gardé par INFORMATION_SCHEMA. Aucun DROP.
-- =====================================================================

SET @fm331 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_game_rounds' AND COLUMN_NAME = 'phase');
SET @sql = IF(@fm331 = 0, 'ALTER TABLE gl_game_rounds
  ADD COLUMN phase ENUM(''ouverture'',''jeu'',''souffle'',''clos'') NOT NULL DEFAULT ''ouverture'',
  ADD COLUMN ordre_json LONGTEXT NULL,
  ADD COLUMN equipe_active_id INT UNSIGNED NULL,
  ADD COLUMN vent_team_id INT UNSIGNED NULL,
  ADD COLUMN souffle_json LONGTEXT NULL,
  ADD COLUMN passeur_json LONGTEXT NULL,
  ADD COLUMN olu_erreur_json LONGTEXT NULL,
  ADD COLUMN olu_corrige_team_id INT UNSIGNED NULL,
  ADD COLUMN chapardeur_at DATETIME NULL,
  ADD COLUMN operateurs_json LONGTEXT NULL,
  ADD COLUMN phase_changed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS gl_game_round_absences (
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (game_id, round_number, player_id),
  CONSTRAINT fk_gl_game_round_absences_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_round_absences_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_des_saisies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  beneficiaire_team_id INT UNSIGNED NULL,
  mode ENUM('serveur','physique','libre') NOT NULL,
  faces_json LONGTEXT NULL,
  total INT NOT NULL DEFAULT 0,
  motif VARCHAR(160) NULL,
  statut ENUM('en_attente','appliquee','refusee') NOT NULL DEFAULT 'en_attente',
  saisie_par_type ENUM('mj','player') NOT NULL DEFAULT 'player',
  saisie_par_id VARCHAR(64) NULL,
  validee_par_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  appliquee_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_gl_game_des_saisies_round (game_id, round_number, statut),
  CONSTRAINT fk_gl_game_des_saisies_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_des_saisies_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_team_spirit (
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  cartes_gardees TINYINT NOT NULL DEFAULT 0,
  cartes_json LONGTEXT NULL,
  note VARCHAR(160) NULL,
  saisi_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, round_number, team_id),
  CONSTRAINT fk_gl_game_team_spirit_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_team_spirit_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_lumiere (
  game_id INT UNSIGNED NOT NULL,
  total INT NOT NULL DEFAULT 0,
  paliers_json LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id),
  CONSTRAINT fk_gl_game_lumiere_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
