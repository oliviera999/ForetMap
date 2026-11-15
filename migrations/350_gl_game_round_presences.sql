-- =====================================================================
-- 350 — G&L « Tenir à deux » : présences confirmées par équipe (lot 2, étape 2.3).
--
-- Sans coche du prof (`gl_game_round_absences`, migration 331), tout le monde comptait
-- présent : un oubli faisait payer l'absent au pot et lui donnait les badges de présence.
-- Chaque équipe confirme désormais sa présence du tour (« Il manque quelqu'un ? ») ; une ligne
-- ici = présence confirmée pour (partie, tour, équipe). Les absents eux-mêmes restent dans
-- `gl_game_round_absences`. `confirmed_by_type` : `team` (écran d'équipe) ou `mj` (prof) ;
-- `confirmed_by_id` : identifiant d'acteur du journal (jamais un nom).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_game_round_presences (
  game_id INT UNSIGNED NOT NULL,
  round_number INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  confirmed_at DATETIME NOT NULL,
  confirmed_by_type VARCHAR(16) NOT NULL,
  confirmed_by_id VARCHAR(64) NULL,
  PRIMARY KEY (game_id, round_number, team_id),
  CONSTRAINT fk_gl_game_round_presences_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_round_presences_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
