# Lot moteur-4 — La question de case récompensée et la sonde

> Chantier G&L « décisions » · vague 1 · couloir moteur · charge forte · banc : seuils
> Branche : `claude/gl-decisions-moteur-4` · Attend : moteur-3, ecrans-2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Une bonne réponse à une question de case fait avancer l'équipe d'**une case**, de **trois si elle est sous le
  voile**. Elle ne fait plus relancer le dé.
- Elle donne aussi **une sonde** : l'équipe touche un dessin du plateau et lit « chaud », « tiède » ou « froid ».
  Ni question, ni page. Les deux fouilles du tour restent intactes.
- L'empreinte d'une sonde se voit sur le plateau de toute la classe, comme celle d'une fouille.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 17 du prompt | 23/11 | Question de case : bonne réponse = +1 case, sans relance. Ajustée par la décision 37 du prompt. | — |
| Décision 37 du prompt | 24/11, 11 h 47 | Une bonne réponse avance d'une case, de trois sous le voile, et donne une sonde (détail sous le tableau). | « Je suis ton avis. » |
| Décision du 24/11 après-midi (sonde) | 24/11, vers 14 h 35 | **Une sonde par bonne réponse de case**, à utiliser dans le tour. | (choix sur carte) |
| Décision 35 de l'addendum 4 (pour le rôle) | 24/11, 11 h 50 | L'Opératrice ou l'Opérateur répond à la question de case. | — |

Décision 37 du prompt, en entier : la sonde, c'est toucher un dessin du plateau pour lire « chaud », « tiède » ou
« froid » ; ni question, ni page ; dans une zone, au moins « chaud » ; empreinte visible de toute la classe ; perdue à
la clôture du tour ; même chose pour les deux peuples. Les fouilles ne changent pas (2 par tour, 1 sous le voile, pour
les deux peuples). La décision de vers 14 h 35 corrige le « une fois dans le tour » des anciens textes : deux bonnes
réponses dans un tour (cas rare) donnent deux sondes. La sonde revient à l'élève qui vient de répondre.

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Les textes : cases, carte du moment, `olu-pf-sonde`, `olu-14`, `olu-18`, verdict préfixé « Sonde : », message du
  refus (section 4).
- « Sous le voile » s'apprécie au moment de la réponse. Le bonus ne s'ajoute ni au vent ni à Progression. La case
  d'arrivée du bonus joue, sauf une case question (jamais deux questions de suite).
- La sonde n'est pas une fouille : elle ne consomme ni n'ajoute de fouille. Une sonde dans une zone déjà trouvée
  suit le calcul normal, sans dire qu'elle est trouvée. L'oiseau témoin vole aussi vers une sonde.
- Aucune route nouvelle : un champ `sonde` sur `POST …/chasse/fouiller`. Le droit de sonder est un effet
  `kind = 'sonde'` dans `gl_game_tenir_effets`, sans stock. Code du refus : 409 `PAS_DE_SONDE`. Nom de l'évènement :
  `chasse_sonde`. Place dans l'ordre des gestes : entre « lancer » et « fouiller ».
- Les badges de chasse ne comptent pas les sondes.
- `tenir_relances_max_par_tour` reste au registre des réglages, sans usage.
- La colonne `sonde` change le schéma : la décision ne le nomme pas, c'est un choix de mise en œuvre.

## 3. Fichiers

**À toi**

- `lib/glTour.js` (`bonneReponseDeCaseTx`, l. 2146-2250, et son commentaire de section)
- `lib/glChasse.js` (`fouillerTx` l. 394, `countFouillesUtilisees` l. 248, empreintes servies l. 1484)
- `lib/glTenirInvariants.js` (l. 442 et l. 477-505)
- `lib/glJournalPresentTenir.js` (`relance_bonus` l. 240, nouvel évènement `chasse_sonde`)
- `lib/glTenirOlu.js` (`PREMIERE_FOIS_CLES` l. 115, `PREMIERE_FOIS_EVENT_TYPES` l. 157)
- `lib/glTenirBadges.js` (l. 33), `lib/glRewardsMetrics.js` (l. 64), `lib/glDiagnostic.js` (l. 465)
- `routes/gl/games/chasse.js` (`POST /games/:id/chasse/fouiller`, l. 252), `routes/gl/games/tenir-tour.js`
  (`fouillesDuTour` l. 140, `GET /games/:id/tenir/tour` l. 166), `routes/gl/games/qcm.js` (commentaires l. 165 et
  419-420)
- `src/shared/glSortMomentsCore.js` (le rôle du geste « sonder »)
- Tests : `tests/gl-tenir-question-case.test.js`, `tests/gl-journal-tenir-exhaustif.test.js`,
  `tests/gl-tenir-droits-serveur.test.js`, `tests/gl-ensemble-unifie-fouilles.test.js`,
  `tests/gl-ensemble-unifie-olu-premiere-fois.test.js`, `tests/gl-ensemble-unifie-deux-ecrans.test.js`

**Nouveaux**

- `migrations/<numéro pris à la fin>_gl_cases_question_sonde_textes.sql` (étiquette `mig-cases-question`)
- `migrations/<numéro pris à la fin>_gl_chasse_empreintes_sonde.sql` (étiquette `mig-sonde`)
- `tests/gl-tenir-sonde.test.js`, `tests/gl-migration-cases-question.test.js`
- `changelog.d/gl-decisions-moteur-4.md`, `docs/prompts/gl-decisions/rapports/moteur-4.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `src/gl/utils/glTenirMoment.js` et `tests-ui/gl/glTenirMoment.test.js` | L'état « Sondez le plateau » et le verdict préfixé (étape moteur-4.3). |
| `src/gl/hooks/useGlChasse.js` | Une option `sonde` sur `fouiller` (l. 64). |
| `src/gl/components/tenir/GLTenirEcranEquipe.jsx` et `tests-ui/gl/GLTenirEcranEquipe.test.jsx` | Brancher `sondesRestantes` et le mode fouille de la sonde. Rien d'autre. |
| `src/gl/constants/tenirTextes.js` | Les textes du verdict d'une sonde, à côté de `TENIR_VERDICT_TEXTES` (l. 36). |
| `data/gl/tenir/olu-lignes.json` (et `exemple/` si un test y lit ces lignes) | `olu-14`, `olu-18`, ajout d'`olu-pf-sonde`. |
| `data/gl/tenir/README.md` | La liste des clés « première fois » (l. 188) : ajouter `sonde`. |
| `tools/gl-sim/equipe.js`, `tools/gl-sim/mesures.js`, `tools/gl-sim/scenarios/multi-appareils.js`, `tools/gl-sim/scenarios/regression-7nov.js` | Apprendre la nouvelle règle au banc (section 7). |
| `docs/API.md`, `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0), `docs/reference/gl/guide-du-mj.md` | Section 9. |

**Ne touche pas**

| Fichier ou symbole | Lot qui le modifie |
| --- | --- |
| `src/gl/components/tenir/GLTenirEquipeView.jsx` | ecrans-4 (il le supprime) |
| `src/gl/components/mj/GLTourScreen.jsx` (console) | ecrans-4 (il y monte la sonde de l'équipe active) |
| `src/gl/components/tenir/GLChasseLayer.jsx`, `GLKraaWitness.jsx` (rendu des empreintes, oiseau) | ecrans-10 |
| `src/gl/components/tenir/GLTenirMoment.jsx` (habillage, plaque du rôle) | ecrans-7 |
| `src/gl/components/settings/GLTenirSettings.jsx` | voir « Pour Oliv » |
| `lib/glTour.js › ajouterLumiereTx`, `lib/glTrameDefis.js` | moteur-5 |
| `lib/glVoyageur.js` (l. 915-923, fouille du voyageur en veillée) | personne : elle écrit une empreinte sans la colonne, le défaut 0 suffit |
| `sql/schema_foretmap.sql` | personne : il ne porte pas les tables `gl_game_*` |

## 4. Étapes (un commit par étape, dans cet ordre)

**Banc d'abord** : passe « avant » (section 7).

### moteur-4.1 — Question de case : une case, trois sous le voile, sans relance (ex-étape 19)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `lib/glTour.js › bonneReponseDeCaseTx` (l. 2146) | Avance d'une case **et** réarme le dé (relance, bornée par `tenir_relances_max_par_tour`) ; écrit un effet `relance_case` (l. 2177-2203) et l'évènement `relance_bonus` (l. 2211) avec `{ cases: 1, relance }`. |
  | Plateau 1 | 16 cases sur 43 sont des cases question : une bonne réponse vaut environ 8 cases. Le savoir paie en mouvement, contraire à la thèse du jeu. |
  | `lib/glChasse.js › isSousVoile(db, gameId, team)` (l. 282) | Déjà utilisé par la chasse ; c'est le même voile que la projection montre. |
  | `lib/glTenirInvariants.js` (l. 477-505) | Compte les effets `relance_case` pour l'invariant `RELANCES_MAX`. |
  | `lib/glJournalPresentTenir.js` (l. 240-248) | « … a bien répondu : +1 case et une relance ». |
  | Prod, `gl_chapter_markers` (24/11) | 61 cases portent exactement les deux anciens textes de la section 5 ; aucune ne dit « sondez le plateau ». |

- **Changement attendu** :
  1. Une bonne réponse avance d'**une case**, ou de **trois si l'équipe est sous le voile** au moment de la réponse
     (`isSousVoile`). Le savoir aide d'abord ceux qui sont derrière. Plus de réarmement du dé, plus d'effet
     `relance_case`.
  2. La case d'arrivée du bonus s'applique, **sauf une case question** : jamais deux questions de suite (une seule
     question par arrivée de jet). Au camp, on s'arrête au camp. Le bonus ne s'ajoute ni au vent ni à Progression.
  3. L'évènement `relance_bonus` garde son nom, avec `cases` (1 ou 3), `sousVoile` et `relance: false`. Le journal
     garde sa tournure (« {équipe} a bien répondu : … ») et dit, selon le cas, les mots de la rubrique « Textes ».
  4. La bonne réponse donne aussi **une sonde** (étape moteur-4.2).
  5. `tenir_relances_max_par_tour` reste au registre ; il ne sert plus aux questions de case. Aligne
     `lib/glTenirInvariants.js` (vers la l. 482) et les commentaires de `routes/gl/games/qcm.js` (l. 165, 419-420).
  6. Migration `mig-cases-question` (section 5) : les textes des cases question.
  7. `data/gl/tenir/olu-lignes.json` (et `exemple/` si un test les lit) : `olu-14` et `olu-18` (rubrique « Textes »).
     `olu-pf-avancer` (« Deux dés, et la caravane avance. Une bonne réponse, et elle avance encore d'une case. »)
     reste vrai : n'y touche pas.
- **Textes** (mot pour mot) :
  - journal : « une case de plus » ; « trois cases de plus : l'équipe sort du voile » (si elle en sort) ; « trois
    cases de plus » ;
  - `olu-14` : « Juste ! La caravane avance, et vous pouvez sonder le plateau. »
  - `olu-18` : « La ou le Gestionnaire a tranché. Une équipe qui tranche, j'aime ça. » (forme double ; voir « À
    relire »)
  - cases : section 5.
- **Tests** : bonne réponse hors voile → +1 case, dé non réarmé ; sous le voile → +3 ; bonus qui finit sur une case
  question → pas de seconde question ; bonus qui finit au camp → camp ; évènement `relance_bonus` avec `cases` et
  `sousVoile`. `tests/gl-tenir-question-case.test.js` affirme l'ancienne règle (l. 54-93 : « dé réarmé (relance) »,
  `{ cases: 1, relance: true }` ; l. 117-158 : « une seule relance ») : réécris ces cas.
  `tests/gl-journal-tenir-exhaustif.test.js` suit le nouveau libellé.
- **Critère d'acceptation** : aucune bonne réponse ne rend le dé ; plus aucune ligne `relance_case` écrite.

### moteur-4.2 — La sonde, côté serveur (ex-étape 35, points 1 à 6)

**Ce que c'est** : après une bonne réponse à une question de case, l'équipe peut **sonder** le plateau. **Une sonde
par bonne réponse**, à utiliser dans le tour. Elle touche un dessin, et lit « chaud », « tiède » ou « froid ». Ni
question, ni page. C'est une aide à la chasse, pas une fouille : elle ne consomme ni n'ajoute de fouille. Même règle
pour les deux peuples.

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `gl_game_tenir_effets.kind` | `VARCHAR(32)` (`migrations/330_gl_tenir_fondations.sql`) : `'sonde'` s'écrit sans migration. `lib/glChasse.js › countEffet` (l. 233) sait compter un effet par équipe et par tour. |
  | `lib/glChasse.js › verdictForDistance` (l. 219) | Verdict d'une fouille tombée à côté, d'après la distance à la zone la plus proche et les seuils `fouille_seuils`. |
  | `lib/glVoyageur.js` (l. 915-923) | Calcule déjà « au moins chaud dans une zone non trouvée, sinon distance à la zone endormie la plus proche » : bon modèle pour le verdict d'une sonde. |
  | `gl_game_chasse_empreintes.verdict` | `ENUM('froid','tiede','chaud','zone','deja_trouvee')` : une sonde n'a besoin d'aucune valeur nouvelle. |
  | Évènements de chasse existants | `fouille`, `page_revelee`, `pas_encore`, `page_lue` (sans préfixe). |
  | Prod (24/11) | La colonne `sonde` n'existe pas. |

- **Lecteurs des empreintes qui compteraient une sonde comme une fouille** (les anciens textes n'en nommaient
  qu'un) :

  | Fichier | Ce qu'il lit | À faire |
  | --- | --- | --- |
  | `lib/glChasse.js › countFouillesUtilisees` (l. 248) | fouilles du tour de l'équipe | ne compter que `sonde = 0` |
  | `lib/glTenirInvariants.js` (l. 442) | invariant des fouilles par tour (rejoué par le banc à chaque geste) | `sonde = 0` |
  | `lib/glTenirBadges.js` (l. 33) | badge des fouilles « chaud » par élève | `sonde = 0` |
  | `lib/glRewardsMetrics.js` (l. 64) | métrique `fouilles` des badges à paliers (« Fouilleuse / Fouilleur » après le lot contenu-2) | `sonde = 0` |
  | `lib/glDiagnostic.js` (l. 465) | compteur de fouilles d'une partie | `sonde = 0` ; un compteur de sondes à part si c'est simple |
  | `lib/glChasse.js` (l. 1484) | empreintes servies au plateau | servir aussi `sonde` (booléen) |

- **Changement attendu** :
  1. **Droit de sonder** : `bonneReponseDeCaseTx` écrit un effet `kind = 'sonde'` dans `gl_game_tenir_effets` pour
     l'équipe et le tour. Sondes restantes = effets `sonde` du tour − empreintes de sonde du tour. Aucun stock : à
     la clôture du tour, il n'en reste rien.
  2. **Geste** : sur la route existante `POST /api/gl/games/:id/chasse/fouiller`, un champ `sonde: true` dans le
     corps. **Aucune route nouvelle.** Mêmes droits que la fouille (`glTenirPermissionsCore` : phase `jeu`, l'équipe
     sur tablettes, le prof pour l'équipe active au tableau), mêmes contrôles de main et de version d'état. Refus
     sans sonde restante : 409 `PAS_DE_SONDE`.
  3. **Verdict** : le calcul d'une fouille tombée à côté (`verdictForDistance`, distance au centre de la zone
     endormie, révélée ou pâlie la plus proche, seuils `fouille_seuils`). **Une sonde à l'intérieur d'une zone non
     trouvée vaut au moins « chaud »**, jamais « tiède » ni « froid », et jamais le verdict `zone`. Une sonde dans
     une zone déjà trouvée suit le calcul normal, sans dire qu'elle est trouvée. Jamais de question, jamais de
     changement d'état de zone, jamais de révélation.
  4. **Empreinte** : une ligne dans `gl_game_chasse_empreintes`, visible de toute la classe comme les autres, avec
     la colonne nouvelle `sonde` (migration `mig-sonde`, section 5). Applique le tableau des lecteurs ci-dessus.
  5. **L'oiseau témoin** vole vers le point sondé, comme pour une fouille. Évènement `chasse_sonde` (payload :
     `teamId`, `verdict`, point), présenté au journal.
  6. **Vue du tour** : `sondesRestantes` par équipe, ajouté à la réponse existante de `GET …/tenir/tour` (un champ
     de plus, pas de route), à côté des fouilles (`routes/gl/games/tenir-tour.js › fouillesDuTour`). Servi à
     l'équipe et au prof.
- **Textes** (mot pour mot) :
  - refus : « Pas de sonde ce tour-ci. »
  - journal : « {équipe} sonde le plateau : chaud. » (ou « tiède », « froid »)
- **Tests** (`tests/gl-tenir-sonde.test.js`) : bonne réponse → une sonde ; deux bonnes réponses dans le tour (cas
  rare) → deux ; sonde sans droit → 409 `PAS_DE_SONDE` ; sonde à côté → le même verdict qu'une fouille au même
  point ; sonde dans une zone endormie, même au bord d'une grande zone → « chaud » et aucun changement d'état ;
  sonde → fouilles restantes inchangées ; tour clos → plus de sonde ; licorne et gnome → même règle ; au tableau, le
  prof sonde pour l'équipe active ; une sonde ne fait pas monter les badges de chasse.
- **Critère d'acceptation** : l'invariant des fouilles du banc reste vrai avec des sondes ; `docs/API.md` à jour.

### moteur-4.3 — La sonde, à l'écran et chez Olu (ex-étape 35, points 7 à 11)

Écran : la tablette d'équipe. Au tableau, la sonde se montera dans le bloc « Équipe active » de la console, au lot
ecrans-4.

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `src/gl/utils/glTenirMoment.js › ORDRE_DES_GESTES` (l. 42) | `['repondre', 'lancer', 'fouiller', 'lire', 'jeter']`. |
  | `src/gl/constants/tenirTextes.js › TENIR_VERDICT_TEXTES` (l. 36) | Retours d'une fouille : « Froid : la page dort plus loin. », « Tiède : on s’approche. », « Chaud : la page est tout près. » |
  | `src/gl/hooks/useGlChasse.js › fouiller` (l. 64) | Envoie `{ x, y, teamId? }`. |
  | `lib/glTenirOlu.js` | 24 clés « première fois » ; `tests/gl-ensemble-unifie-olu-premiere-fois.test.js` (l. 66-67) en attend 24. |
  | Après le lot moteur-2 | `ROLES_TENIR.repondre` vaut « Opératrice ou Opérateur ». À quatre, `roleDuGeste('repondre', 4)` rend « Assistante ou Assistant ». |

- **Changement attendu** :
  1. **Carte du moment** (`glTenirMoment.js`) : quand `sondesRestantes > 0`, un état de plus, placé juste avant
     « fouiller » dans l'ordre des gestes (répondre, lancer, sonder, fouiller, lire, sorts). Le plateau passe en mode
     fouille, bord doré, comme pour une fouille ; le toucher envoie `sonde: true` (`useGlChasse.js` : une option
     `sonde` sur `fouiller`).
  2. **Rôle** : la sonde est tenue par **l'Opératrice ou l'Opérateur**, l'élève qui vient de répondre à la question
     de case. Le rôle écrit au-dessus du geste est celui du geste « répondre » (`roleDuGeste`, avec l'effectif de
     l'équipe). La plaque « Opératrice ou Opérateur, à toi » viendra avec l'habillage de la table de jeu (lot
     ecrans-7) : ne la fais pas ici.
  3. **Verdict** : le retour récent d'une fouille, préfixé « Sonde : », avec « Continuer » ; l'empreinte reste sur
     le plateau.
  4. **Olu, première fois** : clé `sonde` dans `lib/glTenirOlu.js › PREMIERE_FOIS_CLES` et
     `PREMIERE_FOIS_EVENT_TYPES` (évènement `chasse_sonde`) ; ligne `olu-pf-sonde` ajoutée à `olu-lignes.json`
     (`moment: "premiere_fois"`, `cle: "sonde"`, `seance_escalier: 1`). Adresse « vous » : elle passe le test
     d'adresse.
  5. **Projection** : l'empreinte apparaît comme les autres ; rien de plus.
  6. **Escalier** : la sonde suit la question de case (module `avancer`) et la chasse (`chercher`), ouverts à la
     marche 1 : rien à ajouter.
- **Textes** (mot pour mot) :
  - carte du moment : « Sondez le plateau : touchez un dessin. »
  - verdict : « Sonde : chaud, une page dort tout près. » Les anciens textes ne donnent que ce cas. Pour « tiède »
    et « froid », bâtis sur le même moule à partir des textes existants (« Sonde : tiède, on s'approche. »,
    « Sonde : froid, la page dort plus loin. ») et range les deux dans « À relire par Oliv ».
  - `olu-pf-sonde` : « Je ne vois pas les pages, je sens leur chaleur. Touchez un dessin : chaud, tiède ou froid. »
- **Tests** : UI de la carte du moment (état « Sondez le plateau » puis verdict) ; la sonde porte le rôle
  « Opératrice ou Opérateur » (test que l'ancien texte rangeait avec l'échange des rôles) ; ligne `olu-pf-sonde`
  dite une fois par partie ; 25 lignes « première fois » au lieu de 24 ; `tests/content/gl-adresse-ecran-equipe.test.js`
  vert.
- **Critère d'acceptation** : sur une tablette 1024 × 768, après une bonne réponse, la carte propose de sonder
  avant de fouiller ; le verdict s'affiche ; les deux fouilles sont toujours là.

## 5. Migration

Deux migrations, deux fichiers.

**`mig-cases-question`** (étape moteur-4.1)

- **Table** : `gl_chapter_markers` (cases question des plateaux 1 à 4).
- **`description`**, ancien texte (garde exacte) :
  `'Une question du biome. Bonne réponse : une case de plus et vous relancez.'`
- **`description`**, nouveau texte :
  `'Une question du biome. Bonne réponse : la caravane avance d''une case, de trois sous le voile, et vous sondez le plateau.'`
- **`effet_mecanique`**, ancien texte (garde exacte) :
  `'Question sur le biome. Bonne réponse : l''équipe avance d''une case et relance le dé (une relance par tour). Pas encore : rien ne change, on repart.'`
- **`effet_mecanique`**, nouveau texte :
  `'Question sur le biome. Bonne réponse : l''équipe avance d''une case (de trois si elle est sous le voile) et peut sonder le plateau une fois dans le tour. Pas encore : rien ne change, on repart.'`
- **Prod au 24/11** : les deux gardes tiennent, 61 cases pour chacune.
- **Base neuve** : l'ancien `effet_mecanique` vient de `migrations/337_gl_cases_verite.sql` ; la garde le trouve.
  L'ancienne `description`, elle, n'existe **qu'en prod** (posée à la main le 23/11). Une base bâtie par les seules
  migrations porte encore `'Tire une carte question du biome. Bonne réponse : +1 case et on relance.'`
  (`migrations/330_gl_tenir_fondations.sql`, l. 385) : garde la migration sur **l'un ou l'autre** de ces deux
  anciens textes, vers le même nouveau texte. Sans case question en base, elle ne fait rien.
- **Test** : `tests/gl-migration-cases-question.test.js` sème les deux anciennes descriptions et l'ancien effet, joue
  la migration deux fois, vérifie les nouveaux textes et qu'aucune autre case n'a bougé.

**`mig-sonde`** (étape moteur-4.2)

| Point | Valeur |
| --- | --- |
| Table | `gl_game_chasse_empreintes` |
| Écriture | `ADD COLUMN sonde TINYINT(1) NOT NULL DEFAULT 0`, seulement si la colonne manque (modèle : la colonne `reparation`, `migrations/338_gl_tenir_equilibrage.sql`, l. 61-64). |
| Prod au 24/11 | La colonne n'existe pas : la migration l'ajoutera. |
| Base neuve | Même chose : la table vient de `migrations/332_gl_tenir_chasse.sql`, sans la colonne. |

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire : tous les textes sont dans cette fiche.

## 7. Vérifications propres au lot

- **Banc, régime « seuils »** : une passe **avant** l'étape moteur-4.1, une passe **après** l'étape moteur-4.3, avec
  les trois commandes des règles communes. À noter, avant et après :
  - l'**écart de cases** entre l'équipe la plus avancée et la dernière au camp ;
  - la **part des équipes sous le voile**, par plateau ;
  - les **pages trouvées** par chapitre ;
  - le **carnet complet** aux plateaux 3 et 4.
- **Seuils d'alerte**, à écrire dans ton rapport sans rien changer aux réglages : carnet complet au-dessus de 60 %
  aux plateaux 1 et 2 (chasse trop facile) ; écart au camp qui se creuse par rapport à la passe « avant ».
- **Apprends la règle au banc** :
  - `tools/gl-sim/equipe.js` (l. 347-391) boucle sur la relance d'une bonne réponse : elle ne viendra plus ;
  - `tools/gl-sim/mesures.js` (l. 406, `relancesCase`) et `tools/gl-sim/scenarios/regression-7nov.js` (l. 194-207)
    lisent `relance_case` et `relance === true` ;
  - `tools/gl-sim/scenarios/multi-appareils.js` (l. 58-78, contrôle `JETS`) compte chaque `relance_bonus` comme un
    jet rendu : ce n'est plus vrai ;
  - la sonde : donne aux robots la règle la plus simple (sonder près de l'indice, fouiller le point le plus
    chaud). Si c'est trop long, mesure sans la sonde et dis-le.
  - `tools/gl-sim/modele-rapide/sim_tenir_modele.py` décrit l'ancienne règle (l. 15-16) : aligne-le si c'est
    simple, sinon signale-le.
- Import strict à blanc (`npm run gl:import:tenir -- --fichier tous --strict --dry-run` sur ta base de banc) et
  `npm run test:content`.
- e2e (sous le verrou) : `e2e/gl-tenir-tablettes.spec.js` et ceux du tour.
- Relecteur : `gl-relecteur-garde-fous` sur les lignes d'Olu et les textes des cases.
- Captures (`docs/captures/gl-decisions/moteur-4/`) : tablette 1024 × 768, carte du moment « Sondez le plateau »,
  puis le verdict et l'empreinte ; projection avec l'empreinte d'une sonde.

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| Réponse d'une bonne réponse de case (`tenir.bonus`) | `{ cases: 1, relance: true }` | `{ cases: 1 ou 3, sousVoile, relance: false }`, plus la sonde |
| Dé après une bonne réponse | réarmé | non réarmé |
| Effet `relance_case` | écrit | plus jamais écrit ; effet `sonde` à la place |
| `POST …/chasse/fouiller` | `{ x, y, teamId? }` | accepte `sonde: true` ; 409 `PAS_DE_SONDE` |
| `GET …/tenir/tour` | fouilles par équipe | plus `sondesRestantes` |
| Empreintes servies au plateau | sans `sonde` | avec `sonde` |
| `ORDRE_DES_GESTES` | répondre, lancer, fouiller, lire, sorts | répondre, lancer, sonder, fouiller, lire, sorts |
| Lignes « première fois » d'Olu | 24 | 25 (`olu-pf-sonde`) |
| `olu-14` | « Juste ! Une case de plus, et on relance. Le savoir fait marcher. » | « Juste ! La caravane avance, et vous pouvez sonder le plateau. » |
| Textes de 61 cases question | « … une case de plus et vous relancez. » | « … la caravane avance d'une case, de trois sous le voile, et vous sondez le plateau. » |

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) : § 4 « Avancer » (questions de case ; l. 133 parle encore de « la
  relance d'une question juste ») ; § 5 « La chasse » (la sonde, une phrase par point de l'étape moteur-4.2).
- `docs/API.md` : `sonde` sur `/chasse/fouiller` (l. 467), 409 `PAS_DE_SONDE`, `sondesRestantes`, évènement
  `chasse_sonde`, `relance_bonus.cases` et `sousVoile`.
- `docs/reference/gl/guide-du-mj.md` et `docs/reference/gl/economie-marche-sorts.md` (l. 442-443) : seulement la
  phrase devenue fausse (« une relance par équipe et par tour »).
- `.claude/skills/gl-*` : « relance après une bonne réponse », si une phrase le dit.
- Pour le § 0 des règles (dans ton rapport) : « 24/11 : une bonne réponse à une question de case avance d'une case,
  de trois sous le voile, et donne une sonde du plateau (chaud, tiède, froid, sans question ni page) ; les fouilles
  ne changent pas ».

## 10. Hors périmètre

| Ce que ce lot ne fait pas | Lot qui le fait |
| --- | --- |
| La sonde au tableau, dans le bloc « Équipe active » de la console | ecrans-4 |
| La plume à la place de la pastille, l'oiseau qui se pose, la lanterne | ecrans-10 |
| La plaque « Opératrice ou Opérateur, à toi » et l'habillage de la carte | ecrans-7 |
| Les sons du tour | ecrans-11 |
| Les deux docs du prof, les règles v4 | fin-1, fin-2 |
| Plafond et prix (bourse, sorts) ; réglage des fouilles | hors chantier |

**Ce que les lots suivants attendent de celui-ci** (à recopier dans ton rapport, avec les noms réels) :

| Lot | Ce qu'il attend |
| --- | --- |
| ecrans-4 | `sondesRestantes` par équipe dans `GET …/tenir/tour`, servi au prof ; `POST …/chasse/fouiller` avec `sonde: true` accepté du prof pour l'équipe active au tableau ; l'état « Sondez le plateau » de `glTenirMoment.js`, réutilisable par la console ; le 409 `PAS_DE_SONDE`. |
| ecrans-10 | Le booléen `sonde` sur chaque empreinte servie au plateau (une empreinte de sonde se rendra en plume, comme une fouille) ; l'évènement `chasse_sonde` et l'oiseau témoin posé sur le point sondé ; « sonde armée » lisible à l'écran (`sondesRestantes > 0`), pour allumer la lanterne. |

## 11. Pour Oliv

**À relire**

- **`olu-18` nomme la ou le Gestionnaire** (« La ou le Gestionnaire a tranché. Une équipe qui tranche, j'aime
  ça. »), alors que cette ligne se dit au moment d'une question et que, depuis l'échange des rôles, c'est
  l'Opératrice ou l'Opérateur qui répond. Le texte est posé tel que décidé ; dis qui « tranche ».
- **« La caravane avance »** dans le texte des cases et dans `olu-14` désigne ici une équipe. Or « la caravane »
  veut dire toute la classe, jamais une équipe (lexique du voyage). Textes posés tels que décidés.
- **« … peut sonder le plateau une fois dans le tour »** (texte `effet_mecanique` des cases) : depuis ta décision de
  vers 14 h 35, c'est une sonde par bonne réponse. Le texte est posé tel quel.
- Les verdicts « Sonde : tiède… » et « Sonde : froid… », bâtis par la session (les anciens textes ne donnaient que
  « chaud »).
- **À quatre**, c'est l'Assistante ou l'Assistant qui répond à la question : la carte de la sonde affichera donc
  « Assistante ou Assistant ». Les anciens textes ne disent rien de ce cas.
- « Sondez le plateau : touchez un dessin. », « Pas de sonde ce tour-ci. », `olu-pf-sonde`.
- `GLTenirSettings.jsx`, l. 13 : le libellé du réglage « Question de case : juste → +1 case et on relance » devient
  faux avec ce lot. Aucun lot ne le corrige.

**À faire après la vague**

- Le catalogue `olu-lignes` se recharge seul au démarrage ; vérifie-le dans Contenus → Chapitres.
- Sur une partie neuve : une bonne réponse à une question de case avance d'une case (de trois sous le voile), puis
  « Sondez le plateau » ; une sonde dans une zone dit « chaud », n'ouvre rien, et laisse les deux fouilles intactes.
- Au tableau, la sonde n'a pas encore de bouton tant que le lot ecrans-4 n'est pas fusionné.
