-- Brouillons et contributions pour le lancement collaboratif de sortilèges

CREATE TABLE IF NOT EXISTS gl_spell_cast_drafts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  spell_code VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'collecting',
  created_by_player_id INT UNSIGNED DEFAULT NULL,
  created_by_actor_type VARCHAR(16) NOT NULL DEFAULT 'team',
  created_by_actor_id VARCHAR(64) NOT NULL,
  launched_by_player_id INT UNSIGNED DEFAULT NULL,
  launched_by_actor_type VARCHAR(16) DEFAULT NULL,
  launched_by_actor_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cast_at DATETIME DEFAULT NULL,
  INDEX idx_gl_spell_cast_drafts_game_status (game_id, status),
  INDEX idx_gl_spell_cast_drafts_collecting (game_id, team_id, spell_code, status),
  CONSTRAINT fk_gl_spell_cast_drafts_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_spell_cast_drafts_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_spell_cast_drafts_creator FOREIGN KEY (created_by_player_id) REFERENCES gl_players(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_spell_cast_contributions (
  draft_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  gems INT UNSIGNED NOT NULL DEFAULT 0,
  hearts INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by_player_id INT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (draft_id, player_id),
  CONSTRAINT fk_gl_spell_cast_contrib_draft FOREIGN KEY (draft_id) REFERENCES gl_spell_cast_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_spell_cast_contrib_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
