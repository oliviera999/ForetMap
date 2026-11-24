# Lot ecrans-3 — Les mascottes sautent de case en case

> Chantier G&L « décisions » · vague 1 · couloir écrans · charge moyenne · banc : fumée
> Branche : `claude/gl-decisions-ecrans-3` · Attend : ecrans-2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Quand une équipe avance, sa mascotte ne glisse plus en ligne droite à travers le décor : elle saute de case en
  case, sur la tablette d'équipe, la projection et la console.
- Elle recule aussi case par case.
- La fenêtre d'une case posée sur le plateau attend que la mascotte soit arrivée.
- C'est un correctif d'animation : aucune règle, aucune route, aucun schéma, aucun réglage par défaut, aucun texte
  visible des élèves, aucune CSS.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Demande d'Oliv, sans numéro (ancien « lot M » du prompt) | 23/11 | Les mascottes sautent de case en case quand elles se déplacent. | « Quand une mascotte se déplace, je veux qu'elle saute de case en case. » |

**Choix par défaut posés par Claude** (aucun n'a été validé par Oliv ; appliqués sans demander ; il peut les retirer ;
liste-les tous dans ton rapport) :

| Cas | Comportement | Statut |
| --- | --- | --- |
| Changement de case entre deux repères du chemin, tous deux connus, de 1 à 12 cases | **Saut case par case**, **550 ms par case** (`MAP_VIEW_MASCOT_MOVE_MS`), vers l'avant ou **vers l'arrière** | choix de Claude, non validé par Oliv |
| Plafond | **12 cases au plus** (constante exportée `GL_BOARD_HOP_MAX_CASES = 12`) | choix de Claude, non validé par Oliv |
| Joie à l'arrivée (`triggerHappy`) | Seulement pour un déplacement vers l'avant : **un recul se fait sans joie** | choix de Claude, non validé par Oliv |
| Fenêtre de case posée sur le plateau | **Elle s'ouvre à l'arrivée**, pas avant (la carte du moment, elle, n'attend pas) | choix de Claude, non validé par Oliv |
| Plus de 12 cases, case absente du chemin, premier affichage, reconnexion, changement de chapitre, plateau hors `numbered_path`, position libre | Inchangé : placement direct ou glissade unique | choix de Claude |
| Plusieurs équipes déplacées en même temps (Cordée) | Chaque équipe a sa chaîne, en parallèle | choix de Claude |
| Déplacement déjà animé par le client (dé du prof en classique, auto-déplacement) | Pas de second trajet quand le rechargement serveur arrive avec la même case | choix de Claude |
| Plateau découverte (`GLGuestDemoBoard`) | Inchangé | choix de Claude |
| Nouveau réglage, nouvelle CSS | Aucun | choix de Claude |

## 3. Fichiers

**À toi** (vérifiés sur `main` `d65dca4`) :

- `src/gl/hooks/useGLBoardMascotMotion.js`
- `src/gl/hooks/useGLMarkerArrival.js` : tu possèdes **l'animation** (le délai d'ouverture de la fenêtre). Le lot
  ecrans-4 n'y touchera qu'au paramètre d'activation (`enabled`).
- `src/gl/components/GLGameBoard.jsx` : seulement passer `markers` et `boardMovement` aux deux hooks (appel de
  `useGLBoardMascotMotion`, ligne 178 ; appel de `useGLMarkerArrival`, ligne 232). Le lot ecrans-4 y vérifie ensuite
  les chemins d'ouverture des fenêtres.
- `tests-ui/gl/useGLBoardMascotMotion.test.js`, `tests-ui/gl/useGLMarkerArrival.test.js` (ils existent : à étendre).
- `docs/reference/gl/guide-du-mj.md` : une phrase, si le guide décrit le plateau.

**Nouveaux** :

- `src/gl/utils/glBoardHops.js`, `tests-ui/gl/glBoardHops.test.js`.
- `changelog.d/gl-decisions-ecrans-3.md`, `docs/prompts/gl-decisions/rapports/ecrans-3.md`,
  `docs/captures/gl-decisions/ecrans-3/`.

**D'un autre couloir, modification minimale permise** : aucune.

**Ne touche pas** :

- `src/hooks/useMascotTransientState.js`, `src/shared/hooks/usePctAnchorTransform.js` : partagés avec la visite
  ForêtMap. Si tu dois y toucher, teste la visite (`e2e/visit-mascot.spec.js`,
  `tests/visit-map-animations-css.test.js`) et dis-le.
- `src/shared/glBoardPathCore.js` (tu le lis : `sortMarkersByPath`, `teamPathIndex`, `markersAlongPathSteps`),
  `src/utils/mapViewMascotMotion.js` (`MAP_VIEW_MASCOT_MOVE_MS = 550`).
- `src/gl/components/GLGuestDemoBoard.jsx` (plateau découverte : il peut ne rien passer au hook).
- `lib/glTour.js` et tout le serveur : ce lot anime ce que le serveur a déjà décidé.
- `src/gl/utils/glTenirMoment.js`, `src/gl/components/mj/GLTourScreen.jsx`,
  `src/gl/components/tenir/GLProjectionView.jsx`, `src/gl/components/tenir/GLTenirEcranEquipe.jsx` : le même hook sert
  tous les écrans, aucun de ces fichiers n'a à changer (lots ecrans-2, moteur-4 et ecrans-4).
- Les feuilles de style.

## 4. Étapes (un commit par étape, dans cet ordre)

**Avant de commencer** : `git log b8b5344..HEAD -- src/gl/hooks src/gl/components/GLGameBoard.jsx
src/shared/glBoardPathCore.js lib/glTour.js`, et dis dans ton rapport ce qui a changé depuis les constats. Au 24/11,
sur `main` `d65dca4`, rien n'avait changé dans ces fichiers.

**Contexte**. En « Tenir à deux », c'est le **serveur** qui déplace les équipes (`lib/glTour.js`) ; les écrans
(tablette d'équipe, projection, console) relisent l'état. Les plateaux sont en `numbered_path` (vu en prod sur une
partie le 23/11, non revérifié depuis).

**Constats vérifiés** (lignes de `b8b5344`) :

| Où | Constat |
| --- | --- |
| `lib/glTour.js` › jet (lignes 1859-1945 ; `targetMarkerAfterDice` ligne 1866, `applyTeamMoveTx` ligne 1918) | Le serveur calcule la case d'arrivée, écrit la position et journalise un évènement `move` avec la seule case d'arrivée. Aucun trajet n'est transmis. Même chose pour la Cordée, l'avance libre, les sorts `move_delta`, le vent de la caravane, l'auto-déplacement d'une case. |
| `src/gl/hooks/useGLBoardMascotMotion.js` › effet `[teams, boardHeightPx]` (lignes 49-75) | La nouvelle position est posée d'un coup : **une seule glissade de 550 ms en ligne droite**, même pour 6 cases, en coupant à travers le décor. |
| même fichier › `moveTeamAlongPath` (ligne 192) | Le saut case par case existe déjà (une étape `moveTeamTo` par case, 550 ms chacune, chaîne annulable par `pathChainRef`). |
| Appelants de `moveTeamAlongPath` | Seulement `GLGameBoard.jsx` › `handleDiceRollResult` (ligne 444 : dé du plateau, prof en mode classique), `handleEffectAutoMove` (ligne 198), et `GLGuestDemoBoard` (plateau découverte). En « Tenir », le plateau en `presentation="tenir"` ou `"projection"` masque `GLBoardChrome` et les dés passent par `tourApi.lancer` → serveur → rechargement → glissade unique. **Aucun écran « Tenir » ne fait sauter la mascotte.** |
| même effet, bug latent | Une équipe en cours d'animation (`animatingRef`, ligne 44) est sautée par l'effet, qui ne se relance pas à la fin de la chaîne : une position serveur arrivée pendant un trajet reste perdue jusqu'au rechargement suivant. |
| `src/gl/hooks/useGLMarkerArrival.js` | La fenêtre de case s'ouvre `moveDelayMs` après le changement de case (550 ms ; `GLGameBoard.jsx` passe 0 sous mouvement réduit) : avec des sauts, elle s'ouvrirait avant l'arrivée. `schedulePresentOnArrival` accepte déjà `options.moveDelayMs` (ligne 188). |
| `src/shared/glBoardPathCore.js` | `sortMarkersByPath` (ligne 6), `teamPathIndex` (ligne 56), `markersAlongPathSteps` (ligne 123, avant et arrière) existent. |

**Garde-fous propres au lot** :

- Ce lot ne touche à aucun geste : il anime ce que le serveur a déjà décidé.
- **Aucun état d'attente sans sortie** : la carte du moment n'attend pas la fin des sauts ; seule la fenêtre posée
  **sur le plateau** (`useGLMarkerArrival`) attend.
- `prefers-reduced-motion` : la mascotte se téléporte, comme aujourd'hui.
- Isolement G&L / ForêtMap : ne touche ni `useMascotTransientState` ni `usePctAnchorTransform`.
- Surface « tableau » : le même hook sert tous les écrans.

### ecrans-3.1 — Planificateur pur `glBoardHops` (ex-étape M1 de l'ancien lot M)

- **Constat vérifié** : `src/gl/utils/glBoardHops.js` n'existe pas ; `src/shared/glBoardPathCore.js` fournit le tri du
  chemin.
- **Changement attendu** (nouveau fichier `src/gl/utils/glBoardHops.js`) :
  - `export const GL_BOARD_HOP_MAX_CASES = 12;`
  - `export function planBoardHops({ sortedMarkers, fromMarkerId, toMarkerId, maxCases = GL_BOARD_HOP_MAX_CASES })` :
    liste ordonnée des repères à franchir, **case de départ exclue, case d'arrivée incluse** ; vers l'arrière, dans
    l'ordre du recul ; `[]` si départ = arrivée ; `null` si l'un des deux est absent du chemin ou `null`, ou si
    l'écart dépasse `maxCases`. S'appuie sur `sortedMarkers` déjà triés par `sortMarkersByPath`. Fonction pure.
- **Textes** : aucun.
- **Tests** (`tests-ui/gl/glBoardHops.test.js`, nouveau) : avance de 1 et de 6, recul de 3, départ = arrivée, repère
  inconnu, `null` en entrée, 13 cases (→ `null`), 12 cases (→ 12 repères), case de départ (rang 0).
- **Critère d'acceptation** : la fonction rend le trajet attendu dans tous ces cas, sans React ni réseau.

### ecrans-3.2 — `useGLBoardMascotMotion` suit la case affichée et fait sauter (ex-étape M2)

- **Constat vérifié** : voir le tableau (effet `[teams, boardHeightPx]`, `moveTeamAlongPath`, bug latent). Le hook
  reçoit aujourd'hui `teams`, `boardHeightPx`, `prefersReducedMotion`.
- **Changement attendu** :
  1. Nouveaux paramètres : `markers = []`, `boardMovement = null`. `sortedMarkers` mémoïsé par `sortMarkersByPath`.
  2. Ref `shownMarkerByTeamRef` (équipe → repère où la mascotte **est affichée**, ou `null`), mis à jour au placement
     direct, à chaque étape de `moveTeamAlongPath` (option `markerId` de `moveTeamTo` quand `arrival === 'marker'`),
     et par `moveTeamTo` sans repère (→ `null`). Ref `teamsRef` (dernière liste reçue).
  3. Fonction `syncTeam(team)`, utilisée par l'effet **et** par la fin de chaîne : (1) équipe en animation → rien ;
     (2) si `boardMovement?.isNumberedPath`, pas de mouvement réduit, case affichée connue,
     `team.position_marker_id` différent, et `planBoardHops(...)` non vide →
     `moveTeamAlongPath(id, plan, { triggerHappy: avance })` ; (3) sinon → comportement actuel.
  4. Fin de chaîne (`isLast`, résolution `true`) : retire l'équipe d'`animatingRef`, puis `syncTeam` sur la version de
     `teamsRef` (rattrape une position arrivée pendant le trajet). Pas de boucle.
  5. Nettoyage des nouveaux timers et chaînes au démontage.
  6. `GLGameBoard.jsx` passe `markers` et `boardMovement` au hook ; `GLGuestDemoBoard` peut ne rien passer.
- **Textes** : aucun.
- **Tests** : voir ecrans-3.4 (écris-les dans ce commit ou dans le suivant, mais chaque commit reste vert).
- **Critère d'acceptation** : sur un écran « Tenir », un jet de 4 fait faire quatre sauts à la mascotte ; un recul se
  fait case par case, sans joie ; une position arrivée pendant un trajet est rattrapée à la fin.

### ecrans-3.3 — La fenêtre de case attend la fin des sauts (ex-étape M3)

- **Constat vérifié** : `useGLMarkerArrival.js` garde la case précédente par équipe (`prevMarkerByTeamRef`, ligne 35)
  et programme l'ouverture `moveDelayMs` après le changement (effet des lignes 231-255).
- **Changement attendu** :
  1. `useGLMarkerArrival.js` : nouveau paramètre `boardMovement`. Au changement de case de l'équipe suivie,
     `planBoardHops` de `prev` vers `markerId` ; délai = `plan?.length ? plan.length × moveDelayMs : moveDelayMs`,
     passé à `schedulePresentOnArrival(marker, teamId, { moveDelayMs: délai })`.
  2. `GLGameBoard.jsx` passe `boardMovement` au hook (l'ancien texte ne le disait pas : c'est nécessaire).
  3. Les appels de `GLGameBoard.jsx` qui attendent déjà la fin du trajet (`handleDiceRollResult`, `handleMarkerMove`)
     ne changent pas.
- **Textes** : aucun.
- **Tests** : voir ecrans-3.4.
- **Critère d'acceptation** : la fenêtre d'une case à question atteinte en 4 cases s'ouvre à 4 × 550 ms, pas avant ;
  sous mouvement réduit, elle s'ouvre tout de suite.

### ecrans-3.4 — Tests d'écran (ex-étape M4)

- **Changement attendu** : aucun code de plus ; des tests.
- **Tests** :
  - `tests-ui/gl/useGLBoardMascotMotion.test.js` (minuteries simulées) : case 2 → 5 : repères 3, 4, 5 à 0, 550,
    1 100 ms, `walking` faux à 1 650 ms ; recul 6 → 3 sans joie ; 13 cases → placement direct ; mouvement réduit →
    placement direct ; premier rendu → placement direct ; position reçue pendant un trajet → rattrapée à la fin ;
    trajet lancé par `moveTeamAlongPath` puis rechargement avec la même case → aucune étape de plus ; plateau hors
    `numbered_path` → placement direct.
  - `tests-ui/gl/useGLMarkerArrival.test.js` : fenêtre d'une case à question atteinte en 4 cases à 4 × 550 ms, pas
    avant.
  - `tests-ui/gl/GLGameBoard.test.jsx`, `GLGameBoardMount.test.jsx`, `GLGameBoardPresentation.test.jsx`,
    `GLGameBoardRoster.test.jsx`, `GLBoardMascot.test.jsx` : verts **sans changer leurs attentes** ; sinon, explique.
  - Si un e2e attendait la mascotte à destination 550 ms après un jet « Tenir », attends par sondage (`expect.poll`)
    et liste-le dans ton rapport.
- **Critère d'acceptation** : `npm run test:ui` vert ; aucun test de plateau existant n'a changé d'attente sans
  explication.

### ecrans-3.5 — Docs et captures (ex-étape M5)

- **Changement attendu** :
  - `changelog.d/gl-decisions-ecrans-3.md` : « Corrigé — G&L : les mascottes sautent de case en case » (tablette,
    projection, console ; 12 cases au plus ; recul case par case ; mouvement réduit inchangé ; fenêtre de case à
    l'arrivée).
  - `docs/reference/gl/guide-du-mj.md` : une phrase là où le guide décrit le plateau, s'il le fait.
  - Skills qui décrivent l'animation des pions : au 24/11, aucun skill de `.claude/skills/` ne la décrit (vérifie
    `foretmap-gl` et `gl-tenir-moteur`) ; n'ajoute rien s'il n'y a rien à corriger.
  - Captures : trois images d'un jet de 4 sur la projection (`docs/captures/gl-decisions/ecrans-3/`).
- **Textes** : aucun texte d'élève.
- **Tests** : aucun.
- **Critère d'acceptation** : le rapport liste les choix par défaut du tableau de la section 2, tous marqués « non
  validés par Oliv ».

## 5. Migration

Aucune.

## 6. Données et sources

Aucune. `docs/prompts/gl-decisions/sources/mascottes-annexe.md` est l'ancien texte de ce lot : cette fiche le
remplace, tu n'as pas à le lire.

## 7. Vérifications propres au lot

- Banc, régime **fumée** : une passe à la fin (le lot ne touche aucun geste).
- e2e (sous le verrou) : `e2e/gl-tenir-tablettes.spec.js`, `e2e/gl-tenir-projection.spec.js`,
  `e2e/gl-marker-question.spec.js`, `e2e/gl-virtual-dice.spec.js`, `e2e/gl-game-flow.spec.js` ;
  `e2e/visit-mascot.spec.js` et `tests/visit-map-animations-css.test.js` si tu as touché un hook partagé avec la
  visite.
- Captures : trois images d'un jet de 4 sur la projection.
- Pas de relecteur de contenu : aucun texte ne change.

## 8. Contrats de test changés

- `useGLBoardMascotMotion` : deux paramètres de plus (`markers`, `boardMovement`) ; un changement de case de 1 à 12
  cases sur un chemin numéroté donne une suite d'étapes au lieu d'un placement direct.
- `useGLMarkerArrival` : un paramètre de plus (`boardMovement`) ; délai d'ouverture = nombre de sauts × `moveDelayMs`.
- Nouvelle constante exportée `GL_BOARD_HOP_MAX_CASES`.
- e2e passés en `expect.poll`, s'il y en a (liste dans le rapport).

## 9. Docs à mettre à jour dans ce lot

`docs/reference/gl/guide-du-mj.md` (une phrase, si le plateau y est décrit) ; `changelog.d/gl-decisions-ecrans-3.md` ;
un skill seulement si une phrase y devient fausse. Aucune règle ne change : rien pour le § 0 des règles.

**Ce que les lots suivants doivent savoir** (à écrire dans ton rapport) :

- Lot ecrans-4 : il mettra le paramètre d'activation de `useGLMarkerArrival` à faux en « Tenir » ; après lui, le délai
  d'ouverture de la fenêtre ne sert plus qu'aux anciennes parties classiques et au plateau du prof. Il ne doit pas
  toucher au calcul du délai.
- Lot ecrans-9 (figurines) : la marche case par case s'appliquera à la figurine et à son socle ensemble.

## 10. Hors périmètre

- Arc de saut, poussière, son, cadence réglable : hors chantier pour ce lot (les sons du tour sont au lot ecrans-11).
- Tout changement serveur (transmettre le trajet, journaliser les cases traversées).
- La carte du moment : elle n'attend pas les sauts.
- Le plateau découverte (`GLGuestDemoBoard`).
- La fermeture des fenêtres du plateau en « Tenir » : lot ecrans-4.
- Les figurines sur socle : lot ecrans-9.

## 11. Pour Oliv

**À relire** (choix de Claude, non validés) :

- 550 ms par case : un jet de 12 dure 6,6 s. À juger en classe, sur la projection.
- 12 cases au plus : au-delà, la mascotte se place d'un coup.
- Un recul se fait case par case, sans geste de joie à l'arrivée.
- La fenêtre d'une case posée sur le plateau attend la fin des sauts.

**À faire après la vague** : sur une partie de la classe de démonstration, en tablettes, projection ouverte : un jet,
et la mascotte saute de case en case sur la tablette et sur la projection.
