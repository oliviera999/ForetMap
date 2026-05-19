-- Lot 2A : gameplay GL parametrable + score + actions joueur

-- Equipe active du tour courant (utilisee quand le toggle "tours" est actif)
ALTER TABLE gl_games
  ADD COLUMN current_team_id INT UNSIGNED DEFAULT NULL AFTER status,
  ADD INDEX idx_gl_games_current_team (current_team_id);

-- Score par equipe et par partie (independant de la table gl_teams pour audit / reset facile)
CREATE TABLE IF NOT EXISTS gl_team_scores (
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  score INT NOT NULL DEFAULT 0,
  last_reason VARCHAR(180) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, team_id),
  INDEX idx_gl_team_scores_team (team_id),
  CONSTRAINT fk_gl_team_scores_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_team_scores_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demandes d'action emises par les joueurs (jeu "complet" : interaction joueur -> validation MJ)
CREATE TABLE IF NOT EXISTS gl_action_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED DEFAULT NULL,
  action_type VARCHAR(64) NOT NULL,
  payload_json LONGTEXT DEFAULT NULL,
  status ENUM('pending', 'accepted', 'refused') NOT NULL DEFAULT 'pending',
  resolved_by VARCHAR(64) DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_action_requests_game (game_id, status, id),
  INDEX idx_gl_action_requests_team (team_id),
  CONSTRAINT fk_gl_action_requests_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_action_requests_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Toggles gameplay : tous OFF par defaut (=> niveau minimal active, comportement existant)
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('gameplay.turns_enabled', 'false', NULL, NOW()),
  ('gameplay.narration_enabled', 'false', NULL, NOW()),
  ('gameplay.player_actions_enabled', 'false', NULL, NOW()),
  ('gameplay.scoring_enabled', 'false', NULL, NOW())
ON DUPLICATE KEY UPDATE
  updated_at = updated_at;
