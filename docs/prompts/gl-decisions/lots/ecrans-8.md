# Lot ecrans-8 — La table de jeu II : cinq onglets, « Mon sac » en deux états, surcouches, projection

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge forte, reprise prévue · banc : fumée
> Branche : `claude/gl-decisions-ecrans-8` · Attend : ecrans-7, contenu-6 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- L'élève n'a plus que cinq onglets, dans l'ordre du parcours : Mon sac, Le chemin, Le carnet, La nature, La
  caravane. Le « ? » devient « Comprendre le jeu ».
- « Mon sac » a deux états : fermé pendant le tour (l'essentiel), ouvert à la veillée (tout, près du feu).
- Une seule surcouche à la fois : plus de bulle, de fenêtre ou de toast qui se recouvrent.
- La projection, la vitrine des parents et l'écran de connexion passent à la table de jeu.
- Les marges du copiste gardent leur écriture au crayon.

**Reprise** : chaque étape se livre seule, tests verts. Arrêts propres : après ecrans-8.1 (la navigation marche,
« Mon sac » dans son habit d'avant), après ecrans-8.2, après ecrans-8.3. L'étape ecrans-8.4 ne dépend d'aucune
autre : elle peut être laissée entière à la reprise.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime », à fond, partout où un élève regarde (tablette d'équipe, compte d'élève, espace personnel, projection, vitrine). La console du prof et les réglages restent l'outil ForêtMap. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |
| Décision 39 de l'addendum 4 | 24/11, 11 h 41 | Plus de gel. La navigation en cinq onglets et les règles des surcouches entrent dans le chantier (extension choisie par Claude, signalée). | idem |
| Décision 38 de l'addendum 4 | 24/11, 11 h 50 | Le code ne dépend d'aucune image : chaque visuel a un repli CSS ou SVG. | — |
| Décision 40 de l'addendum 4 (choix de Claude) | 24/11 | L'interrupteur `modules.table_de_jeu_enabled` coupe l'habillage et rend l'affichage d'aujourd'hui. | — |
| I1, I2, I3, I5 (addendum 2) | 24/11 | Plus de fenêtre du plateau en « Tenir » ; la piste s'ouvre sur place ; rien de consultable pendant une question ; pas de visite d'Olu pendant un tour. Déjà codées par les lots ecrans-4, ecrans-2 et ecrans-6 : ce lot les complète (étape ecrans-8.3). | — |
| « Mon sac », le nom | 24/11, 14 h 16 | « Mon sac » remplace « Le Seuil » (onglet « Mon sac », « ton sac » dans une phrase). Le code ne se renomme pas. | « Je valide » |
| « Mon sac », deux états | 24/11, 14 h 16 | Deux états, un seul écran : fermé pendant le tour, ouvert à la veillée (détail à l'étape ecrans-8.2). Remplace l'ancienne étape « le Seuil en carnet ». | « Je valide » |
| « On garde l'image de voile » | 24/11, 14 h 43 | `GL_icone_voile` est le pictogramme du voile, un repère fixe, partout où un écran d'élève **nomme** le voile en mots. Elle accompagne le texte sans le remplacer, et ne remplace pas la perte de couleur. Sans image : le texte seul. | « on garde l'image de voile » |

Les mots d'Oliv sur « Mon sac » (13 h 58) : « il faut renommer le module de l'app qui s'appelle le seuil. Cela est
source de confusion et contredit le passage d'un plateau à un autre ».

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- La navigation en cinq onglets et la file des surcouches entrent dans le chantier.
- Ordre et contenu des onglets ; onglets retirés de la barre d'un élève ; au téléphone, trois onglets et « Plus ».
- Icônes peintes sans emoji pour l'élève ; emoji gardés pour le prof.
- Ordre fixe des surcouches : intro → visite d'Olu → péripétie → question → retour → gain ou badge → notification.
- Pas de matière de peuple sur la vitrine et la connexion ; fanions à la place des pilules en projection.
- Posés à l'écriture de cette fiche, à relire (section 11) : l'ordre exact des blocs du sac ouvert ; le sort des
  sessions invitées ; les entrées du prof ; les textes d'Olu et d'aide des regroupements ; où l'icône du voile se
  pose.

**Garde-fous de cette direction** (à faire relire par `gl-relecteur-garde-fous`) :

- Le voile n'est jamais dessiné comme une forme qui agit, une ombre qui avance seule, un visage ni une couleur
  sombre ; son icône est un repère fixe.
- Jamais le visage de Sélène. Parité : fanions, cadres et scènes alternent filles et garçons ; formes doubles.
- Une seule surcouche à la fois ; mouvement réduit respecté partout.
- Bourses privées : jamais une bourse en projection ; le jeton de verre n'affiche un compte que sur l'écran de
  l'équipe et sur le compte de l'élève.
- Adresse : « vous » en projection ; « tu » au compte d'élève et dans « Mon sac ».
- Aucun nouveau texte d'élève sans passage au filtre `findForbiddenString` et au test
  `tests/content/gl-mots-du-voyage.test.js` : ajoute tes composants à sa liste.
- Contraste AA sur toute matière ; jamais de texte sur le bois.
- Poids : rien dans `src/shared/styles/*` ni dans `src/index.css`.

**Non vérifié par l'auteur des décisions** : la projection et le compte d'un élève en vrai (vus dans le code et en
admin) ; l'image `GL_icone_seuil` n'a jamais été regardée (elle n'est plus employée).

## 3. Fichiers

**À toi** (vérifiés sur `main`) :

- `src/gl/constants/app-runtime.js`, `src/gl/utils/glAppShellHelpers.js` (dont `GL_LEGACY_TAB_ALIASES`,
  `readStoredGlTab`, `resolveGlMainTabChange`, `filterGlTabs`, `defaultTabForGlAuth`),
  `src/gl/utils/glJournalImportMeta.js` (`importTargetNav`)
- `src/gl/AppGL.jsx`, `src/gl/components/GLTopBar.jsx`, `src/gl/components/GLMobileNav.jsx`,
  `src/gl/components/GLHelpDock.jsx`
- `src/gl/components/GLAdventureView.jsx`, `src/gl/components/GLMondeView.jsx`,
  `src/gl/components/GLJoueursView.jsx` et leurs tests `tests-ui/gl/GL{Adventure,Monde,Joueurs}View.test.jsx`
  (remplacés)
- `src/gl/components/GLSeuilView.jsx`, `src/gl/components/GLSeuilGardeRobe.jsx`,
  `src/gl/components/GLSeuilPagesVoyageur.jsx`, `src/gl/components/tenir/GLButDeLAnnee.jsx`,
  `src/gl/styles/gl-seuil.css`
- `src/gl/components/GLVoyageurGainToast.jsx`, `src/gl/components/tenir/GLPeripetieOverlay.jsx`,
  `src/gl/components/GLIntroOverlay.jsx`, `src/gl/context/GLTourContext.jsx` (branchement sur la file)
- `src/gl/components/tenir/GLProjectionView.jsx`, `src/gl/components/GLAuthView.jsx`,
  `src/gl/components/parents/GLParentsDemoView.jsx`
- `src/gl/constants/glDiscoveryTour.js` (parcours par onglet), `src/gl/styles/gl-table.css` (créé par ecrans-7),
  `src/gl/styles/gl-tenir.css`, `src/gl/styles/gl-theme.css`
- Tests : `tests-ui/gl/glAppShellHelpers.test.js`, `tests-ui/gl/GLTopBar.test.jsx`,
  `tests-ui/gl/glTourAnchors.test.jsx`, `tests-ui/gl/GLSeuilView.test.jsx`,
  `tests-ui/gl/GLSeuilPagesVoyageur.test.jsx`, `tests-ui/gl/GLProjectionView.test.jsx`,
  `tests-ui/gl/GLAuthView.test.jsx`, `tests-ui/gl/GLParentsDemoView.test.jsx`, `tests/gl-tour-corpus-olu.test.js`,
  `tests/fixtures/a11y-static-baseline.json`, `e2e/fixtures/gl.fixture.js`, les e2e de navigation (section 7)

**Nouveaux** :

- `src/gl/components/GLCarnetView.jsx`, `src/gl/components/GLCaravaneView.jsx`,
  `src/gl/components/GLComprendrePanel.jsx`, et leurs tests sous `tests-ui/gl/`
- `src/gl/utils/glOverlayQueue.js` (aucune file de surcouches n'existe : `src/gl/hooks/useGLOverlays.js` ne garde
  que deux modales)
- `tests-ui/gl/gl-table-*.test.jsx` pour ce lot ; un e2e de navigation si aucun existant ne convient

**D'un autre couloir, modification minimale permise** :

- `src/gl/components/GLCopisteMarges.jsx` (créé par le lot contenu-6, à côté de `GLSeuilView.jsx` ; vérifie son
  chemin réel) : son habillage seulement ; ni ses textes, ni ses compteurs, ni sa logique.
- `data/gl/help.default.json` (couloir contenu) : les clés d'aide par onglet (`tab:adventure`, `tab:monde-gl`,
  `tab:joueurs`) suivent la table de correspondance ; aucun texte nouveau.
- `docs/GL_TENIR_A_DEUX.md` : un renvoi.

**Ne touche pas** :

- `src/gl/components/tenir/GLTenirEcranEquipe.jsx`, `src/gl/components/tenir/GLTenirBandeau.jsx`,
  `src/gl/components/tenir/GLTenirMoment.jsx`, `src/gl/components/tenir/GLTenirTiroir.jsx` (habillés par ecrans-7) : seulement le branchement sur la file des surcouches, si l'étape ecrans-8.3 le demande.
- `src/gl/components/GLBoardMarkers.jsx`, `src/gl/components/GLBoardMascot.jsx`,
  `src/gl/components/GLBoardTurnHud.jsx`, `src/gl/components/GLGameBoard.jsx`,
  `src/gl/components/tenir/GLVoileLayer.jsx` : lot ecrans-9. `src/gl/components/tenir/GLChasseLayer.jsx`,
  `src/gl/components/tenir/GLKraaWitness.jsx` : lot ecrans-10. Les moments forts, Olu en portrait, la couleur du monde, les sons : lot ecrans-11.
- `routes/gl/*`, `lib/*` : **aucune route, aucune donnée, aucun droit** dans ce lot.
- Les identifiants `seuil`, `GLSeuilView`, `gl-seuil*`, les test-id.
- La console et les réglages : le prof garde ses emoji.

## 4. Étapes (un commit par étape, dans cet ordre)

### ecrans-8.1 — Cinq onglets, dans l'ordre du parcours (ex-étape T6)

- **Constat vérifié** sur `main` (avant les lots ecrans-1, ecrans-6 et contenu-3, qui changent des libellés) :
  - La barre a déjà des regroupements : « La nature » (`GL_NATURE_SUB_TABS` : `ecosystemes`, `biodiversite`,
    `glossary`), « L'aventure » (`history`, `selene-carnet`, `spells`), « Le monde G&L » (`world`, `rules`,
    `lore-glossary`, `tutorials`), « Les joueurs » (`forum`, `market`, `stats`), plus `seuil`, `maps`, `journal`,
    `my-journal` (`src/gl/constants/app-runtime.js`, l. 10-82). L'étape les redistribue.
  - `tab` vaut toujours l'identifiant d'un sous-onglet ; les identifiants de regroupement se replient
    (`readStoredGlTab`, `resolveGlMainTabChange`). Une table d'anciens identifiants existe déjà :
    `GL_LEGACY_TAB_ALIASES` (`src/gl/utils/glAppShellHelpers.js`).
  - Onglet mémorisé : `localStorage`, clé `gl_active_tab` (`AppGL.jsx`). Liens profonds des pistes :
    `importTargetNav` (`src/gl/utils/glJournalImportMeta.js`), qui vise `biodiversite`, `ecosystemes`, `glossary`,
    `lore-glossary`, `tutorials`, `selene-carnet`.
  - Téléphone : `GL_MOBILE_PRIMARY_TAB_IDS = ['seuil', 'maps', 'nature']` ; le tiroir « Plus » existe
    (`src/gl/components/GLMobileNav.jsx`).
  - Le « ? » : `GLHelpDock.jsx` ouvre l'aide de l'onglet (`GLHelpDialog`, clé `tab:<onglet>` de
    `data/gl/help.default.json`) et relance la visite d'Olu.
  - Invités : `GL_GUEST_TAB_IDS = ['monde-gl', 'discovery', 'nature']`.
- **Changement attendu** :
  1. Cinq onglets pour un élève :

     | # | Onglet | Contenu |
     | --- | --- | --- |
     | 1 | **Mon sac** | L'espace personnel de l'élève, en deux états : étape ecrans-8.2 |
     | 2 | **Le chemin** | L'écran d'équipe pendant le tour ; le plateau le reste du temps |
     | 3 | **Le carnet** | Trois sous-onglets : **Pages de la caravane** (le carnet de la chasse : trouvées, tenues) · **Mes pages** (l'actuel « Carnet Sélène ») · **Le récit** (l'actuelle « Histoire ») |
     | 4 | **La nature** | **Les biomes** · **Les espèces** · **Les mots** (les actuels « Écosystèmes », « Biodiversité », « Glossaire scientifique ») |
     | 5 | **La caravane** | **Le Marché** · **Mon journal** · Forum (seulement si le module est allumé) |

  2. Le « ? » du dock devient **« Comprendre le jeu »** (`GLComprendrePanel.jsx`) : « Le monde » (l'introduction),
     « Les règles », « Le lexique du voyage » (filtré par monde côté serveur : lot contenu-5), « Revoir l'intro »,
     « Refaire la visite d'Olu ».
  3. **Retirés de la barre d'un élève** : Journal de partie (il reste à la console et nourrit « Ce qui change » dans
     « Mon sac »), Statistiques (la bourse de la barre ouvre « Ma bourse et mes progrès »), Tutoriels, Le monde G&L
     et L'aventure (répartis ci-dessus ; les sortilèges du chapitre vont dans « Mon sac », bloc « Mon grimoire »).
  4. **Téléphone** (moins de 640 px) : Mon sac, Le chemin, Le carnet en bas ; « Plus » pour La nature et La
     caravane.
  5. **Icônes** : les icônes peintes `GL_icone_sac`, `GL_icone_chemin`, `GL_icone_carnet`, `GL_icone_nature`,
     `GL_icone_caravane`, `GL_icone_comprendre` (28 px), par le composant d'icône du lot ecrans-7 ; sans image, le
     libellé seul, **sans emoji**. `GL_icone_seuil` n'est plus employée.
  6. **Console du prof** : Console MJ d'abord, puis les cinq onglets dans le même ordre, puis Contenus, Gestion
     utilisateurs, Gestion mascottes, Réglages plateforme. Le prof garde ses emoji. Le prof ne perd l'accès à aucune
     vue : si le journal de partie, les statistiques de la classe ou les tutoriels n'ont plus d'entrée pour lui,
     garde-leur une entrée après les cinq onglets, et dis-le.
  7. `GLAdventureView`, `GLMondeView`, `GLJoueursView` sont remplacées par `GLCarnetView`, `GLCaravaneView` et
     `GLComprendrePanel`.
  8. **Une table de correspondance des anciens identifiants d'onglet** (étends `GL_LEGACY_TAB_ALIASES`) : liens
     profonds, onglet mémorisé dans `localStorage` (lecture et écriture sous `try/catch`), `importTargetNav` des
     pistes. Aucun ancien identifiant ne mène à un écran vide : `adventure`, `monde-gl`, `joueurs`, `world`, `rules`,
     `lore-glossary`, `tutorials`, `spells`, `stats`, `journal` ont chacun une destination, selon la répartition
     ci-dessus. Garde les identifiants de sous-onglet qui survivent (`history`, `selene-carnet`, `ecosystemes`,
     `biodiversite`, `glossary`, `market`, `forum`, `my-journal`) : moins de tests et de liens à reprendre.
  9. Les parcours d'Olu par onglet (`glDiscoveryTour.js`) et l'aide par onglet (`data/gl/help.default.json`) suivent
     les nouveaux onglets. Les bulles de regroupement devenues fausses (« L'aventure », « Le monde G&L », « Les
     joueurs ») sont retirées. **N'écris aucune bulle ni aucune aide nouvelle** pour « Le carnet » et « La
     caravane » : propose-les dans ton rapport.
  10. Sessions invitées (Mode Découverte, vitrine des parents) : la décision ne les cite pas. Leur barre garde ses
      entrées ; l'entrée « Le monde G&L » y montre le contenu de « Comprendre le jeu ». Dis ce que tu as fait.
  11. Le pictogramme du voile : si un libellé de la barre, d'un bandeau de l'app ou de « Comprendre le jeu » nomme
      le voile, `GL_icone_voile` se pose à côté (`git grep -n -i "voile" -- src/gl/AppGL.jsx src/gl/components`).
      Sur `main`, aucun libellé de la barre ne le nomme.
  - Aucune route, aucune donnée, aucun droit.
- **Textes** (mot pour mot) : les libellés du tableau et du point 2.
- **Tests** : `tests-ui/gl/glAppShellHelpers.test.js` (cinq onglets ; chaque ancien identifiant a une destination ;
  onglet mémorisé inconnu → repli) ; `tests-ui/gl/GLTopBar.test.jsx` ; tests des trois vues nouvelles ;
  `tests-ui/gl/glTourAnchors.test.jsx` et `tests/gl-tour-corpus-olu.test.js` (chaque clé de parcours est un onglet
  où l'on atterrit) ; `tests/fixtures/a11y-static-baseline.json` ; e2e de navigation (section 7).
- **Critère d'acceptation** : un élève voit cinq onglets et « Comprendre le jeu » ; un lien de piste et un onglet
  mémorisé d'avant ce lot ouvrent le bon écran ; le prof garde toutes ses vues.

### ecrans-8.2 — « Mon sac », deux états (étape nouvelle SAC-2, à la place de l'ancienne T7)

- **Constat vérifié** sur `main` :
  - `GLSeuilView.jsx` reçoit `onNavigateTab` et `modules` (`AppGL.jsx`, l. 1380). Il sait si la partie est en cours
    (`data.expedition.gameStatus === 'live'`, données de `GET /api/gl/voyageur/me`), **pas si un tour est ouvert**.
    Une partie reste « en cours » des semaines.
  - `AppGL.jsx` connaît la phase du tour de la partie de l'élève : `gameState.tenir.round.phase` (l. 793-804 ;
    `tourOuvertNumero` y ajoute une condition de surface, à ne pas reprendre ici).
  - Blocs d'aujourd'hui, dans l'ordre : titre et « Ton voyage avance à ton rythme, même entre deux séances. » ;
    niveau atteint ; « Moi, en voyage » ; « Mon expédition » (équipe, mascotte, état, « Rejoindre le chemin »,
    « Ce qui change » au camp, défi de case, défis de la Trame, gestes de la mascotte) ; « Ce soir, tu peux… »
    (`buildSeuilSuggestions`) ; Lettre ; Mentorat ; garde-robe ; but de l'année ; « Grimoire du voyageur » ;
    « Mes traversées » et « Mes badges ». Le lot contenu-6 y a monté « Les marges du copiste ».
  - Un sort du grimoire du voyageur est utilisable quand `unlocked && charged`. La Loupe se lance pendant une
    question (`GLLoupeButton.jsx`, au-dessus des choix).
  - Ni la bourse de l'élève ni son rôle du jour ne sont dans les données de `GLSeuilView` ; la bourse est dans
    `AppGL.jsx` (celle de la barre).
- **Changement attendu** — la décision du 24/11 à 14 h 16, dans toute sa précision. **Deux états, un seul écran.**

  | | Pendant le tour | À la veillée |
  | --- | --- | --- |
  | Quand | Un tour est ouvert pour la partie de l'élève | Aucun tour ouvert : entre deux séances, au camp, entre deux chapitres, sans partie |
  | Le sac | **Fermé**, posé sur la table de bois, dans la matière du peuple de l'élève | **Ouvert**, son contenu étalé sur une toile près du feu |
  | Lumière | Lumière du jour, à la couleur du monde | Lueur chaude |
  | Ce qu'il montre | Seulement ce qui sert tout de suite : le sort du grimoire du voyageur utilisable à cet instant, la bourse de l'élève, son rôle du jour, « Rejoindre le chemin » | Tout : « Ce soir, tu peux… » en tête, puis les pages à lire et à tenir, le grimoire, la Lettre, le Mentorat, les marges du copiste, les défis, les badges et les parures |
  | Règle | Un geste fermé est absent, pas grisé. **Pendant une question, il se réduit à la Loupe** (décision I3 : rien n'est consultable pendant une question) | Jamais de sac « vide » : la veillée montre ce qu'on peut faire, jamais ce qu'on n'a pas fait |
  1. **La phase du tour passe à `GLSeuilView.jsx`** : `AppGL.jsx` lui donne une propriété (tour ouvert ou non,
     question en cours ou non) tirée de `gameState.tenir.round.phase` (présente et différente de `clos`, partie en
     cours). Sans partie « Tenir », c'est la veillée.
  2. **Ordre des blocs du sac ouvert**, calé sur la navigation de l'étape ecrans-8.1 : « Ce soir, tu peux… » ; Mon
     expédition (avec « Ce qui change » au camp) ; les pages à lire et à tenir ; Mon grimoire (sorts du chapitre,
     « Lancer un sortilège », et le grimoire du voyageur) ; Ma Lettre ; Mon Mentorat (quand ils existent) ; Les
     marges du copiste ; Mes défis (Trame, case) ; Moi, en voyage (les deux regards, le niveau) ; Mes traversées et
     mes badges ; Garde-robe ; But de l'année. Aucun bloc ne change de contenu.
  3. **Habillage** (par les jetons de `gl-table.css`, lot ecrans-7) : boutons d'action en plaques de laiton ;
     compteurs (gemmes, Lumière) en jetons de verre (l'émoji 💎 de « Mon sac » et de `GLButDeLAnnee.jsx` part ici :
     le lot ecrans-7 te l'a laissé) ; titres de bloc en Caudex gras. La racine reçoit `.gl-table` et
     `data-peuple` (peuple de l'équipe de l'élève : `data.expedition.teamType`) et `data-etat="ferme|ouvert"`.
  4. **Garde-fous** :
     - jamais de sac « vide » ;
     - la lueur de la veillée est celle du feu, **pas la nuit du monde** (au plateau 4, la nuit polaire est un état
       du monde : les deux ne se confondent pas) ;
     - deux états seulement ;
     - « tu » partout ; la bourse reste privée (écran personnel) ;
     - l'interrupteur `modules.table_de_jeu_enabled` coupe l'habillage (sac, toile, lueur), **pas le nom** ni les
       deux états de contenu.
  5. **À vérifier en codant, sans route ni champ nouveau** :
     - « les pages à lire et à tenir » : aucun bloc de ce nom dans `GLSeuilView.jsx`. La règle existe (en veillée,
       un élève connecté peut ouvrir et tenir une page pour son équipe) et passe aujourd'hui par le carnet. Monte la
       vue existante du carnet, ou un renvoi vers « Le carnet › Pages de la caravane » ; dis lequel.
     - « son rôle du jour » : si aucune donnée servie ne dit le rôle de l'élève (les cartes Job sont en papier), le
       sac fermé ne montre pas de rôle, et tu le dis dans ton rapport.
     - « pendant une question » : si l'écran ne peut pas savoir qu'une question est ouverte pour l'élève quand il
       est dans « Mon sac », dis-le ; ne montre alors, tour ouvert, que la liste du sac fermé.
  6. **Les marges du copiste** (`GLCopisteMarges.jsx`, lot contenu-6) : tu l'habilles et tu gardes son écriture au
     crayon : gris graphite (`#4a4a4a` sur papier clair, contraste AA), minuscules telles quelles, police à
     empattement en italique, papier réglé (marge de gauche réglée comme un cahier), **distincte des pages de
     Sélène**, qui gardent leur style. Pas de laiton ni de Cinzel dans ce bloc. Ses textes ne changent pas.
  7. Le pictogramme du voile : si une ligne d'état de « Mon sac » nomme le voile, `GL_icone_voile` se pose à côté.

- **Textes** (mot pour mot) : « Mon sac » ; « Rejoindre le chemin » ; « Ce soir, tu peux… ». Aucun texte nouveau :
  s'il en faut un (par exemple une phrase d'accueil du sac fermé), propose-le dans ton rapport.
- **Tests** (`tests-ui/gl/GLSeuilView.test.jsx`) :
  - tour ouvert → `data-etat="ferme"` ; seuls le sort utilisable, la bourse, « Rejoindre le chemin » (et le rôle
    s'il est servi) ; aucun bouton désactivé ; ni Lettre, ni garde-robe, ni marges ;
  - question en cours → la Loupe seule ;
  - aucun tour, au camp, sans partie → `data-etat="ouvert"`, « Ce soir, tu peux… » en premier, blocs dans l'ordre ;
  - compte sans rien à faire → aucun bloc vide ni phrase de manque ;
  - interrupteur coupé → pas de `.gl-table`, le titre reste « Mon sac », les deux états de contenu tiennent ;
  - `tests-ui/gl/GLSeuilPagesVoyageur.test.jsx` reste vert.
- **Critère d'acceptation** : pendant un tour, « Mon sac » tient sur un écran sans défiler et ne propose rien qui
  ne serve tout de suite ; à la veillée, tout y est ; une partie « en cours » sans tour ouvert montre le sac ouvert.

### ecrans-8.3 — Les surcouches : une à la fois (ex-étape T8)

- **Constat vérifié** sur `main` : aucune file de surcouches (`git grep -n OverlayQueue` : rien ;
  `useGLOverlays.js` ne tient que le profil et les statistiques). Surcouches d'aujourd'hui : l'intro
  (`GLIntroOverlay.jsx`), la visite d'Olu (`GLTourContext.jsx`), la péripétie (`tenir/GLPeripetieOverlay.jsx`), la
  question et son retour (carte du moment), le gain (`GLVoyageurGainToast.jsx`, monté par `AppGL.jsx` pour un
  compte d'élève), les badges (`GLRewardsPanel.jsx`), les notifications (`GLNotificationsCenter.jsx`), les toasts
  (`src/gl/hooks/useGlToasts.js`).
- **Changement attendu** : écris ces règles dans `docs/GL_TABLE_DE_JEU.md` (§ « Surcouches »), avec un renvoi depuis
  `docs/GL_TENIR_A_DEUX.md`, et applique-les :
  1. **Une seule surcouche à la fois**, dans un ordre fixe : intro → visite d'Olu → péripétie → question → retour →
     gain ou badge → notification. La suivante attend que la précédente se ferme (petite file `glOverlayQueue` dans
     `src/gl/utils/`).
  2. Pendant un tour ouvert, sur un écran d'équipe : ni visite guidée, ni fenêtre du plateau, ni toast de gain ; les
     gains s'affichent à « Tour terminé ». Les lots ecrans-4 (plus de fenêtre du plateau en « Tenir ») et ecrans-6
     (pas de visite d'Olu pendant un tour) l'ont fait en partie : complète.
  3. Une piste s'ouvre sur place, en lecture seule ; « Revenir au jeu » rend exactement le même écran (fait par le
     lot ecrans-4 : vérifie).
  4. Pendant une question, rien n'est consultable (fait par le lot ecrans-2 : vérifie).
  5. **Un geste fermé est absent, pas grisé**, y compris les sous-onglets vides (Tutoriels, Forum sans message, Mon
     journal tant que le module n'est pas présenté).
  - Seul le **moment d'affichage** d'un gain change, jamais son calcul.
- **Textes** : aucun texte nouveau (« Revenir au jeu » et « Tour terminé » existent).
- **Tests** : deux surcouches demandées en même temps → une seule montée, la seconde à la fermeture ; aucun toast de
  gain sur l'écran d'équipe pendant un tour ouvert, le gain paraît à « Tour terminé ».
- **Critère d'acceptation** : à aucun moment deux surcouches ne se recouvrent ; aucune n'attend sans fin (une
  surcouche qui ne se ferme pas ne bloque pas la question : la file a une sortie).

### ecrans-8.4 — La projection, la vitrine et la connexion (ex-étape T9)

- **Constat vérifié** sur `main` (le lot ecrans-5 y a monté la musique, ecrans-6 les mots du voyage) :
  `GLProjectionView.jsx` : bandeau `gl-projection__banner`, plateau `gl-projection__board`, colonne
  `gl-projection__cote` (équipes en pastilles `gl-projection__team`, Lumière, carnet). Le voile y est nommé :
  « · le voile est à la case {n} » (bandeau), « sous le voile » (mention d'équipe), « Le voile avance » (phase).
  La projection ne reçoit pas `modules`. Connexion : `GLAuthView.jsx` (carte `gl-auth-card`) ; vitrine :
  `src/gl/components/parents/GLParentsDemoView.jsx`.
- **Changement attendu** :
  1. **Projection** : `.gl-table` (passe-lui `modules` pour l'interrupteur) ; le plateau dans un cadre de bois
     sculpté neutre (aucune image prévue : laiton fin) ; le bandeau en plaque de laiton ; la colonne en cartes de
     parchemin ; les équipes en **fanions** à leur couleur avec leur mascotte en médaillon (pas de pilule). Jamais
     une bourse. Corps de texte : 22 px au moins.
  2. **Le pictogramme du voile** : `GL_icone_voile` à côté des trois mentions du constat, décorative ; sans image,
     le texte seul.
  3. **Vitrine des parents** et **connexion** : fond bois (`GL_table_bois`, en `cover`) sous l'image d'accueil
     (posée par le lot contenu-5), formulaire sur une carte de parchemin. Avant le miroir, le vrai monde : **pas de
     matière de peuple ici**.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLProjectionView.test.jsx` (aucune bourse en projection ; fanions à la couleur de
  l'équipe ; interrupteur coupé → rendu d'avant) ; `tests-ui/gl/GLAuthView.test.jsx`,
  `tests-ui/gl/GLParentsDemoView.test.jsx` (pas de `data-peuple`).
- **Critère d'acceptation** : la projection reste une grille plein écran sans défilement
  (`e2e/gl-tenir-projection.spec.js`) ; le formulaire de connexion reste utilisable au clavier, contraste AA.

### Complément de relecture (24/11) : titres affichés et repères

Dans les étapes ecrans-8.1 et ecrans-8.2, les noms de blocs (« Mon grimoire », « Mes défis », « les pages à lire et à
tenir », « Mon expédition »…) sont des **repères** pour dire de quel bloc on parle. Garde mot pour mot le titre que
chaque bloc affiche aujourd'hui sur `main` (lis-le dans `GLSeuilView.jsx` et ses sous-composants) ; les seuls textes
nouveaux sont ceux que la fiche donne entre guillemets comme texte d'écran. Un bloc qui n'existe pas sur `main` ne se
crée pas : dis-le dans ton rapport, section « À relire par Oliv ».

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire.

**Images** : aucune n'est versionnée ; tests et captures montrent les replis.

| Clé | Emploi | Repli |
| --- | --- | --- |
| `GL_icone_sac` | onglet « Mon sac » (remplace `GL_icone_seuil`) | le libellé seul, sans emoji |
| `GL_icone_chemin`, `GL_icone_carnet` | onglets, 28 px | le libellé seul, sans emoji |
| `GL_icone_nature`, `GL_icone_caravane` | onglets, 28 px | le libellé seul, sans emoji |
| `GL_icone_comprendre` | « Comprendre le jeu », 28 px | le libellé seul, sans emoji |
| `GL_sac_gnome_ferme`, `GL_sac_gnome_ouvert` | le sac d'un élève Gnome, pendant le tour et à la veillée | pas d'image : le bloc dans la matière du peuple (`--gl-chene`) |
| `GL_sac_licorne_ferme`, `GL_sac_licorne_ouvert` | le sac d'un élève Licorne, mêmes deux états | pas d'image : `--gl-argent` et liseré bleu nuit |
| `GL_veillee_toile` | matière de fond de la veillée (toile près du feu) | toile unie et lueur chaude, en CSS |
| `GL_gemme_verre` | jetons de « Mon sac » | `--gl-verre` |
| `GL_table_bois` | sac fermé, projection, vitrine, connexion, en `cover` | dégradé radial brun ; couleur unie sous 640 px |
| `GL_icone_voile` | pictogramme fixe à côté du mot « voile » (projection, navigation) | le texte seul |
| `GL_plume_chaud` | seulement s'il te faut une plume en icône (`GL_icone_plume` n'a pas d'image) | pas d'icône |

Les six images de « Mon sac » sont facultatives. Repli de la veillée : donne tes valeurs de couleur dans ton rapport.
Complète la table des clés de `docs/GL_TABLE_DE_JEU.md`.

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-seuil.spec.js`, `e2e/gl-responsive-accessibility.spec.js`,
  `e2e/gl-foundations.spec.js`, `e2e/gl-market.spec.js`, `e2e/gl-player-journal.spec.js`, `e2e/gl-stats.spec.js`,
  `e2e/gl-player-full-cycle.spec.js`, `e2e/gl-demo-modes.spec.js`, `e2e/gl-guest-discovery.spec.js`,
  `e2e/gl-intro.spec.js`, `e2e/gl-tenir-projection.spec.js`, `e2e/gl-tenir-tablettes.spec.js`,
  `e2e/gl-rewards.spec.js`. `e2e/fixtures/gl.fixture.js` cite des identifiants d'onglet.
- `npm run check:bundle` ; note le poids de `gl-table.css`.
- Banc, régime fumée : une passe à la fin, verte.
- Captures dans `docs/captures/gl-decisions/ecrans-8/` (en replis) : barre à cinq onglets (ordinateur et
  téléphone) ; « Comprendre le jeu » ; « Mon sac » fermé (Gnome, Licorne) et ouvert ; les marges du copiste ; la
  projection ; la connexion ; la vitrine.
- À rendre dans ton rapport : la table de correspondance des identifiants ; ce que deviennent les invités et les
  entrées du prof ; les trois vérifications de l'étape ecrans-8.2, point 5 ; les textes proposés.

## 8. Contrats de test changés

- Libellés des cinq onglets : « Mon sac », « Le chemin », « Le carnet », « La nature », « La caravane » ;
  sous-onglets « Pages de la caravane », « Mes pages », « Le récit », « Les biomes », « Les espèces », « Les mots »,
  « Le Marché », « Mon journal » ; « Comprendre le jeu ».
- Plus d'onglets « L'aventure », « Le monde G&L », « Les joueurs », « Journal », « Statistiques », « Tutoriels » dans
  la barre d'un élève ; tests `GL{Adventure,Monde,Joueurs}View.test.jsx` remplacés.
- Onglets sans emoji pour un élève (`tests-ui/gl/GLTopBar.test.jsx`, `tests/fixtures/a11y-static-baseline.json`).
- `GL_MOBILE_PRIMARY_TAB_IDS` : Mon sac, Le chemin, Le carnet (`e2e/gl-responsive-accessibility.spec.js`).
- « Mon sac » : `data-etat`, ordre des blocs ; pendant un tour, les blocs de veillée sont absents
  (`tests-ui/gl/GLSeuilView.test.jsx`, `e2e/gl-seuil.spec.js`, `e2e/gl-rewards.spec.js`).
- Projection : équipes en fanions (plus de pastille `gl-projection__team` telle quelle) ; test-id inchangés.
- Toast de gain : absent de l'écran d'équipe pendant un tour ouvert.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TABLE_DE_JEU.md` : § « Surcouches » (les cinq règles), la navigation en cinq onglets, « Mon sac » en deux
  états, les clés d'image de ce lot.
- `docs/GL_TENIR_A_DEUX.md` : un renvoi. `docs/GL_ARCHITECTURE.md` : les trois vues nouvelles.
- `docs/reference/gl/*` : rien ici (lot fin-2) ; donne dans ton rapport la table « ancien onglet → nouveau ».
- Une ligne pour le § 0 des règles, dans ton rapport.
- `changelog.d/gl-decisions-ecrans-8.md`.

## 10. Hors périmètre

- Le nom « Mon sac » dans les écrans : fait par ecrans-6 ; dans les catalogues et la page des règles : contenu-5 ;
  dans les règles et les docs : fin-1 et fin-2.
- Les données et la logique des marges du copiste : contenu-6. Le lexique filtré par monde, l'image d'accueil, les
  traces de passage, le « +1 » du journal : contenu-5.
- Symboles gravés, figurines, voile qui pâlit, fil doré, légende du plateau : ecrans-9. Fouille et oiseau :
  ecrans-10. Moments forts, Olu en portrait, couleur du monde et nuit polaire, sons du tour : ecrans-11.

## 11. Pour Oliv

**À relire**

- L'ordre des blocs du sac ouvert (étape ecrans-8.2, point 2) : ta décision met « Ce soir, tu peux… » en tête ;
  l'ancienne liste mettait « Mon expédition » d'abord et les défis avant le grimoire. La fiche suit ta décision.
- Ce que le rapport dira du rôle du jour, des pages à lire et à tenir, et de la Loupe pendant une question.
- Les bulles d'Olu et l'aide des onglets « Le carnet » et « La caravane » : aucune n'est écrite, le rapport en
  propose.
- Les invités et la vitrine gardent leur barre ; le prof garde une entrée pour chaque vue.
- Les cinq onglets et « une surcouche à la fois » sont des choix de Claude entrés sous « plus de gel ».
- L'icône du voile est posée sur les étiquettes et les lignes d'état, pas au fil d'une phrase de récit ni dans une
  bulle d'Olu.

**À faire après la vague**

- Téléverser dans la médiathèque les six icônes d'onglet, les six images de « Mon sac » et `GL_icone_voile`, sous
  ces noms. Sans elles, tout marche, en replis.
- Regarder la projection au fond de la salle : fanions et bandeau lisibles à 8 m ?
- Ouvrir un compte d'élève pendant un tour, puis le soir : le sac fermé, puis ouvert.
