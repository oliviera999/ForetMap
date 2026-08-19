-- =====================================================================
-- ForetMap / GL — Suppression des trois tables de jonction remplacées par le modèle unifié.
--
-- Les migrations 144 et 145 ont unifié les liens ressource ↔ question dans
-- `resource_question_links` et `gl_resource_question_links`, en laissant les tables
-- d'origine « intactes », la convergence étant annoncée « dans un lot ultérieur ».
-- C'est ce lot (audit docs/AUDIT_BDD_2026-08.md §4.5).
--
-- Plus aucune ligne de routes/, lib/ ou src/ ne les lit ; les tests l'assertent
-- explicitement (tests/quiz-api.test.js, tests/fm-quiz-import.test.js). Ce qui restait,
-- ce sont 3 230 lignes de double source de vérité — vouées à diverger le jour où
-- quelqu'un modifierait l'une à la main.
--
-- La reprise a été vérifiée complète sur l'export du 18/08/2026 (0 lien manquant sur les
-- trois tables). Plutôt que de s'y fier, l'étape 1 la REJOUE : les INSERT IGNORE
-- ci-dessous sont sans effet si tout est déjà repris, et rattrapent le reliquat sinon.
-- La suppression est donc démontrée sans perte sur n'importe quelle base, y compris une
-- base restée en arrière.
--
-- Idempotent (INSERT IGNORE + DROP TABLE IF EXISTS) : rejouable sans erreur.
-- =====================================================================

-- 1) Filet de sécurité : rejeu de la reprise 144/145 (sans effet si déjà complète).
INSERT IGNORE INTO resource_question_links
    (resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'glossary', glossary_code, question_code, 'import', 'approved', 1
    FROM quiz_question_glossary;

INSERT IGNORE INTO gl_resource_question_links
    (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'qcm', 'glossary', glossary_code, question_code, 'import', 'approved', 1
    FROM gl_qcm_question_glossary;

INSERT IGNORE INTO gl_resource_question_links
    (question_dataset, resource_type, resource_ref, question_code, origin, status, is_gating)
  SELECT 'qcm_lore', 'lore_glossary', lore_code, question_code, 'import', 'approved', 1
    FROM gl_qcm_lore_question_glossary;

-- 2) Suppression.
DROP TABLE IF EXISTS quiz_question_glossary;
DROP TABLE IF EXISTS gl_qcm_question_glossary;
DROP TABLE IF EXISTS gl_qcm_lore_question_glossary;
