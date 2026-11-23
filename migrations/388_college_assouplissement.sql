SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Assouplissement du profil collège (décisions d'Oliv du 22/11/2026, flux C2) :
-- données seulement.
--
-- FICHIER GÉNÉRÉ par scripts/college-assouplissement/build-lot4-migration.js à partir
-- de data/college-assouplissement/*.json : ne pas modifier à la main.
--
--   1. clades                  `tetrapodes` visible au collège (« Animaux à quatre membres »)
--   2. map_species             six présences confirmées (n3 : 5 espèces ; foret : 1)
--   3. pedago_sessions         consignes et `preset` de quatre séances 6e
--   4. quiz_question_notions   QF9877 : C3-ENV en ajout
--   5. glossary_terms          « matière organique » en `base`
--   6. quiz_questions, quiz_question_notions, resource_question_links
--                              20 questions de cycle 3 (QF9934 à QF9953)
--
-- Fiches et cartes désignées par leur nom (les identifiants diffèrent d'une base à
-- l'autre) ; un parent absent fait sauter la ligne sans erreur. Modifications gardées
-- par la valeur d'avant. Idempotent, rejouable ; aucun DDL, aucun trigger, aucun
-- DEFINER, aucune donnée personnelle, aucune table `gl_*`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Clade `tetrapodes` : la boîte « Animaux à quatre membres » revient au collège
--    (décision 5). L'arbre collège passe à 5 niveaux depuis la racine. Gardes sur les
--    valeurs d'avant : une saisie faite dans l'application est conservée.
-- ---------------------------------------------------------------------
UPDATE clades
   SET visible_college = 1,
       label_simple = 'Animaux à quatre membres',
       attribute_simple = 'Squelette à l''intérieur du corps et quatre membres : pattes, ailes ou nageoires charnues'
 WHERE id = 'tetrapodes'
   AND name = 'Tétrapodes'
   AND visible_college <=> 0
   AND label_simple <=> NULL
   AND attribute_simple <=> NULL;

-- ---------------------------------------------------------------------
-- 2. Présences confirmées sur le terrain (décision 7) : registre `map_species`,
--    lignes insérées seulement si absentes ; les lignes des autres cartes et une
--    ligne déjà présente (quel que soit son statut) ne sont pas touchées.
--    Identifiants de production : n3/Abeille domestique = 28, n3/Pucerons = 59, n3/Mineuse de la tomate = 329, n3/Escargot petit-gris = 89, n3/Escargot espagnol = 823, foret/Abeille domestique = 28.
-- ---------------------------------------------------------------------
INSERT INTO map_species (map_id, plant_id, validation_status, is_featured)
SELECT m.id, p.id, 'confirme_site', 0
  FROM (
    SELECT 'n3' AS map_id, 'Abeille domestique' AS plant
    UNION ALL SELECT 'n3', 'Pucerons'
    UNION ALL SELECT 'n3', 'Mineuse de la tomate'
    UNION ALL SELECT 'n3', 'Escargot petit-gris'
    UNION ALL SELECT 'n3', 'Escargot espagnol'
    UNION ALL SELECT 'foret', 'Abeille domestique'
  ) v
  JOIN maps m ON m.id = v.map_id COLLATE utf8mb4_unicode_ci
  JOIN plants p ON p.name = v.plant COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.plant COLLATE utf8mb4_unicode_ci) = 1
 WHERE NOT EXISTS (
         SELECT 1 FROM map_species x WHERE x.map_id = m.id AND x.plant_id = p.id);

-- ---------------------------------------------------------------------
-- 3. Séances collège : consignes réécrites pour la sélection d'espèces et le bouton
--    « Pour aller plus loin », cadrage `preset` des étapes `open_foodweb`. Chaque
--    étape n'est modifiée que si elle a encore sa forme exacte du 22/11/2026 (id, titre,
--    consigne, type, espèce, carte, aucun `preset`) : une séance retouchée dans
--    l'application est laissée telle quelle (le test de contenu le signale).
-- ---------------------------------------------------------------------
-- 6e-sol-de-n3 · étape s3 : consigne ; preset alimentaire
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Ver de compost' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Ver de compost' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[2].body', 'Ajoute ton animal à la sélection, puis regarde ce qu''il mange et qui le mange. Télécharge l''image (bouton PNG) pour la déposer sur olution.', '$[2].action.payload.preset', 'alimentaire')
 WHERE s.slug = '6e-sol-de-n3'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].id')) AS BINARY) = CAST('s3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].title')) AS BINARY) = CAST('Son réseau trophique' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].body')) AS BINARY) = CAST('Dans le réseau, tape le nom de ton animal dans « rechercher une espèce », puis clique sur « isoler » : tu vois ce qu''il mange et qui le mange. Télécharge l''image (bouton PNG) pour la déposer sur olution.' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.mapId')) AS BINARY) = CAST('n3' AS BINARY)
   AND JSON_EXTRACT(s.steps_json, '$[2].action.payload.preset') IS NULL;
-- 6e-biodiversite-deux-lieux · étape b2 : consigne
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Tomate' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Tomate' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[1].body', 'Le réseau de n³ s''ouvre sur la tomate du potager et les êtres vivants qui lui sont liés. Appuie ensuite sur « Pour aller plus loin » pour voir tout le réseau : quels grands groupes y trouves-tu (plantes du potager, insectes, araignées, vers, oiseaux, poissons…) ?')
 WHERE s.slug = '6e-biodiversite-deux-lieux'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].id')) AS BINARY) = CAST('b2' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].title')) AS BINARY) = CAST('Les espèces de n³' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].body')) AS BINARY) = CAST('Le réseau de n³ s''ouvre sur la tomate du potager et les êtres vivants qui lui sont liés. Affiche ensuite tout le réseau : quels grands groupes y trouves-tu (plantes du potager, insectes, araignées, vers, oiseaux, poissons…) ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].action.payload.mapId')) AS BINARY) = CAST('n3' AS BINARY)
   AND JSON_EXTRACT(s.steps_json, '$[1].action.payload.preset') IS NULL;
-- 6e-biodiversite-deux-lieux · étape b3 : consigne
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Crabe vert' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Crabe vert' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[2].body', 'Le réseau des Sablettes s''ouvre sur le crabe vert, ce qu''il mange et ceux qui le mangent. Appuie ensuite sur « Pour aller plus loin » pour voir tout le réseau : quels groupes y trouves-tu (algues, coquillages, crabes, oursins, poissons de mer, oiseaux marins…) ?')
 WHERE s.slug = '6e-biodiversite-deux-lieux'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].id')) AS BINARY) = CAST('b3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].title')) AS BINARY) = CAST('Les espèces des Sablettes' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].body')) AS BINARY) = CAST('Le réseau des Sablettes s''ouvre sur le crabe vert, ce qu''il mange et ceux qui le mangent. Affiche ensuite tout le réseau : quels groupes y trouves-tu (algues, coquillages, crabes, oursins, poissons de mer, oiseaux marins…) ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.mapId')) AS BINARY) = CAST('sablettes' AS BINARY)
   AND JSON_EXTRACT(s.steps_json, '$[2].action.payload.preset') IS NULL;
-- 6e-pollinisation · étape f3 ; preset relations
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Courgette' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Courgette' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[2].action.payload.preset', 'relations')
 WHERE s.slug = '6e-pollinisation'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].id')) AS BINARY) = CAST('f3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].title')) AS BINARY) = CAST('Qui transporte le pollen ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].body')) AS BINARY) = CAST('Dans le réseau, isole la courgette et repère les liens de pollinisation : quel insecte en est responsable ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.mapId')) AS BINARY) = CAST('n3' AS BINARY)
   AND JSON_EXTRACT(s.steps_json, '$[2].action.payload.preset') IS NULL;
-- 6e-regimes-alimentaires · étape a2 ; preset alimentaire
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Pipistrelle de Kuhl' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Pipistrelle de Kuhl' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[1].action.payload.preset', 'alimentaire')
 WHERE s.slug = '6e-regimes-alimentaires'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].id')) AS BINARY) = CAST('a2' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].title')) AS BINARY) = CAST('La pipistrelle de Kuhl' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].body')) AS BINARY) = CAST('Cette petite chauve-souris chasse autour des lampadaires du lycée. Que mange-t-elle ? Quel est son régime alimentaire ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[1].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND JSON_TYPE(JSON_EXTRACT(s.steps_json, '$[1].action.payload.mapId')) = 'NULL'
   AND JSON_EXTRACT(s.steps_json, '$[1].action.payload.preset') IS NULL;
-- 6e-regimes-alimentaires · étape a3 ; preset alimentaire
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Caragouille rosée' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Caragouille rosée' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[2].action.payload.preset', 'alimentaire')
 WHERE s.slug = '6e-regimes-alimentaires'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].id')) AS BINARY) = CAST('a3' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].title')) AS BINARY) = CAST('La caragouille rosée' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].body')) AS BINARY) = CAST('Cet escargot vit dans le potager de n³. Que mange-t-il ? Quel est son régime alimentaire ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND JSON_TYPE(JSON_EXTRACT(s.steps_json, '$[2].action.payload.mapId')) = 'NULL'
   AND JSON_EXTRACT(s.steps_json, '$[2].action.payload.preset') IS NULL;
-- 6e-regimes-alimentaires · étape a4 ; preset alimentaire
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Tilapia du Nil' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Tilapia du Nil' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[3].action.payload.preset', 'alimentaire')
 WHERE s.slug = '6e-regimes-alimentaires'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[3].id')) AS BINARY) = CAST('a4' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[3].title')) AS BINARY) = CAST('Le tilapia de l''aquaponie' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[3].body')) AS BINARY) = CAST('Le tilapia vit dans l''aquarium de l''aquaponie. Il mange des plantes, des larves de moustique et le biofilm (la fine couche vivante qui couvre les parois). Quel est son régime alimentaire ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[3].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[3].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND JSON_TYPE(JSON_EXTRACT(s.steps_json, '$[3].action.payload.mapId')) = 'NULL'
   AND JSON_EXTRACT(s.steps_json, '$[3].action.payload.preset') IS NULL;
-- 6e-regimes-alimentaires · étape a6 ; preset alimentaire
UPDATE pedago_sessions s
  JOIN plants p ON p.name = 'Ténébrion meunier' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = 'Ténébrion meunier' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = JSON_SET(s.steps_json, '$[4].action.payload.preset', 'alimentaire')
 WHERE s.slug = '6e-regimes-alimentaires'
   AND JSON_VALID(s.steps_json)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[4].id')) AS BINARY) = CAST('a6' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[4].title')) AS BINARY) = CAST('Le ténébrion meunier' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[4].body')) AS BINARY) = CAST('Cet insecte est élevé dans le terrarium Insectopolis de n³ ; sa larve est le « ver de farine ». Que mange-t-il ? Quel est son régime alimentaire ?' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[4].action.type')) AS BINARY) = CAST('open_foodweb' AS BINARY)
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(s.steps_json, '$[4].action.payload.highlightPlantId')) AS UNSIGNED) = p.id
   AND JSON_TYPE(JSON_EXTRACT(s.steps_json, '$[4].action.payload.mapId')) = 'NULL'
   AND JSON_EXTRACT(s.steps_json, '$[4].action.payload.preset') IS NULL;

-- ---------------------------------------------------------------------
-- 4. QF9877 (mini-quiz de la séance `6e-eau-de-nos-lieux`, cycle 3) : notion de cycle 3
--    en ajout, pour qu'elle retrouve le palier d'entrée 1.
-- ---------------------------------------------------------------------
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT v.question_code, v.notion_id, v.mode
  FROM (
    SELECT 'QF9877' AS question_code, 'C3-ENV' AS notion_id, 'ajout' AS mode
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN curriculum_notions cn ON cn.id = v.notion_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = v.question_code COLLATE utf8mb4_unicode_ci
            AND x.notion_id = v.notion_id COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 5. Glossaire : « matière organique » passe en `base` (notion C3-MAT du cycle 3).
-- ---------------------------------------------------------------------
UPDATE glossary_terms SET niveau = 'base'
 WHERE glossary_code = 'FM0019'
   AND terme = 'matière organique'
   AND niveau <=> 'approfondissement';

-- ---------------------------------------------------------------------
-- 6. Vingt questions de cycle 3 (décision 9), QF9934 à QF9953 : catégories
--    `environnement_durable` et `ravageurs_auxiliaires`. Source unique :
--    data/college-assouplissement/lot4_quiz.json. Numéro dans la catégorie = partie
--    numérique du code. Parent : la catégorie ; une question dont le code ou le numéro
--    est déjà pris est sautée.
-- ---------------------------------------------------------------------
INSERT INTO quiz_questions
  (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label, feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, notes_pedagogiques, tags, statut)
SELECT v.question_code, v.categorie_slug, v.numero_dans_categorie, v.question, v.choix_a, v.choix_b, v.choix_c, v.choix_d, v.choix_e, v.reponse_correcte, v.reponse_texte, v.niveau, v.difficulte, v.difficulte_label, v.feedback_correct, v.feedback_a, v.feedback_b, v.feedback_c, v.feedback_d, v.feedback_e, v.notes_pedagogiques, v.tags, v.statut
  FROM (
    SELECT 'QF9934' AS question_code, 'environnement_durable' AS categorie_slug, 9934 AS numero_dans_categorie, 'À n³, une cuve recueille l''eau de pluie du toit. À quoi sert-elle, en plus d''arroser les plantes ?' AS question, 'À fournir l''eau à boire des élèves' AS choix_a, 'À compléter l''eau de l''aquaponie' AS choix_b, 'À remplir la mare de la forêt comestible' AS choix_c, 'À laver les vitres du bâtiment chaque jour' AS choix_d, '' AS choix_e, 'B' AS reponse_correcte, 'À compléter l''eau de l''aquaponie' AS reponse_texte, 'college' AS niveau, 1 AS difficulte, '⭐ Facile' AS difficulte_label, 'Exact : la cuve, qui peut stocker jusqu''à 1 000 litres, sert aussi à garder un bon niveau d''eau dans l''aquaponie.' AS feedback_correct, 'L''eau de pluie de la cuve n''est pas traitée : elle n''est pas potable, mais elle convient aux plantes.' AS feedback_a, NULL AS feedback_b, 'La cuve de n³ alimente n³ : arrosage et aquaponie, pas la mare de la forêt comestible.' AS feedback_c, 'Laver des vitres n''est pas son rôle : elle garde l''eau pour les êtres vivants de n³.' AS feedback_d, NULL AS feedback_e, 'Source : zone « Réserve d''eau de pluie » (carte n3).' AS notes_pedagogiques, 'eau de pluie, cuve, aquaponie, n³' AS tags, 'actif' AS statut
    UNION ALL SELECT 'QF9935', 'environnement_durable', 9935, 'Le potager de n³ est arrosé au goutte-à-goutte. Quel est le principal avantage de ce système ?', 'Il arrose aussi les allées pour les rafraîchir', 'Il remplace l''eau par de l''engrais liquide', 'L''eau arrive au pied des plantes, sans gaspillage', 'Il fonctionne grâce à l''humidité de l''air seule', '', 'C', 'L''eau arrive au pied des plantes, sans gaspillage', 'college', 1, '⭐ Facile', 'Exact : l''eau tombe goutte à goutte au pied de chaque plante ; elle s''évapore peu et ne mouille pas les allées.', 'C''est l''inverse : arroser les allées gaspillerait l''eau, que le goutte-à-goutte réserve aux plantes.', 'Le goutte-à-goutte apporte de l''eau ; un engrais est autre chose.', NULL, 'Il est branché sur un robinet et un minuteur : il faut de l''eau, l''air humide ne suffit pas.', NULL, 'Source : repère « Robinet du goutte à goutte » et zone « Entrée n3 » (carte n3).', 'goutte-à-goutte, arrosage, économie d''eau, n³', 'actif'
    UNION ALL SELECT 'QF9936', 'environnement_durable', 9936, 'À Casablanca, il pleut surtout en hiver. Pourquoi le lycée stocke-t-il l''eau de pluie dans des cuves ?', 'Pour éviter que la pluie abîme les plantes l''hiver', 'Parce que l''eau de pluie est plus salée qu''au robinet', 'Pour que l''eau se change en engrais dans la cuve', 'Pour arroser en été, quand il ne pleut presque plus', '', 'D', 'Pour arroser en été, quand il ne pleut presque plus', 'college', 1, '⭐ Facile', 'Exact : l''eau recueillie pendant la saison des pluies sert pendant l''été sec, et on puise moins d''eau au robinet.', 'La pluie n''abîme pas les plantes : on la garde pour plus tard, pas pour les en protéger.', 'C''est faux : l''eau de pluie n''est pas salée ; elle contient même moins de sels que l''eau du robinet.', 'L''eau reste de l''eau dans la cuve : elle ne devient pas un engrais.', NULL, NULL, 'Sources : repères « Cuve à eau » (carte foret) et zone « Réserve d''eau de pluie » (carte n3) ; climat méditerranéen à pluies d''hiver.', 'eau de pluie, saisons, climat, économie d''eau', 'actif'
    UNION ALL SELECT 'QF9937', 'environnement_durable', 9937, 'Dans la forêt comestible, un hôtel à insectes est fait de matériaux naturels. À quoi sert-il ?', 'À élever des insectes pour les vendre au marché', 'À offrir un abri aux petits animaux du jardin', 'À piéger les insectes qui abîment le potager', 'À empêcher les insectes d''entrer dans les ruches', '', 'B', 'À offrir un abri aux petits animaux du jardin', 'college', 1, '⭐ Facile', 'Exact : insectes, araignées et même petits lézards viennent s''y cacher ; beaucoup aident ensuite le jardin.', 'On n''y élève rien : les animaux viennent et repartent librement.', NULL, 'Ce n''est pas un piège : il accueille les petits animaux au lieu de les capturer.', 'Il n''a aucun lien avec les ruches : il sert d''abri à toutes sortes de petites bêtes.', NULL, 'Source : repère « Hôtel à insectes » (carte foret).', 'hôtel à insectes, biodiversité, abri, forêt comestible', 'actif'
    UNION ALL SELECT 'QF9938', 'environnement_durable', 9938, 'Les jardinières de la forêt comestible sont bordées de rondins coupés au lycée. Quel avantage y a-t-il à réutiliser ce bois sur place ?', 'Le bois coupé devient plus solide que le bois neuf', 'Il évite d''avoir à arroser les jardinières', 'Il chasse les insectes et les champignons du sol', 'Moins de déchets, et pas de bois neuf à transporter', '', 'D', 'Moins de déchets, et pas de bois neuf à transporter', 'college', 2, '⭐⭐ Moyen', 'Exact : le bois coupé ne part pas à la benne, et on n''achète ni ne transporte de bois neuf.', 'Le bois ne se renforce pas en vieillissant : il finit au contraire par se décomposer.', 'Les rondins bordent les jardinières : il faut toujours arroser les plantes.', 'C''est l''inverse : le bois qui vieillit abrite des insectes et des champignons qui le décomposent.', NULL, NULL, 'Source : zone « Jardinières » (carte foret).', 'réemploi, déchets, bois, forêt comestible', 'actif'
    UNION ALL SELECT 'QF9939', 'environnement_durable', 9939, 'Lequel de ces déchets ne doit pas être mis au compost ?', 'Des épluchures de carottes', 'Des feuilles mortes du jardin', 'Un pot de yaourt en plastique', 'Du marc de café refroidi', '', 'C', 'Un pot de yaourt en plastique', 'college', 1, '⭐ Facile', 'Exact : les êtres vivants du compost ne décomposent pas le plastique ; il va au tri.', 'Les épluchures sont des restes végétaux : les petites bêtes, les champignons et les bactéries du compost les décomposent.', 'Les feuilles mortes sont très utiles au compost : elles se décomposent et l''aèrent.', NULL, 'Le marc de café se décompose bien : il a sa place au compost.', NULL, 'Science établie ; complète QF0144 et QF0340 sans les répéter.', 'compost, déchets, tri, décomposition', 'actif'
    UNION ALL SELECT 'QF9940', 'environnement_durable', 9940, 'Pourquoi laisser, au bord d''un potager, une bande d''herbes et de fleurs sauvages sans la tondre ?', 'Pour cacher le potager aux promeneurs', 'Pour empêcher la pluie de tomber sur les légumes', 'Pour que les mauvaises herbes envahissent le potager', 'Pour nourrir et abriter pollinisateurs et auxiliaires', '', 'D', 'Pour nourrir et abriter pollinisateurs et auxiliaires', 'college', 2, '⭐⭐ Moyen', 'Exact : ces fleurs nourrissent les insectes pollinisateurs et abritent des auxiliaires qui mangent les ravageurs.', 'La bande fleurie n''est pas une cachette : elle accueille des êtres vivants utiles.', 'Une bande d''herbes au bord n''arrête pas la pluie, qui reste utile au potager.', 'On la laisse au bord, justement pour les petites bêtes utiles, pas pour envahir les planches cultivées.', NULL, NULL, 'Science établie (bandes fleuries) ; distincte de QF9269 (plantes compagnes).', 'biodiversité, fleurs sauvages, pollinisateurs, auxiliaires', 'actif'
    UNION ALL SELECT 'QF9941', 'environnement_durable', 9941, 'Dès le mois de mai, le plan d''eau de la daya de Dar Bouazza recule. Quelle cause liée aux êtres humains aggrave ce recul ?', 'Les sources alimentées par une nappe souterraine', 'Les pompages qui prélèvent une partie de son eau', 'Le ruissellement de la pluie sur les terrains voisins', 'L''arrivée des oiseaux d''eau qui passent l''hiver', '', 'B', 'Les pompages qui prélèvent une partie de son eau', 'college', 2, '⭐⭐ Moyen', 'Exact : avec l''évaporation et un petit canal, les pompages retirent plus d''eau qu''il n''en arrive au printemps.', 'Les sources apportent de l''eau à la daya : elles ne la font pas reculer.', NULL, 'Le ruissellement apporte de l''eau en hiver ; ce n''est pas lui qui vide la daya.', 'Les oiseaux ne vident pas la daya, et ce n''est pas une action humaine.', NULL, 'Source : séance « 6e-eau-de-nos-lieux », étape w2 (bilan d''eau de la daya).', 'daya, eau, pompage, activités humaines', 'actif'
    UNION ALL SELECT 'QF9942', 'environnement_durable', 9942, 'La forêt comestible accueille des ruches. Quel service les abeilles rendent-elles aux plantes du jardin ?', 'Elles chassent les pucerons qui piquent les feuilles', 'Elles arrosent les fleurs avec leur nectar', 'Elles transportent le pollen, et des fruits se forment', 'Elles mangent les feuilles malades des arbres fruitiers', '', 'C', 'Elles transportent le pollen, et des fruits se forment', 'college', 1, '⭐ Facile', 'Exact : en butinant, les abeilles déposent du pollen d''une fleur à l''autre ; c''est la pollinisation, qui permet aux fruits de se former.', 'Les abeilles ne chassent pas les pucerons : ce sont par exemple les coccinelles qui les mangent.', 'Le nectar est leur nourriture : elles le récoltent, elles n''arrosent rien.', NULL, 'Les abeilles se nourrissent de nectar et de pollen, pas de feuilles.', NULL, 'Source : repère « Ruches » (carte foret).', 'abeilles, ruches, pollinisation, service rendu', 'actif'
    UNION ALL SELECT 'QF9943', 'environnement_durable', 9943, 'Pourquoi laisser les feuilles mortes au pied des arbres de la forêt comestible ?', 'En se décomposant, elles nourrissent le sol et le gardent humide', 'Elles empêchent les racines des arbres de respirer et de grandir', 'Elles servent de nourriture aux oiseaux pendant tout l''hiver', 'Elles repoussent toutes les petites bêtes loin des arbres fruitiers', '', 'A', 'En se décomposant, elles nourrissent le sol et le gardent humide', 'college', 2, '⭐⭐ Moyen', 'Exact : décomposées par les petites bêtes, les champignons et les bactéries, elles enrichissent le sol ; en couche, elles le protègent du dessèchement.', NULL, 'C''est l''inverse : la litière garde un sol aéré et vivant autour des racines.', 'Les oiseaux ne mangent pas les feuilles mortes ; ils y trouvent plutôt de petites bêtes.', 'La litière attire au contraire les petites bêtes, qui la décomposent.', NULL, 'Science établie ; notion cycle 3 « devenir de la matière organique ».', 'litière, feuilles mortes, décomposition, sol', 'actif'
    UNION ALL SELECT 'QF9944', 'ravageurs_auxiliaires', 9944, 'Les coccinelles mangent les pucerons. Si un insecticide tue toutes les coccinelles d''un potager, que risque-t-il d''arriver aux pucerons ?', 'Ils disparaissent aussi, faute de nourriture', 'Ils deviennent plus nombreux, faute de prédateurs', 'Ils ne changent pas, car rien d''autre ne les mange', 'Ils se mettent à manger les coccinelles mortes', '', 'B', 'Ils deviennent plus nombreux, faute de prédateurs', 'college', 2, '⭐⭐ Moyen', 'Exact : sans leurs prédateurs, les pucerons se multiplient. Tuer les auxiliaires peut aggraver les dégâts.', 'Les pucerons se nourrissent de la sève des plantes, pas des coccinelles : leur nourriture ne manque pas.', NULL, 'Les coccinelles régulent les pucerons : leur disparition change beaucoup de choses.', 'Les pucerons piquent les plantes pour boire leur sève ; ils ne mangent pas d''animaux.', NULL, 'Raisonnement sur une chaîne alimentaire ; liens de prédation de la base (coccinelles → pucerons).', 'chaîne alimentaire, coccinelle, pucerons, insecticide', 'actif'
    UNION ALL SELECT 'QF9945', 'ravageurs_auxiliaires', 9945, 'Au milieu des pucerons, on voit une petite bête allongée, noire tachée d''orange, à six pattes. Qu''est-ce que c''est, le plus souvent ?', 'Un puceron adulte qui a perdu ses ailes', 'Une jeune araignée qui prépare sa toile', 'Une chenille qui va pondre dans les feuilles', 'Une larve de coccinelle, qui mange les pucerons', '', 'D', 'Une larve de coccinelle, qui mange les pucerons', 'college', 2, '⭐⭐ Moyen', 'Exact : la larve de coccinelle ne ressemble pas à l''adulte, mais elle mange déjà beaucoup de pucerons. Mieux vaut la reconnaître pour la laisser faire.', 'Un puceron est petit, rond et mou, souvent vert ou noir, sans taches orange.', 'Une araignée a huit pattes, pas six.', 'Une chenille est une larve de papillon : elle ne pond pas, seul le papillon adulte pond.', NULL, NULL, 'Science établie (larves de coccinelles aphidiphages) ; coccinelle des friches présente sur n3, coccinelle à sept points sur foret.', 'larve, coccinelle, auxiliaire, reconnaître', 'actif'
    UNION ALL SELECT 'QF9946', 'ravageurs_auxiliaires', 9946, 'L''argiope à bandes tend sa grande toile dans les herbes de n³. Est-elle utile au potager ?', 'Non : elle mange les feuilles des légumes', 'Non : elle pond ses œufs dans les fruits mûrs', 'Oui : elle capture beaucoup d''insectes dans sa toile', 'Oui : elle transporte le pollen d''une fleur à l''autre', '', 'C', 'Oui : elle capture beaucoup d''insectes dans sa toile', 'college', 1, '⭐ Facile', 'Exact : comme les autres araignées, l''argiope est un prédateur ; elle capture de nombreux insectes, dont des ravageurs.', 'Les araignées ne mangent jamais de plantes : elles se nourrissent d''animaux.', 'L''argiope pond dans un cocon de soie accroché aux herbes, pas dans les fruits.', NULL, 'Elle reste sur sa toile et ne butine pas : ce sont les insectes qui pollinisent.', NULL, 'Espèce présente sur n3 (registre).', 'araignée, argiope, prédateur, auxiliaire', 'actif'
    UNION ALL SELECT 'QF9947', 'ravageurs_auxiliaires', 9947, 'Le bulime tronqué est un escargot qui vit à n³. Pourquoi peut-il être un allié inattendu du potager ?', 'Il mange d''autres escargots et leurs œufs', 'Il mange les racines des jeunes salades', 'Il ne se nourrit que de fruits tombés au sol', 'Il chasse les pucerons le long des tiges', '', 'A', 'Il mange d''autres escargots et leurs œufs', 'college', 2, '⭐⭐ Moyen', 'Exact : le bulime tronqué est un escargot carnivore ; il s''attaque à d''autres escargots, comme le petit-gris, qui abîment les cultures.', NULL, 'Ce sont d''autres escargots et des limaces qui abîment les jeunes salades ; le bulime, lui, les mange.', 'Le bulime ne se contente pas de fruits tombés : il chasse d''autres escargots.', 'Il ne mange pas de pucerons : ses proies sont d''autres escargots.', NULL, 'Lien de prédation de la base (bulime tronqué → escargot petit-gris) ; espèce présente sur n3.', 'escargot, bulime, prédateur, auxiliaire', 'actif'
    UNION ALL SELECT 'QF9948', 'ravageurs_auxiliaires', 9948, 'Le matin, des feuilles de salade sont trouées, avec des traces brillantes autour. Qui est passé pendant la nuit ?', 'Une coccinelle en chasse', 'Un escargot ou une limace', 'Une abeille venue butiner', 'Un ver de terre sorti du sol', '', 'B', 'Un escargot ou une limace', 'college', 1, '⭐ Facile', 'Exact : escargots et limaces mangent les feuilles la nuit et laissent derrière eux une trace de mucus qui brille.', 'La coccinelle mange des pucerons ; elle ne troue pas les feuilles et ne laisse pas de trace brillante.', NULL, 'L''abeille butine les fleurs ; elle ne mange pas de feuilles.', 'Le ver de terre mange des débris dans le sol, pas les feuilles vivantes des salades.', NULL, 'Science établie ; limace présente sur n3.', 'escargot, limace, dégâts, indices', 'actif'
    UNION ALL SELECT 'QF9949', 'ravageurs_auxiliaires', 9949, 'Le faucheux, aux pattes très longues, vit à n³. Pour le potager, c''est plutôt…', 'un ravageur, qui perce les tomates mûres pour boire', 'un danger, car sa morsure serait venimeuse pour nous', 'un parasite, qui pond ses œufs à l''intérieur des escargots', 'un allié, qui mange de petits insectes comme les pucerons', '', 'D', 'un allié, qui mange de petits insectes comme les pucerons', 'college', 2, '⭐⭐ Moyen', 'Exact : le faucheux mange de petites bêtes, dont des pucerons. Il n''a pas de venin et ne fait pas de soie.', 'Le faucheux ne perce pas les fruits : il se nourrit de petits animaux et de débris.', 'Le faucheux n''a pas de glandes à venin : il est sans danger.', 'Il ne pond pas dans les escargots : ses œufs sont déposés dans le sol.', NULL, NULL, 'Lien de prédation de la base (faucheux → pucerons) ; espèce présente sur n3 ; voir la séance « 6e-sosies ».', 'faucheux, auxiliaire, pucerons, sosie d''araignée', 'actif'
    UNION ALL SELECT 'QF9950', 'ravageurs_auxiliaires', 9950, 'Des larves de mouche soldat noire grouillent dans le compost de n³. Faut-il s''en débarrasser ?', 'Oui : elles vont manger les racines des légumes du potager', 'Oui : elles donnent des maladies aux plantes', 'Non : elles mangent les déchets et aident le compost', 'Non : elles fabriquent le miel des ruches voisines', '', 'C', 'Non : elles mangent les déchets et aident le compost', 'college', 1, '⭐ Facile', 'Exact : ces larves dévorent les restes de cuisine et accélèrent le compostage. Toutes les petites bêtes ne sont pas des ravageurs.', 'Elles se nourrissent des déchets du compost, pas des racines des plantes vivantes.', 'Elles ne rendent pas les plantes malades : elles décomposent les déchets.', NULL, 'Seules les abeilles fabriquent du miel ; ces larves recyclent les déchets.', NULL, 'Lien de détritivorie de la base ; espèce phare de n3.', 'mouche soldat noire, compost, décomposeur, utile', 'actif'
    UNION ALL SELECT 'QF9951', 'ravageurs_auxiliaires', 9951, 'Comment protéger des choux de la piéride, un papillon dont les chenilles mangent leurs feuilles, sans produit chimique ?', 'Arroser les choux tous les soirs', 'Planter les choux à l''ombre d''un mur', 'Couper les fleurs autour du potager', 'Poser un filet fin au-dessus des choux', '', 'D', 'Poser un filet fin au-dessus des choux', 'college', 2, '⭐⭐ Moyen', 'Exact : un filet à mailles fines empêche le papillon de venir pondre sur les feuilles ; il n''y a donc pas de chenilles.', 'L''arrosage n''empêche pas le papillon de pondre sur les feuilles.', 'L''ombre n''arrête pas le papillon, et le chou pousse moins bien sans soleil.', 'Couper les fleurs priverait les pollinisateurs et les auxiliaires de nourriture, sans gêner la piéride.', NULL, NULL, 'Science établie (filet anti-insectes) ; distincte de QF0073 (alternatives générales) et QF7005.', 'piéride, chou, filet, protection sans produit', 'actif'
    UNION ALL SELECT 'QF9952', 'ravageurs_auxiliaires', 9952, 'Le seps, un lézard aux pattes minuscules, vit dans la forêt comestible. De quoi se nourrit-il ?', 'De petits insectes et d''autres petites bêtes', 'Des feuilles tendres des jeunes salades', 'Des fruits mûrs tombés au pied des arbres', 'Des graines semées dans les planches', '', 'A', 'De petits insectes et d''autres petites bêtes', 'college', 1, '⭐ Facile', 'Exact : le seps chasse de petits insectes, des araignées et d''autres petites bêtes ; c''est un allié du jardin.', NULL, 'Le seps ne mange pas de plantes : c''est un prédateur.', 'Il ne mange pas de fruits : il chasse de petites bêtes.', 'Les graines attirent plutôt des oiseaux ou des fourmis ; le seps mange des animaux.', NULL, 'Espèce présente sur foret (registre) ; régime insectivore (science établie).', 'seps, lézard, prédateur, auxiliaire', 'actif'
    UNION ALL SELECT 'QF9953', 'ravageurs_auxiliaires', 9953, 'Le martinet noir passe presque toute sa vie en vol au-dessus de n³. Que chasse-t-il ?', 'Les graines des herbes du potager, au sol', 'Les petits poissons du bassin de l''aquaponie', 'De petits insectes volants, dont des pucerons', 'Les fruits mûrs des arbres fruitiers du lycée', '', 'C', 'De petits insectes volants, dont des pucerons', 'college', 1, '⭐ Facile', 'Exact : le martinet capture en vol de petits insectes, dont des pucerons ailés emportés par le vent.', 'Le martinet ne se pose presque jamais au sol : il ne mange pas de graines.', 'Il ne pêche pas : il chasse des insectes dans l''air.', NULL, 'Il ne mange pas de fruits ; son bec large s''ouvre en vol pour capturer des insectes.', NULL, 'Lien de prédation de la base (martinet noir → pucerons) ; espèce présente sur n3.', 'martinet, oiseau insectivore, pucerons, n³', 'actif'
  ) v
  JOIN quiz_categories c ON c.slug = v.categorie_slug COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_questions q WHERE q.question_code = v.question_code COLLATE utf8mb4_unicode_ci)
   AND NOT EXISTS (
         SELECT 1 FROM quiz_questions q2
          WHERE q2.categorie_slug = v.categorie_slug COLLATE utf8mb4_unicode_ci
            AND q2.numero_dans_categorie = v.numero_dans_categorie);

-- 6b. Notions : cycle 3 en ajout (palier d'entrée 1), notions de lycée héritées de la
--     catégorie en exclusion. Parents : la question et la notion.
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT v.question_code, v.notion_id, v.mode
  FROM (
    SELECT 'QF9934' AS question_code, 'C3-ENV' AS notion_id, 'ajout' AS mode
    UNION ALL SELECT 'QF9934', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9935', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9935', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9936', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9936', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9937', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9937', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9938', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9938', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9939', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9939', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9940', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9940', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9941', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9941', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9942', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9942', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9943', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9943', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9944', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9944', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9944', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9945', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9945', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9945', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9946', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9946', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9946', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9947', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9947', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9947', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9948', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9948', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9948', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9949', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9949', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9949', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9950', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9950', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9950', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9951', 'C3-ALIM', 'ajout'
    UNION ALL SELECT 'QF9951', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9951', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9952', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9952', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9952', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9953', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9953', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9953', '2-AGRO', 'exclusion'
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN curriculum_notions cn ON cn.id = v.notion_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = v.question_code COLLATE utf8mb4_unicode_ci
            AND x.notion_id = v.notion_id COLLATE utf8mb4_unicode_ci);

-- 6c. Liens non bloquants vers les fiches (source unique : resource_question_links ;
--     convention de la migration `contenus_terrain_2026_11_20` : fiche résolue par nom
--     unique, origine `manual`, statut `approved`). Une fiche absente est sautée.
INSERT INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'plant', CAST(p.id AS CHAR), v.question_code, 0, 1, 'manual', 'approved', NULL
  FROM (
    SELECT 'Abeille domestique' AS ref, 'QF9942' AS question_code
    UNION ALL SELECT 'Pucerons', 'QF9944'
    UNION ALL SELECT 'Coccinelle à sept points', 'QF9944'
    UNION ALL SELECT 'Coccinelle à sept points', 'QF9945'
    UNION ALL SELECT 'Coccinelle des friches', 'QF9945'
    UNION ALL SELECT 'Pucerons', 'QF9945'
    UNION ALL SELECT 'Argiope à bandes', 'QF9946'
    UNION ALL SELECT 'Bulime tronqué', 'QF9947'
    UNION ALL SELECT 'Escargot petit-gris', 'QF9947'
    UNION ALL SELECT 'Limace', 'QF9948'
    UNION ALL SELECT 'Escargot petit-gris', 'QF9948'
    UNION ALL SELECT 'Faucheux', 'QF9949'
    UNION ALL SELECT 'Pucerons', 'QF9949'
    UNION ALL SELECT 'Mouche soldat noire', 'QF9950'
    UNION ALL SELECT 'Piéride du chou', 'QF9951'
    UNION ALL SELECT 'Chou', 'QF9951'
    UNION ALL SELECT 'Seps à écailles nombreuses', 'QF9952'
    UNION ALL SELECT 'Martinet noir', 'QF9953'
    UNION ALL SELECT 'Pucerons', 'QF9953'
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN plants p ON p.name = v.ref COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.ref COLLATE utf8mb4_unicode_ci) = 1
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links x
          WHERE x.resource_type = 'plant'
            AND x.resource_ref = CAST(p.id AS CHAR)
            AND x.question_code = v.question_code COLLATE utf8mb4_unicode_ci);
