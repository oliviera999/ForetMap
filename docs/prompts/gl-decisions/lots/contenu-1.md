# Lot contenu-1 — Catalogues du tour : erreurs d'Olu, péripéties, retours, questions de lecture, mots du voyage

> Chantier G&L « décisions » · vague 1 · couloir contenu · charge forte · banc : fumée
> Branche : `claude/gl-decisions-contenu-1` · Attend : rien · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Olu se trompe sur des choses que des 6e peuvent corriger (quatre erreurs de plus au plateau 1), et parle de l'oiseau.
- Les péripéties nomment les rôles en formes doubles, avec les rôles du 24/11 : l'Éclaireuse ou l'Éclaireur fouille,
  l'Opératrice ou l'Opérateur répond, la ou le Gestionnaire lance les dés.
- Après une mauvaise réponse à une question de lecture, la piste dit où relire, sans donner la réponse.
- Les catalogues disent « la caravane », « le monde », « le chemin », « le paysage ».
- Un retour de question ne commence plus par « ❌ Non ». Les retours des zones réécrites en prod sont dans le dépôt.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 du prompt | 24/11 | Une question ne se répond ni par son indice ni par le dessin du plateau. Les questions sont réécrites en prod ; le dépôt aligne les retours et pose un test. | |
| I6 (addendum 2), reprise par la décision 39 de l'addendum 4 | 24/11, 11 h 53, confirmée à 12 h 11 | Après la connexion, la classe en jeu se dit « la caravane » (toute la classe, jamais une équipe) ; le plateau devient « le monde », « le chemin » ou « le paysage ». | « Caravane est ok. » ; « Non pas que la caravane » |
| Décision 33 de l'addendum 3 | 24/11, 10 h (lore) | Olu parle de l'oiseau, sans le nommer, quand le chapardeur passe. `olu-06` quitte le moment d'ouverture. | |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | Les deux gestes du tour s'échangent. Ce lot l'applique aux **textes** des péripéties ; le code est au lot moteur-2. | |

Sans décision numérotée : erreurs d'Olu et retours des zones du plateau 1 (corrections après la partie jouée au
tableau le 23/11), questions de lecture (constat du 24/11), émoji en tête d'un retour (garde-fou « Pas encore »).

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- L'émoji de verdict est retiré à l'affichage, pas en base (même règle que l'amorce « Non »).
- Trois mots pour le plateau (monde, chemin, paysage) plutôt qu'un ; « séance », « case », « prof », « dé », « tour »,
  « équipe » restent.
- `titres.json` et les noms de sceaux au masculin seul ne changent pas : ils sont listés pour Oliv.
- Les douze péripéties des plateaux 2 à 4 qui nomment un rôle sont réécrites ici, avec celles du plateau 1
  (l'ancien texte les rangeait avec le code des rôles).
- Le test « indice sans la réponse » lit les réponses de prod des plateaux 2 à 4 dans un fichier du dépôt, et se saute
  sur une base qui ne porte pas les réécritures (étape contenu-1.5).

## 3. Fichiers

- **À toi** :
  - `data/gl/tenir/olu-lignes.json`, `data/gl/tenir/peripeties.json`, `data/gl/tenir/qcm-feedbacks-zones.json`,
    `data/gl/tenir/questions-lecture.json`, `data/gl/tenir/sorts.json` (trois `effet_court`, étape contenu-1.3),
    `data/gl/tenir/missions.json` (`mis-20` seulement), `data/gl/tenir/parures.json`,
    `data/gl/tenir/defis-cases.json`, `data/gl/tenir/README.md` ;
  - copies d'exemple, seulement quand un test y lit le texte que tu changes : `data/gl/tenir/exemple/olu-lignes.json`
    (elle recopie `olu-52`, `olu-55`, `olu-56`, `olu-58`, `olu-61`, `olu-64`, `olu-70`, `olu-pf-chercher`,
    `olu-pf-lumiere` mot pour mot), `data/gl/tenir/exemple/sorts.json` (`SL027`, `SL048`),
    `data/gl/tenir/exemple/questions-lecture.json` (ses huit questions ont leurs propres retours d'exemple) ;
  - `lib/glRetourQcm.js`, `tests/gl-retour-qcm.test.js` ;
  - `tests/gl-tenir-import.test.js`, `tests/content/gl-tenir-donnees.test.js`,
    `tests/content/gl-tenir-feedbacks.test.js` ;
  - `lib/glTenirImport.js` : **le commentaire** de `importQcmFeedbacksZones` seulement (il dit que le bloc
    `remplacement` est celui de la migration 344).
- **Nouveaux** : `tests/content/gl-zones-indice-reponse.test.js` ; `tests/fixtures/gl-questions-zones-p2-p4.json`
  (copie de `docs/prompts/gl-decisions/sources/questions-zones-p2-p4.json`).
- **D'un autre couloir, modification minimale permise** : aucun.
- **Ne touche pas** :
  - `data/gl/tenir/chasse-zones.json` (aucun indice, aucun polygone, aucune ressource : le lot contenu-2 en décide) ;
  - `data/gl/tenir/badges.json`, `data/gl/tenir/passeur-plateau4.json`, `src/shared/glTenirCaseEffetCore.js`,
    les deux `retour_pas_encore` de `sorts.json` (lot contenu-2) ;
  - `src/shared/glSortMomentsCore.js`, les missions `mis-09` et `mis-13`, le `critere` du badge `trouveur` (lot
    moteur-2) ;
  - `SL005`, `olu-41`, l'escalier (lot moteur-3) ; `olu-14`, `olu-18`, `olu-pf-sonde` (lot moteur-4) ;
  - `data/gl/tenir/titres.json` (décision d'Oliv) ; `migrations/344_gl_tenir_retours_qcm.sql` (migration déjà
    appliquée) ; `lib/glChapardeur.js`.

## 4. Étapes (un commit par étape, dans cet ordre)

### contenu-1.1 — Erreurs d'Olu, péripéties, retours des zones du plateau 1 (ex-étape 24)

- **Constat vérifié** :
  - `data/gl/tenir/olu-lignes.json` : 101 lignes ; le plus grand numéro est `olu-77` ; moment `erreur` : deux lignes
    pour le plateau 1 (`olu-56`, `olu-64`) et une pour tous (`olu-58`).
  - `data/gl/tenir/peripeties.json` : 32 péripéties ; dix-sept nomment un rôle au masculin seul, et plusieurs font
    lancer les dés par « l'Opérateur » (c'est la ou le Gestionnaire qui lance).
  - `tests/gl-tenir-import.test.js`, ligne 33 : `findForbiddenString("L'Opérateur relance")`.
  - `tests/content/gl-tenir-donnees.test.js`, ligne 39 : `'olu-lignes': ['lignes', 101]`.
  - `data/gl/tenir/qcm-feedbacks-zones.json` : neuf questions, 36 retours, un bloc `remplacement` (`GQCM0766`).
    `tests/content/gl-tenir-feedbacks.test.js` (test « le bloc `remplacement` est celui que pose la migration 344 »)
    compare ce bloc, champ par champ, au texte de `migrations/344_gl_tenir_retours_qcm.sql`.
  - `lib/glTenirImport.js › importQcmFeedbacksZones` refuse un retour posé sur la lettre que **la base** donne pour
    bonne (« … est la bonne réponse »). Le classeur du dépôt et l'instantané du banc
    (`data/gl/sim/contenu-prod-2026-11-07.json`) portent les énoncés d'avant : bonne lettre A pour `QCM0069` et
    `QCM0251`. En prod, depuis le 23/11 : D et E.
- **Changement attendu** :
  1. `olu-lignes.json`, lignes modifiées :

| id | Champ | Nouveau texte |
| --- | --- | --- |
| `olu-56` | `texte` | « Le baobab pousse au cœur de la forêt équatoriale. » |
| `olu-56` | `correction` | « Il pousse dans la savane : son tronc garde l'eau pour la saison sèche. » |
| `olu-58` | `correction` | « Les champignons ne sont ni des plantes ni des animaux : ils forment un groupe à part, et beaucoup sont des décomposeurs. » |
| `olu-61` | `correction` | « La plupart sont des conifères qui gardent leurs aiguilles ; le mélèze les perd, comme les bouleaux. » |
| `olu-64` | `correction` | « Ils mangent du bois et des végétaux morts : ce sont des décomposeurs. » |
| `olu-55` | `texte` | « Au pôle Nord, on croise des manchots. » |
| `olu-55` | `correction` | « Les manchots vivent dans l'hémisphère Sud ; il n'y en a pas dans le Grand Nord. » |

  2. `olu-lignes.json`, lignes ajoutées, sur le modèle de `olu-56` (`moment: "erreur"`, `expression: "explique"`,
     `variables: []`, `plateaux: [1]`) :

| id | `texte` | `correction` |
| --- | --- | --- |
| `olu-78` | « Le lion est le roi de la jungle. » | « Le lion vit dans la savane, pas dans la forêt équatoriale. » |
| `olu-79` | « Le sol de la forêt équatoriale est très riche. » | « Il est pauvre : les feuilles mortes y sont décomposées et réutilisées très vite. » |
| `olu-80` | « Dans la forêt équatoriale, il ne pleut presque jamais. » | « Il y pleut presque tous les jours, toute l'année. » |
| `olu-81` | « Dans la savane, les arbres perdent leurs feuilles à cause du froid. » | « Ils les perdent à la saison sèche, pour garder leur eau. » |

  3. `peripeties.json`, champ `texte` (les quinze autres péripéties ne changent pas ici ; `per-03` change à l'étape
     contenu-1.3) :

| id | Plateau | Nouveau texte |
| --- | --- | --- |
| `per-01` | 1 | « Une mangouste a volé le dé. La ou le Gestionnaire relance de la main qui n'écrit pas. » |
| `per-02` | 1 | « Pluie de mousson sur la caravane : l'équipe répond à la prochaine question en chuchotant, et l'Opératrice ou l'Opérateur tranche en mimant. » |
| `per-04` | 1 | « Un calao s'est posé sur la carte. L'Éclaireuse ou l'Éclaireur désigne la fouille sans parler, du bout du nez. » |
| `per-06` | 1 | « Le baobab a soif : chaque membre dit un mot qui contient la lettre O avant que la ou le Gestionnaire ne lance. » |
| `per-07` | 1 | « Nuit dans la savane : l'équipe répond à la prochaine question les yeux fermés, en écoutant la ou le Secrétaire lire deux fois. » |
| `per-09` | 2 | « Tempête de sable : l'Opératrice ou l'Opérateur tranche la prochaine réponse les yeux fermés, sur la seule voix de son équipe. » |
| `per-11` | 2 | « Mirage : l'Éclaireuse ou l'Éclaireur désigne deux endroits à fouiller, l'équipe vote à main levée pour le bon. » |
| `per-12` | 2 | « Les chèvres sont montées dans l'arganier : la ou le Gestionnaire lance les dés debout sur une seule jambe. » |
| `per-13` | 2 | « Le vent chaud a séché les gorges : l'équipe répond à la prochaine question sans aucun mot, seulement par gestes, et la ou le Secrétaire traduit. » |
| `per-14` | 2 | « Cigales : pendant que l'Éclaireuse ou l'Éclaireur cherche l'endroit, l'équipe fait « tssss » à voix basse sans s'arrêter, et se tait dès que la fouille est faite. » |
| `per-16` | 2 | « Le fennec entend tout : l'équipe doit répondre à la prochaine question avant que l'Éclaireuse ou l'Éclaireur ait compté jusqu'à vingt, en silence. Sinon, on répond quand même. » |
| `per-18` | 3 | « Brume sur la lande : l'Éclaireuse ou l'Éclaireur désigne la fouille avec le dos de la main, sans un mot. » |
| `per-19` | 3 | « Le geai a caché un gland : avant de lancer, la ou le Gestionnaire doit retrouver, dans la trousse d'un membre de l'équipe, un objet que l'équipe a choisi en secret. » |
| `per-21` | 3 | « Le blaireau creuse : la ou le Gestionnaire lance les dés en les faisant rouler sous la main, sans les soulever. » |
| `per-24` | 3 | « Chouette de minuit : l'équipe fait son choix de réponse en se parlant seulement à l'oreille, en chaîne, jusqu'à l'Opératrice ou l'Opérateur. » |
| `per-28` | 4 | « Les lemmings passent sous la table : la ou le Gestionnaire lance les dés à genoux. » |
| `per-32` | 4 | « Le loup chante : la ou le Gestionnaire hurle une fois, doucement, à la lune, avant de lancer. Si elle ou il ne veut pas, la ou le Secrétaire le fait. » |

  4. `qcm-feedbacks-zones.json` (le fichier dit ce qui est en prod) : remplace `feedbacks.QCM0069` et
     `feedbacks.QCM0251`, puis le bloc `remplacement`, par les textes de
     `docs/prompts/gl-decisions/sources/retours-zones.md`. Ajoute à `note` : « questions des zones du plateau 1
     réécrites le 23/11 (audit de la partie 16) ; la migration 344, gardée par l'ancien énoncé, ne s'applique plus ».
     La bonne lettre n'a pas de retour (`QCM0069` : D ; `QCM0251` : E ; `GQCM0766` : A).
  5. `data/gl/tenir/README.md` (vers la ligne 122) et le commentaire de `importQcmFeedbacksZones` : le bloc
     `remplacement` est la rédaction en prod depuis le 23/11 ; la migration 344 posait la précédente.
- **Tests** :
  - `tests/gl-tenir-import.test.js`, ligne 33 : la chaîne devient `'La ou le Gestionnaire relance'`.
  - `tests/content/gl-tenir-donnees.test.js` : le compte `olu-lignes` passe à 105 ; nouveau test : au moins 6 lignes
    `erreur` pour le plateau 1 (une ligne « tous » compte pour chaque plateau) ; le test écrit le compte des
    plateaux 2 à 4 dans son diagnostic, sans échouer.
  - `tests/content/gl-tenir-feedbacks.test.js` : le test du bloc `remplacement` ne peut plus le comparer à la
    migration 344. Réécris-le sur le bloc lui-même : code `GQCM0766`, bonne lettre A, cinq choix, un retour par mauvais
    choix, un `feedback_correct`, aucun mot interdit. Le compte « 36 retours pour 9 questions » tient.
- **Critère d'acceptation** : `npm run test:content` et `npm test` verts ; l'import tolérant à blanc lit les 105
  lignes d'Olu et les 32 péripéties sans erreur.
- **Attendu, à écrire dans ton rapport sans rien corriger** : sur une base construite depuis le dépôt, l'import
  signale « a est la bonne réponse » pour `QCM0069` et `QCM0251` (la base a l'ancien énoncé). En mode tolérant, ces
  deux lignes sont écartées ; en `--strict`, le fichier est refusé. Ne change ni l'import ni les questions de ta base.

### contenu-1.2 — Questions de lecture du catalogue (ex-étape 24 bis)

- **Constat vérifié** (`data/gl/tenir/questions-lecture.json`, clé `zone_key`, 36 questions) : la question de
  `cz-p2-02` contredit sa page (la page dit que la rose de Jéricho « était bel et bien morte », le catalogue dit
  qu'elle « reverdit ») ; le retour juste de `cz-p3-09` prête une « ruse » au Silence ; la plupart des
  `feedback_incorrect` donnent la réponse. Sept des 35 retours ci-dessous sont déjà mot pour mot sur main (`cz-p3-01`,
  `cz-p3-05`, `cz-p3-10`, `cz-p4-03`, `cz-p4-04`, `cz-p4-06`, `cz-p4-07`).
- **Changement attendu** :
  1. `cz-p2-02` : `choix.A` → « Elle s'ouvre et laisse partir ses graines » ; `feedback_correct` → « Oui : en quelques
     heures, la boule s'ouvre comme une main. Mais elle ne revit pas : elle libère ses graines, au moment où il y a
     de l'eau pour germer. Elle passe le relais. » (`reponse` reste `A`).
  2. `cz-p3-09` : `feedback_correct` → « Oui. Pas un chant, pas un seul. Le Silence ne fait pas de bruit : les chants
     s'éteignent un à un, et on ne s'en aperçoit pas tout de suite. »
  3. `cz-p2-04` : `question` → « Quand le voile avance, qu'est-ce qui s'en va en premier ? »
  4. `cz-p4-07` : `feedback_correct` → « Oui. Fuir seul dans la neige, c'est se perdre. Ensemble, cornes vers
     l'extérieur, ils sont imprenables : le loup tourne autour et ne trouve aucune prise. »
  5. `feedback_incorrect`, zone par zone (`cz-p2-08` garde ses `retours` par lettre) :

| Zone | `feedback_incorrect` |
| --- | --- |
| `cz-p1-01` | Pas encore. Relis le deuxième paragraphe : il raconte le voyage du fruit. |
| `cz-p1-02` | Pas encore. La toute première phrase de la page parle de cette langue : relis-la. |
| `cz-p1-03` | Pas encore. Relis le premier paragraphe : la page compare le pangolin à un objet de la forêt. |
| `cz-p1-04` | Pas encore. Relis le deuxième paragraphe : les premières fourmis sont déjà sur ses bottes. Que fait-elle ? |
| `cz-p1-05` | Pas encore. Relis la première phrase de la page, lentement : que dit-elle d'hier et de demain ? |
| `cz-p1-06` | Pas encore. Relis le premier paragraphe : la girafe a un « truc » pour passer entre les épines. |
| `cz-p1-07` | Pas encore. Relis le début de la page : l'un d'eux ne fait pas comme les autres. |
| `cz-p1-08` | Pas encore. Relis le deuxième paragraphe : comment la matriarche sait-elle où aller ? |
| `cz-p2-01` | Pas encore. Relis le deuxième paragraphe : « le plus fou, c'est qu'il ne boit pas ». Alors, d'où vient son eau ? |
| `cz-p2-02` | Pas encore. Relis le deuxième paragraphe, là où la voyageuse suit le conseil du naturaliste. |
| `cz-p2-03` | Pas encore. Relis le premier paragraphe : l'oryx en a-t-il vraiment une seule ? |
| `cz-p2-04` | Pas encore. Relis la page : qu'est-ce que la voyageuse voit disparaître avant tout le reste ? |
| `cz-p2-05` | Pas encore. Relis le deuxième paragraphe : qu'est-ce que les chèvres cherchent là-haut ? |
| `cz-p2-06` | Pas encore. Relis le premier paragraphe : qu'est-ce qui rend ces magots uniques dans la région ? |
| `cz-p2-07` | Pas encore. Relis le deuxième paragraphe : qu'est-ce qui a fini par ouvrir les cônes ? |
| `cz-p3-01` | Pas encore. Relis la première phrase de la page : le nombre y est écrit en toutes lettres. |
| `cz-p3-02` | Pas encore. Relis le deuxième paragraphe : que se passe-t-il dans le sous-bois après mars ? |
| `cz-p3-03` | Pas encore. Relis le deuxième paragraphe : les racines « ne sont pas seules ». Avec qui travaillent-elles ? |
| `cz-p3-04` | Pas encore. Relis le premier paragraphe : comment l'enfant voit-il le ciel ? |
| `cz-p3-05` | Pas encore. Relis le deuxième paragraphe, là où la voyageuse s'agenouille dans la forêt naine : l'ajonc a une odeur surprenante. |
| `cz-p3-06` | Pas encore. Relis le deuxième paragraphe : regarde bien la rosette rouge. |
| `cz-p3-07` | Pas encore. Relis le deuxième paragraphe, celui qui a « bouleversé » la voyageuse. |
| `cz-p3-08` | Pas encore. Relis le deuxième paragraphe : la voyageuse finit par voir d'où venait le bruit. |
| `cz-p3-09` | Pas encore. Relis la première ligne de la page. |
| `cz-p3-10` | Pas encore. Relis le premier paragraphe : la page explique de quoi est faite cette « bouillie noire qui sentait la cave ». |
| `cz-p4-01` | Pas encore. Relis la première phrase : en hiver, le lièvre change de manteau, et pas seulement. |
| `cz-p4-02` | Pas encore. Relis la première phrase de la page. |
| `cz-p4-03` | Pas encore. Relis le deuxième paragraphe : la voyageuse croyait à une fin triste, puis on lui a montré « le prolongement ». |
| `cz-p4-04` | Pas encore. Relis le premier paragraphe : la page raconte une chaîne, maillon après maillon, en partant de l'abeille. |
| `cz-p4-05` | Pas encore. Relis le premier paragraphe, sur la fleur jaune. |
| `cz-p4-06` | Pas encore. Relis le deuxième paragraphe : le harfang règle sa vie sur celle des lemmings, les bonnes années comme les maigres. |
| `cz-p4-07` | Pas encore. Relis le deuxième paragraphe : « ils ne fuient pas ». Que font-ils à la place ? |
| `cz-p4-08` | Pas encore. Relis le deuxième paragraphe : « voici ce qu'on oublie en marchant dessus ». |
| `cz-p4-09` | Pas encore. Relis la dernière ligne de la page. |
| `cz-p4-10` | Pas encore. Relis le deuxième paragraphe : pourquoi, exactement, écrit-elle ? |

- **Tests** (`tests/content/gl-tenir-donnees.test.js`, à côté du test des questions de lecture, ligne 107) : aucun
  `feedback_incorrect` ne contient un mot de 6 lettres ou plus de la bonne réponse qui ne figure pas déjà dans la
  question (minuscules, sans accents, mots entiers) ; aucun texte du fichier ne contient « reverdit » ni « sa ruse ».
- **Critère d'acceptation** : le test passe sur les 36 questions (les textes ci-dessus le passent, contrôle du
  24/11). Liste dans ton rapport, sans les corriger, les questions dont la bonne réponse est le choix le plus long
  (27 sur 36 au 24/11).

### contenu-1.3 — Catalogues : les mots du voyage (ex-étape 24 ter)

- **Constat vérifié** : les textes actuels disent « la classe », « le plateau », « un joueur » (`olu-38` : « La classe
  a tenu ses cartes » ; `olu-pf-chercher` : « Le carnet dort sous le plateau » ; `d-p1-mime` : « Un joueur de l'équipe
  mime… La classe doit trouver »). `olu-70` dit « Un défi pour la caravane ! » alors que le défi est celui d'une
  équipe.
- **Changement attendu**, dans `data/gl/tenir/` :

| Fichier | id | Champ | Nouveau texte |
| --- | --- | --- | --- |
| `olu-lignes.json` | `olu-38` | `texte` | « Le voile recule de cinq. La caravane a tenu ses cartes, et le monde le sent. » |
| | `olu-52` | `texte` | « Le lion polaire. Je ne connaissais pas. Je crois que la caravane vient d'adopter une chimère. » |
| | `olu-70` | `texte` | « Un défi pour votre équipe ! Vous avez jusqu'à la prochaine séance pour le préparer. » |
| | `olu-pf-chercher` | `texte` | « Les pages du carnet dorment dans le paysage. Deux fouilles par tour : touchez le dessin là où l'indice vous mène. » |
| | `olu-pf-lumiere` | `texte` | « La jauge de Lumière monte avec les cartes que la caravane garde. Pleine, elle fait reculer le voile de cinq cases. » |
| | `olu-pf-camp` | `texte` | « Le camp ! On pose les sacs. Regardez ce qui change dans le monde suivant : votre peuple, vos sorts, le chemin. » |
| `sorts.json` | `SL045` | `effet_court` | « Vous offrez la Cordée à une équipe de l'autre peuple : au prochain tour, le meilleur de vos deux jets vaut pour les deux, et le voile ne vous touche pas. Dans le quatrième monde, la première Cordée de chaque équipe est offerte. » (seule la dernière phrase change) |
| | `SL027` | `effet_court` | « expliquer deux minutes à toute la caravane une page ou une espèce ; payé une fois, un « pas encore » se retente sans repayer » |
| | `SL048` | `effet_court` | « une page écrite par l'élève entre au carnet de la caravane, en marge, après relecture ; un « pas encore » se réécrit sans repayer » |
| `peripeties.json` | `per-03` | `texte` | « Une colonne de fourmis traverse le chemin : l'équipe se lève, fait le tour de sa table en file indienne, et se rassied. Personne ne marche sur la colonne. » |
| `missions.json` | `mis-20` | `texte` | « Faire reculer le voile (carnet complet ou Lumière) au moins une fois dans le chapitre. Mission de toute la caravane : si elle réussit, toutes les équipes la réussissent. » |
| `parures.json` | `pelage_bestiaire` | `description` | « La mascotte prend le pelage d'une chimère de la caravane : taches, rayures et couleurs que la science n'a jamais validées. » |
| | `pelage_neon` | `description` | « Un pelage qui brille dans la nuit polaire, vert et rose comme une aurore, visible de tout le chemin. » |
| `defis-cases.json` | `d-p1-mime` | `consigne` | « Une ou un membre de l'équipe mime un animal de la savane en train d'utiliser son astuce pour survivre. Les autres équipes doivent trouver l'animal ; l'équipe explique ensuite l'astuce. » |
| | `d-p1-mime` | `critere` | « Les autres équipes trouvent l'animal et l'équipe explique une astuce juste (girafe et long cou pour les acacias, suricate sentinelle, éléphant qui creuse pour l'eau…). » |
| | `d-p2-mime` | `consigne` | « Une ou un membre de l'équipe mime comment un animal du désert résiste à la chaleur ou à la soif. Les autres équipes doivent trouver l'animal ; l'équipe explique ensuite l'astuce. » |
| | `d-p2-mime` | `critere` | « Les autres équipes trouvent l'animal et l'équipe explique une astuce juste (fennec et grandes oreilles, gerboise qui sort la nuit, dromadaire et ses réserves, addax qui tire l'eau des plantes…). » |

- **Balayage** : cherche les autres occurrences dans les champs **visibles d'un élève** de tous les catalogues
  (`texte`, `effet_court`, `description`, `consigne`, `titre`, `question`, `feedback_*`, `correction`) :
  `\bplateaux?\b`, `\bclasse\b`, `\bjoueu(r|rs|se|ses)\b`, `\bpartie\b` au sens de partie de jeu, `feuillet`. Corrige
  selon le lexique ci-dessous (le mot seul, la phrase ne bouge pas), ou liste dans ton rapport si le sens est
  douteux. Les champs privés (`titre_prive`, `note`, `critere_prof`, `note_prof`, `regle`, `notes.*`, `format`) ne
  changent pas. `titres.json` et les noms de sceaux (« Gardiens de la Marée Reculée », masculin seul) : liste-les.
- **Lexique** : le plateau comme lieu ou chapitre → « le monde » (« ce monde », « le deuxième monde ») ; comme suite
  de cases → « le chemin » ; comme dessin où dorment les pages → « le paysage » ; la classe en jeu → « la caravane » ;
  la classe dans un défi joué en vrai → « les autres équipes » ; un joueur → « une ou un membre de l'équipe » ;
  restent : dé, case, tour, équipe, carte Job, carte Team Spirit, prof, séance.
- **Relevé sur main (24/11), hors du tableau** :

| Fichier | Entrée, champ | Lecture |
| --- | --- | --- |
| `sorts.json` | `SL027`, `effet_auto_json.consigne` (« tu expliques à la classe ») | À lister : l'élève parle devant la vraie classe |
| `sorts.json` | `SL048`, `presentation` et `retour_valide` (« carnet de la classe ») | « carnet de la caravane », comme son `effet_court` |
| `sorts.json` | `voyageur.loupe` et `voyageur.flair`, `effet_court` (« la classe ») | « la caravane » |
| `sorts.json` | `SL050` (inactif), `effet_court` | À lister |
| `trame-reparer.json` | `classement.consigne` (« les 6 espèces du plateau ») | À lister (vérifie si un élève lit ce champ) |
| `questions-lecture.json` | `cz-p4-09`, `question` (« un feuillet vide ») | À lister : la question cite la page |
| `questions-lecture.json` | `cz-p3-01`, `feedback_correct` (« une partie ») | Rien : pas une partie de jeu |
| `badges.json` | `critere` de `premiere_page`, `gardien_des_fils`, `reparateur` | À lister : fichier du lot contenu-2 |

- **Tests** : garde verts `tests/content/gl-tenir-donnees.test.js`, `tests/content/gl-adresse-ecran-equipe.test.js`
  et les tests qui lisent `exemple/` (`tests/gl-tenir-sync.test.js`, `tests/helpers/glTenirFixtures.js`).
- **Critère d'acceptation** : les dix-sept textes du tableau sont mot pour mot dans les catalogues ; le rapport liste
  chaque occurrence laissée, avec sa raison.

### contenu-1.4 — Olu et l'oiseau (ex-étape 24 quater)

- **Constat vérifié** :
  - Le moment `oiseau` n'a qu'une ligne, `olu-54`. Il n'existe pas de `olu-oiseau-01`.
  - `lib/glTenirOlu.js` (lignes 38 et 39) : les évènements `chapardeur` et `nid_rendu` appellent le moment `oiseau`.
  - `olu-06` (« Le nid est plein… ») est au moment `ouverture`.
  - Le champ `plateaux` d'une ligne n'est lu que pour le moment `erreur` (`lib/glTour.js`, lignes 251 à 268).
    `lib/glChapardeur.js` n'a aucune garde par plateau ; `gameplay.tenir_chapardeur` est un seul booléen pour toute la
    plateforme.
  - `data/gl/tenir/exemple/olu-lignes.json` n'a ni `olu-06` ni ligne du moment `oiseau` : rien à y recopier.
  - `lib/glChapardeur.js` : l'oiseau prend une seule gemme, à la bourse la plus pleine, et la prochaine page trouvée la
    rend au membre le moins riche de l'équipe découvreuse. Les trois lignes disent vrai.
- **Changement attendu** (`data/gl/tenir/olu-lignes.json`) :
  1. Trois lignes ajoutées, moment `oiseau`, sans `plateaux`, `variables: []`. Garde ces identifiants (`olu-54` n'est
     pas renommée) :

| id | expression | texte |
| --- | --- | --- |
| `olu-oiseau-02` | surpris | « Une plume sur une bourse. Il est passé. Il ne prend jamais tout : une seule chose qui brille. » |
| `olu-oiseau-03` | pensif | « Il garde ce qui brille, puis il le rend à qui en a besoin. Drôle d'oiseau. » |
| `olu-oiseau-04` | curieux | « Vous avez vu ? Il était là, et puis plus. Comme dans le carnet. » |

  2. `olu-06` passe du moment `ouverture` au moment `oiseau` (au plateau 1, il n'y a pas de nid).
- **Ce que l'étape fait vraiment** : elle ajoute des lignes au tirage du moment `oiseau`. Elle ne les réserve pas au
  plateau 2 : elles se taisent tant que le chapardeur est coupé (réglage de prod au 23/11, non relisible ici), et se
  diront sur n'importe quel plateau dès qu'il sera rallumé. N'ajoute ni garde ni champ : dis-le dans ton rapport.
- **Tests** : `tests/content/gl-tenir-donnees.test.js` : le compte `olu-lignes` passe à 108 ; aucune ligne ne dit
  « corbeau », ni le nom de l'oiseau, ni son cri (le test « aucune chaîne interdite » le couvre déjà).
- **Critère d'acceptation** : cinq lignes au moment `oiseau` ; tests de contenu verts.

### contenu-1.5 — Questions de zone : les retours et le test « indice sans la réponse » (ex-étape 24 quinquies, dite « 24 quinquies-Z »)

- **Constat** (prod, 24/11) : 26 des 28 questions de zone des plateaux 2 à 4 se répondaient par leur propre indice
  (`cz-p2-05` : l'indice dit « qui ne pousse naturellement qu'au sud-ouest du Maroc », la question demandait où
  l'arganier est endémique). Elles sont réécrites **en prod** ; les questions ne vivent qu'en base
  (`gl_qcm_questions`).
- **Constat vérifié** : le dépôt ne porte pas ces réécritures. Sur une base construite depuis le dépôt, la bonne
  lettre de `QCM0436`, `QCM0195`, `QCM0369` et `QCM0138` est A ; en prod : B, E, E, D (`QCM0396` garde A).
  `docs/prompts/gl-decisions/sources/questions-zones-p2-p4.json` donne, pour les 28 zones : `zone_key`,
  `question_code`, `question`, `reponse_correcte`, `reponse_texte`, les choix et les retours de prod.
- **Changement attendu** :
  1. `data/gl/tenir/qcm-feedbacks-zones.json` : remplace les entrées `QCM0436`, `QCM0195`, `QCM0396`, `QCM0369` et
     `QCM0138` par les retours du fichier source ci-dessus (champs `feedback_a` à `feedback_e` non nuls, clés `a` à
     `e` ; la bonne lettre n'a pas de retour). Ajoute à `note` : « questions des zones des plateaux 2 à 4 réécrites
     le 24/11 ; les retours ci-dessus suivent les nouveaux énoncés ».
  2. Copie le fichier source en `tests/fixtures/gl-questions-zones-p2-p4.json`.
  3. Ne touche à aucun indice ni à aucun polygone de `chasse-zones.json`. N'écris aucune question en base.
- **Tests** — `tests/content/gl-zones-indice-reponse.test.js` :
  - Règle : pour une zone active de `chasse-zones.json` qui a un `question_code`, aucun mot de six lettres ou plus de
    `reponse_texte` (minuscules, sans accents, mots entiers) ne figure dans l'`indice` de la zone. Liste blanche
    commentée, une ligne par exception : `cz-p1-03` (« feuilles »), `cz-p1-04` (« petites »), `cz-p4-02`
    (« ruisseau »). Message d'échec en français, avec la zone, le mot et l'indice.
  - Premier test, sans base : la règle sur les 28 zones des plateaux 2 à 4, `reponse_texte` lue dans le fichier de
    `tests/fixtures/`. Il passe au 24/11 (seule exception : `cz-p4-02`).
  - Second test, sur la base : la règle sur toutes les zones actives, `reponse_texte` lue dans `gl_qcm_questions`.
    Vrai `t.skip` sans corpus. Vrai `t.skip` aussi, avec le message « base sans les réécritures des 23 et 24/11 »,
    quand l'énoncé de `QCM0009` en base n'est pas celui du fichier de `tests/fixtures/`.
  - Ne corrige aucune donnée pour faire passer le test. S'il échoue sur une base qui porte les réécritures, c'est un
    écart nouveau : écris-le dans ton rapport.
- **Critère d'acceptation** : `npm run test:content` vert ; le rapport dit si le second test a pu être joué.
- **Attendu, à écrire dans ton rapport sans rien corriger** : l'import signale aussi « … est la bonne réponse » pour
  `QCM0436`, `QCM0195`, `QCM0369` et `QCM0138` sur une base construite depuis le dépôt (six erreurs avec l'étape
  contenu-1.1).

### contenu-1.6 — Un retour ne commence plus par un émoji (ex-étape QV4)

- **Constat vérifié** :
  - En prod, 137 questions de lore actives (`gl_qcm_lore_questions`) ont des retours par lettre qui commencent par un
    émoji : « ❌ Non : … », « ❌ Piège ! », « ❌ Presque : », « ❌ Si ! », et « ✅ Oui : » sur la bonne lettre.
  - `lib/glRetourQcm.js › AMORCE_NON_RE` (ligne 32) attend « Non » en tête. Avec l'émoji devant, `nettoyerAmorce`
    (ligne 50) ne retire rien : l'élève lit « ❌ Non : ce n'est pas… » (lore hors partie, `routes/gl/lore.js` ;
    validation d'une ressource, `routes/gl/qcm.js`) ou « Pas encore. ❌ Non : ce n'est pas… » en « Tenir ».
- **Changement attendu** (affichage seulement ; la base garde le texte d'auteur) :
  1. `nettoyerAmorce` retire d'abord un émoji de verdict en tête (❌ ✅ ✔ ✖ ❎ ☑, suivi ou non de U+FE0F, puis les
     espaces), puis l'amorce « Non » et « c'est faux » comme aujourd'hui, puis remet la majuscule. Un émoji au milieu
     du texte ne bouge pas.
  2. Rien d'autre : « Presque : … », « Piège ! … », « Si ! … » restent tels quels ; `pasEncore` ne double toujours pas
     « Pas encore ».
- **Tests** (`tests/gl-retour-qcm.test.js`) : « ❌ Non : ce n'est pas une chasse au trésor » → « Ce n'est pas une
  chasse au trésor » ; le même texte en mode « Tenir » → « Pas encore. Ce n'est pas une chasse au trésor » (un seul
  « Pas encore ») ; « ❌ Presque : un être seul… » → « Presque : un être seul… » ; « ✅ Oui : … » en retour juste par
  lettre → émoji retiré ; texte sans émoji → inchangé.
- **Critère d'acceptation** : les cinq cas passent ; les tests existants du fichier restent verts.
- **Limite, à écrire dans ton rapport** : beaucoup de ces retours nomment ensuite la bonne réponse (« ce n'est pas
  une chasse au trésor, mais le tissu vivant du monde ») : contenu à corriger en base par Oliv, hors chantier.

## 5. Migration

Aucune.

**Déjà en prod par le connecteur, les 23 et 24/11 : ne refais rien, n'écris aucune de ces données.**

| Table | Ce qui est en prod |
| --- | --- |
| `gl_qcm_questions` | Les 8 questions des zones du plateau 1 réécrites avec leurs retours (23/11) : `QCM0068`, `QCM0063`, `QCM0098`, `QCM0069`, `QCM0281`, `QCM0251`, `GQCM0766`, `QCM0277`. |
| `gl_qcm_questions` | Les 28 questions des zones des plateaux 2 à 4 réécrites (24/11) : énoncé, choix, bonne réponse, retours. Textes dans `sources/questions-zones-p2-p4.json`. |
| `gl_qcm_questions` | `usage_tenir = 0` pour dix questions de case qui se lisent sur le plateau : `QCM0092`, `QCM0278`, `QCM0272`, `QCM0663`, `QCM0431`, `QCM0439`, `QCM0192`, `QCM0611`, `QCM0619`, `QCM0135` (le lot ecrans-1 les ajoute à la liste des questions hors tirage d'une base neuve). |
| `gl_qcm_lore_questions` | `LQCM0370` à `LQCM0405` : copies des 36 questions de lecture, pour la validation des pages. Elles portent déjà les textes de l'étape contenu-1.2 (avec cinq choix et d'autres lettres : le catalogue s'aligne sur les textes, pas sur les lettres). |
| `gl_settings` | `gameplay.tenir_chapardeur` = `false` (23/11 ; non relisible par requête). |

Les catalogues de ce lot ne sont **pas** en prod tant que la vague n'est pas sur `main` ; au déploiement, le serveur les synchronise seul (par empreinte), et Oliv vérifie qu'il ne reste aucun écart (section 11).

## 6. Données et sources

| Fichier de `docs/prompts/gl-decisions/sources/` | Où va son contenu |
| --- | --- |
| `retours-zones.md` | `data/gl/tenir/qcm-feedbacks-zones.json` : `feedbacks.QCM0069`, `feedbacks.QCM0251`, bloc `remplacement` (étape contenu-1.1) |
| `questions-zones-p2-p4.json` | Retours de cinq questions dans `qcm-feedbacks-zones.json` ; copie entière en `tests/fixtures/gl-questions-zones-p2-p4.json` (étape contenu-1.5) |

## 7. Vérifications propres au lot

- `npm run test:content`, puis l'import à blanc sur ta base du banc, **avant** tes changements (état de départ) et
  **après** : `DB_NAME=foretmap_contenu_1_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run`. Attendu
  après : `qcm-feedbacks-zones` refusé pour les six erreurs de bonne lettre des étapes contenu-1.1 et contenu-1.5.
  Toute autre erreur nouvelle est à corriger.
- Banc, régime fumée, une passe à la fin.
- Relecteurs : `gl-relecteur-garde-fous` sur le diff des JSON, et `gl-relecteur-science` (erreurs d'Olu et leurs
  corrections, péripéties, retours des zones).
- Comptes à rendre dans le rapport : lignes `erreur` d'Olu par plateau ; questions de lecture dont la bonne réponse
  est la plus longue ; occurrences laissées par le balayage de l'étape contenu-1.3 ; noms de sceaux au masculin seul.
- Aucun e2e, aucune capture.

## 8. Contrats de test changés

- `tests/content/gl-tenir-donnees.test.js` : `olu-lignes` 101 → 108 lignes ; nouveaux tests (six erreurs au
  plateau 1 ; pistes des questions de lecture).
- `tests/gl-tenir-import.test.js`, ligne 33 : « La ou le Gestionnaire relance ».
- `tests/content/gl-tenir-feedbacks.test.js` : le bloc `remplacement` n'est plus comparé à la migration 344.
- `tests/gl-retour-qcm.test.js` : `nettoyerAmorce` retire un émoji de verdict en tête.
- Nouveau test `tests/content/gl-zones-indice-reponse.test.js`.
- Textes changés : dix-huit péripéties ; onze lignes d'Olu, sept ajoutées, `olu-06` change de moment ; `SL045`,
  `SL027`, `SL048` ; `mis-20` ; deux parures ; deux défis de case ; 29 questions de lecture.

## 9. Docs à mettre à jour dans ce lot

- `data/gl/tenir/README.md` : section `qcm-feedbacks-zones.json` (bloc `remplacement`).
- `changelog.d/gl-decisions-contenu-1.md`.
- Rien dans les règles ni dans `docs/reference/gl/`. Une phrase d'un skill `.claude/skills/gl-*` devenue fausse se
  corrige, et se dit.

## 10. Hors périmètre

- **Le code des rôles échangés : lot moteur-2**, qui passe après toi. Écris dans ton rapport, section « Ce que les
  lots suivants doivent savoir », ce qu'il lui reste :
  - le code : `src/shared/glSortMomentsCore.js` (`ROLES_TENIR`, `ROLES_EN_CONSEIL`, `roleDuGeste()`, phrases du
    moment, commentaire d'en-tête) et les libellés qui lient un rôle à un geste ;
  - les tests qui affirment les anciens rôles, et le test de catalogue « aucune péripétie ne fait lancer les dés par
    un autre rôle que la ou le Gestionnaire ; aucun nom de rôle au masculin seul dans `peripeties.json` et
    `missions.json` » (tes péripéties doivent déjà le passer) ;
  - les missions `mis-09` et `mis-13` ; le `critere` du badge `trouveur` ; la page des règles (migration
    `mig-regles-roles`) ;
  - les dix-sept péripéties à rôles sont déjà réécrites ici : il les trouvera faites.
- Le texte de vérité des cases favorables : lot contenu-2. Il reste « Belle rencontre : la caravane repart. » ;
  l'ancienne étape 24 ter proposait « l'équipe repart », ce n'est pas retenu.
- Les mots du voyage à l'écran (libellés, onglets) : lot ecrans-6. Le lexique du voyage : lot contenu-5.
- Le tutoiement des cases des plateaux 2 à 4 ; les retours de lore qui nomment la réponse ; les photos des questions
  réécrites ; une garde par plateau pour le chapardeur.

## 11. Pour Oliv

**À relire**

- Les quatre erreurs d'Olu ajoutées et les sept textes d'erreur retouchés ; les trois lignes de l'oiseau.
- Les dix-huit péripéties. `per-01` garde le mot « relance » (« relance de la main qui n'écrit pas ») : le lot
  moteur-3 retire le sort Relance et ce mot du jeu ; à garder ou à changer (« lance »).
- `per-23` (« Celui qui bouge dit un mot gentil à un coéquipier ») n'est pas réécrite : masculin seul, mais ce n'est
  pas un nom de rôle.
- Les 35 pistes des questions de lecture et les quatre textes retouchés.
- Les dix-sept textes des mots du voyage, et la liste des occurrences laissées.
- Le chapardeur : les lignes de l'oiseau se diront sur tout plateau dès que le réglage sera rallumé. Une garde par
  plateau demanderait du code, hors de ce lot.
- Le test « indice sans la réponse » ne juge les zones du plateau 1 que sur une base qui porte les réécritures de
  prod : le dépôt n'en a pas.

**À faire après la vague**

- Synchroniser les catalogues, d'abord à blanc (`gl_tenir_catalogues sync`, `dry_run`, code à 6 chiffres) :
  `olu-lignes`, `peripeties`, `qcm-feedbacks-zones`, `questions-lecture`, `sorts`, `missions`, `parures`,
  `defis-cases`. La synchronisation de `qcm-feedbacks-zones` n'écrase aucun retour d'auteur.
- Rallumer `gameplay.tenir_chapardeur` seulement quand la classe joue le plateau 2.
- Ne plus réimporter le corpus QCM depuis le tableur : il remettrait les anciens énoncés des 36 questions de zone.
