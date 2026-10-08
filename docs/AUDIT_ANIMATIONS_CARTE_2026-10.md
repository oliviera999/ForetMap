# Audit — animations des parcours et ouverture / fermeture des repères et zones (8 oct. 2026)

> **Instantané** (convention [`docs/audits/README.md`](audits/README.md)) : ne pas réécrire pour
> coller au code ultérieur. Un constat traité est marqué « Traité » sans effacer le constat
> d'origine.

**Périmètre.** Toutes les animations et tous les effets graphiques qui accompagnent :

- la **visualisation des parcours** : tracé, pastilles d'étapes, ligne « Y aller », caméra de
  parcours, position GPS, mascotte qui se déplace, progression (halo « à découvrir », anneaux) ;
- l'**ouverture et la fermeture des repères et des zones** : zoom sur le lieu (projecteur, emoji
  qui s'envole, étincelles GL), surbrillance, fiches, panneaux et popovers.

Surfaces : carte de travail ForetMap, Visite, Plan, plateaux GL (partie et démo invité).

**Méthode.** Lecture du code (CSS, hooks, composants), comparaison ForetMap / Plan / GL, revue
des tests existants. Pas de mesure en navigateur : les coûts de rendu sont **estimés** d'après
les propriétés animées.

## Statut

| Priorité | Constats | Traités dans ce lot | Traités au lot suivant |
| -------- | -------- | ------------------- | ---------------------- |
| P1       | 9        | 9                   | —                      |
| P2       | 9        | 0                   | 5                      |
| P3       | 7        | 0                   | 3                      |

Lot suivant (8 oct. 2026, « fermetures animées et durées partagées ») : ANIM-10, 11, 13, 14, 17,
19, 20, 23, plus deux améliorations hors constats (§ 5).

## 1. Verdict général

Le socle est sain :

- les trois surfaces ForetMap et GL partagent **un seul moteur** de zoom sur le lieu
  (`usePlaceFocusSequence` → `usePctMapViewport.flyToPctBounds` → `usePlaceFocusFx` →
  `PctPlaceFocusFx`) ; `useGLBoardFocus` n'en est qu'une enveloppe ;
- la caméra écrit `transform` directement en `requestAnimationFrame`, **sans rendu React par
  image**, et ne pose `will-change` que pendant le mouvement ;
- le mouvement réduit coupe le zoom et tous les effets du lieu (aucune annonce de vol, calque en
  `display: none`) ;
- les minuteries et boucles d'animation sont nettoyées au démontage ;
- un jeton de séquence rend caduque une ouverture en attente quand on clique ailleurs ou qu'on
  ferme.

Les défauts se concentrent sur deux bugs visuels, deux courses, des réglages ignorés et quelques
trous de mouvement réduit.

## 2. Inventaire

### 2.1 Tracé du parcours

| Effet                         | Technique                                           | Durée / courbe      | Mouvement réduit          | Coût estimé                   |
| ----------------------------- | --------------------------------------------------- | ------------------- | ------------------------- | ----------------------------- |
| Filet qui coule vers la cible | `stroke-dashoffset` (`fm-route-flow`)               | 900 ms, linéaire, ∞ | oui (CSS + réglage admin) | repeinte SVG continue, modéré |
| Pastille de l'étape courante  | `box-shadow` qui s'élargit (`fm-route-badge-pulse`) | 1,8 s, ease-out, ∞  | oui                       | repeinte continue             |
| Pastilles qui tournent        | transition `--pct-orient-transition`                | 180 ms, linéaire    | oui                       | compositeur                   |
| Contours, chevrons            | statiques, contre-échelonnés par `--pct-inv`        | —                   | —                         | —                             |

GL n'a pas de tracé de parcours (numéros de chemin statiques).

### 2.2 Caméra, orientation, position

| Effet                                | Technique                              | Durée / courbe                    | Mouvement réduit |
| ------------------------------------ | -------------------------------------- | --------------------------------- | ---------------- |
| Geste, retour en butée (`animateTo`) | rAF, `transform`                       | 200 ms / 160 ms, cubique sortie   | oui (durée 0)    |
| Zoom sur le lieu et retour           | rAF, `transform`                       | 350 ms (réglable), cubique in-out | oui (pas de vol) |
| Caméra de parcours, suivi GPS        | ressort amorti (`followPct`)           | constante de temps 380 ms         | oui (vue posée)  |
| Inertie                              | rAF                                    | —                                 | oui (coupée)     |
| Rotation de la carte                 | transition `transform`                 | 180 ms, linéaire                  | oui              |
| Point de position                    | transition **`left` / `top`**          | 90 ms, linéaire                   | oui              |
| Flèche de cap                        | transition `transform` + `drop-shadow` | 180 ms, linéaire                  | oui              |

### 2.3 Zoom sur le lieu (ouverture / fermeture)

| Effet                         | Phases                      | Durée / courbe                                | Propriétés         |
| ----------------------------- | --------------------------- | --------------------------------------------- | ------------------ |
| Projecteur (voile percé)      | zoom, fiche ouverte, retour | `--fx-ms` (350 ms) ; maintien à 0,6 en 400 ms | opacité            |
| Emoji qui s'envole / atterrit | zoom, retour                | `--fx-ms`, deux `cubic-bezier`                | transform, opacité |
| Étincelles (GL seulement)     | zoom                        | 700 ms, ease-out, décalages 0/40/80 ms        | transform, opacité |

Réglages : ForetMap (`lib/settings/placeFocus.js`) par surface, avec durée 150-800 ms et zoom
maximal 150-800 % ; GL (`lib/glSettings.js`) avec étincelles mais **sans zoom maximal**.

Séquence en Visite : déplacement de la mascotte (560 ms) → zoom (350 ms) → panneau (200 ms),
soit environ 1,1 s entre le clic et un panneau lisible.

### 2.4 Mascotte

| Effet                | Technique                             | Durée                      | Mouvement réduit                   |
| -------------------- | ------------------------------------- | -------------------------- | ---------------------------------- |
| Déplacement          | transition **`left` / `top`**         | 550 ms (CSS) / 560 ms (JS) | oui                                |
| Respiration au repos | `transform` (+ `drop-shadow` fixe)    | 2,4 s, ∞                   | oui                                |
| Marche, bras, jambes | `transform`                           | 0,36 s, ∞                  | oui                                |
| Joie                 | `transform`                           | 0,42 s × 3                 | oui (sauf déclenchement en Visite) |
| Bulle de dialogue    | `transform` + opacité                 | 0,22 s, ease-out           | —                                  |
| Spritesheet          | `steps()` sur `background-position-x` | selon le pack              | **non**                            |
| Rive                 | lecture automatique                   | selon le pack              | **non**                            |

### 2.5 Progression du parcours

| Effet                        | Technique                                 | Durée            | Remarque                    |
| ---------------------------- | ----------------------------------------- | ---------------- | --------------------------- |
| Halo « à découvrir »         | `drop-shadow` + `stroke-width` animés     | 2,6 s, une fois  | minuterie JS de 2 800 ms    |
| Mise en avant (Plan, e-nov)  | `stroke-width` en boucle sur zone filtrée | 2,4 s, ∞         | repeinte continue           |
| Anneau de progression Visite | `stroke-dashoffset`                       | 0,32 s           | —                           |
| Anneau de niveau GL          | `stroke-dashoffset`                       | 900 ms, ease-out | même technique, autre durée |

### 2.6 Fiches, panneaux, popovers

| Fiche                           | Entrée                          | Fermeture | Accessibilité                            |
| ------------------------------- | ------------------------------- | --------- | ---------------------------------------- |
| Carte de travail (zone, repère) | `popIn` 0,28 s + `fade-in`      | immédiate | Échap, piège et retour du focus          |
| Plan (feuille basse)            | 0,24 s ; crans par **`height`** | immédiate | Échap ; pas de focus initial (voulu)     |
| Visite (panneau)                | 0,2 s                           | immédiate | `aria-modal`, retour navigateur          |
| GL (popovers zone, QCM)         | `popIn` 0,24 s                  | immédiate | Échap seulement ; pas de focus ni retour |

## 3. Constats

### P1 — bugs et courses (traités dans ce lot)

**ANIM-01 — Bulle de la mascotte en miroir pendant son apparition.** Quand la mascotte regarde à
gauche, la bulle se redresse par `scaleX(var(--visit-mascot-dialog-x))`, mais le keyframe
`visitMascotDialogPop` réécrivait `transform` sans ce terme : le texte s'affichait à l'envers
pendant 220 ms. Visite et carte de travail.
**Traité** : le keyframe conserve le `scaleX` ; test `tests/visit-map-animations-css.test.js`.

**ANIM-02 — Le point GPS grossit avec le zoom sur la carte de travail et en Visite.** `index.css`
recopiait toutes les règles `.fm-pct-position*`, déjà importées depuis `pct-map-layers.css`,
mais sans le contre-échelonnement `scale(var(--pct-inv, 1))` du point. Arrivant plus tard dans
la feuille, la copie l'emportait.
**Traité** : copie supprimée ; test `tests/visit-map-animations-css.test.js`.

**ANIM-03 — Vue d'avant faussée après « fermer puis toucher un autre lieu » rapide.** `restore()`
oubliait la vue mémorisée avant la fin du retour animé ; un clic pendant ces 350 ms mémorisait
la vue à mi-chemin, et la fermeture suivante y revenait.
**Traité** : la vue en cours de restitution est reprise ; test
`tests-ui/shared/usePlaceFocusSequence.test.jsx`.

**ANIM-04 — Popover GL perdu quand deux arrivées se chevauchent.** Entrer dans une zone qui a à
la fois un contenu et un feuillet déclenche deux présentations ; la seconde rendait la première
caduque et sa promesse ne se résolvait jamais : le premier popover n'apparaissait pas.
**Traité** : une présentation remplacée s'affiche sans zoom (`onSuperseded`) ; test
`tests-ui/shared/usePlaceFocusSequence.test.jsx`.

**ANIM-05 — Projecteur à pleine opacité 700 ms sur ForetMap.** Le passage au maintien attendait
`max(durée, 700 ms)` pour laisser finir les étincelles, même quand elles sont désactivées
(toujours le cas sur ForetMap).
**Traité** : délai de 700 ms seulement avec étincelles ; test
`tests-ui/shared/PctPlaceFocusFx.test.jsx`.

**ANIM-06 — La ligne « Y aller » ignore le réglage admin d'animation des tracés.** Elle prenait
la valeur par défaut `animated = true`.
**Traité** : le réglage est transmis ; test `tests-ui/shared/PctRouteLayer.test.jsx`.

**ANIM-07 — Popovers GL animés malgré le mouvement réduit.** `popIn` n'avait aucune règle
`prefers-reduced-motion`.
**Traité** ; test `tests/visit-map-animations-css.test.js`.

**ANIM-08 — Mascotte spritesheet animée malgré le mouvement réduit**, alors que le rendu
`sprite_cut` se fige sur sa première image.
**Traité** : `@media (prefers-reduced-motion: reduce)` sur `.visit-map-mascot-spritesheet` ;
test `tests/visit-map-animations-css.test.js`.

**ANIM-09 — Minuterie du lien direct `?lieu=` du Plan jamais annulée.**
**Traité** : annulée dans le nettoyage de l'effet.

### P2 — coût de rendu, accessibilité, cohérence (ouverts)

- **ANIM-10** — Pastille d'étape : `box-shadow` animé en continu ; un pseudo-élément animé en
  `transform` / `opacity` donnerait le même effet sans repeinte.
  **Traité** : onde portée par `::after` (`transform` + `opacity`), coupée en mouvement réduit ;
  test `tests/visit-map-animations-css.test.js`.
- **ANIM-11** — Point GPS et mascotte animent `left` / `top` (mise en page à chaque image) ; le
  commentaire du point parle à tort du compositeur.
  **Traité** : hook partagé `usePctAnchorTransform` (mesure du conteneur par `ResizeObserver`,
  conversion % → px dans `translate(...)`, transition coupée une image au premier placement et
  au redimensionnement, repli `left` / `top` tant que rien n'est mesuré) pour le point GPS, la
  mascotte de Visite, de la carte de travail et du plateau GL ; le miroir `scaleX` reste sur
  l'enfant, la bulle n'est pas touchée ; commentaire corrigé. Les e2e lisent la position dans
  `data-pct-x` / `data-pct-y`. Tests `tests-ui/shared/usePctAnchorTransform.test.jsx`,
  `tests/visit-map-animations-css.test.js`.
- **ANIM-12** — Mise en avant e-nov : `stroke-width` en boucle sur un polygone filtré
  (`drop-shadow`), repeinte continue.
- **ANIM-13** — La fermeture des fiches n'est jamais animée (démontage immédiat), alors que la
  carte, elle, revient en douceur.
  **Traité** : hook `useExitAnimation` (fondu + léger rétrécissement de 150 ms en `ease-in`,
  démontage à la fin de l'animation ou par minuterie de secours, immédiat en mouvement réduit)
  sur les fiches de lieu (`LocationModalShell`), le panneau de Visite et les popovers GL de zone,
  de QCM et de dés ; Échap, pile des surcouches et retour du focus inchangés. Tests
  `tests-ui/shared/useExitAnimation.test.jsx`, `VisitDetailPanel.test.jsx`,
  `GLZoneContentPopover.test.jsx`, `tests/visit-map-animations-css.test.js`.
- **ANIM-14** — Popovers GL : ni focus initial, ni piège, ni retour du focus ; Échap passe par un
  écouteur `window` hors de la pile des surcouches.
  **Traité** : le lot « bouton Retour » n'avait ajouté que l'entrée d'historique ; les popovers
  de zone et de QCM passent par `useDialogA11y` (focus initial, piège, retour du focus, Échap par
  la pile) ; le popover de dés, non bloquant, n'en prend que l'Échap et l'historique, sans
  voler le focus. Test `tests-ui/gl/GLZoneContentPopover.test.jsx`.
- **ANIM-15** — Aucune annonce (`aria-live`) pendant le délai de 350 ms à 1,1 s entre le clic et
  l'ouverture de la fiche.
- **ANIM-16** — Rive ignore le mouvement réduit.
- **ANIM-17** — En Visite, la joie de la mascotte se déclenche en mouvement réduit (GL la bloque).
  **Traité** : `onMascotSeenCelebration` n'émet plus la joie en mouvement réduit (la bulle reste) ;
  test `tests-ui/hooks/useVisitMapMascotController.test.jsx`.
- **ANIM-18** — Le projecteur en maintien est invisible sous le panneau plein écran de la Visite
  sur mobile.

### P3 — dette et duplications (ouverts)

- **ANIM-19** — Durée du déplacement de la mascotte recopiée à quatre endroits (560 ms en JS et
  en e2e, 550 ms en CSS) ; constantes `HAPPY`, `DIALOG`, `COOLDOWN` redéfinies au lieu d'être
  importées ; seuils 15 / 9 / 4 en dur.
  **Traité** : constante unique `MAP_VIEW_MASCOT_MOVE_MS` = 550 ms (contrôleur de Visite, carte
  de travail, plateau GL, e2e via `e2e/fixtures/mascot-motion.fixture.js`), alignée sur la
  variable CSS ; `HAPPY` (= trois rebonds de 0,42 s), `DIALOG`, `COOLDOWN` et les seuils sont
  importés de `mapViewMascotMotion.js`. Test `tests/visit-map-animations-css.test.js`.
- **ANIM-20** — Les variables `--motion-*` de `motion.css` ne sont utilisées par aucune animation
  de carte ; nommage des keyframes hétérogène (camelCase et kebab-case).
  **Traité (durées)** : nouveaux jetons `--motion-exit`, `--motion-map-mascot-move`,
  `--motion-map-position`, `--motion-map-pulse`, `--motion-map-discover-halo`, `--ease-in`,
  `--ease-map-move`, utilisés par les animations de carte ; un test vérifie qu'ils égalent les
  constantes JS. Le nommage des keyframes existants n'a pas été renommé (risque sans gain).
- **ANIM-21** — Détection du mouvement réduit réimplémentée au moins cinq fois au lieu du hook
  partagé `usePrefersReducedMotion`.
- **ANIM-22** — `SharedMapStage` pose `translate3d(...)` en style React alors que le moteur écrit
  `translate(...)` : double écriture et alternance 3D / 2D possible à chaque rendu (à vérifier
  en navigateur).
- **ANIM-23** — Halo « à découvrir » : 2,6 s en CSS contre 2 800 ms de minuterie JS.
  **Traité** : `DISCOVER_HALO_MS` = 2 600 ms = `--motion-map-discover-halo` ; test
  `tests/visit-discover-halo.test.js`.
- **ANIM-24** — Écarts ForetMap / GL non documentés : 📍 par défaut pour un repère sans emoji
  côté ForetMap, aucun emoji côté GL ; pas de zoom maximal réglable côté GL ; booléen illisible
  lu « vrai » d'un côté, « faux » de l'autre.
- **ANIM-25** — Trous de tests : moteur de vue (`flyToPctBounds`, `restoreViewAnimated`,
  mouvement réduit), rendu des effets dans les cartes, aucun e2e sur `data-phase` ni en
  `reducedMotion: 'reduce'`.

## 4. Suite proposée

1. Lot coût de rendu : ANIM-10, ANIM-11, ANIM-12 (passer en `transform` / `opacity`).
2. Lot accessibilité : ANIM-14, ANIM-15, ANIM-16, ANIM-17.
3. Lot dette : ANIM-19 à ANIM-23, en centralisant durées et détection du mouvement réduit.
4. Filet e2e sur le zoom du lieu (phases, mouvement réduit) pour ANIM-25.

## 5. Améliorations hors constats (lot suivant, 8 oct. 2026)

- **Visite plus réactive** : quand le zoom sur le lieu est actif, il part en même temps que la
  marche de la mascotte au lieu de l'attendre ; la fiche s'ouvre environ 0,6 s après le clic
  (option `openSelectionInParallel` du contrôleur). Cela raccourcit aussi le délai muet de
  l'ANIM-15, qui reste ouvert faute d'annonce `aria-live`. La carte de travail garde
  l'enchaînement mascotte puis zoom. Test `tests-ui/hooks/useVisitMapMascotController.test.jsx`.
- **Repère ouvert mis en évidence** : `aria-current` sur le repère actif, pastille qui apparaît
  sous lui, autres repères estompés tant qu'un lieu est ouvert ; transition coupée en mouvement
  réduit. Tests `tests-ui/shared/PctMarkersLayer.test.jsx`, `tests/visit-map-animations-css.test.js`.
