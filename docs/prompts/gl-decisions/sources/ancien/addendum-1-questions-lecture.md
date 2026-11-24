# Addendum 1 au prompt orchestrateur · questions et validation (lot 2 : 24 bis, QV4 ; lot 4 : QV2 ; lot V : QV5)

Écrit le 24/11/2026 à 10 h ; **complété le 24/11 à 12 h, renuméroté vers midi, complété à 12 h 20 (lexique lore, décision QV5)** d'après les réponses d'Oliv de 11 h 31 (« 1. On garde
2. Réécris les 3. Ok »). Code lu sur `main` = prod = v1.263.5 (`b8b5344`), recalé à 12 h ; données lues en prod par
le connecteur.

## Comment cet addendum s'applique

**Numéros** (recalés le 24/11 vers midi). Trois sessions ont numéroté en parallèle dans la même série : le prompt a
pris la décision 34 et l'étape 24 quinquies (questions lisibles sur le plateau, 12 h 30) puis la décision 37 et
l'étape 35 (la sonde, lot Q) ; l'addendum 4 a pris les décisions 34 à 41 et **lui aussi** l'étape 24 quinquies (rôles
échangés). Pour ne plus entrer en collision, cet addendum sort de la série : **décisions QV1 à QV3, étapes QV2
(lot 4) et QV4 (lot 2)** (QV = questions de validation, comme H pour l'Histoire et B pour les biomes).

**Doublons entre le prompt et l'addendum 4, à lire ainsi par l'orchestratrice** (aucun n'est de cet addendum ; rien
ne se contredit sur le fond, seuls les numéros se répètent) :

| Numéro | Dans le prompt | Dans l'addendum 4 | Lecture |
| --- | --- | --- | --- |
| Décision 34 | Une question ne se répond ni par son indice ni par le dessin du plateau | Direction artistique « un jeu de plateau qui s'anime » | Deux décisions : « 34 (prompt) » et « 34 (addendum 4) » |
| Décision 37 | Question de case : +1, +3 sous le voile, sonde | L'oiseau se pose et laisse une plume | Idem |
| Étape 24 quinquies (lot 2) | Retours de cinq questions de zone, test « indice sans la réponse » | Rôles du tour échangés (code, catalogues, page `rules`) | Deux étapes du lot 2 : « 24 quinquies-Z » (prompt), puis « 24 quinquies-R » (addendum 4) |
| Migration `N+7` | Lot Q, étape 35 (colonne `sonde`) | Lot 2, étape 24 quinquies-R (page `rules`) | Deux migrations : `N+7` (lot Q) et `N+8` (lot 2) ; de toute façon, le numéro de fichier se prend à la fusion (§ 00.2, point 3) |

Au § 9 du prompt (tableau final des décisions), le lot 8 écrit chaque doublon avec sa source entre parenthèses.

Comme les deux autres (mode d'application en tête de l'addendum 3) : Oliv colle dans la même session le prompt
`claude/PROMPT_Claude_Code_GL_orchestrateur_decisions.md`, puis cet addendum 1, puis l'addendum 2, puis l'addendum
3. Le lot 0 les verse à la suite du prompt dans `docs/prompts/GL_DECISIONS_PROMPT.md`, sous « Addenda ». En cas de
conflit : addendum 3, puis 2, puis 1, puis prompt. Le gel est levé (décision 28, addendum 3) : les étapes ci-dessous
sont des corrections de toute façon.

---

## 0. Décisions d'Oliv (24/11)

| # | Décision | Lot, étape |
| --- | --- | --- |
| QV1 | (11 h 31) **« Corbeau » reste dans les cinq questions de lore qui parlent de l'oiseau des pages de Sélène** (`LQCM0038`, `LQCM0097`, `LQCM0157`, `LQCM0246`, `LQCM0247`, actives). Elles disent le nom commun, comme les pages ; le nom propre et le cri restent interdits partout. L'interface et les catalogues n'écrivent toujours pas « corbeau » (D7). | 2, étape 23 (commentaire) |
| QV2 | (11 h 31) **V8 : jamais de page vierge en récompense d'un défi de la Trame.** | 4, étape QV2 |
| QV3 | (11 h 31) **Les questions de lore retirées le 24/11 sont réécrites**, sauf celles dont le sujet même est du tiers `secret` ou porte le non-dit : elles restent éteintes, définitivement. Fait en prod par le connecteur (§ 5bis ci-dessous) : rien à coder. | — |
| QV5 | (12 h 01 et 12 h 14) **Le lexique lore est réécrit dans les garde-fous** : 33 fiches non secrètes réécrites en prod par le connecteur (plus de non-dit, de chute sans bataille, de tiers secret, de fin révélée, de nom de visage hors de son monde, de Souffle agent, de cœur ni de « savoir devenu pouvoir » ; « Sélène » accentué, termes compris). **« Le corbeau de Sélène » reste tel quel** (Oliv : « pas grave pour le corbeau ») : seule la définition et l'accent ont changé. Il reste à fermer côté code les notes d'auteur que la fiche sert encore à tout le monde (étape QV5). | V, étape QV5 |

## 1. Où verser

1. **§ 00.3, tableau des lots.**
   - **Lot 2** : étapes 24 bis et QV4 en plus. Ordre complet avec le prompt et les autres addenda : 24, 24 bis,
     24 ter, 24 quater, 24 quinquies-Z (prompt), 24 quinquies-R (addendum 4), QV4, 8, 5, 3, 23, 22. Fichiers réservés en plus : `data/gl/tenir/questions-lecture.json` (et
     `exemple/`), `lib/glRetourQcm.js`, `tests/gl-retour-qcm.test.js`.
   - **Lot 4** : étape QV2 en plus. Ordre : 6, QV2, 7, 4, 10. Aucun fichier nouveau (`lib/glTrameDefis.js` lui est déjà
     réservé). Aucune migration.
   - **Lot V** (addendum 2) : étape QV5 en plus, juste après V2 (même sujet : le lexique). Fichiers : `routes/gl/lore.js`
     (route `GET /glossary/:code` seulement, modification minimale : le fichier est réservé au lot 4),
     `src/gl/components/GLLoreGlossaryPopover.jsx`, `tests/content/gl-lexique-lore.test.js` (nouveau), test de route.
     Aucune migration, aucune donnée. **Étape V2 de l'addendum 2** : la ligne « « Le corbeau de Selene » : terme à part,
     décision d'Oliv… liste-le sans le changer » est tranchée (décision QV5) : la fiche reste, rien à lister.
2. **§ 3, décisions** : les lignes QV1, QV2, QV3 et QV5 ci-dessus. Le lot 8 écrit QV1 et QV2 au § 0 des règles (« 24/11 : les
   questions de lore peuvent dire « corbeau », jamais son nom ni son cri ; un défi de la Trame ne donne jamais de page
   vierge »). **Choix par défaut posés par Claude** : ceux du § 3 de cet addendum.
3. **§ 5bis (déjà passé en prod)** : ajoute le tableau du § 4 de cet addendum. Pour le lot H : les codes
   `LQCM0358` à `LQCM0369` sont **toujours libres** (vérifié le 24/11 à 12 h), mais le plus haut code en prod est
   désormais `LQCM0405` : prends les douze codes nommés, et seulement si l'un est pris, les suivants libres **après
   `LQCM0405`**.
4. **§ 6, hors périmètre** : la phrase « Les autres positions de `claude/Audit_questions_validation_GL_2026-11-23.md`
   (V1 à V3, V5 à V8 …) » devient : « V1, V2, V3 (a, b), V5, V6 (a, b) sont passées en prod le 24/11 (§ 5bis) ; V8
   entre au lot 4 (étape QV2) ; V3 (c) et V6 (c) restent du contenu par le connecteur, hors chantier ; V4c reste
   écartée. »
5. **§ 7, docs** : `docs/GL_TENIR_A_DEUX_REGLES.md` § 1 (lot 2, étape 23 : « Sélène dit corbeau », pages et questions
   de lore), § 12 ou section des défis de la Trame (lot 4, étape QV2 : jamais de page vierge) ; le lot 9 les reprend.
6. **§ 10, point 1** : ajoute `questions-lecture` à la liste des catalogues à synchroniser. Ajoute un point : après
   tout import de QCM de lore, revérifier qu'aucune question active ne cite le tiers `secret` (requête du § 3 de
   `claude/Validation_questions_appliquee_GL_2026-11-24.md`). Ajoute aussi : **ne plus réimporter le lexique lore depuis le tableur de juin**
   (`Glossaire_Lore_Gnomes_et_Licornes_1.xlsx`, import `lib/glLoreGlossaryImport.js`, qui écrit par `ON DUPLICATE KEY
   UPDATE`) : les textes d'avant reviendraient, non-dit compris ; repartir de l'export de l'app. Et, une fois le lot V
   fusionné (filtre par monde de V2 et étape QV5), Oliv peut remettre `gameplay.lore_spoiler_max_level` à `recit` : les
   fiches de récit sont désormais propres et ne s'affichent qu'à partir de leur monde.
7. **§ 9** : le tableau des décisions compte aussi QV1, QV2 et QV5.

## 2. Étapes

### Étape 24 bis — Questions de lecture du catalogue · lot 2

**`data/gl/tenir/questions-lecture.json`** (et `exemple/` si un test y lit ces textes). Constat du 24/11 (prod et
dépôt identiques) : la question de `cz-p2-02` contredit sa page (la page dit « le vert n'est pas revenu : la rose
de Jéricho était bel et bien morte ») ; le retour juste de `cz-p3-09` personnifie le Silence ; la plupart des
`feedback_incorrect` donnent la réponse, alors qu'une piste ne la nomme jamais. Les copies de ces questions qui
servent à la validation des pages (`LQCM0370`-`LQCM0405`, en prod depuis le 24/11) portent déjà les textes
ci-dessous : le catalogue s'aligne sur elles.

1. `cz-p2-02` : `choix.A` → « Elle s'ouvre et laisse partir ses graines » ; `feedback_correct` → « Oui : en
   quelques heures, la boule s'ouvre comme une main. Mais elle ne revit pas : elle libère ses graines, au moment où
   il y a de l'eau pour germer. Elle passe le relais. » (`reponse` reste `A`).
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

6. Test de contenu (dans le test existant des questions de lecture, ou nouveau, avec un vrai `t.skip` sans corpus) :
   aucun `feedback_incorrect` ne contient un mot de 6 lettres ou plus de la bonne réponse qui ne figure pas déjà
   dans la question ; aucun texte ne contient « reverdit » ni « sa ruse ». Liste dans ton fichier de lot, sans les
   corriger, les questions dont la bonne réponse est la plus longue (27 sur 36 au 24/11).

### Étape QV4 — Retours de QCM précédés d'un émoji (garde-fou « Pas encore », sans décision nouvelle) · lot 2

**Constat vérifié le 24/11 à 12 h (prod et code de `b8b5344`)** :
- 137 questions de lore actives (`gl_qcm_lore_questions`, presque toutes de `LQCM0002` à `LQCM0150`) ont des retours
  par lettre qui commencent par un émoji : « ❌ Non : … » (388 retours), « ❌ Piège ! », « ❌ Presque : », « ❌ Si ! »,
  « ❌ Ça, … », et « ✅ Oui : » sur la bonne lettre (jamais affiché : c'est `feedback_correct` qui sert). Aucune
  question de biome (`gl_qcm_questions`) n'a d'émoji.
- `lib/glRetourQcm.js › AMORCE_NON_RE` (`/^\s*non(?:…)/iu`) attend « Non » en tête. Avec l'émoji devant, l'amorce
  n'est pas retirée : l'élève lit « ❌ Non : ce n'est pas… » (lore hors partie, `routes/gl/lore.js`, validation d'une
  ressource par une question de lore, `routes/gl/qcm.js`) ou « Pas encore. ❌ Non : ce n'est pas… » (mode « Tenir »).
  Contraire au garde-fou « jamais « Non » ».

**Changement attendu** (affichage seulement ; la base garde le texte d'auteur, comme pour l'amorce « Non ») :
1. `nettoyerAmorce` retire d'abord un émoji de verdict en tête (❌ ✅ ✔ ✖ ❎ ☑, suivi ou non de U+FE0F, puis les
   espaces), puis l'amorce « Non » et « c'est faux » comme aujourd'hui, puis remet la majuscule. Un émoji au milieu
   du texte ne bouge pas.
2. Rien d'autre ne change : « Presque : … », « Piège ! … », « Si ! … » restent tels quels (pas des « Non »), et
   `pasEncore` ne double toujours pas « Pas encore ».
3. Tests (`tests/gl-retour-qcm.test.js`) : « ❌ Non : ce n'est pas une chasse au trésor » → « Ce n'est pas une chasse
   au trésor » ; même texte en mode « Tenir » → « Pas encore. Ce n'est pas une chasse au trésor » (un seul « Pas
   encore ») ; « ❌ Presque : un être seul… » → « Presque : un être seul… » ; « ✅ Oui : … » en retour juste par
   lettre → émoji retiré ; texte sans émoji → inchangé.

**Limite, à écrire dans ton fichier de lot** : beaucoup de ces retours nomment ensuite la bonne réponse (« ce n'est
pas une chasse au trésor, mais le tissu vivant du monde »). Une piste ne nomme jamais la réponse : c'est un lot de
contenu par le connecteur, hors chantier.

### Étape 23 — complément (décision QV1) · lot 2

Dans le commentaire d'en-tête de `src/shared/glGardeFousCore.js` que l'étape 23 fait écrire, la phrase devient :
« les feuillets du carnet, et les questions de lore qui parlent de l'oiseau des pages de Sélène, ne passent pas par ce
filtre ; le nom propre et le cri restent interdits partout ». Règles § 1 : même phrase. Aucun contrôle nouveau ne
refuse « corbeau » dans `gl_qcm_lore_questions` ; « Krâ », « Kraa » et « krâ » y restent interdits (le test de contenu
du lot H le vérifie déjà pour la catégorie `histoire` : n'étends pas l'interdiction du nom commun aux autres
catégories).

### Étape QV2 — Jamais de page vierge en récompense de la Trame (décision QV2, V8) · lot 4

**Constat vérifié le 24/11 à 12 h** : `lib/glTrameDefis.js › pageTirable` (vers la ligne 997) écarte les pages de zone
de chasse, les modes `corbeau` et `carnet_route` (`MODES_HORS_DEFI`), et les titres ou incipits qui portent un mot
interdit ou un terme `secret` ; **pas les pages vierges**. En prod, quatre pages vierges actives entrent dans le groupe
de pages de leur chapitre (`resolveChapterFeuilletPool`) : `vierge-P1` (`jungle_afc`, `ordre_voyage` 1072),
`vierge-P2` (`foret_mediterraneenne`, 2058), `vierge-P3` (`landes`, 3068), `vierge-P5a` (`toundra`, 4108). Un défi
réussi peut donc donner une page blanche : une récompense qui ne contient rien.

**Changement attendu** :
1. Dans `pageTirable`, avant les autres contrôles : une page dont `type` vaut `vierge`, ou dont la colonne `vierge`
   vaut 1, n'est jamais tirable. `FEUILLET_SELECT` (`lib/glLoreFeuillets.js`) lit déjà `type` et `vierge`. Complète
   le commentaire de la fonction : « jamais une page vierge (rien à lire, décision QV2) ».
2. Rien d'autre : la page vierge garde ses autres chemins, ni données ni réglage ne changent, aucune migration.
3. Test, dans `tests/gl-trame-defis.test.js`, à côté du cas des pages écartées (vers la ligne 684) : une page
   `type = 'vierge'` et une page d'un autre type avec `vierge = 1`, toutes deux en tête du voyage, ne sont jamais dans
   `pagesTirables` ; la page tirable suivante passe en tête.

Les pages du copiste en récompense (tension du § 3 de l'audit des questions de validation) : réglé par le lot C
(addendum 3), qui sort `type = 'copiste'` du groupe de pages. Rien à faire ici.

### Étape QV5 — Le lexique lore ne sert plus les notes d'auteur aux élèves (décision QV5) · lot V, après V2

**Constat vérifié le 24/11 à 12 h 15** (code de `b8b5344`, base de prod) : `GET /api/gl/lore/glossary/:code`
(`routes/gl/lore.js`, vers les lignes 808-860) renvoie à tout lecteur les colonnes `role_recit`, `correspondance_reelle`
et `source` de la fiche ; `src/gl/components/GLLoreGlossaryPopover.jsx` (lignes 116-125) les affiche sous « Rôle
récit : » et « Correspondance réelle : ». Ce sont des **notes d'auteur pour le prof**, et elles disent ce que le jeu
tait : « le Souffle » → « Le réchauffement rapide d'origine humaine… » (le non-dit, en toutes lettres) ; « le Passeur »
→ « garant du non-dit » ; « la boîte » → « la clé de la chute » ; « l'étoile fixe du nord » → « décor de la révélation
finale » ; « Sélène » → « son identité se révèle peu à peu » ; « le Souffle » → « l'antagoniste sans visage ; il
poursuit Selene » ; « le cœur », « la gemme » → ressources de l'ancien jeu. 38 fiches non secrètes ont ces notes ; les
15 fiches de niveau `cle` sont lisibles par les élèves aujourd'hui.

1. **Serveur** : dans `GET /glossary/:code`, pour un lecteur qui n'est pas du staff G&L (`isMj(req)` faux), la réponse
   ne contient ni `role_recit`, ni `correspondance_reelle`, ni `source`. Le staff les reçoit toujours. Vérifie que la
   liste (`GET /glossary`) et l'index des liens (`GET /glossary/link-index`) ne les servent pas (au 24/11 : non) ; dis-le.
2. **Écran** : `GLLoreGlossaryPopover.jsx` n'affiche ces deux lignes que si le lecteur est du staff (prop existante ou
   nouvelle, au choix le plus simple) ; un élève ne voit que le terme, les deux définitions et les termes liés.
3. **Test de route** : élève (`gl_player`) et tablette d'équipe (`gl_guest`) → réponse sans les trois champs ; prof →
   avec.
4. **Test de contenu** `tests/content/gl-lexique-lore.test.js` (sur la base quand elle est là, vrai `t.skip` sinon),
   pour chaque fiche active de niveau autre que `secret`, sur `terme`, `definition_courte` et `definition_complete` :
   - aucune de ces chaînes (minuscules, sans accents, mots entiers) : « sud », « derriere », « tiede », « tiedeur »,
     « lies », « legs », « grondement », « chute », « terrasser », « eclat de verre », « retournement », « c'est
     nous », « kra », « kraa » ; aucun « Selene » sans accent (sensible aux accents) ; aucun « +1 » ;
   - une fiche de `chapitre_scope` numérique N (ou `tous`, `0`) ne nomme pas un visage dont le monde est après N :
     la Grise (2), le Silence (3), le Détricotage (4), l'Effacement (4), sauf la fiche du visage elle-même ;
   - message d'échec en français : code de la fiche, champ, mot.
   S'il échoue sur la base de prod, ne corrige aucune donnée : écris-le dans ton fichier de lot.
5. Docs : règles § 1 (garde-fous du lexique : les notes d'auteur sont réservées au prof) ; `docs/API.md` (champs de
   `GET /glossary/:code` selon le lecteur).

## 3. Choix par défaut posés par Claude (24/11, à retirer si Oliv le veut)

- Les douze questions restées éteintes ne sont pas réécrites sur un autre sujet : leur code reste lié à un terme du
  tiers `secret` ou à la page « La cendre sur la neige » (`ep-I-13`), qui se valide désormais à la lecture, sans
  question (comme les pages vierges et du copiste, position V7).
- Les questions réécrites sur un visage (`LQCM0263` la Grise, `LQCM0264` le Silence), le vieux cèdre (`LQCM0266`)
  et la garrigue ravivée (`LQCM0276`) passent au chapitre de leur monde (`ch2` ou `ch3`), comme leur fiche du lexique ; le nom du
  visage y est dit dans son monde, par son effet, comme le texte d'Histoire du plateau 2.
- Étape QV4 : l'émoji est retiré à l'affichage, pas en base (même règle que l'amorce « Non »).
- Étape QV2 : la page vierge est écartée par le code, sans la passer `inactif` en base.
- Étape QV5 : les notes d'auteur restent en base (le prof en a besoin) ; elles sont seulement retirées de la réponse
  et de l'écran d'un élève. Les variantes (« le carnet mourant », « la boîte de l'Ancien ») servent aux liens
  automatiques et à la liste : non touchées, à relire par Oliv.

## 4. Déjà passé en prod le 24/11 par le connecteur (pour le § 5bis ; ne pas refaire)

| Table | Changement |
| --- | --- |
| `gl_resource_question_links` | V1 : 548 liens `ecosystem` / `species` vers des questions `usage_tenir = 0` passés non bloquants (note `[V1 24/11 : était bloquant]`). V2 : 80 liens `ecosystem` vers `VQCM0001`-`0080`, bloquants, poids 2. V5 : 36 liens `feuillet` vers `LQCM0370`-`0405`, poids 2 ; les 36 gabarits « idée-clé » de ces pages non bloquants. V6a : 79 liens « s'ouvre ainsi » non bloquants. V3 : 11 liens vers `QCM0661`-`0671`, poids 2. R23 : 5 liens `lore_glossary` de questions réécrites sur un autre sujet passés non bloquants. |
| `gl_qcm_lore_questions` | `LQCM0370`-`0405` créées (catégorie `selene_carnet`, ch1 à ch4, numéros 501 à 510, tag `validation-page-zone`). 23 questions retirées le matin (tiers `secret`, renversement, mondes liés) ; à 11 h 31, **11 réécrites et réactivées** (`LQCM0158`, `0185`, `0190`, `0263`, `0264`, `0266`, `0267`, `0269`, `0270`, `0272`, `0276` ; tag `reecrite-24-11`, 5 choix, un retour par mauvais choix) ; **12 éteintes définitivement** (`LQCM0168`, `0265`, `0271`, `0273`, `0277`-`0281`, `0283`-`0285`, motif dans `notes_pedagogiques`). Distracteurs du pool des gabarits « idée-clé » qui révélaient le renversement remplacés ; « Selene » → « Sélène » dans 111 gabarits. |
| `gl_lore_glossary_terms` | 12 h 01 : `LR0005`, `LR0018`, `LR0020` réécrites (gardées par l'ancien texte). 12 h 14 (« Ok ») : 30 fiches réécrites (`LR0002`-`0004`, `0006`-`0009`, `0011`, `0013`-`0016`, `0019`, `0021`-`0026`, `0028`, `0030`-`0033`, `0035`, `0036`, `0040`, `0041`, `0044`, `0046` ; définitions courte et complète, textes dans `claude/Lexique_lore_reecriture_GL_2026-11-24.md`) ; termes « Selene » → « Sélène » (`LR0014`, `LR0019`, `LR0031`). Liens : `LR0005` ← `LQCM0050`, `0224`, `0345` et `LR0020` ← `LQCM0290` non bloquants (note `[Fiches 24/11 : …]`). Les colonnes `role_recit` et `correspondance_reelle` ne sont pas touchées (étape QV5). |
| `gl_qcm_questions` | `QCM0661`-`0668` (8 espèces de zone) et `QCM0669`-`0671` (3 mots de piste du glossaire), `usage_tenir = 1`. |
