-- =====================================================================
-- 362 — G&L ensemble unifié, PR 1b, étape 1.5 : Mentorat, Lettre, délai des fiches (M23, L7).
--
-- - `gameplay.tenir_delai_fiche_secondes` (0) : délai d'attente après une mauvaise réponse à une
--   fiche. À 0, une erreur ne coûte rien et « Seconde chance » n'a plus d'objet ;
-- - `gl_voyageur_plumes` (Lettre, sort SL048) : états `a_ecrire` (payée, pas encore écrite) et
--   `pas_encore` (à réécrire sans repayer), amorce choisie, piste du prof, brouillon de sort ;
-- - `gl_game_mentorats` (Mentorat, sort SL027) : un Mentorat payé une fois, jamais remboursé,
--   retenté sans repayer après un « pas encore » ; un seul par séance et par classe (`seance` =
--   numéro du tour où le prof l'écoute).
--
-- La Plume du voyageur sort du grimoire : la table et la source `plume` restent lisibles.
-- Idempotente : INSERT IGNORE, MODIFY COLUMN (valeurs ajoutées en fin d'énumération),
-- ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_delai_fiche_secondes', '0', NULL, NOW());

ALTER TABLE gl_voyageur_plumes
  MODIFY COLUMN statut ENUM('proposee','validee','refusee','a_ecrire','pas_encore') NOT NULL DEFAULT 'proposee',
  ADD COLUMN IF NOT EXISTS draft_id INT UNSIGNED NULL DEFAULT NULL AFTER game_id,
  ADD COLUMN IF NOT EXISTS amorce VARCHAR(32) NULL DEFAULT NULL AFTER source,
  ADD COLUMN IF NOT EXISTS piste VARCHAR(400) NULL DEFAULT NULL AFTER statut;

CREATE TABLE IF NOT EXISTS gl_game_mentorats (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL DEFAULT NULL,
  player_id INT UNSIGNED NOT NULL,
  draft_id INT UNSIGNED NULL DEFAULT NULL,
  seance INT NOT NULL DEFAULT 0,
  statut ENUM('prevu','pas_encore','valide') NOT NULL DEFAULT 'prevu',
  piste VARCHAR(400) NULL DEFAULT NULL,
  tentatives TINYINT UNSIGNED NOT NULL DEFAULT 1,
  juge_par VARCHAR(64) NULL DEFAULT NULL,
  juge_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_mentorats_game (game_id, seance, statut),
  KEY idx_gl_game_mentorats_player (player_id, statut),
  CONSTRAINT fk_gl_game_mentorats_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
