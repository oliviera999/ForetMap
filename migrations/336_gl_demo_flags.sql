-- =====================================================================
-- 336 — G&L : partie de démonstration (`is_demo` sur gl_classes et gl_games).
--
-- Scénario 3 des modes de démonstration (réunion de parents, inspection) : le MJ prépare
-- d'un clic une classe et une partie fictives — joueurs « Gnome Démo 1 », « Licorne Démo 2 »…,
-- jamais d'élève réel — qu'il projette et rejoue à volonté (`lib/gl/demoGame.js`,
-- `POST /api/gl/admin/demo/reset`). Le drapeau les tient à l'écart des exports (joueurs,
-- Team Spirit, badges) et les signale dans la console.
--
-- Idempotente : ADD COLUMN gardé par INFORMATION_SCHEMA (patron 195/330). Aucun DROP.
-- =====================================================================

SET @fm336 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_classes' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@fm336 = 0, 'ALTER TABLE gl_classes ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm336 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@fm336 = 0, 'ALTER TABLE gl_games ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
