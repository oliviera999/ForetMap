-- =====================================================================
-- Chantier collège (novembre 2026), flux D3 — migration `college_quiz_paliers`.
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-D3-migration.js à partir de
-- data/college-2026-11/D3/*.json : ne pas l'éditer à la main.
--
-- Objet : le palier d'une question de collège se déduit de ses notions effectives
-- (catégorie − exclusions ∪ ajouts) ; une notion de cycle 3 → palier 1, sinon palier 2.
-- 445 questions de collège étaient rattachées aux deux cycles (instantané du 21/11/2026) :
-- chacune est tranchée (cycle 3 ou cycle 4) d'après son contenu et les programmes, ou passée au
-- lycée. Relecture : docs/coordination/college-2026-11/revue/D3.md.
--
-- Blocs :
--   1. quiz_question_notions  ajouts de l'autre cycle supprimés (collège)
--   2. quiz_question_notions  ajouts de l'autre cycle aussi hérités : passés en exclusion
--   3. quiz_question_notions  exclusions des notions héritées de l'autre cycle
--   4. quiz_question_notions  ajouts d'une notion précise du palier retenu
--   5. quiz_question_notions  questions passées au lycée : ajouts de collège supprimés
--   6. quiz_questions         niveau college → lycee (garde sur l'ancienne valeur)
--   7. quiz_question_notions  notions de lycée des questions passées au lycée
--   8. quiz_questions         énoncés rendus autonomes (garde sur l'ancien énoncé)
--   9. quiz_categories        description_college (posée seulement si vide)
--
-- Gardes : chaque ligne vise une question par son code ET sa catégorie ET son niveau attendu
-- (une question absente, déplacée ou déjà modifiée dans l'application est sautée) ; insertions
-- en NOT EXISTS ; énoncés en `<=>` sur l'ancien texte. Rejouable : zéro erreur, zéro doublon.
-- Aucun DDL, aucune table gl_*, aucun trigger, aucune donnée personnelle.
-- =====================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 1. Ajouts de l'autre cycle supprimés (2 lignes)
--    Notion ajoutée à la main qui ne vient pas de la catégorie.
-- ---------------------------------------------------------------------
DELETE qn
  FROM quiz_question_notions qn
  JOIN (
    SELECT 'QF9877' AS code, 'demarche_mesure' AS categorie, 'C3-ENV' AS notion
    UNION ALL SELECT 'QF9924', 'demarche_mesure', 'C3-ENV'
  ) v ON qn.question_code = v.code COLLATE utf8mb4_unicode_ci AND qn.notion_id = v.notion COLLATE utf8mb4_unicode_ci
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
 WHERE qn.mode = 'ajout';

-- ---------------------------------------------------------------------
-- 2. Ajouts de l'autre cycle aussi hérités : passés en exclusion (0 lignes)
--    Clé primaire (question, notion) : une seule ligne, dont on change le mode.
-- ---------------------------------------------------------------------
-- (rien)


-- ---------------------------------------------------------------------
-- 3. Exclusions des notions héritées de l'autre cycle (48 lignes)
--    Parents : la question (code, catégorie, niveau college) et la notion.
-- ---------------------------------------------------------------------
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT q.question_code, cn.id, 'exclusion'
  FROM (
    SELECT 'QF0130' AS code, 'agroecologie_permaculture' AS categorie, 'C3-ALIM' AS notion
    UNION ALL SELECT 'QF0131', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF0133', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF0330', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF0331', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF0511', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF0525', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF9209', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF9210', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF9211', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF9212', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF9518', 'agroecologie_permaculture', 'C3-ALIM'
    UNION ALL SELECT 'QF9732', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF9733', 'agroecologie_permaculture', 'C4-RESS'
    UNION ALL SELECT 'QF0020', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF0021', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF0506', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9523', 'cycle_azote_aquaponie', 'C4-RESS'
    UNION ALL SELECT 'QF9525', 'cycle_azote_aquaponie', 'C4-RESS'
    UNION ALL SELECT 'QF9530', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9531', 'cycle_azote_aquaponie', 'C4-RESS'
    UNION ALL SELECT 'QF9615', 'cycle_azote_aquaponie', 'C4-RESS'
    UNION ALL SELECT 'QF9701', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9703', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9704', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9706', 'cycle_azote_aquaponie', 'C3-MATORG'
    UNION ALL SELECT 'QF9887', 'demarche_mesure', 'C4-TERRE'
    UNION ALL SELECT 'QF9912', 'demarche_mesure', 'C4-TERRE'
    UNION ALL SELECT 'QF9918', 'demarche_mesure', 'C4-TERRE'
    UNION ALL SELECT 'QF0080', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF0280', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF0281', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF0283', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF9201', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF9202', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF9203', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF9204', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF9225', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF9226', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF9227', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF9228', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF9723', 'eau_arrosage', 'C4-RESS'
    UNION ALL SELECT 'QF9724', 'eau_arrosage', 'C3-MATORG'
    UNION ALL SELECT 'QF0013', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF0210', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF0211', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF0212', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF0510', 'ecologie_reseaux', 'C3-ENV'
  ) v
  JOIN quiz_questions q ON q.question_code = v.code COLLATE utf8mb4_unicode_ci
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
  JOIN curriculum_notions cn ON cn.id = v.notion COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = q.question_code
            AND x.notion_id = cn.id);

-- ---------------------------------------------------------------------
-- 4. Ajouts d'une notion précise du palier retenu (6 lignes)
--    Quand la catégorie ne porte pas la notion qui décrit la question.
-- ---------------------------------------------------------------------
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT q.question_code, cn.id, 'ajout'
  FROM (
    SELECT 'QF9212' AS code, 'agroecologie_permaculture' AS categorie, 'C3-MATORG' AS notion
    UNION ALL SELECT 'QF9615', 'cycle_azote_aquaponie', 'C3-DEVREPRO'
    UNION ALL SELECT 'QF0080', 'eau_arrosage', 'C3-ENV'
    UNION ALL SELECT 'QF0281', 'eau_arrosage', 'C3-ENV'
    UNION ALL SELECT 'QF0283', 'eau_arrosage', 'C3-ENV'
    UNION ALL SELECT 'QF9201', 'eau_arrosage', 'C3-ENV'
  ) v
  JOIN quiz_questions q ON q.question_code = v.code COLLATE utf8mb4_unicode_ci
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
  JOIN curriculum_notions cn ON cn.id = v.notion COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = q.question_code
            AND x.notion_id = cn.id);

-- ---------------------------------------------------------------------
-- 5. Questions passées au lycée : ajouts de collège supprimés (0 lignes)
--    Avant le bloc 6 (garde niveau = college).
-- ---------------------------------------------------------------------
-- (rien)


-- ---------------------------------------------------------------------
-- 6. Niveau college → lycee (0 questions)
--    La garde de palier retire alors d'elle-même les notions de collège héritées.
-- ---------------------------------------------------------------------
-- (rien)


-- ---------------------------------------------------------------------
-- 7. Notions de lycée des questions passées au lycée (0 lignes)
--    Seulement celles que la catégorie ne donne pas déjà.
-- ---------------------------------------------------------------------
-- (rien)


-- ---------------------------------------------------------------------
-- 8. Énoncés rendus autonomes (0 questions)
--    Le nom du tutoriel est écrit en clair : la question se comprend hors de la fiche.
-- ---------------------------------------------------------------------
-- (rien)


-- ---------------------------------------------------------------------
-- 9. Descriptions collège des catégories (0 catégories)
--    Affichées au collège à la place de la description (flux C6).
-- ---------------------------------------------------------------------
-- (rien)

