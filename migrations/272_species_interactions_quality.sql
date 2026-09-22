-- Lot 1 — Cinq types d'interaction de plus, et la qualité du lien enfin dite.
--
-- 1) L'ENUM `interaction_type` gagne `mutualisme`, `commensalisme`, `mycophagie`,
--    `allelopathie`, `facilitation`. Les cinq manquaient au vocabulaire, et leur absence
--    forçait des rangements faux : la trophobiose fourmi–puceron devenait une « symbiose »
--    (qui suppose une vie commune obligatoire), le héron garde-bœufs qui suit les vaches
--    n'avait aucune case (il ne leur donne ni ne leur prend rien : c'est la définition du
--    commensalisme), et un collembole broutant un mycélium passait pour un détritivore alors
--    qu'il mange un être vivant. `allelopathie` et `facilitation` sortent de `competition`,
--    qui les contenait par défaut : l'inhibition chimique et l'effet d'abri entre voisines
--    sont justement ce que la compétition n'explique pas.
--    Les valeurs s'ajoutent EN FIN d'ENUM : aucune ligne existante ne change de sens.
--
-- 2) Trois colonnes disent la QUALITÉ du lien, ce que `description` ne pouvait porter :
--    * `evidence_level` — d'où vient l'information : bibliographie, observation sur le site,
--      ou hypothèse. Sans elle, un lien relevé dans la cour et un lien recopié d'une flore
--      s'affichent à l'identique, et l'élève ne peut pas distinguer ce qui a été vu de ce qui
--      est plausible. NOT NULL DEFAULT 'bibliographie' : l'existant est, de fait, documenté.
--    * `pollination_efficacy` — tous les visiteurs d'une fleur ne la pollinisent pas. Le
--      voleur de nectar perce la corolle par la base et ne touche aucune étamine ; la cétoine
--      floricole emporte du pollen par accident. Les confondre avec l'abeille fausse la
--      leçon sur le service de pollinisation. Renseignée pour `pollinisation` seulement — la
--      contrainte est tenue côté application (`lib/shared/foodWebCore.js`), MySQL n'ayant pas
--      de CHECK portable sur ce motif.
--    * `source_ref` — la référence (ouvrage, article, URL) derrière un lien bibliographique.
--
-- GL n'est PAS concerné : `gl_species_interactions` garde ses 14 types et ses colonnes.
-- L'isolement des deux produits se joue ici dans la configuration du magasin partagé
-- (`allowedTypes` / `quality` dans `makeFoodWebStore`), pas dans une seconde ENUM à étendre.
--
-- Un ALTER par colonne : errno 1060 (colonne déjà présente) est ignoré instruction par
-- instruction par database.js, donc un lot groupé perdrait les colonnes suivantes si la
-- première existait déjà.

ALTER TABLE species_interactions
  MODIFY COLUMN interaction_type ENUM(
    'pollinisation','herbivorie','predation','plante_hote','decomposition',
    'nitrification','symbiose','competition',
    'detritivorie','frugivorie','granivorie','parasitisme','excretion','assimilation',
    'mutualisme','commensalisme','mycophagie','allelopathie','facilitation'
  ) NOT NULL;

ALTER TABLE species_interactions
  ADD COLUMN evidence_level ENUM('bibliographie','observe_site','hypothese')
    NOT NULL DEFAULT 'bibliographie'
    COMMENT 'Niveau de preuve du lien (documenté / observé sur le site / hypothèse)';
ALTER TABLE species_interactions
  ADD COLUMN pollination_efficacy ENUM('efficace','accessoire','visiteur','voleur_nectar')
    DEFAULT NULL
    COMMENT 'Uniquement pour interaction_type = pollinisation';
ALTER TABLE species_interactions
  ADD COLUMN source_ref VARCHAR(255) DEFAULT NULL
    COMMENT 'Référence bibliographique ou URL à l''appui du lien';

-- ---------------------------------------------------------------------------
-- Vue de lecture : les trois colonnes doivent remonter jusqu'à `GET /api/food-web`.
--
-- DROP + CREATE plutôt qu'un CREATE OR REPLACE : la vue est recréée dans la base COURANTE,
-- règle posée par la migration 183 (MariaDB fige le nom de base dans la définition d'une
-- vue). Définition inchangée par ailleurs, aucune donnée touchée.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_food_web;
CREATE SQL SECURITY INVOKER VIEW v_food_web AS
  SELECT si.id, si.interaction_type,
         pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji,
         pf.trophic_role AS from_role,
         pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji,
         pt.trophic_role AS to_role,
         si.description, si.evidence_level, si.pollination_efficacy, si.source_ref
    FROM species_interactions si
    JOIN plants pf ON pf.id = si.from_plant_id
    LEFT JOIN plants pt ON pt.id = si.to_plant_id;

-- ---------------------------------------------------------------------------
-- Amorçage (sql/biodiv_structure_seeds/01_interactions.sql)
--
-- Les INSERT sont en IGNORE et les UPDATE bornés par le type de départ ou par
-- `pollination_efficacy IS NULL` : rejouer la migration ne réécrit jamais une saisie
-- d'enseignant, et un second passage est sans effet.
--
-- Les quatre relations ajoutées passent par un `INSERT … SELECT` gardé sur l'identifiant ET
-- sur le nom de l'espèce, comme les seeds des lots 2 et 3. Deux raisons : une base au
-- catalogue renuméroté poserait sinon une trophobiose sur la mauvaise espèce, et une base
-- neuve (tests, développement) n'a aucune de ces fiches — la clé étrangère échouerait et
-- arrêterait la migration, là où un SELECT sans ligne ne fait simplement rien.
-- ---------------------------------------------------------------------------

-- Mutualisme fourmis–pucerons (trophobiose)
INSERT IGNORE INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT pf.id, pt.id, 'mutualisme', 'Trophobiose : les fourmis récoltent le miellat des pucerons et les protègent en retour de leurs prédateurs (coccinelles, larves de syrphes)'
  FROM plants pf JOIN plants pt
 WHERE pf.id = 27 AND pf.name LIKE '%ourmi%' AND pt.id = 59 AND pt.name LIKE '%uceron%';
INSERT IGNORE INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT pf.id, pt.id, 'mutualisme', 'Trophobiose : les fourmis récoltent le miellat des pucerons et les protègent en retour de leurs prédateurs (coccinelles, larves de syrphes)'
  FROM plants pf JOIN plants pt
 WHERE pf.id = 563 AND pf.name LIKE '%ourmi%' AND pt.id = 59 AND pt.name LIKE '%uceron%';

-- Commensalisme héron garde-bœufs / bétail
INSERT IGNORE INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT pf.id, pt.id, 'commensalisme', 'Suit les vaches pour capturer les insectes dérangés par leurs pas, sans leur nuire ni leur être utile'
  FROM plants pf JOIN plants pt
 WHERE pf.id = 503 AND pf.name LIKE '%arde-b%' AND pt.id = 589 AND pt.name LIKE '%ache%';
INSERT IGNORE INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT pf.id, pt.id, 'commensalisme', 'Suit les troupeaux de moutons pour capturer les insectes dérangés par leurs pas'
  FROM plants pf JOIN plants pt
 WHERE pf.id = 503 AND pf.name LIKE '%arde-b%' AND pt.id = 586 AND pt.name LIKE '%outon%';

-- Broutage de champignons reclassé en mycophagie
UPDATE species_interactions SET interaction_type = 'mycophagie' WHERE from_plant_id = 88 AND to_plant_id = 336 AND interaction_type = 'detritivorie';
UPDATE species_interactions SET interaction_type = 'mycophagie' WHERE from_plant_id = 88 AND to_plant_id = 85 AND interaction_type = 'detritivorie';
UPDATE species_interactions SET interaction_type = 'mycophagie' WHERE from_plant_id = 340 AND to_plant_id = 334 AND interaction_type = 'detritivorie';

-- Efficacité de pollinisation. `IN (SELECT …)` et non `= (SELECT …)` : un catalogue où le
-- nom scientifique apparaît deux fois ferait échouer l'instruction (errno 1242) au lieu de
-- ne rien trouver.
UPDATE species_interactions SET pollination_efficacy = 'efficace' WHERE interaction_type = 'pollinisation' AND pollination_efficacy IS NULL AND (from_plant_id IN (325, 327) OR from_plant_id IN (SELECT id FROM plants WHERE scientific_name = 'Blastophaga psenes'));
UPDATE species_interactions SET pollination_efficacy = 'accessoire' WHERE interaction_type = 'pollinisation' AND pollination_efficacy IS NULL AND from_plant_id IN (68, 83);
UPDATE species_interactions SET pollination_efficacy = 'accessoire' WHERE interaction_type = 'pollinisation' AND from_plant_id = 28 AND to_plant_id = 36 AND pollination_efficacy IS NULL;

-- Glossaire : rattache le terme « mutualisme » aux relations qui l'illustrent, s'il existe.
INSERT IGNORE INTO glossary_term_interactions (glossary_code, interaction_id) SELECT 'FM0384', id FROM species_interactions WHERE interaction_type = 'mutualisme' AND EXISTS (SELECT 1 FROM glossary_terms WHERE glossary_code = 'FM0384');
