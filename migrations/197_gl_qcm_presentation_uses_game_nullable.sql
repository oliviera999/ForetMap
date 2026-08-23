-- =====================================================================
-- GL — Consommation du jeton de présentation AUSSI hors partie (entraînement)
--
-- CONTEXTE. `POST /api/gl/qcm/questions/:code/answer` (validation d'entraînement,
-- hors partie) vérifiait la signature du `presentationToken` sans jamais le marquer
-- comme consommé. Avec un seul jeton, un élève pouvait soumettre successivement
-- chaque `choiceId` (0..N) : celui qui renvoie `correct:true` révélait la bonne
-- réponse en ≤ 5 requêtes. L'anti-triche du QCM (bonne réponse jamais en clair)
-- était donc contournée. Diagnostic : docs/AUDIT_GENERAL_2026-08.md §3 et §9.6.
--
-- CORRECTIF. La même table `gl_qcm_presentation_uses` porte désormais aussi les
-- consommations d'entraînement, où il n'y a pas de partie : `game_id` devient
-- NULLABLE. La clé primaire (jti) reste l'arbitre d'unicité ; consommer le jeton
-- à la première réponse force un nouveau tirage (choix remélangés) pour toute
-- tentative suivante, ce qui défait le brute-force.
--
-- Idempotente : ne modifie la colonne que si elle est encore NOT NULL.
-- =====================================================================

SET @col_not_null := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_qcm_presentation_uses'
     AND COLUMN_NAME = 'game_id'
     AND IS_NULLABLE = 'NO'
);

SET @sql := IF(
  @col_not_null > 0,
  'ALTER TABLE gl_qcm_presentation_uses MODIFY game_id INT UNSIGNED NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
