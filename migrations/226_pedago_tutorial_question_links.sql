-- Recuration tutoriels ForetMap : liens par slug, QCM ancrés dans les fiches HTML.
-- Idempotent. Ne touche pas aux liens origin='manual' (saisies prof).
-- Titre Jardin N3 aligné sur le contenu « Jardin punk ».

UPDATE tutorials
   SET title = 'Jardin punk (N3)',
       summary = 'Manifeste de jardinage punk : observer, pailler, garder la matière organique, zéro chimique.'
 WHERE slug = 'jardin-n3'
   AND title IN ('Jardin N3', 'Jardin punk (N3)');

-- Retirer les rattachements seed / auto (LIKE trop larges, aquaponie sans fiche, etc.).
DELETE qqt
  FROM quiz_question_tutorials qqt
  LEFT JOIN resource_question_links rql
    ON rql.resource_type = 'tutorial'
   AND rql.resource_ref = CAST(qqt.tutorial_id AS CHAR) COLLATE utf8mb4_unicode_ci
   AND rql.question_code = qqt.question_code
   AND rql.origin = 'manual'
 WHERE rql.id IS NULL;

DELETE FROM resource_question_links
 WHERE resource_type = 'tutorial'
   AND origin IN ('import', 'generated', 'auto');

INSERT IGNORE INTO quiz_questions
(question_code, categorie_slug, numero_dans_categorie, question,
 choix_a, choix_b, choix_c, choix_d, choix_e,
 reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
 feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
 notes_pedagogiques, tags, statut, created_at, updated_at)
VALUES
('QF9201','eau_arrosage',9201,
 'Selon la fiche d’arrosage, pourquoi arroser à midi gaspille-t-il beaucoup plus d’eau ?',
 'Parce que le sol dépasse souvent 40 °C et jusqu’à 60 % de l’eau s’évapore avant d’infiltrer',
 'Parce que les stomates sont fermés à midi et rejettent l’eau',
 'Parce que le chlore de l’eau se dégrade plus vite à la chaleur',
 'Parce que les racines cessent d’absorber dès que le soleil est haut',
 NULL,'A','Le sol trop chaud fait évaporer une grande part de l’eau avant les racines',
 'college',2,'⭐⭐ Moyen',
 'La fiche parle de chaleur de surface : jusqu’à 60 % de l’eau part avant d’atteindre une racine.',
 'Oui. C’est l’argument de la fiche (sol souvent > 40 °C à midi).',
 'Non. Ce n’est pas l’explication donnée pour le gaspillage de midi.',
 'Non. Le chlore n’est pas le sujet de ce passage.',
 'Non. Les racines n’arrêtent pas d’absorber dès que le soleil est haut.',
 NULL,'Ancré dans fiche-arrosage-punk.','arrosage, evaporation, midi','actif',NOW(),NOW()),
('QF9202','eau_arrosage',9202,
 'Tu enfonces un doigt à 5 cm : le sol est humide. Que faire d’après la fiche d’arrosage ?',
 'Ne pas arroser : tu noierais les racines et chasserais l’oxygène',
 'Arroser un peu « au cas où », en surface seulement',
 'Arroser le soir pour compenser la transpiration nocturne',
 'Pailler d’abord, puis arroser abondamment',
 NULL,'A','Sol encore humide : on n’arrose pas',
 'college',1,'⭐ Facile',
 'Humide = stop. L’eau en trop chasse l’air des pores.',
 'Oui. Le test du doigt à 5 cm suffit : humide, on attend.',
 'Non. Arroser « au cas où » noie et asphyxie.',
 'Non. Ce n’est pas le geste prescrit si le sol est déjà humide.',
 'Non. Le paillage n’oblige pas à arroser un sol déjà humide.',
 NULL,'Test du doigt.','arrosage, doigt, oxygenes','actif',NOW(),NOW()),
('QF9203','eau_arrosage',9203,
 'Pourquoi un filet d’eau chaque soir est-il pire, selon la fiche, qu’un arrosage abondant plus rare ?',
 'Parce que les racines restent en surface, là où l’humidité n’est pas stable',
 'Parce que l’eau quotidienne lessive tout l’azote',
 'Parce que le soir empêche toute infiltration',
 'Parce qu’il faut toujours viser 40 cm de profondeur',
 NULL,'A','Arrosage superficiel = racines superficielles et plantes dépendantes',
 'college',2,'⭐⭐ Moyen',
 'Les racines poussent où est l’eau. La cible de la fiche est 15–20 cm, pas 40.',
 'Oui. Profond et rare plutôt que filet quotidien.',
 'Non. Ce n’est pas l’argument du texte.',
 'Non. Le soir pose surtout un problème sanitaire sur le feuillage.',
 'Non. La fiche vise 15–20 cm, pas 40.',
 NULL,'Profond et rare.','arrosage, racines, profondeur','actif',NOW(),NOW()),
('QF9204','eau_arrosage',9204,
 'La fiche d’arrosage déconseille surtout l’arrosage du soir parce que…',
 'Le feuillage reste humide toute la nuit, conditions favorables au mildiou et à l’oïdium',
 'L’eau froide de la nuit bloque la photosynthèse',
 'Les vers de terre se noient',
 'Le paillage absorbe alors toute l’eau',
 NULL,'A','Feuillage humide la nuit = champignons pathogènes',
 'college',2,'⭐⭐ Moyen',
 'Argument sanitaire, distinct de l’évaporation de midi. Le matin reste le créneau recommandé.',
 'Oui. Mildiou et oïdium aiment un feuillage mouillé toute la nuit.',
 'Non. Ce n’est pas l’explication de la fiche.',
 'Non. Les vers ne sont pas le motif donné.',
 'Non. Le paillage réduit l’évaporation, il n’« avale » pas l’arrosage du soir.',
 NULL,'Soir vs mildiou.','arrosage, mildiou, soir','actif',NOW(),NOW()),
('QF9205','pratiques_potager',9205,
 'D’après la fiche de désherbage, que signale surtout un pissenlit qui s’installe ?',
 'Un sol compacté — autant ameublir qu’arracher',
 'Un sol trop riche en azote',
 'Un sol chaud et sec, comme le pourpier',
 'Un manque de lumière sous le paillis',
 NULL,'A','Pissenlit = symptôme de compaction',
 'college',2,'⭐⭐ Moyen',
 'Le pissenlit est présenté comme indicateur de sol tassé, pas comme la cause.',
 'Oui. Le pivot traverse un sol compacté : c’est un signal.',
 'Non. L’azote trop riche, c’est plutôt l’ortie dans cette fiche.',
 'Non. Chaud et sec, c’est le pourpier.',
 'Non. Ce n’est pas le diagnostic donné pour le pissenlit.',
 NULL,'Plantes bio-indicatrices.','pissenlit, compaction, desherbage','actif',NOW(),NOW()),
('QF9206','pratiques_potager',9206,
 'Pourquoi la fiche dit-elle que laisser fleurir un mouron « crée du travail pour trois saisons » ?',
 'Parce qu’un pied produit jusqu’à 2 500 graines, viables plusieurs années',
 'Parce que ses rhizomes fragmentés repartent chacun',
 'Parce que le mouron fixe l’azote et étouffe les cultures',
 'Parce que ses sécrétions allélopathiques persistent 3 ans',
 NULL,'A','Bank de graines du mouron',
 'college',2,'⭐⭐ Moyen',
 'Chiffre et longévité des graines sont dans le texte. Les rhizomes, c’est le chiendent.',
 'Oui. D’où l’urgence d’arracher avant floraison.',
 'Non. Chaque fragment qui repart, c’est le chiendent.',
 'Non. La fixation d’azote n’est pas le propos du mouron ici.',
 'Non. L’allélopathie n’est pas invoquée pour le mouron.',
 NULL,'Mouron avant floraison.','mouron, graines, desherbage','actif',NOW(),NOW()),
('QF9207','pratiques_potager',9207,
 'Tu dois extraire du chiendent. Quel geste la fiche interdit clairement ?',
 'Hacher les rhizomes ou les mettre encore humides au compost',
 'Utiliser une fourche-bêche',
 'Intervenir après la pluie',
 'Pailler ensuite à 8–10 cm',
 NULL,'A','Chaque fragment de chiendent peut repartir',
 'college',2,'⭐⭐ Moyen',
 'Extraire entier et faire sécher au soleil avant le compost.',
 'Oui. Un rhizome humide dans un compost chaud repart aussi.',
 'Non. La fourche-bêche est un outil adapté pour extraire.',
 'Non. Après la pluie, le sol lâche aide au contraire.',
 'Non. Le paillage ensuite est recommandé.',
 NULL,'Chiendent et compost.','chiendent, rhizome, compost','actif',NOW(),NOW()),
('QF9208','pratiques_potager',9208,
 'Selon la fiche, pourquoi le labour « crée plus de problèmes qu’il n’en résout » face aux adventices ?',
 'Il remonte à la lumière le stock de graines dormantes accumulé pendant des années',
 'Il assèche trop le sol et tue les pissenlits utiles',
 'Il détruit uniquement les légumineuses fixatrices',
 'Il rend l’eau bouillante inefficace sur les allées',
 NULL,'A','Labour = bank de graines remis en surface',
 'college',2,'⭐⭐ Moyen',
 'D’où le griffage de surface plutôt qu’un retournement profond.',
 'Oui. Les graines enfouies germent dès qu’on les ramène à la lumière.',
 'Non. Ce n’est pas l’argument central du texte.',
 'Non. Le labour n’est pas présenté ainsi.',
 'Non. L’eau bouillante est un autre geste, limité aux allées.',
 NULL,'Bank de graines.','labour, adventices, graines','actif',NOW(),NOW()),
('QF9209','agroecologie_permaculture',9209,
 'Pourquoi le jardin punk minimise-t-il le travail du sol ?',
 'Pour préserver les réseaux mycorhiziens qui relient les plantes et transportent eau, phosphore et azote',
 'Pour empêcher les adventices de germer par manque d’oxygène',
 'Parce que le BRF ne fonctionne que sur sol labouré',
 'Pour que le compost atteigne 70 °C plus vite',
 NULL,'A','Non-labour = mycorhizes intactes',
 'college',2,'⭐⭐ Moyen',
 'La fiche lie explicitement le non-labour aux hyphes (environ 90 % des plantes, jusqu’à 30 % des sucres).',
 'Oui. Labourer casse ces réseaux qui mettent des années à se reconstruire.',
 'Non. Ce n’est pas la raison donnée.',
 'Non. Le BRF est mis en avant précisément sans labour.',
 'Non. La température du compost est un autre sujet.',
 NULL,'Mycorhizes et non-labour.','jardin punk, mycorhizes, labour','actif',NOW(),NOW()),
('QF9210','agroecologie_permaculture',9210,
 'Dans la spirale d’aromatiques de la fiche jardin punk, où placer la menthe ?',
 'En bas, zone plus humide et à ombre partielle',
 'En haut, côté sud, zone sèche et chaude',
 'Au milieu, avec le romarin',
 'Hors spirale, car elle est allélopathique comme le fenouil',
 NULL,'A','Menthe en bas de spirale',
 'college',1,'⭐ Facile',
 'Haut sec : romarin, thym, origan. Bas humide : menthe, cerfeuil, ciboulette.',
 'Oui. La menthe aime le bas plus frais.',
 'Non. Le haut chaud est pour le romarin et le thym.',
 'Non. Le romarin est plus haut.',
 'Non. L’allélopathie du fenouil est un autre tuto.',
 NULL,'Spirale 60–80 cm.','spirale, menthe, aromatiques','actif',NOW(),NOW()),
('QF9211','agroecologie_permaculture',9211,
 'Qu’est-ce que le BRF dans la fiche jardin punk, et pourquoi est-il mis en avant ?',
 'Des branches broyées de moins de 7 cm, qui favorisent les champignons saprophytes et un humus stable',
 'Du bois de plus de 7 cm, pour structurer les buttes',
 'Un engrais liquide à base de consoude',
 'Un paillis minéral qui bloque les nématodes',
 NULL,'A','BRF = branches < 7 cm',
 'college',2,'⭐⭐ Moyen',
 'Définition chiffrée et rôle fongique sont propres à ce texte.',
 'Oui. Moins de 7 cm, pour les champignons de litière.',
 'Non. Au-delà de 7 cm, ce n’est plus le BRF décrit ici.',
 'Non. La consoude est un autre allié (mulch, potassium).',
 'Non. Les nématodes, c’est plutôt le souci dans un autre tuto.',
 NULL,'BRF.','brf, champignons, humus','actif',NOW(),NOW()),
('QF9212','agroecologie_permaculture',9212,
 '« Les déchets n’existent pas » : quelle sortie du jardin la fiche juge-t-elle inacceptable ?',
 'Emporter la matière organique (brouette de verts vers la benne)',
 'Donner des surplus aux voisins',
 'Laisser les tailles en paillis',
 'Mettre les épluchures au compost',
 NULL,'A','Rien d’organique ne doit sortir',
 'college',1,'⭐ Facile',
 'Redistribuer (voisins, animaux, compost) est une éthique ; extraire l’organique, c’est perdre de la fertilité.',
 'Oui. La benne emporte ce qui devrait revenir au sol.',
 'Non. Donner aux voisins, c’est redistribuer les surplus.',
 'Non. Les tailles en paillis restent dans le cycle.',
 'Non. Le compost est précisément le bon geste.',
 NULL,'Boucle de matière.','dechet, compost, jardin punk','actif',NOW(),NOW()),
('QF9213','semis_recolte',9213,
 'Pourquoi la fiche de rempotage interdit-elle de sauter plusieurs tailles de pot ?',
 'Parce que le substrat non colonisé reste trop humide et la pourriture commence là',
 'Parce que le collet doit toujours être enterré plus bas',
 'Parce que la terre cuite se fissure au-delà de +5 cm',
 'Parce que l’éthylène ne se produit que dans les grands pots',
 NULL,'A','Pot trop grand = zone d’eau morte',
 'college',2,'⭐⭐ Moyen',
 'Règle : +2–3 cm (petite plante), +4–5 cm max (grande).',
 'Oui. Autour de la motte, l’eau stagne si les racines n’occupent pas encore le volume.',
 'Non. Le collet reste au même niveau.',
 'Non. Ce n’est pas l’argument du texte.',
 'Non. L’éthylène est lié au stress en pot trop petit, pas à un pot trop grand.',
 NULL,'Taille de pot.','rempotage, drainage, pot','actif',NOW(),NOW()),
('QF9214','semis_recolte',9214,
 'D’après la fiche, les racines meurent dans un pot sans drainage surtout parce que…',
 'Elles manquent d’oxygène : l’eau chasse l’air des pores',
 'L’excès d’eau dissout les parois cellulaires',
 'Le compost maison fermente et dégage de l’éthylène',
 'Les billes d’argile absorbent tout l’azote',
 NULL,'A','Asphyxie = manque d’O2, pas « trop d’eau » au sens chimique',
 'college',2,'⭐⭐ Moyen',
 '« Les cellules meurent par manque d’oxygène, pas par excès d’eau. »',
 'Oui. Drainage = cycles air / eau.',
 'Non. Ce n’est pas le mécanisme décrit.',
 'Non. L’éthylène est un autre stress (pot trop petit).',
 'Non. Les billes aident au contraire le drainage.',
 NULL,'Asphyxie racinaire.','rempotage, oxygenes, drainage','actif',NOW(),NOW()),
('QF9215','semis_recolte',9215,
 'Après rempotage, que prescrit la fiche ?',
 'Un arrosage généreux une fois, puis une semaine sans y toucher',
 'Arroser un peu tous les jours pour « souder » la motte',
 'Mettre un engrais chimique dès le lendemain',
 'Enterrer le collet de 2 cm pour stabiliser',
 NULL,'A','Un gros arrosage puis une semaine de repos',
 'college',1,'⭐ Facile',
 'Les racines dérangées cicatrisent. Le collet reste au même niveau ; on laisse 2 cm libres en haut du pot.',
 'Oui. Réarroser tout de suite attaquerait des blessures.',
 'Non. L’arrosage quotidien n’est pas prescrit.',
 'Non. Pas d’engrais chimique « pour compenser ».',
 'Non. Enterrer le collet est précisément à éviter.',
 NULL,'Repos post-rempotage.','rempotage, collet, arrosage','actif',NOW(),NOW()),
('QF9216','semis_recolte',9216,
 'Quel geste est explicitement le « mauvais » au démoulage ?',
 'Tirer la plante par la tige comme une poignée',
 'Tapoter les parois ou passer un couteau fin',
 'Arroser la veille pour que la motte tienne',
 'Soutenir la motte d’une main en renversant',
 NULL,'A','La tige n’est pas une poignée',
 'college',1,'⭐ Facile',
 'Encadré attention de la fiche : ne jamais tirer sur la tige.',
 'Oui. On risque de casser collet et racines.',
 'Non. Tapoter est un geste recommandé.',
 'Non. Arroser la veille rend la motte souple, pas détrempée.',
 'Non. C’est le geste correct.',
 NULL,'Démoulage.','rempotage, tige, motte','actif',NOW(),NOW()),
('QF9217','pratiques_potager',9217,
 'Dans les Trois Sœurs, quel rôle le texte attribue spécifiquement au haricot ?',
 'Fixer l’azote atmosphérique via Rhizobium',
 'Couvrir le sol et étouffer les adventices',
 'Servir de tuteur au maïs',
 'Sécréter de l’alpha-terthienyl contre les nématodes',
 NULL,'A','Haricot = azote (Rhizobium)',
 'college',2,'⭐⭐ Moyen',
 'Maïs = tuteur ; courge = couvre-sol ; haricot = azote. L’alpha-terthienyl est le souci.',
 'Oui. Association plante + bactérie, pas « le haricot fabrique l’azote tout seul ».',
 'Non. Couvrir le sol, c’est la courge.',
 'Non. Le tuteur, c’est le maïs.',
 'Non. C’est le souci, pas le haricot.',
 NULL,'Milpa / Trois Sœurs.','associations, haricot, rhizobium','actif',NOW(),NOW()),
('QF9218','pratiques_potager',9218,
 'Pourquoi ne pas associer pomme de terre et tomate, d’après la fiche ?',
 'Même famille (Solanacées) et mêmes maladies, dont le mildiou, qui passent d’une culture à l’autre',
 'Allélopathie du fenouil partagée par les deux',
 'Les alliacées masquent trop leur odeur',
 'Elles occupent les mêmes niches que les Trois Sœurs',
 NULL,'A','Même famille, même mildiou',
 'college',2,'⭐⭐ Moyen',
 'L’argument est sanitaire, pas allélopathique.',
 'Oui. Deux Solanacées côte à côte = buffet pour le même pathogène.',
 'Non. Le fenouil est un autre cas (à isoler).',
 'Non. Ce n’est pas la raison donnée.',
 'Non. Les Trois Sœurs occupent des niches différentes, c’est l’inverse.',
 NULL,'Solanacées.','tomate, pomme de terre, mildiou','actif',NOW(),NOW()),
('QF9219','pratiques_potager',9219,
 'Pour que le souci protège efficacement tomates ou poivrons des nématodes à galles, que dit le texte ?',
 'Le souci doit rester 2 à 3 mois pour que les sécrétions racinaires s’accumulent',
 'Un semis la veille du plant suffit',
 'Il faut le couper dès la floraison et le mettre au compost',
 'L’associer au fenouil multiplie l’effet',
 NULL,'A','Souci : 2–3 mois et alpha-terthienyl',
 'college',2,'⭐⭐ Moyen',
 'Durée et composé (contre Meloidogyne) sont dans la fiche.',
 'Oui. Ce n’est pas un effet magique dès le lendemain.',
 'Non. Trop court pour accumuler les sécrétions.',
 'Non. Ce n’est pas le protocole décrit.',
 'Non. Le fenouil s’isole, il ne « booste » pas le souci.',
 NULL,'Souci et nématodes.','souci, nematodes, associations','actif',NOW(),NOW()),
('QF9220','pratiques_potager',9220,
 'L’allélopathie, dans la fiche associations, c’est…',
 'L’influence chimique d’une plante sur la germination ou la croissance d’autres (fenouil, noix), distincte de la compétition pour l’eau ou la lumière',
 'La compétition pour l’eau et la lumière entre deux cultures gourmandes',
 'Le transfert de sucres via le réseau mycorhizien',
 'Le masquage olfactif uniquement aérien, jamais dans le sol',
 NULL,'A','Allélopathie ≠ compétition pour les ressources',
 'college',2,'⭐⭐ Moyen',
 'Le fenouil « + tout le reste » illustre le cas : on l’isole.',
 'Oui. Substances chimiques, pas seulement l’ombre ou la soif.',
 'Non. C’est précisément ce que le texte distingue.',
 'Non. Les mycorhizes sont un autre mécanisme.',
 'Non. Les exsudats passent aussi par le sol.',
 NULL,'Allélopathie.','allelopathie, fenouil, associations','actif',NOW(),NOW()),
('QF9221','sol_compost',9221,
 'Un tas de compost pue l’œuf pourri. Que prescrit la fiche ?',
 'Retourner tout de suite et ajouter des bruns secs (trop compact, trop humide, sans air)',
 'Ajouter des verts frais et couvrir hermétiquement',
 'Ne pas y toucher : c’est la phase thermophile',
 'Y mettre des rhizomes de liseron pour « aérer »',
 NULL,'A','Œuf pourri = anaérobie → aérer + bruns',
 'college',2,'⭐⭐ Moyen',
 'Les bactéries avec oxygène décomposent beaucoup plus vite et sans cette odeur.',
 'Oui. H2S = manque d’air. On ouvre le tas et on ajoute du carbone sec.',
 'Non. Encore des verts et un couvercle étanche empirent l’anaérobie.',
 'Non. Chaud au cœur et sans mauvaise odeur = on ne perturbe pas. Ici ça pue.',
 'Non. Les rhizomes de liseron sont sur la liste noire.',
 NULL,'Diagnostic compost.','compost, anaerobie, bruns','actif',NOW(),NOW()),
('QF9222','sol_compost',9222,
 'Quel rapport C/N la fiche de compost donne-t-elle comme idéal, et comment l’approcher en volume ?',
 'C/N 25–35, visé par 1/3 verts et 2/3 bruns',
 'C/N 5–10, uniquement des verts',
 'C/N 50–500, uniquement du BRF',
 'C/N 70, obtenu en phase thermophile',
 NULL,'A','1/3 verts, 2/3 bruns, C/N 25–35',
 'college',2,'⭐⭐ Moyen',
 '70 °C est une température, pas un C/N. Les bruns seuls ont un C/N trop haut.',
 'Oui. Trop de verts = pue ; trop de bruns = ne chauffe pas.',
 'Non. Uniquement des verts, le tas pourrit.',
 'Non. 50–500, c’est l’ordre de grandeur des bruns seuls.',
 'Non. 70 °C = chaleur du cœur, pas le ratio C/N.',
 NULL,'Ratio compost.','compost, CN, verts, bruns','actif',NOW(),NOW()),
('QF9223','sol_compost',9223,
 'À quoi sert le test du cresson décrit dans la fiche compost ?',
 'Vérifier que le compost est mûr et non phytotoxique (levée normale en 5 jours)',
 'Mesurer le C/N au laboratoire',
 'Détruire les graines d’adventices par la chaleur',
 'Détecter la géosmine des actinobactéries',
 NULL,'A','Cresson = test de maturité',
 'college',2,'⭐⭐ Moyen',
 'Jaunissement ou non-levée = substances encore toxiques pour les plantules.',
 'Oui. Germination et croissance en 5 jours = compost prêt.',
 'Non. Ce n’est pas un dosage de laboratoire.',
 'Non. La chaleur du tas s’occupe des graines, ce n’est pas ce test.',
 'Non. La géosmine est l’odeur « forêt » d’un compost réussi, un autre indice.',
 NULL,'Test cresson.','compost, cresson, maturite','actif',NOW(),NOW()),
('QF9224','sol_compost',9224,
 'Pourquoi les cendres de charbon de bois sont-elles sur la liste noire du compost ?',
 'La fiche les dit toxiques',
 'Elles sont trop riches en azote et font pourrir le tas',
 'Elles empêchent la montée à 70 °C',
 'Elles attirent les fourmis',
 NULL,'A','Cendres de charbon = toxiques (liste noire)',
 'college',1,'⭐ Facile',
 'À ne pas confondre avec d’autres cendres de bois mentionnées avec prudence ailleurs.',
 'Oui. Le texte les classe avec viandes, rhizomes et papier glacé.',
 'Non. Les cendres ne sont pas un déchet azoté.',
 'Non. Ce n’est pas le motif donné.',
 'Non. Les fourmis signalent plutôt un tas trop sec.',
 NULL,'Liste noire.','compost, cendres, interdit','actif',NOW(),NOW()),
('QF9225','eau_arrosage',9225,
 'Quelle formule la fiche « Eau au jardin » donne-t-elle pour le volume annuel récupérable ?',
 'Surface (m²) × pluviométrie (mm) × 0,85',
 'Surface (m²) × pH × 1000',
 '500 L × nombre de gouttières',
 '35 000 L pour tout toit, quelle que soit la surface',
 NULL,'A','Surface × pluie × 0,85',
 'college',2,'⭐⭐ Moyen',
 '35 000 L est l’exemple (50 m², 600 mm), pas une constante.',
 'Oui. Le 0,85 tient compte des pertes (gouttières, éclaboussures).',
 'Non. Le pH n’entre pas dans le volume.',
 'Non. 500–1 000 L, c’est la taille de cuve suggérée, pas la formule.',
 'Non. Ça dépend du toit et de la pluie locale.',
 NULL,'Récupération d’eau.','eau, cuve, pluviometrie','actif',NOW(),NOW()),
('QF9226','eau_arrosage',9226,
 'Pourquoi l’eau de pluie est-elle dite meilleure pour le sol vivant que l’eau du robinet ?',
 'Elle est douce, légèrement acide, sans désinfectant qui affecte bactéries utiles et mycorhizes',
 'Elle est plus calcaire, donc plus nutritive',
 'Elle est chlorée, ce qui désinfecte la rhizosphère',
 'Son pH 8–9 favorise les légumineuses',
 NULL,'A','Pluie : pH 5,5–6,5, pas de chlore',
 'college',2,'⭐⭐ Moyen',
 'Le chlore est utile pour l’humain, pas pour le microbiome du sol.',
 'Oui. C’est l’argument de la fiche.',
 'Non. La pluie est justement peu calcaire.',
 'Non. C’est l’eau du robinet qui est chlorée.',
 'Non. Le pH donné pour la pluie est 5,5–6,5.',
 NULL,'Eau de pluie vs robinet.','pluie, chlore, mycorhizes','actif',NOW(),NOW()),
('QF9227','eau_arrosage',9227,
 'Qu’est-ce que la « croûte de battance » dans la fiche eau ?',
 'Une surface imperméable formée par la pluie sur sol nu, qui empêche l’infiltration suivante',
 'Une couche d’humus qui retient 20 fois son poids en eau',
 'Le fond d’une noue (swale)',
 'Le dépôt de calcaire de l’eau du robinet',
 NULL,'A','Sol nu battu par la pluie → croûte',
 'college',2,'⭐⭐ Moyen',
 'Le paillage casse les gouttes avant l’impact.',
 'Oui. D’où l’interdit du sol nu.',
 'Non. Retenir 20× son poids, c’est l’humus, un autre passage.',
 'Non. La swale ralentit et infiltre, ce n’est pas la croûte.',
 'Non. Pas le sujet de ce mot.',
 NULL,'Battance.','battance, paillage, infiltration','actif',NOW(),NOW()),
('QF9228','eau_arrosage',9228,
 'Un sol passe de 1 % à 5 % de matière organique. Que dit la fiche sur sa rétention d’eau ?',
 'Elle quadruple',
 'Elle baisse, car l’humus draine',
 'Elle ne change que si on installe un goutte-à-goutte',
 'Elle double seulement sous un paillis de 15 cm',
 NULL,'A','5 % de MO = 4× plus d’eau retenue qu’à 1 %',
 'college',2,'⭐⭐ Moyen',
 'Phrase explicite de la fiche. L’humus retient jusqu’à 20× son poids.',
 'Oui. D’où l’intérêt de nourrir le sol, pas seulement d’arroser.',
 'Non. L’humus retient l’eau, il ne la chasse pas.',
 'Non. Le goutte-à-goutte est un autre levier (~90 % d’efficacité).',
 'Non. Le chiffre donné est un quadruplement, pas un doublement.',
 NULL,'Matière organique et eau.','humus, retention, eau','actif',NOW(),NOW()),
('QF9229','semis_recolte',9229,
 'Pourquoi la fiche semences dit-elle de ne pas récupérer les graines d’un hybride F1 ?',
 'La génération suivante (F2) sépare les caractères : l’uniformité de la F1 se perd',
 'Elles sont toujours stériles, sans exception',
 'Elles germent uniquement après fermentation',
 'Leur C/N est trop élevé pour le stockage',
 NULL,'A','F2 mendélienne, perte d’hétérosis',
 'college',2,'⭐⭐ Moyen',
 'Dépendance commerciale, pas « stérilité » absolue pour toutes les F1. Repère sachet : « F1 » / « hybride ».',
 'Oui. On sauve les variétés à pollinisation libre (OP).',
 'Non. Toutes les F1 ne sont pas stériles ; le problème est la ségrégation.',
 'Non. La fermentation 2–3 jours, c’est la tomate, un autre geste.',
 'Non. Le C/N concerne le compost.',
 NULL,'Hybrides F1.','semences, F1, Mendel','actif',NOW(),NOW()),
('QF9230','semis_recolte',9230,
 'Pour la tomate, quelle étape spécifique le texte ajoute-t-il, et pourquoi ?',
 'Fermentation 2–3 jours dans l’eau pour détruire les inhibiteurs, puis séchage 2–3 semaines',
 'Isolement de 300 m à cause du vent',
 'Attendre la 2e année (plante bisannuelle)',
 'Ne jamais sécher plus de 48 h',
 NULL,'A','Tomate : fermentation puis séchage long',
 'college',2,'⭐⭐ Moyen',
 'Tomate = souvent autofécondée, plutôt facile. 300 m = maïs ; bisannuelle = carotte.',
 'Oui. Étape propre à la tomate dans cette fiche.',
 'Non. 300 m, c’est le maïs (pollinisation par le vent).',
 'Non. La carotte est bisannuelle, pas la tomate.',
 'Non. Le séchage dure 2–3 semaines.',
 NULL,'Récolte tomate.','tomate, semences, fermentation','actif',NOW(),NOW()),
('QF9231','semis_recolte',9231,
 '« Règle des 100 » : si l’air est à 18 °C, que faut-il pour bien stocker les graines ?',
 'Une humidité relative sous 82 %',
 'Un pH du bocal sous 5,5',
 'Un séchage à plus de 100 °C',
 'Au moins 100 graines par sachet',
 NULL,'A','Température + humidité relative < 100',
 'college',2,'⭐⭐ Moyen',
 '18 + 82 = 100. Noir, frais, gel de silice, étiquette (espèce, variété, date, lieu).',
 'Oui. C’est l’application chiffrée de la règle.',
 'Non. Le pH n’entre pas dans cette règle.',
 'Non. 100 °C tuerait les embryons.',
 'Non. Ce n’est pas un effectif minimal de graines.',
 NULL,'Stockage semences.','semences, humidite, stockage','actif',NOW(),NOW()),
('QF9232','semis_recolte',9232,
 'Ton test de germination donne 2 levées sur 10. Que faire selon la fiche ?',
 'Chercher des semences fraîches',
 'Semer seulement plus dense',
 'Fermenter à nouveau les graines restantes',
 'Les stocker au soleil pour « réveiller » la dormance',
 NULL,'A','< 3/10 = renouveler le lot',
 'college',1,'⭐ Facile',
 '10 graines, papier humide, 20 °C, 7–10 jours. < 6/10 → densifier ; < 3/10 → lot neuf.',
 'Oui. 2/10 est sous le seuil de 3.',
 'Non. Densifier, c’est le geste si on est entre 3 et 5 sur 10.',
 'Non. La fermentation est pour extraire les graines de tomate, pas pour un test raté.',
 'Non. Le soleil et la chaleur abîment le stockage.',
 NULL,'Test 10 graines.','germination, viabilite, semences','actif',NOW(),NOW()),
('QF9233','sol_compost',9233,
 'Un cube de sol de 20 cm de côté livre 3 vers. Que conclure d’après « Lire son sol » ?',
 'Sol pauvre ou dégradé, à soigner',
 'Sol vivant, plus de 400 vers/m²',
 'Sol calcaire qui bloque seulement le fer',
 'Phase thermophile du compost',
 NULL,'A','< 5 vers / cube 20 cm = pauvre',
 'college',1,'⭐ Facile',
 '5–10 = moyen ; > 10 = fertile. 400/m² est le potentiel d’un sol sain, pas ce comptage.',
 'Oui. Trois vers, c’est sous le seuil de 5.',
 'Non. 400/m² serait un beau sol, pas 3 vers dans le cube.',
 'Non. Le calcaire se lit autrement (pH, blocage Fe/Mn).',
 'Non. La phase thermophile concerne le tas de compost.',
 NULL,'Comptage vers.','vers, sol, bioindicateur','actif',NOW(),NOW()),
('QF9234','sol_compost',9234,
 'Odeur d’œuf pourri en enfonçant la bêche : diagnostic de la fiche « Lire son sol » ?',
 'Sol anaérobie (H2S), drainage urgent',
 'Géosmine, très bon signe',
 'Excès de calcaire, chauler',
 'Trop de trèfle sauvage',
 NULL,'A','H2S = asphyxie, à drainer',
 'college',2,'⭐⭐ Moyen',
 'Géosmine = odeur de forêt (actinobactéries). Œuf pourri = compacté ou gorgé d’eau.',
 'Oui. On aère et on draine, on ne se réjouit pas.',
 'Non. La géosmine sent la forêt, pas l’œuf pourri.',
 'Non. Chauler ne traite pas l’asphyxie.',
 'Non. Le trèfle signale plutôt un manque d’azote.',
 NULL,'Odeur du sol.','H2S, drainage, sol','actif',NOW(),NOW()),
('QF9235','sol_compost',9235,
 'Pourquoi un sol calcaire peut-il « affamer » une plante en fer alors que le fer est dans le sol ?',
 'Un pH élevé bloque chimiquement l’absorption du fer (et du manganèse)',
 'Les vers consomment tout le fer',
 'Le test du bocal élimine le fer en 24 h',
 'Seule l’argile contient du fer assimilable',
 NULL,'A','Présence ≠ disponibilité : le pH gouverne',
 'college',2,'⭐⭐ Moyen',
 'Légumes souvent à l’aise vers pH 6–7. Corriger le pH prend plusieurs saisons.',
 'Oui. C’est le piège du calcaire décrit dans la fiche.',
 'Non. Les vers n’« avalent » pas le fer des plantes.',
 'Non. Le bocal sépare sable / limon / argile, pas le fer.',
 'Non. Ce n’est pas l’explication donnée.',
 NULL,'pH et fer.','calcaire, fer, pH','actif',NOW(),NOW()),
('QF9236','sol_compost',9236,
 'Du trèfle sauvage colonise une planche. Quelle action la fiche recommande-t-elle ?',
 'Le laisser : il signale un sol pauvre en azote et il en fixe',
 'L’arracher comme le chiendent, fragment par fragment',
 'Chauler immédiatement',
 'Y voir un sol trop riche, comme l’ortie',
 NULL,'A','Trèfle = allié sur sol pauvre en N',
 'college',2,'⭐⭐ Moyen',
 'Ortie = richesse en azote ; trèfle = pauvreté en azote + fixation. On ne traite pas toutes les spontanées comme des ennemies.',
 'Oui. Le texte dit de le laisser.',
 'Non. Le chiendent est à rhizomes ; le trèfle n’est pas géré ainsi.',
 'Non. Chauler concerne plutôt rumex / sols acides.',
 'Non. L’ortie, oui, signale un sol riche.',
 NULL,'Bio-indicatrices.','trefle, azote, lire son sol','actif',NOW(),NOW()),
('QF9237','sol_compost',9237,
 'Sans bactéries nitrifiantes, que resterait-il de l’azote organique selon « Sol vivant » ?',
 'Il resterait peu assimilable : elles transforment surtout NH4+ en NO3−',
 'Il serait déjà sous forme nitrate',
 'Les champignons le convertiraient en lignine',
 'Les turricules le détruiraient',
 NULL,'A','Nitrification : ammonium → nitrate',
 'college',2,'⭐⭐ Moyen',
 'Chaîne explicitement liée aux bactéries nitrifiantes de la fiche.',
 'Oui. Le nitrate est présenté comme la forme la plus absorbable ici.',
 'Non. Sans elles, on n’a pas cette transformation.',
 'Non. Les champignons saprophytes s’occupent surtout de la lignine.',
 'Non. Les turricules enrichissent, ils ne détruisent pas l’azote.',
 NULL,'Nitrification.','nitrification, sol vivant, azote','actif',NOW(),NOW()),
('QF9238','sol_compost',9238,
 'Pourquoi les fongicides sont-ils présentés comme une « ironie » pour un sol « protégé » ?',
 'Ils détruisent directement les mycorhizes, alliés de l’absorption racinaire',
 'Ils augmentent le pH et bloquent le fer',
 'Ils fixent trop d’azote',
 'Ils empêchent le test du cresson',
 NULL,'A','Fongicides = tuer les champignons utiles',
 'college',2,'⭐⭐ Moyen',
 'Encadré de la fiche : on croit protéger et on casse le réseau d’absorption.',
 'Oui. Mycorhizes = jusqu’à 90 % des plantes terrestres dans ce texte.',
 'Non. Le pH / fer, c’est le calcaire dans « Lire son sol ».',
 'Non. Ils n’« over-fortifient » pas l’azote.',
 'Non. Le cresson teste le compost, pas les fongicides.',
 NULL,'Ironie des fongicides.','fongicides, mycorhizes, sol vivant','actif',NOW(),NOW()),
('QF9239','sol_compost',9239,
 'Un couvert de trèfle pendant 3 mois : quel ordre de grandeur d’azote la fiche « Sol vivant » avance-t-elle ?',
 '80 à 150 kg/ha via Rhizobium',
 '5 à 10 kg/ha',
 '400 kg/m² comme les vers',
 'Aucun : le trèfle consomme l’azote du sol',
 NULL,'A','80–150 kg N/ha en 3 mois',
 'college',2,'⭐⭐ Moyen',
 'Chiffre propre à cette fiche. 400, c’est des vers par m², pas de l’azote.',
 'Oui. Sans énergie fossile, par association microbienne.',
 'Non. C’est trop bas par rapport au texte.',
 'Non. 400/m² = densité de vers d’un beau sol.',
 'Non. Le trèfle fixe N2, il n’épuise pas l’azote comme une culture gourmande.',
 NULL,'Engrais vert.','trefle, rhizobium, azote','actif',NOW(),NOW()),
('QF9240','sol_compost',9240,
 'L’humus, dans « Sol vivant », se distingue de la litière fraîche parce que…',
 'C’est la fraction stable, lente à construire (décennies) et rapide à détruire (labour, pesticides…)',
 'Il se forme en quelques jours en phase thermophile',
 'Seules les bactéries le produisent, jamais les champignons',
 'Il ne retient pas l’eau, contrairement au compost',
 NULL,'A','Humus = stable, long à faire, vite perdu',
 'college',2,'⭐⭐ Moyen',
 'Acides humiques / fulviques, jusqu’à 20× son poids en eau.',
 'Oui. Asymétrie formation / destruction.',
 'Non. La phase thermophile, c’est le compost des premières semaines.',
 'Non. Champignons et bactéries coopèrent.',
 'Non. L’humus est précisément un réservoir d’eau.',
 NULL,'Humus vs litière.','humus, sol vivant, litiere','actif',NOW(),NOW());

-- Paires slug × question (nouvelles + existantes pertinentes).
INSERT IGNORE INTO quiz_question_tutorials (question_code, tutorial_id)
SELECT v.question_code, t.id
  FROM (
    SELECT 'arrosage-potager' AS slug, 'QF9201' AS question_code
    UNION ALL SELECT 'arrosage-potager', 'QF9202'
    UNION ALL SELECT 'arrosage-potager', 'QF9203'
    UNION ALL SELECT 'arrosage-potager', 'QF9204'
    UNION ALL SELECT 'arrosage-potager', 'QF0080'
    UNION ALL SELECT 'arrosage-potager', 'QF0280'
    UNION ALL SELECT 'arrosage-potager', 'QF0051'
    UNION ALL SELECT 'desherbage-doux', 'QF9205'
    UNION ALL SELECT 'desherbage-doux', 'QF9206'
    UNION ALL SELECT 'desherbage-doux', 'QF9207'
    UNION ALL SELECT 'desherbage-doux', 'QF9208'
    UNION ALL SELECT 'desherbage-doux', 'QF0051'
    UNION ALL SELECT 'jardin-n3', 'QF9209'
    UNION ALL SELECT 'jardin-n3', 'QF9210'
    UNION ALL SELECT 'jardin-n3', 'QF9211'
    UNION ALL SELECT 'jardin-n3', 'QF9212'
    UNION ALL SELECT 'jardin-n3', 'QF0254'
    UNION ALL SELECT 'jardin-n3', 'QF0331'
    UNION ALL SELECT 'rempotage', 'QF9213'
    UNION ALL SELECT 'rempotage', 'QF9214'
    UNION ALL SELECT 'rempotage', 'QF9215'
    UNION ALL SELECT 'rempotage', 'QF9216'
    UNION ALL SELECT 'rempotage', 'QF0081'
    UNION ALL SELECT 'rempotage', 'QF0282'
    UNION ALL SELECT 'associations-plantes', 'QF9217'
    UNION ALL SELECT 'associations-plantes', 'QF9218'
    UNION ALL SELECT 'associations-plantes', 'QF9219'
    UNION ALL SELECT 'associations-plantes', 'QF9220'
    UNION ALL SELECT 'associations-plantes', 'QF0050'
    UNION ALL SELECT 'associations-plantes', 'QF0052'
    UNION ALL SELECT 'associations-plantes', 'QF0132'
    UNION ALL SELECT 'associations-plantes', 'QF0251'
    UNION ALL SELECT 'associations-plantes', 'QF0252'
    UNION ALL SELECT 'associations-plantes', 'QF0253'
    UNION ALL SELECT 'associations-plantes', 'QF9109'
    UNION ALL SELECT 'compostage', 'QF9221'
    UNION ALL SELECT 'compostage', 'QF9222'
    UNION ALL SELECT 'compostage', 'QF9223'
    UNION ALL SELECT 'compostage', 'QF9224'
    UNION ALL SELECT 'compostage', 'QF0030'
    UNION ALL SELECT 'compostage', 'QF0032'
    UNION ALL SELECT 'compostage', 'QF0094'
    UNION ALL SELECT 'compostage', 'QF0230'
    UNION ALL SELECT 'compostage', 'QF9105'
    UNION ALL SELECT 'eau-au-jardin', 'QF9225'
    UNION ALL SELECT 'eau-au-jardin', 'QF9226'
    UNION ALL SELECT 'eau-au-jardin', 'QF9227'
    UNION ALL SELECT 'eau-au-jardin', 'QF9228'
    UNION ALL SELECT 'eau-au-jardin', 'QF0080'
    UNION ALL SELECT 'eau-au-jardin', 'QF0281'
    UNION ALL SELECT 'eau-au-jardin', 'QF0051'
    UNION ALL SELECT 'semences', 'QF9229'
    UNION ALL SELECT 'semences', 'QF9230'
    UNION ALL SELECT 'semences', 'QF9231'
    UNION ALL SELECT 'semences', 'QF9232'
    UNION ALL SELECT 'semences', 'QF0060'
    UNION ALL SELECT 'semences', 'QF0062'
    UNION ALL SELECT 'semences', 'QF0260'
    UNION ALL SELECT 'semences', 'QF0261'
    UNION ALL SELECT 'semences', 'QF0262'
    UNION ALL SELECT 'semences', 'QF0264'
    UNION ALL SELECT 'semences', 'QF0265'
    UNION ALL SELECT 'lire-son-sol', 'QF9233'
    UNION ALL SELECT 'lire-son-sol', 'QF9234'
    UNION ALL SELECT 'lire-son-sol', 'QF9235'
    UNION ALL SELECT 'lire-son-sol', 'QF9236'
    UNION ALL SELECT 'lire-son-sol', 'QF0033'
    UNION ALL SELECT 'lire-son-sol', 'QF0284'
    UNION ALL SELECT 'sol-vivant', 'QF9237'
    UNION ALL SELECT 'sol-vivant', 'QF9238'
    UNION ALL SELECT 'sol-vivant', 'QF9239'
    UNION ALL SELECT 'sol-vivant', 'QF9240'
    UNION ALL SELECT 'sol-vivant', 'QF0031'
    UNION ALL SELECT 'sol-vivant', 'QF0033'
    UNION ALL SELECT 'sol-vivant', 'QF0231'
    UNION ALL SELECT 'sol-vivant', 'QF0250'
    UNION ALL SELECT 'sol-vivant', 'QF9105'
    UNION ALL SELECT 'sol-vivant', 'QF9109'
  ) v
  INNER JOIN tutorials t ON t.slug = v.slug
  INNER JOIN quiz_questions q ON q.question_code = v.question_code AND q.statut = 'actif';

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, origin, status, is_gating)
SELECT 'tutorial', CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci, v.question_code, 'import', 'approved', 1
  FROM (
    SELECT 'arrosage-potager' AS slug, 'QF9201' AS question_code
    UNION ALL SELECT 'arrosage-potager', 'QF9202'
    UNION ALL SELECT 'arrosage-potager', 'QF9203'
    UNION ALL SELECT 'arrosage-potager', 'QF9204'
    UNION ALL SELECT 'arrosage-potager', 'QF0080'
    UNION ALL SELECT 'arrosage-potager', 'QF0280'
    UNION ALL SELECT 'arrosage-potager', 'QF0051'
    UNION ALL SELECT 'desherbage-doux', 'QF9205'
    UNION ALL SELECT 'desherbage-doux', 'QF9206'
    UNION ALL SELECT 'desherbage-doux', 'QF9207'
    UNION ALL SELECT 'desherbage-doux', 'QF9208'
    UNION ALL SELECT 'desherbage-doux', 'QF0051'
    UNION ALL SELECT 'jardin-n3', 'QF9209'
    UNION ALL SELECT 'jardin-n3', 'QF9210'
    UNION ALL SELECT 'jardin-n3', 'QF9211'
    UNION ALL SELECT 'jardin-n3', 'QF9212'
    UNION ALL SELECT 'jardin-n3', 'QF0254'
    UNION ALL SELECT 'jardin-n3', 'QF0331'
    UNION ALL SELECT 'rempotage', 'QF9213'
    UNION ALL SELECT 'rempotage', 'QF9214'
    UNION ALL SELECT 'rempotage', 'QF9215'
    UNION ALL SELECT 'rempotage', 'QF9216'
    UNION ALL SELECT 'rempotage', 'QF0081'
    UNION ALL SELECT 'rempotage', 'QF0282'
    UNION ALL SELECT 'associations-plantes', 'QF9217'
    UNION ALL SELECT 'associations-plantes', 'QF9218'
    UNION ALL SELECT 'associations-plantes', 'QF9219'
    UNION ALL SELECT 'associations-plantes', 'QF9220'
    UNION ALL SELECT 'associations-plantes', 'QF0050'
    UNION ALL SELECT 'associations-plantes', 'QF0052'
    UNION ALL SELECT 'associations-plantes', 'QF0132'
    UNION ALL SELECT 'associations-plantes', 'QF0251'
    UNION ALL SELECT 'associations-plantes', 'QF0252'
    UNION ALL SELECT 'associations-plantes', 'QF0253'
    UNION ALL SELECT 'associations-plantes', 'QF9109'
    UNION ALL SELECT 'compostage', 'QF9221'
    UNION ALL SELECT 'compostage', 'QF9222'
    UNION ALL SELECT 'compostage', 'QF9223'
    UNION ALL SELECT 'compostage', 'QF9224'
    UNION ALL SELECT 'compostage', 'QF0030'
    UNION ALL SELECT 'compostage', 'QF0032'
    UNION ALL SELECT 'compostage', 'QF0094'
    UNION ALL SELECT 'compostage', 'QF0230'
    UNION ALL SELECT 'compostage', 'QF9105'
    UNION ALL SELECT 'eau-au-jardin', 'QF9225'
    UNION ALL SELECT 'eau-au-jardin', 'QF9226'
    UNION ALL SELECT 'eau-au-jardin', 'QF9227'
    UNION ALL SELECT 'eau-au-jardin', 'QF9228'
    UNION ALL SELECT 'eau-au-jardin', 'QF0080'
    UNION ALL SELECT 'eau-au-jardin', 'QF0281'
    UNION ALL SELECT 'eau-au-jardin', 'QF0051'
    UNION ALL SELECT 'semences', 'QF9229'
    UNION ALL SELECT 'semences', 'QF9230'
    UNION ALL SELECT 'semences', 'QF9231'
    UNION ALL SELECT 'semences', 'QF9232'
    UNION ALL SELECT 'semences', 'QF0060'
    UNION ALL SELECT 'semences', 'QF0062'
    UNION ALL SELECT 'semences', 'QF0260'
    UNION ALL SELECT 'semences', 'QF0261'
    UNION ALL SELECT 'semences', 'QF0262'
    UNION ALL SELECT 'semences', 'QF0264'
    UNION ALL SELECT 'semences', 'QF0265'
    UNION ALL SELECT 'lire-son-sol', 'QF9233'
    UNION ALL SELECT 'lire-son-sol', 'QF9234'
    UNION ALL SELECT 'lire-son-sol', 'QF9235'
    UNION ALL SELECT 'lire-son-sol', 'QF9236'
    UNION ALL SELECT 'lire-son-sol', 'QF0033'
    UNION ALL SELECT 'lire-son-sol', 'QF0284'
    UNION ALL SELECT 'sol-vivant', 'QF9237'
    UNION ALL SELECT 'sol-vivant', 'QF9238'
    UNION ALL SELECT 'sol-vivant', 'QF9239'
    UNION ALL SELECT 'sol-vivant', 'QF9240'
    UNION ALL SELECT 'sol-vivant', 'QF0031'
    UNION ALL SELECT 'sol-vivant', 'QF0033'
    UNION ALL SELECT 'sol-vivant', 'QF0231'
    UNION ALL SELECT 'sol-vivant', 'QF0250'
    UNION ALL SELECT 'sol-vivant', 'QF9105'
    UNION ALL SELECT 'sol-vivant', 'QF9109'
  ) v
  INNER JOIN tutorials t ON t.slug = v.slug
  INNER JOIN quiz_questions q ON q.question_code = v.question_code AND q.statut = 'actif';

UPDATE resource_question_links
   SET is_gating = 1
 WHERE resource_type = 'tutorial'
   AND status = 'approved'
   AND origin IN ('import', 'generated');
