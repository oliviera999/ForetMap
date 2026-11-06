-- =====================================================================
-- 332 — G&L « Tenir à deux » v2, étape 3 : la chasse (fouiller, tenir à deux, pistes, voile).
--
-- État des pages par partie (`gl_game_chasse_pages` : endormie → revelee → trouvee → tenue ;
-- palie → reparee), ouvertures (lecture / tenir, au tour ou en veillée, pour la limite
-- hebdomadaire), empreintes publiques des fouilles, pistes de veillée, codes de questions déjà
-- présentés par zone (exclusion du tirage de secours).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, FK ON DELETE CASCADE vers gl_games / gl_teams /
-- gl_players / gl_chasse_zones. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_game_chasse_pages (
  game_id INT UNSIGNED NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  etat ENUM('endormie','revelee','trouvee','tenue','palie','reparee') NOT NULL DEFAULT 'endormie',
  trouvee_par_team_id INT UNSIGNED NULL,
  trouvee_at DATETIME NULL,
  tenue_par_team_id INT UNSIGNED NULL,
  tenue_at DATETIME NULL,
  reparee_at DATETIME NULL,
  palissement_json LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, zone_id),
  KEY idx_gl_game_chasse_pages_etat (game_id, etat),
  CONSTRAINT fk_gl_game_chasse_pages_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_chasse_pages_zone FOREIGN KEY (zone_id) REFERENCES gl_chasse_zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_chasse_ouvertures (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NULL,
  via ENUM('tour','veillee') NOT NULL DEFAULT 'tour',
  question_code VARCHAR(32) NULL,
  reussie TINYINT(1) NULL,
  gain TINYINT(1) NOT NULL DEFAULT 0,
  semaine_iso CHAR(8) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_chasse_ouvertures_player_week (player_id, semaine_iso, gain),
  KEY idx_gl_game_chasse_ouvertures_game (game_id, zone_id),
  CONSTRAINT fk_gl_game_chasse_ouvertures_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_chasse_ouvertures_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_chasse_empreintes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL,
  player_id INT UNSIGNED NULL,
  round_number INT NOT NULL DEFAULT 0,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  verdict ENUM('froid','tiede','chaud','zone','deja_trouvee') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_chasse_empreintes_game (game_id, id),
  CONSTRAINT fk_gl_game_chasse_empreintes_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_chasse_pistes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  semaine_iso CHAR(8) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_game_chasse_pistes (game_id, zone_id, player_id),
  KEY idx_gl_game_chasse_pistes_player_week (player_id, semaine_iso),
  CONSTRAINT fk_gl_game_chasse_pistes_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_chasse_pistes_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_chasse_questions_vues (
  game_id INT UNSIGNED NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  question_code VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, zone_id, question_code),
  CONSTRAINT fk_gl_game_chasse_questions_vues_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
