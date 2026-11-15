-- =====================================================================
-- 347 — G&L « Tenir à deux » : sabliers réglables d'un clic (14 novembre 2026).
--
-- Trois réglages nouveaux, surchargeables par partie, dont les défauts gardent le comportement
-- d'avant : `tenir_sablier_actif` (true), `tenir_sablier_phase_secondes` (0 = sans),
-- `tenir_sablier_phase_auto` (false). `tenir_sablier_secondes` devient surchargeable.
-- `gl_game_rounds.sablier_json` : état du sablier de phase du tour (départ, pause, pauses
-- cumulées), écrit par `lib/glSablier.js` ; il vient du serveur pour que console, tablettes et
-- projection affichent la même chose.
--
-- Idempotente : INSERT IGNORE (une valeur déjà posée par le MJ n'est pas touchée),
-- ADD COLUMN IF NOT EXISTS. Aucun DROP.
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_sablier_actif', 'true', NULL, NOW()),
  ('gameplay.tenir_sablier_phase_secondes', '0', NULL, NOW()),
  ('gameplay.tenir_sablier_phase_auto', 'false', NULL, NOW());

ALTER TABLE gl_game_rounds
  ADD COLUMN IF NOT EXISTS sablier_json LONGTEXT NULL;
