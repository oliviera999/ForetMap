## Annexe A — Lot M : les mascottes sautent de case en case

Prompt du lot M (écrit le 23/11 sur `b8b5344`). Branche `claude/gl-decisions-lotm`, PR selon le § 01. Si `main`
a bougé depuis `b8b5344`, `git log b8b5344..origin/main -- src/gl/hooks src/gl/components/GLGameBoard.jsx src/shared/glBoardPathCore.js lib/glTour.js`
d'abord, et dis dans ton fichier de lot ce qui a changé.

### A1. Contexte

En mode « Tenir à deux », c'est le **serveur** qui déplace les équipes (`lib/glTour.js`) ; les écrans (tablette
d'équipe, projection, console) relisent l'état. Plateaux en `numbered_path` (vérifié en prod sur la partie 17).
Ce lot est un **correctif d'animation** : il ne change aucune règle, aucune route, aucun schéma, aucun réglage par
défaut, aucun texte visible des élèves, aucune CSS. **Décision d'Oliv (23/11)** : « Quand une mascotte se déplace,
je veux qu'elle saute de case en case. »

### A2. Constats vérifiés (v1.263.5)

| Où | Constat |
| --- | --- |
| `lib/glTour.js` › jet (≈ l. 1859-1945) | Le serveur calcule la case d'arrivée (`targetMarkerAfterDice`), écrit la position (`applyTeamMoveTx`) et journalise un événement `move` avec la seule case d'arrivée. Aucun trajet n'est transmis. Même chose pour la Cordée, l'avance libre, les sorts `move_delta`, le vent de la caravane, l'auto-déplacement d'une case. |
| `src/gl/hooks/useGLBoardMascotMotion.js` › effet `[teams, boardHeightPx]` | La nouvelle position est posée d'un coup : **une seule glissade de 550 ms en ligne droite**, même pour 6 cases, en coupant à travers le décor. |
| même fichier › `moveTeamAlongPath` | Le saut case par case existe déjà (une étape `moveTeamTo` par case, 550 ms chacune, chaîne annulable par `pathChainRef`). |
| Appelants de `moveTeamAlongPath` | Seulement `GLGameBoard` › `handleDiceRollResult` (dé du plateau, MJ en mode classique), `handleEffectAutoMove`, et `GLGuestDemoBoard` (plateau découverte). En « Tenir », le plateau en `presentation="tenir"` ou `"projection"` masque `GLBoardChrome` et les dés passent par `tourApi.lancer` → serveur → rechargement → glissade unique. **Aucun écran « Tenir » ne fait sauter la mascotte.** |
| même effet, bug latent | Une équipe en cours d'animation (`animatingRef`) est sautée par l'effet, qui ne se relance pas à la fin de la chaîne : une position serveur arrivée pendant un trajet reste perdue jusqu'au rechargement suivant. |
| `src/gl/hooks/useGLMarkerArrival.js` | Le popover de case s'ouvre `moveDelayMs` (= 550 ms) après le changement de case : avec des sauts, il s'ouvrirait avant l'arrivée. `schedulePresentOnArrival` accepte déjà `options.moveDelayMs`. |
| `src/shared/glBoardPathCore.js` | `sortMarkersByPath`, `teamPathIndex`, `markersAlongPathSteps` (avant et arrière) existent. |

### A3. Garde-fous

- Ce lot ne touche à aucun geste : il anime ce que le serveur a déjà décidé.
- **Aucun état d'attente sans sortie** : la carte du moment n'attend pas la fin des sauts ; seul le popover posé
  **sur le plateau** (`useGLMarkerArrival`) attend.
- `prefers-reduced-motion` : la mascotte se téléporte, comme aujourd'hui.
- Isolement G&L / ForêtMap : ne touche ni `useMascotTransientState` ni `usePctAnchorTransform` (partagés avec la
  visite). Si tu dois y toucher, teste la visite (`e2e/visit-mascot.spec.js`,
  `tests/visit-map-animations-css.test.js`).
- Surface « tableau » : le même hook sert tous les écrans.

### A4. Choix par défaut

| Cas | Comportement |
| --- | --- |
| Changement de case entre deux repères du chemin, tous deux connus, de 1 à 12 cases | **Saut case par case**, 550 ms par case (`MAP_VIEW_MASCOT_MOVE_MS`), vers l'avant ou **vers l'arrière** |
| Joie à l'arrivée (`triggerHappy`) | Seulement pour un déplacement vers l'avant |
| Plus de 12 cases, case absente du chemin, premier affichage, reconnexion, changement de chapitre, plateau hors `numbered_path`, position libre | Inchangé : placement direct ou glissade unique |
| Plusieurs équipes déplacées en même temps (Cordée) | Chaque équipe a sa chaîne, en parallèle |
| Déplacement déjà animé par le client (dé du MJ en classique, auto-déplacement) | Pas de second trajet quand le rechargement serveur arrive avec la même case |
| Plateau découverte (`GLGuestDemoBoard`) | Inchangé |
| Nouveau réglage, nouvelle CSS | Aucun (constante exportée `GL_BOARD_HOP_MAX_CASES = 12`) |

### A5. Étapes (un commit par étape)

**M1 — Planificateur pur `src/gl/utils/glBoardHops.js`**
- `export const GL_BOARD_HOP_MAX_CASES = 12;`
- `export function planBoardHops({ sortedMarkers, fromMarkerId, toMarkerId, maxCases = GL_BOARD_HOP_MAX_CASES })` :
  liste ordonnée des repères à franchir, **case de départ exclue, case d'arrivée incluse** ; vers l'arrière, dans
  l'ordre du recul ; `[]` si départ = arrivée ; `null` si l'un des deux est absent du chemin ou `null`, ou si
  l'écart dépasse `maxCases`. S'appuie sur `sortedMarkers` déjà triés par `sortMarkersByPath`.
- Tests `tests-ui/gl/glBoardHops.test.js` : avance de 1 et de 6, recul de 3, départ = arrivée, repère inconnu,
  `null` en entrée, 13 cases (→ `null`), 12 cases (→ 12 repères), case de départ (rang 0). Fonction pure.

**M2 — `useGLBoardMascotMotion` suit la case affichée et fait sauter**
- Nouveaux paramètres : `markers = []`, `boardMovement = null`. `sortedMarkers` mémoïsé par `sortMarkersByPath`.
- Ref `shownMarkerByTeamRef` (équipe → repère où la mascotte **est affichée**, ou `null`), mis à jour au placement
  direct, à chaque étape de `moveTeamAlongPath` (option `markerId` de `moveTeamTo` quand `arrival === 'marker'`),
  et par `moveTeamTo` sans repère (→ `null`). Ref `teamsRef` (dernière liste reçue).
- Fonction `syncTeam(team)`, utilisée par l'effet **et** par la fin de chaîne : (1) équipe en animation → rien ;
  (2) si `boardMovement?.isNumberedPath`, pas de mouvement réduit, case affichée connue, `team.position_marker_id`
  différent, et `planBoardHops(...)` non vide → `moveTeamAlongPath(id, plan, { triggerHappy: avance })` ;
  (3) sinon → comportement actuel.
- Fin de chaîne (`isLast`, résolution `true`) : retire l'équipe d'`animatingRef`, puis `syncTeam` sur la version de
  `teamsRef` (rattrape une position arrivée pendant le trajet). Pas de boucle.
- Nettoyage des nouveaux timers et chaînes au démontage. `GLGameBoard` passe `markers` et `boardMovement` au hook ;
  `GLGuestDemoBoard` peut ne rien passer.

**M3 — Le popover de case attend la fin des sauts**
- `useGLMarkerArrival.js` : paramètre `boardMovement` ; au changement de case de l'équipe suivie, `planBoardHops`
  de `prev` vers `markerId` ; délai = `plan?.length ? plan.length × moveDelayMs : moveDelayMs`, passé à
  `schedulePresentOnArrival(marker, teamId, { moveDelayMs: délai })`. Les appels de `GLGameBoard` qui attendent
  déjà la fin du trajet ne changent pas.

**M4 — Tests d'écran**
- `tests-ui/gl/useGLBoardMascotMotion.test.js` (minuteries simulées) : case 2 → 5 : repères 3, 4, 5 à 0, 550,
  1 100 ms, `walking` faux à 1 650 ms ; recul 6 → 3 sans joie ; 13 cases → placement direct ; mouvement réduit →
  placement direct ; premier rendu → placement direct ; position reçue pendant un trajet → rattrapée à la fin ;
  trajet lancé par `moveTeamAlongPath` puis rechargement avec la même case → aucune étape de plus ; plateau hors
  `numbered_path` → placement direct.
- `useGLMarkerArrival` : popover d'une case à question atteinte en 4 cases à 4 × 550 ms, pas avant.
- `tests-ui/gl/GLGameBoard*.test.jsx`, `GLBoardMascot.test.jsx` : verts sans changer leurs attentes ; sinon,
  explique. Si un e2e attendait la mascotte à destination 550 ms après un jet « Tenir », attends par sondage
  (`expect.poll`) et liste-le.

**M5 — Docs** : CHANGELOG (« Corrigé — G&L : les mascottes sautent de case en case » : tablette, projection,
console ; 12 cases au plus ; recul case par case ; mouvement réduit inchangé ; popover à l'arrivée) ;
`guide-du-mj.md` : une phrase là où le guide décrit le plateau, s'il le fait ; skills qui décrivent l'animation des
pions.

**Hors périmètre du lot M** : arc de saut, poussière, son, cadence réglable, changement serveur, carte du moment,
plateau découverte. Captures : trois images d'un jet de 4 sur la projection (`docs/captures/gl-decisions/lot-m/`).

---

