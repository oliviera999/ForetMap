-- Recuration espèces + glossaire ForetMap.
-- 1) QCM de rôle pour les ajouts 223–225 et les nœuds-nourriture
-- 2) Purge des liens importés dont le libellé n’apparaît ni dans l’énoncé ni dans la bonne réponse
-- 3) Liens transversaux (plante + glossaire + tuto déjà recuré)
-- 4) is_gating = 1 sur les approved restants (hors origin auto / suggested)

INSERT IGNORE INTO quiz_questions
(question_code, categorie_slug, numero_dans_categorie, question,
 choix_a, choix_b, choix_c, choix_d, choix_e,
 reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
 feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
 notes_pedagogiques, tags, statut, created_at, updated_at)
VALUES
('QF9250','plantes_biologie',9250,
 'Le Rhizobium enrichit le sol en azote. Quelle lecture est la plus juste ?',
 'Ce sont surtout les bactéries dans les nodosités des légumineuses qui fixent le diazote (N2)',
 'La plante fabrique l’azote toute seule dans ses feuilles',
 'Le Rhizobium chasse les pucerons',
 'Toute légumineuse empêche toute carence, partout',
 NULL,'A','Fixation biologique = partenariat Rhizobium / légumineuse',
 'college',2,'⭐⭐ Moyen',
 'Sans la bactérie, la plante n’« invente » pas l’azote de l’air.',
 'Oui. Les nodosités sont l’atelier de la fixation.',
 'Non. Les feuilles font surtout la photosynthèse.',
 'Non. Ce n’est pas un prédateur de pucerons.',
 'Non. Aucune association ne garantit l’absence de carence.',
 NULL,'Complète QF9109.','rhizobium, nodosite, azote','actif',NOW(),NOW()),
('QF9251','ravageurs_auxiliaires',9251,
 'Pourquoi la coccinelle à sept points est-elle une alliée au potager ?',
 'Ses larves et adultes consomment surtout des pucerons',
 'Elle pollinise exclusivement les tomates',
 'Elle fixe l’azote comme un Rhizobium',
 'Elle décompose le bois mort',
 NULL,'A','Coccinelle = prédatrice de pucerons',
 'college',1,'⭐ Facile',
 'Un auxiliaire se juge à ce qu’il mange, pas à sa couleur.',
 'Oui. C’est le rôle classique au jardin lycée.',
 'Non. La pollinisation n’est pas son métier principal.',
 'Non. La fixation d’azote est microbienne.',
 'Non. Les décomposeurs du bois sont surtout des champignons.',
 NULL,'Auxiliaire.','coccinelle, puceron, predacion','actif',NOW(),NOW()),
('QF9252','ravageurs_auxiliaires',9252,
 'Le syrphe adulte butine, sa larve…',
 'chasse surtout des pucerons',
 'fixe le diazote dans le sol',
 'tisse une toile pour les aleurodes',
 'nitrifie l’ammonium',
 NULL,'A','Syrphe : adulte pollinisateur, larve aphidiphage',
 'college',2,'⭐⭐ Moyen',
 'Deux métiers selon l’âge : nectar puis pucerons.',
 'Oui. D’où l’intérêt des fleurs (souci, capucine) près des cultures.',
 'Non. Ce n’est pas un Rhizobium.',
 'Non. Les toiles, c’est plutôt une araignée.',
 'Non. La nitrification est bactérienne.',
 NULL,'Syrphe.','syrphe, puceron, pollinisation','actif',NOW(),NOW()),
('QF9253','ravageurs_auxiliaires',9253,
 'La cochenille de la figue de Barbarie se nourrit surtout…',
 'de la sève du figuier de Barbarie (Opuntia)',
 'de pucerons',
 'de litière de feuilles uniquement',
 'de nectar de lavande',
 NULL,'A','Herbivore spécialiste de l’Opuntia',
 'college',2,'⭐⭐ Moyen',
 'Un ravageur se lit avec sa plante-hôte, pas « contre tout le jardin ».',
 'Oui. Lien figuier de Barbarie ↔ cochenille.',
 'Non. Manger des pucerons, c’est un prédateur.',
 'Non. Ce n’est pas un détritivore de litière.',
 'Non. La lavande attire plutôt les pollinisateurs.',
 NULL,'Figue de Barbarie.','cochenille, opuntia, barbarie','actif',NOW(),NOW()),
('QF9254','ravageurs_auxiliaires',9254,
 'Le carabe doré est surtout utile parce qu’il…',
 'chasse limaces et escargots au sol',
 'pollinise les fruitiers la nuit',
 'fixe l’azote sur les fèves',
 'fabrique du compost à lui seul',
 NULL,'A','Carabe = prédateur de mollusques',
 'college',1,'⭐ Facile',
 'Allié du potager, à ne pas confondre avec un ravageur « parce que c’est un insecte ».',
 'Oui. Il chasse au sol, souvent la nuit.',
 'Non. Ce n’est pas son rôle principal.',
 'Non. Encore une fois, la fixation est microbienne.',
 'Non. Il ne remplace pas le tas de compost.',
 NULL,'Carabe.','carabe, limace, escargot','actif',NOW(),NOW()),
('QF9255','ravageurs_auxiliaires',9255,
 'Le perce-oreille (forficule) au potager…',
 'mange souvent pucerons et petits ravageurs, tout en pouvant grignoter des fruits mûrs',
 'est uniquement un ravageur, jamais un auxiliaire',
 'nitrifie le sol comme Nitrosomonas',
 'ne se nourrit que de nectar',
 NULL,'A','Auxiliaire imparfait : utile et parfois gourmand',
 'college',2,'⭐⭐ Moyen',
 'On le juge au régime réel, pas à une étiquette unique.',
 'Oui. C’est un allié à surveiller près des fruits très mûrs.',
 'Non. Le réduire à « nuisible » est trop simple.',
 'Non. Pas une bactérie nitrifiante.',
 'Non. Ce n’est pas un papillon butineur.',
 NULL,'Perce-oreille.','perce-oreille, puceron, auxiliaire','actif',NOW(),NOW()),
('QF9256','sol_compost',9256,
 'Les mycorhizes à Glomus, c’est surtout…',
 'un partenariat : le champignon élargit l’absorption, la plante cède une part de ses sucres',
 'un prédateur de vers de terre',
 'un engrais chimique de synthèse',
 'une maladie qui tue toutes les racines',
 NULL,'A','Symbiose mycorhizienne (Glomus)',
 'college',2,'⭐⭐ Moyen',
 'Pendant du Rhizobium : ici un champignon, pas une bactérie, et plutôt phosphore / eau.',
 'Oui. Labour et fongicides cassent ce réseau.',
 'Non. Ce n’est pas une prédation.',
 'Non. Ce n’est pas un produit en sac.',
 'Non. Une mycorhize fonctionnelle n’est pas une pourriture.',
 NULL,'Glomus.','mycorhize, glomus, symbiose','actif',NOW(),NOW()),
('QF9257','ravageurs_auxiliaires',9257,
 'Hirondelle rustique ou pipistrelle : quel service rendent-elles au-dessus d’une mare ?',
 'Elles chassent surtout des insectes volants, dont des moustiques adultes',
 'Elles fixent l’azote de l’eau',
 'Elles pollinisent les nénuphars la nuit',
 'Elles décomposent la vase',
 NULL,'A','Prédateurs aériens de moustiques',
 'college',1,'⭐ Facile',
 'La gambusie agit dans l’eau (larves) ; hirondelle et chauve-souris, dans l’air (adultes).',
 'Oui. Deux étages du même réseau.',
 'Non. Pas de fixation d’azote ici.',
 'Non. Ce n’est pas leur rôle.',
 'Non. La vase, ce sont plutôt des décomposeurs aquatiques.',
 NULL,'Mare et vol.','hirondelle, pipistrelle, moustique','actif',NOW(),NOW()),
('QF9258','ravageurs_auxiliaires',9258,
 'Le crapaud de Maurétanie aide surtout le jardin en…',
 'mangeant limaces, insectes et autres petites proies au sol',
 'pollinisant les courges',
 'fixant N2 dans ses glandes',
 'fabriquant de l’humus comme un champignon',
 NULL,'A','Crapaud = prédateur nocturne du sol',
 'college',1,'⭐ Facile',
 'Un point d’eau et des cachettes valent mieux qu’un pesticide « anti-limaces ».',
 'Oui. Allié discret, surtout à la tombée du jour.',
 'Non. Ce n’est pas un pollinisateur de courges.',
 'Non. Encore une confusion avec les bactéries.',
 'Non. Il n’est pas un décomposeur.',
 NULL,'Crapaud.','crapaud, limace, mare','actif',NOW(),NOW()),
('QF9259','ravageurs_auxiliaires',9259,
 'Le merle noir au jardin…',
 'retourne la litière et mange vers, insectes, parfois des fruits',
 'ne se nourrit que de nectar',
 'nitrifie l’ammonium',
 'est un décomposeur de bois mort',
 NULL,'A','Merle = omnivore utile (et parfois gourmand en fruits)',
 'college',2,'⭐⭐ Moyen',
 'Comme le perce-oreille : allié du sol, à accepter aussi quand il goûte une baie.',
 'Oui. Bec et litière : il « laboure » sans charrue.',
 'Non. Ce n’est pas un colibri.',
 'Non. Processus microbien.',
 'Non. Les champignons de litière s’occupent du bois.',
 NULL,'Merle.','merle, vers, fruits','actif',NOW(),NOW()),
('QF9260','ecologie_reseaux',9260,
 'Dans une mare, pourquoi daphnie, larve de libellule et gerris ne font-ils pas le même métier ?',
 'La daphnie filtre le plancton, la larve de libellule chasse, le gerris capte des proies à la surface',
 'Les trois nitrifient l’eau',
 'Les trois ne mangent que des plantes aquatiques',
 'Aucun n’a de prédateur',
 NULL,'A','Trois niches : filtreur, prédateur immergé, prédateur de surface',
 'college',2,'⭐⭐ Moyen',
 'La gambusie n’est plus seule : la mare a plusieurs étages alimentaires.',
 'Oui. Un réseau, pas une seule espèce « utile ».',
 'Non. La nitrification reste microbienne.',
 'Non. Ce ne sont pas trois herbivores.',
 'Non. Ils ont eux-mêmes des prédateurs.',
 NULL,'Mare.','daphnie, libellule, gerris','actif',NOW(),NOW()),
('QF9261','sol_compost',9261,
 'Pourquoi distinguer le ver de lombricompost (Eisenia) du lombric commun (Lumbricus) ?',
 'Eisenia vit surtout dans la matière organique en décomposition ; Lumbricus creuse des galeries plus profondes dans le sol',
 'Ce sont deux noms pour le même animal, toujours',
 'Lumbricus ne mange que des pucerons',
 'Eisenia oxyde l’ammonium en nitrate',
 NULL,'A','Deux vers, deux milieux',
 'college',2,'⭐⭐ Moyen',
 'Le composteur n’héberge pas le même « métier » qu’une prairie de vers anéciques.',
 'Oui. Surface / compost vs galeries profondes.',
 'Non. Les fiches sont volontairement séparées.',
 'Non. Ni l’un ni l’autre n’est un prédateur de pucerons.',
 'Non. La nitrification n’est pas leur rôle.',
 NULL,'Eisenia vs Lumbricus.','lombric, eisenia, compost','actif',NOW(),NOW()),
('QF9262','ravageurs_auxiliaires',9262,
 'Le staphylin odorant, dans le sol ou le compost, est surtout…',
 'un prédateur de petits invertébrés (larves, acariens…)',
 'un pollinisateur de lavande',
 'un producteur photosynthétique',
 'un nœud-nourriture inerte',
 NULL,'A','Staphylin = auxiliaire du sol',
 'college',2,'⭐⭐ Moyen',
 'Moins célèbre que la coccinelle, même logique : il mange ce qui pullule dans la litière.',
 'Oui. Prédateur de la faune du sol.',
 'Non. Ce n’est pas un syrphe adulte.',
 'Non. Pas une plante.',
 'Non. C’est un organisme, pas une ressource-nourriture.',
 NULL,'Staphylin.','staphylin, sol, predacion','actif',NOW(),NOW()),
('QF9263','ecologie_reseaux',9263,
 'Sureau et lierre sont gardés au jardin lycée surtout parce qu’ils…',
 'offrent nectar, baies ou abri, et finissent en litière',
 'remplacent à eux seuls tout le compost',
 'fixent N2 comme le Rhizobium',
 'chassent les limaces',
 NULL,'A','Plantes sauvages utiles : ressources pour la faune + litière',
 'college',1,'⭐ Facile',
 'Pas besoin de sortir du lycée pour avoir nectar et baies.',
 'Oui. Haie et mur deviennent des pièces du réseau.',
 'Non. Ils nourrissent le réseau, ils ne le remplacent pas.',
 'Non. Ce ne sont pas des légumineuses à nodosités.',
 'Non. Ce n’est pas leur métier.',
 NULL,'Sauvages utiles.','sureau, lierre, litiere','actif',NOW(),NOW()),
('QF9264','sol_compost',9264,
 'Ortie et pissenlit, lus comme bio-indicateurs…',
 'l’ortie signale souvent un sol riche en azote ; le pissenlit, un sol compacté',
 'les deux signalent toujours un sol stérile',
 'l’ortie indique le calcaire, le pissenlit l’ombre',
 'il faut les éradiquer avant de lire le sol',
 NULL,'A','Lire avant d’arracher',
 'college',2,'⭐⭐ Moyen',
 'Même idée que dans les fiches désherbage et « Lire son sol ».',
 'Oui. La « mauvaise herbe » est d’abord une information.',
 'Non. Elles poussent justement dans des sols qui « disent » quelque chose.',
 'Non. Ce n’est pas le dictionnaire de ces deux fiches.',
 'Non. On observe d’abord.',
 NULL,'Bio-indicatrices.','ortie, pissenlit, indicateur','actif',NOW(),NOW()),
('QF9265','plantes_biologie',9265,
 'Tillandsia et volubilis poussent-ils de la même façon ?',
 'Non : le tillandsia capte surtout l’humidité de l’air ; le volubilis grimpe et s’enracine dans le sol',
 'Oui : les deux sont des cactus du désert',
 'Oui : les deux fixent N2 dans l’eau',
 'Non : le volubilis est un champignon',
 NULL,'A','Épiphyte vs liane enracinée',
 'college',2,'⭐⭐ Moyen',
 'Deux « plantes du lycée » pour parler d’enracinement, pas deux copies.',
 'Oui. L’une est aérienne, l’autre s’accroche et puise au sol.',
 'Non. Ni l’un ni l’autre n’est un cactus typique (le figuier de Barbarie, si).',
 'Non. Pas de fixation aquatique ici.',
 'Non. Le volubilis est une plante à fleurs.',
 NULL,'Tillandsia / volubilis.','tillandsia, volubilis, epiphyte','actif',NOW(),NOW()),
('QF9266','ravageurs_auxiliaires',9266,
 'Hérisson d’Algérie ou hérisson commun : que mangent-ils surtout au jardin ?',
 'Escargots, insectes, parfois des vers — ce sont des prédateurs / opportunistes',
 'Uniquement du nectar',
 'Uniquement de la litière morte, comme un champignon',
 'Rien : ce sont des décomposeurs stricts',
 NULL,'A','Hérisson = auxiliaire des mollusques',
 'college',1,'⭐ Facile',
 'Un tas de bois et moins de granulés anti-limaces leur laissent de la place.',
 'Oui. Alliés discrets, surtout la nuit.',
 'Non. Pas des pollinisateurs.',
 'Non. Ils ingèrent des proies, ils ne minéralisent pas comme un champignon.',
 'Non. Ce ne sont pas des décomposeurs.',
 NULL,'Hérisson.','herisson, escargot, auxiliaire','actif',NOW(),NOW()),
('QF9267','ravageurs_auxiliaires',9267,
 'La chrysope verte est recherchée au potager parce que…',
 'ses larves consomment surtout des pucerons',
 'elle laboure le sol comme un vers',
 'elle produit du nitrate',
 'elle pollinise uniquement la nuit, jamais le jour',
 NULL,'A','Chrysope = larves aphidiphages',
 'college',1,'⭐ Facile',
 'Même service que coccinelle et syrphe, autre silhouette.',
 'Oui. L’adulte est plus discret ; la larve fait le travail.',
 'Non. Ce n’est pas un lombric.',
 'Non. Pas une bactérie.',
 'Non. Ce n’est pas le point de la fiche.',
 NULL,'Chrysope.','chrysope, puceron, auxiliaire','actif',NOW(),NOW()),
('QF9268','ecologie_reseaux',9268,
 'Collembole et litière de feuilles : quelle relation est la plus juste ?',
 'Le collembole est un détritivore : il fragmente la litière, il ne « chasse » pas les arbres',
 'Le collembole photosynthétise la litière',
 'La litière est un prédateur du collembole',
 'Les deux nitrifient l’eau de la mare',
 NULL,'A','Détritivore → nœud-nourriture nommé',
 'college',2,'⭐⭐ Moyen',
 'On a retiré le nœud flou « Environnement » : la flèche pointe vers une ressource réelle.',
 'Oui. Litière = nourriture, pas un être vivant à « observer » comme une espèce.',
 'Non. Pas de photosynthèse chez le collembole.',
 'Non. La litière n’est pas un organisme prédateur.',
 'Non. Hors sujet mare / nitrification.',
 NULL,'Nœud litière.','collembole, litiere, detritivore','actif',NOW(),NOW()),
('QF9269','ravageurs_auxiliaires',9269,
 'Capucine et souci près des légumes : à quoi servent-ils surtout ?',
 'Fleurs pour auxiliaires (syrphes, chrysopes) et, pour le souci, un effet connu contre certains nématodes',
 'Remplacer toute irrigation',
 'Tuer les vers de terre',
 'Fixer N2 à la place du haricot',
 NULL,'A','Fleurs-pièges / fleurs-refuges',
 'college',2,'⭐⭐ Moyen',
 'Le souci a besoin de rester 2–3 mois pour les nématodes (fiche associations).',
 'Oui. Biodiversité fonctionnelle, pas décoration seule.',
 'Non. Elles n’économisent pas toute l’eau.',
 'Non. On veut les vers.',
 'Non. La fixation reste l’affaire des légumineuses + Rhizobium.',
 NULL,'Fleurs utiles.','capucine, souci, auxiliaires','actif',NOW(),NOW()),
('QF9270','plantes_biologie',9270,
 'Olivier, arganier, caroubier : pourquoi les avoir au catalogue d’un lycée méditerranéen ?',
 'Ce sont des ligneux adaptés à la sécheresse, utiles pour parler sol pauvre, ombre et usages locaux',
 'Ce sont des poissons d’aquaponie',
 'Ils hibernent sous la neige de toundra',
 'Ils remplacent les bactéries nitrifiantes',
 NULL,'A','Flore méditerranéenne / marocaine du jardin',
 'college',1,'⭐ Facile',
 'Le catalogue n’est plus seulement « potager tempéré d’Europe ».',
 'Oui. Paysage et usages, pas une liste exotique hors-sol.',
 'Non. Rien à voir avec l’aquaponie.',
 'Non. Ce ne sont pas des espèces de toundra.',
 'Non. Ils n’oxydent pas l’ammonium.',
 NULL,'Méditerranée.','olivier, arganier, caroubier','actif',NOW(),NOW()),
('QF9271','sol_compost',9271,
 '« Compost et épluchures » dans le réseau, ce n’est pas une espèce. C’est…',
 'une ressource-nourriture pour des détritivores (vers de compost, cloportes…)',
 'un prédateur de pucerons',
 'un producteur photosynthétique',
 'un terme de glossaire obligatoire',
 NULL,'A','Nœud-nourriture, pas un organisme à observer',
 'college',1,'⭐ Facile',
 'On valide une lecture du réseau, pas une « observation d’espèce compost ».',
 'Oui. La flèche part du détritivore vers cette ressource.',
 'Non. Le compost ne chasse pas.',
 'Non. Il ne fait pas de photosynthèse.',
 'Non. Ce n’est pas un article de glossaire.',
 NULL,'Nœud compost.','compost, detritivore, reseau','actif',NOW(),NOW()),
('QF9272','ecologie_reseaux',9272,
 'Bois mort et champignons de litière : qui fait quoi ?',
 'Le bois mort est la ressource ; les champignons la dégradent chimiquement (lignine)',
 'Le bois mort chasse les champignons',
 'Les champignons photosynthétisent le bois',
 'Les deux sont des prédateurs de merles',
 NULL,'A','Décomposition de la lignine',
 'college',2,'⭐⭐ Moyen',
 'Les bactéries seules peinent sur le bois : d’où le BRF et les champignons saprophytes.',
 'Oui. Ressource → décomposeur, pas l’inverse.',
 'Non. Le bois n’est pas un prédateur.',
 'Non. Les champignons de litière n’ont pas de chlorophylle utile ici.',
 'Non. Hors sujet.',
 NULL,'Bois mort.','bois mort, champignon, lignine','actif',NOW(),NOW());

-- Purge glossaire : libellé absent de l’énoncé, de la bonne réponse et des tags.
DELETE qqg
  FROM quiz_question_glossary qqg
  INNER JOIN quiz_questions q ON q.question_code = qqg.question_code
  INNER JOIN glossary_terms g ON g.glossary_code = qqg.glossary_code
 WHERE CHAR_LENGTH(TRIM(g.terme)) >= 5
   AND LOWER(CONCAT_WS(' ', q.question, IFNULL(q.reponse_texte, ''), IFNULL(q.tags, ''), q.choix_a))
       NOT LIKE CONCAT('%', LOWER(g.terme), '%');

DELETE rql
  FROM resource_question_links rql
  INNER JOIN quiz_questions q ON q.question_code = rql.question_code
  INNER JOIN glossary_terms g ON g.glossary_code = rql.resource_ref
 WHERE rql.resource_type = 'glossary'
   AND rql.origin IN ('import', 'generated', 'auto')
   AND rql.status = 'approved'
   AND CHAR_LENGTH(TRIM(g.terme)) >= 5
   AND LOWER(CONCAT_WS(' ', q.question, IFNULL(q.reponse_texte, ''), IFNULL(q.tags, ''), q.choix_a))
       NOT LIKE CONCAT('%', LOWER(g.terme), '%');

-- Purge espèces : le nom usuel n’apparaît nulle part dans la question.
DELETE qqs
  FROM quiz_question_species qqs
  INNER JOIN quiz_questions q ON q.question_code = qqs.question_code
  INNER JOIN plants p ON p.id = qqs.plant_id
 WHERE CHAR_LENGTH(TRIM(p.name)) >= 5
   AND LOWER(CONCAT_WS(' ', q.question, IFNULL(q.reponse_texte, ''), IFNULL(q.tags, ''), q.choix_a))
       NOT LIKE CONCAT('%', LOWER(p.name), '%');

DELETE rql
  FROM resource_question_links rql
  INNER JOIN quiz_questions q ON q.question_code = rql.question_code
  INNER JOIN plants p ON CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
 WHERE rql.resource_type = 'plant'
   AND rql.origin IN ('import', 'generated', 'auto')
   AND rql.status = 'approved'
   AND CHAR_LENGTH(TRIM(p.name)) >= 5
   AND LOWER(CONCAT_WS(' ', q.question, IFNULL(q.reponse_texte, ''), IFNULL(q.tags, ''), q.choix_a))
       NOT LIKE CONCAT('%', LOWER(p.name), '%');

-- Liens plante (legacy + unifié) pour les QCM nouveaux et transversaux.
INSERT IGNORE INTO quiz_question_species (question_code, plant_id)
SELECT v.question_code, p.id
  FROM (
    SELECT 'QF9250' AS question_code, 'Rhizobium' AS name
    UNION ALL SELECT 'QF9109', 'Rhizobium'
    UNION ALL SELECT 'QF9217', 'Rhizobium'
    UNION ALL SELECT 'QF9239', 'Rhizobium'
    UNION ALL SELECT 'QF9251', 'Coccinelle à sept points'
    UNION ALL SELECT 'QF9251', 'Puceron'
    UNION ALL SELECT 'QF9252', 'Syrphe ceinturé'
    UNION ALL SELECT 'QF9252', 'Puceron'
    UNION ALL SELECT 'QF9253', 'Cochenille de la figue de Barbarie'
    UNION ALL SELECT 'QF9253', 'Figuier de Barbarie'
    UNION ALL SELECT 'QF9254', 'Carabe doré'
    UNION ALL SELECT 'QF9254', 'Escargot petit-gris'
    UNION ALL SELECT 'QF9255', 'Perce-oreille'
    UNION ALL SELECT 'QF9255', 'Puceron'
    UNION ALL SELECT 'QF9256', 'Mycorhizes à Glomus'
    UNION ALL SELECT 'QF9257', 'Hirondelle rustique'
    UNION ALL SELECT 'QF9257', 'Pipistrelle commune'
    UNION ALL SELECT 'QF9257', 'Moustique commun'
    UNION ALL SELECT 'QF9258', 'Crapaud de Maurétanie'
    UNION ALL SELECT 'QF9259', 'Merle noir'
    UNION ALL SELECT 'QF9259', 'Vers de terre'
    UNION ALL SELECT 'QF9260', 'Daphnie'
    UNION ALL SELECT 'QF9260', 'Libellule'
    UNION ALL SELECT 'QF9260', 'Gerris'
    UNION ALL SELECT 'QF9260', 'Gambusie'
    UNION ALL SELECT 'QF9261', 'Vers de terre'
    UNION ALL SELECT 'QF9261', 'Lombric commun'
    UNION ALL SELECT 'QF9261', 'Ver de lombricompost'
    UNION ALL SELECT 'QF9262', 'Staphylin odorant'
    UNION ALL SELECT 'QF9263', 'Sureau noir'
    UNION ALL SELECT 'QF9263', 'Lierre'
    UNION ALL SELECT 'QF9264', 'Ortie dioïque'
    UNION ALL SELECT 'QF9264', 'Pissenlit'
    UNION ALL SELECT 'QF9265', 'Tillandsia'
    UNION ALL SELECT 'QF9265', 'Volubilis'
    UNION ALL SELECT 'QF9266', 'Hérisson d’Algérie'
    UNION ALL SELECT 'QF9266', 'Escargot petit-gris'
    UNION ALL SELECT 'QF9267', 'Chrysope verte'
    UNION ALL SELECT 'QF9267', 'Puceron'
    UNION ALL SELECT 'QF9268', 'Collembole'
    UNION ALL SELECT 'QF9268', 'Litière de feuilles'
    UNION ALL SELECT 'QF9268', 'Champignons de litière'
    UNION ALL SELECT 'QF9269', 'Capucine'
    UNION ALL SELECT 'QF9269', 'Souci officinal'
    UNION ALL SELECT 'QF9270', 'Olivier'
    UNION ALL SELECT 'QF9270', 'Arganier'
    UNION ALL SELECT 'QF9270', 'Caroubier'
    UNION ALL SELECT 'QF9271', 'Compost et épluchures'
    UNION ALL SELECT 'QF9271', 'Ver de lombricompost'
    UNION ALL SELECT 'QF9271', 'Cloporte'
    UNION ALL SELECT 'QF9272', 'Bois mort'
    UNION ALL SELECT 'QF9272', 'Champignons de litière'
    UNION ALL SELECT 'QF9105', 'Vers de terre'
    UNION ALL SELECT 'QF9105', 'Champignons de litière'
    UNION ALL SELECT 'QF9105', 'Litière de feuilles'
  ) v
  INNER JOIN plants p ON p.name = v.name
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'plant', CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci, v.question_code, 'import', 'approved', 1
  FROM (
    SELECT 'QF9250' AS question_code, 'Rhizobium' AS name
    UNION ALL SELECT 'QF9109', 'Rhizobium'
    UNION ALL SELECT 'QF9217', 'Rhizobium'
    UNION ALL SELECT 'QF9239', 'Rhizobium'
    UNION ALL SELECT 'QF9251', 'Coccinelle à sept points'
    UNION ALL SELECT 'QF9251', 'Puceron'
    UNION ALL SELECT 'QF9252', 'Syrphe ceinturé'
    UNION ALL SELECT 'QF9252', 'Puceron'
    UNION ALL SELECT 'QF9253', 'Cochenille de la figue de Barbarie'
    UNION ALL SELECT 'QF9253', 'Figuier de Barbarie'
    UNION ALL SELECT 'QF9254', 'Carabe doré'
    UNION ALL SELECT 'QF9254', 'Escargot petit-gris'
    UNION ALL SELECT 'QF9255', 'Perce-oreille'
    UNION ALL SELECT 'QF9255', 'Puceron'
    UNION ALL SELECT 'QF9256', 'Mycorhizes à Glomus'
    UNION ALL SELECT 'QF9257', 'Hirondelle rustique'
    UNION ALL SELECT 'QF9257', 'Pipistrelle commune'
    UNION ALL SELECT 'QF9257', 'Moustique commun'
    UNION ALL SELECT 'QF9258', 'Crapaud de Maurétanie'
    UNION ALL SELECT 'QF9259', 'Merle noir'
    UNION ALL SELECT 'QF9259', 'Vers de terre'
    UNION ALL SELECT 'QF9260', 'Daphnie'
    UNION ALL SELECT 'QF9260', 'Libellule'
    UNION ALL SELECT 'QF9260', 'Gerris'
    UNION ALL SELECT 'QF9260', 'Gambusie'
    UNION ALL SELECT 'QF9261', 'Vers de terre'
    UNION ALL SELECT 'QF9261', 'Lombric commun'
    UNION ALL SELECT 'QF9261', 'Ver de lombricompost'
    UNION ALL SELECT 'QF9262', 'Staphylin odorant'
    UNION ALL SELECT 'QF9263', 'Sureau noir'
    UNION ALL SELECT 'QF9263', 'Lierre'
    UNION ALL SELECT 'QF9264', 'Ortie dioïque'
    UNION ALL SELECT 'QF9264', 'Pissenlit'
    UNION ALL SELECT 'QF9265', 'Tillandsia'
    UNION ALL SELECT 'QF9265', 'Volubilis'
    UNION ALL SELECT 'QF9266', 'Hérisson d’Algérie'
    UNION ALL SELECT 'QF9266', 'Escargot petit-gris'
    UNION ALL SELECT 'QF9267', 'Chrysope verte'
    UNION ALL SELECT 'QF9267', 'Puceron'
    UNION ALL SELECT 'QF9268', 'Collembole'
    UNION ALL SELECT 'QF9268', 'Litière de feuilles'
    UNION ALL SELECT 'QF9268', 'Champignons de litière'
    UNION ALL SELECT 'QF9269', 'Capucine'
    UNION ALL SELECT 'QF9269', 'Souci officinal'
    UNION ALL SELECT 'QF9270', 'Olivier'
    UNION ALL SELECT 'QF9270', 'Arganier'
    UNION ALL SELECT 'QF9270', 'Caroubier'
    UNION ALL SELECT 'QF9271', 'Compost et épluchures'
    UNION ALL SELECT 'QF9271', 'Ver de lombricompost'
    UNION ALL SELECT 'QF9271', 'Cloporte'
    UNION ALL SELECT 'QF9272', 'Bois mort'
    UNION ALL SELECT 'QF9272', 'Champignons de litière'
    UNION ALL SELECT 'QF9105', 'Vers de terre'
    UNION ALL SELECT 'QF9105', 'Champignons de litière'
    UNION ALL SELECT 'QF9105', 'Litière de feuilles'
  ) v
  INNER JOIN plants p ON p.name = v.name
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

-- Glossaire : on rattache par le mot du terme (après purge, ces liens repassent le filtre).
INSERT IGNORE INTO quiz_question_glossary (question_code, glossary_code)
SELECT v.question_code, g.glossary_code
  FROM (
    SELECT 'QF9250' AS question_code, 'nodosité' AS needle
    UNION ALL SELECT 'QF9250', 'Rhizobium'
    UNION ALL SELECT 'QF9250', 'légumineuse'
    UNION ALL SELECT 'QF9256', 'mycorhize'
    UNION ALL SELECT 'QF9256', 'symbiose'
    UNION ALL SELECT 'QF9261', 'détritivore'
    UNION ALL SELECT 'QF9268', 'détritivore'
    UNION ALL SELECT 'QF9271', 'détritivore'
    UNION ALL SELECT 'QF9271', 'compost'
    UNION ALL SELECT 'QF9272', 'décomposeur'
    UNION ALL SELECT 'QF9240', 'humus'
    UNION ALL SELECT 'QF9237', 'nitrification'
    UNION ALL SELECT 'QF9209', 'mycorhize'
    UNION ALL SELECT 'QF9217', 'compagnonnage'
  ) v
  INNER JOIN glossary_terms g
    ON LOWER(g.terme) LIKE CONCAT('%', LOWER(v.needle), '%')
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'glossary', g.glossary_code, v.question_code, 'import', 'approved', 1
  FROM (
    SELECT 'QF9250' AS question_code, 'nodosité' AS needle
    UNION ALL SELECT 'QF9250', 'Rhizobium'
    UNION ALL SELECT 'QF9250', 'légumineuse'
    UNION ALL SELECT 'QF9256', 'mycorhize'
    UNION ALL SELECT 'QF9256', 'symbiose'
    UNION ALL SELECT 'QF9261', 'détritivore'
    UNION ALL SELECT 'QF9268', 'détritivore'
    UNION ALL SELECT 'QF9271', 'détritivore'
    UNION ALL SELECT 'QF9271', 'compost'
    UNION ALL SELECT 'QF9272', 'décomposeur'
    UNION ALL SELECT 'QF9240', 'humus'
    UNION ALL SELECT 'QF9237', 'nitrification'
    UNION ALL SELECT 'QF9209', 'mycorhize'
    UNION ALL SELECT 'QF9217', 'compagnonnage'
  ) v
  INNER JOIN glossary_terms g
    ON LOWER(g.terme) LIKE CONCAT('%', LOWER(v.needle), '%')
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

-- Transversaux tuto déjà posés en 226 : Rhizobium / mycorhizes / détritivores.
INSERT IGNORE INTO quiz_question_tutorials (question_code, tutorial_id)
SELECT v.question_code, t.id
  FROM (
    SELECT 'QF9250' AS question_code, 'associations-plantes' AS slug
    UNION ALL SELECT 'QF9250', 'sol-vivant'
    UNION ALL SELECT 'QF9256', 'sol-vivant'
    UNION ALL SELECT 'QF9256', 'jardin-n3'
    UNION ALL SELECT 'QF9261', 'compostage'
    UNION ALL SELECT 'QF9261', 'sol-vivant'
    UNION ALL SELECT 'QF9264', 'desherbage-doux'
    UNION ALL SELECT 'QF9264', 'lire-son-sol'
    UNION ALL SELECT 'QF9268', 'sol-vivant'
    UNION ALL SELECT 'QF9271', 'compostage'
    UNION ALL SELECT 'QF9272', 'sol-vivant'
    UNION ALL SELECT 'QF9269', 'associations-plantes'
  ) v
  INNER JOIN tutorials t ON t.slug = v.slug
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'tutorial', CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci, v.question_code, 'import', 'approved', 1
  FROM (
    SELECT 'QF9250' AS question_code, 'associations-plantes' AS slug
    UNION ALL SELECT 'QF9250', 'sol-vivant'
    UNION ALL SELECT 'QF9256', 'sol-vivant'
    UNION ALL SELECT 'QF9256', 'jardin-n3'
    UNION ALL SELECT 'QF9261', 'compostage'
    UNION ALL SELECT 'QF9261', 'sol-vivant'
    UNION ALL SELECT 'QF9264', 'desherbage-doux'
    UNION ALL SELECT 'QF9264', 'lire-son-sol'
    UNION ALL SELECT 'QF9268', 'sol-vivant'
    UNION ALL SELECT 'QF9271', 'compostage'
    UNION ALL SELECT 'QF9272', 'sol-vivant'
    UNION ALL SELECT 'QF9269', 'associations-plantes'
  ) v
  INNER JOIN tutorials t ON t.slug = v.slug
  INNER JOIN quiz_questions q ON q.question_code = v.question_code;

-- Orphelins (question ou plante disparue).
DELETE rql
  FROM resource_question_links rql
  LEFT JOIN quiz_questions q ON q.question_code = rql.question_code AND q.statut = 'actif'
 WHERE q.question_code IS NULL;

DELETE rql
  FROM resource_question_links rql
  LEFT JOIN plants p ON CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
 WHERE rql.resource_type = 'plant' AND p.id IS NULL;

DELETE rql
  FROM resource_question_links rql
  LEFT JOIN glossary_terms g ON g.glossary_code = rql.resource_ref
 WHERE rql.resource_type = 'glossary' AND g.glossary_code IS NULL;

DELETE rql
  FROM resource_question_links rql
  LEFT JOIN tutorials t ON CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
 WHERE rql.resource_type = 'tutorial' AND t.id IS NULL;

-- Catalogue relu : les approved restants (sauf suggestions auto) deviennent bloquants.
UPDATE resource_question_links
   SET is_gating = 1
 WHERE status = 'approved'
   AND origin IN ('import', 'generated', 'manual');

UPDATE resource_question_links
   SET is_gating = 0
 WHERE status = 'suggested' OR origin = 'auto';
