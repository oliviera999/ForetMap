-- =====================================================================
-- 352 — G&L « Tenir à deux » : règles tranchées par l'audit (lot 2, étape 2.10).
--
-- Deux réglages nouveaux, dont les défauts gardent le comportement d'avant :
-- - `tenir_lecture_pendant_tour` (true) : à `false` (profil `court`), lire et tenir une page se
--   font en veillée ; pendant le tour, l'écran affiche « À lire en veillée » ;
-- - `tenir_fouille_sous_voile` (`aucune`) : `page_palie` laisse à une équipe gnome sous le
--   voile une fouille par tour, sur une page pâlie seulement.
--
-- Et le profil `court` (tour en deux étages : Marché et lecture en veillée) rejoint `complet`
-- et `prologue` dans `gl_games.tenir_profil`.
--
-- Idempotente : INSERT IGNORE (une valeur déjà posée par le MJ n'est pas touchée), MODIFY gardé
-- par INFORMATION_SCHEMA. Aucun DROP.
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_lecture_pendant_tour', 'true', NULL, NOW()),
  ('gameplay.tenir_fouille_sous_voile', '"aucune"', NULL, NOW());

SET @fm352 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'tenir_profil' AND COLUMN_TYPE LIKE '%court%');
SET @sql = IF(@fm352 = 0, "ALTER TABLE gl_games MODIFY COLUMN tenir_profil ENUM('complet','prologue','court') NULL DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
