SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Groupes d'usage de l'arbre des clades et ordres d'insectes manquants
-- (chantier collège de novembre 2026, flux D2).
--
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-D2-migration.js à partir de
-- data/college-2026-11/D2/*.json : ne pas modifier à la main.
--
--   1. Arbre collège : `clades.visible_college = 1`, `label_simple` et `attribute_simple`
--      (attribut observable en mots simples) sur les boîtes gardées au collège.
--   2. Quatre ordres d'insectes (Orthoptères, Dermaptères, Mantes, Névroptères), créés
--      sous `insectes`, non visibles au collège (vérifiés sur GBIF).
--   3. Rattachement des fiches concernées à ces ordres.
--
-- Gardes : clé naturelle (`clades.id`, `plants.scientific_name`) ; une valeur posée dans
-- l'application n'est jamais écrasée (colonne NULL / 0 attendue, ancien `clade_id`
-- attendu via <=>) ; une ligne dont le parent manque est sautée sans erreur (base fraîche).
-- Idempotent (rejouable deux fois), aucun trigger, aucun DEFINER, aucune table `gl_*`,
-- aucune donnée personnelle.
-- =====================================================================

-- 1. Arbre collège

-- vivant : Êtres vivants
UPDATE clades SET visible_college = 1 WHERE id = 'vivant' AND visible_college = 0;
UPDATE clades SET label_simple = 'Êtres vivants' WHERE id = 'vivant' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ils naissent, se nourrissent, grandissent, se reproduisent et meurent' WHERE id = 'vivant' AND attribute_simple IS NULL;

-- bacteries : Bactéries
UPDATE clades SET visible_college = 1 WHERE id = 'bacteries' AND visible_college = 0;
UPDATE clades SET label_simple = 'Bactéries' WHERE id = 'bacteries' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Êtres vivants minuscules, visibles seulement au microscope' WHERE id = 'bacteries' AND attribute_simple IS NULL;

-- cilies : Ciliés
UPDATE clades SET visible_college = 1 WHERE id = 'cilies' AND visible_college = 0;
UPDATE clades SET label_simple = 'Ciliés' WHERE id = 'cilies' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Êtres vivants minuscules, visibles seulement au microscope, couverts de cils qui les font nager' WHERE id = 'cilies' AND attribute_simple IS NULL;

-- champignons : Champignons
UPDATE clades SET visible_college = 1 WHERE id = 'champignons' AND visible_college = 0;
UPDATE clades SET label_simple = 'Champignons' WHERE id = 'champignons' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ni plantes ni animaux : jamais verts, ils absorbent leur nourriture là où ils poussent' WHERE id = 'champignons' AND attribute_simple IS NULL;

-- rhodophytes : Algues rouges
UPDATE clades SET visible_college = 1 WHERE id = 'rhodophytes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Algues rouges' WHERE id = 'rhodophytes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Algues de couleur rouge, rose ou violacée' WHERE id = 'rhodophytes' AND attribute_simple IS NULL;

-- stramenopiles : Algues brunes et leurs cousins
UPDATE clades SET visible_college = 1 WHERE id = 'stramenopiles' AND visible_college = 0;
UPDATE clades SET label_simple = 'Algues brunes et leurs cousins' WHERE id = 'stramenopiles' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Algues de couleur brune ou olive ; leurs cousins microscopiques, comme le mildiou, ne sont pas colorés' WHERE id = 'stramenopiles' AND attribute_simple IS NULL;

-- algues_vertes : Algues vertes
UPDATE clades SET visible_college = 1 WHERE id = 'algues_vertes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Algues vertes' WHERE id = 'algues_vertes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Algues de couleur vert vif, en lames fines ou en filaments' WHERE id = 'algues_vertes' AND attribute_simple IS NULL;

-- embryophytes : Plantes terrestres
UPDATE clades SET visible_college = 1 WHERE id = 'embryophytes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Plantes terrestres' WHERE id = 'embryophytes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Plantes vertes qui, pour la plupart, vivent hors de l''eau' WHERE id = 'embryophytes' AND attribute_simple IS NULL;

-- bryophytes : Mousses
UPDATE clades SET visible_college = 1 WHERE id = 'bryophytes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Mousses' WHERE id = 'bryophytes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Petites plantes en coussins, sans fleurs ni vraies racines' WHERE id = 'bryophytes' AND attribute_simple IS NULL;

-- fougeres : Fougères
UPDATE clades SET visible_college = 1 WHERE id = 'fougeres' AND visible_college = 0;
UPDATE clades SET label_simple = 'Fougères' WHERE id = 'fougeres' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ni fleurs ni graines ; les jeunes feuilles sont enroulées en crosse' WHERE id = 'fougeres' AND attribute_simple IS NULL;

-- gymnospermes : Conifères et cousins (graines nues)
UPDATE clades SET visible_college = 1 WHERE id = 'gymnospermes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Conifères et cousins (graines nues)' WHERE id = 'gymnospermes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ni fleurs ni fruits : les graines sont à nu, souvent portées par des cônes comme la pomme de pin' WHERE id = 'gymnospermes' AND attribute_simple IS NULL;

-- angiospermes : Plantes à fleurs
UPDATE clades SET visible_college = 1 WHERE id = 'angiospermes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Plantes à fleurs' WHERE id = 'angiospermes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Des fleurs, puis des fruits qui enferment les graines' WHERE id = 'angiospermes' AND attribute_simple IS NULL;

-- metazoaires : Animaux
UPDATE clades SET visible_college = 1 WHERE id = 'metazoaires' AND visible_college = 0;
UPDATE clades SET label_simple = 'Animaux' WHERE id = 'metazoaires' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ils se nourrissent d''autres êtres vivants ; la plupart se déplacent' WHERE id = 'metazoaires' AND attribute_simple IS NULL;

-- cnidaires : Méduses et anémones
UPDATE clades SET visible_college = 1 WHERE id = 'cnidaires' AND visible_college = 0;
UPDATE clades SET label_simple = 'Méduses et anémones' WHERE id = 'cnidaires' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps mou, bouche entourée de tentacules qui piquent' WHERE id = 'cnidaires' AND attribute_simple IS NULL;

-- echinodermes : Oursins et étoiles de mer
UPDATE clades SET visible_college = 1 WHERE id = 'echinodermes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Oursins et étoiles de mer' WHERE id = 'echinodermes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Animaux marins à piquants ou à plaques dures, au corps construit en cinq parties' WHERE id = 'echinodermes' AND attribute_simple IS NULL;

-- mollusques : Mollusques
UPDATE clades SET visible_college = 1 WHERE id = 'mollusques' AND visible_college = 0;
UPDATE clades SET label_simple = 'Mollusques' WHERE id = 'mollusques' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps mou, souvent protégé par une coquille' WHERE id = 'mollusques' AND attribute_simple IS NULL;

-- gasteropodes : Escargots et limaces
UPDATE clades SET visible_college = 1 WHERE id = 'gasteropodes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Escargots et limaces' WHERE id = 'gasteropodes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ils rampent sur un large pied ; coquille d''une seule pièce, parfois absente' WHERE id = 'gasteropodes' AND attribute_simple IS NULL;

-- bivalves : Coquillages à deux valves
UPDATE clades SET visible_college = 1 WHERE id = 'bivalves' AND visible_college = 0;
UPDATE clades SET label_simple = 'Coquillages à deux valves' WHERE id = 'bivalves' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Coquille en deux parties (les valves) qui s''ouvrent et se ferment' WHERE id = 'bivalves' AND attribute_simple IS NULL;

-- cephalopodes : Pieuvres et seiches
UPDATE clades SET visible_college = 1 WHERE id = 'cephalopodes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Pieuvres et seiches' WHERE id = 'cephalopodes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Bras munis de ventouses autour de la bouche' WHERE id = 'cephalopodes' AND attribute_simple IS NULL;

-- annelides : Vers à anneaux
UPDATE clades SET visible_college = 1 WHERE id = 'annelides' AND visible_college = 0;
UPDATE clades SET label_simple = 'Vers à anneaux' WHERE id = 'annelides' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps mou et allongé, formé d''une suite d''anneaux' WHERE id = 'annelides' AND attribute_simple IS NULL;

-- nematodes : Vers ronds
UPDATE clades SET visible_college = 1 WHERE id = 'nematodes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Vers ronds' WHERE id = 'nematodes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Vers souvent minuscules, ronds et lisses, sans anneaux' WHERE id = 'nematodes' AND attribute_simple IS NULL;

-- plathelminthes : Vers plats
UPDATE clades SET visible_college = 1 WHERE id = 'plathelminthes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Vers plats' WHERE id = 'plathelminthes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps mou, aplati comme un ruban, sans anneaux' WHERE id = 'plathelminthes' AND attribute_simple IS NULL;

-- arthropodes : Animaux à pattes articulées
UPDATE clades SET visible_college = 1 WHERE id = 'arthropodes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Animaux à pattes articulées' WHERE id = 'arthropodes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Squelette dur à l''extérieur du corps ; pattes faites de plusieurs morceaux' WHERE id = 'arthropodes' AND attribute_simple IS NULL;

-- insectes : Insectes
UPDATE clades SET visible_college = 1 WHERE id = 'insectes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Insectes' WHERE id = 'insectes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Six pattes et deux antennes ; corps en trois parties' WHERE id = 'insectes' AND attribute_simple IS NULL;

-- arachnides : Araignées, scorpions, acariens
UPDATE clades SET visible_college = 1 WHERE id = 'arachnides' AND visible_college = 0;
UPDATE clades SET label_simple = 'Araignées, scorpions, acariens' WHERE id = 'arachnides' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Huit pattes et pas d''antennes' WHERE id = 'arachnides' AND attribute_simple IS NULL;

-- crustaces : Crustacés
UPDATE clades SET visible_college = 1 WHERE id = 'crustaces' AND visible_college = 0;
UPDATE clades SET label_simple = 'Crustacés' WHERE id = 'crustaces' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Deux paires d''antennes ; carapace souvent dure' WHERE id = 'crustaces' AND attribute_simple IS NULL;

-- myriapodes : Mille-pattes
UPDATE clades SET visible_college = 1 WHERE id = 'myriapodes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Mille-pattes' WHERE id = 'myriapodes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps long fait d''anneaux, avec de très nombreuses pattes' WHERE id = 'myriapodes' AND attribute_simple IS NULL;

-- collemboles : Collemboles
UPDATE clades SET visible_college = 1 WHERE id = 'collemboles' AND visible_college = 0;
UPDATE clades SET label_simple = 'Collemboles' WHERE id = 'collemboles' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Minuscules, six pattes, sans ailes ; ils sautent grâce à une fourche repliée sous le ventre' WHERE id = 'collemboles' AND attribute_simple IS NULL;

-- vertebres : Vertébrés
UPDATE clades SET visible_college = 1 WHERE id = 'vertebres' AND visible_college = 0;
UPDATE clades SET label_simple = 'Vertébrés' WHERE id = 'vertebres' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Squelette à l''intérieur du corps, avec une colonne vertébrale' WHERE id = 'vertebres' AND attribute_simple IS NULL;

-- actinopterygiens : Poissons
UPDATE clades SET visible_college = 1 WHERE id = 'actinopterygiens' AND visible_college = 0;
UPDATE clades SET label_simple = 'Poissons' WHERE id = 'actinopterygiens' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Ils vivent dans l''eau et nagent avec des nageoires ; corps souvent couvert d''écailles' WHERE id = 'actinopterygiens' AND attribute_simple IS NULL;

-- amphibiens : Amphibiens
UPDATE clades SET visible_college = 1 WHERE id = 'amphibiens' AND visible_college = 0;
UPDATE clades SET label_simple = 'Amphibiens' WHERE id = 'amphibiens' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Peau nue et humide ; les petits, les têtards, vivent dans l''eau' WHERE id = 'amphibiens' AND attribute_simple IS NULL;

-- squamates : Lézards et serpents
UPDATE clades SET visible_college = 1 WHERE id = 'squamates' AND visible_college = 0;
UPDATE clades SET label_simple = 'Lézards et serpents' WHERE id = 'squamates' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Peau couverte de petites écailles, qui se renouvelle en se détachant' WHERE id = 'squamates' AND attribute_simple IS NULL;

-- tortues : Tortues
UPDATE clades SET visible_college = 1 WHERE id = 'tortues' AND visible_college = 0;
UPDATE clades SET label_simple = 'Tortues' WHERE id = 'tortues' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Corps protégé par une carapace' WHERE id = 'tortues' AND attribute_simple IS NULL;

-- oiseaux : Oiseaux
UPDATE clades SET visible_college = 1 WHERE id = 'oiseaux' AND visible_college = 0;
UPDATE clades SET label_simple = 'Oiseaux' WHERE id = 'oiseaux' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Plumes et bec ; ils pondent des œufs' WHERE id = 'oiseaux' AND attribute_simple IS NULL;

-- mammiferes : Mammifères
UPDATE clades SET visible_college = 1 WHERE id = 'mammiferes' AND visible_college = 0;
UPDATE clades SET label_simple = 'Mammifères' WHERE id = 'mammiferes' AND label_simple IS NULL;
UPDATE clades SET attribute_simple = 'Poils ; les petits boivent le lait de leur mère' WHERE id = 'mammiferes' AND attribute_simple IS NULL;

-- 2. Ordres d'insectes manquants (non visibles au collège)

-- orthopteres : Orthoptera (GBIF 1458)
INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order, visible_college)
SELECT 'orthopteres', p.id, 'Orthoptères', 'Pattes de derrière souvent agrandies pour le saut ; ailes de devant étroites et coriaces', 'Criquets, grillons, sauterelles et courtilière. Chez beaucoup d''espèces, les mâles chantent pour attirer les femelles.', 56, 0
  FROM clades p
 WHERE p.id = 'insectes'
   AND NOT EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- dermapteres : Dermaptera (GBIF 1224)
INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order, visible_college)
SELECT 'dermapteres', p.id, 'Dermaptères', 'Pinces au bout de l''abdomen ; ailes de devant très courtes', 'Perce-oreilles. Malgré leur nom, ils n''entrent pas dans les oreilles : leurs pinces servent surtout à se défendre.', 57, 0
  FROM clades p
 WHERE p.id = 'insectes'
   AND NOT EXISTS (SELECT 1 FROM clades c WHERE c.id = 'dermapteres');

-- mantes : Mantodea (GBIF 788)
INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order, visible_college)
SELECT 'mantes', p.id, 'Mantes', 'Pattes de devant repliées, armées d''épines, qui saisissent les proies ; tête triangulaire très mobile', 'Mantes religieuses et leurs cousines : des insectes prédateurs qui chassent à l''affût.', 58, 0
  FROM clades p
 WHERE p.id = 'insectes'
   AND NOT EXISTS (SELECT 1 FROM clades c WHERE c.id = 'mantes');

-- nevropteres : Neuroptera (GBIF 1501)
INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order, visible_college)
SELECT 'nevropteres', p.id, 'Névroptères', 'Quatre ailes transparentes parcourues d''un fin réseau de nervures, repliées en toit au repos', 'Chrysopes et fourmilions. Leurs larves sont des prédatrices, grandes mangeuses de pucerons.', 59, 0
  FROM clades p
 WHERE p.id = 'insectes'
   AND NOT EXISTS (SELECT 1 FROM clades c WHERE c.id = 'nevropteres');

-- 3. Rattachement des fiches (garde sur l'ancien clade)

-- Criquet marocain : insectes -> orthopteres
UPDATE plants SET clade_id = 'orthopteres'
 WHERE scientific_name = 'Dociostaurus maroccanus'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- Grillon provençal : insectes -> orthopteres
UPDATE plants SET clade_id = 'orthopteres'
 WHERE scientific_name = 'Gryllus bimaculatus'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- Courtilière : insectes -> orthopteres
UPDATE plants SET clade_id = 'orthopteres'
 WHERE scientific_name = 'Gryllotalpa sp.'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- Criquet égyptien : insectes -> orthopteres
UPDATE plants SET clade_id = 'orthopteres'
 WHERE scientific_name = 'Anacridium aegyptium'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- Criquet à antennes rousses : insectes -> orthopteres
UPDATE plants SET clade_id = 'orthopteres'
 WHERE scientific_name = 'Acanthacris ruficornis'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'orthopteres');

-- Perce-oreille : insectes -> dermapteres
UPDATE plants SET clade_id = 'dermapteres'
 WHERE scientific_name = 'Forficula auricularia'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'dermapteres');

-- Mante religieuse africaine : insectes -> mantes
UPDATE plants SET clade_id = 'mantes'
 WHERE scientific_name = 'Sphodromantis viridis'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'mantes');

-- Chrysope verte : insectes -> nevropteres
UPDATE plants SET clade_id = 'nevropteres'
 WHERE scientific_name = 'Chrysoperla carnea'
   AND clade_id <=> 'insectes'
   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = 'nevropteres');
