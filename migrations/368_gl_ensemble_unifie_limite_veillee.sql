-- =====================================================================
-- 368 — G&L ensemble unifié, PR 2, étape 2.4 : une seule limite de veillée (M8).
--
-- `gameplay.tenir_pages_par_semaine` (4) remplace `tenir_pages_veillee_par_semaine` (2) et
-- `tenir_defis_pages_par_semaine` (2) : un seul compteur par élève et par semaine ISO, toutes
-- sources (page tenue en veillée, page gagnée par un défi de la Trame).
-- `tenir_pistes_par_semaine` (1) reste à part.
--
-- Une valeur déjà réglée par le prof est reprise : la somme des deux anciennes limites, bornée
-- à 20. Idempotente : INSERT IGNORE (la nouvelle clé n'est écrite qu'une fois), puis DELETE des
-- deux clés que plus aucun registre ne lit (une valeur restée en base serait ignorée).
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at)
SELECT 'gameplay.tenir_pages_par_semaine',
       CAST(LEAST(20, GREATEST(0,
         COALESCE((SELECT CAST(value_json AS UNSIGNED) FROM gl_settings
                    WHERE `key` = 'gameplay.tenir_pages_veillee_par_semaine'
                      AND value_json REGEXP '^[0-9]+$'), 2)
         + COALESCE((SELECT CAST(value_json AS UNSIGNED) FROM gl_settings
                      WHERE `key` = 'gameplay.tenir_defis_pages_par_semaine'
                        AND value_json REGEXP '^[0-9]+$'), 2))) AS CHAR),
       NULL, NOW();

DELETE FROM gl_settings
 WHERE `key` IN ('gameplay.tenir_pages_veillee_par_semaine', 'gameplay.tenir_defis_pages_par_semaine');
