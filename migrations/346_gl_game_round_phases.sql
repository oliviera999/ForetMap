-- =====================================================================
-- 346 — G&L « Tenir à deux » : chronométrage des séances (14 novembre 2026).
--
-- Le diagnostic donnait la durée d'un tour, pas celle de ses phases. `gl_game_round_phases`
-- garde le début et la fin de chaque phase d'un tour (`ouverture`, `jeu`, `souffle` ; `clos`
-- ferme la dernière). Écrite par `lib/glRoundPhases.js`, appelé par `ouvrirTourTx`,
-- `changerPhaseTx` (`lib/glTour.js`) et la clôture du Seuil (`lib/glSeuil.js`).
-- Aucune donnée d'élève. Les tours joués avant cette migration n'ont pas de ligne : le
-- diagnostic le dit (durées par phase absentes), il ne les invente pas.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_game_round_phases (
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL,
  phase ENUM('ouverture','jeu','souffle') NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  PRIMARY KEY (game_id, round_number, phase),
  CONSTRAINT fk_gl_game_round_phases_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
