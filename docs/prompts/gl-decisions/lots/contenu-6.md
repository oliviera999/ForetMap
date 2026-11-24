# Lot contenu-6 — Les marges du copiste

> Chantier G&L « décisions » · vague 2 · couloir contenu · charge forte · banc : fumée
> Branche : `claude/gl-decisions-contenu-6` · Attend : contenu-5 (et, par lui, contenu-4 et ecrans-6) · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Dans « Mon sac », à la veillée, l'élève lit « Les marges du copiste » : chaque page de Sélène tenue par la caravane
  fait reparaître une note au crayon. Deux compteurs : pages de Sélène, notes du copiste.
- Au camp, le prof ouvre l'enveloppe du monde depuis sa console : le reste des notes de ce monde reparaît. En juin, il
  ouvre le double fond : les notes de juin, la lettre, et la liasse de fin de Sélène.
- Le prof lit les notes à la classe en « grand texte », depuis sa console.
- L'intro par défaut du dépôt n'a plus que deux voix (le Passeur et Sélène).
- Rien ne s'ouvre seul : ni à la clôture d'une partie, ni sur une tablette, ni en projection.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 29 de l'addendum 3 | 24/11, 11 h 07 et 11 h 16 | Le copiste existe à part entière. Il a tout écrit avant, pour « la classe qui viendra » ; ses marges au crayon ont pâli avec le carnet, et chaque page de Sélène tenue par la caravane en fait reparaître une. Le reste des notes d'un monde reparaît quand le prof ouvre l'enveloppe de ce monde au camp ; juin, quand il ouvre le double fond. L'élève les lit dans « Les marges du copiste », avec deux compteurs. L'app sert tout ce qui touche au copiste. | — |
| Décision 31 de l'addendum 3 | 24/11, 10 h 15 | Le copiste sort de l'intro : la version de l'intro proposée le 24/11 devient le texte par défaut du dépôt. | — |
| Décision 42 de l'addendum 3 | 24/11, 12 h 11 | La liasse de fin de Sélène (`ep-I-16`, `ep-I-17`, `ep-finale`) est remise quand le prof ouvre le double fond, plus à la clôture du plateau 4. | — |
| I6 de l'addendum 2, redite | 24/11, 11 h 53 et 12 h 11 | À l'écran d'un élève, la classe en jeu se dit « la caravane ». Le copiste, lui, vit avant le miroir : il peut dire « classe ». | « Non pas que la caravane » ; « Caravane est ok. » |
| « Mon sac » | 24/11, 14 h 16 | L'espace personnel de l'élève s'appelle « Mon sac » (« ton sac » dans une phrase). Deux états : sac fermé pendant le tour, sac ouvert à la veillée ; les marges du copiste sont à la veillée. Le code ne se renomme pas. | « Je valide » |
| Test propre au copiste | 24/11, vers 14 h 35 | Le test « pas de copiste dans l'intro » ne porte pas sur l'identifiant de scène `copiste`. | (choix sur carte) |

**Choix par défaut posés par Claude** (Oliv peut les retirer ; liste-les dans ton rapport) :

- Une note s'allume à chaque page tenue, dans l'ordre de l'arc, quelle que soit la page. Le reste du monde et
  l'enveloppe reparaissent quand le prof ouvre l'enveloppe ; juin quand il ouvre le double fond (un geste chacun, au
  moment vécu en classe ; rien ne s'ouvre seul à la clôture).
- Compteur « Pages de Sélène tenues par la caravane » (le verbe du jeu), et non « retrouvées ».
- La caravane est la classe : les notes sont communes à toute la classe, jamais individuelles. Pas de course entre
  élèves, pas d'effet Matthieu.
- Les notes ne donnent rien en jeu : ni gemme, ni Lumière, ni badge.
- Bloc caché tant qu'aucune note n'est allumée ; notes éteintes sans texte côté serveur.
- La lecture en classe passe par le bouton de la console ; aucune note n'apparaît d'elle-même en projection ni sur la
  tablette d'équipe.
- La liasse de fin de Sélène part avec le double fond.
- Plusieurs parties d'une classe sur un même plateau : la plus avancée (terminée d'abord, sinon le plus de pages
  tenues) ; les parties `draft` sont ignorées.
- Dessin des enveloppes en emoji ou en icône, au choix du lot.
- **Ajouts de cette fiche** (à retirer si Oliv le veut) :
  - la route de lecture ne sert **ni la tablette ni la projection** (étape contenu-6.2) ;
  - une page compte dès qu'elle a été tenue une fois (`tenue_at`), pour qu'une note allumée le reste (section 11) ;
  - titres des liasses et libellé de journal du double fond (étapes contenu-6.2 et contenu-6.3) ;
  - le bloc ne se rend pas pendant un tour : une prop `tourOuvert`, que le lot ecrans-8 branchera.

## 3. Fichiers

**À toi**

- `routes/gl/games/status.js` (la remise de la liasse à la clôture, l. 202-208, seulement)
- `data/gl/intro.default.json`
- `tests/gl-intro.test.js`, `tests/gl-intro-lib.test.js`, `tests/gl-game-end-closing-bundle.test.js`,
  `tests/gl-game-status.test.js` (à faire suivre)

**Nouveaux**

- `lib/glCopisteMarges.js`, `routes/gl/copiste.js`
- `src/gl/components/GLCopisteMarges.jsx` (**pas** de dossier `src/gl/components/seuil/` : il n'existe pas)
- `tests/gl-copiste-marges.test.js` (fonction pure et lecture), `tests/gl-copiste-routes.test.js`,
  `tests-ui/gl/GLCopisteMarges.test.jsx`
- `changelog.d/gl-decisions-contenu-6.md`, `docs/prompts/gl-decisions/rapports/contenu-6.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `server.js` | Monter la route : `app.use('/api/gl/copiste', …)`, à côté de `/api/gl/lore` (l. 606). |
| `src/gl/components/GLSeuilView.jsx` | Monter `<GLCopisteMarges />` **entre `GLSeuilMentorat` (l. 557) et `GLSeuilGardeRobe` (l. 560)** ; la ligne « nouvelle note » en tête. Modifié avant toi par ecrans-6, habillé après toi par ecrans-8. |
| `src/gl/components/GLGameMasterConsole.jsx` | L'action « Marges du copiste » dans les actions de chaque partie (`gameListRows`, vers la l. 774). **Pas** dans `mj/GLGameMasterConsoleParties.jsx`, qui ne fait qu'afficher ces lignes (l. 185). |
| `src/gl/components/mj/GLTourScreen.jsx` | **Une seule ligne d'aide** après le bouton « Clore le chapitre » (l. 723-732). Rien d'autre. |
| `src/gl/styles/gl-seuil.css` | Un bloc `.gl-copiste-marges…` lisible, sans plus : le lot ecrans-8 l'habille (crayon, graphite, papier réglé). |
| `lib/glTenir.js`, `lib/glEscalier.js` | Seulement ce qu'il faut pour que la clé `copiste` des surcharges ne soit pas effacée (étape contenu-6.3). |
| `lib/glJournalPresentTenir.js` | Le libellé des deux évènements `copiste_enveloppe` et `copiste_double_fond`. |
| Le test de vocabulaire posé par ecrans-6 (`tests/content/gl-mots-du-voyage.test.js`) | Ajouter `GLCopisteMarges.jsx` à sa liste. |
| `docs/API.md` | Les deux routes. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 1, hors § 0), `.claude/skills/gl-tenir-garde-fous/SKILL.md` | Le garde-fou écrit du copiste (étape contenu-6.5). |

**Ne touche pas**

| Fichier | Lot qui le modifie |
| --- | --- |
| `data/gl/copiste/notes.json`, la migration du copiste, `lib/glFeuilletChapterPool.js`, `lib/glFeuilletBundleGrant.js` | contenu-4 (déjà passé) : tu les **lis** |
| `routes/gl/lore.js` (dont la remise manuelle d'une liasse, l. 357-386) | contenu-2 à contenu-5 ; voir section 11 |
| `lib/glIntro.js` (les neuf identifiants de scène et la voix `copiste` restent) | personne |
| `lib/glTour.js`, `lib/glChasse.js`, `lib/glVoile.js` (le moteur ne change pas) | couloir moteur |
| `src/gl/components/tenir/*`, `GLProjectionView.jsx`, `src/gl/AppGL.jsx` | couloir ecrans |
| `docs/reference/gl/*.md`, § 0 des règles | fin-1, fin-2 |

## 4. Étapes (un commit par étape, dans cet ordre)

### contenu-6.1 — Quelles notes sont allumées : `lib/glCopisteMarges.js` (ex-étape C3)

- **Constat vérifié** :
  - Après contenu-4, les notes sont en base : `gl_lore_feuillets`, `type = 'copiste'`, `statut = 'actif'`, liasses
    `copiste-p1` à `copiste-p4` (7, 8, 8, 10 notes), `copiste-juin` (8), `copiste-enveloppe` (4 : `cop-env-1` à
    `cop-env-4`), rang dans `ordre_liasse`.
  - `gl_games.class_id` et `status ENUM('draft','live','paused','ended')` (`migrations/081_gl_gameplay.sql` l. 36) ;
    `gl_chapters.plateau_number` (migration 120) ; `gl_games.tenir_overrides_json` (LONGTEXT, migration 330 l. 87 ;
    **NULL sur des parties**).
  - `gl_game_chasse_pages` (`migrations/332_gl_tenir_chasse.sql` l. 14) : `etat`, un `ENUM` à six valeurs
    (`endormie`, `revelee`, `trouvee`, `tenue`, `palie`, `reparee`), et **`tenue_at DATETIME NULL`**, posée quand une
    page est tenue (`lib/glChasse.js` l. 1165) et jamais remise à NULL.
- **Changement attendu** :
  1. **Fonction pure** `notesAllumees({ notes, parties })`.
     - `notes` : les lignes actives `type = 'copiste'`, groupées par liasse et triées par `ordre`.
     - `parties` : pour chaque plateau de 1 à 4, la partie de la caravane, avec
       `{ plateau, pagesTenues, enveloppeOuverte, doubleFondOuvert }`.
     - Règles :
       1. Monde k : les `min(pagesTenues, N)` premières notes de `copiste-pk` sont allumées, N étant le nombre de
          notes du monde.
       2. Si l'enveloppe k est **ouverte par le prof** (étape contenu-6.3) : toutes les notes de `copiste-pk`, plus
          l'enveloppe k (`cop-env-k`).
       3. Si le **double fond est ouvert** (geste du prof, sur la partie du plateau 4) : toute la liasse
          `copiste-juin`.
       4. Une note allumée le reste, même si l'état change ensuite.
     - Pourquoi un geste du prof et pas la clôture de la partie : dans la classe, l'enveloppe réelle s'ouvre au camp,
       et la lettre de juin sous le double fond se lit en juin, parfois des semaines après la fin du plateau 4. Si
       l'app ouvrait seule à la clôture, les élèves liraient chez eux l'enveloppe ou la lettre avant le moment vécu
       ensemble.
  2. **Lecture** `chargerMargesDuCopiste(db, { classId })`.
     - La caravane est la classe : `gl_games.class_id`.
     - Pour chaque plateau, la partie de la classe sur le chapitre de ce plateau (`gl_chapters.plateau_number`) ; s'il
       y en a plusieurs, la plus avancée (terminée d'abord, sinon le plus de pages tenues). Ignore les parties
       `draft`.
     - `pagesTenues` = `COUNT(*)` de `gl_game_chasse_pages` de cette partie **où `tenue_at IS NOT NULL`**. L'ancien
       texte écrivait `etat = 'tenue'` : voir section 11, « À relire ». Sur main les deux comptes sont égaux.
     - `enveloppeOuverte`, `doubleFondOuvert` : lus dans `gl_games.tenir_overrides_json` de cette partie, clé
       `copiste` (`{ "enveloppe_ouverte_at": "…", "double_fond_ouvert_at": "…" }`), écrite par l'étape contenu-6.3.
       Colonne NULL ou clé absente : rien n'est ouvert.
     - **Aucun changement du moteur** : c'est un calcul. Les pages déjà tenues avant la fusion allument donc leurs
       notes d'elles-mêmes.
- **Textes** : aucun.
- **Tests** (`tests/gl-copiste-marges.test.js`), fonction pure :
  - 0 page tenue → rien ;
  - 3 pages au plateau 1 → les notes 1 à 3 ;
  - 12 pages au plateau 2 → les 8 notes ;
  - enveloppe ouverte avec 2 pages → tout le monde et l'enveloppe ;
  - partie terminée sans enveloppe ouverte → seulement les notes des pages tenues ;
  - double fond ouvert → juin ; partie du plateau 4 terminée sans double fond → pas de juin ;
  - plusieurs parties sur un même plateau → la plus avancée.

  Et pour la lecture : une page tenue puis passée à un autre état compte encore ; une partie `draft` ne compte pas ;
  `tenir_overrides_json` NULL ne casse rien.

- **Critère d'acceptation** : tests verts ; aucune écriture dans ce fichier.

### contenu-6.2 — La route `GET /api/gl/copiste/marges` (ex-étape C4)

- **Constat vérifié** :
  - Les routes G&L se montent dans `server.js` (`app.use('/api/gl/voyageur', …)` l. 599, `/api/gl/lore` l. 606).
  - `requireGlAuth` (`middleware/requireGlAuth.js` l. 138) refuse tout invité (403 `guestBlocked`) ; le staff se
    reconnaît par `isMj(req)` (l. 59) ou par une permission (`requireGlPermission('gl.game.manage')`).
  - La `legende` d'une enveloppe n'est pas en base : elle est dans `data/gl/copiste/notes.json` (lot contenu-4).
  - L'ancien texte servait aussi la tablette d'équipe et la projection (« si tu montes le bloc en camp »), alors que
    l'écran (étape contenu-6.4) n'y monte rien et que les choix par défaut l'excluent.
- **Changement attendu** :

  | Lecteur | Classe servie |
  | --- | --- |
  | Élève connecté (`gl_player`) | Sa classe (`gl_players.class_id`) |
  | Staff G&L | Toutes les classes, avec `?classId=` (ou la classe d'une partie, au plus simple pour la console : dis-le) |
  | Tablette d'équipe, projection, invité de la vitrine | **Refus** (403) |

  Réponse :

  ```json
  {
    "compteurs": { "pagesSelene": 0, "notesAllumees": 0, "notesTotal": 41 },
    "liasses": [
      {
        "liasse": "copiste-p1",
        "titre": "Le premier monde",
        "notes": [{ "code": "cop-p1-01", "titre": "Le café", "texte": "…", "allumee": true }]
      }
    ],
    "enveloppes": [
      {
        "code": "cop-env-1",
        "titre": "Enveloppe « baobab »",
        "legende": "…",
        "texte": "…",
        "ouverte": true
      }
    ]
  }
  ```

  - `pagesSelene` : les pages tenues par la caravane, toutes parties confondues.
  - `notesTotal` : 33 notes des plateaux et 8 de juin. Les enveloppes ne comptent pas.
  - **Une note éteinte n'a ni `titre` ni `texte`** (le serveur ne les envoie pas). Une enveloppe fermée non plus (ni
    `legende`).
  - Pour le staff seulement : les notes éteintes sont servies aussi, avec `allumee: false`, pour préparer la lecture.
  - Aucune écriture, aucun réglage.

- **Textes** (titres des liasses ; seul le premier vient des anciens textes, les autres sont proposés) :
  `copiste-p1` « Le premier monde » ; `copiste-p2` « Le deuxième monde » ; `copiste-p3` « Le troisième monde » ;
  `copiste-p4` « Le quatrième monde » ; `copiste-juin` « Sous le double fond ».
- **Tests** (`tests/gl-copiste-routes.test.js`) : élève ; staff ; élève d'une autre classe (rien de la classe
  voisine) ; note éteinte sans titre ni texte ; tablette d'équipe et invité → 403.
- **Critère d'acceptation** : tests verts ; `docs/API.md` à jour.

### contenu-6.3 — Ouvrir l'enveloppe, ouvrir le double fond : `POST /api/gl/copiste/ouvrir` (ex-étape C4 bis)

- **Constat vérifié** :
  - `lib/glEscalier.js` **n'emploie pas `JSON_SET`** : `avancerTx` (l. 79-95) lit la colonne sous
    `SELECT … FOR UPDATE` (l. 81), modifie l'objet et réécrit toute la colonne (l. 93).
  - **Piège** : tous ceux qui réécrivent `tenir_overrides_json` passent par `parseOverrides`
    (`lib/glTenir.js` l. 142), qui **ne garde que les clés de `OVERRIDABLE_KEYS`** (l. 43) dont le validateur passe.
    Une clé `copiste` inconnue serait donc effacée à la prochaine marche d'escalier (`lib/glEscalier.js` l. 93), au
    prochain changement de surface (`routes/gl/games/tenir-tour.js` l. 571-596) ou au prochain enregistrement des
    surcharges par le prof (`routes/gl/games/tenir.js` l. 141-155, via `escalier.surchargesDuProf`, qui repart des
    clés demandées). `validateOverrides` (l. 171) refuse aussi « Surcharge inconnue ».
  - `routes/gl/games/status.js` : `grantClosingFeuilletsForGame` (import l. 17) est appelé l. 202-208 sous
    `nextStatus === 'ended' && plateau_number === LAST_PLATEAU` (l. 31 : 4), **sans condition de mode**. En « Tenir »,
    les élèves liraient `ep-finale` (le cri de l'oiseau, « Il s'appelle — »), `ep-I-16` et `ep-I-17` au camp du
    plateau 4, parfois des semaines avant juin. Le mode se lit par `tenirMode` (l. 93).
  - `gl_game_events.event_type` est un `VARCHAR(64)` : deux types de plus passent sans migration.
    `tests/gl-journal-tenir-exhaustif.test.js` échoue si un type émis n'a pas son libellé dans
    `lib/glJournalPresentTenir.js`.
  - Liasse de fin en prod : **quatre pages** actives tant que `rep-II-05` l'est ; elle sort par la migration du lot
    contenu-4. Le test « trois pages » dépend donc de contenu-4.
- **Changement attendu** :
  1. Route dans `routes/gl/copiste.js`, **staff G&L seulement** (403 pour tout autre lecteur). Corps :
     `{ gameId, quoi: 'enveloppe' | 'double_fond' }`. Partie « Tenir » seulement.
  2. `enveloppe` : la partie doit être terminée (statut `ended`, le camp ; sinon 409 « Le camp n'est pas encore
     atteint. »). `double_fond` : seulement sur une partie du plateau 4 dont l'enveloppe est ouverte (sinon 409).
  3. Écrit `tenir_overrides_json.copiste.enveloppe_ouverte_at` (ou `double_fond_ouvert_at`), **par relecture puis
     réécriture sous `SELECT … FOR UPDATE`, comme `lib/glEscalier.js`** : les autres clés (surface, escalier,
     sabliers) restent intactes ; une colonne NULL se lit `{}`. Un second appel ne change rien (idempotent).
  4. **La clé `copiste` survit aux autres écritures** : fais-la entrer dans `OVERRIDABLE_KEYS` avec son validateur
     (un objet à deux dates facultatives), fais-la reporter par `surchargesDuProf` comme il reporte `escalier_pas`,
     et refuse-la quand elle vient du corps de `PUT /tenir/profil` (seule cette route-ci l'écrit). Si tu trouves plus
     simple, fais-le autrement, mais les tests ci-dessous doivent passer.
  5. Journal de partie : un évènement `copiste_enveloppe` ou `copiste_double_fond`, sans contenu, par
     `insertGameEvent` (`lib/glGameEvents.js` l. 145), avec son libellé dans `lib/glJournalPresentTenir.js`.
  6. **La liasse de fin de Sélène part avec le double fond.** En partie « Tenir », la remise automatique de
     `routes/gl/games/status.js` est retirée ; `double_fond` appelle `grantClosingFeuilletsForGame` pour la partie
     (toutes ses équipes ; une page déjà trouvée n'est pas remise), après l'écriture du drapeau. Partie classique :
     le code ne change pas (sa liasse a déjà perdu les pages du copiste au lot contenu-4).
- **Textes** : journal, enveloppe : « Le prof ouvre l'enveloppe du monde. » ; double fond (proposé, absent des
  anciens textes) : « Le prof ouvre le double fond de la boîte. » ; refus 409 du double fond, lu par le prof seul : à
  ton choix, dans ton rapport.
- **Tests** (`tests/gl-copiste-routes.test.js`, `tests/gl-game-end-closing-bundle.test.js`,
  `tests/gl-game-status.test.js`) :
  - prof → ouvert ; élève → 403 ; partie non terminée → 409 ; double fond avant l'enveloppe → 409 ; autres clés de
    `tenir_overrides_json` gardées ; second appel sans effet ; colonne NULL au départ ;
  - **la clé `copiste` est encore là** après une marche d'escalier, un changement de surface, un réglage de sablier
    et un enregistrement des surcharges par le prof ;
  - clôture du plateau 4 en « Tenir » → aucune page de la liasse ; double fond → les trois pages de Sélène, une
    seule fois ; clôture du plateau 4 en partie classique → comme avant.
- **Critère d'acceptation** : tests verts, dont `tests/gl-journal-tenir-exhaustif.test.js` ; `docs/API.md` à jour.

### contenu-6.4 — « Les marges du copiste » dans « Mon sac » (ex-étape C5)

- **Constat vérifié** :
  - `src/gl/components/GLSeuilView.jsx` (monté une fois, `src/gl/AppGL.jsx` l. 1380) n'a pas de section « pages ».
    Ses blocs : « Moi, voyageur » (l. 422), « Mon expédition » (l. 453), « Ce soir, tu peux… » (l. 535),
    `GLSeuilMentorat` (l. 557), `GLSeuilGardeRobe` (l. 560), « Grimoire du voyageur » (l. 569), « Mes traversées »
    (l. 587). Le lot ecrans-6 y a changé des libellés (« Mon sac ») : les lignes ont bougé.
  - Il sait si la partie est en cours (`expedition.gameStatus === 'live'`, l. 110), **pas si un tour est ouvert**.
    C'est le lot ecrans-8 (« Mon sac » en deux états) qui lui passera la phase du tour.
  - Les actions de chaque partie (« Ouvrir », « Modifier », « Supprimer ») se construisent dans
    `src/gl/components/GLGameMasterConsole.jsx` (`gameListRows`, l. 774 et suivantes).
  - `src/gl/components/mj/GLTourScreen.jsx` : bouton « Clore le chapitre » l. 723-732 (`cloreChapitre()` l. 241).
- **Changement attendu** :
  1. **Composant `src/gl/components/GLCopisteMarges.jsx`**, titre « Les marges du copiste », monté dans
     `GLSeuilView` entre `GLSeuilMentorat` et `GLSeuilGardeRobe`. Il lit `GET /api/gl/copiste/marges`.
     - **En-tête**, deux compteurs côte à côte : « Pages de Sélène tenues par la caravane : {n} » ; « Notes du
       copiste : {k} / 41 ».
     - **Le bloc reste caché tant que k = 0** : le copiste apparaît avec sa première note.
     - **Les notes**, par monde, dans l'ordre ; une note allumée = son titre, puis son texte, minuscules telles
       quelles. Une note éteinte = une ligne vide pointillée, sans titre (« … ») : l'élève voit qu'il en reste, pas
       ce qu'elles disent.
     - **Les enveloppes ouvertes** : le dessin du monde (baobab, dune, feuille, flocon), la légende en italique, puis
       le texte. Les crochets « […] » et « [ici, je n'arrive pas à lire] » sont gardés et mis en gris clair.
     - **Habillage** : ici, le strict lisible (gris graphite `#4a4a4a` sur papier clair, contraste AA ; distinct des
       pages de Sélène). L'écriture au crayon complète (italique à empattement, marge réglée comme un cahier) est
       posée par le lot ecrans-8 : donne des classes stables (`gl-copiste-marges`, `__note`, `__note--eteinte`,
       `__enveloppe`).
  2. **À la veillée seulement.** Le composant prend une prop `tourOuvert` (défaut `false`) et ne rend rien quand elle
     est vraie. `GLSeuilView` ne la connaît pas encore : dis-le dans ton rapport, « Ce que les lots suivants doivent
     savoir », pour ecrans-8.
  3. **Nouvelle note** depuis la dernière visite (mémoire locale, lecture et écriture sous `try/catch`) : une seule
     ligne en haut de « Mon sac », « Une note au crayon est apparue dans les marges. ». Jamais pendant un tour,
     jamais sur la tablette d'équipe, jamais en projection.
  4. **Console du prof** :
     - dans les actions de chaque partie « Tenir » de la classe, terminée ou non, une action **« Marges du
       copiste »**. Elle ouvre le même composant, pour la classe de la partie, avec un mode **« grand texte »**
       lisible en projection (le prof le montre au vidéoprojecteur, ou le lit) ;
     - en tête de ce mode, si la partie est terminée et son enveloppe fermée : bouton **« Ouvrir l'enveloppe
       « baobab » »** (« dune », « feuille », « flocon » selon le plateau), puis, sur la partie du plateau 4 une fois
       l'enveloppe ouverte : **« Ouvrir le double fond »**. Chacun demande une confirmation (« Les élèves la verront
       aussi sur leur compte. ») et appelle la route de l'étape contenu-6.3 ;
     - après « Clore le chapitre » (`GLTourScreen`), une ligne d'aide : « Au camp : « Marges du copiste », puis
       ouvrez l'enveloppe du monde. »
  5. **Personne d'autre n'ouvre rien** : ni l'élève, ni la tablette d'équipe, ni la projection, ni une clôture de
     partie.
  6. **Mots** : registre élève pour les chaînes du composant (« caravane », jamais « classe », « feuillet »,
     « joueur » ; « dans ton sac », jamais « au Seuil ») ; ajoute le composant à la liste du test de vocabulaire
     d'ecrans-6. Le texte des notes n'y passe pas : le copiste vit avant le miroir et cite « à la classe qui vient ».
- **Textes** : ceux des points 1, 3 et 4, mot pour mot.
- **Tests** (UI) :
  - bloc caché à 0 note ; bloc absent quand `tourOuvert` est vrai ;
  - 3 notes allumées → 3 textes et des lignes pointillées ;
  - enveloppe ouverte affichée ;
  - ligne « nouvelle note » une seule fois ;
  - l'action de la console ouvre le mode grand texte ; « Ouvrir l'enveloppe » absent tant que la partie n'est pas
    terminée ; « Ouvrir le double fond » absent avant l'enveloppe du plateau 4.

  À surveiller : `tests-ui/gl/GLSeuilView.test.jsx`, `tests-ui/gl/GLTourScreen.test.jsx`,
  `tests-ui/gl/GLGameMasterConsole.test.jsx`.

- **Critère d'acceptation** : tests verts ; captures du bloc à 3 notes, d'une enveloppe ouverte, du mode grand texte.

### contenu-6.5 — L'intro par défaut et le garde-fou écrit (ex-étape C6)

- **Constat vérifié** :
  - `lib/glIntro.js` : `SCENE_IDS` (l. 9 : `boite`, `copiste`, `carnet`, `miroir`, `selene`, `corbeau`, `souffle`,
    `seuil`, `bienvenue`), `VOICES` (l. 21 : `copiste`, `selene`, `passeur`), `normalizeIntroConfig` (l. 57),
    réglage `content.intro` (l. 6).
  - `data/gl/intro.default.json` d'aujourd'hui : « copiste » 6 fois, « mangé » 1 fois.
  - `sources/content-intro.json` garde une scène d'**identifiant** `copiste` (la deuxième, voix `passeur`), imposée
    par `SCENE_IDS`. Ses voix : `passeur` 3, `selene` 6. Aucun de ses textes ne dit « copiste », « mangé » ni
    « mord ».
  - **La phrase « le copiste reste absent du jeu » n'existe nulle part** : ni dans
    `docs/GL_TENIR_A_DEUX_REGLES.md`, ni dans `.claude/skills/gl-tenir-garde-fous/SKILL.md` (0 occurrence de
    « copiste »). Le garde-fou est **à ajouter**, pas à remplacer.
- **Changement attendu** :
  1. **`data/gl/intro.default.json`** : remplace son contenu par celui de
     `docs/prompts/gl-decisions/sources/content-intro.json` (deux voix, Passeur et Sélène, plus de copiste). Garde la
     forme que lit `lib/glIntro.js` (les neuf `SCENE_IDS`) et vérifie avec `normalizeIntroConfig`. En prod, le
     réglage `content.intro` prime : c'est Oliv qui le pose.
  2. **Test de l'intro** : les **textes** du défaut (`opening`, `finale`, `kicker` et `text` de chaque scène) ne
     contiennent ni « copiste », ni « mangé », ni « mord ». Le test **ne porte pas** sur l'identifiant de scène
     `copiste`, ni sur les clés d'image. `VOICES` garde `copiste` (un réglage de prod peut encore la porter).
  3. **Garde-fou écrit**, ajouté aux règles § 1 et à la skill `gl-tenir-garde-fous` : « Le copiste est l'adulte qui a
     eu la boîte avant le Passeur et n'a pas pu passer le miroir (le mot de Sélène le dit : les grands ne voient que
     leur reflet). Il a tout écrit avant, pour la classe qui viendra. Il n'a pas de nom, ne signe pas, ne montre pas
     son visage pendant l'année. Il ne parle que par ses notes au crayon, qui reparaissent une à une quand la
     caravane tient une page de Sélène (dans « Mon sac »), et par les enveloppes de la boîte, que le prof ouvre au
     camp. Il ne cite un passage du carnet qu'au monde où il se lit. Il ne dit pas qu'il n'a pas pu passer avant
     l'enveloppe du plateau 4. Le corbeau qu'il voit est imaginaire. Sélène n'est jamais dite morte : partie,
     effacée, encore en marche ou inventée, ce sont des hypothèses. »
  4. Garde-fou de vocabulaire, même endroit : le copiste dit « l'oiseau », comme Olu et les écrans. (Le test de
     contenu du lot contenu-4 le contrôle déjà sur les notes.)
- **Textes** : `sources/content-intro.json` ; le garde-fou ci-dessus, mot pour mot.
- **Tests** : `tests/gl-intro.test.js`, `tests/gl-intro-lib.test.js` (le contrôle du point 2 ; neuf scènes ; voix
  admises inchangées) ; `e2e/gl-intro.spec.js`.
- **Critère d'acceptation** : tests verts ; `data/gl/intro.default.json` égal, clé pour clé, au fichier de `sources/`.

## 5. Migration

Aucune. Les deux drapeaux vivent dans `gl_games.tenir_overrides_json` ; les deux types d'évènement entrent dans un
`VARCHAR`.

## 6. Données et sources

| Source (`docs/prompts/gl-decisions/sources/`) | Où va son contenu |
| --- | --- |
| `content-intro.json` | `data/gl/intro.default.json` (copie exacte) |
| `copiste-notes.json` | Déjà dans `data/gl/copiste/notes.json` (lot contenu-4) : la route y lit `legende`. |
| `copiste-notes.md` | À lire pour comprendre comment une note s'allume. |

## 7. Vérifications propres au lot

- e2e (sous le verrou) : `e2e/gl-seuil.spec.js`, `e2e/gl-intro.spec.js`, `e2e/gl-mj-console.spec.js`.
- Banc : régime **fumée**, une passe à la fin. La base du banc charge l'instantané du 7/11 **après** les migrations :
  elle n'a pas les notes (elle a les anciennes pages, en liasse `copiste`). Une liasse inconnue ne doit rien casser.
- Captures (`docs/captures/gl-decisions/contenu-6/`) : « Mon sac » avec le bloc à 3 notes ; une enveloppe ouverte ;
  le mode grand texte de la console avec son bouton ; la ligne d'aide après « Clore le chapitre ».
- Parcours à rejouer à la main sur ta base : tenir une page → le bloc apparaît avec « Le café » ; clore la partie →
  rien de plus ; « Marges du copiste », puis « Ouvrir l'enveloppe « baobab » » → tout le premier monde et
  l'enveloppe, aussi sur le compte de l'élève.

## 8. Contrats de test changés

- Clôture d'une partie « Tenir » du plateau 4 : plus aucune page de la liasse de fin n'est remise.
- `data/gl/intro.default.json` : voix `passeur` et `selene` seulement ; `opening.credit` = « le carnet de Sélène — pour
  la classe qui viendra » ; `finale.button` = « Prenez le crayon. ».
- Deux types d'évènement de journal : `copiste_enveloppe`, `copiste_double_fond`.
- Surcharges d'une partie : une clé `copiste` de plus, que `PUT /tenir/profil` n'accepte pas du client.
- « Mon sac » : un bloc de plus entre le Mentorat et la garde-robe ; `GLTourScreen` : une ligne d'aide.

## 9. Docs à mettre à jour dans ce lot

- `docs/API.md` : `GET /api/gl/copiste/marges`, `POST /api/gl/copiste/ouvrir`.
- `docs/GL_TENIR_A_DEUX_REGLES.md` § 1 et `.claude/skills/gl-tenir-garde-fous/SKILL.md` : le garde-fou du copiste.
- `changelog.d/gl-decisions-contenu-6.md`.
- Pour le § 0 des règles (à recopier dans ton rapport ; écrit par fin-1) : « 24/11 : gel levé ; le copiste parle par
  ses notes dans « Mon sac » et par les enveloppes de la boîte ».

## 10. Hors périmètre

| Quoi | Lot |
| --- | --- |
| Écriture au crayon complète, « Mon sac » en deux états, phase du tour passée à `GLSeuilView` | ecrans-8 |
| Docs du prof : à la séance 1, intro projetée et boîte sur la table (rond de café au dos du mot, main posée en secret sur la plaque) ; à chaque camp, « Marges du copiste » (grand texte), lire les notes, puis « Ouvrir l'enveloppe » à l'écran au moment où la classe ouvre la vraie ; au camp du plateau 4, souffler sur la plaque ; en juin, « Ouvrir le double fond », lire la lettre | fin-2 |
| `docs/reference/gl/guide-du-mj.md` : préparer la boîte une fois (quatre enveloppes, la lettre sous le double fond, la main sur la plaque) ; dans la liste des fonctions à décrire, « liasse du copiste » devient « les marges du copiste (dans « Mon sac ») et les enveloppes de la boîte » | fin-2 |
| Fermer ou garder la remise manuelle d'une liasse par le prof | personne, sans décision |
| Le réglage `content.intro` de la prod, `gameplay.tenir_chapardeur` | Oliv |

## 11. Pour Oliv

**À relire**

- **« Une note allumée le reste »** (règle 4) contre le compte écrit dans l'ancien texte (`etat = 'tenue'`, « c'est un
  calcul », sans mémoire). Deux lectures :
  1. compter les pages **tenues au moins une fois** (`tenue_at` posée) : le compte ne redescend jamais, sans rien
     mémoriser de plus. C'est ce que ce lot fait ;
  2. compter les pages **à l'état `tenue`** : si une page tenue changeait d'état, une note s'éteindrait.

  Sur main, rien ne fait quitter l'état `tenue` (pâlir part de `endormie` ou `revelee`) : les deux lectures donnent le
  même nombre aujourd'hui.

- **La tablette et la projection** : l'ancien texte de la route les servait ; l'écran et les choix par défaut les
  excluent. Ce lot les refuse. Le prof montre les notes par son mode « grand texte ».
- Titres des liasses (« Le deuxième monde »… « Sous le double fond ») et libellé « Le prof ouvre le double fond de la
  boîte. » : proposés par cette fiche.
- Les textes de l'intro (`sources/content-intro.json`) : posés tels quels.
- **La remise manuelle d'une liasse** (`POST /api/gl/lore/games/:id/liasses/:bundle`, `routes/gl/lore.js` l. 378)
  permet encore au prof de remettre la liasse de fin avant le double fond. Non fermée.
- « La variante surnom » de la lettre n'est servie nulle part.

**À faire après la vague**

- **Les parties de test de la classe** (16 et 17) : leurs pages tenues allument déjà des notes, et une partie de
  test terminée passe devant la vraie partie du même plateau. Les supprimer, ou jouer la séance 1 avec une autre
  classe de test, avant la première vraie séance.
- **Intro** : poser le contenu de `sources/content-intro.json` dans le réglage `content.intro` (par le connecteur, sur
  demande, ou par le panneau « Intro » de l'admin), puis « Revoir l'intro ».
- **Partie de démonstration** : tenir une page → le bloc « Les marges du copiste » apparaît dans « Mon sac » d'un
  compte d'élève, avec « Le café » ; clore la partie → rien de plus ; « Marges du copiste », puis « Ouvrir l'enveloppe
  « baobab » » → tout le premier monde et l'enveloppe, aussi sur le compte de l'élève.
- **Avant le plateau 2** : `gameplay.tenir_chapardeur` → vrai, si tu veux qu'Olu parle de l'oiseau.
- **Préparer la boîte** : le mot de Sélène avec un rond de café au dos ; la grande main grasse sur la plaque ; les
  quatre enveloppes (textes de `sources/copiste-notes.md`, à la main) ; la lettre sous le double fond.
- Images (facultatives, repli en place) : aucune n'est propre à ce lot.
