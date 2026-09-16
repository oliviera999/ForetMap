-- ---------------------------------------------------------------------------
-- 256 — Rééquilibrage de la longueur des propositions de QCM
--
-- Le problème
-- -----------
-- Le biais de *position* (bonne réponse en « A ») est déjà neutralisé à l'affichage :
-- `lib/qcmChoices.js` mélange les propositions par Fisher-Yates et n'envoie jamais la bonne
-- lettre au client. Le biais de *longueur*, lui, survit au mélange — il voyage avec le
-- texte. Sur le corpus semé (204 questions), un élève qui ne connaîtrait rien et
-- choisirait systématiquement la proposition la plus longue en réussissait **78,4 %**,
-- pour 25 % au hasard sur quatre propositions. La bonne réponse mesurait en moyenne
-- 51,7 caractères contre 26,9 pour ses distracteurs, soit un rapport de 1,92.
--
-- L'origine est visible dans le corpus : les questions ont été écrites bonne réponse
-- d'abord, soigneusement formulée, puis distracteurs expédiés en deux ou trois mots. Ce
-- n'est pas une question de rédaction maladroite, c'est une régularité systématique — donc
-- exploitable.
--
-- Le parti pris
-- -------------
-- **Réécrire les distracteurs, pas les bonnes réponses.** Deux raisons :
--   1. la bonne réponse porte le contenu enseigné ; la raccourcir, c'est perdre la nuance
--      qu'elle sert à transmettre ;
--   2. chaque distracteur a son propre `feedback_<lettre>`, adossé à *l'erreur* qu'il
--      représente. Les réécritures conservent donc le **sens** de chaque distracteur — on
--      lui donne le même niveau de détail que la bonne réponse, jamais un autre contenu.
--      Les feedbacks existants restent exacts, et n'ont pas à être touchés.
--
-- Une proposition longue ne doit pas non plus devenir un indice *inversé* : si le plus long
-- était toujours un distracteur, la règle « choisir la plus longue » deviendrait simplement
-- « éviter la plus longue ». La bonne réponse reste donc la plus longue dans une part des
-- questions, proche de ce que donnerait le hasard.
--
-- Le résultat, mesuré par `lib/pedagoContentAudit.js` sur le corpus semé
-- ---------------------------------------------------------------------
--                                            avant     après
--   « choisir la plus longue » réussit        78,4 %    38,7 %   (hasard : 25 %)
--   questions signalées `length_bias_answer`    142         0
--   longueur moyenne de la bonne réponse     51,7 car. 51,7 car.
--   longueur moyenne des distracteurs        26,9 car. 46,7 car.
--   rapport                                    1,92      1,11
--
-- Le taux de 38,7 % compte tout écart, fût-il d'un seul caractère. À un seuil réellement
-- perceptible par un élève, l'indice a disparu :
--
--   bonne réponse plus longue que le meilleur distracteur de…   avant    après
--     ≥  5 caractères                                           73,5 %   26,0 %
--     ≥ 10 caractères                                           68,1 %   10,3 %
--     ≥ 20 caractères                                           52,5 %    0,0 %
--
-- Portée et idempotence
-- ---------------------
-- 426 propositions réécrites sur 142 questions. Chaque `UPDATE` est **gardé par l'ancienne
-- valeur** : il ne s'applique qu'à un texte encore identique à celui du corpus livré. Une
-- question déjà retouchée par un enseignant depuis le panneau prof n'est donc jamais
-- écrasée, et rejouer la migration ne fait rien. Les questions ajoutées en production
-- hors du corpus semé ne sont pas concernées — elles restent à reprendre à la main, et le
-- test à cliquet `tests/content/quiz-answer-length-bias.test.js` les surveille.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Catégorie `agroecologie_permaculture` — 10 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Du fonctionnement réglé d''une usine de production'
 WHERE question_code = 'QF0130' AND choix_b = 'Des usines';
UPDATE quiz_questions SET choix_c = 'Des jeux vidéo de construction'
 WHERE question_code = 'QF0130' AND choix_c = 'Des jeux vidéo';
UPDATE quiz_questions SET choix_d = 'Du hasard, sans aucun plan'
 WHERE question_code = 'QF0130' AND choix_d = 'Du hasard';

UPDATE quiz_questions SET choix_b = 'Une forêt qu''on coupe pour cultiver à sa place'
 WHERE question_code = 'QF0131' AND choix_b = 'Une forêt qu''on coupe pour cultiver';
UPDATE quiz_questions SET choix_c = 'Un potager classique, sans aucune plante vivace'
 WHERE question_code = 'QF0131' AND choix_c = 'Un potager sans aucune plante vivace';
UPDATE quiz_questions SET choix_d = 'Une forêt interdite d''accès aux promeneurs'
 WHERE question_code = 'QF0131' AND choix_d = 'Une forêt interdite d''accès';

UPDATE quiz_questions SET choix_b = 'Parce qu''elles ont de grandes feuilles qui captent l''azote'
 WHERE question_code = 'QF0132' AND choix_b = 'Parce qu''elles ont de grandes feuilles';
UPDATE quiz_questions SET choix_c = 'Parce qu''elles poussent vite et laissent beaucoup de racines'
 WHERE question_code = 'QF0132' AND choix_c = 'Parce qu''elles poussent vite';
UPDATE quiz_questions SET choix_d = 'Parce qu''on les arrose plus souvent que les autres légumes'
 WHERE question_code = 'QF0132' AND choix_d = 'Parce qu''on les arrose plus';

UPDATE quiz_questions SET choix_b = 'Pulvériser davantage de pesticides sur les cultures'
 WHERE question_code = 'QF0133' AND choix_b = 'Pulvériser plus de pesticides';
UPDATE quiz_questions SET choix_c = 'Arracher toutes les plantes atteintes dès qu''un ravageur apparaît'
 WHERE question_code = 'QF0133' AND choix_c = 'Arracher toutes les plantes';
UPDATE quiz_questions SET choix_d = 'Brûler les déchets du jardin pour tuer les larves'
 WHERE question_code = 'QF0133' AND choix_d = 'Brûler les déchets';

UPDATE quiz_questions SET choix_b = 'Le fait que deux plantes se touchent physiquement'
 WHERE question_code = 'QF0134' AND choix_b = 'Le fait de se toucher physiquement';
UPDATE quiz_questions SET choix_c = 'Une maladie contagieuse qui passe d''une plante à ses voisines immédiates'
 WHERE question_code = 'QF0134' AND choix_c = 'Une maladie contagieuse';
UPDATE quiz_questions SET choix_d = 'Un type d''arrosage qui bénéficie à plusieurs plantes'
 WHERE question_code = 'QF0134' AND choix_d = 'Un type d''arrosage';

UPDATE quiz_questions SET choix_b = 'Pour faire joli seulement, comme dans un massif de fleurs d''ornement'
 WHERE question_code = 'QF0330' AND choix_b = 'Pour faire joli seulement';
UPDATE quiz_questions SET choix_c = 'Pour gêner les plantes et limiter leur croissance'
 WHERE question_code = 'QF0330' AND choix_c = 'Pour gêner les plantes';
UPDATE quiz_questions SET choix_d = 'Cela n''a aucun intérêt : un seul étage suffirait'
 WHERE question_code = 'QF0330' AND choix_d = 'Cela n''a aucun intérêt';

UPDATE quiz_questions SET choix_b = 'remplacer la nature par des machines et des intrants'
 WHERE question_code = 'QF0331' AND choix_b = 'remplacer la nature par des machines';
UPDATE quiz_questions SET choix_c = 'utiliser un maximum de pesticides pour sécuriser la récolte'
 WHERE question_code = 'QF0331' AND choix_c = 'utiliser un maximum de pesticides';
UPDATE quiz_questions SET choix_d = 'supprimer la biodiversité qui gêne les cultures'
 WHERE question_code = 'QF0331' AND choix_d = 'supprimer la biodiversité';

UPDATE quiz_questions SET choix_b = 'Pour empêcher les adventices de germer, faute d''oxygène dans les couches profondes du sol'
 WHERE question_code = 'QF9209' AND choix_b = 'Pour empêcher les adventices de germer par manque d’oxygène';
UPDATE quiz_questions SET choix_c = 'Parce que le BRF ne fonctionne bien que sur un sol préalablement labouré en profondeur'
 WHERE question_code = 'QF9209' AND choix_c = 'Parce que le BRF ne fonctionne que sur sol labouré';
UPDATE quiz_questions SET choix_d = 'Pour que le tas de compost atteigne 70 °C beaucoup plus vite dès les premiers jours'
 WHERE question_code = 'QF9209' AND choix_d = 'Pour que le compost atteigne 70 °C plus vite';

UPDATE quiz_questions SET choix_b = 'Du bois de plus de 7 cm de diamètre, destiné à structurer le fond des buttes de culture'
 WHERE question_code = 'QF9211' AND choix_b = 'Du bois de plus de 7 cm, pour structurer les buttes';
UPDATE quiz_questions SET choix_c = 'Un engrais liquide à base de consoude, dilué dans l''eau avant chaque arrosage des planches'
 WHERE question_code = 'QF9211' AND choix_c = 'Un engrais liquide à base de consoude';
UPDATE quiz_questions SET choix_d = 'Un paillis minéral qui bloque les nématodes autour des racines des légumes cultivés'
 WHERE question_code = 'QF9211' AND choix_d = 'Un paillis minéral qui bloque les nématodes';

UPDATE quiz_questions SET choix_b = 'Donner les surplus de récolte aux voisins du quartier'
 WHERE question_code = 'QF9212' AND choix_b = 'Donner des surplus aux voisins';
UPDATE quiz_questions SET choix_c = 'Laisser les tailles sur place, étalées en paillis au pied des plantes'
 WHERE question_code = 'QF9212' AND choix_c = 'Laisser les tailles en paillis';
UPDATE quiz_questions SET choix_d = 'Mettre les épluchures de la cantine au tas de compost'
 WHERE question_code = 'QF9212' AND choix_d = 'Mettre les épluchures au compost';


-- ---------------------------------------------------------------------------
-- Catégorie `cellule_metabolisme` — 3 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'de la lumière, comme la photosynthèse'
 WHERE question_code = 'QF0102' AND choix_b = 'de la lumière';
UPDATE quiz_questions SET choix_c = 'de l''ammonium, rejeté dans le sol'
 WHERE question_code = 'QF0102' AND choix_c = 'de l''ammonium';
UPDATE quiz_questions SET choix_d = 'des protéines, mises en réserve dans la cellule'
 WHERE question_code = 'QF0102' AND choix_d = 'des protéines';

UPDATE quiz_questions SET choix_b = 'Un type de sucre fabriqué par les microbes du sol'
 WHERE question_code = 'QF0103' AND choix_b = 'Un type de sucre du sol';
UPDATE quiz_questions SET choix_c = 'Une bactérie du sol qui fixe l''azote de l''air'
 WHERE question_code = 'QF0103' AND choix_c = 'Une bactérie';
UPDATE quiz_questions SET choix_d = 'Une vitamine que les feuilles produisent au soleil'
 WHERE question_code = 'QF0103' AND choix_d = 'Une vitamine des feuilles';

UPDATE quiz_questions SET choix_b = 'Elle pousse plus vite grâce à toute cette eau disponible'
 WHERE question_code = 'QF0301' AND choix_b = 'Elle pousse plus vite';
UPDATE quiz_questions SET choix_c = 'Elle fabrique davantage de fleurs et de fruits'
 WHERE question_code = 'QF0301' AND choix_c = 'Elle fabrique plus de fleurs';
UPDATE quiz_questions SET choix_d = 'Rien : les racines n''ont pas besoin d''oxygène'
 WHERE question_code = 'QF0301' AND choix_d = 'Rien';


-- ---------------------------------------------------------------------------
-- Catégorie `cycle_azote_aquaponie` — 8 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Produire l''ammonium dont les poissons ont besoin'
 WHERE question_code = 'QF0021' AND choix_b = 'Produire l''ammonium';
UPDATE quiz_questions SET choix_c = 'Manger les poissons trop petits du bassin'
 WHERE question_code = 'QF0021' AND choix_c = 'Manger les poissons';
UPDATE quiz_questions SET choix_d = 'Réchauffer l''eau du bassin en hiver'
 WHERE question_code = 'QF0021' AND choix_d = 'Réchauffer l''eau';

UPDATE quiz_questions SET choix_b = 'Parce que l''eau tourne en circuit fermé dans un tuyau'
 WHERE question_code = 'QF0023' AND choix_b = 'Parce que l''eau tourne dans un tuyau';
UPDATE quiz_questions SET choix_c = 'Parce que les poissons nagent en rond dans le bassin'
 WHERE question_code = 'QF0023' AND choix_c = 'Parce que les poissons nagent en rond';
UPDATE quiz_questions SET choix_d = 'L''azote ne circule pas : il finit par disparaître du système'
 WHERE question_code = 'QF0023' AND choix_d = 'L''azote ne circule pas, il disparaît';

UPDATE quiz_questions SET choix_b = 'Elle fabrique de l''ammonium à partir des déchets rejetés par les poissons du bassin'
 WHERE question_code = 'QF0024' AND choix_b = 'Elle fabrique de l''ammonium';
UPDATE quiz_questions SET choix_c = 'Elle produit l''oxygène que respirent les racines des plantes'
 WHERE question_code = 'QF0024' AND choix_c = 'Elle produit de l''oxygène';
UPDATE quiz_questions SET choix_d = 'Elle tue les poissons en acidifiant l''eau du bassin'
 WHERE question_code = 'QF0024' AND choix_d = 'Elle tue les poissons';

UPDATE quiz_questions SET choix_b = 'Des œufs d''insectes pondus contre la racine'
 WHERE question_code = 'QF0025' AND choix_b = 'Des œufs d''insectes';
UPDATE quiz_questions SET choix_c = 'De l''eau mise en réserve pour l''été'
 WHERE question_code = 'QF0025' AND choix_c = 'De l''eau de réserve';
UPDATE quiz_questions SET choix_d = 'Du sucre fabriqué par les feuilles'
 WHERE question_code = 'QF0025' AND choix_d = 'Du sucre';

UPDATE quiz_questions SET choix_b = 'Pour réchauffer l''eau avant l''arrivée des poissons'
 WHERE question_code = 'QF0220' AND choix_b = 'Pour réchauffer l''eau';
UPDATE quiz_questions SET choix_c = 'Pour faire pousser des algues qui nourriront les poissons'
 WHERE question_code = 'QF0220' AND choix_c = 'Pour faire pousser des algues';
UPDATE quiz_questions SET choix_d = 'Ce n''est pas nécessaire : on peut tout installer d''un coup'
 WHERE question_code = 'QF0220' AND choix_d = 'Ce n''est pas nécessaire';

UPDATE quiz_questions SET choix_b = 'Les poissons grandissent plus vite grâce à la concurrence'
 WHERE question_code = 'QF0221' AND choix_b = 'Les poissons grandissent plus vite';
UPDATE quiz_questions SET choix_c = 'L''eau devient plus claire car tout est mieux filtré'
 WHERE question_code = 'QF0221' AND choix_c = 'L''eau devient plus claire';
UPDATE quiz_questions SET choix_d = 'Rien du tout : le bassin s''adapte immédiatement'
 WHERE question_code = 'QF0221' AND choix_d = 'Rien du tout';

UPDATE quiz_questions SET choix_b = 'Il chauffe l''eau du bassin en permanence'
 WHERE question_code = 'QF0222' AND choix_b = 'Il chauffe l''eau';
UPDATE quiz_questions SET choix_c = 'Il nourrit les poissons du bassin entre deux distributions d''aliment'
 WHERE question_code = 'QF0222' AND choix_c = 'Il nourrit les poissons';
UPDATE quiz_questions SET choix_d = 'Il colore l''eau pour limiter la lumière'
 WHERE question_code = 'QF0222' AND choix_d = 'Il colore l''eau';

UPDATE quiz_questions SET choix_b = 'Parce que l''ammonium n''existe jamais dans l''eau d''un bassin d''aquaponie correctement filtré et aéré'
 WHERE question_code = 'QF9104' AND choix_b = 'Parce que l’ammonium n’existe jamais dans l’eau';
UPDATE quiz_questions SET choix_c = 'Parce que les poissons n''excrètent aucun déchet azoté, mais seulement du dioxyde de carbone dissous'
 WHERE question_code = 'QF9104' AND choix_c = 'Parce que les poissons n’excrètent aucun déchet azoté';
UPDATE quiz_questions SET choix_d = 'Parce que le nitrate est toujours plus toxique que NH3, quelles que soient les conditions du bassin'
 WHERE question_code = 'QF9104' AND choix_d = 'Parce que le nitrate est toujours plus toxique que NH3';


-- ---------------------------------------------------------------------------
-- Catégorie `eau_arrosage` — 10 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Pour que la plante boive moins souvent et résiste mieux à la sécheresse'
 WHERE question_code = 'QF0081' AND choix_b = 'Pour que la plante boive moins';
UPDATE quiz_questions SET choix_c = 'Pour attirer les moustiques loin du feuillage'
 WHERE question_code = 'QF0081' AND choix_c = 'Pour attirer les moustiques';
UPDATE quiz_questions SET choix_d = 'Cela n''a pas d''importance pour une plante en pot'
 WHERE question_code = 'QF0081' AND choix_d = 'Cela n''a pas d''importance';

UPDATE quiz_questions SET choix_b = 'Sur les feuilles, en plein soleil de midi'
 WHERE question_code = 'QF0280' AND choix_b = 'Sur les feuilles en plein soleil';
UPDATE quiz_questions SET choix_c = 'Partout autour, sauf sur la plante elle-même'
 WHERE question_code = 'QF0280' AND choix_c = 'Partout sauf sur la plante';
UPDATE quiz_questions SET choix_d = 'Loin de la plante, pour que l''eau vienne à elle'
 WHERE question_code = 'QF0280' AND choix_d = 'Loin de la plante';

UPDATE quiz_questions SET choix_b = 'La pluie est mauvaise pour les plantes cultivées au potager'
 WHERE question_code = 'QF0281' AND choix_b = 'La pluie est mauvaise pour les plantes';
UPDATE quiz_questions SET choix_c = 'Pour la stocker puis la jeter avant l''hiver'
 WHERE question_code = 'QF0281' AND choix_c = 'Pour la jeter ensuite';
UPDATE quiz_questions SET choix_d = 'Cela n''a aucun intérêt : l''eau du robinet suffit'
 WHERE question_code = 'QF0281' AND choix_d = 'Cela n''a aucun intérêt';

UPDATE quiz_questions SET choix_b = 'La plante grandit deux fois plus vite que d''habitude'
 WHERE question_code = 'QF0282' AND choix_b = 'La plante grandit deux fois plus vite';
UPDATE quiz_questions SET choix_c = 'Le sol du pot devient sableux et très léger'
 WHERE question_code = 'QF0282' AND choix_c = 'Le sol devient sableux';
UPDATE quiz_questions SET choix_d = 'Rien ne change jamais : une plante ne craint pas l''eau'
 WHERE question_code = 'QF0282' AND choix_d = 'Rien ne change jamais';

UPDATE quiz_questions SET choix_b = 's''écouler aussitôt, comme dans le sable'
 WHERE question_code = 'QF0284' AND choix_b = 's''écouler aussitôt';
UPDATE quiz_questions SET choix_c = 'disparaître dans l''air en quelques heures'
 WHERE question_code = 'QF0284' AND choix_c = 'disparaître dans l''air';
UPDATE quiz_questions SET choix_d = 'geler en été au fond du pot'
 WHERE question_code = 'QF0284' AND choix_d = 'geler en été';

UPDATE quiz_questions SET choix_b = 'Parce que les stomates sont fermés à midi et rejettent l''eau apportée au pied'
 WHERE question_code = 'QF9201' AND choix_b = 'Parce que les stomates sont fermés à midi et rejettent l’eau';
UPDATE quiz_questions SET choix_c = 'Parce que le chlore de l''eau du robinet se dégrade beaucoup plus vite à la chaleur'
 WHERE question_code = 'QF9201' AND choix_c = 'Parce que le chlore de l’eau se dégrade plus vite à la chaleur';
UPDATE quiz_questions SET choix_d = 'Parce que les racines cessent totalement d''absorber dès que le soleil est haut'
 WHERE question_code = 'QF9201' AND choix_d = 'Parce que les racines cessent d’absorber dès que le soleil est haut';

UPDATE quiz_questions SET choix_b = 'Parce que l''eau apportée chaque jour lessive tout l''azote du sol'
 WHERE question_code = 'QF9203' AND choix_b = 'Parce que l’eau quotidienne lessive tout l’azote';
UPDATE quiz_questions SET choix_c = 'Parce qu''arroser le soir empêche toute infiltration dans le sol'
 WHERE question_code = 'QF9203' AND choix_c = 'Parce que le soir empêche toute infiltration';
UPDATE quiz_questions SET choix_d = 'Parce qu''il faut toujours viser 40 cm de profondeur d''humidité à chaque arrosage'
 WHERE question_code = 'QF9203' AND choix_d = 'Parce qu’il faut toujours viser 40 cm de profondeur';

UPDATE quiz_questions SET choix_b = 'L''eau froide de la nuit bloque la photosynthèse du lendemain matin'
 WHERE question_code = 'QF9204' AND choix_b = 'L’eau froide de la nuit bloque la photosynthèse';
UPDATE quiz_questions SET choix_c = 'Les vers de terre remontent et se noient dans le sol détrempé'
 WHERE question_code = 'QF9204' AND choix_c = 'Les vers de terre se noient';
UPDATE quiz_questions SET choix_d = 'Le paillage absorbe alors toute l''eau apportée avant qu''elle n''atteigne les racines'
 WHERE question_code = 'QF9204' AND choix_d = 'Le paillage absorbe alors toute l’eau';

UPDATE quiz_questions SET choix_b = 'Elle est bien plus calcaire que l''eau du robinet, donc nettement plus nutritive pour les plantes'
 WHERE question_code = 'QF9226' AND choix_b = 'Elle est plus calcaire, donc plus nutritive';
UPDATE quiz_questions SET choix_c = 'Elle est naturellement chlorée, ce qui désinfecte utilement la rhizosphère'
 WHERE question_code = 'QF9226' AND choix_c = 'Elle est chlorée, ce qui désinfecte la rhizosphère';
UPDATE quiz_questions SET choix_d = 'Son pH de 8 à 9 favorise l''installation des légumineuses fixatrices'
 WHERE question_code = 'QF9226' AND choix_d = 'Son pH 8–9 favorise les légumineuses';

UPDATE quiz_questions SET choix_b = 'Une couche d''humus de surface qui retiendrait vingt fois son poids en eau de pluie'
 WHERE question_code = 'QF9227' AND choix_b = 'Une couche d’humus qui retient 20 fois son poids en eau';
UPDATE quiz_questions SET choix_c = 'Le fond d''une noue (swale) vers lequel toute l''eau de pluie du jardin est dirigée'
 WHERE question_code = 'QF9227' AND choix_c = 'Le fond d’une noue (swale)';
UPDATE quiz_questions SET choix_d = 'Le dépôt de calcaire laissé en surface par l''arrosage à l''eau du robinet'
 WHERE question_code = 'QF9227' AND choix_d = 'Le dépôt de calcaire de l’eau du robinet';


-- ---------------------------------------------------------------------------
-- Catégorie `ecologie_reseaux` — 11 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Par un prédateur, qui lance toute la chaîne alimentaire en chassant les autres animaux du milieu'
 WHERE question_code = 'QF0010' AND choix_b = 'Par un prédateur';
UPDATE quiz_questions SET choix_c = 'Par un décomposeur, qui produit la matière dont tous les autres maillons se nourrissent'
 WHERE question_code = 'QF0010' AND choix_c = 'Par un décomposeur';
UPDATE quiz_questions SET choix_d = 'Par un herbivore, forcément premier maillon puisqu''il mange des végétaux vivants'
 WHERE question_code = 'QF0010' AND choix_d = 'Par un herbivore';

UPDATE quiz_questions SET choix_b = 'Ils transportent le pollen d''une fleur à l''autre et permettent ainsi la formation des fruits'
 WHERE question_code = 'QF0011' AND choix_b = 'Polliniser les fleurs';
UPDATE quiz_questions SET choix_c = 'Ils chassent les ravageurs du potager et limitent les colonies de pucerons'
 WHERE question_code = 'QF0011' AND choix_c = 'Chasser les ravageurs';
UPDATE quiz_questions SET choix_d = 'Ils produisent l''oxygène de l''air à partir de la lumière du soleil'
 WHERE question_code = 'QF0011' AND choix_d = 'Produire de l''oxygène';

UPDATE quiz_questions SET choix_b = 'Il est toujours exactement égal à 10 %, d''un niveau trophique au suivant'
 WHERE question_code = 'QF0012' AND choix_b = 'Il est toujours exactement égal à 10 %';
UPDATE quiz_questions SET choix_c = 'Toute l''énergie est conservée sous forme de biomasse d''un niveau trophique au suivant'
 WHERE question_code = 'QF0012' AND choix_c = 'Toute l’énergie est conservée sous forme de biomasse';
UPDATE quiz_questions SET choix_d = 'L''énergie augmente à chaque niveau trophique, du producteur au prédateur'
 WHERE question_code = 'QF0012' AND choix_d = 'L’énergie augmente à chaque niveau trophique';

UPDATE quiz_questions SET choix_b = 'Il n''y a aucune différence : les deux mots désignent la même chose'
 WHERE question_code = 'QF0014' AND choix_b = 'Il n''y a aucune différence';
UPDATE quiz_questions SET choix_c = 'La chaîne est plus longue que le réseau, qui s''arrête au deuxième maillon'
 WHERE question_code = 'QF0014' AND choix_c = 'La chaîne est plus longue que le réseau';
UPDATE quiz_questions SET choix_d = 'Le réseau ne concerne que les plantes, la chaîne que les animaux'
 WHERE question_code = 'QF0014' AND choix_d = 'Le réseau ne concerne que les plantes';

UPDATE quiz_questions SET choix_b = 'Parce qu''elles sont jolies et décorent le jardin'
 WHERE question_code = 'QF0211' AND choix_b = 'Parce qu''elles sont jolies';
UPDATE quiz_questions SET choix_c = 'Parce qu''elles mangent les animaux morts du milieu'
 WHERE question_code = 'QF0211' AND choix_c = 'Parce qu''elles mangent les animaux';
UPDATE quiz_questions SET choix_d = 'Elles ne sont pas indispensables : d''autres font le travail'
 WHERE question_code = 'QF0211' AND choix_d = 'Elles ne sont pas indispensables';

UPDATE quiz_questions SET choix_b = 'Parce qu''une chaîne alimentaire est toujours fausse, quel que soit le milieu que l''on étudie'
 WHERE question_code = 'QF9101' AND choix_b = 'Parce qu’une chaîne alimentaire est toujours fausse';
UPDATE quiz_questions SET choix_c = 'Parce que les décomposeurs n''entrent jamais dans un réseau trophique de jardin'
 WHERE question_code = 'QF9101' AND choix_c = 'Parce que les décomposeurs n’entrent jamais dans un réseau';
UPDATE quiz_questions SET choix_d = 'Parce que l''énergie augmente à chaque transfert d''un maillon au suivant'
 WHERE question_code = 'QF9101' AND choix_d = 'Parce que l’énergie augmente à chaque transfert';

UPDATE quiz_questions SET choix_b = 'Il décompose la carcasse exactement comme le ferait un champignon du sol'
 WHERE question_code = 'QF9102' AND choix_b = 'Il décompose la carcasse comme un champignon';
UPDATE quiz_questions SET choix_c = 'Il nitrifie le sol en oxydant l''ammonium des restes en nitrate'
 WHERE question_code = 'QF9102' AND choix_c = 'Il nitrifie le sol en oxydant l’ammonium';
UPDATE quiz_questions SET choix_d = 'Il pollinise les plantes voisines en transportant le pollen sur son pelage'
 WHERE question_code = 'QF9102' AND choix_d = 'Il pollinise les plantes voisines';

UPDATE quiz_questions SET choix_b = 'Les trois nitrifient l''eau de la mare en oxydant l''ammonium en nitrate directement assimilable'
 WHERE question_code = 'QF9260' AND choix_b = 'Les trois nitrifient l’eau';
UPDATE quiz_questions SET choix_c = 'Les trois ne mangent que des plantes aquatiques poussant au fond et sur les bords de la mare'
 WHERE question_code = 'QF9260' AND choix_c = 'Les trois ne mangent que des plantes aquatiques';
UPDATE quiz_questions SET choix_d = 'Aucun des trois n''a le moindre prédateur dans une mare de jardin correctement entretenue'
 WHERE question_code = 'QF9260' AND choix_d = 'Aucun n’a de prédateur';

UPDATE quiz_questions SET choix_b = 'remplacent à eux seuls tout l''apport annuel de compost'
 WHERE question_code = 'QF9263' AND choix_b = 'remplacent à eux seuls tout le compost';
UPDATE quiz_questions SET choix_c = 'fixent le diazote de l''air comme le Rhizobium'
 WHERE question_code = 'QF9263' AND choix_c = 'fixent N2 comme le Rhizobium';
UPDATE quiz_questions SET choix_d = 'chassent les limaces des planches voisines'
 WHERE question_code = 'QF9263' AND choix_d = 'chassent les limaces';

UPDATE quiz_questions SET choix_b = 'Le collembole photosynthétise la litière de feuilles mortes qu''il rencontre'
 WHERE question_code = 'QF9268' AND choix_b = 'Le collembole photosynthétise la litière';
UPDATE quiz_questions SET choix_c = 'La litière de feuilles est en réalité un redoutable prédateur du collembole'
 WHERE question_code = 'QF9268' AND choix_c = 'La litière est un prédateur du collembole';
UPDATE quiz_questions SET choix_d = 'Les deux nitrifient ensemble l''eau de la mare voisine du potager'
 WHERE question_code = 'QF9268' AND choix_d = 'Les deux nitrifient l’eau de la mare';

UPDATE quiz_questions SET choix_b = 'Le bois mort chasse les champignons installés dans la litière voisine'
 WHERE question_code = 'QF9272' AND choix_b = 'Le bois mort chasse les champignons';
UPDATE quiz_questions SET choix_c = 'Les champignons photosynthétisent le bois mort qu''ils finissent par recouvrir'
 WHERE question_code = 'QF9272' AND choix_c = 'Les champignons photosynthétisent le bois';
UPDATE quiz_questions SET choix_d = 'Les deux sont des prédateurs qui s''attaquent aux merles noirs du jardin'
 WHERE question_code = 'QF9272' AND choix_d = 'Les deux sont des prédateurs de merles';


-- ---------------------------------------------------------------------------
-- Catégorie `energie_matiere` — 5 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'La quantité totale de prédateurs présents dans le milieu au fil de l''année'
 WHERE question_code = 'QF0091' AND choix_b = 'La quantité de prédateurs';
UPDATE quiz_questions SET choix_c = 'La masse des décomposeurs qui recyclent la matière morte'
 WHERE question_code = 'QF0091' AND choix_c = 'La masse des décomposeurs';
UPDATE quiz_questions SET choix_d = 'La quantité de pluie tombée sur le milieu dans l''année'
 WHERE question_code = 'QF0091' AND choix_d = 'La pluie tombée dans l''année';

UPDATE quiz_questions SET choix_b = 'Elle disparaît définitivement à chaque transfert'
 WHERE question_code = 'QF0093' AND choix_b = 'Elle disparaît définitivement';
UPDATE quiz_questions SET choix_c = 'Elle ne bouge jamais et reste où elle se trouve'
 WHERE question_code = 'QF0093' AND choix_c = 'Elle ne bouge jamais';
UPDATE quiz_questions SET choix_d = 'Elle augmente sans cesse au fil des saisons'
 WHERE question_code = 'QF0093' AND choix_d = 'Elle augmente sans cesse';

UPDATE quiz_questions SET choix_b = 'Il fabrique du pétrole à partir des déchets verts'
 WHERE question_code = 'QF0094' AND choix_b = 'Il fabrique du pétrole';
UPDATE quiz_questions SET choix_c = 'Il supprime tout le carbone contenu dans les déchets'
 WHERE question_code = 'QF0094' AND choix_c = 'Il supprime tout le carbone';
UPDATE quiz_questions SET choix_d = 'Il n''a aucun effet sur le carbone, seulement sur l''azote'
 WHERE question_code = 'QF0094' AND choix_d = 'Il n''a aucun effet sur le carbone';

UPDATE quiz_questions SET choix_b = 'du sol, qui la donne aux racines'
 WHERE question_code = 'QF0290' AND choix_b = 'du sol';
UPDATE quiz_questions SET choix_c = 'des décomposeurs du sol'
 WHERE question_code = 'QF0290' AND choix_c = 'des décomposeurs';
UPDATE quiz_questions SET choix_d = 'des prédateurs du milieu'
 WHERE question_code = 'QF0290' AND choix_d = 'des prédateurs';

UPDATE quiz_questions SET choix_b = 'Parce qu''ils produisent en deuxième, une fois que les plantes ont fini'
 WHERE question_code = 'QF0291' AND choix_b = 'Parce qu''ils produisent en deuxième';
UPDATE quiz_questions SET choix_c = 'Parce qu''ils font la photosynthèse comme les végétaux'
 WHERE question_code = 'QF0291' AND choix_c = 'Parce qu''ils font la photosynthèse';
UPDATE quiz_questions SET choix_d = 'Cela ne veut rien dire : le mot n''a pas de définition'
 WHERE question_code = 'QF0291' AND choix_d = 'Cela ne veut rien dire';


-- ---------------------------------------------------------------------------
-- Catégorie `environnement_durable` — 6 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Un manque total de vie dans l''eau du milieu'
 WHERE question_code = 'QF0140' AND choix_b = 'Un manque total de vie';
UPDATE quiz_questions SET choix_c = 'Trop de cailloux au fond de la mare ou du cours d''eau'
 WHERE question_code = 'QF0140' AND choix_c = 'Trop de cailloux';
UPDATE quiz_questions SET choix_d = 'Une eau trop froide pendant une grande partie de l''année'
 WHERE question_code = 'QF0140' AND choix_d = 'Une eau trop froide';

UPDATE quiz_questions SET choix_b = 'Ils montent dans l''air et s''y dispersent'
 WHERE question_code = 'QF0141' AND choix_b = 'Ils montent dans l''air';
UPDATE quiz_questions SET choix_c = 'Ils deviennent des cailloux au fond du sol'
 WHERE question_code = 'QF0141' AND choix_c = 'Ils deviennent des cailloux';
UPDATE quiz_questions SET choix_d = 'Ils disparaissent sans aucun effet sur le milieu'
 WHERE question_code = 'QF0141' AND choix_d = 'Ils disparaissent sans effet';

UPDATE quiz_questions SET choix_b = 'Il fait pousser les plantes trop vite et les affaiblit'
 WHERE question_code = 'QF0142' AND choix_b = 'Il fait pousser les plantes trop vite';
UPDATE quiz_questions SET choix_c = 'Il améliore la biodiversité en éliminant les ravageurs'
 WHERE question_code = 'QF0142' AND choix_c = 'Il améliore la biodiversité';
UPDATE quiz_questions SET choix_d = 'Il n''a aucun effet secondaire une fois la pluie passée'
 WHERE question_code = 'QF0142' AND choix_d = 'Il n''a aucun effet secondaire';

UPDATE quiz_questions SET choix_b = 'Produire le plus possible tout de suite, sans se limiter'
 WHERE question_code = 'QF0143' AND choix_b = 'Produire le plus possible tout de suite';
UPDATE quiz_questions SET choix_c = 'Abandonner toute agriculture pour laisser faire la nature'
 WHERE question_code = 'QF0143' AND choix_c = 'Abandonner toute agriculture';
UPDATE quiz_questions SET choix_d = 'Utiliser uniquement des machines pour économiser le travail des jardiniers'
 WHERE question_code = 'QF0143' AND choix_d = 'Utiliser uniquement des machines';

UPDATE quiz_questions SET choix_b = 'élever des poissons pour compléter ses repas'
 WHERE question_code = 'QF0340' AND choix_b = 'élever des poissons';
UPDATE quiz_questions SET choix_c = 'fabriquer du plastique à partir des emballages'
 WHERE question_code = 'QF0340' AND choix_c = 'fabriquer du plastique';
UPDATE quiz_questions SET choix_d = 'produire de l''électricité grâce à la chaleur du tas'
 WHERE question_code = 'QF0340' AND choix_d = 'produire de l''électricité';

UPDATE quiz_questions SET choix_b = 'Cela fait pousser des arbres partout où l''eau de pluie ruisselle ensuite'
 WHERE question_code = 'QF0341' AND choix_b = 'Cela fait pousser des arbres partout';
UPDATE quiz_questions SET choix_c = 'Cela n''a aucun effet : l''azote est un élément naturel'
 WHERE question_code = 'QF0341' AND choix_c = 'Cela n''a aucun effet';
UPDATE quiz_questions SET choix_d = 'Cela nettoie les rivières en nourrissant les poissons'
 WHERE question_code = 'QF0341' AND choix_d = 'Cela nettoie les rivières';


-- ---------------------------------------------------------------------------
-- Catégorie `evolution_biodiversite` — 6 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'de trois espèces sauvages sans aucun lien entre elles'
 WHERE question_code = 'QF0111' AND choix_b = 'de trois espèces sans aucun lien';
UPDATE quiz_questions SET choix_c = 'de croisements entre des plantes et des animaux'
 WHERE question_code = 'QF0111' AND choix_c = 'de croisements avec des animaux';
UPDATE quiz_questions SET choix_d = 'd''une plante des océans ramenée sur la terre ferme'
 WHERE question_code = 'QF0111' AND choix_d = 'd''une plante des océans';

UPDATE quiz_questions SET choix_b = 'Pour réduire volontairement les récoltes à venir'
 WHERE question_code = 'QF0112' AND choix_b = 'Pour réduire les récoltes';
UPDATE quiz_questions SET choix_c = 'Parce que toute autre semence est interdite à la vente et au semis'
 WHERE question_code = 'QF0112' AND choix_c = 'Parce que c''est interdit autrement';
UPDATE quiz_questions SET choix_d = 'Cela n''a aucun intérêt : les variétés se valent toutes'
 WHERE question_code = 'QF0112' AND choix_d = 'Cela n''a aucun intérêt';

UPDATE quiz_questions SET choix_b = 'une espèce protégée par la réglementation'
 WHERE question_code = 'QF0113' AND choix_b = 'une espèce protégée';
UPDATE quiz_questions SET choix_c = 'une plante aquatique des bassins et des mares'
 WHERE question_code = 'QF0113' AND choix_c = 'une plante aquatique';
UPDATE quiz_questions SET choix_d = 'un décomposeur de la vase au fond de l''eau'
 WHERE question_code = 'QF0113' AND choix_d = 'un décomposeur';

UPDATE quiz_questions SET choix_b = 'En un seul mot français, toujours au singulier'
 WHERE question_code = 'QF0115' AND choix_b = 'En un seul mot français';
UPDATE quiz_questions SET choix_c = 'Avec un chiffre qui donne son rang de découverte'
 WHERE question_code = 'QF0115' AND choix_c = 'Avec un chiffre';
UPDATE quiz_questions SET choix_d = 'Toujours en majuscules, genre et espèce compris'
 WHERE question_code = 'QF0115' AND choix_d = 'Toujours en majuscules';

UPDATE quiz_questions SET choix_b = 'Il pousse trop vite et épuise le sol en un an'
 WHERE question_code = 'QF0310' AND choix_b = 'Il pousse trop vite';
UPDATE quiz_questions SET choix_c = 'Il attire trop d''abeilles au moment de la floraison'
 WHERE question_code = 'QF0310' AND choix_c = 'Il attire trop d''abeilles';
UPDATE quiz_questions SET choix_d = 'Il n''est pas fragile : une seule variété suffit'
 WHERE question_code = 'QF0310' AND choix_d = 'Il n''est pas fragile';

UPDATE quiz_questions SET choix_b = 'Uniquement le nombre de prédateurs présents au sommet du réseau'
 WHERE question_code = 'QF9107' AND choix_b = 'Uniquement le nombre de prédateurs';
UPDATE quiz_questions SET choix_c = 'Uniquement la couleur des fleurs observées au fil des saisons'
 WHERE question_code = 'QF9107' AND choix_c = 'Uniquement la couleur des fleurs';
UPDATE quiz_questions SET choix_d = 'Le nom français des plantes, à côté de leur nom scientifique'
 WHERE question_code = 'QF9107' AND choix_d = 'Le nom français des plantes';


-- ---------------------------------------------------------------------------
-- Catégorie `identification_especes` — 1 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_a = 'Phasme morose, camouflé en brindille'
 WHERE question_code = 'QF0352' AND choix_a = 'Phasme morose';
UPDATE quiz_questions SET choix_c = 'Argiope, l''araignée rayée du jardin'
 WHERE question_code = 'QF0352' AND choix_c = 'Argiope';
UPDATE quiz_questions SET choix_d = 'Piéride du chou, papillon blanc'
 WHERE question_code = 'QF0352' AND choix_d = 'Piéride du chou';


-- ---------------------------------------------------------------------------
-- Catégorie `plantes_biologie` — 9 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'un légume-racine, comme la carotte ou le radis'
 WHERE question_code = 'QF0042' AND choix_b = 'un légume-racine';
UPDATE quiz_questions SET choix_c = 'une fleur, puisqu''elle pousse après la floraison'
 WHERE question_code = 'QF0042' AND choix_c = 'une fleur';
UPDATE quiz_questions SET choix_d = 'une graine, puisqu''on la sème pour la reproduire'
 WHERE question_code = 'QF0042' AND choix_d = 'une graine';

UPDATE quiz_questions SET choix_b = 'De viande et d''eau, comme un animal du jardin'
 WHERE question_code = 'QF0043' AND choix_b = 'De viande et d''eau';
UPDATE quiz_questions SET choix_c = 'D''obscurité totale, jour et nuit sans exception'
 WHERE question_code = 'QF0043' AND choix_c = 'D''obscurité totale';
UPDATE quiz_questions SET choix_d = 'D''azote uniquement, apporté par un engrais'
 WHERE question_code = 'QF0043' AND choix_d = 'D''azote uniquement';

UPDATE quiz_questions SET choix_b = 'Faire la photosynthèse à l''abri de la lumière'
 WHERE question_code = 'QF0240' AND choix_b = 'Faire la photosynthèse';
UPDATE quiz_questions SET choix_c = 'Attirer les abeilles et les autres pollinisateurs'
 WHERE question_code = 'QF0240' AND choix_c = 'Attirer les abeilles';
UPDATE quiz_questions SET choix_d = 'Produire le pollen qui féconde les fleurs'
 WHERE question_code = 'QF0240' AND choix_d = 'Produire le pollen';

UPDATE quiz_questions SET choix_b = 'À respirer uniquement, comme le font aussi les feuilles'
 WHERE question_code = 'QF0241' AND choix_b = 'À respirer uniquement';
UPDATE quiz_questions SET choix_c = 'À absorber l''eau et les minéraux du sol'
 WHERE question_code = 'QF0241' AND choix_c = 'À absorber l''eau';
UPDATE quiz_questions SET choix_d = 'À rien de précis : c''est un simple ornement'
 WHERE question_code = 'QF0241' AND choix_d = 'À rien de précis';

UPDATE quiz_questions SET choix_b = 'Sur les racines, en profondeur dans le sol'
 WHERE question_code = 'QF0242' AND choix_b = 'Sur les racines';
UPDATE quiz_questions SET choix_c = 'Sur les feuilles, là où arrive la lumière'
 WHERE question_code = 'QF0242' AND choix_c = 'Sur les feuilles';
UPDATE quiz_questions SET choix_d = 'Dans le sol, au pied de la plante'
 WHERE question_code = 'QF0242' AND choix_d = 'Dans le sol';

UPDATE quiz_questions SET choix_b = 'La plante oxyde elle-même l''ammonium en nitrate dans ses feuilles, sans aide'
 WHERE question_code = 'QF9109' AND choix_b = 'La plante oxyde l’ammonium en nitrate dans ses feuilles';
UPDATE quiz_questions SET choix_c = 'La plante transforme elle-même le nitrate du sol en diazote atmosphérique par ses racines'
 WHERE question_code = 'QF9109' AND choix_c = 'La plante transforme le nitrate en diazote atmosphérique';
UPDATE quiz_questions SET choix_d = 'Toute légumineuse empêche toute carence azotée au jardin, quel que soit le sol'
 WHERE question_code = 'QF9109' AND choix_d = 'Toute légumineuse empêche toute carence azotée au jardin';

UPDATE quiz_questions SET choix_b = 'La plante fabrique l''azote toute seule dans ses feuilles, grâce à la lumière du soleil'
 WHERE question_code = 'QF9250' AND choix_b = 'La plante fabrique l’azote toute seule dans ses feuilles';
UPDATE quiz_questions SET choix_c = 'Le Rhizobium chasse les pucerons installés sur la légumineuse'
 WHERE question_code = 'QF9250' AND choix_c = 'Le Rhizobium chasse les pucerons';
UPDATE quiz_questions SET choix_d = 'Toute légumineuse empêche toute carence azotée, partout et en tout sol'
 WHERE question_code = 'QF9250' AND choix_d = 'Toute légumineuse empêche toute carence, partout';

UPDATE quiz_questions SET choix_b = 'Oui : ce sont deux cactus du désert, également adaptés à une très longue sécheresse'
 WHERE question_code = 'QF9265' AND choix_b = 'Oui : les deux sont des cactus du désert';
UPDATE quiz_questions SET choix_c = 'Oui : les deux fixent le diazote dissous dans l''eau qu''ils absorbent par leurs racines'
 WHERE question_code = 'QF9265' AND choix_c = 'Oui : les deux fixent N2 dans l’eau';
UPDATE quiz_questions SET choix_d = 'Non : le volubilis est en réalité un champignon grimpant des sous-bois les plus humides'
 WHERE question_code = 'QF9265' AND choix_d = 'Non : le volubilis est un champignon';

UPDATE quiz_questions SET choix_b = 'Ce sont des poissons d''aquaponie élevés dans le bassin pédagogique installé au lycée'
 WHERE question_code = 'QF9270' AND choix_b = 'Ce sont des poissons d’aquaponie';
UPDATE quiz_questions SET choix_c = 'Ils hibernent sous la neige, exactement comme les arbustes rampants de la toundra'
 WHERE question_code = 'QF9270' AND choix_c = 'Ils hibernent sous la neige de toundra';
UPDATE quiz_questions SET choix_d = 'Ils remplacent les bactéries nitrifiantes absentes des sols méditerranéens pauvres'
 WHERE question_code = 'QF9270' AND choix_d = 'Ils remplacent les bactéries nitrifiantes';


-- ---------------------------------------------------------------------------
-- Catégorie `populations_equilibres` — 6 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'La ressource la plus abondante, celle qui ne manque jamais'
 WHERE question_code = 'QF0121' AND choix_b = 'La plus grande quantité disponible';
UPDATE quiz_questions SET choix_c = 'Un animal nuisible qui freine la croissance des cultures'
 WHERE question_code = 'QF0121' AND choix_c = 'Un animal nuisible';
UPDATE quiz_questions SET choix_d = 'Un outil de jardin qui sert à limiter les semis'
 WHERE question_code = 'QF0121' AND choix_d = 'Un outil de jardin';

UPDATE quiz_questions SET choix_b = 'Le poids qu''un sol peut supporter sans se tasser'
 WHERE question_code = 'QF0122' AND choix_b = 'Le poids qu''un sol peut supporter';
UPDATE quiz_questions SET choix_c = 'Le nombre d''espèces différentes que l''on peut y observer sur une année'
 WHERE question_code = 'QF0122' AND choix_c = 'Le nombre d''espèces différentes';
UPDATE quiz_questions SET choix_d = 'La quantité de pluie qu''il peut recevoir par an'
 WHERE question_code = 'QF0122' AND choix_d = 'La quantité de pluie';

UPDATE quiz_questions SET choix_b = 'Il est plus fragile, car tout y dépend de tout'
 WHERE question_code = 'QF0123' AND choix_b = 'Il est plus fragile';
UPDATE quiz_questions SET choix_c = 'Il pousse plus lentement que les milieux simples'
 WHERE question_code = 'QF0123' AND choix_c = 'Il pousse plus lentement';
UPDATE quiz_questions SET choix_d = 'Il attire davantage de maladies et de ravageurs'
 WHERE question_code = 'QF0123' AND choix_d = 'Il attire plus de maladies';

UPDATE quiz_questions SET choix_b = 'biotique (vivant), comme les autres'
 WHERE question_code = 'QF0125' AND choix_b = 'biotique (vivant)';
UPDATE quiz_questions SET choix_c = 'trophique, lié à l''alimentation'
 WHERE question_code = 'QF0125' AND choix_c = 'trophique';
UPDATE quiz_questions SET choix_d = 'génétique, propre à l''espèce'
 WHERE question_code = 'QF0125' AND choix_d = 'génétique';

UPDATE quiz_questions SET choix_b = 'invasive, venue d''un autre pays'
 WHERE question_code = 'QF0320' AND choix_b = 'invasive';
UPDATE quiz_questions SET choix_c = 'parasite, qui vit aux dépens des racines des plantes'
 WHERE question_code = 'QF0320' AND choix_c = 'parasite';
UPDATE quiz_questions SET choix_d = 'inutile, sans rôle dans le sol'
 WHERE question_code = 'QF0320' AND choix_d = 'inutile';

UPDATE quiz_questions SET choix_b = 'De résistance uniquement : rien n''aurait bougé dans la haie pendant toute la tempête'
 WHERE question_code = 'QF9108' AND choix_b = 'De résistance uniquement : rien n’a bougé pendant la tempête';
UPDATE quiz_questions SET choix_c = 'De dérive génétique chez les oiseaux migrateurs de la haie'
 WHERE question_code = 'QF9108' AND choix_c = 'De dérive génétique chez les oiseaux migrateurs';
UPDATE quiz_questions SET choix_d = 'D''une nitrification arrêtée à jamais par le passage du vent'
 WHERE question_code = 'QF9108' AND choix_d = 'D’une nitrification arrêtée à jamais';


-- ---------------------------------------------------------------------------
-- Catégorie `pratiques_potager` — 14 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Parce qu''ils ont la même couleur de feuillage au potager'
 WHERE question_code = 'QF0050' AND choix_b = 'Parce qu''ils ont la même couleur';
UPDATE quiz_questions SET choix_c = 'Pour qu''ils se gênent et restent tous les trois plus petits'
 WHERE question_code = 'QF0050' AND choix_c = 'Pour qu''ils se gênent';
UPDATE quiz_questions SET choix_d = 'Cela n''a aucun intérêt : c''est une simple habitude'
 WHERE question_code = 'QF0050' AND choix_d = 'Cela n''a aucun intérêt';

UPDATE quiz_questions SET choix_b = 'Empêcher les plantes cultivées de pousser trop haut au printemps'
 WHERE question_code = 'QF0051' AND choix_b = 'Empêcher les plantes de pousser';
UPDATE quiz_questions SET choix_c = 'Attirer les pucerons loin des plants de légumes'
 WHERE question_code = 'QF0051' AND choix_c = 'Attirer les pucerons';
UPDATE quiz_questions SET choix_d = 'Refroidir les racines pendant tout l''hiver'
 WHERE question_code = 'QF0051' AND choix_d = 'Refroidir les racines en hiver';

UPDATE quiz_questions SET choix_b = 'Pour décorer le jardin en changeant les couleurs'
 WHERE question_code = 'QF0052' AND choix_b = 'Pour décorer le jardin';
UPDATE quiz_questions SET choix_c = 'Cela abîme le sol, mais on le fait par tradition'
 WHERE question_code = 'QF0052' AND choix_c = 'Cela abîme le sol';
UPDATE quiz_questions SET choix_d = 'Pour que tout pousse plus lentement et dure plus longtemps'
 WHERE question_code = 'QF0052' AND choix_d = 'Pour que tout pousse plus lentement';

UPDATE quiz_questions SET choix_b = 'Un sol nu pousse mieux car il chauffe plus vite'
 WHERE question_code = 'QF0250' AND choix_b = 'Un sol nu pousse mieux';
UPDATE quiz_questions SET choix_c = 'Pour économiser le paillis et le garder pour l''hiver'
 WHERE question_code = 'QF0250' AND choix_c = 'Pour économiser le paillis';
UPDATE quiz_questions SET choix_d = 'Cela n''a pas d''importance : le sol se refait tout seul'
 WHERE question_code = 'QF0250' AND choix_d = 'Cela n''a pas d''importance';

UPDATE quiz_questions SET choix_b = 'Ils ont besoin l''un de l''autre pour fleurir et donner des fruits'
 WHERE question_code = 'QF0251' AND choix_b = 'Ils ont besoin l''un de l''autre pour fleurir';
UPDATE quiz_questions SET choix_c = 'Le basilic donne de l''eau à la tomate par ses racines'
 WHERE question_code = 'QF0251' AND choix_c = 'Le basilic donne de l''eau à la tomate';
UPDATE quiz_questions SET choix_d = 'Pour la couleur du feuillage, vert clair et vert foncé'
 WHERE question_code = 'QF0251' AND choix_d = 'Pour la couleur';

UPDATE quiz_questions SET choix_b = 'En bétonnant le sol pour qu''il reste toujours propre'
 WHERE question_code = 'QF0252' AND choix_b = 'En bétonnant le sol';
UPDATE quiz_questions SET choix_c = 'En supprimant toutes les fleurs du potager'
 WHERE question_code = 'QF0252' AND choix_c = 'En supprimant toutes les fleurs';
UPDATE quiz_questions SET choix_d = 'En traitant tout le jardin aux pesticides'
 WHERE question_code = 'QF0252' AND choix_d = 'En traitant tout aux pesticides';

UPDATE quiz_questions SET choix_b = 'la même plante au même endroit, pour continuer'
 WHERE question_code = 'QF0253' AND choix_b = 'la même plante au même endroit';
UPDATE quiz_questions SET choix_c = 'rien pendant trois ans, le temps que le sol se repose'
 WHERE question_code = 'QF0253' AND choix_c = 'rien pendant trois ans';
UPDATE quiz_questions SET choix_d = 'du gravier, pour couvrir la planche tout l''hiver'
 WHERE question_code = 'QF0253' AND choix_d = 'du gravier';

UPDATE quiz_questions SET choix_b = 'tout arracher chaque semaine pour garder un sol net'
 WHERE question_code = 'QF0254' AND choix_b = 'tout arracher chaque semaine';
UPDATE quiz_questions SET choix_c = 'couler du béton sur les allées et autour des planches'
 WHERE question_code = 'QF0254' AND choix_c = 'couler du béton';
UPDATE quiz_questions SET choix_d = 'ne jamais récolter pour laisser la nature travailler'
 WHERE question_code = 'QF0254' AND choix_d = 'ne jamais récolter';

UPDATE quiz_questions SET choix_b = 'Il empêche la pluie d''arriver jusqu''au sol'
 WHERE question_code = 'QF0255' AND choix_b = 'Il empêche la pluie d''arriver';
UPDATE quiz_questions SET choix_c = 'Il rend l''arrosage totalement inutile pendant l''été'
 WHERE question_code = 'QF0255' AND choix_c = 'Il rend l''eau inutile';
UPDATE quiz_questions SET choix_d = 'Il assèche le sol en absorbant toute l''eau'
 WHERE question_code = 'QF0255' AND choix_d = 'Il assèche le sol';

UPDATE quiz_questions SET choix_b = 'Utiliser une fourche-bêche pour soulever la touffe'
 WHERE question_code = 'QF9207' AND choix_b = 'Utiliser une fourche-bêche';
UPDATE quiz_questions SET choix_c = 'Intervenir après la pluie, quand le sol est meuble'
 WHERE question_code = 'QF9207' AND choix_c = 'Intervenir après la pluie';
UPDATE quiz_questions SET choix_d = 'Pailler ensuite la planche sur 8 à 10 cm'
 WHERE question_code = 'QF9207' AND choix_d = 'Pailler ensuite à 8–10 cm';

UPDATE quiz_questions SET choix_b = 'Il assèche trop le sol et tue les pissenlits utiles au diagnostic'
 WHERE question_code = 'QF9208' AND choix_b = 'Il assèche trop le sol et tue les pissenlits utiles';
UPDATE quiz_questions SET choix_c = 'Il détruit uniquement les légumineuses fixatrices d''azote du sol'
 WHERE question_code = 'QF9208' AND choix_c = 'Il détruit uniquement les légumineuses fixatrices';
UPDATE quiz_questions SET choix_d = 'Il rend l''eau bouillante inefficace sur les allées et les bordures enherbées'
 WHERE question_code = 'QF9208' AND choix_d = 'Il rend l’eau bouillante inefficace sur les allées';

UPDATE quiz_questions SET choix_b = 'Une allélopathie du fenouil, que ces deux cultures voisines partageraient entre elles'
 WHERE question_code = 'QF9218' AND choix_b = 'Allélopathie du fenouil partagée par les deux';
UPDATE quiz_questions SET choix_c = 'Les alliacées plantées juste à côté en masquent bien trop l''odeur naturelle au potager'
 WHERE question_code = 'QF9218' AND choix_c = 'Les alliacées masquent trop leur odeur';
UPDATE quiz_questions SET choix_d = 'Elles occupent exactement les mêmes niches écologiques que les Trois Sœurs'
 WHERE question_code = 'QF9218' AND choix_d = 'Elles occupent les mêmes niches que les Trois Sœurs';

UPDATE quiz_questions SET choix_b = 'Un semis la veille de la plantation du légume suffit largement'
 WHERE question_code = 'QF9219' AND choix_b = 'Un semis la veille du plant suffit';
UPDATE quiz_questions SET choix_c = 'Il faut le couper dès sa floraison et le mettre aussitôt au tas de compost'
 WHERE question_code = 'QF9219' AND choix_c = 'Il faut le couper dès la floraison et le mettre au compost';
UPDATE quiz_questions SET choix_d = 'L''associer au fenouil multiplie l''effet contre les nématodes'
 WHERE question_code = 'QF9219' AND choix_d = 'L’associer au fenouil multiplie l’effet';

UPDATE quiz_questions SET choix_b = 'La compétition pour l''eau, les minéraux et la lumière entre deux cultures gourmandes installées trop près l''une de l''autre sur la planche'
 WHERE question_code = 'QF9220' AND choix_b = 'La compétition pour l’eau et la lumière entre deux cultures gourmandes';
UPDATE quiz_questions SET choix_c = 'Le transfert de sucres d''une plante à l''autre par le réseau mycorhizien qui relie leurs racines dans toute l''épaisseur du sol cultivé'
 WHERE question_code = 'QF9220' AND choix_c = 'Le transfert de sucres via le réseau mycorhizien';
UPDATE quiz_questions SET choix_d = 'Le masquage olfactif d''une culture par l''odeur d''une autre, un phénomène uniquement aérien qui ne passe jamais par le sol'
 WHERE question_code = 'QF9220' AND choix_d = 'Le masquage olfactif uniquement aérien, jamais dans le sol';


-- ---------------------------------------------------------------------------
-- Catégorie `ravageurs_auxiliaires` — 16 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'un auxiliaire utile, qui protège la plante'
 WHERE question_code = 'QF0070' AND choix_b = 'un auxiliaire utile';
UPDATE quiz_questions SET choix_c = 'un pollinisateur des fleurs du potager'
 WHERE question_code = 'QF0070' AND choix_c = 'un pollinisateur';
UPDATE quiz_questions SET choix_d = 'un décomposeur de la matière morte'
 WHERE question_code = 'QF0070' AND choix_d = 'un décomposeur';

UPDATE quiz_questions SET choix_b = 'Sur les tomates et les autres Solanacées'
 WHERE question_code = 'QF0072' AND choix_b = 'Sur les tomates';
UPDATE quiz_questions SET choix_c = 'Sur les cactus et les plantes grasses'
 WHERE question_code = 'QF0072' AND choix_c = 'Sur les cactus';
UPDATE quiz_questions SET choix_d = 'Sur les nénuphars et les plantes de mare'
 WHERE question_code = 'QF0072' AND choix_d = 'Sur les nénuphars';

UPDATE quiz_questions SET choix_b = 'Arroser davantage pour noyer les ravageurs'
 WHERE question_code = 'QF0073' AND choix_b = 'Arroser davantage';
UPDATE quiz_questions SET choix_c = 'Mettre plus d''engrais pour renforcer les plantes'
 WHERE question_code = 'QF0073' AND choix_c = 'Mettre plus d''engrais';
UPDATE quiz_questions SET choix_d = 'Couper toutes les fleurs où ils se posent'
 WHERE question_code = 'QF0073' AND choix_d = 'Couper toutes les fleurs';

UPDATE quiz_questions SET choix_b = 'mangeant les racines sous la surface du sol, au pied de la plante'
 WHERE question_code = 'QF0270' AND choix_b = 'mangeant les racines';
UPDATE quiz_questions SET choix_c = 'creusant le sol au pied de la plante'
 WHERE question_code = 'QF0270' AND choix_c = 'creusant le sol';
UPDATE quiz_questions SET choix_d = 'pollinisant les fleurs qu''elle visite'
 WHERE question_code = 'QF0270' AND choix_d = 'pollinisant les fleurs';

UPDATE quiz_questions SET choix_b = 'Les fourmis mangent les pucerons qu''elles rencontrent'
 WHERE question_code = 'QF0271' AND choix_b = 'Les fourmis mangent les pucerons';
UPDATE quiz_questions SET choix_c = 'Par pur hasard : les deux fréquentent simplement les mêmes plantes'
 WHERE question_code = 'QF0271' AND choix_c = 'Par hasard total';
UPDATE quiz_questions SET choix_d = 'Les fourmis pollinisent les pucerons pour les reproduire'
 WHERE question_code = 'QF0271' AND choix_d = 'Les fourmis pollinisent les pucerons';

UPDATE quiz_questions SET choix_b = 'à son venin, injecté par une morsure'
 WHERE question_code = 'QF0272' AND choix_b = 'à son venin';
UPDATE quiz_questions SET choix_c = 'à sa vitesse, qui lui permet de fuir'
 WHERE question_code = 'QF0272' AND choix_c = 'à sa vitesse';
UPDATE quiz_questions SET choix_d = 'à sa carapace dure, qui le rend intouchable'
 WHERE question_code = 'QF0272' AND choix_d = 'à sa carapace dure';

UPDATE quiz_questions SET choix_b = 'Elle ne sert à rien dans un bassin de jardin'
 WHERE question_code = 'QF0273' AND choix_b = 'Elle ne sert à rien';
UPDATE quiz_questions SET choix_c = 'Elle pollinise les plantes aquatiques du bassin'
 WHERE question_code = 'QF0273' AND choix_c = 'Elle pollinise les plantes';
UPDATE quiz_questions SET choix_d = 'Elle fabrique de l''azote assimilable pour les plantes du bassin'
 WHERE question_code = 'QF0273' AND choix_d = 'Elle fabrique de l''azote';

UPDATE quiz_questions SET choix_b = 'Elle pollinise exclusivement les fleurs de tomate'
 WHERE question_code = 'QF9251' AND choix_b = 'Elle pollinise exclusivement les tomates';
UPDATE quiz_questions SET choix_c = 'Elle fixe l''azote de l''air comme un Rhizobium'
 WHERE question_code = 'QF9251' AND choix_c = 'Elle fixe l’azote comme un Rhizobium';
UPDATE quiz_questions SET choix_d = 'Elle décompose le bois mort tombé au sol'
 WHERE question_code = 'QF9251' AND choix_d = 'Elle décompose le bois mort';

UPDATE quiz_questions SET choix_b = 'de pucerons installés sur les raquettes du cactus'
 WHERE question_code = 'QF9253' AND choix_b = 'de pucerons';
UPDATE quiz_questions SET choix_c = 'de litière de feuilles, uniquement'
 WHERE question_code = 'QF9253' AND choix_c = 'de litière de feuilles uniquement';
UPDATE quiz_questions SET choix_d = 'de nectar de lavande et de romarin'
 WHERE question_code = 'QF9253' AND choix_d = 'de nectar de lavande';

UPDATE quiz_questions SET choix_b = 'est uniquement un ravageur des cultures, jamais un auxiliaire du potager'
 WHERE question_code = 'QF9255' AND choix_b = 'est uniquement un ravageur, jamais un auxiliaire';
UPDATE quiz_questions SET choix_c = 'nitrifie le sol du potager comme le fait la bactérie Nitrosomonas'
 WHERE question_code = 'QF9255' AND choix_c = 'nitrifie le sol comme Nitrosomonas';
UPDATE quiz_questions SET choix_d = 'ne se nourrit que du nectar des fleurs qu''il visite la nuit'
 WHERE question_code = 'QF9255' AND choix_d = 'ne se nourrit que de nectar';

UPDATE quiz_questions SET choix_b = 'Elles fixent l''azote dissous dans l''eau de la mare qu''elles survolent'
 WHERE question_code = 'QF9257' AND choix_b = 'Elles fixent l’azote de l’eau';
UPDATE quiz_questions SET choix_c = 'Elles pollinisent les nénuphars pendant la nuit'
 WHERE question_code = 'QF9257' AND choix_c = 'Elles pollinisent les nénuphars la nuit';
UPDATE quiz_questions SET choix_d = 'Elles décomposent la vase au fond de la mare'
 WHERE question_code = 'QF9257' AND choix_d = 'Elles décomposent la vase';

UPDATE quiz_questions SET choix_b = 'pollinisant les fleurs de courge la nuit'
 WHERE question_code = 'QF9258' AND choix_b = 'pollinisant les courges';
UPDATE quiz_questions SET choix_c = 'fixant le diazote dans ses glandes'
 WHERE question_code = 'QF9258' AND choix_c = 'fixant N2 dans ses glandes';
UPDATE quiz_questions SET choix_d = 'fabriquant de l''humus, comme le ferait un champignon'
 WHERE question_code = 'QF9258' AND choix_d = 'fabriquant de l’humus comme un champignon';

UPDATE quiz_questions SET choix_b = 'ne se nourrit que du nectar des fleurs du jardin'
 WHERE question_code = 'QF9259' AND choix_b = 'ne se nourrit que de nectar';
UPDATE quiz_questions SET choix_c = 'nitrifie l''ammonium du sol et le transforme en nitrate'
 WHERE question_code = 'QF9259' AND choix_c = 'nitrifie l’ammonium';
UPDATE quiz_questions SET choix_d = 'est un décomposeur du bois mort tombé au sol'
 WHERE question_code = 'QF9259' AND choix_d = 'est un décomposeur de bois mort';

UPDATE quiz_questions SET choix_b = 'un pollinisateur des fleurs de lavande'
 WHERE question_code = 'QF9262' AND choix_b = 'un pollinisateur de lavande';
UPDATE quiz_questions SET choix_c = 'un producteur photosynthétique du sol'
 WHERE question_code = 'QF9262' AND choix_c = 'un producteur photosynthétique';
UPDATE quiz_questions SET choix_d = 'un nœud-nourriture inerte du réseau'
 WHERE question_code = 'QF9262' AND choix_d = 'un nœud-nourriture inerte';

UPDATE quiz_questions SET choix_b = 'Uniquement du nectar de fleurs, comme les papillons du jardin'
 WHERE question_code = 'QF9266' AND choix_b = 'Uniquement du nectar';
UPDATE quiz_questions SET choix_c = 'Uniquement de la litière morte, exactement comme le fait un champignon'
 WHERE question_code = 'QF9266' AND choix_c = 'Uniquement de la litière morte, comme un champignon';
UPDATE quiz_questions SET choix_d = 'Rien du tout : ce sont des décomposeurs stricts de la litière du sol'
 WHERE question_code = 'QF9266' AND choix_d = 'Rien : ce sont des décomposeurs stricts';

UPDATE quiz_questions SET choix_b = 'Remplacer entièrement l''arrosage des légumes plantés juste à côté d''eux au potager'
 WHERE question_code = 'QF9269' AND choix_b = 'Remplacer toute irrigation';
UPDATE quiz_questions SET choix_c = 'Tuer les vers de terre qui gênent les racines des jeunes plants de légumes repiqués'
 WHERE question_code = 'QF9269' AND choix_c = 'Tuer les vers de terre';
UPDATE quiz_questions SET choix_d = 'Fixer le diazote de l''air à la place des haricots plantés sur la même planche du potager'
 WHERE question_code = 'QF9269' AND choix_d = 'Fixer N2 à la place du haricot';


-- ---------------------------------------------------------------------------
-- Catégorie `semis_recolte` — 10 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Une plante qui vit plusieurs années de suite au même endroit'
 WHERE question_code = 'QF0060' AND choix_b = 'Une plante qui vit plusieurs années';
UPDATE quiz_questions SET choix_c = 'Une plante qui ne fleurit jamais, quelle que soit l''année'
 WHERE question_code = 'QF0060' AND choix_c = 'Une plante qui ne fleurit jamais';
UPDATE quiz_questions SET choix_d = 'Une plante d''intérieur, cultivée en pot toute l''année'
 WHERE question_code = 'QF0060' AND choix_d = 'Une plante d''intérieur';

UPDATE quiz_questions SET choix_b = 'Une graine spéciale que l''on achète déjà germée'
 WHERE question_code = 'QF0061' AND choix_b = 'Une graine spéciale';
UPDATE quiz_questions SET choix_c = 'Une maladie des plantes qui déforme les tiges'
 WHERE question_code = 'QF0061' AND choix_c = 'Une maladie des plantes';
UPDATE quiz_questions SET choix_d = 'Un type d''engrais que l''on ajoute au sol au moment du semis des graines'
 WHERE question_code = 'QF0061' AND choix_d = 'Un type d''engrais';

UPDATE quiz_questions SET choix_b = 'Après la floraison, quand les graines sont formées'
 WHERE question_code = 'QF0062' AND choix_b = 'Après la floraison';
UPDATE quiz_questions SET choix_c = 'Seulement en hiver, quand il fait assez froid'
 WHERE question_code = 'QF0062' AND choix_c = 'Seulement en hiver';
UPDATE quiz_questions SET choix_d = 'Quand les feuilles jaunissent au bas du pied'
 WHERE question_code = 'QF0062' AND choix_d = 'Quand les feuilles jaunissent';

UPDATE quiz_questions SET choix_b = 'Le plus profond possible, pour la protéger'
 WHERE question_code = 'QF0260' AND choix_b = 'Le plus profond possible';
UPDATE quiz_questions SET choix_c = 'À 30 cm de profondeur, quelle que soit l''espèce'
 WHERE question_code = 'QF0260' AND choix_c = 'À 30 cm de profondeur';
UPDATE quiz_questions SET choix_d = 'Toujours posée sur le sol, sans la recouvrir'
 WHERE question_code = 'QF0260' AND choix_d = 'Toujours posée sur le sol';

UPDATE quiz_questions SET choix_b = 'Pour gaspiller volontairement une partie des graines'
 WHERE question_code = 'QF0261' AND choix_b = 'Pour gaspiller des graines';
UPDATE quiz_questions SET choix_c = 'Pour attirer les pucerons sur les plants arrachés'
 WHERE question_code = 'QF0261' AND choix_c = 'Pour attirer les pucerons';
UPDATE quiz_questions SET choix_d = 'Cela ne sert à rien : les plants finissent par s''arranger entre eux'
 WHERE question_code = 'QF0261' AND choix_d = 'Cela ne sert à rien';

UPDATE quiz_questions SET choix_b = 'arrête aussitôt la production de la plante'
 WHERE question_code = 'QF0264' AND choix_b = 'arrête la production';
UPDATE quiz_questions SET choix_c = 'tue la plante en quelques jours seulement'
 WHERE question_code = 'QF0264' AND choix_c = 'tue la plante aussitôt';
UPDATE quiz_questions SET choix_d = 'n''a aucun effet sur la suite de la récolte'
 WHERE question_code = 'QF0264' AND choix_d = 'n''a aucun effet';

UPDATE quiz_questions SET choix_b = 'Pour qu''ils ne poussent jamais avant la belle saison'
 WHERE question_code = 'QF0265' AND choix_b = 'Pour qu''ils ne poussent jamais';
UPDATE quiz_questions SET choix_c = 'Pour les empêcher de germer trop tôt dans la saison'
 WHERE question_code = 'QF0265' AND choix_c = 'Pour les empêcher de germer';
UPDATE quiz_questions SET choix_d = 'Aucune raison particulière : c''est une vieille habitude'
 WHERE question_code = 'QF0265' AND choix_d = 'Aucune raison';

UPDATE quiz_questions SET choix_b = 'Parce que le collet doit toujours être enterré plus bas que dans l''ancien pot, sans exception'
 WHERE question_code = 'QF9213' AND choix_b = 'Parce que le collet doit toujours être enterré plus bas';
UPDATE quiz_questions SET choix_c = 'Parce que la terre cuite se fissure au-delà de cinq centimètres d''écart'
 WHERE question_code = 'QF9213' AND choix_c = 'Parce que la terre cuite se fissure au-delà de +5 cm';
UPDATE quiz_questions SET choix_d = 'Parce que l''éthylène ne se produit que dans les pots de grande taille'
 WHERE question_code = 'QF9213' AND choix_d = 'Parce que l’éthylène ne se produit que dans les grands pots';

UPDATE quiz_questions SET choix_b = 'Elles sont toujours stériles, sans aucune exception connue'
 WHERE question_code = 'QF9229' AND choix_b = 'Elles sont toujours stériles, sans exception';
UPDATE quiz_questions SET choix_c = 'Elles ne germent qu''après une fermentation de plusieurs jours dans l''eau'
 WHERE question_code = 'QF9229' AND choix_c = 'Elles germent uniquement après fermentation';
UPDATE quiz_questions SET choix_d = 'Leur rapport C/N est trop élevé pour permettre le stockage'
 WHERE question_code = 'QF9229' AND choix_d = 'Leur C/N est trop élevé pour le stockage';

UPDATE quiz_questions SET choix_b = 'Un isolement de 300 m entre deux variétés voisines, à cause du vent'
 WHERE question_code = 'QF9230' AND choix_b = 'Isolement de 300 m à cause du vent';
UPDATE quiz_questions SET choix_c = 'Attendre la deuxième année pour récolter les graines, car c''est une plante bisannuelle'
 WHERE question_code = 'QF9230' AND choix_c = 'Attendre la 2e année (plante bisannuelle)';
UPDATE quiz_questions SET choix_d = 'Ne jamais faire sécher les graines récoltées plus de quarante-huit heures'
 WHERE question_code = 'QF9230' AND choix_d = 'Ne jamais sécher plus de 48 h';


-- ---------------------------------------------------------------------------
-- Catégorie `sol_compost` — 22 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Du plastique, issu des emballages jetés au tas avec les épluchures'
 WHERE question_code = 'QF0030' AND choix_b = 'Du plastique';
UPDATE quiz_questions SET choix_c = 'De la cendre, comme après un feu de jardin'
 WHERE question_code = 'QF0030' AND choix_c = 'De la cendre';
UPDATE quiz_questions SET choix_d = 'Rien : tout finit par disparaître entièrement'
 WHERE question_code = 'QF0030' AND choix_d = 'Rien, tout disparaît';

UPDATE quiz_questions SET choix_b = 'Oui, il dévore les racines des jeunes plants'
 WHERE question_code = 'QF0031' AND choix_b = 'Oui, il dévore les racines';
UPDATE quiz_questions SET choix_c = 'Oui, mais seulement la nuit, quand il remonte'
 WHERE question_code = 'QF0031' AND choix_c = 'Oui, mais seulement la nuit';
UPDATE quiz_questions SET choix_d = 'Non, il ne mange rien : il avale de l''air'
 WHERE question_code = 'QF0031' AND choix_d = 'Non, il ne mange rien';

UPDATE quiz_questions SET choix_b = 'Il contient trop de feuilles sèches et de matières brunes mal mélangées'
 WHERE question_code = 'QF0032' AND choix_b = 'Il contient trop de feuilles sèches';
UPDATE quiz_questions SET choix_c = 'Il est trop aéré : on le retourne beaucoup trop souvent'
 WHERE question_code = 'QF0032' AND choix_c = 'Il est trop aéré';
UPDATE quiz_questions SET choix_d = 'Il est trop froid, faute de soleil sur le tas'
 WHERE question_code = 'QF0032' AND choix_d = 'Il est trop froid';

UPDATE quiz_questions SET choix_b = 'Un sol qui bouge tout seul sous l''effet de la pluie'
 WHERE question_code = 'QF0033' AND choix_b = 'Un sol qui bouge tout seul';
UPDATE quiz_questions SET choix_c = 'Un sol sans aucun être vivant, donc parfaitement propre'
 WHERE question_code = 'QF0033' AND choix_c = 'Un sol sans aucun être vivant';
UPDATE quiz_questions SET choix_d = 'Un sol entièrement minéral, fait de sable et de cailloux'
 WHERE question_code = 'QF0033' AND choix_d = 'Un sol entièrement minéral';

UPDATE quiz_questions SET choix_b = 'La transformation de la matière morte en pierre'
 WHERE question_code = 'QF0033b' AND choix_b = 'La transformation en pierre';
UPDATE quiz_questions SET choix_c = 'La fabrication de plastique à partir des déchets enfouis dans le sol'
 WHERE question_code = 'QF0033b' AND choix_c = 'La fabrication de plastique';
UPDATE quiz_questions SET choix_d = 'Le dessèchement complet du sol en surface'
 WHERE question_code = 'QF0033b' AND choix_d = 'Le dessèchement du sol';

UPDATE quiz_questions SET choix_b = 'Une maladie des racines causée par un champignon'
 WHERE question_code = 'QF0034b' AND choix_b = 'Une maladie des racines';
UPDATE quiz_questions SET choix_c = 'Un engrais chimique répandu au pied des plantes'
 WHERE question_code = 'QF0034b' AND choix_c = 'Un engrais chimique';
UPDATE quiz_questions SET choix_d = 'Un type de ver qui vit contre les racines'
 WHERE question_code = 'QF0034b' AND choix_d = 'Un type de ver';

UPDATE quiz_questions SET choix_b = 'Le sucre et le sel apportés au tas par les restes de cuisine'
 WHERE question_code = 'QF0230' AND choix_b = 'Le sucre et le sel';
UPDATE quiz_questions SET choix_c = 'L''eau chaude et l''eau froide versées sur le tas'
 WHERE question_code = 'QF0230' AND choix_c = 'L''eau chaude et l''eau froide';
UPDATE quiz_questions SET choix_d = 'Rien : tous les déchets se valent dans un compost'
 WHERE question_code = 'QF0230' AND choix_d = 'Rien, tout se vaut';

UPDATE quiz_questions SET choix_b = 'Ils mangent les plantes vivantes et les font dépérir'
 WHERE question_code = 'QF0231' AND choix_b = 'Ils mangent les plantes vivantes';
UPDATE quiz_questions SET choix_c = 'Ils font la photosynthèse grâce à la lumière du sol'
 WHERE question_code = 'QF0231' AND choix_c = 'Ils font la photosynthèse';
UPDATE quiz_questions SET choix_d = 'Ils n''ont aucun rôle particulier dans la vie du sol'
 WHERE question_code = 'QF0231' AND choix_d = 'Ils n''ont aucun rôle';

UPDATE quiz_questions SET choix_b = 'Des prédateurs de pucerons et d''autres petits insectes'
 WHERE question_code = 'QF0232' AND choix_b = 'Des prédateurs de pucerons';
UPDATE quiz_questions SET choix_c = 'Des plantes minuscules qui vivent dans le sol'
 WHERE question_code = 'QF0232' AND choix_c = 'Des plantes du sol';
UPDATE quiz_questions SET choix_d = 'Des bactéries visibles seulement au microscope'
 WHERE question_code = 'QF0232' AND choix_d = 'Des bactéries';

UPDATE quiz_questions SET choix_b = 'Le ver oxyde l''ammonium en nitrate, tandis que le champignon se contente de fragmenter la litière'
 WHERE question_code = 'QF9105' AND choix_b = 'Le ver oxyde l’ammonium en nitrate';
UPDATE quiz_questions SET choix_c = 'Le champignon chasse les vers de terre pour occuper seul la litière du sol de la forêt'
 WHERE question_code = 'QF9105' AND choix_c = 'Le champignon chasse les vers';
UPDATE quiz_questions SET choix_d = 'Les deux fabriquent de l''ATP dans le seul but de le stocker tout l''hiver dans le sol'
 WHERE question_code = 'QF9105' AND choix_d = 'Les deux fabriquent de l’ATP pour le stocker tout l’hiver';

UPDATE quiz_questions SET choix_b = 'Ajouter des déchets verts frais et couvrir le tas hermétiquement avec une bâche'
 WHERE question_code = 'QF9221' AND choix_b = 'Ajouter des verts frais et couvrir hermétiquement';
UPDATE quiz_questions SET choix_c = 'Ne pas y toucher du tout : c''est simplement la phase thermophile qui commence'
 WHERE question_code = 'QF9221' AND choix_c = 'Ne pas y toucher : c’est la phase thermophile';
UPDATE quiz_questions SET choix_d = 'Y mettre des rhizomes de liseron et de chiendent pour « aérer » le tas'
 WHERE question_code = 'QF9221' AND choix_d = 'Y mettre des rhizomes de liseron pour « aérer »';

UPDATE quiz_questions SET choix_b = 'Mesurer le rapport carbone sur azote du compost au laboratoire'
 WHERE question_code = 'QF9223' AND choix_b = 'Mesurer le C/N au laboratoire';
UPDATE quiz_questions SET choix_c = 'Détruire les graines d''adventices par la chaleur dégagée par le tas'
 WHERE question_code = 'QF9223' AND choix_c = 'Détruire les graines d’adventices par la chaleur';
UPDATE quiz_questions SET choix_d = 'Détecter la géosmine produite par les actinobactéries du tas mûr'
 WHERE question_code = 'QF9223' AND choix_d = 'Détecter la géosmine des actinobactéries';

UPDATE quiz_questions SET choix_b = 'Géosmine : c''est au contraire très bon signe'
 WHERE question_code = 'QF9234' AND choix_b = 'Géosmine, très bon signe';
UPDATE quiz_questions SET choix_c = 'Excès de calcaire : il faut chauler la planche'
 WHERE question_code = 'QF9234' AND choix_c = 'Excès de calcaire, chauler';
UPDATE quiz_questions SET choix_d = 'Trop de trèfle sauvage sur cette planche'
 WHERE question_code = 'QF9234' AND choix_d = 'Trop de trèfle sauvage';

UPDATE quiz_questions SET choix_b = 'Les vers de terre consomment tout le fer disponible'
 WHERE question_code = 'QF9235' AND choix_b = 'Les vers consomment tout le fer';
UPDATE quiz_questions SET choix_c = 'Le test du bocal élimine le fer du sol en vingt-quatre heures'
 WHERE question_code = 'QF9235' AND choix_c = 'Le test du bocal élimine le fer en 24 h';
UPDATE quiz_questions SET choix_d = 'Seule l''argile du sol contient du fer réellement assimilable'
 WHERE question_code = 'QF9235' AND choix_d = 'Seule l’argile contient du fer assimilable';

UPDATE quiz_questions SET choix_b = 'L''arracher comme le chiendent, fragment de racine par fragment'
 WHERE question_code = 'QF9236' AND choix_b = 'L’arracher comme le chiendent, fragment par fragment';
UPDATE quiz_questions SET choix_c = 'Chauler la planche immédiatement, avant tout semis'
 WHERE question_code = 'QF9236' AND choix_c = 'Chauler immédiatement';
UPDATE quiz_questions SET choix_d = 'Y voir le signe d''un sol trop riche, comme l''ortie'
 WHERE question_code = 'QF9236' AND choix_d = 'Y voir un sol trop riche, comme l’ortie';

UPDATE quiz_questions SET choix_b = 'Il serait déjà présent sous forme de nitrate assimilable'
 WHERE question_code = 'QF9237' AND choix_b = 'Il serait déjà sous forme nitrate';
UPDATE quiz_questions SET choix_c = 'Les champignons du sol le convertiraient en lignine stable'
 WHERE question_code = 'QF9237' AND choix_c = 'Les champignons le convertiraient en lignine';
UPDATE quiz_questions SET choix_d = 'Les turricules des vers de terre finiraient par le détruire entièrement'
 WHERE question_code = 'QF9237' AND choix_d = 'Les turricules le détruiraient';

UPDATE quiz_questions SET choix_b = 'Ils augmentent le pH du sol et bloquent ainsi l''absorption du fer'
 WHERE question_code = 'QF9238' AND choix_b = 'Ils augmentent le pH et bloquent le fer';
UPDATE quiz_questions SET choix_c = 'Ils fixent beaucoup trop d''azote et déséquilibrent la planche'
 WHERE question_code = 'QF9238' AND choix_c = 'Ils fixent trop d’azote';
UPDATE quiz_questions SET choix_d = 'Ils empêchent le test du cresson de fonctionner correctement'
 WHERE question_code = 'QF9238' AND choix_d = 'Ils empêchent le test du cresson';

UPDATE quiz_questions SET choix_b = 'Il se forme en quelques jours seulement, pendant la phase thermophile du tas de compost'
 WHERE question_code = 'QF9240' AND choix_b = 'Il se forme en quelques jours en phase thermophile';
UPDATE quiz_questions SET choix_c = 'Seules les bactéries du sol parviennent à le produire, jamais les champignons décomposeurs'
 WHERE question_code = 'QF9240' AND choix_c = 'Seules les bactéries le produisent, jamais les champignons';
UPDATE quiz_questions SET choix_d = 'Il ne retient pas l''eau, contrairement au compost encore jeune fabriqué dans l''année'
 WHERE question_code = 'QF9240' AND choix_d = 'Il ne retient pas l’eau, contrairement au compost';

UPDATE quiz_questions SET choix_b = 'un prédateur du sol qui s''attaque surtout aux vers de terre du compost'
 WHERE question_code = 'QF9256' AND choix_b = 'un prédateur de vers de terre';
UPDATE quiz_questions SET choix_c = 'un engrais chimique de synthèse que l''on répand au pied des plantes cultivées'
 WHERE question_code = 'QF9256' AND choix_c = 'un engrais chimique de synthèse';
UPDATE quiz_questions SET choix_d = 'une maladie des racines qui finit par faire dépérir la plante tout entière'
 WHERE question_code = 'QF9256' AND choix_d = 'une maladie qui tue toutes les racines';

UPDATE quiz_questions SET choix_b = 'Ce sont deux noms différents pour un seul et même animal, dans tous les cas de figure et en tout lieu du jardin'
 WHERE question_code = 'QF9261' AND choix_b = 'Ce sont deux noms pour le même animal, toujours';
UPDATE quiz_questions SET choix_c = 'Lumbricus ne se nourrit que de pucerons tombés au sol depuis les feuilles des arbres du verger'
 WHERE question_code = 'QF9261' AND choix_c = 'Lumbricus ne mange que des pucerons';
UPDATE quiz_questions SET choix_d = 'Eisenia oxyde l''ammonium en nitrate à l''intérieur même du bac de lombricompostage installé en classe'
 WHERE question_code = 'QF9261' AND choix_d = 'Eisenia oxyde l’ammonium en nitrate';

UPDATE quiz_questions SET choix_b = 'les deux signalent toujours un sol stérile, quel qu''il soit'
 WHERE question_code = 'QF9264' AND choix_b = 'les deux signalent toujours un sol stérile';
UPDATE quiz_questions SET choix_c = 'l''ortie indique un sol calcaire, et le pissenlit un sol resté à l''ombre'
 WHERE question_code = 'QF9264' AND choix_c = 'l’ortie indique le calcaire, le pissenlit l’ombre';
UPDATE quiz_questions SET choix_d = 'il faut les éradiquer toutes deux avant de pouvoir lire le sol'
 WHERE question_code = 'QF9264' AND choix_d = 'il faut les éradiquer avant de lire le sol';

UPDATE quiz_questions SET choix_b = 'un prédateur redoutable des pucerons installés au potager'
 WHERE question_code = 'QF9271' AND choix_b = 'un prédateur de pucerons';
UPDATE quiz_questions SET choix_c = 'un producteur photosynthétique installé à la surface du sol'
 WHERE question_code = 'QF9271' AND choix_c = 'un producteur photosynthétique';
UPDATE quiz_questions SET choix_d = 'un terme de glossaire dont l''usage serait rendu obligatoire'
 WHERE question_code = 'QF9271' AND choix_d = 'un terme de glossaire obligatoire';


-- ---------------------------------------------------------------------------
-- Catégorie `vivant_classification` — 5 question(s)
-- ---------------------------------------------------------------------------

UPDATE quiz_questions SET choix_b = 'Oui, c''est un insecte du jardin comme la fourmi'
 WHERE question_code = 'QF0002' AND choix_b = 'Oui, c''est un insecte';
UPDATE quiz_questions SET choix_c = 'Oui, car elle a des ailes comme la mouche'
 WHERE question_code = 'QF0002' AND choix_c = 'Oui, car elle a des ailes';
UPDATE quiz_questions SET choix_d = 'Non, c''est un ver, sans pattes ni carapace'
 WHERE question_code = 'QF0002' AND choix_d = 'Non, c''est un ver';

UPDATE quiz_questions SET choix_b = 'insecte (six pattes et trois parties au corps)'
 WHERE question_code = 'QF0004' AND choix_b = 'insecte';
UPDATE quiz_questions SET choix_c = 'mille-pattes (un myriapode du sol)'
 WHERE question_code = 'QF0004' AND choix_c = 'mille-pattes';
UPDATE quiz_questions SET choix_d = 'petit serpent (donc un vertébré)'
 WHERE question_code = 'QF0004' AND choix_d = 'petit serpent';

UPDATE quiz_questions SET choix_b = 'Aux insectes, comme la coccinelle'
 WHERE question_code = 'QF0200' AND choix_b = 'Aux insectes';
UPDATE quiz_questions SET choix_c = 'Aux vers, comme le lombric'
 WHERE question_code = 'QF0200' AND choix_c = 'Aux vers';
UPDATE quiz_questions SET choix_d = 'Aux mollusques, comme l''escargot'
 WHERE question_code = 'QF0200' AND choix_d = 'Aux mollusques';

UPDATE quiz_questions SET choix_b = 'une plante sans chlorophylle, donc incapable de photosynthèse'
 WHERE question_code = 'QF0202' AND choix_b = 'une plante sans chlorophylle';
UPDATE quiz_questions SET choix_c = 'un petit animal du sol, proche des vers et des cloportes'
 WHERE question_code = 'QF0202' AND choix_c = 'un petit animal';
UPDATE quiz_questions SET choix_d = 'une bactérie de grande taille, visible à l''œil nu'
 WHERE question_code = 'QF0202' AND choix_d = 'une bactérie';

UPDATE quiz_questions SET choix_b = 'Il a une carapace rigide qui protège tout son corps'
 WHERE question_code = 'QF0203' AND choix_b = 'Il a une carapace';
UPDATE quiz_questions SET choix_c = 'Il n''a pas de cœur, seulement des vaisseaux'
 WHERE question_code = 'QF0203' AND choix_c = 'Il n''a pas de cœur';
UPDATE quiz_questions SET choix_d = 'Il a toujours huit pattes, comme l''araignée'
 WHERE question_code = 'QF0203' AND choix_d = 'Il a toujours huit pattes';
