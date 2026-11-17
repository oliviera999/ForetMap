-- =====================================================================
-- 369 — G&L ensemble unifié, PR 2, étape 2.2 : Olu « première fois » (M8).
--
-- 23 lignes dites une seule fois par partie (ou par équipe quand la ligne porte `{equipe}`), à
-- la première occurrence d'un évènement : Olu dit le geste au moment où la classe le rencontre.
--
-- 1. `gl_tenir_olu_lignes` : `id` passe à 48 caractères (`olu-pf-question_pas_encore`), et deux
--    colonnes — `cle` (la clé d'évènement d'une ligne `premiere_fois`) et `seance_escalier` (la
--    séance du chapitre 1 où la nouveauté s'ouvre ; 0 = hors escalier).
-- 2. `gl_game_olu_premieres` : la mémoire, par partie — une ligne par clé déjà dite
--    (`team_id` = 0 pour la partie, l'équipe sinon). Aucune donnée d'élève.
--
-- Idempotente : MODIFY rejoué sans effet, ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
-- =====================================================================

ALTER TABLE gl_tenir_olu_lignes MODIFY COLUMN id VARCHAR(48) NOT NULL;

ALTER TABLE gl_tenir_olu_lignes
  ADD COLUMN IF NOT EXISTS cle VARCHAR(32) NULL DEFAULT NULL AFTER moment,
  ADD COLUMN IF NOT EXISTS seance_escalier TINYINT UNSIGNED NULL DEFAULT NULL AFTER cle;

CREATE TABLE IF NOT EXISTS gl_game_olu_premieres (
  game_id INT UNSIGNED NOT NULL,
  cle VARCHAR(32) NOT NULL,
  team_id INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, cle, team_id),
  CONSTRAINT fk_gl_game_olu_premieres_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
