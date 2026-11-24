# Lot ecrans-9 — Le plateau : symboles gravés, figurines, voile qui pâlit, fil doré

> Chantier G&L « décisions » · vague 2 · couloir ecrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-9` · Attend : ecrans-8 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

En partie « Tenir », le plateau devient un plateau de jeu : chaque case porte un symbole gravé dans la pierre au lieu
d'un emoji, chaque équipe est une figurine sur socle avec son fanion. Le voile n'est plus une bande grise : la peinture
du plateau pâlit là où il est passé, et le fanion d'une équipe recouverte pâlit aussi. Chaque page tenue tire un fil
doré vers le chemin. Le numéro du tour ne se lit plus sur le dessin, mais dans les bandeaux. Aucune règle ne change.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime », partout où un élève regarde ; le mouvement seulement là où il sert la table ; la console du prof et les réglages restent l'outil ForêtMap. | « On se fiche du gel. Suis le chemin de la direction artistique et creuse à fond de ce côté » |
| Décision 37 de l'addendum 4 | 24/11, 11 h 50 (laissé à Claude) | Quand une page tient, un fil doré prend la place des plumes autour d'elle (le fil est posé ici, les plumes au lot ecrans-10). | — |
| Décision 38 de l'addendum 4 | 24/11, 11 h 50 | Le code ne dépend d'aucune image : chaque visuel a un repli CSS ou SVG et prend l'image dès qu'elle existe dans la médiathèque sous sa clé. | — |
| Décision 40 de l'addendum 4 | 24/11 (choix de Claude) | Un interrupteur unique `modules.table_de_jeu_enabled` (défaut vrai) coupe l'habillage et rend l'affichage d'aujourd'hui, sans toucher aux règles ni aux données. | — |
| Décision du 24/11 après-midi | 24/11, 14 h 43 | `GL_icone_voile` est le pictogramme du voile : un repère fixe à côté des mots qui nomment le voile. Elle accompagne le texte, ne le remplace pas, et ne remplace pas la perte de couleur. | « on garde l'image de voile » |

**Choix par défaut posés par Claude** (la session les applique sans demander ; Oliv peut les retirer) :

- Le jeu classique garde ses emoji et son plateau ; la table ne s'applique qu'en « Tenir ».
- Le symbole du Souffle est une feuille qui s'efface : un effet, pas une chose.
- Un seul interrupteur (`modules.table_de_jeu_enabled`) pour tout l'habillage : coupé, ce lot rend les emoji, la
  pilule, la bande grise d'aujourd'hui, et aucun fil.
- Les glyphes de repli par sorte de case ; 58 % du diamètre ; le filtre « gravure ».
- Le fanion à la place de la pilule ; 12 caractères au plus ; figurine d'au moins 7 % de la largeur du plateau.
- Les valeurs du filtre et du masque du voile ; glissement de 1,6 s ; rayon de 6 % pour une page pâlie.
- Le fil : couleur `#c9a227`, tracé en 1,2 s, halo d'opacité 0,18.

## 3. Fichiers

- **À toi** (tu les modifies librement) :
  - `src/gl/components/GLBoardMarkers.jsx`
  - `src/gl/components/GLBoardMascot.jsx`
  - `src/gl/components/GLBoardChrome.jsx` (c'est lui qui monte `GLBoardTurnHud`)
  - `src/gl/components/GLBoardTurnHud.jsx` (cité par l'étape 3 ; le composant n'a pas à changer)
  - `src/gl/components/GLGameBoard.jsx` (montages et props des calques ; les gestes de fouille sont au lot ecrans-10)
  - `src/gl/components/tenir/GLVoileLayer.jsx`
  - `src/gl/utils/glTenirMoment.js` (table `CASES` et sa lecture seulement)
  - `src/gl/styles/gl-tenir.css` (voile, figurines, fil), `src/gl/styles/gl-theme.css` (seulement
    `.gl-board-marker__path-number` et les règles des repères)
  - Tests : `tests-ui/gl/GLBoardMarkers.test.jsx`, `tests-ui/gl/GLBoardMascot.test.jsx`,
    `tests-ui/gl/GLChasseLayer.test.jsx` (ses tests du voile), `tests-ui/gl/GLGameBoardPresentation.test.jsx`,
    `tests-ui/gl/GLGameBoard.test.jsx`, `tests-ui/gl/glTenirMoment.test.js`, `tests-ui/gl/GLTenirTiroir.test.jsx`,
    `e2e/gl-tenir-projection.spec.js`
- **Nouveaux** :
  - `src/gl/components/tenir/glSymbolesGraves.jsx`
  - `src/gl/components/tenir/GLTrameFils.jsx`
  - `tests-ui/gl/glSymbolesGraves.test.jsx`, `tests-ui/gl/GLTrameFils.test.jsx`, `tests-ui/gl/GLVoileLayer.test.jsx`
- **D'un autre couloir, modification minimale permise** : aucun fichier d'un autre couloir. Dans ton couloir, ces
  fichiers ont été habillés par la table de jeu (lots ecrans-7 et ecrans-8) ; tu n'y fais que ceci :
  - `src/gl/components/tenir/GLTenirBandeau.jsx` (habillé par ecrans-7) : étape 3, vérifier que le numéro du tour et
    la phase s'y lisent ; ne change ni la plaque de laiton, ni les jetons, ni le sablier.
  - `src/gl/components/tenir/GLProjectionView.jsx` (habillé par ecrans-8) : étape 3, vérifier que le bandeau de
    projection porte le numéro du tour et la phase. Tu n'y montes rien : symboles, figurines, voile et fils y
    arrivent par le plateau (`presentation="projection"`). Les lots suivants y passent après toi : ecrans-10 y pose la
    cible de la page arrachée, ecrans-11 y monte les moments forts et les sons.
  - `src/gl/components/tenir/GLTenirTiroir.jsx` (habillé par ecrans-7) : étape 1, le symbole de la pastille « cases à
    venir », rien d'autre.
  - `src/gl/components/GLMapView.jsx` : seulement s'il faut faire passer une prop nouvelle au plateau.
  - `tests/content/gl-mots-du-voyage.test.js` (créé par ecrans-6) : ajoute tes nouveaux composants à sa liste.
  - `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : voir section 9.
- **Ne touche pas** :
  - `src/gl/components/tenir/GLChasseLayer.jsx`, `GLKraaWitness.jsx`, `GLTenirMoment.jsx` : lot ecrans-10.
  - `src/gl/styles/gl-table.css` : posé par ecrans-7, complété par ecrans-11 ; tes styles vont dans `gl-tenir.css`.
  - `lib/glSettings.js` : l'interrupteur y est déjà (ecrans-7) ; ce lot n'ajoute aucun réglage.
  - `src/gl/hooks/useGLBoardMascotMotion.js` : la marche case par case du lot ecrans-3 ; tu t'y branches, tu ne la
    changes pas.
  - `src/gl/components/GLGuestDemoBoard.jsx`, `GLChapterMapStudio.jsx`, `admin/chapters/GLChapterMapPreview.jsx` : ils
    montent les mêmes composants hors « Tenir » et gardent l'affichage d'aujourd'hui.
  - `src/shared/styles/*`, `src/shared/components/*` : reste dans `src/gl/` (le budget CSS de l'entrée ForêtMap n'a
    que 5 Ko de marge, `npm run check:bundle`).

## 4. Étapes (un commit par étape, dans cet ordre)

Les lignes citées ont été lues sur `main` = `d65dca4`. Les lots des vagues 1 et 2 passés avant toi ont pu les décaler :
revérifie chaque constat.

**Garde-fous de la direction artistique** (à faire relire par `gl-relecteur-garde-fous`) :

- Le voile se montre toujours en pâlissant ce qu'il touche (peinture du plateau, fanion de la figurine, plumes). Il
  n'est jamais dessiné comme une forme qui agit, une ombre qui avance seule, un visage ni une couleur sombre ; son
  icône est un repère fixe.
- L'oiseau n'a ni nom, ni cri, ni bulle. Il n'est jamais le Souffle. (Ce lot ne le dessine pas.)
- Jamais le visage de Sélène.
- Parité : les figurines alternent filles et garçons ; rôles en formes doubles, jamais de point médian.
- Mouvement réduit (`prefers-reduced-motion`) respecté partout.
- Aucun nouveau texte d'élève sans passage au filtre `findForbiddenString` (`src/shared/glGardeFousCore.js`) et au
  test `tests/content/gl-mots-du-voyage.test.js`, que tu complètes avec tes composants.

**Les images** : aucune n'est versionnée. `img(slug)` de `src/gl/assets/index.js` lit la médiathèque et rend
`GL_ASSET_PLACEHOLDER_URL` quand la clé manque : c'est alors le repli qui s'affiche. `img('GL_symbole_depart')`
retrouve la clé réelle `symbole_depart` (préfixe `GL_` retiré, minuscules). `img()` rend le substitut tant que le
manifeste n'est pas chargé : prévois le re-rendu (`useGlAssetsReady`, déjà lu par `GLGameBoard.jsx`). Une feuille CSS
ne peut pas appeler la médiathèque : l'adresse d'une image se pose par un composant (attribut `src` ou variable CSS).
Tests et captures montrent les replis.

**« En Tenir »** : `GLGameBoard.jsx` le sait par `tenirLayers` (non nul quand la partie est en « Tenir » et en cours,
`AppGL.jsx` l. 784-834) et par sa présentation (`tenir` sur l'écran d'équipe, `projection` au tableau, `standard`
ailleurs). `GLBoardMarkers` et `GLBoardMascot` n'ont aucune notion de mode : il leur faut une prop nouvelle, passée
par `GLGameBoard.jsx`. Elle vaut faux quand l'interrupteur `modules.table_de_jeu_enabled` est coupé (clé client
`tableDeJeuEnabled`, posée par le lot ecrans-7).

### ecrans-9.1 — Les cases gravées dans la pierre (ex-étape P1)

- **Constat vérifié** :

| Fait | Où |
| --- | --- |
| Le repère rend `appearance.emoji`, sinon une icône, sinon son libellé ; aucune notion de « Tenir » | `GLBoardMarkers.jsx` › `MarkerVisual`, l. 11-43 |
| Montage sur le plateau | `GLGameBoard.jsx` l. 576 |
| Deux autres montages, qui gardent l'emoji | `GLChapterMapStudio.jsx` l. 543, `admin/chapters/GLChapterMapPreview.jsx` l. 37 |
| `CASES` (11 sortes, clés `icone` et `mot`) n'est pas exportée ; le défaut est une constante à part, `CASE_PAR_DEFAUT` | `glTenirMoment.js` l. 382 et l. 395 |
| `casesEnPastilles` lit la sorte : la tonalité (`trame`, `souffle`) prime sur `eventType` | `glTenirMoment.js` l. 415-427 |
| Le numéro de case est une pastille noire | `GLBoardMarkers.jsx` l. 95-99 ; `gl-theme.css` l. 1854 |
| Le tiroir rend `c.icone` pour chaque case à venir | `GLTenirTiroir.jsx` l. 126-135 |

- **Changement attendu** : en « Tenir » (et seulement là ; le jeu classique garde ses emoji), `GLBoardMarkers.jsx`
  ne rend plus l'emoji du marqueur. Il rend **le symbole gravé** de la sorte de case, lue comme dans
  `casesEnPastilles` (la tonalité `trame` ou `souffle` prime sur `event_type`). Exporte de `glTenirMoment.js` une
  fonction de lecture de la sorte (elle rend `icone`, `mot`, `symbole`), puisque `CASES` n'est pas exportée.

  1. **Table** (`src/gl/utils/glTenirMoment.js`, `CASES`) : ajoute à chaque sorte une clé `symbole`.

  | Sorte | `symbole` (clé d'image) | Glyphe SVG de repli (monochrome, gravé) |
  | --- | --- | --- |
  | `start` | `GL_symbole_depart` | Une porte en arc |
  | `question` | `GL_symbole_question` | Un point d'interrogation |
  | `event` | `GL_symbole_peripetie` | Une étoile à huit branches fines |
  | `souffle` | `GL_symbole_souffle` | **Une feuille dont la moitié s'efface en pointillés** (l'effet, jamais une forme qui agit) |
  | `trame` | `GL_symbole_trame` | Trois fils qui se nouent |
  | `challenge` | `GL_symbole_defi` | Deux mains qui se tiennent |
  | `shortcut` | `GL_symbole_raccourci` | Une flèche courbe |
  | `frontier` | `GL_symbole_frontiere` | Un petit drapeau |
  | `finish` | `GL_symbole_camp` | Une tente |
  | `story`, `narration` | `GL_symbole_recit` | Un livre ouvert |
  | défaut | `GL_symbole_etape` | Un point |

  2. **Rendu avec image** : `GL_symbole_*` est **la pierre gravée entière** (calcaire pâle, symbole en creux, fond
     transparent). Elle se pose sur la pierre peinte, centrée, au même diamètre.
  3. **Rendu sans image** : le glyphe de `glSymbolesGraves.jsx` occupe 58 % du diamètre de la pierre peinte, centré,
     `mix-blend-mode: multiply`, opacité 0,8. Le glyphe SVG porte un filtre « gravure » : `feOffset` 0,6 vers le bas,
     `feGaussianBlur` 0,4, trait `rgba(40,28,18,.78)`, reflet clair `rgba(255,248,230,.5)` décalé vers le haut. **La
     pierre peinte reste visible.**
  4. Le numéro de case (`gl-board-marker__path-number`) devient un petit chiffre d'encre au bord de la pierre (11 px,
     Caudex), pas une pastille.
  5. `aria-label` et `title` gardent le mot de la case (« Question », « Trame »…).
  6. Le symbole de la pastille « cases à venir » (tiroir) suit la même table ; `icone` (emoji) reste pour la console.

- **Textes** : aucun texte nouveau. Les mots de case existants restent en `aria-label` et `title`.
- **Tests** : `tests-ui/gl/GLBoardMarkers.test.jsx` (en « Tenir » : le symbole, plus d'emoji ; hors « Tenir » et
  interrupteur coupé : l'emoji d'aujourd'hui ; avec et sans image ; le numéro de case toujours rendu) ;
  `tests-ui/gl/glSymbolesGraves.test.jsx` (un glyphe par sorte, le défaut) ; `tests-ui/gl/glTenirMoment.test.js`
  (`casesEnPastilles` garde `icone` et gagne `symbole`) ; `tests-ui/gl/GLTenirTiroir.test.jsx` (l. 84 : la pastille
  montre le symbole).
- **Critère d'acceptation** : sur une partie « Tenir », aucune case du plateau ne montre un emoji ; chaque case a son
  symbole, lisible avec la pierre peinte dessous ; l'éditeur de chapitre et le jeu classique sont inchangés.

### ecrans-9.2 — Les équipes en figurines sur socle (ex-étape P2)

- **Constat vérifié** :

| Fait | Où |
| --- | --- |
| Sous le sprite, la pilule `gl-board-mascot__titre` montre `team.titre` (le titre de l'équipe, **pas son nom**) | `GLBoardMascot.jsx` l. 79-83 ; `gl-tenir.css` l. 285 |
| Une seconde pilule (`gl-board-mascot__voile`) montre « sous le voile » ou « voile à N cases » | `GLBoardMascot.jsx` l. 84-93 ; `GLGameBoard.jsx` › `voileLabelForTeam`, l. 518-525 |
| Le nom de l'équipe est porté par l'épingle `gl-board-team-pin-label` (bouton de sélection ; `span` en projection) | `GLGameBoard.jsx` l. 629-680 |
| Hors sélection, le conteneur de la mascotte est `aria-hidden="true"` | `GLBoardMascot.jsx` l. 114-118 |
| Hauteur de la mascotte : `--gl-board-mascot-h` | `gl-theme.css` l. 1784 ; projection : `gl-tenir.css` l. 1438 |
| `GLBoardMascot` est aussi monté par la vitrine | `GLGuestDemoBoard.jsx` l. 275 (inchangé) |

- **Changement attendu**, dans `GLBoardMascot.jsx` en « Tenir » :
  1. sous le sprite, un **socle** de bois (`GL_socle` ; repli : ellipse `radial-gradient(#7a5535, #3f2a17)`, 70 % de
     la largeur du sprite, ombre portée douce) ;
  2. derrière, un **fanion** SVG sur une hampe fine : tissu à la couleur de l'équipe, nom de l'équipe en Caudex gras
     11 px (12 caractères au plus, coupé avec « … »), contraste AA calculé (texte clair ou foncé selon la couleur) ;
  3. il remplace la pilule `gl-board-mascot__titre` ; sous le voile, **le fanion pâlit** (filtre
     `grayscale(.85) brightness(1.1)`) au lieu du texte « sous le voile » ; `aria-label` garde « sous le voile » ;
  4. taille minimale de la figurine : 7 % de la largeur du plateau sur la tablette et en projection ;
  5. après le lot ecrans-3 : la marche case par case s'applique à la figurine et à son socle ensemble.
- **L'icône du voile** (décision de 14 h 43) : `GL_icone_voile` se pose à côté des mots qui nomment le voile, sans
  rien animer ; repli : le texte seul. Sur `main`, le plateau n'a pas de légende visible (« le voile » n'y est qu'un
  `aria-label`). Si un lot précédent en a posé une, ou si tu gardes à l'écran un texte qui nomme le voile (« voile à
  3 cases » sous la figurine), pose l'icône à côté de ces mots. Elle ne remplace ni le texte ni le fanion qui pâlit.
- **Non dit par l'ancien texte** (fais au plus simple, dis-le dans ton rapport, section « Choix faits sans
  demander ») :
  - ce que devient `team.titre`, que la pilule affichait et que le fanion ne porte pas ;
  - ce que devient « voile à N cases » (la distance au voile, quand l'équipe n'est pas recouverte) ;
  - le nom s'afficherait deux fois (fanion et épingle) : l'épingle porte la sélection et `data-team-id`, ne la retire
    pas ;
  - « sous le voile » doit rester lu par un lecteur d'écran alors que le conteneur est `aria-hidden` : pose
    l'étiquette là où elle est lue.
- **Textes** : aucun texte nouveau.
- **Tests** : `tests-ui/gl/GLBoardMascot.test.jsx` (en « Tenir » : socle et fanion, plus de pilule de titre ; équipe
  sous le voile : fanion pâli, pas de texte « sous le voile » visible, étiquette accessible présente ; nom de 20
  caractères coupé à 12 avec « … » ; contraste AA du fanion pour une couleur claire et une couleur foncée ; hors
  « Tenir » et interrupteur coupé : l'affichage d'aujourd'hui).
- **Critère d'acceptation** : sur la tablette et en projection, chaque équipe est une figurine sur socle avec son
  fanion lisible ; une équipe recouverte se reconnaît à son fanion pâli, sans mot ; la vitrine est inchangée.

### ecrans-9.3 — Le tour sort du dessin (ex-étape P3)

- **Constat vérifié** (l'ancien texte disait le compteur monté dans `.gl-board` par `GLGameBoard.jsx` : c'est faux) :

| Fait | Où |
| --- | --- |
| `GLBoardTurnHud` (classe et test-id `gl-board-turn-hud`) est monté par `GLBoardChrome.jsx` | `GLBoardChrome.jsx` l. 71-79 |
| `GLBoardChrome` est monté dans `.gl-board-shell`, à côté de `.gl-board`, pas dedans | `GLGameBoard.jsx` l. 733-736 |
| Avec `masque={epure}`, rien du chrome ne se rend en présentation `tenir` ni `projection` | `GLGameBoard.jsx` l. 141 et l. 736 ; `GLBoardChrome.jsx` l. 39 |
| Le compteur reste donc en présentation `standard` d'une partie « Tenir » (plateau vu hors de l'écran d'équipe, avec `turnsEnabled`) | `AppGL.jsx` l. 1022 et l. 1088 |
| Le bandeau d'équipe dit déjà « Tour 3 — À vous de jouer » | `GLTenirBandeau.jsx` l. 51-53 (`titreDuTour`, test-id `gl-tenir-phase`) |
| Le bandeau de projection aussi | `GLProjectionView.jsx` l. 189-191 (test-id `gl-projection-tour`) |

- **Changement attendu** : en « Tenir », `GLBoardTurnHud` n'est plus monté sur le plateau : le numéro du tour et la
  phase passent dans le bandeau d'équipe (habillé par ecrans-7) et dans le bandeau de projection (habillé par
  ecrans-8). Vérifie d'abord ce qui est déjà vrai après les lots précédents ; ce qui l'est s'écrit « écarté : déjà
  corrigé » dans ton rapport. Reste à traiter : le plateau en présentation `standard` d'une partie « Tenir » vu par
  un élève. Le compteur que voit le prof (bouton « Nouveau tour », `canManageTurn`) est un outil de la console :
  décision 34 de l'addendum 4, la console reste telle quelle ; dis dans ton rapport ce que tu en as fait.
- **Textes** : aucun.
- **Tests** : aucun élément `gl-board-turn-hud` dans le plateau (`.gl-board-shell`, donc aussi `.gl-board`) d'une
  partie « Tenir » vue par un élève, dans les trois présentations ; le jeu classique garde son compteur ;
  `tests-ui/gl/GLTenirBandeau.test.jsx` et `tests-ui/gl/GLProjectionView.test.jsx` : numéro du tour et phase
  présents.
- **Critère d'acceptation** : en « Tenir », aucun élève ne lit « Tour n°… » sur le dessin ; il le lit dans le
  bandeau.

### ecrans-9.4 — Le voile pâlit la peinture (ex-étape P4)

- **Constat vérifié** :

| Fait | Où |
| --- | --- |
| Le voile est une polyligne grise (`gl-voile-bande`) et des disques gris (`gl-voile-case`) ; au tableau, un contour en plus (`gl-voile-contour`) | `GLVoileLayer.jsx` l. 19-43 ; `gl-tenir.css` l. 131-143 et l. 1685-1701 |
| Le calque reçoit `markers`, `position`, `variante` : ni l'image du plateau, ni le carnet | `GLVoileLayer.jsx` l. 12 ; montage `GLGameBoard.jsx` l. 589-595 |
| L'image du plateau est connue du plateau | `GLGameBoard.jsx` › `imageUrl`, l. 160, passée au canevas l. 685 |
| Une page pâlie se reconnaît à `carnet.pages[].etat === 'palie'` ; son centre public est `contour` (`{ x, y }` de 0 à 1) | `lib/glChasse.js` l. 1479 |
| Repère du calque : 0 à 100, positions des cases `x_pct`, `y_pct` | `GLVoileLayer.jsx` l. 17 et l. 21 |

- **Changement attendu** : remplace la bande grise de `GLVoileLayer.jsx` en « Tenir ». `GLGameBoard.jsx` lui passe
  l'image du plateau et le carnet.
  1. Une seconde couche de l'image du plateau, filtrée
     `grayscale(0.9) sepia(0.25) brightness(1.15) contrast(0.75)`, révélée par un **masque SVG** construit sur la
     polyligne des cases jusqu'à la position du voile (trait de 14 unités du repère 0-100, bords flous
     `feGaussianBlur` 2,5, bord fibreux `feTurbulence` baseFrequency 0,9).
  2. Au bord du masque, quelques fils dorés courts et effilochés (la Trame qui se défait) ; **jamais de forme, de
     visage, de couleur sombre ni d'ombre qui avance**. L'icône `GL_icone_voile` ne se pose pas sur ce calque : elle
     n'accompagne que des mots (étape 2).
  3. « Le voile avance » : le masque glisse jusqu'à la nouvelle position en 1,6 s (projection et tablette) ; il
     recule de la même façon.
  4. Une page pâlie : sa zone se désature aussi (cercle flou de rayon 6 % autour du centre public de la page).
  5. Les symboles, les figurines et les plumes restent lisibles au-dessus ; `aria-label="le voile"` et
     `data-position` gardés.
  6. `prefers-reduced-motion` : changement direct, sans glissement.
  7. **Poids** : aucune image de plus (la même image du plateau, filtrée en CSS). Elle est peinte deux fois : le coût
     de rendu sur tablette n'a pas été mesuré ; regarde-le sur une tablette 1024 × 768 et dis-le dans ton rapport.
  8. Interrupteur coupé : la bande grise d'aujourd'hui.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLVoileLayer.test.jsx` (position − 1 : rien ; position 1 : couche pâlie et masque sur
  les cases 0 et 1 ; `aria-label` et `data-position` ; page pâlie : un cercle de plus ; mouvement réduit : pas de
  transition ; aucune `gl-voile-bande` en « Tenir » ; interrupteur coupé : la bande) ;
  `tests-ui/gl/GLChasseLayer.test.jsx` l. 58-96 et `tests-ui/gl/GLGameBoardPresentation.test.jsx` l. 181-187 (ils
  affirment la bande et le contour : à réécrire) ; `e2e/gl-tenir-projection.spec.js` l. 162-165.
- **Critère d'acceptation** : là où le voile est passé, le plateau a perdu sa couleur, et rien d'autre ne le
  signale : ni bande, ni forme, ni teinte sombre ; quand il avance, la perte de couleur glisse en 1,6 s.

### ecrans-9.5 — Le fil doré de la Trame (ex-étape P5)

- **Constat vérifié** : le carnet sert déjà le centre des pages tenues (`carnet.pages[]` avec `etat === 'tenue'` et
  `contour`, `lib/glChasse.js` l. 1479 ; `contour` est un point de 0 à 1, pas un tracé). Les positions des cases
  sont celles des marqueurs (`x_pct`, `y_pct`, de 0 à 100). `GLChasseLayer.jsx` lit déjà ces contours (l. 26).
  **Aucun appel de plus.**
- **Changement attendu** : `GLTrameFils.jsx`, nouveau calque SVG monté par `GLGameBoard.jsx` avec le carnet et les
  marqueurs.
  1. Chaque page **tenue** trace un fil doré (`#c9a227`, 0,5 unité, halo `drop-shadow(0 0 1.2px #f4d77a)`) en courbe
     douce, du centre public de sa zone à la case du chemin la plus proche.
  2. La zone d'une page tenue garde un halo doré très léger (opacité 0,18).
  3. Le fil apparaît en se dessinant (`stroke-dashoffset`, 1,2 s ; direct en mouvement réduit).
  4. Au camp, tous les fils scintillent une fois.
  5. Progrès collectif, jamais un classement : aucune couleur d'équipe sur un fil.
  6. Interrupteur coupé : aucun fil.
- **Textes** : aucun.
- **Tests** : `tests-ui/gl/GLTrameFils.test.jsx` (un fil par page tenue, aucun pour une page trouvée ou pâlie ;
  aucun fil coloré par équipe ; le fil joint la case la plus proche ; mouvement réduit : pas d'animation ; calque
  `aria-hidden` et `pointer-events: none`).
- **Critère d'acceptation** : sur le plateau et en projection, chaque page tenue est reliée au chemin par un fil
  doré, le même pour toutes les équipes.

## 5. Migration

Aucune.

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/`.

**Clés de médiathèque employées par ce lot, et leur repli** :

| Clé | Contenu | Étape | Repli sans image |
| --- | --- | --- | --- |
| `GL_symbole_depart` | Pierre gravée : une porte en arc | 1 | Glyphe SVG gravé de `glSymbolesGraves.jsx` (58 % du diamètre, `multiply`, opacité 0,8) |
| `GL_symbole_question` | Un point d'interrogation | 1 | Idem |
| `GL_symbole_peripetie` | Une étoile à huit branches fines | 1 | Idem |
| `GL_symbole_souffle` | Une feuille dont la moitié s'efface | 1 | Idem |
| `GL_symbole_trame` | Trois fils qui se nouent | 1 | Idem |
| `GL_symbole_defi` | Deux mains qui se tiennent | 1 | Idem |
| `GL_symbole_raccourci` | Une flèche courbe | 1 | Idem |
| `GL_symbole_frontiere` | Un petit drapeau | 1 | Idem |
| `GL_symbole_camp` | Une tente | 1 | Idem |
| `GL_symbole_recit` | Un livre ouvert | 1 | Idem |
| `GL_symbole_etape` | Un point | 1 | Idem |
| `GL_socle` | Socle rond de bois tourné, vu de trois quarts | 2 | Ellipse `radial-gradient(#7a5535, #3f2a17)`, 70 % de la largeur du sprite |
| `GL_icone_voile` | Pictogramme du voile, repère fixe | 2 | Le texte seul |

Non employées : `GL_pierre_vierge` (aucune étape ne s'en sert). Le voile lui-même n'a pas d'image : c'est l'image du
plateau, filtrée (étape 4).

## 7. Vérifications propres au lot

- e2e, sous le verrou : `e2e/gl-tenir-projection.spec.js`, `e2e/gl-tenir-tablettes.spec.js`,
  `e2e/gl-game-flow.spec.js` (le jeu classique garde ses emoji et son compteur de tour).
- Banc, régime fumée : une seule passe à la fin, les deux scénarios des règles communes ; il doit être vert.
- `npm run check:bundle` : tes fichiers sont tous sous `src/gl/`, le budget ne doit pas bouger.
- Captures (`docs/captures/gl-decisions/ecrans-9/`), avant et après, en replis : tablette d'équipe 1024 × 768 avec
  le plateau gravé et les figurines ; la même avec le voile à mi-chemin et une équipe recouverte ; projection avec
  deux pages tenues et leurs fils ; une capture interrupteur coupé.
- À rendre dans ton rapport : ce qui était déjà vrai à l'étape 3 ; tes quatre choix de l'étape 2 ; le coût de rendu
  du voile sur tablette.

## 8. Contrats de test changés

Tous ne valent qu'en « Tenir », interrupteur allumé. Interrupteur coupé et jeu classique : rien ne change.

| Contrat | Avant | Après |
| --- | --- | --- |
| Repère du plateau | `.gl-board-marker__emoji` | Le symbole gravé (image ou glyphe SVG) ; plus d'emoji |
| `.gl-board-marker__path-number` | Pastille noire | Toujours présent, en chiffre d'encre |
| `gl-board-mascot-titre`, `gl-board-mascot-voile` (test-id) | Pilules de texte sous la mascotte | Remplacées par le fanion ; « sous le voile » n'est plus un texte visible, il reste en étiquette accessible |
| `.gl-voile-bande`, `.gl-voile-case`, `.gl-voile-contour` | Bande, disques, contour au tableau | Absents ; `data-testid="gl-voile-layer"`, `aria-label="le voile"` et `data-position` gardés |
| `gl-board-turn-hud`, `gl-board-turn-counter` | Sur le plateau en présentation `standard` | Absents du plateau pour un élève |
| `casesEnPastilles` | `{ cle, numero, icone, libelle, complet }` | La même chose, plus `symbole` |
| `.gl-tenir-case__icone` (tiroir) | Emoji | Symbole |

Tests et e2e qui affirment l'ancien : `tests-ui/gl/GLChasseLayer.test.jsx` l. 58-96,
`tests-ui/gl/GLGameBoardPresentation.test.jsx` l. 181-187, `e2e/gl-tenir-projection.spec.js` l. 162-165,
`tests-ui/gl/GLTenirTiroir.test.jsx` l. 84.

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TABLE_DE_JEU.md` (créé par ecrans-7) : la table des symboles (clé d'image sous ses deux formes,
  `GL_symbole_depart` et `symbole_depart`, et repli), le socle et le fanion, le voile qui pâlit, le fil doré, ce que
  coupe l'interrupteur.
- `docs/GL_TENIR_A_DEUX_REGLES.md`, garde-fou 1 (« un **voile**, une bande grise, des pages qui pâlissent », l. 51) :
  la bande grise devient une perte de couleur. Hors § 0.
- `docs/reference/gl/carte-du-royaume.md`, section « Tenir à deux : les pages cachées, les empreintes, l'oiseau »
  (l. 188) : la phrase « Le voile se voit comme une bande grise le long du chemin » devient fausse ; corrige-la, elle
  seule.
- `changelog.d/gl-decisions-ecrans-9.md`.

## 10. Hors périmètre

- La lanterne, les plumes, l'oiseau qui se pose, la page qui s'arrache : lot ecrans-10. Les plumes pâlissent sous
  le voile et s'envolent quand une page tient : c'est ecrans-10 qui les branche sur ton calque et sur ton fil.
- Les moments forts de projection (« Le voile avance », « Une page tient ») et les sons : lot ecrans-11.
- L'habillage de la tablette d'équipe, des bandeaux, du tiroir, de la projection : lots ecrans-7 et ecrans-8.
- La marche case par case : lot ecrans-3.
- Les docs du prof, les captures finales et le § 0 des règles : lots fin-1 et fin-2.
- Le jeu classique, l'éditeur de chapitre et la vitrine : inchangés.
- Aucune règle, aucune route, aucune donnée, aucun réglage.

## 11. Pour Oliv

**À relire**

- Aucun texte d'élève nouveau.
- Le titre de l'équipe (`team.titre`) et la distance « voile à N cases » : l'ancien texte ne dit pas où ils vont
  quand le fanion remplace la pilule. Le rapport du lot dit ce qui a été fait.
- Les onze glyphes de repli dessinés par le lot, et le symbole du Souffle (une feuille qui s'efface).
- Non vérifié : la tablette d'équipe et la projection en vrai (vues dans le code et en admin seulement) ; la
  lisibilité des symboles gravés et des fanions au fond de la salle.

**À faire après la vague**

- Téléverser dans la médiathèque `GL_symbole_*` (11 images), `GL_socle` et `GL_icone_voile`, sous ces noms. Sans
  elles, tout marche, en replis.
- Regarder la projection au fond de la salle : symboles gravés et fanions lisibles à 8 m ?
