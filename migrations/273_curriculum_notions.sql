-- Notions des programmes officiels (lot 8) : le chaînon manquant entre le catalogue
-- pédagogique et ce qu'un professeur doit traiter en classe.
--
-- Le quiz et le glossaire se filtrent aujourd'hui par thème (« sciences » / « jardinage »),
-- par catégorie et par niveau au sens large (`college` / `lycee`). Rien ne dit à quelle
-- notion du programme une question se rattache. Un professeur de seconde qui cherche de
-- quoi illustrer « Biodiversité, résultat et étape de l'évolution » doit ouvrir les
-- catégories une à une et lire les énoncés : l'information existe dans sa tête, pas dans
-- la base.
--
-- 1) `curriculum_notions` — le référentiel. Un identifiant lisible (`2-BIODIV`), le
--    niveau scolaire, la discipline, le thème du programme et la notion elle-même.
--    Volontairement plat : ce n'est pas une arborescence de programmes officiels à
--    maintenir, c'est la liste des entrées par lesquelles on cherche du contenu.
--    L'identifiant est une chaîne saisie (pas un auto-incrément) pour qu'une liaison
--    reste lisible en base et qu'un export garde son sens.
--
-- 2) `quiz_category_notions` — la liaison porteuse. **Une question hérite des notions de
--    sa catégorie** : rattacher les 17 catégories coûte 42 lignes, rattacher les ~500
--    questions une à une coûterait des heures et vieillirait mal (une question ajoutée
--    demain serait orpheline). C'est le même choix que l'héritage de catégorie des lieux
--    (migration 262).
--
-- 3) `quiz_question_notions` — l'exception. Une question de « Sol vivant & compostage »
--    qui porte en réalité sur la photosynthèse n'a pas les notions de sa catégorie. Deux
--    modes, d'où la colonne `mode` : `ajout` rattache une notion que la catégorie n'a
--    pas, `exclusion` retire une notion héritée. Sans le mode, la seule façon de corriger
--    une question serait de déplacer la question de catégorie (ce qui casse son numéro)
--    ou de retirer la notion à toute la catégorie (ce qui dérattache ses voisines).
--    Notions effectives = (notions de la catégorie − exclusions) ∪ ajouts.
--
-- 4) `glossary_term_notions` — même principe côté vocabulaire, mais sans héritage : un
--    terme de glossaire n'a pas de catégorie au sens du programme (`ecologie`, `sol`…
--    sont des familles de vocabulaire, pas des entrées de programme).
--
-- Les quatre tables sont en `utf8mb4_unicode_ci` comme `quiz_categories`,
-- `quiz_questions` et `glossary_terms` : une collation différente ferait échouer les
-- clés étrangères.

CREATE TABLE IF NOT EXISTS curriculum_notions (
  id varchar(32) NOT NULL COMMENT 'Identifiant lisible (2-BIODIV, C4-VIV…)',
  niveau enum(
    'cycle3',
    'cycle4',
    'seconde',
    'premiere_spe',
    'terminale_spe',
    'es_premiere',
    'es_terminale'
  ) NOT NULL COMMENT 'Niveau scolaire visé par la notion',
  discipline varchar(120) NOT NULL COMMENT 'Sciences et technologie, SVT, Enseignement scientifique…',
  theme varchar(255) NOT NULL COMMENT 'Thème du programme officiel',
  notion varchar(255) NOT NULL COMMENT 'Notion travaillée, telle qu''énoncée au programme',
  sort_order int NOT NULL DEFAULT 0 COMMENT 'Ordre d''affichage (progression du cycle 3 à la terminale)',
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_curriculum_notions_niveau (niveau),
  KEY idx_curriculum_notions_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_category_notions (
  categorie_slug varchar(64) NOT NULL,
  notion_id varchar(32) NOT NULL,
  PRIMARY KEY (categorie_slug, notion_id),
  KEY idx_qcn_notion (notion_id),
  CONSTRAINT fk_qcn_categorie FOREIGN KEY (categorie_slug) REFERENCES quiz_categories (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qcn_notion FOREIGN KEY (notion_id) REFERENCES curriculum_notions (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_question_notions (
  question_code varchar(16) NOT NULL,
  notion_id varchar(32) NOT NULL,
  mode enum('ajout','exclusion') NOT NULL DEFAULT 'ajout'
    COMMENT 'ajout = notion en plus de celles de la catégorie ; exclusion = notion héritée retirée',
  PRIMARY KEY (question_code, notion_id),
  KEY idx_qqn_notion (notion_id),
  CONSTRAINT fk_qqn_question FOREIGN KEY (question_code) REFERENCES quiz_questions (question_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qqn_notion FOREIGN KEY (notion_id) REFERENCES curriculum_notions (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS glossary_term_notions (
  glossary_code varchar(16) NOT NULL,
  notion_id varchar(32) NOT NULL,
  PRIMARY KEY (glossary_code, notion_id),
  KEY idx_gtn_notion (notion_id),
  CONSTRAINT fk_gtn_terme FOREIGN KEY (glossary_code) REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gtn_notion FOREIGN KEY (notion_id) REFERENCES curriculum_notions (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Amorçage (sql/biodiv_structure_seeds/07_programmes.sql)
--
-- `INSERT IGNORE` partout : rejouer la migration ne réécrit jamais un libellé corrigé
-- par un enseignant, et une liaison déjà posée n'est pas dupliquée. Les enveloppes du
-- fichier d'amorçage (`SET NAMES`, `START TRANSACTION`, `COMMIT`) sont retirées — le
-- découpage d'énoncés de `database.js` exécute chaque instruction séparément.
--
-- Deux catégories citées par l'amorçage — `milieux_terrain` et `demarche_mesure` —
-- existent dans la base corrigée mais pas dans le jeu de catégories versionné.
-- `INSERT IGNORE` ramène la violation de clé étrangère à un avertissement : la liaison
-- est posée là où la catégorie existe et sautée ailleurs, sans faire échouer la migration.
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order) VALUES
('C3-VIV', 'cycle3', 'Sciences et technologie', 'Le vivant, sa diversité et les fonctions qui le caractérisent', 'Classer les organismes, exploiter les liens de parenté', 0),
('C3-ENV', 'cycle3', 'Sciences et technologie', 'La planète Terre. Les êtres vivants dans leur environnement', 'Identifier des enjeux liés à l’environnement ; peuplement des milieux', 1),
('C4-TERRE', 'cycle4', 'SVT', 'La planète Terre, l’environnement et l’action humaine', 'Écosystèmes, action humaine, biodiversité, sciences participatives', 2),
('C4-VIV', 'cycle4', 'SVT', 'Le vivant et son évolution', 'Nutrition des organismes, relations entre êtres vivants, classification, évolution', 3),
('2-BIODIV', 'seconde', 'SVT', 'La Terre, la vie et l’organisation du vivant', 'Biodiversité, résultat et étape de l’évolution', 4),
('2-ORGA', 'seconde', 'SVT', 'La Terre, la vie et l’organisation du vivant', 'L’organisation fonctionnelle du vivant (métabolismes, dont la photosynthèse)', 5),
('2-AGRO', 'seconde', 'SVT', 'Enjeux contemporains de la planète', 'Agrosystèmes et développement durable (sols, cycles de la matière)', 6),
('1-ECO', 'premiere_spe', 'SVT', 'Enjeux planétaires contemporains', 'Écosystèmes et services environnementaux', 7),
('T-DOM', 'terminale_spe', 'SVT', 'Enjeux planétaires contemporains', 'De la plante sauvage à la plante domestiquée', 8),
('ES1-SOLEIL', 'es_premiere', 'Enseignement scientifique', 'Le Soleil, notre source d’énergie', 'Photosynthèse, biomasse et réseaux trophiques', 9),
('EST-VIVANT', 'es_terminale', 'Enseignement scientifique', 'Une histoire du vivant', 'La biodiversité et son évolution', 10),
('EST-CLIMAT', 'es_terminale', 'Enseignement scientifique', 'Science, climat et société', 'Le carbone et les écosystèmes face au changement climatique', 11);

-- Correspondance catégories de quiz -> notions (les questions héritent des notions de leur catégorie)
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('vivant_classification', 'C3-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('vivant_classification', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('vivant_classification', '2-BIODIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ecologie_reseaux', 'C3-ENV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ecologie_reseaux', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ecologie_reseaux', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ecologie_reseaux', 'ES1-SOLEIL');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('cycle_azote_aquaponie', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('cycle_azote_aquaponie', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('sol_compost', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('sol_compost', 'C4-TERRE');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('plantes_biologie', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('plantes_biologie', '2-ORGA');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('plantes_biologie', 'T-DOM');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('pratiques_potager', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('semis_recolte', 'C3-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('semis_recolte', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ravageurs_auxiliaires', 'C4-TERRE');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ravageurs_auxiliaires', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('ravageurs_auxiliaires', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('eau_arrosage', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('energie_matiere', 'ES1-SOLEIL');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('energie_matiere', '2-ORGA');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('energie_matiere', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('cellule_metabolisme', '2-ORGA');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('evolution_biodiversite', '2-BIODIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('evolution_biodiversite', 'EST-VIVANT');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('evolution_biodiversite', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('populations_equilibres', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('populations_equilibres', 'EST-VIVANT');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('agroecologie_permaculture', '2-AGRO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('agroecologie_permaculture', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('environnement_durable', 'C4-TERRE');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('environnement_durable', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('environnement_durable', 'EST-CLIMAT');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('identification_especes', 'C3-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('identification_especes', 'C4-VIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('identification_especes', '2-BIODIV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('milieux_terrain', 'C3-ENV');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('milieux_terrain', 'C4-TERRE');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('milieux_terrain', '1-ECO');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('demarche_mesure', 'C4-TERRE');
INSERT IGNORE INTO quiz_category_notions (categorie_slug, notion_id) VALUES ('demarche_mesure', '2-BIODIV');
