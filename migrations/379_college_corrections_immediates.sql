SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Chantier collège (novembre 2026), flux D1 : corrections immédiates de contenu.
--
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d1-migration.js à partir de
-- data/college-2026-11/d1/*.json : ne pas l’éditer à la main. Revue détaillée (avant / après,
-- motifs) : fichier de revue D1 du chantier, puis description de la PR.
--
-- 1. Emoji qui suggèrent un autre groupe que celui de la fiche (cloporte en coléoptère,
--    mille-pattes en chenille…) remplacés par un emoji fidèle ou neutre du milieu de vie.
-- 2. Niveaux du glossaire (base / approfondissement / avance) revus contre les programmes
--    et les contenus collège.
-- 3. Glossaire : « champignon » quitte la catégorie faune ; invertébré, reptile, poisson
--    présentés comme des groupes d’usage courant.
-- 4. Carte de la daya : plus de niveau imposé « lycée ».
-- 5. Séances 6e : réseaux centrés sur une espèce familière, question de cycle 3, étape
--    « mangeur de graines ».
--
-- Idempotente : chaque UPDATE est gardé par la clé naturelle et l’ancienne valeur exacte
-- (une modification faite dans l’application n’est jamais écrasée). Une ligne absente
-- (base fraîche) est sautée sans erreur. Ni DDL, ni trigger, ni donnée personnelle.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Emoji trompeurs : 66 fiches. Garde : nom + ancien emoji (binaire).
-- ---------------------------------------------------------------------
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Cloporte' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Cloporte poudré' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Collembole' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '💧'
 WHERE name = 'Notonecte' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Punaise verte ponctuée' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Chrysope verte' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Mante religieuse africaine' AND CAST(emoji AS BINARY) = CAST('🪲' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Géophile' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Lithobie' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Scolopendre ceinturée' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Scutigère véloce' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Pucerons' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Cochenilles farineuses' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Cochenille du figuier de Barbarie' AND CAST(emoji AS BINARY) = CAST('🐛' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Iule' AND CAST(emoji AS BINARY) = CAST('🪱' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Perce-oreille' AND CAST(emoji AS BINARY) = CAST('🦗' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Réduve à pattes rouges' AND CAST(emoji AS BINARY) = CAST('🐞' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Pentatome méridional' AND CAST(emoji AS BINARY) = CAST('🐞' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Punaise rouge et noire' AND CAST(emoji AS BINARY) = CAST('🐞' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Aleurode du tabac' AND CAST(emoji AS BINARY) = CAST('🪰' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Acarien prédateur du compost' AND CAST(emoji AS BINARY) = CAST('🕷️' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Faucheux' AND CAST(emoji AS BINARY) = CAST('🕷️' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Solifuges' AND CAST(emoji AS BINARY) = CAST('🕷️' AS BINARY);
UPDATE plants SET emoji = '🏠'
 WHERE name = 'Tique brune du chien' AND CAST(emoji AS BINARY) = CAST('🕷️' AS BINARY);
UPDATE plants SET emoji = '🍂'
 WHERE name = 'Pseudoscorpion' AND CAST(emoji AS BINARY) = CAST('🦂' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Ligie' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Dynamène' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Talitre (puce de mer)' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Chthamale (balane)' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Pouce-pied' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Grande balane' AND CAST(emoji AS BINARY) = CAST('🐚' AS BINARY);
UPDATE plants SET emoji = '🦐'
 WHERE name = 'Crevette des cuvettes' AND CAST(emoji AS BINARY) = CAST('🦀' AS BINARY);
UPDATE plants SET emoji = '💧'
 WHERE name = 'Cyclopes' AND CAST(emoji AS BINARY) = CAST('🦐' AS BINARY);
UPDATE plants SET emoji = '💧'
 WHERE name = 'Zooplancton' AND CAST(emoji AS BINARY) = CAST('🦐' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Oursin violet' AND CAST(emoji AS BINARY) = CAST('⭐' AS BINARY);
UPDATE plants SET emoji = '🌊'
 WHERE name = 'Oursin noir' AND CAST(emoji AS BINARY) = CAST('⭐' AS BINARY);
UPDATE plants SET emoji = '💧'
 WHERE name = 'Hydre d''eau douce' AND CAST(emoji AS BINARY) = CAST('🪸' AS BINARY);
UPDATE plants SET emoji = '💧'
 WHERE name = 'Pleurodèle de Waltl' AND CAST(emoji AS BINARY) = CAST('🐸' AS BINARY);
UPDATE plants SET emoji = '🐾'
 WHERE name = 'Mangouste ichneumon' AND CAST(emoji AS BINARY) = CAST('🦔' AS BINARY);
UPDATE plants SET emoji = '🐾'
 WHERE name = 'Genette commune' AND CAST(emoji AS BINARY) = CAST('🦔' AS BINARY);
UPDATE plants SET emoji = '🐾'
 WHERE name = 'Porc-épic à crête' AND CAST(emoji AS BINARY) = CAST('🦔' AS BINARY);
UPDATE plants SET emoji = '🐦'
 WHERE name = 'Hirondelle rustique' AND CAST(emoji AS BINARY) = CAST('🕊️' AS BINARY);
UPDATE plants SET emoji = '🐦'
 WHERE name = 'Cigogne blanche' AND CAST(emoji AS BINARY) = CAST('🦢' AS BINARY);
UPDATE plants SET emoji = '🐦'
 WHERE name = 'Serin cini' AND CAST(emoji AS BINARY) = CAST('🐤' AS BINARY);
UPDATE plants SET emoji = '🦠'
 WHERE name = 'Actinomycète du compost' AND CAST(emoji AS BINARY) = CAST('🕸️' AS BINARY);
UPDATE plants SET emoji = '🦠'
 WHERE name = 'Mildiou de la tomate' AND CAST(emoji AS BINARY) = CAST('🍅' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Euphorbe' AND CAST(emoji AS BINARY) = CAST('🌵' AS BINARY);
UPDATE plants SET emoji = '🌳'
 WHERE name = 'Filao' AND CAST(emoji AS BINARY) = CAST('🌲' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Fougère de Java' AND CAST(emoji AS BINARY) = CAST('☘️' AS BINARY);
UPDATE plants SET emoji = '🟩'
 WHERE name = 'Chara' AND CAST(emoji AS BINARY) = CAST('🌿' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Lis de mer' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Iris de Barbarie' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Ail velu' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Romulée' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Salsepareille' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Nivéole d''automne' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Narcisse de Broussonet' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Narcisse tardif' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Fragon à feuilles' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Asphodèle à petits fruits' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Glaïeul commun' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Dipcadi tardif' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Limodore à feuilles avortées' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Asperge blanche' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Asperge épineuse' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);
UPDATE plants SET emoji = '🌿'
 WHERE name = 'Arisarum' AND CAST(emoji AS BINARY) = CAST('🌾' AS BINARY);

-- ---------------------------------------------------------------------
-- 2. Niveaux du glossaire : 31 termes. Garde : code + terme + ancien niveau.
-- ---------------------------------------------------------------------
UPDATE glossary_terms SET niveau = 'base'
 WHERE glossary_code = 'FM0244' AND CAST(terme AS BINARY) = CAST('cycle de l''eau' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'base'
 WHERE glossary_code = 'FM0211' AND CAST(terme AS BINARY) = CAST('cellule' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'base'
 WHERE glossary_code = 'FM0141' AND CAST(terme AS BINARY) = CAST('régime alimentaire' AS BINARY) AND niveau = 'approfondissement';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0239' AND CAST(terme AS BINARY) = CAST('évolution' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0073' AND CAST(terme AS BINARY) = CAST('angiosperme' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0431' AND CAST(terme AS BINARY) = CAST('gymnosperme' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0472' AND CAST(terme AS BINARY) = CAST('épillet' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0512' AND CAST(terme AS BINARY) = CAST('tarse' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0516' AND CAST(terme AS BINARY) = CAST('pupille' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0513' AND CAST(terme AS BINARY) = CAST('miroir' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0384' AND CAST(terme AS BINARY) = CAST('mutualisme' AS BINARY) AND niveau = 'base';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0386' AND CAST(terme AS BINARY) = CAST('service écosystémique' AS BINARY) AND niveau = 'base';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0387' AND CAST(terme AS BINARY) = CAST('service d''approvisionnement' AS BINARY) AND niveau = 'base';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0388' AND CAST(terme AS BINARY) = CAST('service de régulation' AS BINARY) AND niveau = 'base';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0389' AND CAST(terme AS BINARY) = CAST('service culturel' AS BINARY) AND niveau = 'base';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0004' AND CAST(terme AS BINARY) = CAST('biocénose' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0006' AND CAST(terme AS BINARY) = CAST('niche écologique' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0012' AND CAST(terme AS BINARY) = CAST('niveau trophique' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0016' AND CAST(terme AS BINARY) = CAST('autotrophe' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0017' AND CAST(terme AS BINARY) = CAST('hétérotrophe' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0085' AND CAST(terme AS BINARY) = CAST('bioindicateur' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0235' AND CAST(terme AS BINARY) = CAST('commensalisme' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0214' AND CAST(terme AS BINARY) = CAST('fermentation' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0241' AND CAST(terme AS BINARY) = CAST('diversité génétique' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0232' AND CAST(terme AS BINARY) = CAST('espèce invasive' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0223' AND CAST(terme AS BINARY) = CAST('dynamique des populations' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0238' AND CAST(terme AS BINARY) = CAST('sélection naturelle' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0212' AND CAST(terme AS BINARY) = CAST('chloroplaste' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0511' AND CAST(terme AS BINARY) = CAST('pédipalpe' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0515' AND CAST(terme AS BINARY) = CAST('parotoïde' AS BINARY) AND niveau = 'avance';
UPDATE glossary_terms SET niveau = 'approfondissement'
 WHERE glossary_code = 'FM0514' AND CAST(terme AS BINARY) = CAST('barre alaire' AS BINARY) AND niveau = 'avance';

-- ---------------------------------------------------------------------
-- 3. Glossaire, contenu. Garde : code + terme + ancienne valeur exacte du champ.
-- ---------------------------------------------------------------------
UPDATE glossary_terms SET categorie = 'taxonomie'
 WHERE glossary_code = 'FM0103' AND CAST(terme AS BINARY) = CAST('champignon' AS BINARY)
   AND CAST(categorie AS BINARY) = CAST('faune' AS BINARY);
UPDATE glossary_terms SET definition_complete = 'Les invertébrés n''ont pas de squelette interne. Ils représentent la grande majorité des animaux : insectes, vers, araignées, escargots. « Invertébré » est un mot d''usage courant, pas un groupe de la classification : il réunit des animaux très différents, qui ont seulement en commun de ne pas avoir de colonne vertébrale.'
 WHERE glossary_code = 'FM0108' AND CAST(terme AS BINARY) = CAST('invertébré' AS BINARY)
   AND CAST(definition_complete AS BINARY) = CAST('Les invertébrés n''ont pas de squelette interne. Ils représentent la grande majorité des animaux : insectes, vers, araignées, escargots.' AS BINARY);
UPDATE glossary_terms SET definition_complete = 'Lézards, geckos, serpents et tortues sont appelés reptiles. Leur température varie avec celle du milieu : on les voit souvent au soleil. « Reptile » est un mot d''usage courant, commode pour parler de ces animaux, mais ce n''est pas un groupe de la classification. Au lycée, on apprend pourquoi : les oiseaux descendent aussi de leur ancêtre, sans être appelés reptiles.'
 WHERE glossary_code = 'FM0404' AND CAST(terme AS BINARY) = CAST('reptile' AS BINARY)
   AND CAST(definition_complete AS BINARY) = CAST('Lézards, geckos, serpents et tortues sont appelés reptiles. Leur température varie avec celle du milieu : on les voit souvent au soleil. Au lycée, on apprend que ce n''est pas un groupe emboîté complet, car les oiseaux descendent aussi de leur ancêtre.' AS BINARY);
UPDATE glossary_terms SET definition_complete = 'Les poissons de l''estran et de l''océan ont un corps souvent couvert d''écailles et des nageoires. « Poisson » est un mot d''usage courant, commode pour parler de ces animaux, mais ce n''est pas un groupe de la classification. Au lycée, on parle d''actinoptérygiens pour les poissons à nageoires soutenues par des rayons osseux.'
 WHERE glossary_code = 'FM0406' AND CAST(terme AS BINARY) = CAST('poisson' AS BINARY)
   AND CAST(definition_complete AS BINARY) = CAST('Les poissons de l''estran et de l''océan ont un corps souvent couvert d''écailles et des nageoires. Au lycée, on précise que « poissons » n''est pas un groupe emboîté complet : on parle d''actinoptérygiens pour les poissons à nageoires soutenues par des rayons osseux.' AS BINARY);

-- ---------------------------------------------------------------------
-- 4. Carte Daya : niveau imposé retiré. Garde : id + ancienne valeur.
-- ---------------------------------------------------------------------
UPDATE maps SET pedago_level = NULL
 WHERE id = 'dayat' AND pedago_level <=> 'lycee';

-- ---------------------------------------------------------------------
-- 5. Séances. Garde : slug + identifiant d’étape + ancienne forme de chaque champ modifié ;
--    espèces et question exigées présentes, sinon rien n’est fait.
-- ---------------------------------------------------------------------
-- 6e-aquaponie-n3 · étape q4 (modifier)
UPDATE pedago_sessions SET steps_json = JSON_SET(steps_json, '$[3].body', 'Le réseau s''ouvre sur la tomate du potager. D''où viennent les nitrates qui la nourrissent ? Pour elle, c''est un engrais. Repère aussi les animaux qui s''en nourrissent.', '$[3].action.payload.highlightPlantId', (SELECT MIN(p.id) FROM plants p WHERE p.name = 'Tomate'))
 WHERE slug = '6e-aquaponie-n3'
   AND JSON_VALID(steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].id')) AS BINARY) = CAST('q4' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].title')) AS BINARY) = CAST('Jusqu''au potager' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].body')) AS BINARY) = CAST('Isole Nitrobacter dans le réseau : vers quelles plantes vont les nitrates ? Pour elles, c''est un engrais.' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].action.payload.highlightPlantId')) AS UNSIGNED) = (SELECT MIN(p.id) FROM plants p WHERE p.name = 'Nitrobacter')
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].action.payload.mapId')) AS BINARY) = CAST('n3' AS BINARY)
   AND EXISTS (SELECT 1 FROM plants p WHERE p.name = 'Tomate');
-- 6e-aquaponie-n3 · étape q5 (modifier)
UPDATE pedago_sessions SET steps_json = JSON_SET(steps_json, '$[4].body', 'Une question sur deux êtres vivants de l''aquaponie.', '$[4].action.payload.questionCode', 'QF9893')
 WHERE slug = '6e-aquaponie-n3'
   AND JSON_VALID(steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].id')) AS BINARY) = CAST('q5' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].title')) AS BINARY) = CAST('Mini-quiz' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].body')) AS BINARY) = CAST('Une question sur l''aquaponie.' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].action.type')) AS BINARY) = CAST('open_quiz' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].action.payload.questionCode')) AS BINARY) = CAST('QF0020' AS BINARY)
   AND EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.question_code = 'QF9893' AND qq.statut = 'actif');
-- 6e-biodiversite-deux-lieux · étape b2 (modifier)
UPDATE pedago_sessions SET steps_json = JSON_SET(steps_json, '$[1].body', 'Le réseau de n³ s''ouvre sur la tomate du potager et les êtres vivants qui lui sont liés. Affiche ensuite tout le réseau : quels grands groupes y trouves-tu (plantes du potager, insectes, araignées, vers, oiseaux, poissons…) ?', '$[1].action.payload.highlightPlantId', (SELECT MIN(p.id) FROM plants p WHERE p.name = 'Tomate'))
 WHERE slug = '6e-biodiversite-deux-lieux'
   AND JSON_VALID(steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].id')) AS BINARY) = CAST('b2' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].title')) AS BINARY) = CAST('Les espèces de n³' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].body')) AS BINARY) = CAST('Parcours le réseau de n³ : quels grands groupes y trouves-tu (plantes du potager, insectes, araignées, vers, oiseaux, poissons…) ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND JSON_TYPE(JSON_EXTRACT(steps_json, '$[1].action.payload.highlightPlantId')) = 'NULL'
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].action.payload.mapId')) AS BINARY) = CAST('n3' AS BINARY)
   AND EXISTS (SELECT 1 FROM plants p WHERE p.name = 'Tomate');
-- 6e-biodiversite-deux-lieux · étape b3 (modifier)
UPDATE pedago_sessions SET steps_json = JSON_SET(steps_json, '$[2].body', 'Le réseau des Sablettes s''ouvre sur le crabe vert, ce qu''il mange et ceux qui le mangent. Affiche ensuite tout le réseau : quels groupes y trouves-tu (algues, coquillages, crabes, oursins, poissons de mer, oiseaux marins…) ?', '$[2].action.payload.highlightPlantId', (SELECT MIN(p.id) FROM plants p WHERE p.name = 'Crabe vert'))
 WHERE slug = '6e-biodiversite-deux-lieux'
   AND JSON_VALID(steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].id')) AS BINARY) = CAST('b3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].title')) AS BINARY) = CAST('Les espèces des Sablettes' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].body')) AS BINARY) = CAST('Parcours le réseau des Sablettes : quels groupes y trouves-tu (algues, coquillages, crabes, oursins, poissons de mer, oiseaux marins…) ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND JSON_TYPE(JSON_EXTRACT(steps_json, '$[2].action.payload.highlightPlantId')) = 'NULL'
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].action.payload.mapId')) AS BINARY) = CAST('sablettes' AS BINARY)
   AND EXISTS (SELECT 1 FROM plants p WHERE p.name = 'Crabe vert');
-- 6e-regimes-alimentaires · étape a1 (modifier)
UPDATE pedago_sessions SET steps_json = JSON_SET(steps_json, '$[0].title', 'Quatre animaux, quatre régimes', '$[0].body', 'Un animal peut manger des végétaux (feuilles, fruits ou graines), d''autres animaux, ou les deux. Le réseau montre ce que mange chaque espèce. Pour chaque animal, clique sur « isoler » et note ce qu''il mange.')
 WHERE slug = '6e-regimes-alimentaires'
   AND JSON_VALID(steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[0].id')) AS BINARY) = CAST('a1' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[0].title')) AS BINARY) = CAST('Trois animaux, trois régimes' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[0].body')) AS BINARY) = CAST('Un animal peut manger des végétaux, d''autres animaux, ou les deux. Le réseau de ForêtMap montre ce que mange chaque espèce. Pour chaque animal, clique sur « isoler » et note ce qu''il mange.' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[0].action.type')) AS BINARY) = CAST('message' AS BINARY);
-- 6e-regimes-alimentaires · étape a6 (inserer)
UPDATE pedago_sessions SET steps_json = JSON_ARRAY_INSERT(steps_json, '$[4]', JSON_OBJECT(
    'id', 'a6',
    'title', 'Le ténébrion meunier',
    'body', 'Cet insecte est élevé dans le terrarium Insectopolis de n³ ; sa larve est le « ver de farine ». Que mange-t-il ? Quel est son régime alimentaire ?',
    'action', JSON_OBJECT('type', 'open_foodweb', 'payload', JSON_OBJECT('highlightPlantId', (SELECT MIN(p.id) FROM plants p WHERE p.name = 'Ténébrion meunier'), 'mapId', NULL)),
    'completeWhen', 'manual'))
 WHERE slug = '6e-regimes-alimentaires'
   AND JSON_VALID(steps_json)
   AND JSON_LENGTH(steps_json) = 5
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[0].id')) AS BINARY) = CAST('a1' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[1].id')) AS BINARY) = CAST('a2' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[2].id')) AS BINARY) = CAST('a3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[3].id')) AS BINARY) = CAST('a4' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(steps_json, '$[4].id')) AS BINARY) = CAST('a5' AS BINARY)
   AND EXISTS (SELECT 1 FROM plants p WHERE p.name = 'Ténébrion meunier');
