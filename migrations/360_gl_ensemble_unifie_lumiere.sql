-- =====================================================================
-- 360 — G&L ensemble unifié, PR 1a, étape 1.7 : la Lumière, version simple (M17).
--
-- - `gameplay.tenir_lumiere` passe à `true` et `gameplay.tenir_lumiere_palier` à 100 (anciens
--   défauts `false` et 25 ; une valeur retouchée par le MJ n'est pas écrasée) ;
-- - `gameplay.tenir_cartes_vers_cases` disparaît (plus aucun registre ne le lit) ;
-- - le choix au palier (`lumiere_choix`) et le sort « Lumière » (`SL050`) sortent : au palier, le
--   voile recule d'office et la jauge repart de zéro (`lib/glTour.js › ajouterLumiereTx`).
--
-- - `gl_game_team_spirit.lumiere_comptee` : cartes déjà comptées pour la Lumière (par séance et
--   par équipe) — la jauge ne descend jamais, et un bilan baissé puis remonté n'ajoute rien.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, UPDATE gardés par l'ancienne valeur exacte, INSERT
-- IGNORE, DELETE d'une clé morte.
-- =====================================================================

UPDATE gl_settings SET value_json = 'true', updated_at = NOW()
 WHERE `key` = 'gameplay.tenir_lumiere' AND value_json = 'false';

UPDATE gl_settings SET value_json = '100', updated_at = NOW()
 WHERE `key` = 'gameplay.tenir_lumiere_palier' AND value_json = '25';

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_lumiere', 'true', NULL, NOW()),
  ('gameplay.tenir_lumiere_palier', '100', NULL, NOW());

DELETE FROM gl_settings WHERE `key` = 'gameplay.tenir_cartes_vers_cases';

ALTER TABLE gl_game_team_spirit
  ADD COLUMN IF NOT EXISTS lumiere_comptee TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER cartes_gardees;

UPDATE gl_game_team_spirit SET lumiere_comptee = cartes_gardees WHERE lumiere_comptee < cartes_gardees;
