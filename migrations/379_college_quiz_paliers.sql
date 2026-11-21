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
-- 1. Ajouts de l'autre cycle supprimés (49 lignes)
--    Notion ajoutée à la main qui ne vient pas de la catégorie.
-- ---------------------------------------------------------------------
DELETE qn
  FROM quiz_question_notions qn
  JOIN (
    SELECT 'QF9877' AS code, 'demarche_mesure' AS categorie, 'C3-ENV' AS notion
    UNION ALL SELECT 'QF9924', 'demarche_mesure', 'C3-ENV'
    UNION ALL SELECT 'QF7030', 'environnement_durable', 'C3-ENV'
    UNION ALL SELECT 'QF7034', 'environnement_durable', 'C3-ENV'
    UNION ALL SELECT 'QF7057', 'environnement_durable', 'C3-ENV'
    UNION ALL SELECT 'QF9875', 'evolution_biodiversite', 'C3-VIV'
    UNION ALL SELECT 'QF0365', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0366', 'glossaire_definitions', 'C3-ENV'
    UNION ALL SELECT 'QF0368', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0368', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0370', 'glossaire_definitions', 'C3-ENV'
    UNION ALL SELECT 'QF0372', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0373', 'glossaire_definitions', 'C3-ENV'
    UNION ALL SELECT 'QF0374', 'glossaire_definitions', 'C3-DEVREPRO'
    UNION ALL SELECT 'QF0374', 'glossaire_definitions', 'C3-VIV'
    UNION ALL SELECT 'QF0376', 'glossaire_definitions', 'C3-VIV'
    UNION ALL SELECT 'QF0378', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0378', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0379', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0380', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0381', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0382', 'glossaire_definitions', 'C3-MATORG'
    UNION ALL SELECT 'QF0382', 'glossaire_definitions', 'C3-VIV'
    UNION ALL SELECT 'QF0383', 'glossaire_definitions', 'C3-MATORG'
    UNION ALL SELECT 'QF0383', 'glossaire_definitions', 'C3-VIV'
    UNION ALL SELECT 'QF0384', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0385', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0386', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0388', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0389', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0390', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0391', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0392', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0393', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0394', 'glossaire_definitions', 'C4-RESS'
    UNION ALL SELECT 'QF0394', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0395', 'glossaire_definitions', 'C4-RESS'
    UNION ALL SELECT 'QF0395', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0396', 'glossaire_definitions', 'C4-RESS'
    UNION ALL SELECT 'QF0396', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0399', 'glossaire_definitions', 'C4-RESS'
    UNION ALL SELECT 'QF0399', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0400', 'glossaire_definitions', 'C3-ALIM'
    UNION ALL SELECT 'QF0401', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0402', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0403', 'glossaire_definitions', 'C4-RESS'
    UNION ALL SELECT 'QF0403', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0404', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0404', 'glossaire_definitions', 'C4-VIV'
  ) v ON qn.question_code = v.code COLLATE utf8mb4_unicode_ci AND qn.notion_id = v.notion COLLATE utf8mb4_unicode_ci
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
 WHERE qn.mode = 'ajout';

-- ---------------------------------------------------------------------
-- 2. Ajouts de l'autre cycle aussi hérités : passés en exclusion (3 lignes)
--    Clé primaire (question, notion) : une seule ligne, dont on change le mode.
-- ---------------------------------------------------------------------
UPDATE quiz_question_notions qn
  JOIN (
    SELECT 'QF7064' AS code, 'ecologie_reseaux' AS categorie, 'C3-ENV' AS notion
    UNION ALL SELECT 'QF9874', 'energie_matiere', 'C3-MATORG'
    UNION ALL SELECT 'QF9915', 'energie_matiere', 'C3-MATORG'
  ) v ON qn.question_code = v.code COLLATE utf8mb4_unicode_ci AND qn.notion_id = v.notion COLLATE utf8mb4_unicode_ci
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
   SET qn.mode = 'exclusion'
 WHERE qn.mode = 'ajout';

-- ---------------------------------------------------------------------
-- 3. Exclusions des notions héritées de l'autre cycle (105 lignes)
--    Parents : la question (code, catégorie, niveau college) et la notion.
-- ---------------------------------------------------------------------
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT q.question_code, cn.id, 'exclusion'
  FROM (
    SELECT 'QF0130' AS code, 'agroecologie_permaculture' AS categorie, 'C4-RESS' AS notion
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
    UNION ALL SELECT 'QF0524', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF0539', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7012', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7018', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7035', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7036', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7037', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7040', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7042', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7046', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7048', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7050', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7052', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7053', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF7056', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9002', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9101', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9102', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9260', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9263', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9268', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9272', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9529', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9726', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9735', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9763', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9765', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9768', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9769', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9779', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9781', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9799', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9808', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9815', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9829', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9830', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9831', 'ecologie_reseaux', 'C3-ENV'
    UNION ALL SELECT 'QF9834', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9835', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9880', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF9890', 'ecologie_reseaux', 'C4-VIV'
    UNION ALL SELECT 'QF0094', 'energie_matiere', 'C3-MATORG'
    UNION ALL SELECT 'QF0532', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9859', 'energie_matiere', 'C3-MATORG'
    UNION ALL SELECT 'QF9884', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9894', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9902', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9909', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9921', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9927', 'energie_matiere', 'C4-VIV'
    UNION ALL SELECT 'QF9885', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9895', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9903', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9910', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9916', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9922', 'evolution_biodiversite', 'C4-VIV'
    UNION ALL SELECT 'QF9928', 'evolution_biodiversite', 'C4-VIV'
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
-- 5. Questions passées au lycée : ajouts de collège supprimés (11 lignes)
--    Avant le bloc 6 (garde niveau = college).
-- ---------------------------------------------------------------------
DELETE qn
  FROM quiz_question_notions qn
  JOIN (
    SELECT 'QF0367' AS code, 'glossaire_definitions' AS categorie, 'C3-ENV' AS notion
    UNION ALL SELECT 'QF0367', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0369', 'glossaire_definitions', 'C3-ENV'
    UNION ALL SELECT 'QF0369', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0369', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0371', 'glossaire_definitions', 'C3-ENV'
    UNION ALL SELECT 'QF0371', 'glossaire_definitions', 'C4-TERRE'
    UNION ALL SELECT 'QF0371', 'glossaire_definitions', 'C4-VIV'
    UNION ALL SELECT 'QF0375', 'glossaire_definitions', 'C3-MATORG'
    UNION ALL SELECT 'QF0375', 'glossaire_definitions', 'C3-VIV'
    UNION ALL SELECT 'QF0375', 'glossaire_definitions', 'C4-VIV'
  ) v ON qn.question_code = v.code COLLATE utf8mb4_unicode_ci AND qn.notion_id = v.notion COLLATE utf8mb4_unicode_ci
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
                       AND q.niveau = 'college'
 WHERE qn.mode = 'ajout';

-- ---------------------------------------------------------------------
-- 6. Niveau college → lycee (4 questions)
--    La garde de palier retire alors d'elle-même les notions de collège héritées.
-- ---------------------------------------------------------------------
UPDATE quiz_questions q
  JOIN (
    SELECT 'QF0367' AS code, 'glossaire_definitions' AS categorie
    UNION ALL SELECT 'QF0369', 'glossaire_definitions'
    UNION ALL SELECT 'QF0371', 'glossaire_definitions'
    UNION ALL SELECT 'QF0375', 'glossaire_definitions'
  ) v ON q.question_code = v.code COLLATE utf8mb4_unicode_ci AND q.categorie_slug = v.categorie COLLATE utf8mb4_unicode_ci
   SET q.niveau = 'lycee'
 WHERE q.niveau <=> 'college';

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

