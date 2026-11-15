-- =====================================================================
-- 344 — G&L « Tenir à deux » : retours de QCM qui disent vrai sans punir (14 novembre 2026).
--
-- 1. Dix-sept retours de questions actives portaient encore un mot de la liste des garde-fous
--    (`src/shared/glGardeFousCore.js`) après le nettoyage de l'amorce « Non » fait à l'affichage
--    (`lib/glRetourQcm.js`) : neuf retours de mauvais choix, huit `feedback_correct`. Ils sont
--    réécrits à la main, sans changer le fait scientifique.
-- 2. `GQCM0766` (« À quelle famille appartient « Suricate »… ») est une question de zone de
--    chasse : question de taxonomie générée, remplacée par une question sur la sentinelle
--    (bloc `remplacement` de `data/gl/tenir/qcm-feedbacks-zones.json`).
--
-- Idempotente et respectueuse des retouches : chaque UPDATE est gardé par l'ANCIENNE valeur
-- exacte. Un retour ou un énoncé retouché entre-temps n'est jamais écrasé. Aucune suppression.
-- Contrôle de contenu : tests/content/gl-tenir-feedbacks.test.js.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. Retours de mauvais choix.
-- ---------------------------------------------------------------------
UPDATE gl_qcm_questions
   SET feedback_c = 'Il ne s''en prend pas aux cerfs : c''est un insecte invasif qui menace surtout les abeilles.'
 WHERE question_code = 'QCM0233'
   AND feedback_c = 'Non, il ne s''attaque pas aux cerfs : c''est un insecte invasif qui menace surtout les abeilles.';

UPDATE gl_qcm_questions
   SET feedback_b = 'La coccinelle est utile (elle mange les pucerons) : l''insecte qui s''en prend aux arbres affaiblis est le scolyte.'
 WHERE question_code = 'QCM0235'
   AND feedback_b = 'Non. La coccinelle est utile (elle mange les pucerons) : l''insecte qui attaque les arbres affaiblis est le scolyte.';

UPDATE gl_qcm_questions
   SET feedback_e = 'Le machaon est un papillon : l''insecte qui s''en prend aux arbres affaiblis est le scolyte.'
 WHERE question_code = 'QCM0235'
   AND feedback_e = 'Non. Le machaon est un papillon : l''insecte qui attaque les arbres affaiblis est le scolyte.';

UPDATE gl_qcm_questions
   SET feedback_e = 'L''idée est amusante, mais les rayures servent contre les mouches et les prédateurs, pas à cacher l''âge.'
 WHERE question_code = 'QCM0245'
   AND feedback_e = 'Non, c''est amusant mais faux : les rayures servent contre les mouches et les prédateurs, pas à cacher l''âge.';

UPDATE gl_qcm_questions
   SET feedback_d = 'Le pique-bœuf ne vise pas l''œil : il mange les parasites sur le dos de l''animal. Les deux y gagnent.'
 WHERE question_code = 'QCM0275'
   AND feedback_d = 'Non. Le pique-bœuf nettoie l''animal : il ne l''attaque pas. Les deux y gagnent.';

UPDATE gl_qcm_questions
   SET feedback_a = 'Les lions s''en prennent rarement à un rhinocéros adulte : sa vraie menace est le braconnage pour sa corne.'
 WHERE question_code = 'QCM0292'
   AND feedback_a = 'Non. Les lions s''attaquent rarement à un rhinocéros adulte : sa vraie menace est le braconnage pour sa corne.';

UPDATE gl_qcm_questions
   SET feedback_e = 'C''est l''inverse : les surfaces de mangrove ont diminué (un quart à un tiers ont disparu depuis 1980).'
 WHERE question_code = 'QCM0357'
   AND feedback_e = 'Non, c''est l''inverse : les surfaces de mangrove ont diminué (un quart à un tiers perdus depuis 1980).';

UPDATE gl_qcm_questions
   SET feedback_d = 'Le moustique pique les animaux : l''insecte qui s''en prend aux arbres affaiblis est le scolyte.'
 WHERE question_code = 'QCM0415'
   AND feedback_d = 'Non. Le moustique pique les animaux : l''insecte qui attaque les arbres affaiblis est le scolyte.';

UPDATE gl_qcm_questions
   SET feedback_b = 'On n''arrose pas à l''eau de mer : pour maintenir la lande, il faut continuer pâturage, fauche et brûlis.'
 WHERE question_code = 'QCM0652'
   AND feedback_b = 'Non, on n''arrose pas à l''eau de mer : pour maintenir la lande, il faut poursuivre pâturage, fauche et brûlis.';

-- ---------------------------------------------------------------------
-- 1b. Retours de bonne réponse.
-- ---------------------------------------------------------------------
UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! « Loup gris » porte le nom scientifique Canis lupus : le genre (Canis) puis l''espèce (lupus), toujours en deux mots latins. Carnivore social qui chasse cervidés et sangliers en meute. Présent jusqu''en Mongolie et au Canada. Une meute peut parcourir 70 km en une seule nuit en suivant un troupeau de caribous.'
 WHERE question_code = 'GQCM0799'
   AND feedback_correct = 'Exact ! « Loup gris » porte le nom scientifique Canis lupus : le genre (Canis) puis l''espèce (lupus), toujours en deux mots latins. Carnivore social qui chasse cervidés et sangliers en meute. Présent jusqu''en Mongolie et au Canada. Une meute peut parcourir 70 km en une seule nuit à la poursuite d''un troupeau de caribous.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Une nappe phréatique fossile est une énorme réserve d''eau souterraine, accumulée il y a très longtemps, à une époque où le Sahara était humide. Elle ne se renouvelle quasiment plus : une fois pompée, elle ne revient pas.'
 WHERE question_code = 'QCM0027'
   AND feedback_correct = 'Exact ! Une nappe phréatique fossile est une énorme réserve d''eau souterraine, accumulée il y a très longtemps, à une époque où le Sahara était humide. Elle ne se renouvelle quasiment plus : une fois pompée, elle est perdue.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Le frelon asiatique, arrivé accidentellement vers 2004, est une espèce invasive : il chasse notamment les abeilles, dont il décime les colonies. Il pose un vrai problème pour les apiculteurs.'
 WHERE question_code = 'QCM0233'
   AND feedback_correct = 'Exact ! Le frelon asiatique, arrivé accidentellement vers 2004, est une espèce invasive : il s''attaque notamment aux abeilles, dont il décime les colonies. Il pose un vrai problème pour les apiculteurs.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Le scolyte est un petit coléoptère qui fore le bois. Quand les arbres sont affaiblis par la sécheresse, il les envahit massivement : on observe de vraies épidémies, notamment sur les épicéas d''Europe centrale.'
 WHERE question_code = 'QCM0235'
   AND feedback_correct = 'Exact ! Le scolyte est un petit coléoptère qui fore le bois. Quand les arbres sont affaiblis par la sécheresse, il les attaque massivement : on observe de vraies épidémies, notamment sur les épicéas d''Europe centrale.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Le glouton (ou carcajou) est un mustélidé (famille de la belette) puissant, parfois surnommé « petit ours ». Solitaire et redoutable, il peut s''en prendre à des proies bien plus grandes que lui. C''est un symbole des forêts boréales sauvages.'
 WHERE question_code = 'QCM0366'
   AND feedback_correct = 'Exact ! Le glouton (ou carcajou) est un mustélidé (famille de la belette) puissant, parfois surnommé « petit ours ». Solitaire et redoutable, il peut s''attaquer à des proies bien plus grandes que lui. C''est un symbole des forêts boréales sauvages.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! La résine des conifères sert à se défendre : elle colmate les blessures de l''arbre et piège les insectes qui voudraient creuser son bois. C''est un peu le pansement et l''armure de l''arbre.'
 WHERE question_code = 'QCM0378'
   AND feedback_correct = 'Exact ! La résine des conifères sert à se défendre : elle colmate les blessures de l''arbre et piège les insectes qui voudraient l''attaquer. C''est un peu le pansement et l''armure de l''arbre.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Le scolyte, un petit coléoptère foreur, profite des arbres affaiblis par la sécheresse pour les envahir en masse. Depuis 2010, il provoque de vraies épidémies en taïga (et ailleurs), liées au réchauffement.'
 WHERE question_code = 'QCM0415'
   AND feedback_correct = 'Exact ! Le scolyte, un petit coléoptère foreur, profite des arbres affaiblis par la sécheresse pour les attaquer en masse. Depuis 2010, il provoque de vraies épidémies en taïga (et ailleurs), liées au réchauffement.';

UPDATE gl_qcm_questions
   SET feedback_correct = 'Exact ! Les landes se développent sur des sols acides et pauvres, en climat tempéré humide, avec une longue histoire de pâturage et de feu. C''est cette combinaison de conditions qui les fait naître et durer.'
 WHERE question_code = 'QCM0645'
   AND feedback_correct = 'Exact ! Les landes se développent sur des sols acides et pauvres, en climat tempéré humide, avec une longue histoire de pâturage et de feu. C''est cette combinaison de conditions qui les fait naître et perdurer.';

-- ---------------------------------------------------------------------
-- 2. Suricate : la question de zone devient une question sur la sentinelle. Gardée par l'ancien
--    énoncé exact ; biome, catégorie, niveau, mots-clés, photo et statut inchangés.
-- ---------------------------------------------------------------------
UPDATE gl_qcm_questions
   SET question = 'Pendant que son groupe creuse le sable pour trouver des insectes, un suricate reste debout sur une butte. Pourquoi ?',
       choix_a = 'Il monte la garde et prévient les autres si un rapace ou un chacal approche',
       choix_b = 'Il attend que les autres lui apportent à manger parce qu''il est le chef',
       choix_c = 'Il cherche des fruits dans les arbres',
       choix_d = 'Il écoute s''il va pleuvoir',
       choix_e = 'Il compte les petits pour n''en oublier aucun',
       reponse_correcte = 'A',
       feedback_correct = 'Oui : c''est la sentinelle. Elle guette le ciel et le sol, et pousse un cri d''alarme différent pour un rapace ou pour un prédateur au sol. Les sentinelles se relaient : chacun guette à son tour.',
       feedback_a = NULL,
       feedback_b = 'Chez les suricates, chacun cherche sa nourriture ; celui qui est debout ne mange pas, il surveille.',
       feedback_c = 'Les suricates mangent surtout des insectes et des petits animaux du sol, pas des fruits.',
       feedback_d = 'Il ne regarde pas les nuages : il guette les prédateurs, pour tout le groupe.',
       feedback_e = 'Ce sont des adultes « nounous », restés au terrier, qui gardent les petits ; la sentinelle, elle, surveille les prédateurs.',
       reponse_texte = 'Il monte la garde et prévient les autres si un rapace ou un chacal approche',
       tags = 'suricate, mammifère, savane, comportement, sentinelle',
       notes_pedagogiques = 'Comportement : la sentinelle des suricates (vigilance, cri d''alarme, relais entre adultes). Question de zone de chasse, biome Savane tropicale.'
 WHERE question_code = 'GQCM0766'
   AND question = 'À quelle famille appartient « Suricate » (Suricata suricatta) ?';
