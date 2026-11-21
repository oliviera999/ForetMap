-- =====================================================================
-- Contenus de terrain du 20/11/2026 : reprise en migration (chantier CPT, flux F1)
--
-- Le 20/11/2026, ces contenus ont été écrits directement en production par le connecteur,
-- sans migration. Ce fichier les reprend pour qu'une autre base les reçoive aussi, et il
-- est SANS EFFET sur la production, qui les porte déjà — sauf le bloc 15, une suppression
-- de trois liens décidée le 21/11.
--
-- Règles suivies par chaque bloc :
--  - chaque valeur vient d'une lecture de la production (aucune n'est retapée) ;
--  - aucun identifiant auto-incrémenté de la production : espèces résolues par nom,
--    tutoriels par slug, termes de glossaire par code, clés par slug et numéro de couplet ;
--  - insertion par `INSERT … SELECT … WHERE NOT EXISTS` sur la clé naturelle, JOINTE AU
--    PARENT : si le parent manque (espèce, zone, carte, clé, séance, tutoriel, terme de
--    glossaire), la ligne n'est pas insérée, sans erreur. Aucun parent n'est créé, sauf
--    les sept lignes de référence du bloc 0 ;
--  - modification gardée par la valeur d'avant (`<=>`) quand elle est connue, sinon par la
--    forme d'avant et la date de l'écriture du 20/11 (ligne non retouchée depuis) ;
--  - rejouable : un second passage n'insère ni ne modifie rien.
--
-- Blocs :
--   0. quiz_categories, curriculum_notions   3 catégories et 4 notions de référence
--   1. quiz_questions            61 questions (QF9873 à QF9933)
--   2. quiz_question_notions     notions de ces questions (ajouts cycle 3, exclusions lycée)
--   3. quiz_questions            9 questions retirées (statut inactif)
--   4. quiz_questions            créneau de retour de la bonne lettre vidé s'il recopie
--                                feedback_correct
--   5. tutorials                 5 tutoriels HTML
--   6. tutorial_zones / tutorial_markers   zones et repères de ces tutoriels
--   7. resource_question_links   liens fiche, glossaire et tutoriel des 61 questions
--   8. visit_tutorials           tutoriels proposés dans la Visite de six cartes
--   9. visit_media               58 médias de zone (légende avec crédit)
--  10. id_key_leads              clé oiseaux-eau-daya, couplet n° 4 : doublon « Nette rousse »
--  11. id_keys                   consigne de sécurité de deux clés
--  12. pedago_sessions           deux séances créées, deux ramenées à six étapes, une réglée
--  13. plant_photos              deux photos proposées (non confirmées)
--  14. map_species               registre de présence : une espèce à confirmer
--  15. quiz_question_tutorials, resource_question_links   liens tutoriel de trois questions
--                                retirées (suppression)
--
-- Non repris, volontairement : rien n'est AJOUTÉ à `quiz_question_species` ni à
-- `quiz_question_tutorials` (figées depuis la reprise des liens dans
-- `resource_question_links` ; seule écriture : les trois suppressions du bloc 15), l'auteur des lignes
-- (`created_by`, `created_by_user_id` : comptes de la production), les horodatages.
-- Aucune table gl_*, aucun DDL, aucun trigger, aucune donnée personnelle.
-- =====================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 0. Lignes de référence dont dépendent 14 des 61 questions et 28 de leurs notions : trois
--    catégories de quiz et quatre notions du référentiel n'existaient qu'en production.
--    Seule exception à « aucun parent créé » (sept lignes, décision de coordination) ;
--    seules les colonnes présentes dans le schéma du dépôt sont écrites.
-- ---------------------------------------------------------------------
INSERT INTO quiz_categories (slug, nom, emoji, theme, description, order_index)
SELECT v.slug, v.nom, v.emoji, v.theme, v.description, v.order_index
  FROM (
    SELECT 'demarche_mesure' AS slug, 'Mesurer & raisonner' AS nom, '📏' AS emoji, 'sciences' AS theme, 'Protocoles, calculs, ordres de grandeur et incertitudes.' AS description, 18 AS order_index
    UNION ALL SELECT 'glossaire_definitions', 'Vocabulaire & définitions', '📖', 'sciences', 'Reconnaître la définition des termes du glossaire.', 100
    UNION ALL SELECT 'microbes_sante', 'Micro-organismes & santé', '🦠', 'sciences', 'Bactéries, levures et moisissures : utiles pour la plupart, parfois pathogènes. Hygiène au jardin, vaccins, antibiotiques.', 19
  ) v
 WHERE NOT EXISTS (SELECT 1 FROM quiz_categories c WHERE c.slug = v.slug COLLATE utf8mb4_unicode_ci);

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT v.id, v.niveau, v.discipline, v.theme, v.notion, v.sort_order
  FROM (
    SELECT '2-MICRO' AS id, 'seconde' AS niveau, 'SVT' AS discipline, 'Corps humain et santé' AS theme, 'Microorganismes et santé' AS notion, 12 AS sort_order
    UNION ALL SELECT 'EST-DEMO', 'es_terminale', 'Enseignement scientifique', 'Une histoire du vivant', 'Les modèles démographiques', 20
    UNION ALL SELECT 'EST-EVOL', 'es_terminale', 'Enseignement scientifique', 'Une histoire du vivant', 'L''évolution comme grille de lecture du monde', 19
    UNION ALL SELECT 'T-EVO', 'terminale_spe', 'SVT', 'Génétique et évolution', 'Endosymbioses, transferts de gènes et évolution des populations (sélection naturelle, dérive génétique)', 14
  ) v
 WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions cn WHERE cn.id = v.id COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 1. Les 61 questions. Parent : la catégorie de quiz. Une question dont la catégorie
--    manque est sautée ; idem si le numéro est déjà pris dans la catégorie.
-- ---------------------------------------------------------------------
INSERT INTO quiz_questions
  (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label, feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e, notes_pedagogiques, tags, photo_url, photo_credit, photo_licence, photo_legende, statut)
SELECT v.question_code, v.categorie_slug, v.numero_dans_categorie, v.question, v.choix_a, v.choix_b, v.choix_c, v.choix_d, v.choix_e, v.reponse_correcte, v.reponse_texte, v.niveau, v.difficulte, v.difficulte_label, v.feedback_correct, v.feedback_a, v.feedback_b, v.feedback_c, v.feedback_d, v.feedback_e, v.notes_pedagogiques, v.tags, v.photo_url, v.photo_credit, v.photo_licence, v.photo_legende, v.statut
  FROM (
    SELECT 'QF9873' AS question_code, 'cellule_metabolisme' AS categorie_slug, 9621 AS numero_dans_categorie, 'Qu’ont en commun le tilapia, la tomate, le cloporte et les bactéries de l’aquaponie ?' AS question, 'Ils respirent tous par des poumons ou par des branchies' AS choix_a, 'Ils sont tous formés d’une ou de plusieurs cellules' AS choix_b, 'Ils fabriquent tous leur matière grâce à la lumière' AS choix_c, 'Ils sont tous assez grands pour être vus à l’œil nu' AS choix_d, '' AS choix_e, 'B' AS reponse_correcte, 'Ils sont tous formés d’une ou de plusieurs cellules' AS reponse_texte, 'college' AS niveau, 1 AS difficulte, '⭐ Facile' AS difficulte_label, 'Oui : la cellule est l’unité du vivant. Une bactérie en compte une seule, un tilapia des milliards.' AS feedback_correct, 'La tomate et les bactéries n’ont ni poumons ni branchies : c’est la cellule qui est commune à tous.' AS feedback_a, NULL AS feedback_b, 'Seule la tomate fabrique sa matière grâce à la lumière ; le tilapia et le cloporte mangent.' AS feedback_c, 'Les bactéries de l’aquaponie sont invisibles à l’œil nu : il faut un microscope.' AS feedback_d, NULL AS feedback_e, 'Source : Fiches Nitrosomonas/Nitrobacter (bactéries microscopiques) ; programme cycle 3.' AS notes_pedagogiques, NULL AS tags, NULL AS photo_url, NULL AS photo_credit, NULL AS photo_licence, NULL AS photo_legende, 'actif' AS statut
    UNION ALL SELECT 'QF9874', 'energie_matiere', 9532, 'Un plant de tomate pèse plusieurs kilos en fin de saison. D’où vient surtout sa matière ?', 'De la terre du potager, que les racines avalent peu à peu', 'Du compost seul, qui se transforme directement en tomates', 'De l’eau d’arrosage seule, qui se transforme en feuilles', 'Du dioxyde de carbone de l’air, avec l’eau et la lumière', '', 'D', 'Du dioxyde de carbone de l’air, avec l’eau et la lumière', 'college', 2, '⭐⭐ Moyen', 'Oui : la plante fabrique sa matière à partir du dioxyde de carbone de l’air, de l’eau et des sels minéraux, grâce à la lumière.', 'Le niveau de terre d’un pot baisse à peine pendant que la plante grandit : elle ne mange pas la terre.', 'Le compost apporte des sels minéraux, mais en petite quantité : il ne devient pas la plante.', 'L’eau est indispensable, mais elle ne suffit pas : le carbone de la plante vient de l’air.', NULL, NULL, 'Source : Fiche Tomate ; programme cycle 3 (besoins des végétaux).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9875', 'evolution_biodiversite', 9837, 'Deux êtres vivants sont de la même espèce quand ils…', 'se ressemblent au point qu’on les confond souvent', 'vivent au même endroit depuis très longtemps', 'peuvent avoir ensemble des descendants féconds', 'ont exactement la même couleur et la même taille', '', 'C', 'peuvent avoir ensemble des descendants féconds', 'college', 2, '⭐⭐ Moyen', 'Oui : c’est la reproduction possible, avec des descendants eux-mêmes féconds, qui définit l’espèce.', 'Le cloporte commun et le cloporte poudré se ressemblent, mais ce sont deux espèces.', 'Beaucoup d’espèces différentes partagent un même lieu, comme au compost de n³.', NULL, 'Les coccinelles des friches n’ont pas toutes le même nombre de points : la couleur ne suffit pas.', NULL, 'Source : Séance « Ne pas confondre » ; fiche Coccinelle des friches (points en nombre variable).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9876', 'populations_equilibres', 9497, 'Aux Sablettes, la moule méditerranéenne côtoie la moule africaine. Que montre ce voisinage ?', 'Que les deux moules sont en réalité une seule espèce', 'Que la plage est à la limite de l’aire de chacune', 'Que les moules ont été semées par des pêcheurs', 'Que la moule africaine mange la méditerranéenne', '', 'B', 'Que la plage est à la limite de l’aire de chacune', 'college', 2, '⭐⭐ Moyen', 'Oui : la moule méditerranéenne atteint ici sa limite sud, la moule africaine sa limite nord.', 'Ce sont deux espèces distinctes : coquilles de forme et de couleur différentes.', NULL, 'Rien n’indique un semis : ce voisinage s’explique par la répartition naturelle des deux espèces.', 'Les moules filtrent le plancton ; elles ne se mangent pas entre elles.', NULL, 'Source : Fiche Moule méditerranéenne (limite sud / limite nord) ; sosies moule africaine.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9877', 'demarche_mesure', 9724, 'Le niveau de la daya baisse à partir de mai. Comment l’expliquer ?', 'Les sorties d’eau (évaporation, canal, pompages) dépassent les entrées', 'Les sources s’arrêtent d’un coup le premier jour du mois de mai', 'Les oiseaux d’eau boivent la plus grande partie de la mare', 'L’eau s’infiltre d’un seul coup dans le sable des dunes voisines', '', 'A', 'Les sorties d’eau (évaporation, canal, pompages) dépassent les entrées', 'college', 2, '⭐⭐ Moyen', 'Oui : c’est un bilan. En hiver, pluie et sources l’emportent ; dès mai, les sorties gagnent.', NULL, 'Les sources continuent de couler ; c’est l’équilibre entre entrées et sorties qui change.', 'Les oiseaux boivent très peu au regard du volume de la mare.', 'Le recul est progressif, à mesure que l’évaporation augmente avec la chaleur.', NULL, 'Source : Fiche de visite Mare de la daya (entrées, sorties, recul dès mai).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9878', 'microbes_sante', 13, 'Pourquoi la pâte à pain gonfle-t-elle avant la cuisson ?', 'La farine absorbe l’air de la cuisine', 'Des levures y produisent un gaz', 'Le sel fait gonfler la pâte en séchant', 'L’eau tiède se change peu à peu en air', '', 'B', 'Des levures y produisent un gaz', 'college', 1, '⭐ Facile', 'Oui : les levures, champignons microscopiques, consomment les sucres et rejettent un gaz qui fait lever la pâte.', 'La farine ne pompe pas l’air : les bulles viennent de l’activité des levures.', NULL, 'Le sel donne du goût ; il freine plutôt les levures.', 'L’eau ne se transforme pas en air : le gaz vient des levures.', NULL, 'Source : Science établie (fermentation) ; programme cycle 3 (production des aliments).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9879', 'identification_especes', 9626, 'Quelle espèce reconnais-tu sur cette photo ?', 'Faucheux (opilion)', 'Pholque phalangide', 'Scutigère véloce', 'Épeire de l’Opuntia', '', 'B', 'Pholque phalangide', 'college', 2, '⭐⭐ Moyen', 'Oui : araignée au corps en deux parties et aux pattes très fines, pendue dans une toile lâche au plafond.', 'Le faucheux a un corps d’une seule pièce et ne fait jamais de toile.', NULL, 'La scutigère a quinze paires de pattes et court sur les murs, sans toile.', 'L’épeire de l’Opuntia tend une toile en dôme à mailles régulières, dans les cactus et les buissons.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #1033).', NULL, 'https://inaturalist-open-data.s3.amazonaws.com/photos/533308905/medium.jpg', 'Theo Summer (iNaturalist)', 'CC0', NULL, 'actif'
    UNION ALL SELECT 'QF9880', 'ecologie_reseaux', 9836, 'Par quoi commence toute chaîne alimentaire du potager ?', 'Par une plante verte, qui fabrique sa matière grâce à la lumière', 'Par un prédateur, qui chasse les autres animaux du potager', 'Par un décomposeur, qui produit la matière des autres maillons', 'Par un herbivore, qui mange les feuilles des plantes du potager', '', 'A', 'Par une plante verte, qui fabrique sa matière grâce à la lumière', 'college', 2, '⭐⭐ Moyen', 'Exact : le premier maillon est un producteur ; les flèches partent de lui vers ceux qui le mangent.', NULL, 'Le prédateur se trouve en bout de chaîne : il dépend des maillons précédents.', 'Le décomposeur recycle la matière morte ; il ne la produit pas.', 'L’herbivore mange la plante : il vient donc après elle dans la chaîne.', NULL, 'Nouvelle version de QF0010 (20/11/2026) : bonne réponse à deux idées, retour B contradictoire.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9881', 'semis_recolte', 9607, 'Une salade commence à former une longue tige à fleurs (on dit qu’elle « monte »). Que deviennent ses feuilles ?', 'Elles deviennent plus tendres et plus sucrées', 'Elles tombent toutes en une seule nuit', 'Elles deviennent dures et amères', 'Elles ne changent pas : seule la tige pousse', '', 'C', 'Elles deviennent dures et amères', 'college', 2, '⭐⭐ Moyen', 'Exact : la plante consacre ses réserves aux fleurs et aux graines ; on récolte la salade avant qu’elle monte.', 'C’est l’inverse : une salade montée perd sa tendreté.', 'Les feuilles restent en place, mais leur goût et leur texture changent.', NULL, 'Les feuilles changent bel et bien : elles durcissent et deviennent amères.', NULL, 'Nouvelle version de QF0062 (20/11/2026) : la question testait le mot « monter », pas la notion.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9882', 'glossaire_definitions', 48, 'Que désigne le terme « croissance » ?', 'Augmentation de la taille et de la masse d’un être vivant.', 'Transformation profonde du corps d’un animal entre larve et adulte.', 'Apparition de nouveaux individus dans une population.', 'Production de fleurs puis de fruits par une plante.', '', 'A', 'Augmentation de la taille et de la masse d’un être vivant.', 'college', 1, '⭐ Facile', 'Oui, en taille et en masse. Chez les insectes, elle se fait par mues successives.', NULL, 'Ça, c’est la métamorphose : un changement du plan du corps, pas seulement de taille.', 'Ça, c’est la natalité, à l’échelle d’une population. La croissance concerne un individu.', 'Ça, c’est la floraison puis la fructification, liées à la reproduction.', NULL, 'Nouvelle version de QF0387 (20/11/2026) : l’ancien distracteur D (germination) était lui-même une croissance.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9883', 'cellule_metabolisme', 9622, 'La laitue de mer forme des lames vertes très minces. Quel instrument permet d’y voir les cellules ?', 'Une boîte-loupe, qui grossit environ trois fois', 'Des jumelles, réglées sur la distance la plus courte', 'Un microscope, qui grossit des dizaines de fois ou plus', 'Aucun : les cellules se voient à l’œil nu sur l’algue', '', 'C', 'Un microscope, qui grossit des dizaines de fois ou plus', 'college', 1, '⭐ Facile', 'Exact. Les cellules mesurent quelques centièmes de millimètre : seul le microscope les rend visibles.', 'La boîte-loupe montre un petit animal en entier, pas ses cellules : elle ne grossit pas assez.', 'Les jumelles rapprochent ce qui est loin ; elles ne grossissent pas ce qui est minuscule.', NULL, 'Les cellules sont bien trop petites pour l’œil nu, même sur une algue aussi fine.', NULL, 'Source : Fiche Laitue de mer (lames minces translucides) ; science établie.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9884', 'energie_matiere', 9533, 'D’où vient l’énergie qui fait vivre presque tout le réseau alimentaire de n³ ?', 'De la lumière du Soleil, captée par les plantes', 'Du compost, qui chauffe en se décomposant', 'De l’eau de pluie, stockée dans la grande cuve', 'Des prédateurs, placés au sommet du réseau', '', 'A', 'De la lumière du Soleil, captée par les plantes', 'college', 1, '⭐ Facile', 'Exact : les plantes captent l’énergie de la lumière ; elle passe ensuite aux animaux qui les mangent.', NULL, 'Le compost libère de la chaleur, mais son énergie vient elle-même des plantes mortes.', 'L’eau est indispensable à la vie, mais elle n’apporte pas d’énergie aux êtres vivants.', 'Les prédateurs reçoivent l’énergie, ils ne la produisent pas : elle vient d’en bas du réseau.', NULL, 'Source : Réseau trophique de la carte n3 ; programme cycle 3.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9885', 'evolution_biodiversite', 9838, 'Le faucheux a huit pattes, comme la pholque. Pourquoi n’est-il pourtant pas une araignée ?', 'Il a en réalité dix pattes, très fines', 'Il vit dehors, alors que la pholque vit au plafond', 'Il est beaucoup trop petit pour en être une', 'Corps d’une seule pièce, et jamais de soie', '', 'D', 'Corps d’une seule pièce, et jamais de soie', 'college', 2, '⭐⭐ Moyen', 'Exact : les araignées ont un corps en deux parties et produisent de la soie ; le faucheux n’a ni l’un ni l’autre.', 'Le faucheux a bien huit pattes, comme tous les arachnides.', 'L’endroit où l’on vit n’est pas un caractère de classification.', 'La taille ne permet pas de classer : certaines araignées sont plus petites que lui.', NULL, NULL, 'Source : Fiches Faucheux et Pholque phalangide ; séance « Ne pas confondre ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9886', 'populations_equilibres', 9498, 'Pourquoi ne voit-on le rougequeue noir à n³ qu’en automne et en hiver ?', 'Il vient d’Europe passer l’hiver chez nous, puis repart', 'Il dort tout l’été caché sous les toits du lycée', 'Il change de plumage l’été et devient méconnaissable', 'Il ne sort de son nid que lorsqu’il fait très froid', '', 'A', 'Il vient d’Europe passer l’hiver chez nous, puis repart', 'college', 1, '⭐ Facile', 'Exact : c’est un hivernant. Casablanca est pour lui un refuge pendant la mauvaise saison.', NULL, 'Les oiseaux n’hibernent pas : le rougequeue quitte la région au printemps.', 'Son plumage ne change pas au point de le rendre méconnaissable ; il est simplement absent.', 'Il ne niche pas ici : il est seulement présent en hiver.', NULL, 'Source : Fiche Rougequeue noir ; séance « Passer la mauvaise saison à n³ ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9887', 'demarche_mesure', 9725, 'Pour tester si le paillage garde le sol humide, on compare deux planches. Que faut-il faire ?', 'Arroser davantage la planche paillée, pour aider', 'Ne changer que le paillage, tout le reste pareil', 'Prendre une seule mesure, le jour le plus chaud', 'Choisir une planche à l’ombre et une au soleil', '', 'B', 'Ne changer que le paillage, tout le reste pareil', 'college', 2, '⭐⭐ Moyen', 'Exact : un seul facteur change à la fois ; sinon, on ne sait pas ce qui explique la différence.', 'Si l’on arrose plus, on ne sait plus si l’humidité vient du paillage ou de l’arrosage.', NULL, 'Une seule mesure peut tromper : il faut répéter sur plusieurs jours.', 'Ombre et soleil ajoutent une deuxième différence : on ne peut plus conclure.', NULL, 'Source : Démarche expérimentale (cycle 3) ; tutoriel Arrosage au potager.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9888', 'microbes_sante', 14, 'Pourquoi garde-t-on les restes d’un repas au réfrigérateur ?', 'Le froid ralentit la multiplication des microbes', 'Le froid tue tous les microbes en quelques minutes', 'Le froid rend les aliments plus riches en vitamines', 'Le froid empêche l’air d’entrer dans les aliments', '', 'A', 'Le froid ralentit la multiplication des microbes', 'college', 1, '⭐ Facile', 'Exact : au froid, les microbes se multiplient beaucoup plus lentement ; l’aliment se conserve plus longtemps.', NULL, 'Le froid ne tue pas les microbes : il les ralentit. Ils reprennent à température ambiante.', 'Le froid conserve, il n’ajoute pas de vitamines.', 'C’est l’emballage qui limite l’air ; le froid agit sur les microbes.', NULL, 'Source : Programme cycle 3 (conservation des aliments).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9889', 'identification_especes', 9627, 'Quelle espèce reconnais-tu sur cette photo ?', 'Pholque phalangide', 'Lycose', 'Faucheux', 'Acarien du compost', '', 'C', 'Faucheux', 'college', 2, '⭐⭐ Moyen', 'Exact : petit corps ovale d’une seule pièce, porté par huit pattes très longues ; pas de toile.', 'La pholque a un corps en deux parties et vit pendue dans sa toile.', 'La lycose a un corps en deux parties et des pattes plus courtes que celles du faucheux.', NULL, 'L’acarien est minuscule, à pattes courtes.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #1034).', NULL, 'https://inaturalist-open-data.s3.amazonaws.com/photos/267363955/medium.jpeg', 'Théalie Dhellemmes (iNaturalist)', 'CC BY-SA 4.0', NULL, 'actif'
    UNION ALL SELECT 'QF9890', 'ecologie_reseaux', 9837, 'Quel est le rôle des décomposeurs, comme les champignons et les bactéries du compost ?', 'Ils transportent le pollen et permettent la formation des fruits', 'Ils transforment la matière morte en sels minéraux pour les plantes', 'Ils chassent les ravageurs et limitent les colonies de pucerons', 'Ils produisent le dioxygène de l’air grâce à la lumière du soleil', '', 'B', 'Ils transforment la matière morte en sels minéraux pour les plantes', 'college', 2, '⭐⭐ Moyen', 'Oui : les décomposeurs rendent au sol la matière minérale que les plantes réutilisent.', 'Ça, c’est la pollinisation, le rôle d’insectes comme l’abeille.', NULL, 'Ça, c’est le rôle des prédateurs auxiliaires, comme la coccinelle.', 'Ça, c’est la photosynthèse des plantes ; les décomposeurs consomment du dioxygène.', NULL, 'Nouvelle version de QF0011 (20/11/2026) : formulation lourde, vocabulaire obscur en 6e, deux retours différents pour la bonne réponse.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9891', 'semis_recolte', 9608, 'Lors d’un rempotage, pourquoi choisit-on un pot à peine plus grand que l’ancien ?', 'Un grand pot serait trop lourd à déplacer', 'La plante pousserait si vite qu’elle casserait', 'Un grand pot laisse geler les racines l’hiver', 'La terre sans racines reste détrempée et pourrit', '', 'D', 'La terre sans racines reste détrempée et pourrit', 'college', 2, '⭐⭐ Moyen', 'Exact : les racines n’occupent pas encore ce volume ; l’eau y stagne et la pourriture commence là.', 'Le poids n’est pas la raison donnée par les jardiniers.', 'Un grand pot ne fait pas pousser la plante plus vite.', 'À Casablanca, le gel n’est pas le risque ; c’est l’excès d’eau autour de la motte.', NULL, NULL, 'Nouvelle version de QF9213 (20/11/2026) : vocabulaire hors niveau collège, retours qui ne nommaient pas l’erreur.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9892', 'glossaire_definitions', 49, 'Que désigne le terme « potager » ?', 'Terrain planté surtout d’arbres fruitiers, comme les pommiers.', 'Jardin où l’on cultive des légumes et des herbes aromatiques.', 'Abri vitré qui garde la chaleur pour protéger les jeunes plants.', 'Jardin planté de fleurs, pour le seul plaisir des yeux.', '', 'B', 'Jardin où l’on cultive des légumes et des herbes aromatiques.', 'college', 1, '⭐ Facile', 'Oui. Le mot vient de « potage » : on y cultivait les légumes de la soupe.', 'Ça, c’est un verger.', NULL, 'Ça, c’est une serre, qui peut se trouver dans un potager.', 'Ça, c’est un jardin d’agrément ; le potager sert à produire de quoi manger.', NULL, 'Nouvelle version de QF0398 (20/11/2026) : distracteur piège sur l’étymologie retiré.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9893', 'cellule_metabolisme', 9623, 'Le tilapia et la bactérie Nitrosomonas vivent dans l’aquaponie. Qu’est-ce qui les distingue ?', 'Le tilapia est fait de milliards de cellules, la bactérie d’une seule', 'Le tilapia est fait de cellules, la bactérie n’en a aucune', 'La bactérie est faite de milliards de cellules, le tilapia d’une seule', 'Ni l’un ni l’autre n’ont de cellules : seules les plantes en ont', '', 'A', 'Le tilapia est fait de milliards de cellules, la bactérie d’une seule', 'college', 2, '⭐⭐ Moyen', 'Oui : le tilapia est pluricellulaire, la bactérie est unicellulaire. Les deux sont des êtres vivants.', NULL, 'La bactérie est une cellule à elle seule : sans cellule, il n’y a pas d’être vivant.', 'C’est l’inverse : la bactérie, invisible à l’œil nu, ne compte qu’une cellule.', 'Tous les êtres vivants, animaux et bactéries compris, sont faits de cellules.', NULL, 'Source : Fiches Tilapia du Nil et Nitrosomonas ; programme cycle 3.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9894', 'energie_matiere', 9534, 'La pipistrelle de Kuhl ne mange aucune plante. D’où vient pourtant, au départ, la matière de son corps ?', 'De l’air qu’elle respire en volant la nuit', 'De la lumière des lampadaires où elle chasse', 'Des plantes, mangées par les insectes qu’elle chasse', 'De l’eau qu’elle boit dans les flaques autour du lycée', '', 'C', 'Des plantes, mangées par les insectes qu’elle chasse', 'college', 2, '⭐⭐ Moyen', 'Oui : la matière des insectes vient des plantes qu’ils mangent ; la pipistrelle la récupère en les capturant.', 'L’air apporte le dioxygène de la respiration, pas la matière qui fait grandir son corps.', 'La lumière attire les insectes, mais elle ne nourrit pas la chauve-souris.', NULL, 'L’eau est indispensable mais ne fabrique pas de matière vivante à elle seule.', NULL, 'Source : Fiche Pipistrelle de Kuhl (chasse autour des sources lumineuses) ; séance « Que mangent les animaux de n³ ? ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9895', 'evolution_biodiversite', 9839, 'Dans les boîtes emboîtées, pourquoi le tilapia n’entre-t-il pas dans la boîte « quatre membres » ?', 'Parce qu’il vit dans l’eau et non sur la terre', 'Parce qu’il a des nageoires et non quatre membres', 'Parce qu’il est plus petit que la pipistrelle', 'Parce qu’il mange des plantes et du biofilm', '', 'B', 'Parce qu’il a des nageoires et non quatre membres', 'college', 2, '⭐⭐ Moyen', 'Oui : on classe d’après les caractères que l’on possède. Le tilapia partage avec eux le squelette interne, pas les quatre membres.', 'Le milieu de vie n’est pas un caractère : la grenouille vit dans l’eau et a quatre membres.', NULL, 'La taille n’est pas un caractère de classification.', 'Le régime alimentaire ne sert pas à ranger dans les boîtes emboîtées.', NULL, 'Source : Séance « Ranger les animaux de n³ dans des groupes ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9896', 'populations_equilibres', 9499, 'En été, les caragouilles rosées restent collées en grappes sur les tiges et les clôtures. Pourquoi ?', 'Elles pondent leurs œufs tout en haut des tiges', 'Elles mangent les clôtures et l’écorce des tiges', 'Elles se protègent de la chaleur et de la sécheresse', 'Elles attendent la pluie pour partir en migration', '', 'C', 'Elles se protègent de la chaleur et de la sécheresse', 'college', 2, '⭐⭐ Moyen', 'Oui : loin du sol brûlant, l’escargot fermé ralentit son activité et attend le retour de l’humidité.', 'Les escargots pondent dans le sol humide, pas en haut des tiges.', 'Elles ne se nourrissent pas pendant ce repos d’été.', NULL, 'Les escargots ne migrent pas : ils reprennent leur activité sur place.', NULL, 'Source : Fiche Caragouille rosée (passe l’été collée en grappes au-dessus du sol) ; science établie (estivation).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9897', 'demarche_mesure', 9726, 'La daya mesure environ 1 km de long et 150 m de large. Combien de fois est-elle plus longue que large ?', 'Environ 2 fois', 'Environ 7 fois', 'Environ 15 fois', 'Environ 150 fois', '', 'B', 'Environ 7 fois', 'college', 2, '⭐⭐ Moyen', 'Oui : 1 km = 1 000 m, et 1 000 ÷ 150 ≈ 6,7, soit environ 7 fois.', 'Il faut d’abord convertir : 1 km, c’est 1 000 m, bien plus que deux fois 150 m.', NULL, '15 fois 150 m feraient 2 250 m : c’est plus que la longueur réelle.', '150 est la largeur en mètres, pas le rapport entre la longueur et la largeur.', NULL, 'Source : Fiche de visite Mare de la daya (≈ 1 km × 150 m).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9898', 'microbes_sante', 15, 'Contre quels microbes un antibiotique est-il efficace ?', 'Contre les virus, comme celui de la grippe', 'Contre les bactéries seulement', 'Contre tous les microbes, sans exception', 'Contre les levures du pain et du yaourt', '', 'B', 'Contre les bactéries seulement', 'college', 2, '⭐⭐ Moyen', 'Oui : un antibiotique agit sur les bactéries. Il est inutile contre un virus.', 'Les antibiotiques n’agissent pas sur les virus : contre la grippe, ils ne servent à rien.', NULL, 'Un antibiotique ne vise que les bactéries, et pas toutes.', 'Les levures sont des champignons : les antibiotiques ne les visent pas.', NULL, 'Source : Science établie ; programme cycle 4 (micro-organismes).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9899', 'identification_especes', 9628, 'Quelle espèce reconnais-tu sur cette photo ?', 'Grande aigrette', 'Héron pourpré', 'Ibis falcinelle', 'Héron cendré', '', 'D', 'Héron cendré', 'college', 2, '⭐⭐ Moyen', 'Oui : grand héron gris au cou blanc et au bec en poignard, qui pêche immobile à l’affût.', 'La grande aigrette est entièrement blanche.', 'Le héron pourpré est plus sombre, au cou roux rayé de noir.', 'L’ibis falcinelle est sombre et a un bec courbé vers le bas.', NULL, NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #645).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Ardea_cinerea_EM1A2714_%2827349354381%29.jpg', 'Bengt Nyman (Wikimedia Commons)', 'CC BY 2.0', NULL, 'actif'
    UNION ALL SELECT 'QF9900', 'semis_recolte', 9609, 'Pourquoi les racines d’une plante meurent-elles dans un pot dont l’eau ne peut pas s’écouler ?', 'L’eau remplit tous les vides du sol : elles manquent d’air', 'L’eau dissout peu à peu les racines, qui disparaissent', 'L’eau stagnante devient trop froide pour les racines', 'Les racines grossissent trop vite et font éclater le pot', '', 'A', 'L’eau remplit tous les vides du sol : elles manquent d’air', 'college', 2, '⭐⭐ Moyen', 'Oui : les cellules des racines respirent ; sans air dans le sol, elles meurent.', NULL, 'L’eau ne dissout pas les racines : elles meurent par manque de dioxygène.', 'La température n’est pas en cause : c’est l’air qui manque.', 'Un pot sans drainage ne fait pas grossir les racines ; elles pourrissent.', NULL, 'Nouvelle version de QF9214 (20/11/2026) : distracteurs hors niveau, retours non conformes.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9901', 'cellule_metabolisme', 9624, 'Qu’est-ce qui donne leur couleur verte aux cellules des feuilles et des algues vertes ?', 'L’eau qui monte des racines et qui remplit les cellules', 'Les sels minéraux du sol, qui se déposent dans la feuille', 'Le reflet du ciel et de l’herbe autour, sur la feuille', 'La chlorophylle, qui capte la lumière pour la plante', '', 'D', 'La chlorophylle, qui capte la lumière pour la plante', 'college', 1, '⭐ Facile', 'Exact : la chlorophylle capte la lumière, l’énergie qui permet à la plante de fabriquer sa matière.', 'L’eau est incolore : elle ne peut pas colorer la feuille en vert.', 'Les sels minéraux sont utiles à la plante, mais ce ne sont pas eux qui la colorent.', 'Une feuille reste verte à l’ombre ou dans une pièce : la couleur vient de ses cellules.', NULL, NULL, 'Source : Programme cycle 3 (végétaux chlorophylliens).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9902', 'energie_matiere', 9535, 'Dans l’aquaponie de n³, d’où vient l’engrais qui nourrit les plantes ?', 'D’un engrais chimique versé chaque semaine', 'De la terre du potager, où poussent les plantes', 'De l’eau de pluie de la cuve, riche en engrais', 'Des déchets des poissons, changés par des bactéries', '', 'D', 'Des déchets des poissons, changés par des bactéries', 'college', 2, '⭐⭐ Moyen', 'Exact : l’ammonium des déchets des tilapias devient nitrate grâce aux bactéries ; les plantes s’en nourrissent.', 'Le circuit fonctionne sans engrais ajouté : ce sont les poissons et les bactéries qui le fournissent.', 'Dans ce système, la zone potagère ne contient que des graviers : il n’y a pas de terre.', 'L’eau de pluie de la cuve est douce et pauvre : elle sert d’appoint, pas d’engrais.', NULL, NULL, 'Source : Fiches de visite Aquaponie (graviers) et Réserve d’eau de pluie ; séance aquaponie 6e.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9903', 'evolution_biodiversite', 9840, 'Pour classer, pourquoi dit-on « a des plumes » plutôt que « n’a pas de poils » ?', 'On regroupe d’après ce que les êtres vivants possèdent', 'Les phrases négatives sont interdites dans les clés', 'Les poils ne s’observent jamais sans un microscope', 'Les oiseaux ont aussi des poils, cachés sous les plumes', '', 'A', 'On regroupe d’après ce que les êtres vivants possèdent', 'college', 2, '⭐⭐ Moyen', 'Exact : un groupe se définit par un caractère partagé. « Ne pas avoir de poils » réunirait des êtres très différents.', NULL, 'Ce n’est pas une règle de grammaire : c’est une règle de classification.', 'Les poils d’un chat ou d’une chauve-souris se voient très bien à l’œil nu.', 'Les oiseaux n’ont pas de poils : leurs plumes sont un caractère qui leur est propre.', NULL, 'Source : Programme cycle 3 (classification par attributs).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9904', 'populations_equilibres', 9500, 'Le tilapia est très prolifique. Que se passerait-il dans l’aquarium de 700 litres si l’on ne retirait jamais de poissons ?', 'Rien : les poissons cessent d’eux-mêmes de se reproduire', 'Les plantes pousseraient sans limite, sans aucun souci', 'Les poissons grandiraient plus vite grâce à la compagnie', 'Trop de poissons pour l’espace et le dioxygène de l’eau', '', 'D', 'Trop de poissons pour l’espace et le dioxygène de l’eau', 'college', 2, '⭐⭐ Moyen', 'Exact : l’espace et le dioxygène limitent la population ; trop de poissons dégradent l’eau.', 'Un tilapia se reproduit tant qu’il en a les moyens : rien ne l’arrête de lui-même.', 'Les bactéries et les plantes ne peuvent traiter qu’une quantité limitée de déchets.', 'Serrés, les poissons manquent d’espace et de dioxygène : leur croissance ralentit.', NULL, NULL, 'Source : Fiches Tilapia du Nil (très prolifique) et visite Aquaponie (~700 L).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9905', 'demarche_mesure', 9727, 'La cuve de n³ contient 1 000 litres d’eau de pluie. Combien d’arrosoirs de 10 litres peut-on remplir avec une cuve pleine ?', '10 arrosoirs', '100 arrosoirs', '1 000 arrosoirs', '10 000 arrosoirs', '', 'B', '100 arrosoirs', 'college', 1, '⭐ Facile', 'Exact : 1 000 ÷ 10 = 100 arrosoirs.', '10 arrosoirs de 10 litres ne font que 100 litres.', NULL, '1 000 est le volume de la cuve, pas le nombre d’arrosoirs.', 'On a multiplié au lieu de diviser : il faut faire 1 000 ÷ 10.', NULL, 'Source : Fiche de visite Réserve d’eau de pluie (cuve de 1 000 L).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9906', 'microbes_sante', 16, 'Pourquoi ne boit-on jamais l’eau d’une mare ou d’un oued, même si elle paraît claire ?', 'Elle est toujours trop salée pour être bue', 'Elle peut contenir des microbes invisibles', 'Elle abîme les dents à cause du sable fin', 'Elle est réservée à l’arrosage des champs', '', 'B', 'Elle peut contenir des microbes invisibles', 'college', 1, '⭐ Facile', 'Exact : une eau claire peut porter des bactéries ou des parasites qui rendent malade.', 'Une mare est d’eau douce ; le danger vient des microbes, pas du sel.', NULL, 'Le sable n’est pas le vrai risque : ce sont les microbes qu’on ne voit pas.', 'L’usage n’est pas la raison : c’est le risque de microbes invisibles.', NULL, 'Source : Consignes de sécurité des clés mare-aquaponie (« on ne goûte pas l’eau »).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9907', 'identification_especes', 9629, 'Quelle espèce reconnais-tu sur cette photo ?', 'Hirondelle de fenêtre', 'Hirondelle rustique', 'Martinet noir', 'Hirondelle paludicole', '', 'A', 'Hirondelle de fenêtre', 'college', 2, '⭐⭐ Moyen', 'Exact : bleu-noir dessus, entièrement blanche dessous, croupion blanc et queue peu échancrée.', NULL, 'L’hirondelle rustique a la gorge rouge et de longs filets à la queue.', 'Le martinet noir est entièrement sombre, sans blanc dessous.', 'L’hirondelle paludicole est brune dessus et gris-brun pâle sur la gorge et la poitrine.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #422).', NULL, 'https://upload.wikimedia.org/wikipedia/commons/7/74/Delichon_urbicum_Oulu_20120527_04.JPG', 'Estormiz (Wikimedia Commons)', 'CC0', NULL, 'actif'
    UNION ALL SELECT 'QF9908', 'cellule_metabolisme', 9625, 'Une courgette grossit de jour en jour. Que se passe-t-il à l’intérieur du fruit ?', 'Ses cellules se multiplient et grandissent', 'Il se remplit de terre venue des racines', 'Ses cellules fusionnent en une très grande', 'Il se gonfle d’air comme un petit ballon', '', 'A', 'Ses cellules se multiplient et grandissent', 'college', 2, '⭐⭐ Moyen', 'Oui : la croissance vient de la multiplication des cellules et de leur grandissement.', NULL, 'La plante ne mange pas la terre : elle y puise seulement de l’eau et des sels minéraux.', 'Les cellules se divisent pour devenir plus nombreuses ; elles ne se regroupent pas en une seule.', 'Le fruit grossit en fabriquant de la matière vivante, pas en se gonflant d’air.', NULL, 'Source : Fiche Courgette ; programme cycle 3 (croissance).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9909', 'energie_matiere', 9536, 'Sur la plage des Sablettes, le talitre consomme les algues échouées. Quel est son rôle ?', 'Producteur : il fabrique sa matière grâce au soleil', 'Prédateur : il chasse les algues encore vivantes', 'Détritivore : il recycle la matière morte de la plage', 'Parasite : il vit sur les oiseaux qui le mangent', '', 'C', 'Détritivore : il recycle la matière morte de la plage', 'college', 1, '⭐ Facile', 'Oui : en consommant la laisse de mer, le talitre recycle la matière morte et sert de proie aux bécasseaux.', 'Le talitre est un animal : il ne fabrique pas sa matière, il la prend dans sa nourriture.', 'Les algues qu’il mange sont échouées et mortes : ce n’est pas de la prédation.', NULL, 'Les oiseaux mangent le talitre ; il ne vit pas sur eux.', NULL, 'Source : Fiche Talitre (recycle la laisse de mer, proie des bécasseaux et gravelots).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9910', 'evolution_biodiversite', 9841, 'Lequel de ces groupes ne peut-on trouver qu’aux Sablettes, et pas à n³ ?', 'Les insectes', 'Les oiseaux', 'Les oursins', 'Les vers de compost', '', 'C', 'Les oursins', 'college', 1, '⭐ Facile', 'Oui : les oursins vivent en mer, sur les rochers de l’estran ; on n’en trouve pas sur la terre ferme de n³.', 'Il y a des insectes dans les deux lieux, par exemple des moustiques et des mouches près des habitations des Sablettes.', 'Les oiseaux sont présents dans les deux lieux, même si ce ne sont pas les mêmes espèces.', NULL, 'C’est l’inverse : les vers de compost vivent à n³, pas au bord de la mer.', NULL, 'Source : Inventaires des cartes sablettes (zones Platier, Habitations) et n3 ; séance « Comparer la biodiversité ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9911', 'populations_equilibres', 9501, 'Sur certains rochers, une seule algue verte, la laitue de mer, recouvre tout. Qu’est-ce que cela signale ?', 'Une eau très pure, sans aucune pollution', 'Une eau trop froide pour les autres algues', 'Une eau enrichie en éléments nutritifs', 'Une eau où les oursins sont trop nombreux', '', 'C', 'Une eau enrichie en éléments nutritifs', 'college', 2, '⭐⭐ Moyen', 'Oui : la laitue de mer profite d’une eau trop riche, souvent à cause d’eaux usées ; elle étouffe les autres algues.', 'C’est l’inverse : près des endroits pollués, une seule algue verte peut tout recouvrir.', 'Les bandes d’algues variées disparaissent à cause de la pollution, pas du froid.', NULL, 'Des oursins nombreux brouteraient les algues : on verrait moins d’algues, pas une seule qui domine.', NULL, 'Source : Fiche Laitue de mer (prolifération = enrichissement) ; visite Oued Nfifikh.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9912', 'demarche_mesure', 9728, 'L’aquaponie permet d’économiser jusqu’à 90 % d’eau. Si une culture classique utilise 100 litres, combien en faut-il au mieux ?', '10 litres', '90 litres', '50 litres', '190 litres', '', 'A', '10 litres', 'college', 2, '⭐⭐ Moyen', 'Oui : économiser 90 litres sur 100, c’est n’en utiliser que 10.', NULL, '90 litres, c’est l’eau économisée, pas l’eau utilisée.', '50 litres correspondraient à une économie de moitié seulement.', 'On a ajouté au lieu de retirer : une économie fait baisser la consommation.', NULL, 'Source : Fiche de visite Réserve d’eau de pluie (économies jusqu’à 90 %).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9913', 'identification_especes', 9630, 'Quelle espèce reconnais-tu sur cette photo ?', 'Crabe vert', 'Crabe marbré', 'Crabe verruqueux', 'Talitre', '', 'B', 'Crabe marbré', 'college', 1, '⭐ Facile', 'Oui : carapace carrée et plate, marbrée de vert sombre et de jaune ; il court très vite sur les rochers.', 'Le crabe vert a une carapace plus large à l’avant, bordée de dents, sans marbrures.', NULL, 'Le crabe verruqueux est massif et bombé, à grosses pinces couvertes de tubercules.', 'Le talitre est un petit crustacé sauteur du sable, sans pinces visibles.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #768).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Pachygrapsus_marmoratus_2009_G3.jpg', 'George Chernilevsky (Wikimedia Commons)', 'Domaine public', NULL, 'actif'
    UNION ALL SELECT 'QF9914', 'cellule_metabolisme', 9626, 'Quelle est la taille approximative d’une bactérie comme Nitrosomonas ?', 'Environ un centimètre', 'Environ un millimètre', 'Un dixième de millimètre', 'Un millième de millimètre', '', 'D', 'Un millième de millimètre', 'college', 2, '⭐⭐ Moyen', 'Exact : une bactérie mesure de l’ordre du micromètre, un millième de millimètre.', 'Un centimètre, c’est la taille d’une coccinelle : on verrait la bactérie sans peine.', 'Un millimètre, c’est un grain de sable fin : encore visible à l’œil nu.', 'C’est déjà presque la limite de l’œil nu ; une bactérie est cent fois plus petite.', NULL, NULL, 'Source : Science établie (taille des bactéries, ~1 µm).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9915', 'energie_matiere', 9537, 'Au bord de l’oued Melah, pourquoi les hérons cendrés sont-ils bien moins nombreux que leurs proies ?', 'Chaque héron doit manger un très grand nombre de proies pour vivre', 'Les grenouilles et les poissons mangent les œufs des hérons au nid', 'Les hérons ne se reproduisent qu’une seule fois dans toute leur vie', 'Les hérons vivent très longtemps, ils n’ont pas besoin d’être nombreux', '', 'A', 'Chaque héron doit manger un très grand nombre de proies pour vivre', 'college', 2, '⭐⭐ Moyen', 'Exact : à chaque maillon, une grande partie de l’énergie se perd ; il faut beaucoup de proies pour un seul prédateur.', NULL, 'Les hérons nichent dans les arbres et les roselières, hors de portée des grenouilles et des poissons.', 'Les hérons se reproduisent chaque année ; ce n’est pas ce qui limite leur nombre.', 'La durée de vie ne règle pas le nombre : c’est la quantité de nourriture disponible qui compte.', NULL, 'Source : Fiche Héron cendré ; zone Oued Melah (grenouilles, gambusies) ; science établie.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9916', 'evolution_biodiversite', 9842, 'Le lieu A abrite 1 000 moineaux d’une seule espèce, le lieu B 40 oiseaux de 12 espèces. Lequel a la plus grande diversité d’espèces ?', 'Le lieu A, car il compte bien plus d’oiseaux', 'Le lieu B, car il compte plus d’espèces', 'Aucun : les deux lieux ont des oiseaux', 'On ne peut pas comparer sans les photos', '', 'B', 'Le lieu B, car il compte plus d’espèces', 'college', 1, '⭐ Facile', 'Exact : la diversité des espèces se mesure au nombre d’espèces différentes, pas au nombre d’individus.', 'Beaucoup d’individus d’une même espèce, c’est une population nombreuse, pas une grande diversité.', NULL, 'Avoir des oiseaux ne suffit pas : il faut compter combien d’espèces différentes.', 'Les nombres donnés suffisent : 12 espèces contre une seule.', NULL, 'Source : Programme cycle 3 (biodiversité).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9917', 'populations_equilibres', 9502, 'Les années sèches, l’oued Nfifikh ne rejoint plus la mer et reçoit des eaux usées. Pourquoi ses poissons sont-ils en danger ?', 'L’eau immobile et polluée finit par manquer de dioxygène', 'L’eau douce devient soudain trop salée pour les poissons', 'Les oiseaux pêcheurs deviennent bien plus nombreux', 'Les poissons ne trouvent plus le chemin de la mer', '', 'A', 'L’eau immobile et polluée finit par manquer de dioxygène', 'college', 2, '⭐⭐ Moyen', 'Exact : sans courant, la pollution s’accumule et le dioxygène s’épuise. En 2022, des milliers de poissons y sont morts.', NULL, 'Coupé de la mer, l’oued reçoit au contraire moins d’eau salée.', 'Les oiseaux ne sont pas la cause de la mortalité massive de 2022.', 'Les poissons de l’oued n’ont pas besoin de rejoindre la mer pour vivre.', NULL, 'Source : Fiche de visite Oued Nfifikh (2022, eaux usées, embouchure bouchée) ; science établie.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9918', 'demarche_mesure', 9729, 'Tu photographies un papillon pour que ton professeur vérifie son nom. Quelle photo sera la plus utile ?', 'Une photo de très loin, pour voir tout le paysage', 'Une photo floue mais prise très vite, avant qu’il parte', 'Une photo nette du dessus et une du dessous des ailes', 'Une photo du papillon tenu entre deux doigts, bien à plat', '', 'C', 'Une photo nette du dessus et une du dessous des ailes', 'college', 1, '⭐ Facile', 'Exact : le dessus et le dessous des ailes sont souvent très différents ; on s’approche lentement, sans le toucher.', 'De trop loin, les dessins des ailes ne se voient plus.', 'Une photo floue ne permet pas de vérifier les caractères.', NULL, 'On ne touche pas un papillon : ses ailes sont fragiles et couvertes d’écailles.', NULL, 'Source : Clé « Quel est ce papillon ? » (photo dessus/dessous, sans capture).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9919', 'identification_especes', 9631, 'Quelle espèce reconnais-tu sur cette photo ?', 'Siphonaire', 'Gibbule ombiliquée', 'Patelle rustique', 'Chthamale (balane)', '', 'C', 'Patelle rustique', 'college', 2, '⭐⭐ Moyen', 'Exact : coquille conique en chapeau chinois, collée au rocher du haut de l’estran.', 'La siphonaire a des côtes blanches grosses et irrégulières.', 'La gibbule est un petit escargot à coquille enroulée, pas un cône.', NULL, 'La balane est minuscule, faite de plaques, avec un orifice au sommet.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #758).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Patelles_sur_leur_rocher.JPG', 'Thesupermat (Wikimedia Commons)', 'CC BY-SA 4.0', NULL, 'actif'
    UNION ALL SELECT 'QF9920', 'cellule_metabolisme', 9627, 'Les cellules des plantes respirent-elles, comme celles des animaux ?', 'Non : les plantes rejettent du dioxygène, elles ne respirent donc pas', 'Oui, jour et nuit : elles consomment du dioxygène, comme les animaux', 'Seulement la nuit, quand la lumière manque pour la photosynthèse', 'Seulement les arbres, car les herbes et les algues sont trop petites', '', 'B', 'Oui, jour et nuit : elles consomment du dioxygène, comme les animaux', 'college', 2, '⭐⭐ Moyen', 'Oui : toutes les cellules vivantes respirent. Le jour, la plante rejette en plus du dioxygène en fabriquant sa matière.', 'Rejeter du dioxygène à la lumière n’empêche pas de respirer : les deux se font en même temps.', NULL, 'La respiration ne s’arrête pas le jour : elle est seulement masquée par la photosynthèse.', 'Toutes les plantes respirent, des algues aux arbres, quelle que soit leur taille.', NULL, 'Source : Science établie (respiration cellulaire) ; conception erronée fréquente en 6e.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9921', 'energie_matiere', 9538, 'Le tilapia mange des plantes, des larves de moustique et du biofilm. Que lui apportent ces aliments ?', 'Seulement l’eau dont il a besoin pour vivre', 'De la matière et de l’énergie pour vivre', 'Seulement des couleurs pour ses nageoires', 'Du dioxygène, qui remplace sa respiration', '', 'B', 'De la matière et de l’énergie pour vivre', 'college', 1, '⭐ Facile', 'Oui : les aliments fournissent la matière de son corps et l’énergie qui le fait bouger et respirer.', 'Le tilapia vit dans l’eau : ce n’est pas ce que ses aliments lui apportent d’abord.', NULL, 'Les aliments servent à construire tout le corps et à vivre, pas seulement à le colorer.', 'Le tilapia prend son dioxygène dans l’eau avec ses branchies, pas dans ses aliments.', NULL, 'Source : Séance « Que mangent les animaux de n³ ? » (régime du tilapia).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9922', 'evolution_biodiversite', 9843, 'Pourquoi le nom scientifique Theba pisana est-il utile pour parler de la caragouille rosée avec un chercheur étranger ?', 'Il est plus court que le nom français', 'Il indique où vit l’espèce sur la carte', 'Il nomme une seule espèce, en toute langue', 'Il change selon le pays, comme une traduction', '', 'C', 'Il nomme une seule espèce, en toute langue', 'college', 1, '⭐ Facile', 'Oui : un nom scientifique désigne une seule espèce, partout dans le monde.', 'Ce n’est pas une question de longueur : « Theba pisana » n’est pas plus court.', 'Le nom scientifique ne dit rien du lieu de vie de l’espèce.', NULL, 'C’est justement l’inverse : il est le même dans tous les pays.', NULL, 'Source : Fiche Caragouille rosée ; séance « Ne pas confondre ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9923', 'populations_equilibres', 9503, 'Si l’on retirait chaque jour les algues échouées de la plage des Sablettes, quelle population diminuerait d’abord ?', 'Celle des talitres, qui se nourrissent de ces algues', 'Celle des goélands, qui mangent les algues fraîches', 'Celle des oursins, qui vivent dans le sable sec', 'Aucune : ces algues mortes ne servent à personne', '', 'A', 'Celle des talitres, qui se nourrissent de ces algues', 'college', 2, '⭐⭐ Moyen', 'Oui : privés de nourriture, les talitres diminuent, puis les bécasseaux et gravelots qui les mangent.', NULL, 'Les goélands ne se nourrissent pas des algues échouées.', 'Les oursins vivent sur les rochers immergés, pas dans le sable sec du haut de plage.', 'La laisse de mer nourrit les talitres, eux-mêmes proies de plusieurs oiseaux.', NULL, 'Source : Fiche Talitre (laisse de mer, proie des bécasseaux et gravelots).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9924', 'demarche_mesure', 9730, 'Pour compter les cloportes, pourquoi compte-t-on dans plusieurs carrés de 1 m² plutôt que dans un seul ?', 'Un seul carré peut être très riche ou très pauvre par hasard', 'Les cloportes se déplacent d’un carré à l’autre à chaque fois', 'Un seul carré obligerait à retourner toute la zone', 'Plus on compte de carrés, plus il y a de cloportes', '', 'A', 'Un seul carré peut être très riche ou très pauvre par hasard', 'college', 2, '⭐⭐ Moyen', 'Oui : la moyenne de plusieurs carrés représente mieux toute la zone qu’un seul relevé.', NULL, 'Le déplacement n’est pas la raison : c’est la variation d’un endroit à l’autre.', 'Un carré ne demande pas de tout retourner ; c’est justement l’intérêt de l’échantillon.', 'Compter plus de carrés ne crée pas de cloportes : cela rend l’estimation plus fiable.', NULL, 'Source : Démarche (échantillonnage) ; question QF9850 voisine (calcul).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9925', 'identification_especes', 9632, 'Quelle espèce reconnais-tu sur cette photo ?', 'Moule africaine (brune)', 'Moule méditerranéenne', 'Pouce-pied', 'Grande balane', '', 'B', 'Moule méditerranéenne', 'college', 3, '⭐⭐⭐ Difficile', 'Oui : coquille noir-bleuté, plutôt triangulaire. Aux Sablettes, elle côtoie la moule africaine.', 'La moule africaine a une coquille brun-vert, plus arrondie à l’arrière.', NULL, 'Le pouce-pied est un crustacé fixé, fait de plaques au bout d’un pied charnu.', 'La grande balane forme un cône de plaques soudées, pas deux valves.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #762).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Mytilus_galloprovincialis_shell.jpg', 'Andrey Butko (Wikimedia Commons)', 'CC BY-SA 3.0', NULL, 'actif'
    UNION ALL SELECT 'QF9926', 'cellule_metabolisme', 9628, 'Une bactérie n’est formée que d’une seule cellule. Est-ce bien un être vivant ?', 'Non : il faut au moins un cœur ou des feuilles pour être vivant', 'Non : un être vivant doit être assez grand pour se voir à l’œil nu', 'Oui : cette cellule se nourrit, grandit et se reproduit à elle seule', 'Oui, mais seulement quand elle vit à l’intérieur d’un autre animal', '', 'C', 'Oui : cette cellule se nourrit, grandit et se reproduit à elle seule', 'college', 2, '⭐⭐ Moyen', 'Exact : une seule cellule suffit pour accomplir toutes les fonctions du vivant.', 'Les champignons n’ont ni cœur ni feuilles et sont pourtant vivants : ce n’est pas le critère.', 'La taille ne compte pas : se nourrir, grandir, se reproduire, voilà ce qui définit le vivant.', NULL, 'Les bactéries de l’aquaponie vivent librement dans l’eau et les filtres : elles sont bien vivantes.', NULL, 'Source : Fiches Nitrosomonas/Nitrobacter (vivent dans le sol et les filtres) ; programme cycle 3.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9927', 'energie_matiere', 9539, 'Pourquoi dit-on que la matière circule en boucle dans le potager et son compost ?', 'Les décomposeurs rendent au sol des sels minéraux que les plantes réutilisent', 'Les plantes fabriquent la terre du potager à partir de la lumière du Soleil', 'Les déchets disparaissent dans le compost et laissent la place aux nouvelles', 'Les vers de terre transforment les épluchures directement en légumes neufs', '', 'A', 'Les décomposeurs rendent au sol des sels minéraux que les plantes réutilisent', 'college', 2, '⭐⭐ Moyen', 'Exact : la matière des déchets redevient minérale grâce aux décomposeurs, puis repart dans les plantes.', NULL, 'Les plantes ne fabriquent pas de terre : elles fabriquent leur propre matière.', 'Rien ne disparaît : la matière des déchets est transformée, pas détruite.', 'Les vers fragmentent les déchets ; les plantes en tirent ensuite des sels minéraux, pas des légumes tout faits.', NULL, 'Source : Tutoriel Le compostage ; programme cycle 3 (décomposition).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9928', 'evolution_biodiversite', 9844, 'Que nous apprennent les fossiles trouvés dans des roches très anciennes ?', 'Que les êtres vivants n’ont jamais changé depuis l’origine', 'Que d’autres êtres vivants peuplaient la Terre autrefois', 'Que les roches sont elles-mêmes des êtres vivants', 'Que tous les animaux anciens vivent encore, cachés', '', 'B', 'Que d’autres êtres vivants peuplaient la Terre autrefois', 'college', 2, '⭐⭐ Moyen', 'Exact : les fossiles montrent que les peuplements de la Terre ont changé au cours des temps.', 'Les fossiles montrent au contraire des espèces disparues, très différentes d’aujourd’hui.', NULL, 'Une roche n’est pas vivante : le fossile est la trace d’un être vivant conservée dans la roche.', 'Beaucoup d’espèces fossiles ont disparu depuis longtemps ; le ginkgo est une rare exception.', NULL, 'Source : Programme cycle 3 (peuplement de la Terre au cours du temps) ; fiche Ginkgo.', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9929', 'populations_equilibres', 9504, 'Dans la vallée de l’oued Melah, pourquoi la massette pousse-t-elle au fond de la vallée et pas sur les versants ?', 'Elle a besoin d’un sol gorgé d’eau, au bord de l’oued', 'Les chèvres l’ont mangée partout sur les versants', 'Elle a été plantée là par les agriculteurs du village', 'Elle fuit le soleil, qui n’atteint pas le fond de vallée', '', 'A', 'Elle a besoin d’un sol gorgé d’eau, au bord de l’oued', 'college', 1, '⭐ Facile', 'Exact : la massette est une plante des bords d’eau. Sur les versants secs pousse le matorral, avec le lentisque.', NULL, 'Rien ne l’indique : sur les versants, c’est le manque d’eau qui l’empêche de pousser.', 'La massette pousse naturellement au bord de l’eau, sans être plantée.', 'Le fond de vallée est bien ensoleillé : c’est l’eau qui fait la différence.', NULL, 'Source : Fiches Massette et Lentisque ; séance « Pas là par hasard ».', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9930', 'demarche_mesure', 9731, 'Laquelle de ces phrases est une observation, et non une interprétation ?', '« Le héron attend, parce qu’il a très faim. »', '« Le héron est triste d’être resté seul. »', '« Le héron reste immobile au bord de l’eau. »', '« Le héron a peur des promeneurs du sentier. »', '', 'C', '« Le héron reste immobile au bord de l’eau. »', 'college', 1, '⭐ Facile', 'Exact : on décrit ce qu’on voit. Expliquer pourquoi vient ensuite, et doit être vérifié.', '« Parce qu’il a faim » est une explication : on ne voit pas la faim.', 'La tristesse ne s’observe pas : c’est une idée qu’on lui prête.', NULL, 'La peur est une interprétation ; on observe seulement s’il s’éloigne ou non.', NULL, 'Source : Démarche (cycle 3) ; fiche Héron cendré (pêche à l’affût).', NULL, NULL, NULL, NULL, NULL, 'actif'
    UNION ALL SELECT 'QF9931', 'identification_especes', 9633, 'Quelle espèce reconnais-tu sur cette photo ?', 'Entéromorphe', 'Fucus spiralé', 'Codium adhérent', 'Laitue de mer', '', 'D', 'Laitue de mer', 'college', 1, '⭐ Facile', 'Exact : algue verte en lames minces et translucides, comme une feuille de salade.', 'L’entéromorphe forme des tubes fins et creux, pas des lames larges.', 'Le fucus est une algue brune, épaisse, à lanières.', 'Le codium forme des coussinets épais et spongieux, vert foncé.', NULL, NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #742).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Sea_Lettuce_%2850669394217%29.jpg', 'YVC Biology Department (Wikimedia Commons)', 'Domaine public', NULL, 'actif'
    UNION ALL SELECT 'QF9932', 'identification_especes', 9634, 'Quelle espèce reconnais-tu sur cette photo ?', 'Talitre (puce de mer)', 'Ligie (cloporte de mer)', 'Cloporte', 'Cloporte poudré', '', 'A', 'Talitre (puce de mer)', 'college', 2, '⭐⭐ Moyen', 'Oui : petit crustacé sauteur au corps aplati sur les côtés, qui s’enfouit le jour dans le sable humide.', NULL, 'La ligie, aplatie de haut en bas, court sur les rochers et a de longues antennes.', 'Le cloporte vit sur la terre ferme et se roule en boule.', 'Le cloporte poudré vit dans le compost, pas sur la plage.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #779).', NULL, 'https://commons.wikimedia.org/wiki/Special:FilePath/Talitrus_saltator_2c.jpg', 'Arnold Paul, retouches Waugsberg et Buchling (Wikimedia Commons)', 'CC BY-SA 2.0 DE', NULL, 'actif'
    UNION ALL SELECT 'QF9933', 'identification_especes', 9635, 'Quelle espèce reconnais-tu sur cette photo ?', 'Cloporte', 'Cloporte poudré', 'Ligie', 'Talitre (puce de mer)', '', 'B', 'Cloporte poudré', 'college', 2, '⭐⭐ Moyen', 'Exact : gris-violacé, couvert d’un fin duvet poudreux, plus élancé que le cloporte commun ; il ne se roule pas en boule.', 'Le cloporte commun est gris ardoisé, brillant, et se roule en boule.', NULL, 'La ligie vit sur les rochers du bord de mer et porte de longues antennes.', 'Le talitre vit dans le sable des plages et saute.', NULL, 'Distracteurs tirés de plant_lookalikes (et esp. du même milieu). Photo reprise de la fiche espèce (plant_photos #486).', NULL, 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Porcellionides_pruinosus_P1380341a.jpg', 'xpda (Wikimedia Commons)', 'CC BY-SA 4.0', NULL, 'actif'
  ) v
  JOIN quiz_categories c ON c.slug = v.categorie_slug COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_questions q WHERE q.question_code = v.question_code COLLATE utf8mb4_unicode_ci)
   AND NOT EXISTS (
         SELECT 1 FROM quiz_questions q2
          WHERE q2.categorie_slug = v.categorie_slug COLLATE utf8mb4_unicode_ci
            AND q2.numero_dans_categorie = v.numero_dans_categorie);

-- ---------------------------------------------------------------------
-- 2. Notions des 61 questions : « ajout » d'une notion du cycle 3, « exclusion » des notions
--    de lycée héritées de la catégorie. Parents : la question et la notion.
-- ---------------------------------------------------------------------
INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT v.question_code, v.notion_id, v.mode
  FROM (
    SELECT 'QF9873' AS question_code, '2-ORGA' AS notion_id, 'exclusion' AS mode
    UNION ALL SELECT 'QF9873', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9874', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9874', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9874', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9875', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9875', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9875', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9875', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9875', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9876', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9876', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9876', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9876', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9877', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9877', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9878', '2-MICRO', 'exclusion'
    UNION ALL SELECT 'QF9878', 'C3-ALIM', 'ajout'
    UNION ALL SELECT 'QF9879', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9879', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9880', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9880', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9881', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9882', 'C3-DEVREPRO', 'ajout'
    UNION ALL SELECT 'QF9882', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9882', 'C4-VIV', 'ajout'
    UNION ALL SELECT 'QF9883', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9883', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9884', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9884', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9884', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9885', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9885', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9885', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9885', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9885', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9886', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9886', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9886', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9886', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9887', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9887', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9888', '2-MICRO', 'exclusion'
    UNION ALL SELECT 'QF9888', 'C3-ALIM', 'ajout'
    UNION ALL SELECT 'QF9889', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9889', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9890', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9890', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9891', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9892', '1-ECO', 'ajout'
    UNION ALL SELECT 'QF9892', '2-AGRO', 'ajout'
    UNION ALL SELECT 'QF9892', 'C3-ALIM', 'ajout'
    UNION ALL SELECT 'QF9892', 'C4-RESS', 'ajout'
    UNION ALL SELECT 'QF9892', 'C4-TERRE', 'ajout'
    UNION ALL SELECT 'QF9892', 'T-DOM', 'ajout'
    UNION ALL SELECT 'QF9893', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9893', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9894', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9894', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9894', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9895', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9895', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9895', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9895', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9895', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9896', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9896', 'C3-DEVREPRO', 'ajout'
    UNION ALL SELECT 'QF9896', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9896', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9897', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9898', '2-MICRO', 'exclusion'
    UNION ALL SELECT 'QF9899', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9899', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9900', '2-AGRO', 'exclusion'
    UNION ALL SELECT 'QF9901', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9901', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9902', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9902', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9902', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9903', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9903', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9903', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9903', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9903', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9904', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9904', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9904', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9904', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9905', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9906', '2-MICRO', 'exclusion'
    UNION ALL SELECT 'QF9906', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9907', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9907', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9908', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9908', 'C3-DEVREPRO', 'ajout'
    UNION ALL SELECT 'QF9909', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9909', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9909', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9910', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9910', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9910', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9910', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9910', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9911', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9911', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9911', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9911', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9912', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9912', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9913', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9913', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9914', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9914', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9915', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9915', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9915', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9916', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9916', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9916', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9916', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9916', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9917', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9917', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9917', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9917', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9918', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9918', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9919', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9919', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9920', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9920', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9921', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9921', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9921', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9922', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9922', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9922', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9922', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9922', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9923', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9923', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9923', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9923', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9924', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9924', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9925', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9925', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9926', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9926', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9927', '2-ORGA', 'exclusion'
    UNION ALL SELECT 'QF9927', 'C3-MATORG', 'ajout'
    UNION ALL SELECT 'QF9927', 'ES1-SOLEIL', 'exclusion'
    UNION ALL SELECT 'QF9928', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9928', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9928', 'EST-EVOL', 'exclusion'
    UNION ALL SELECT 'QF9928', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9928', 'T-EVO', 'exclusion'
    UNION ALL SELECT 'QF9929', '1-ECO', 'exclusion'
    UNION ALL SELECT 'QF9929', 'C3-ENV', 'ajout'
    UNION ALL SELECT 'QF9929', 'EST-DEMO', 'exclusion'
    UNION ALL SELECT 'QF9929', 'EST-VIVANT', 'exclusion'
    UNION ALL SELECT 'QF9930', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9931', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9931', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9932', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9932', 'C3-VIV', 'ajout'
    UNION ALL SELECT 'QF9933', '2-BIODIV', 'exclusion'
    UNION ALL SELECT 'QF9933', 'C3-VIV', 'ajout'
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN curriculum_notions cn ON cn.id = v.notion_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = v.question_code COLLATE utf8mb4_unicode_ci
            AND x.notion_id = v.notion_id COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 3. Neuf questions retirées : remplacées par une nouvelle version le 20/11.
-- ---------------------------------------------------------------------
UPDATE quiz_questions
   SET statut = 'inactif'
 WHERE question_code IN ('QF0010', 'QF0011', 'QF0062', 'QF0387', 'QF0398', 'QF9213', 'QF9214', 'QF0431', 'QF0427')
   AND statut = 'actif';

-- ---------------------------------------------------------------------
-- 4. Créneau de retour de la bonne lettre : vidé quand il recopie `feedback_correct` (le
--    même texte s'affichait deux fois). Même condition que l'écriture du 20/11 ; une ligne
--    déjà traitée ne répond plus à la condition.
-- ---------------------------------------------------------------------
UPDATE quiz_questions
   SET feedback_a = IF(reponse_correcte = 'A' AND feedback_a = feedback_correct, NULL, feedback_a),
       feedback_b = IF(reponse_correcte = 'B' AND feedback_b = feedback_correct, NULL, feedback_b),
       feedback_c = IF(reponse_correcte = 'C' AND feedback_c = feedback_correct, NULL, feedback_c),
       feedback_d = IF(reponse_correcte = 'D' AND feedback_d = feedback_correct, NULL, feedback_d),
       feedback_e = IF(reponse_correcte = 'E' AND feedback_e = feedback_correct, NULL, feedback_e)
 WHERE (reponse_correcte = 'A' AND feedback_a = feedback_correct)
    OR (reponse_correcte = 'B' AND feedback_b = feedback_correct)
    OR (reponse_correcte = 'C' AND feedback_c = feedback_correct)
    OR (reponse_correcte = 'D' AND feedback_d = feedback_correct)
    OR (reponse_correcte = 'E' AND feedback_e = feedback_correct);

-- ---------------------------------------------------------------------
-- 5. Cinq tutoriels HTML, actifs. Aucun parent.
-- ---------------------------------------------------------------------
INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order, created_at, updated_at)
SELECT v.title, v.slug, v.type, v.summary, v.html_content, v.is_active, v.sort_order, NOW(3), NOW(3)
  FROM (
    SELECT 'Observer à la boîte-loupe' AS title, 'observer-a-la-boite-loupe' AS slug, 'html' AS type, 'Regarder un petit animal de près sans le toucher ni l''abîmer, puis le rendre à sa place.' AS summary, '<p>La boîte-loupe est un petit récipient transparent dont le couvercle est une loupe : elle grossit environ trois fois. On y voit les pattes, les antennes et les ailes d''un petit animal, sans jamais le prendre dans les doigts.</p>
<h2>Avant de commencer</h2>
<ul>
<li>C''est l''adulte qui dépose l''animal dans la boîte, avec un peu de compost, de litière ou une feuille.</li>
<li>On s''installe à l''ombre : au soleil, la boîte chauffe très vite.</li>
<li>On ne cherche pas à mettre en boîte une abeille, une guêpe ou une punaise : elles piquent.</li>
</ul>
<h2>Observer</h2>
<ol>
<li>La boîte reste posée à plat. On ne la secoue pas et on ne la retourne pas.</li>
<li>On regarde à travers le couvercle, l''œil à quelques centimètres. Pour voir l''animal sous un autre angle, on tourne autour de la boîte plutôt que de la bouger.</li>
<li>On note ce que demandent les clés : le nombre de pattes, la forme du corps, les antennes, les ailes, la couleur.</li>
<li>Une photo prise à travers le couvercle aide à vérifier ensuite (voir « Prendre une photo utile »).</li>
</ol>
<h2>Pas plus de quelques minutes</h2>
<p>Enfermé trop longtemps, un petit animal se dessèche et s''épuise. Quelques minutes suffisent pour compter ses pattes et suivre la clé.</p>
<h2>Rendre l''animal</h2>
<p>L''adulte remet l''animal exactement là où il a été trouvé, avec son compost ou sa feuille, à l''ombre. On se lave les mains après une séance au compost.</p>
<figure><img src="https://upload.wikimedia.org/wikipedia/commons/c/cc/Porcellionides_pruinosus_P1380341a.jpg" alt="Cloporte poudré gris-violacé sur un sol sombre"><figcaption>Le cloporte poudré, l''un des petits animaux du compost de n³. Photo : xpda, CC BY-SA 4.0 (Wikimedia Commons).</figcaption></figure>' AS html_content, 1 AS is_active, 0 AS sort_order
    UNION ALL SELECT 'Observer aux jumelles', 'observer-aux-jumelles', 'html', 'Régler ses jumelles en trente secondes et repérer un oiseau sans le perdre de vue.', '<p>Les jumelles rapprochent ce qui est loin : on observe un oiseau, une libellule ou un lézard sans s''en approcher, donc sans le faire fuir.</p>
<h2>Régler ses jumelles</h2>
<ol>
<li>On passe la dragonne autour du cou : les jumelles ne tombent pas si on les lâche.</li>
<li>On écarte ou on resserre les deux tubes jusqu''à ne voir qu''un seul cercle.</li>
<li>On vise un objet fixe assez loin (un poteau, un arbre). On ferme l''œil droit et on tourne la molette centrale jusqu''à une image nette pour l''œil gauche.</li>
<li>On ferme l''œil gauche et on tourne la bague de l''oculaire droit jusqu''à une image nette pour l''œil droit. Ce réglage est fait une fois pour toutes.</li>
</ol>
<h2>Trouver l''animal</h2>
<ol>
<li>On repère d''abord l''animal à l''œil nu.</li>
<li>Sans le quitter des yeux, on amène les jumelles devant les yeux.</li>
<li>On refait la mise au point avec la molette centrale seulement.</li>
<li>Pour une image stable, on s''appuie contre un arbre ou un muret, les coudes près du corps.</li>
</ol>
<h2>Ce qu''on note</h2>
<p>La silhouette, la forme et la couleur du bec et des pattes, les taches du plumage, la façon de se déplacer ou de se nourrir : ce sont les caractères des clés.</p>
<h2>Une règle absolue</h2>
<p>On ne regarde jamais le Soleil aux jumelles, même un instant : l''œil peut être brûlé pour toujours.</p>
<figure><img src="https://commons.wikimedia.org/wiki/Special:FilePath/Ardea_cinerea_EM1A2714_%2827349354381%29.jpg" alt="Héron cendré gris au bord de l''eau"><figcaption>Le héron cendré, visible au bord de l''oued Melah et à l''embouchure de l''oued Nfifikh. Photo : Bengt Nyman, CC BY 2.0 (Wikimedia Commons).</figcaption></figure>', 1, 0
    UNION ALL SELECT 'Observer sans déranger', 'observer-sans-deranger', 'html', 'Les gestes qui permettent de voir les animaux sans les faire fuir ni leur nuire.', '<p>Un animal dérangé fuit, abandonne parfois son nid ou dépense une énergie qui lui manquera. Bien observer, c''est d''abord ne rien changer à ce que fait l''animal.</p>
<h2>Approcher</h2>
<ul>
<li>On avance lentement, en silence, sans gestes brusques.</li>
<li>On s''arrête dès que l''animal lève la tête, crie ou s''éloigne : on est trop près. On continue aux jumelles.</li>
<li>On reste sur les chemins. Sur la dune, chaque pas écrase les plantes qui retiennent le sable.</li>
</ul>
<h2>Les nids</h2>
<p>Au printemps, certains oiseaux pondent à même le sable du haut de plage ou de la pelouse inondée. Un oiseau qui crie ou tourne autour de nous signale souvent un nid tout proche : on s''éloigne aussitôt, par le chemin d''où l''on vient.</p>
<h2>Laisser chaque chose à sa place</h2>
<ul>
<li>On ne nourrit pas les animaux.</li>
<li>On ne ramasse rien : coquilles, plumes, pierres et bois mort servent d''abri ou de nourriture à d''autres êtres vivants.</li>
<li>Si l''adulte soulève une pierre pour montrer ce qui vit dessous, il la remet exactement à sa place, dans le même sens.</li>
<li>Un petit animal observé est rendu par l''adulte à l''endroit précis où il a été trouvé.</li>
</ul>
<figure><img src="https://commons.wikimedia.org/wiki/Special:FilePath/Charadrius_alexandrinus_-_Kentish_Plover_03.jpg" alt="Gravelot à collier interrompu sur le sable"><figcaption>Le gravelot à collier interrompu fréquente la plage des Sablettes et la daya. Photo : Zeynel Cebeci, CC BY-SA 4.0 (Wikimedia Commons).</figcaption></figure>', 1, 0
    UNION ALL SELECT 'Prendre une photo utile pour identifier', 'prendre-une-photo-utile-pour-identifier', 'html', 'Une photo nette, sous plusieurs angles, sans personne dessus : de quoi nommer l''espèce et signaler l''observation.', '<p>Une bonne photo permet de vérifier un nom avec la clé, de comparer avec les photos de la fiche, et de signaler ce qu''on a vu.</p>
<h2>Une photo nette</h2>
<ul>
<li>On s''approche lentement plutôt que de zoomer : le zoom du téléphone rend l''image floue.</li>
<li>On touche l''écran sur l''animal ou la plante pour faire la mise au point.</li>
<li>On se place dos à la lumière, sans faire d''ombre sur le sujet.</li>
</ul>
<h2>Plusieurs angles</h2>
<ul>
<li>Pour un papillon : une photo du dessus et une du dessous des ailes, souvent très différents.</li>
<li>Pour une plante : la plante entière, une feuille, une fleur ou un fruit, l''écorce pour un arbre.</li>
<li>Pour une trace ou une empreinte : une règle posée à côté, sans marcher dessus.</li>
</ul>
<h2>Ce qu''on ne photographie pas</h2>
<p>On photographie l''être vivant, jamais ses camarades ni les visages des personnes présentes.</p>
<h2>Signaler une observation</h2>
<p>Sur la fiche de l''espèce, le bouton « Signaler une observation » enregistre ce qu''on a vu, avec une photo si on le souhaite. Si l''on ne connaît pas le nom, on choisit « Je ne sais pas » et on décrit l''être vivant. Le professeur vérifie chaque observation avant qu''elle compte pour l''inventaire.</p>
<figure><img src="https://inaturalist-open-data.s3.amazonaws.com/photos/533308905/medium.jpg" alt="Pholque phalangide dans sa toile"><figcaption>Une photo utile : nette, l''animal en entier, ses pattes bien visibles. Pholque phalangide. Photo : Theo Summer, CC0 (iNaturalist).</figcaption></figure>', 1, 0
    UNION ALL SELECT 'Sécurité sur l''estran', 'securite-sur-l-estran', 'html', 'Marée, rochers glissants, êtres vivants qui piquent : les règles d''une sortie à marée basse.', '<p>L''estran est la bande de rochers et de sable que la mer découvre à marée basse et recouvre à marée haute. On n''y va qu''à marée basse, avec un adulte.</p>
<h2>La marée</h2>
<ul>
<li>L''heure de la basse mer est vérifiée avant la sortie : on arrive un peu avant, on repart dès que la mer remonte.</li>
<li>La mer remonte plus vite qu''on ne le croit : on garde toujours un œil sur elle et on ne tourne pas le dos aux vagues sur les rochers exposés.</li>
<li>Au signal de l''adulte, tout le groupe regagne le haut de plage.</li>
</ul>
<h2>Les rochers</h2>
<ul>
<li>Les rochers couverts d''algues sont très glissants : on marche lentement, on pose le pied sur la roche nue et on ne court jamais.</li>
<li>Chaussures fermées à semelle qui accroche, sac sur le dos pour garder les mains libres.</li>
</ul>
<h2>Les êtres vivants</h2>
<ul>
<li>On observe sans toucher ni déplacer : les anémones irritent la peau, les oursins piquent, le poulpe peut mordre.</li>
<li>On regarde les cuvettes sans y plonger les mains.</li>
<li>On ne retourne pas les pierres : les animaux abrités dessous meurent au soleil. Si l''adulte en soulève une pour montrer ce qui s''y cache, il la remet en place, dans le même sens.</li>
</ul>
<h2>L''embouchure</h2>
<p>À l''embouchure de l''oued Nfifikh, des eaux usées sont parfois rejetées : on n''entre pas dans l''eau immobile de l''oued.</p>
<figure><img src="https://commons.wikimedia.org/wiki/Special:FilePath/Patelles_sur_leur_rocher.JPG" alt="Patelles collées sur un rocher"><figcaption>Des patelles fixées au rocher, comme sur le platier des Sablettes. Photo : Thesupermat, CC BY-SA 4.0 (Wikimedia Commons).</figcaption></figure>', 1, 0
  ) v
 WHERE NOT EXISTS (SELECT 1 FROM tutorials t WHERE t.slug = v.slug COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 6. Zones et repères de la carte de travail rattachés à ces tutoriels. Parents : le
--    tutoriel (par slug) et la zone ou le repère (identifiant texte, sur la bonne carte).
-- ---------------------------------------------------------------------
INSERT INTO tutorial_zones (tutorial_id, zone_id)
SELECT t.id, z.id
  FROM (
    SELECT 'observer-a-la-boite-loupe' AS slug, 'zone-bade91d5' AS zone_id, 'n3' AS map_id
    UNION ALL SELECT 'observer-a-la-boite-loupe', 'zone-d29f654a', 'n3'
    UNION ALL SELECT 'observer-aux-jumelles', 'zone-8dbc6d24', 'dayat'
    UNION ALL SELECT 'observer-aux-jumelles', 'zone-ebb5a2df', 'sablettes'
    UNION ALL SELECT 'observer-aux-jumelles', 'zone-f40b7875', 'melah'
    UNION ALL SELECT 'observer-sans-deranger', 'zone-0d65d814', 'dayat'
    UNION ALL SELECT 'observer-sans-deranger', 'zone-13838750', 'dayat'
    UNION ALL SELECT 'observer-sans-deranger', 'zone-f42f3db3', 'sablettes'
    UNION ALL SELECT 'securite-sur-l-estran', 'zone-5711ea38', 'sablettes'
    UNION ALL SELECT 'securite-sur-l-estran', 'zone-da63713c', 'sablettes'
    UNION ALL SELECT 'securite-sur-l-estran', 'zone-ebb5a2df', 'sablettes'
    UNION ALL SELECT 'securite-sur-l-estran', 'zone-ff335fab', 'sablettes'
  ) v
  JOIN tutorials t ON t.slug = v.slug COLLATE utf8mb4_unicode_ci
  JOIN zones z ON z.id = v.zone_id COLLATE utf8mb4_unicode_ci AND z.map_id = v.map_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM tutorial_zones x WHERE x.tutorial_id = t.id AND x.zone_id = z.id);

INSERT INTO tutorial_markers (tutorial_id, marker_id)
SELECT t.id, m.id
  FROM (
    SELECT 'observer-a-la-boite-loupe' AS slug, '5107548b-4790-4962-b0d5-85ededd77db1' AS marker_id, 'foret' AS map_id
  ) v
  JOIN tutorials t ON t.slug = v.slug COLLATE utf8mb4_unicode_ci
  JOIN map_markers m ON m.id = v.marker_id COLLATE utf8mb4_unicode_ci AND m.map_id = v.map_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM tutorial_markers x WHERE x.tutorial_id = t.id AND x.marker_id = m.id);

-- ---------------------------------------------------------------------
-- 7. Liens des 61 questions (source unique : resource_question_links). 54 vers une fiche
--    espèce (résolue par nom), 10 vers un terme de glossaire (par code), 8 vers un
--    tutoriel (par slug). Les liens repris d'une ancienne version de question portent leur
--    note et, pour la plupart, restent bloquants ; les autres ne le sont pas.
--    Deux tutoriels ont été renommés en production (« le-rempotage », « les-semences ») et
--    le dépôt sème encore « rempotage » et « semences » : le lien se pose sur le slug de
--    production s'il existe, sinon sur celui du dépôt (colonne slug_depot).
-- ---------------------------------------------------------------------
INSERT INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'plant', CAST(p.id AS CHAR), v.question_code, v.is_gating, v.weight, v.origin, v.status, v.note
  FROM (
    SELECT 'Tilapia du Nil' AS ref, 'QF9873' AS question_code, 0 AS is_gating, 1 AS weight, 'manual' AS origin, 'approved' AS status, NULL AS note
    UNION ALL SELECT 'Tomate', 'QF9873', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Cloporte', 'QF9873', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrosomonas', 'QF9873', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tomate', 'QF9874', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Cloporte', 'QF9875', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Cloporte poudré', 'QF9875', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Coccinelle des friches', 'QF9875', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Moule méditerranéenne', 'QF9876', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Moule africaine', 'QF9876', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Pholque phalangide', 'QF9879', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Maïs', 'QF9880', 1, 1, 'manual', 'approved', 'Repris de QF0010 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'Laitue de mer', 'QF9883', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Pholque phalangide', 'QF9885', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Faucheux', 'QF9885', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Rougequeue noir', 'QF9886', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Faucheux', 'QF9889', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tilapia du Nil', 'QF9893', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrosomonas', 'QF9893', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Pipistrelle de Kuhl', 'QF9894', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tilapia du Nil', 'QF9895', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Pipistrelle de Kuhl', 'QF9895', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Caragouille rosée', 'QF9896', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Héron cendré', 'QF9899', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tilapia du Nil', 'QF9902', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrosomonas', 'QF9902', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrobacter', 'QF9902', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tilapia du Nil', 'QF9904', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Hirondelle de fenêtre', 'QF9907', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Courgette', 'QF9908', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Talitre (puce de mer)', 'QF9909', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Oursin violet', 'QF9910', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Ver de compost', 'QF9910', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Laitue de mer', 'QF9911', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Crabe marbré', 'QF9913', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrosomonas', 'QF9914', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Héron cendré', 'QF9915', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Mulet lippu', 'QF9917', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Patelle rustique', 'QF9919', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Tilapia du Nil', 'QF9921', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Caragouille rosée', 'QF9922', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Talitre (puce de mer)', 'QF9923', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Cloporte', 'QF9924', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Moule méditerranéenne', 'QF9925', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrosomonas', 'QF9926', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Nitrobacter', 'QF9926', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Ver de compost', 'QF9927', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Ginkgo', 'QF9928', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Massette', 'QF9929', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Lentisque', 'QF9929', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Héron cendré', 'QF9930', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Laitue de mer', 'QF9931', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Talitre (puce de mer)', 'QF9932', 0, 1, 'manual', 'approved', NULL
    UNION ALL SELECT 'Cloporte poudré', 'QF9933', 0, 1, 'manual', 'approved', NULL
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN plants p ON p.name = v.ref COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.ref COLLATE utf8mb4_unicode_ci) = 1
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links x
          WHERE x.resource_type = 'plant'
            AND x.resource_ref = CAST(p.id AS CHAR)
            AND x.question_code = v.question_code COLLATE utf8mb4_unicode_ci);

INSERT INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'glossary', g.glossary_code, v.question_code, v.is_gating, v.weight, v.origin, v.status, v.note
  FROM (
    SELECT 'FM0010' AS ref, 'QF9880' AS question_code, 1 AS is_gating, 1 AS weight, 'manual' AS origin, 'approved' AS status, 'Repris de QF0010 (nouvelle version du 20/11/2026)' AS note
    UNION ALL SELECT 'FM0013', 'QF9880', 1, 1, 'manual', 'approved', 'Repris de QF0010 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0018', 'QF9880', 0, 1, 'manual', 'approved', 'Repris de QF0010 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0066', 'QF9881', 1, 1, 'manual', 'approved', 'Repris de QF0062 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0156', 'QF9881', 1, 1, 'manual', 'approved', 'Repris de QF0062 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0128', 'QF9882', 1, 1, 'manual', 'approved', 'Repris de QF0387 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0015', 'QF9890', 1, 1, 'manual', 'approved', 'Repris de QF0011 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0162', 'QF9890', 1, 1, 'manual', 'approved', 'Repris de QF0011 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0102', 'QF9890', 0, 1, 'manual', 'approved', 'Repris de QF0011 (nouvelle version du 20/11/2026)'
    UNION ALL SELECT 'FM0153', 'QF9892', 1, 1, 'manual', 'approved', 'Repris de QF0398 (nouvelle version du 20/11/2026)'
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN glossary_terms g ON g.glossary_code = v.ref COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links x
          WHERE x.resource_type = 'glossary'
            AND x.resource_ref = g.glossary_code
            AND x.question_code = v.question_code COLLATE utf8mb4_unicode_ci);

INSERT INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'tutorial', CAST(t.id AS CHAR), v.question_code, v.is_gating, v.weight, v.origin, v.status, v.note
  FROM (
    SELECT 'les-semences' AS ref, 'QF9881' AS question_code, 1 AS is_gating, 1 AS weight, 'manual' AS origin, 'approved' AS status, 'Repris de QF0062 (nouvelle version du 20/11/2026)' AS note, 'semences' AS slug_depot
    UNION ALL SELECT 'observer-a-la-boite-loupe', 'QF9883', 0, 1, 'manual', 'approved', NULL, 'observer-a-la-boite-loupe'
    UNION ALL SELECT 'le-rempotage', 'QF9891', 1, 1, 'manual', 'approved', 'Repris de QF9213 (nouvelle version du 20/11/2026)', 'rempotage'
    UNION ALL SELECT 'observer-aux-jumelles', 'QF9899', 0, 1, 'manual', 'approved', NULL, 'observer-aux-jumelles'
    UNION ALL SELECT 'le-rempotage', 'QF9900', 1, 1, 'manual', 'approved', 'Repris de QF9214 (nouvelle version du 20/11/2026)', 'rempotage'
    UNION ALL SELECT 'observer-aux-jumelles', 'QF9907', 0, 1, 'manual', 'approved', NULL, 'observer-aux-jumelles'
    UNION ALL SELECT 'prendre-une-photo-utile-pour-identifier', 'QF9918', 0, 1, 'manual', 'approved', NULL, 'prendre-une-photo-utile-pour-identifier'
    UNION ALL SELECT 'observer-sans-deranger', 'QF9930', 0, 1, 'manual', 'approved', NULL, 'observer-sans-deranger'
  ) v
  JOIN quiz_questions q ON q.question_code = v.question_code COLLATE utf8mb4_unicode_ci
  JOIN tutorials t ON t.id = (
         SELECT t2.id FROM tutorials t2
          WHERE t2.slug IN (v.ref COLLATE utf8mb4_unicode_ci, v.slug_depot COLLATE utf8mb4_unicode_ci)
          ORDER BY (t2.slug = v.ref COLLATE utf8mb4_unicode_ci) DESC
          LIMIT 1)
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links x
          WHERE x.resource_type = 'tutorial'
            AND x.resource_ref = CAST(t.id AS CHAR)
            AND x.question_code = v.question_code COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 8. Tutoriels proposés dans la Visite, pour six cartes. Parents : la carte et le tutoriel
--    (par slug). Une ligne déjà présente n'est pas modifiée.
-- ---------------------------------------------------------------------
INSERT INTO visit_tutorials (map_id, tutorial_id, is_active, sort_order, updated_at)
SELECT m.id, t.id, v.is_active, v.sort_order, NOW(3)
  FROM (
    SELECT 'dayat' AS map_id, 'bienvenue-a-la-daya-de-dar-bouazza' AS slug, 1 AS is_active, 0 AS sort_order
    UNION ALL SELECT 'foret', 'bienvenue-a-la-foret-comestible', 1, 0
    UNION ALL SELECT 'lyautey', 'bienvenue-au-lycee-lyautey', 1, 0
    UNION ALL SELECT 'melah', 'bienvenue-dans-la-vallee-de-l-oued-melah', 1, 0
    UNION ALL SELECT 'n3', 'bienvenue-a-n', 1, 0
    UNION ALL SELECT 'sablettes', 'securite-sur-l-estran', 1, 0
    UNION ALL SELECT 'dayat', 'mesurer-le-debit-d-un-cours-d-eau', 1, 1
    UNION ALL SELECT 'foret', 'observer-sans-deranger', 1, 1
    UNION ALL SELECT 'lyautey', 'observer-aux-jumelles', 1, 1
    UNION ALL SELECT 'melah', 'observer-aux-jumelles', 1, 1
    UNION ALL SELECT 'n3', 'prendre-une-photo-utile-pour-identifier', 1, 1
    UNION ALL SELECT 'sablettes', 'bienvenue-a-la-plage-des-sablettes', 1, 1
    UNION ALL SELECT 'dayat', 'observer-aux-jumelles', 1, 2
    UNION ALL SELECT 'lyautey', 'prendre-une-photo-utile-pour-identifier', 1, 2
    UNION ALL SELECT 'melah', 'observer-sans-deranger', 1, 2
    UNION ALL SELECT 'sablettes', 'observer-aux-jumelles', 1, 2
    UNION ALL SELECT 'dayat', 'observer-sans-deranger', 1, 3
    UNION ALL SELECT 'sablettes', 'observer-sans-deranger', 1, 3
  ) v
  JOIN maps m ON m.id = v.map_id COLLATE utf8mb4_unicode_ci
  JOIN tutorials t ON t.slug = v.slug COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM visit_tutorials x WHERE x.map_id = m.id AND x.tutorial_id = t.id);

-- ---------------------------------------------------------------------
-- 9. Médias de zone de la Visite (lien d'image, légende avec crédit) : 58 médias sur
--    29 zones des cartes sablettes, melah et dayat. Parent : la zone de visite.
-- ---------------------------------------------------------------------
INSERT INTO visit_media (target_type, target_id, image_url, image_path, caption, sort_order, created_at, updated_at)
SELECT 'zone', z.id, v.image_url, NULL, v.caption, v.sort_order, NOW(3), NOW(3)
  FROM (
    SELECT 'zone-da63713c' AS zone_id, 'sablettes' AS map_id, 'https://commons.wikimedia.org/wiki/Special:FilePath/Mytilus_galloprovincialis_shell.jpg' AS image_url, 'Moule méditerranéenne : fixée au rocher par son byssus, elle filtre le plancton. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andrey Butko, CC BY-SA 3.0.' AS caption, 0 AS sort_order
    UNION ALL SELECT 'zone-da63713c', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Sea_Lettuce_%2850669394217%29.jpg', 'Laitue de mer : algue verte en lames minces, producteur de l''estran. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : YVC Biology Department, domaine public.', 1
    UNION ALL SELECT 'zone-5711ea38', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Actinia_equina_0009.JPG', 'Anémone tomate : anémone rouge qui se referme en boule à marée basse. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Esculapio, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-5711ea38', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Paracentrotus_lividus_profil.JPG', 'Oursin violet : brouteur d''algues des cuvettes et des rochers immergés. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Frédéric Ducarme, CC BY-SA 3.0.', 1
    UNION ALL SELECT 'zone-ff335fab', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Pollicipes_pollicipes.jpg', 'Pouce-pied : crustacé fixé en touffes sur les rochers battus par les vagues. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Hans Hillewaert, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-ff335fab', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Haematopus_ostralegus_He.jpg', 'Huîtrier pie : oiseau noir et blanc au long bec orange, qui se nourrit de coquillages. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andreas Trepte, CC BY-SA 2.5.', 1
    UNION ALL SELECT 'zone-f42f3db3', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Talitrus_saltator_2c.jpg', 'Talitre (puce de mer) : petit crustacé sauteur qui recycle les algues échouées. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Arnold Paul, retouches Waugsberg et Buchling, CC BY-SA 2.0 DE.', 0
    UNION ALL SELECT 'zone-f42f3db3', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/2014-05-25_Sanderling%2C_Paignton_Beach%2C_Devon_1.jpg', 'Bécasseau sanderling : petit échassier qui court au bord des vagues. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Jacob Spinks, CC BY 2.0.', 1
    UNION ALL SELECT 'zone-ebb5a2df', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Ardea_alba4.jpg', 'Grande aigrette : grand héron tout blanc qui pêche dans l''eau peu profonde. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Calibas, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-ebb5a2df', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Carcinus_maenas.jpg', 'Crabe vert : crabe des eaux calmes et saumâtres. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Hans Hillewaert, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-66468f07', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/Morus_bassanus_adu.jpg', 'Fou de Bassan : grand oiseau marin qui plonge en piqué pour pêcher. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andreas Trepte, CC BY-SA 2.5.', 0
    UNION ALL SELECT 'zone-66468f07', 'sablettes', 'https://commons.wikimedia.org/wiki/Special:FilePath/2021-05-05_Phalacrocorax_carbo_carbo%2C_Killingworth_Lake%2C_Northumberland_1-2.jpg', 'Grand cormoran : pêcheur plongeur qui sèche ses ailes ouvertes sur les rochers. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : MPF, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-3ee997bc', 'sablettes', 'https://upload.wikimedia.org/wikipedia/commons/2/27/003-Tarentola_mauritanica.jpg', 'Tarente de Maurétanie : gecko trapu des murs, qui chasse les insectes la nuit. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Luis nunes alberto, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-3ee997bc', 'sablettes', 'https://upload.wikimedia.org/wikipedia/commons/d/db/Pallid_Swift_by_Irvin_Calicut_IRV07813.jpg', 'Martinet pâle : oiseau qui chasse les insectes en plein vol et niche dans les bâtiments. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Irvin calicut, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-d17de061', 'sablettes', 'https://upload.wikimedia.org/wikipedia/commons/9/9b/House_sparrow_male_in_Prospect_Park_%2853532%29.jpg', 'Moineau domestique : compagnon des habitations. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Rhododendrites, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-d17de061', 'sablettes', 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Larus_michahellis_familier.jpg', 'Goéland leucophée : grand goéland aux pattes jaunes, omniprésent sur le littoral. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Maisrimer, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-f40b7875', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Mauremys_leprosa_01.JPG', 'Émyde lépreuse : tortue aquatique des oueds et des mares. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Wilfreddehelm, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-f40b7875', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/2010-kabini-purple-heron.jpg', 'Héron pourpré : héron sombre au cou roux, discret dans les roselières. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Yathin S Krishnappa, CC BY-SA 3.0.', 1
    UNION ALL SELECT 'zone-99a81734', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Nerium_oleander_flowers_leaves.jpg', 'Laurier-rose : arbuste des bords d''oued, mortel s''il est ingéré. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Alvesgaspar, CC BY 2.5.', 0
    UNION ALL SELECT 'zone-99a81734', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Tamarix_gallica_flores_ArgamasillaCalatrava.jpg', 'Tamaris de France : arbuste aux fines feuilles en écailles, qui supporte le sel. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Javier martinlo, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-ddcf16dc', 'melah', 'https://upload.wikimedia.org/wikipedia/commons/5/55/Arundo_donax_1.jpg', 'Canne de Provence : très grande herbe qui forme des haies au bord de l''eau. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Bouba at French Wikipedia, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-ddcf16dc', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Nerium_oleander_flowers_leaves.jpg', 'Laurier-rose : arbuste des bords d''oued, mortel s''il est ingéré. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Alvesgaspar, CC BY 2.5.', 1
    UNION ALL SELECT 'zone-a014e73f', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Quercus_suber_JPG1.jpg', 'Chêne-liège : arbre à l''écorce épaisse de liège. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Jean-Pol GRANDMONT, CC BY 3.0.', 0
    UNION ALL SELECT 'zone-a014e73f', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Chamaerops_humilis_%28Zingaro%29015.jpg', 'Palmier nain (doum) : palmier sauvage aux feuilles en éventail, très répandu au Maroc. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : tato grasso, CC BY-SA 2.5.', 1
    UNION ALL SELECT 'zone-a70a9cbc', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Tetraclinis_articulata.JPG', 'Thuya de Berbérie : conifère des pentes sèches d''Afrique du Nord. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Cs california, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-a70a9cbc', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Nabeulensis_sarda.JPG', 'Tortue mauresque : tortue terrestre des terrains secs et broussailleux. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Gisella D., CC BY-SA 3.0.', 1
    UNION ALL SELECT 'zone-2e6da88b', 'melah', 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Stork_%28Palic%2C_Serbia%29.jpg', 'Cigogne blanche : grand échassier des champs et des prairies. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Dcabrilo, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-2e6da88b', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Ziziphus_lotus.jpg', 'Jujubier sauvage (sder) : arbuste épineux des terres sèches. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Nanosanchez, domaine public.', 1
    UNION ALL SELECT 'zone-c427e5f0', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Ziziphus_lotus.jpg', 'Jujubier sauvage (sder) : arbuste épineux des terres sèches. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Nanosanchez, domaine public.', 0
    UNION ALL SELECT 'zone-c427e5f0', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Chamaerops_humilis_%28Zingaro%29015.jpg', 'Palmier nain (doum) : palmier sauvage aux feuilles en éventail, très répandu au Maroc. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : tato grasso, CC BY-SA 2.5.', 1
    UNION ALL SELECT 'zone-c987977a', 'melah', 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Stork_%28Palic%2C_Serbia%29.jpg', 'Cigogne blanche : grand échassier des champs et des prairies. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Dcabrilo, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-c987977a', 'melah', 'https://commons.wikimedia.org/wiki/Special:FilePath/Chamaerops_humilis_%28Zingaro%29015.jpg', 'Palmier nain (doum) : palmier sauvage aux feuilles en éventail, très répandu au Maroc. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : tato grasso, CC BY-SA 2.5.', 1
    UNION ALL SELECT 'zone-8dbc6d24', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Eurasian_Coot.jpg', 'Foulque macroule : oiseau d''eau noir au bec et au front blancs. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Noodle snacks, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-8dbc6d24', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Little_Grebe_-_Tachybaptus_ruficollis_15-1.jpg', 'Grèbe castagneux : petit plongeur qui disparaît sous l''eau pour pêcher. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Zeynel Cebeci, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-098eea5e', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lisdodde.jpg', 'Massette à larges feuilles : plante des bords d''eau à l''épi brun en forme de saucisse. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andrawaag, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-098eea5e', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Eurasian_Reed_Warbler.jpg', 'Rousserolle effarvatte : petit passereau brun qui chante caché dans les roseaux. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Ron Knight, CC BY 2.0.', 1
    UNION ALL SELECT 'zone-bf440176', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lisdodde.jpg', 'Massette à larges feuilles : plante des bords d''eau à l''épi brun en forme de saucisse. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andrawaag, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-bf440176', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Common_Moorhen_%28Gallinula_chloropus_pyrrhorrhoa%29%2C_Mauritius.jpg', 'Gallinule poule-d''eau : oiseau d''eau sombre au bec rouge à pointe jaune. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : gailhampshire, CC BY 2.0.', 1
    UNION ALL SELECT 'zone-7c979181', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Eurasian_Reed_Warbler.jpg', 'Rousserolle effarvatte : petit passereau brun qui chante caché dans les roseaux. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Ron Knight, CC BY 2.0.', 0
    UNION ALL SELECT 'zone-7c979181', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Common_Moorhen_%28Gallinula_chloropus_pyrrhorrhoa%29%2C_Mauritius.jpg', 'Gallinule poule-d''eau : oiseau d''eau sombre au bec rouge à pointe jaune. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : gailhampshire, CC BY 2.0.', 1
    UNION ALL SELECT 'zone-95ba0637', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Phragmites_australis_Schilfrohr.jpg', 'Roseau commun : grande graminée qui forme la roselière. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Darkone, CC BY-SA 2.0.', 0
    UNION ALL SELECT 'zone-95ba0637', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Purpurhuhn.jpg', 'Talève sultane : grand oiseau bleu-violet au bec rouge massif. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Andreas Trepte, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-0d65d814', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Himantopus_himantopus_-_Pak_Thale.jpg', 'Échasse blanche : échassier noir et blanc aux très longues pattes roses. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : JJ Harrison, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-0d65d814', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Discoglossus_scovazzi.jpg', 'Discoglosse peint du Maroc : petite grenouille des eaux peu profondes. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Roberto García-Roa, CC BY-SA 3.0.', 1
    UNION ALL SELECT 'zone-dcf77398', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Juncus_acutus2.jpg', 'Jonc piquant : grosses touffes de tiges raides et piquantes. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Esculapio, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-dcf77398', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Zitting_cisticola_2024_04_19_%28cropped%29.jpg', 'Cisticole des joncs : minuscule passereau au chant répété en vol. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Alexis Lours, CC BY 4.0.', 1
    UNION ALL SELECT 'zone-13838750', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Hvid_klit.jpg', 'Oyat : graminée dont les racines retiennent le sable de la dune. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Malene Thyssen, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-13838750', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Pacratium_maritimum_Paestum.jpg', 'Lis de mer : grande fleur blanche de la dune, en fin d''été. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Stemonitis, CC BY-SA 2.5.', 1
    UNION ALL SELECT 'zone-f2a0e240', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/N._broussonetii.JPG', 'Narcisse de Broussonet : narcisse blanc d''automne, propre au Maroc. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Apofisis, CC BY 3.0.', 0
    UNION ALL SELECT 'zone-f2a0e240', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Nabeulensis_sarda.JPG', 'Tortue mauresque : tortue terrestre des terrains secs et broussailleux. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Gisella D., CC BY-SA 3.0.', 1
    UNION ALL SELECT 'zone-39e4ae22', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Roquette_de_mer_%28Cakile_maritima%29.jpg', 'Cakilier maritime : plante charnue du haut de plage. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : JackyM59, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-39e4ae22', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Charadrius_alexandrinus_-_Kentish_Plover_03.jpg', 'Gravelot à collier interrompu : petit échassier qui pond à même le sable. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Zeynel Cebeci, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-8f74bda4', 'dayat', 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Larus_michahellis_familier.jpg', 'Goéland leucophée : grand goéland aux pattes jaunes, omniprésent sur le littoral. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Maisrimer, CC BY-SA 4.0.', 0
    UNION ALL SELECT 'zone-8f74bda4', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/%D0%9A%D1%80%D1%8F%D1%87%D0%BE%D0%BA_%D0%BC%D0%B0%D0%BB%D0%B8%D0%B9.jpg', 'Sterne naine : petite sterne qui pêche en plongeant. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : PetroKaterynych, CC BY 4.0.', 1
    UNION ALL SELECT 'zone-8ecf7544', 'dayat', 'https://upload.wikimedia.org/wikipedia/commons/7/77/Eucalyptus_flowers2.jpg', 'Eucalyptus : arbre australien planté, aux feuilles odorantes. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Fir0002, CC BY-SA 3.0.', 0
    UNION ALL SELECT 'zone-8ecf7544', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Black-crowned_night_heron_in_PP_%2836399%29.jpg', 'Bihoreau gris : héron trapu qui se repose le jour dans les arbres. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Rhododendrites, CC BY-SA 4.0.', 1
    UNION ALL SELECT 'zone-5df6826b', 'dayat', 'https://commons.wikimedia.org/wiki/Special:FilePath/Passer_hispaniolensis_-Canary_Islands%2C_Spain_-female-8_%281%29.jpg', 'Moineau espagnol : moineau des campagnes et des jardins. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : Juan Emilio, CC BY-SA 2.0.', 0
    UNION ALL SELECT 'zone-5df6826b', 'dayat', 'https://upload.wikimedia.org/wikipedia/commons/f/fa/2022-04-06_Streptopelia_decaocto%2C_Plovdiv%2C_Bulgaria_1.jpg', 'Tourterelle turque : tourterelle beige au demi-collier noir. Espèce recensée dans cette zone ; photo d''illustration prise ailleurs. Photo : stevem4560, CC BY 4.0.', 1
  ) v
  JOIN visit_zones z ON z.id = v.zone_id COLLATE utf8mb4_unicode_ci AND z.map_id = v.map_id COLLATE utf8mb4_unicode_ci
 WHERE NOT EXISTS (
         SELECT 1 FROM visit_media x
          WHERE x.target_type = 'zone'
            AND x.target_id = z.id
            AND x.image_url = v.image_url COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 10. Clé « oiseaux-eau-daya », couplet n° 4 : la proposition en double qui menait à la
--     Nette rousse est supprimée, seulement si un AUTRE couplet de la même clé atteint encore
--     cette espèce (elle reste donc identifiable). Sous-requête matérialisée : la table
--     cible ne peut pas être relue directement dans son propre DELETE.
-- ---------------------------------------------------------------------
DELETE FROM id_key_leads
 WHERE id IN (
         SELECT doublon.id
           FROM (
                 SELECT l.id
                   FROM id_key_leads l
                   JOIN id_key_couplets c ON c.id = l.couplet_id AND c.number = 4
                   JOIN id_keys k ON k.id = c.key_id AND k.slug = 'oiseaux-eau-daya'
                   JOIN plants p ON p.id = l.plant_id AND p.name = 'Nette rousse' COLLATE utf8mb4_unicode_ci
                  WHERE l.outcome = 'espece'
                    AND EXISTS (
                          SELECT 1
                            FROM id_key_leads l2
                            JOIN id_key_couplets c2 ON c2.id = l2.couplet_id
                           WHERE c2.key_id = k.id
                             AND c2.number <> 4
                             AND l2.outcome = 'espece'
                             AND l2.plant_id = l.plant_id)
                ) doublon);

-- ---------------------------------------------------------------------
-- 11. Consigne de sécurité de deux clés. L'ancien texte n'a été conservé nulle part : la
--     garde est double, `updated_at` strictement antérieur à l'écriture du 20/11 (heure du
--     serveur de base) ET texte différent de la cible. Une clé retouchée depuis n'est pas
--     écrasée ; en production la ligne porte exactement cette date.
-- ---------------------------------------------------------------------
UPDATE id_keys
   SET safety_note = 'On observe sans toucher : abeilles et guêpes piquent, certaines punaises aussi. L''adulte place l''insecte dans une boîte-loupe, puis le relâche là où il a été trouvé.'
 WHERE slug = 'insectes-ordres'
   AND updated_at < '2026-11-20 10:17:43'
   AND NOT (safety_note <=> 'On observe sans toucher : abeilles et guêpes piquent, certaines punaises aussi. L''adulte place l''insecte dans une boîte-loupe, puis le relâche là où il a été trouvé.');

UPDATE id_keys
   SET safety_note = 'On observe sans saisir l''insecte, dans une boîte-loupe si besoin ; l''adulte le relâche ensuite là où il a été trouvé. Le blaps et le crache-sang se défendent par une odeur forte ou une goutte de liquide : on ne les manipule pas.'
 WHERE slug = 'coleopteres'
   AND updated_at < '2026-11-20 10:17:43'
   AND NOT (safety_note <=> 'On observe sans saisir l''insecte, dans une boîte-loupe si besoin ; l''adulte le relâche ensuite là où il a été trouvé. Le blaps et le crache-sang se défendent par une odeur forte ou une goutte de liquide : on ne les manipule pas.');

-- ---------------------------------------------------------------------
-- 12. Séances guidées. Les étapes « fiche espèce » portent l'identifiant de la fiche : il
--     est posé ici par nom d'espèce (jetons @@P1@@…), jamais recopié de la production.
-- ---------------------------------------------------------------------
-- 12a. « L'eau de nos lieux », publiée. Parents : la carte, la fiche ouverte à l'étape 4 et la
--      question du mini-quiz.
INSERT INTO pedago_sessions
  (id, slug, title, description, level, template_key, map_id, config_json, steps_json, is_published, sort_order)
SELECT 'a1daa869-381f-4aaa-9bc1-ecc246956262', '6e-eau-de-nos-lieux', 'L''eau de nos lieux',
       '6e, chapitre 3 (section III). États et changements d''état de l''eau, mélanges : la cuve de n³, la daya, les oueds Melah et Nfifikh.',
       'college', 'custom', m.id,
       '{"mapId":"dayat","keyIdOrSlug":null,"plantId":null,"plantIds":[],"questionCode":null,"notionId":null,"notionNiveau":null,"termCode":null,"highlightPlantId":null,"individualId":null,"mapRouteSlug":null,"requiresSessionId":null}',
       REPLACE('[{"id":"w1","title":"De la pluie dans une cuve","body":"À n³, une cuve de 1 000 litres recueille la pluie qui tombe sur le toit du bâtiment T. Avant de tomber, cette eau était de la vapeur dans l''air : en se refroidissant, elle s''est condensée en gouttes dans les nuages. Quel changement d''état la vapeur a-t-elle subi ?","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"w2","title":"La daya respire au rythme des saisons","body":"Le plan d''eau de la daya se remplit en hiver grâce à la pluie, au ruissellement et à des sources alimentées par une nappe souterraine. Dès le mois de mai, il recule : l''évaporation, un petit canal et les pompages enlèvent plus d''eau qu''il n''en arrive. Quel changement d''état fait disparaître une partie de l''eau de la daya ?","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"w3","title":"Deux oueds, deux mélanges","body":"L''oued Melah porte bien son nom : certaines sources qui l''alimentent traversent des roches salées, et son eau est un peu salée. Le sel y est dissous : on ne le voit pas. À l''embouchure de l''oued Nfifikh, aux Sablettes, l''eau douce de l''oued se mêle à l''eau de mer : l''eau devient saumâtre. Après une forte pluie, l''eau d''un oued se charge de terre et devient trouble. Lequel de ces mélanges est homogène, lequel est hétérogène ?","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"w4","title":"Une plante qui a besoin d''eau","body":"La massette ne pousse qu''au bord de l''eau, au fond de la vallée de l''oued Melah et dans les typhaies de la daya. Lis sa fiche : que se passerait-il pour elle si la daya restait à sec toute l''année ?","action":{"type":"open_plant","payload":{"plantId":@@P1@@}},"completeWhen":"manual"},{"id":"w5","title":"Mini-quiz","body":"Une question sur le bilan d''eau de la daya.","action":{"type":"open_quiz","payload":{"notionId":null,"notionNiveau":"cycle3","questionCode":"QF9877"}},"completeWhen":"manual"}]', '@@P1@@', p1.id),
       1, 100
  FROM maps m
  JOIN plants p1 ON p1.name = 'Massette' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p1x WHERE p1x.name = 'Massette' COLLATE utf8mb4_unicode_ci) = 1
  JOIN quiz_questions qq ON qq.question_code = 'QF9877'
 WHERE m.id = 'dayat'
   AND NOT EXISTS (SELECT 1 FROM pedago_sessions x WHERE x.slug = '6e-eau-de-nos-lieux' OR x.id = 'a1daa869-381f-4aaa-9bc1-ecc246956262');

-- 12b. « Inventaire de n³ : signale ce que tu as identifié » : créée EN BROUILLON
--      (is_published = 0) et laissée telle quelle. Parents : la carte, la clé de l'étape 2
--      et la question du mini-quiz.
INSERT INTO pedago_sessions
  (id, slug, title, description, level, template_key, map_id, config_json, steps_json, is_published, sort_order)
SELECT 'c610463e-de3a-46d5-b341-00aafceba9da', '6e-inventaire-n3', 'Inventaire de n³ : signale ce que tu as identifié',
       '6e. Séance courte de collecte à n³ : identifier un animal avec la clé, le photographier utilement et signaler l''observation, validée ensuite par le professeur.',
       'college', 'custom', m.id,
       '{"mapId":"n3","keyIdOrSlug":null,"plantId":null,"plantIds":[],"questionCode":null,"notionId":null,"notionNiveau":null,"termCode":null,"highlightPlantId":null,"individualId":null,"mapRouteSlug":null,"requiresSessionId":null}',
       '[{"id":"i1","title":"La règle de l''inventaire","body":"Ton équipe va enrichir l''inventaire de n³. On observe sans toucher, sans cueillir et sans déranger. On photographie l''être vivant, jamais ses camarades.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"i2","title":"Trouver son groupe","body":"Choisis un animal visible sans le déranger et suis la clé jusqu''à son groupe, puis jusqu''à son nom si la clé le permet.","action":{"type":"open_id_key","payload":{"keyIdOrSlug":"animaux-grands-groupes"}},"completeWhen":"manual"},{"id":"i3","title":"Une photo utile","body":"Une photo nette, l''animal en entier, prise en t''approchant lentement. Pour un papillon : le dessus et le dessous des ailes.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"i4","title":"Signaler","body":"Ouvre la fiche de l''espèce et touche « Signaler une observation ». Si tu ne connais pas le nom, choisis « Je ne sais pas » et décris ce que tu as vu. Ton professeur vérifie chaque observation avant qu''elle compte pour l''inventaire.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"i5","title":"Mini-quiz","body":"Une question sur la photo utile pour identifier.","action":{"type":"open_quiz","payload":{"notionId":null,"notionNiveau":"cycle3","questionCode":"QF9918"}},"completeWhen":"manual"}]',
       0, 100
  FROM maps m
  JOIN id_keys ik ON ik.slug = 'animaux-grands-groupes'
  JOIN quiz_questions qq ON qq.question_code = 'QF9918'
 WHERE m.id = 'n3'
   AND NOT EXISTS (SELECT 1 FROM pedago_sessions x WHERE x.slug = '6e-inventaire-n3' OR x.id = 'c610463e-de3a-46d5-b341-00aafceba9da');

-- 12c. Deux séances ramenées de sept à six étapes. L'ancien JSON n'a été conservé nulle
--      part : la garde est la forme d'avant (sept étapes) et la date de l'écriture du 20/11
--      (heure du serveur de base). Parents : les fiches ouvertes par les étapes.
UPDATE pedago_sessions s
  JOIN plants p1 ON p1.name = 'Massette' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p1x WHERE p1x.name = 'Massette' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p2 ON p2.name = 'Lentisque' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p2x WHERE p2x.name = 'Lentisque' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p3 ON p3.name = 'Patelle rustique' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p3x WHERE p3x.name = 'Patelle rustique' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p4 ON p4.name = 'Talitre (puce de mer)' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p4x WHERE p4x.name = 'Talitre (puce de mer)' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = REPLACE(REPLACE(REPLACE(REPLACE('[{"id":"p2","title":"Au bord de l''oued : la massette","body":"Dans un même paysage, les êtres vivants ne sont pas répartis au hasard. La massette pousse au fond de la vallée, au bord de l''oued Melah. Que dit sa fiche de son milieu de vie ?","action":{"type":"open_plant","payload":{"plantId":@@P1@@}},"completeWhen":"manual"},{"id":"p3","title":"Sur les versants : le lentisque","body":"Le lentisque pousse sur les versants de la vallée, dans le matorral. Compare avec la massette : qu''est-ce qui change d''un endroit à l''autre ?","action":{"type":"open_plant","payload":{"plantId":@@P2@@}},"completeWhen":"manual"},{"id":"p4","title":"Sur les rochers : la patelle","body":"La patelle reste fixée aux rochers de l''estran des Sablettes, recouverts par la mer à marée haute.","action":{"type":"open_plant","payload":{"plantId":@@P3@@}},"completeWhen":"manual"},{"id":"p5","title":"Dans le sable : le talitre","body":"Le talitre, ou puce de mer, vit dans le sable du haut de la plage, sous les algues rejetées par la mer.","action":{"type":"open_plant","payload":{"plantId":@@P4@@}},"completeWhen":"manual"},{"id":"p6","title":"Ta conclusion","body":"Pour chaque espèce, écris le paramètre physique qui explique sa place : la quantité d''eau, la nature du sol (rocher ou sable), le temps passé sous la mer, l''ensoleillement.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"p7","title":"Mini-quiz","body":"Une question sur le peuplement des milieux.","action":{"type":"open_quiz","payload":{"notionId":"C3-ENV","notionNiveau":"cycle3","questionCode":null}},"completeWhen":"manual"}]', '@@P1@@', p1.id), '@@P2@@', p2.id), '@@P3@@', p3.id), '@@P4@@', p4.id)
 WHERE s.slug = '6e-pas-la-par-hasard'
   AND JSON_LENGTH(s.steps_json) = 7
   AND s.updated_at < '2026-11-20 10:18:29'
   AND NOT (s.steps_json <=> REPLACE(REPLACE(REPLACE(REPLACE('[{"id":"p2","title":"Au bord de l''oued : la massette","body":"Dans un même paysage, les êtres vivants ne sont pas répartis au hasard. La massette pousse au fond de la vallée, au bord de l''oued Melah. Que dit sa fiche de son milieu de vie ?","action":{"type":"open_plant","payload":{"plantId":@@P1@@}},"completeWhen":"manual"},{"id":"p3","title":"Sur les versants : le lentisque","body":"Le lentisque pousse sur les versants de la vallée, dans le matorral. Compare avec la massette : qu''est-ce qui change d''un endroit à l''autre ?","action":{"type":"open_plant","payload":{"plantId":@@P2@@}},"completeWhen":"manual"},{"id":"p4","title":"Sur les rochers : la patelle","body":"La patelle reste fixée aux rochers de l''estran des Sablettes, recouverts par la mer à marée haute.","action":{"type":"open_plant","payload":{"plantId":@@P3@@}},"completeWhen":"manual"},{"id":"p5","title":"Dans le sable : le talitre","body":"Le talitre, ou puce de mer, vit dans le sable du haut de la plage, sous les algues rejetées par la mer.","action":{"type":"open_plant","payload":{"plantId":@@P4@@}},"completeWhen":"manual"},{"id":"p6","title":"Ta conclusion","body":"Pour chaque espèce, écris le paramètre physique qui explique sa place : la quantité d''eau, la nature du sol (rocher ou sable), le temps passé sous la mer, l''ensoleillement.","action":{"type":"message","payload":{}},"completeWhen":"manual"},{"id":"p7","title":"Mini-quiz","body":"Une question sur le peuplement des milieux.","action":{"type":"open_quiz","payload":{"notionId":"C3-ENV","notionNiveau":"cycle3","questionCode":null}},"completeWhen":"manual"}]', '@@P1@@', p1.id), '@@P2@@', p2.id), '@@P3@@', p3.id), '@@P4@@', p4.id));

UPDATE pedago_sessions s
  JOIN plants p1 ON p1.name = 'Tomate' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p1x WHERE p1x.name = 'Tomate' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p2 ON p2.name = 'Ail' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p2x WHERE p2x.name = 'Ail' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p3 ON p3.name = 'Romarin' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p3x WHERE p3x.name = 'Romarin' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p4 ON p4.name = 'Hirondelle de fenêtre' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p4x WHERE p4x.name = 'Hirondelle de fenêtre' COLLATE utf8mb4_unicode_ci) = 1
  JOIN plants p5 ON p5.name = 'Rougequeue noir' COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants p5x WHERE p5x.name = 'Rougequeue noir' COLLATE utf8mb4_unicode_ci) = 1
   SET s.steps_json = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE('[{"id":"m2","title":"La tomate, une annuelle","body":"À Casablanca, l''hiver est doux, mais les êtres vivants changent quand même au fil de l''année. La tomate est une plante annuelle : elle vit moins d''un an. Sous quelle forme l''espèce traverse-t-elle la mauvaise saison ?","action":{"type":"open_plant","payload":{"plantId":@@P1@@}},"completeWhen":"manual"},{"id":"m3","title":"L''ail, une vivace à bulbe","body":"L''ail est vivace : il se conserve d''une année sur l''autre grâce à son bulbe, fait de caïeux. Où se trouve cet organe ?","action":{"type":"open_plant","payload":{"plantId":@@P2@@}},"completeWhen":"manual"},{"id":"m4","title":"Le romarin, un arbuste toujours vert","body":"Le romarin est un arbuste vivace qui garde ses feuilles toute l''année.","action":{"type":"open_plant","payload":{"plantId":@@P3@@}},"completeWhen":"manual"},{"id":"m5","title":"L''hirondelle de fenêtre part","body":"L''hirondelle de fenêtre niche au lycée au printemps et en été, puis part passer l''hiver plus au sud, en Afrique : c''est une migratrice.","action":{"type":"open_plant","payload":{"plantId":@@P4@@}},"completeWhen":"manual"},{"id":"m6","title":"Le rougequeue noir arrive","body":"Le rougequeue noir fait l''inverse : il vient d''Europe passer l''hiver chez nous. Pour lui, Casablanca est un refuge pendant la mauvaise saison.","action":{"type":"open_plant","payload":{"plantId":@@P5@@}},"completeWhen":"manual"},{"id":"m7","title":"Mini-quiz","body":"Une question sur le développement des êtres vivants.","action":{"type":"open_quiz","payload":{"notionId":"C3-DEVREPRO","notionNiveau":"cycle3","questionCode":null}},"completeWhen":"manual"}]', '@@P1@@', p1.id), '@@P2@@', p2.id), '@@P3@@', p3.id), '@@P4@@', p4.id), '@@P5@@', p5.id)
 WHERE s.slug = '6e-mauvaise-saison'
   AND JSON_LENGTH(s.steps_json) = 7
   AND s.updated_at < '2026-11-20 10:18:51'
   AND NOT (s.steps_json <=> REPLACE(REPLACE(REPLACE(REPLACE(REPLACE('[{"id":"m2","title":"La tomate, une annuelle","body":"À Casablanca, l''hiver est doux, mais les êtres vivants changent quand même au fil de l''année. La tomate est une plante annuelle : elle vit moins d''un an. Sous quelle forme l''espèce traverse-t-elle la mauvaise saison ?","action":{"type":"open_plant","payload":{"plantId":@@P1@@}},"completeWhen":"manual"},{"id":"m3","title":"L''ail, une vivace à bulbe","body":"L''ail est vivace : il se conserve d''une année sur l''autre grâce à son bulbe, fait de caïeux. Où se trouve cet organe ?","action":{"type":"open_plant","payload":{"plantId":@@P2@@}},"completeWhen":"manual"},{"id":"m4","title":"Le romarin, un arbuste toujours vert","body":"Le romarin est un arbuste vivace qui garde ses feuilles toute l''année.","action":{"type":"open_plant","payload":{"plantId":@@P3@@}},"completeWhen":"manual"},{"id":"m5","title":"L''hirondelle de fenêtre part","body":"L''hirondelle de fenêtre niche au lycée au printemps et en été, puis part passer l''hiver plus au sud, en Afrique : c''est une migratrice.","action":{"type":"open_plant","payload":{"plantId":@@P4@@}},"completeWhen":"manual"},{"id":"m6","title":"Le rougequeue noir arrive","body":"Le rougequeue noir fait l''inverse : il vient d''Europe passer l''hiver chez nous. Pour lui, Casablanca est un refuge pendant la mauvaise saison.","action":{"type":"open_plant","payload":{"plantId":@@P5@@}},"completeWhen":"manual"},{"id":"m7","title":"Mini-quiz","body":"Une question sur le développement des êtres vivants.","action":{"type":"open_quiz","payload":{"notionId":"C3-DEVREPRO","notionNiveau":"cycle3","questionCode":null}},"completeWhen":"manual"}]', '@@P1@@', p1.id), '@@P2@@', p2.id), '@@P3@@', p3.id), '@@P4@@', p4.id), '@@P5@@', p5.id));

-- 12d. « Reconnaître sans toucher » : la clé de la séance devient « arbres-palmiers ». Garde : aucune clé
--      n'était réglée (les deux écritures JSON possibles), et la clé existe.
UPDATE pedago_sessions
   SET config_json = REPLACE(REPLACE(config_json,
         '"keyIdOrSlug":null', '"keyIdOrSlug":"arbres-palmiers"'),
         '"keyIdOrSlug": null', '"keyIdOrSlug": "arbres-palmiers"')
 WHERE slug = 'college-reconaitre-sans-toucher'
   AND (config_json LIKE '%"keyIdOrSlug":null%' OR config_json LIKE '%"keyIdOrSlug": null%')
   AND EXISTS (SELECT 1 FROM id_keys k WHERE k.slug = 'arbres-palmiers');

-- ---------------------------------------------------------------------
-- 13. Deux photos ajoutées par lien, proposées et non confirmées. Parent : la fiche (par nom).
-- ---------------------------------------------------------------------
INSERT INTO plant_photos (plant_id, kind, url, credit, licence, source, source_url, sort_order, confirmed)
SELECT p.id, v.kind, v.url, v.credit, v.licence, v.source, v.source_url, v.sort_order, v.confirmed
  FROM (
    SELECT 'Phytoplancton' AS plant_name, 'photo' AS kind, 'https://upload.wikimedia.org/wikipedia/commons/3/31/Diatoms_through_the_microscope.jpg' AS url, 'Gordon T. Taylor (NOAA)' AS credit, 'Domaine public' AS licence, 'wikimedia_commons' AS source, 'https://commons.wikimedia.org/wiki/File:Diatoms_through_the_microscope.jpg' AS source_url, 0 AS sort_order, 0 AS confirmed
    UNION ALL SELECT 'Zooplancton', 'photo', 'https://commons.wikimedia.org/wiki/Special:FilePath/Calanoides_acutus.jpg', 'Valerie Loeb (NOAA)', 'Domaine public', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Calanoides_acutus.jpg', 0, 0
  ) v
  JOIN plants p ON p.name = v.plant_name COLLATE utf8mb4_unicode_ci
   AND (SELECT COUNT(*) FROM plants px WHERE px.name = v.plant_name COLLATE utf8mb4_unicode_ci) = 1
 WHERE NOT EXISTS (
         SELECT 1 FROM plant_photos x WHERE x.plant_id = p.id AND x.url = v.url COLLATE utf8mb4_unicode_ci);

-- ---------------------------------------------------------------------
-- 14. Registre de présence : Gracilaire cervicorne sur la carte sablettes, de « documentaire »
--     (valeur d'avant, lue dans le journal d'audit) à « a_confirmer ».
-- ---------------------------------------------------------------------
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id AND p.name = 'Gracilaire cervicorne' COLLATE utf8mb4_unicode_ci
   SET ms.validation_status = 'a_confirmer'
 WHERE ms.map_id = 'sablettes'
   AND ms.validation_status <=> 'documentaire';

-- ---------------------------------------------------------------------
-- 15. Suppression décidée le 21/11/2026 (elle n'a PAS été faite le 20/11 : ce bloc est le
--     seul qui agit en production, sur trois couples tutoriel-question). Les trois
--     questions retirées qui validaient un tutoriel gardaient leur lien bloquant ; leurs
--     nouvelles versions portent désormais ce lien (bloc 7). Tutoriel résolu par le slug de
--     production, à défaut par celui du dépôt ; rien n'est supprimé tant que la question
--     est active.
--     EXCEPTION, limitée à ces trois lignes : le jumeau de chaque lien est aussi supprimé
--     de la table historique figée quiz_question_tutorials. Sans cela, le contrôle de
--     retrait de cette table (« lien historique absent de la source unique ») passerait de
--     0 à 3. Le jumeau part en premier : entre les deux instructions le contrôle reste à 0.
--     Forme : EXISTS corrélé, tutoriel résolu par deux jointures externes (slug unique).
--     L'ancienne forme (tables dérivées imbriquées, sous-requête corrélée dans un ON) donnait
--     le même résultat mais MariaDB 11.4 la refusait à la seconde exécution d'une instruction
--     préparée (« Unknown column 'v.ref' ») : les tests de rejeu échouaient en CI.
-- ---------------------------------------------------------------------
DELETE FROM quiz_question_tutorials
 WHERE EXISTS (
         SELECT 1
           FROM (
            SELECT 'les-semences' AS ref, 'semences' AS slug_depot, 'QF0062' AS question_code
            UNION ALL SELECT 'le-rempotage', 'rempotage', 'QF9213'
            UNION ALL SELECT 'le-rempotage', 'rempotage', 'QF9214'
                ) v
           JOIN quiz_questions qq ON qq.question_code = v.question_code COLLATE utf8mb4_unicode_ci
            AND qq.statut <> 'actif'
           LEFT JOIN tutorials tp ON tp.slug = v.ref COLLATE utf8mb4_unicode_ci
           LEFT JOIN tutorials td ON td.slug = v.slug_depot COLLATE utf8mb4_unicode_ci
          WHERE qq.question_code = quiz_question_tutorials.question_code
            AND COALESCE(tp.id, td.id) = quiz_question_tutorials.tutorial_id);

DELETE FROM resource_question_links
 WHERE resource_type = 'tutorial'
   AND EXISTS (
         SELECT 1
           FROM (
            SELECT 'les-semences' AS ref, 'semences' AS slug_depot, 'QF0062' AS question_code
            UNION ALL SELECT 'le-rempotage', 'rempotage', 'QF9213'
            UNION ALL SELECT 'le-rempotage', 'rempotage', 'QF9214'
                ) v
           JOIN quiz_questions qq ON qq.question_code = v.question_code COLLATE utf8mb4_unicode_ci
            AND qq.statut <> 'actif'
           LEFT JOIN tutorials tp ON tp.slug = v.ref COLLATE utf8mb4_unicode_ci
           LEFT JOIN tutorials td ON td.slug = v.slug_depot COLLATE utf8mb4_unicode_ci
          WHERE qq.question_code = resource_question_links.question_code
            AND CAST(COALESCE(tp.id, td.id) AS CHAR) = resource_question_links.resource_ref);
