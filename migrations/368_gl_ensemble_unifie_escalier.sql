-- =====================================================================
-- 368 — G&L ensemble unifié, PR 2, étape 2.1 : l'escalier du chapitre 1 (M8).
--
-- Au plateau 1, les règles s'ouvrent séance après séance (`src/shared/glTenirEscalierCore.js`).
-- L'escalier remplace le profil `prologue` : son état vit dans les surcharges de la partie
-- (`gl_games.tenir_overrides_json` : `escalier`, `escalier_pas`).
--
-- 1. Réglage `gameplay.tenir_escalier` (true) : une partie créée au plateau 1 monte l'escalier.
-- 2. Une partie restée en profil `prologue` passe en `complet` avec l'escalier, à la séance où
--    elle en est (tours clos + 1, 4 au plus). Ses autres surcharges sont gardées.
--
-- Idempotente : INSERT IGNORE ; l'UPDATE ne trouve plus de partie `prologue` au second passage.
-- La valeur `prologue` reste dans l'ENUM de la colonne (aucun DROP, aucune réécriture de
-- colonne) : plus aucun code ne la pose ni ne la lit.
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_escalier', 'true', NULL, NOW());

UPDATE gl_games g
   SET g.tenir_overrides_json = JSON_MERGE_PATCH(
         CASE
           WHEN g.tenir_overrides_json IS NULL OR g.tenir_overrides_json = ''
                OR JSON_VALID(g.tenir_overrides_json) = 0 THEN '{}'
           ELSE g.tenir_overrides_json
         END,
         CONCAT('{"escalier": true, "escalier_pas": ',
                LEAST(4, 1 + (SELECT COUNT(*) FROM gl_game_rounds r
                               WHERE r.game_id = g.id AND r.phase = 'clos')),
                '}')),
       g.tenir_profil = 'complet',
       g.updated_at = NOW()
 WHERE g.tenir_profil = 'prologue';
