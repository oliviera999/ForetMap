-- =====================================================================
-- 365 — G&L ensemble unifié, PR 1b, étape 1.10 : zones (M22, L5).
--
-- M22 : chaque question de zone trouve sa réponse sur le site (fiche d'espèce ou terme de
-- glossaire relié à la zone).
-- - `gl_chasse_zones.glossaire_json` : codes des termes de glossaire qui donnent la réponse
--   (catalogue `chasse-zones.json`, champ facultatif `glossaire`) ;
-- - `gl_tenir_questions_lecture.retours_json` : retour propre à chaque mauvais choix d'une
--   question de lecture (facultatif ; à défaut, `feedback_incorrect`) ;
-- - 5 questions de zone réécrites, `GQCM9301` à `GQCM9305` (5 choix, retours « Pas encore ») ;
--   les 5 anciennes sortent du tirage des parties (`usage_tenir = 0`) ;
-- - 1 fiche d'espèce (`SP0277`, fourmi magnan) et 2 termes de glossaire (`GL0279`, `GL0280`) ;
-- - 1 phrase ajoutée aux termes `GL0038` (chaîne alimentaire) et `GL0192` (pergélisol).
-- L5 : la zone `cz-p2-08` s'active avec le feuillet `ep-I-06` — par le catalogue.
--
-- Contenu généré depuis data/gl/tenir/ensemble-unifie/zones-m22.json (données livrées le
-- 17 novembre 2026). Codes vérifiés libres en production avant écriture.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS ; INSERT … WHERE NOT EXISTS (et seulement si le biome et
-- la catégorie existent : une base de test nue n'est pas touchée) ; INSERT IGNORE ; UPDATE gardés
-- par l'ancienne valeur (une phrase déjà présente n'est pas ajoutée deux fois).
-- =====================================================================

ALTER TABLE gl_chasse_zones
  ADD COLUMN IF NOT EXISTS glossaire_json LONGTEXT NULL DEFAULT NULL AFTER especes_json;

ALTER TABLE gl_tenir_questions_lecture
  ADD COLUMN IF NOT EXISTS retours_json TEXT NULL DEFAULT NULL AFTER feedback_incorrect;

-- ---------------------------------------------------------------------
-- 1. Questions de zone réécrites (la bonne réponse est en A ; l'écran mélange les choix).
-- ---------------------------------------------------------------------
INSERT INTO gl_qcm_questions (
  question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
  choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte,
  niveau, difficulte, difficulte_label, tags, statut, usage_tenir,
  feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, created_at, updated_at
)
SELECT 'GQCM9301', 'foret_caducifoliee', 'ecosystemes', 9301,
  'À l''automne, le geai des chênes cache des milliers de glands dans le sol, et il en oublie beaucoup. Que deviennent les glands oubliés ?',
  'Ils germent : de jeunes chênes poussent loin de l''arbre d''origine',
  'Ils pourrissent tous : un gland enterré ne peut pas pousser',
  'Ils sont tous retrouvés par les écureuils avant l''hiver',
  'Ils se changent en champignons au printemps',
  'Ils attendent que le geai revienne, même dix ans plus tard',
  'A', 'Ils germent : de jeunes chênes poussent loin de l''arbre d''origine',
  '6ème', 2, '⭐⭐ Moyen', 'question de zone', 'actif', 1,
  'Oui : le geai plante des chênes sans le vouloir. C''est grâce à lui que la forêt de chênes gagne du terrain.',
  NULL,
  'Pas encore : un gland enterré est au contraire bien placé pour germer, à l''abri et au frais.',
  'Pas encore : les écureuils en trouvent quelques-uns, mais il en reste beaucoup dans le sol.',
  'Pas encore : un gland est la graine du chêne, il ne peut donner qu''un chêne.',
  'Pas encore : un gland ne se conserve pas si longtemps. Au printemps, il germe.',
  NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_qcm_questions WHERE question_code = 'GQCM9301')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'foret_caducifoliee')
  AND EXISTS (SELECT 1 FROM gl_qcm_categories WHERE slug = 'ecosystemes');

INSERT INTO gl_qcm_questions (
  question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
  choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte,
  niveau, difficulte, difficulte_label, tags, statut, usage_tenir,
  feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, created_at, updated_at
)
SELECT 'GQCM9302', 'landes', 'flore', 9302,
  'L''ajonc fleurit presque toute l''année, même en plein hiver. Qui en profite ?',
  'Les abeilles et les bourdons qui sortent les jours doux : presque rien d''autre n''est en fleur',
  'Les moutons, qui raffolent de ses fleurs piquantes',
  'Personne : ses fleurs d''hiver sont en plastique naturel',
  'Les hirondelles, qui en font leur nid',
  'Les poissons des mares, qui mangent ses pétales',
  'A', 'Les abeilles et les bourdons qui sortent les jours doux : presque rien d''autre n''est en fleur',
  '6ème', 2, '⭐⭐ Moyen', 'question de zone', 'actif', 1,
  'Oui : en hiver, l''ajonc est l''une des seules fleurs de la lande. Les insectes y trouvent à manger, et l''ajonc y gagne d''être pollinisé.',
  NULL,
  'Pas encore : avec ses épines, l''ajonc est justement bien protégé contre ceux qui broutent.',
  'Pas encore : ce sont de vraies fleurs, qui sentent même la noix de coco.',
  'Pas encore : les hirondelles passent l''hiver en Afrique, et elles bâtissent leur nid avec de la boue.',
  'Pas encore : l''ajonc pousse sur la lande sèche, et ce sont les insectes qui visitent ses fleurs.',
  NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_qcm_questions WHERE question_code = 'GQCM9302')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'landes')
  AND EXISTS (SELECT 1 FROM gl_qcm_categories WHERE slug = 'flore');

INSERT INTO gl_qcm_questions (
  question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
  choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte,
  niveau, difficulte, difficulte_label, tags, statut, usage_tenir,
  feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, created_at, updated_at
)
SELECT 'GQCM9303', 'landes', 'ecosystemes', 9303,
  'Une sphaigne peut absorber jusqu''à vingt fois son poids d''eau. Qu''est-ce que cela change pour la lande ?',
  'Le sol reste gorgé d''eau toute l''année : c''est ainsi que naît une tourbière',
  'La lande s''assèche, car la mousse boit toute l''eau des plantes',
  'L''eau devient salée, comme celle de la mer',
  'Les arbres poussent beaucoup plus vite',
  'La mousse éclate dès qu''il pleut trop',
  'A', 'Le sol reste gorgé d''eau toute l''année : c''est ainsi que naît une tourbière',
  '6ème', 2, '⭐⭐ Moyen', 'question de zone', 'actif', 1,
  'Oui : les sphaignes retiennent l''eau comme des éponges. Dans ce sol détrempé, la matière morte ne se décompose presque pas et s''empile en tourbe.',
  NULL,
  'Pas encore : la sphaigne ne vide pas le sol, elle le garde mouillé.',
  'Pas encore : l''eau d''une tourbière est douce, et plutôt acide.',
  'Pas encore : dans un sol toujours détrempé, très peu d''arbres arrivent à pousser.',
  'Pas encore : elle gonfle sans dommage, puis rend l''eau peu à peu.',
  NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_qcm_questions WHERE question_code = 'GQCM9303')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'landes')
  AND EXISTS (SELECT 1 FROM gl_qcm_categories WHERE slug = 'ecosystemes');

INSERT INTO gl_qcm_questions (
  question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
  choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte,
  niveau, difficulte, difficulte_label, tags, statut, usage_tenir,
  feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, created_at, updated_at
)
SELECT 'GQCM9304', 'landes', 'faune', 9304,
  'L''engoulevent pond à même le sol de la lande, sans construire de nid. Comment passe-t-il la journée sans être repéré ?',
  'Il reste immobile : son plumage couleur de feuille morte le rend presque invisible',
  'Il s''enterre dans le sable jusqu''au soir',
  'Il crie très fort pour faire fuir les renards',
  'Il change de couleur comme un caméléon',
  'Il se cache dans un terrier de lapin',
  'A', 'Il reste immobile : son plumage couleur de feuille morte le rend presque invisible',
  '6ème', 2, '⭐⭐ Moyen', 'question de zone', 'actif', 1,
  'Oui : c''est le camouflage. L''engoulevent ne bouge qu''au crépuscule, quand il part chasser les insectes en vol.',
  NULL,
  'Pas encore : il reste posé à la surface, et c''est sa couleur qui le cache.',
  'Pas encore : le jour, il se tait. Son chant ronronnant s''entend à la nuit tombée.',
  'Pas encore : son plumage ne change pas, il ressemble déjà au sol de la lande.',
  'Pas encore : il reste dehors, à découvert, sans bouger.',
  NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_qcm_questions WHERE question_code = 'GQCM9304')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'landes')
  AND EXISTS (SELECT 1 FROM gl_qcm_categories WHERE slug = 'faune');

INSERT INTO gl_qcm_questions (
  question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
  choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte,
  niveau, difficulte, difficulte_label, tags, statut, usage_tenir,
  feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, created_at, updated_at
)
SELECT 'GQCM9305', 'foret_mediterraneenne', 'ecosystemes', 9305,
  'Les scientifiques disent que le tour de la Méditerranée est un « point chaud » de biodiversité. Qu''est-ce que cela veut dire ?',
  'On y trouve énormément d''espèces, dont beaucoup ne vivent nulle part ailleurs',
  'Qu''il y fait plus chaud que partout ailleurs sur Terre',
  'Qu''il y a très peu d''espèces, toutes en danger',
  'Qu''on y trouve surtout des volcans',
  'Que seules les plantes y poussent, sans animaux',
  'A', 'On y trouve énormément d''espèces, dont beaucoup ne vivent nulle part ailleurs',
  '6ème', 2, '⭐⭐ Moyen', 'question de zone', 'actif', 1,
  'Oui : plus de la moitié des plantes du tour de la Méditerranée sont endémiques, c''est-à-dire qu''elles ne poussent que là. L''arganier du sud-ouest du Maroc en est un exemple.',
  NULL,
  'Pas encore : « chaud » ne parle pas de la température, mais de la richesse en espèces.',
  'Pas encore : c''est l''inverse, les espèces y sont très nombreuses.',
  'Pas encore : un point chaud de biodiversité se repère à ses êtres vivants, pas à ses volcans.',
  'Pas encore : plantes et animaux y sont nombreux, et beaucoup sont uniques au monde.',
  NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_qcm_questions WHERE question_code = 'GQCM9305')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'foret_mediterraneenne')
  AND EXISTS (SELECT 1 FROM gl_qcm_categories WHERE slug = 'ecosystemes');

-- ---------------------------------------------------------------------
-- 2. Les questions remplacées sortent du tirage des parties (elles restent lisibles hors partie).
-- ---------------------------------------------------------------------
UPDATE gl_qcm_questions
   SET usage_tenir = 0, updated_at = NOW()
 WHERE question_code IN ('QCM0213', 'QCM0612', 'QCM0618', 'QCM0605', 'QCM0451')
   AND usage_tenir = 1;

-- ---------------------------------------------------------------------
-- 3. Fiche d'espèce : la réponse de la zone cz-p1-04 se lit dans cette fiche.
-- ---------------------------------------------------------------------
INSERT INTO gl_species (
  species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, famille, statut_iucn,
  endemique, role_ecologique, adaptations_cles, regime_alimentaire, observation_terrain,
  description_courte, anecdote, wikipedia_title, statut, created_at, updated_at
)
SELECT 'SP0277', 'jungle_afc', 'faune', 'Fourmi magnan', 'Dorylus',
  'Insectes', 'Formicidés', 'NE — Non évaluée', 'Non',
  'Prédateur en colonne (insectes, vers, petits animaux du sol)',
  'Colonies de plusieurs millions, pas de nid fixe, soldats aux grandes mandibules, ouvrières aveugles guidées par l''odeur',
  'Carnivore (insectes, araignées, vers, petits animaux)',
  'Colonne sombre de plusieurs mètres de large au sol de la forêt, bordée de soldats immobiles.',
  'Fourmi d''Afrique qui chasse en colonnes de plusieurs millions d''individus. La colonie n''a pas de nid fixe : elle se déplace en vidant le sol de ses petites bêtes.',
  'Les ouvrières sont aveugles : elles suivent l''odeur laissée par celles qui les précèdent. Quand la colonne traverse un village, elle repart en ayant débarrassé les maisons de leurs insectes.',
  'Dorylus', 'actif', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM gl_species WHERE species_code = 'SP0277')
  AND EXISTS (SELECT 1 FROM gl_biomes WHERE slug = 'jungle_afc');

-- ---------------------------------------------------------------------
-- 4. Termes de glossaire. Catégorie `ecosysteme` : le fichier livré disait `ecosystemes`, qui
--    est une catégorie de QCM, pas une catégorie du glossaire (`lib/glossaryMatch.js`).
-- ---------------------------------------------------------------------
INSERT IGNORE INTO gl_glossary_terms
  (glossary_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
   exemple, all_biomes, statut, created_at, updated_at)
VALUES
  ('GL0279', 'point chaud de biodiversité', 'points chauds de biodiversité, hotspot', 'ecosysteme', 'base',
   'Région du monde très riche en espèces, dont beaucoup ne vivent nulle part ailleurs.',
   'Les scientifiques ont repéré 36 points chauds de biodiversité sur la planète. Le tour de la Méditerranée en est un : on y compte environ 25 000 espèces de plantes, dont plus de la moitié sont endémiques. Ces régions sont aussi celles où les milieux naturels ont beaucoup reculé : les protéger compte double.',
   'L''arganier du sud-ouest du Maroc, le cèdre de l''Atlas.', 0, 'actif', NOW(), NOW()),
  ('GL0280', 'défrichement', 'défricher, défrichements', 'ecosysteme', 'base',
   'Action de couper une forêt pour en faire des champs, des prés ou des villes.',
   'Après la dernière glaciation, la forêt de feuillus couvrait presque toute l''Europe. Depuis plusieurs milliers d''années, les humains l''ont défrichée pour cultiver, élever des animaux et bâtir. Aujourd''hui, elle regagne du terrain dans plusieurs pays d''Europe, dont la France.',
   'Les champs et les villages d''Europe occupent d''anciennes forêts de chênes et de hêtres.', 0, 'actif', NOW(), NOW());

-- ---------------------------------------------------------------------
-- 5. Une phrase de plus à deux termes existants (sans doublon si elle y est déjà).
-- ---------------------------------------------------------------------
UPDATE gl_glossary_terms
   SET definition_complete = TRIM(CONCAT(COALESCE(definition_complete, ''), ' ', 'Là où le climat est rude, comme dans la taïga ou la toundra, les espèces sont moins nombreuses : les chaînes sont plus courtes, et chaque maillon compte davantage.')),
       updated_at = NOW()
 WHERE glossary_code = 'GL0038'
   AND COALESCE(definition_complete, '') NOT LIKE '%Là où le climat est rude, comme dans la taïga ou la toundra,%';

UPDATE gl_glossary_terms
   SET definition_complete = TRIM(CONCAT(COALESCE(definition_complete, ''), ' ', 'Sous la toundra, il est partout ; dans la taïga, on ne le trouve que par endroits, surtout au nord.')),
       updated_at = NOW()
 WHERE glossary_code = 'GL0192'
   AND COALESCE(definition_complete, '') NOT LIKE '%Sous la toundra, il est partout ; dans la taïga, on ne le tr%';
