-- Échelles de niveau : relier ce qui coexistait sans lien (référentiel lib/pedagoScales.js).
--
-- Constat : cinq échelles de niveau (étape d'affichage, niveau de question, difficulté,
-- profondeur de terme, niveau scolaire des notions) sans correspondance ; `pedago_level`
-- NULL partout, donc tout le monde en « collège » sans distinguer cycle 3 et cycle 4 ; les
-- tables fines `quiz_question_notions` et `glossary_term_notions` vides. Cette migration
-- porte la partie données du correctif ; la règle (palier d'entrée, garde d'héritage) vit
-- dans lib/pedagoScales.js.
--
-- 1) `glossary_category_notions` — le glossaire hérite désormais des notions par sa
--    catégorie, comme le quiz (migration 273). Sans héritage, `glossary_term_notions`
--    devait être remplie terme par terme ; personne ne l'a fait (aucun écran ne le
--    permet) et le filtre « notion » du glossaire ne rendait jamais rien. La profondeur du
--    terme fixe son palier d'entrée : un terme « avancé » n'hérite pas des notions de
--    collège de sa catégorie.
--    Pas de clé étrangère sur `categorie` : les catégories de glossaire n'ont pas de table
--    propre, elles existent dès qu'un terme les porte.
--
-- 2) `glossary_term_notions.mode` — la table devient celle des exceptions (`ajout` /
--    `exclusion`), exactement comme `quiz_question_notions`. Les lignes existantes (aucune
--    à ce jour) gardent leur sens : ce sont des ajouts.
--
-- 3) `groups.curriculum_niveau` — le niveau du programme d'une classe (cycle 3, cycle 4,
--    seconde…). L'étape d'affichage (`pedago_level`) ne distingue pas une 6ᵉ d'une 3ᵉ ;
--    celui-ci si. Il resserre les notions proposées aux élèves de la classe et, quand
--    `pedago_level` reste vide, en fixe l'étape (cycle 3 ou 4 → Collège, seconde et
--    au-delà → Lycée). NULL = hériter du groupe parent : régler une fois l'unité « 6ᵉ »
--    suffit pour toutes ses classes.
--
-- Idempotent : `IF NOT EXISTS` et `INSERT IGNORE` — une liaison déjà posée n'est pas
-- dupliquée, un ajout fait depuis par un enseignant n'est pas touché. Même choix que la
-- migration 273.

CREATE TABLE IF NOT EXISTS glossary_category_notions (
  categorie varchar(64) NOT NULL COMMENT 'glossary_terms.categorie (ecologie, sol…)',
  notion_id varchar(32) NOT NULL,
  PRIMARY KEY (categorie, notion_id),
  KEY idx_glcn_notion (notion_id),
  CONSTRAINT fk_glcn_notion FOREIGN KEY (notion_id) REFERENCES curriculum_notions (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE glossary_term_notions
  ADD COLUMN IF NOT EXISTS mode enum('ajout','exclusion') NOT NULL DEFAULT 'ajout'
    COMMENT 'ajout = notion en plus de celles de la catégorie ; exclusion = notion héritée retirée';

ALTER TABLE `groups`
  ADD COLUMN IF NOT EXISTS curriculum_niveau enum(
    'cycle3',
    'cycle4',
    'seconde',
    'premiere_spe',
    'terminale_spe',
    'es_premiere',
    'es_terminale'
  ) DEFAULT NULL
    COMMENT 'Niveau du programme de la classe (NULL = hériter du groupe parent)';

-- ---------------------------------------------------------------------------
-- Correspondance catégories de glossaire -> notions (les termes en héritent, au palier de
-- leur profondeur). Calquée sur les catégories de quiz voisines (migration 273) et relue
-- sur le corpus : `ecosysteme` porte les cycles de la matière et le carbone, `flore` la
-- photosynthèse, `methode_svt` la démarche de mesure, etc.
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO glossary_category_notions (categorie, notion_id) VALUES
('taxonomie', 'C3-VIV'),
('taxonomie', 'C4-VIV'),
('taxonomie', '2-BIODIV'),
('faune', 'C3-VIV'),
('faune', 'C4-VIV'),
('faune', '2-BIODIV'),
('flore', 'C3-VIV'),
('flore', 'C4-VIV'),
('flore', '2-BIODIV'),
('flore', '2-ORGA'),
('flore', 'ES1-SOLEIL'),
('cycle_de_vie', 'C3-VIV'),
('cycle_de_vie', 'C4-VIV'),
('interaction', 'C3-ENV'),
('interaction', 'C4-VIV'),
('interaction', '1-ECO'),
('interaction', 'EST-VIVANT'),
('ecologie', 'C3-ENV'),
('ecologie', 'C4-TERRE'),
('ecologie', 'C4-VIV'),
('ecologie', '2-BIODIV'),
('ecologie', '1-ECO'),
('ecologie', 'ES1-SOLEIL'),
('ecologie', 'EST-VIVANT'),
('ecosysteme', 'C3-ENV'),
('ecosysteme', 'C4-TERRE'),
('ecosysteme', '2-AGRO'),
('ecosysteme', '1-ECO'),
('ecosysteme', 'ES1-SOLEIL'),
('ecosysteme', 'EST-CLIMAT'),
('sol', 'C3-ENV'),
('sol', 'C4-TERRE'),
('sol', '2-AGRO'),
('agroecologie', 'C4-TERRE'),
('agroecologie', '2-AGRO'),
('agroecologie', '1-ECO'),
('agroecologie', 'T-DOM'),
('eau_aquaponie', 'C4-TERRE'),
('eau_aquaponie', '2-AGRO'),
('eau_aquaponie', '1-ECO'),
('conservation', 'C3-ENV'),
('conservation', 'C4-TERRE'),
('conservation', '2-BIODIV'),
('conservation', '1-ECO'),
('paysage', 'C3-ENV'),
('paysage', 'C4-TERRE'),
('methode_svt', 'C4-TERRE'),
('methode_svt', '2-BIODIV'),
('methode_svt', '2-ORGA');

-- ---------------------------------------------------------------------------
-- Séance A « Reconnaître sans toucher » : sa consigne annonce un mini-quiz « cycle 3 ou 4 »
-- mais sa configuration demandait `cycle4` seul. Elle passe à `college` (tout le collège),
-- que le quiz resserre au cycle de la classe. Seulement si la valeur livrée n'a pas été
-- changée par un professeur. La séance B (« cycle 4 » dans sa consigne) ne bouge pas.
-- ---------------------------------------------------------------------------

UPDATE pedago_sessions
   SET config_json = JSON_SET(config_json, '$.notionNiveau', 'college'),
       steps_json = REPLACE(
         steps_json,
         '"payload":{"notionNiveau":"cycle4"}',
         '"payload":{"notionNiveau":"college"}'
       )
 WHERE id = 'pedago-session-college-reconaitre'
   AND JSON_VALID(config_json)
   AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.notionNiveau')) = 'cycle4';
