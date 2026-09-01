# Audit — homogénéité de l'interface : écrits, emojis sur les plans, densité (septembre 2026)

Déclencheur : « j'ai toujours des problèmes d'homogénéité des écrits et des emojis sur les
plans (déformation, différences de taille, interface parfois chargée…). Il faut une
interface claire, agréable et homogène. »

L'audit couvre les trois symptômes signalés et remonte à leurs mécanismes dans le code :

- **§1 — les écrits hétérogènes** : typographie, tokens, styles inline, boutons ;
- **§2 — les emojis sur les plans** : déformation, différences de taille, différences de
  fonte selon l'écran ;
- **§3 — l'interface chargée** : navigation, écran carte, modales, formulaires ;
- **§4 — plan d'amélioration priorisé** (lots A à D) ;
- **§5 — ce que les audits précédents ont déjà traité** (pour ne pas le réauditer).

> **Portée et méthode.** Lecture statique de `src/**` (448 fichiers `.jsx`, 19 fichiers
> `.css`, 18 764 lignes de CSS), des migrations et de `index.vite.html` / `gl.html`.
> Les chiffres sont des comptages réels sur le dépôt à la date de l'audit ; aucun rendu
> navigateur n'a été mesuré. Chaque constat porte ses références `fichier:ligne`.

Audits antérieurs sur des périmètres voisins, dont les acquis sont repris en §5 :
[`AUDIT_ICONES_FLOTTANTES_2026-08.md`](AUDIT_ICONES_FLOTTANTES_2026-08.md) (chevauchements
des commandes flottantes), [`AUDIT_UI_BOUTONS_GL_2026-08.md`](AUDIT_UI_BOUTONS_GL_2026-08.md)
(boutons GL), [`AUDIT_UX_ELEVE.md`](AUDIT_UX_ELEVE.md) (parcours élève).

---

## 1. Les écrits — pourquoi rien ne se ressemble tout à fait

### T1. L'échelle typographique existe, mais personne ne l'utilise

`src/index.css:68-70` définit trois tokens d'échelle (`--text-xs`, `--text-sm`,
`--text-base`). Ils sont utilisés **3 fois dans tout `src/`** (dont un alias interne,
`src/index.css:71, 2190, 2194`) — contre **879 déclarations de taille de police** écrites
en littéral, produisant **85 valeurs distinctes** (55 littérales numériques + 18
expressions `clamp()` uniques + variables).

Le cas le plus parlant : le « petit texte secondaire » est écrit de **14 façons** entre
0.68 et 0.88 rem (`0.68 / 0.7 / 0.72 / 0.73 / 0.74 / 0.75 / 0.76 / 0.78 / 0.8 / 0.82 /
0.83 / 0.84 / 0.85 / 0.86 / 0.875 / 0.88`). Individuellement, 0.82 vs 0.84 rem est
invisible ; côte à côte, ces écarts désalignent lignes de base et hauteurs de blocs entre
composants voisins — c'est une cause directe du « rien n'est vraiment aligné » ressenti.

Top des occurrences : `0.82rem` ×103, `0.78rem` ×83, `0.85rem` ×71, `0.72rem` ×57,
`0.8rem` ×56, `0.9rem` ×44… Répartition : 314 `font-size` dans `src/index.css`, 161 dans
`src/gl/styles/gl-theme.css`, 333 en `fontSize:` inline dans les `.jsx`.

### T2. Aucun token de graisse ni d'interligne

- Graisses : 6 valeurs en dur (`600` ×116, `700` ×96, `500`, `800`, `400`…), sans nom
  sémantique — 600 et 700 servent indifféremment le même rôle (titre de carte, label)
  selon le fichier.
- Interlignes : **18 valeurs distinctes** en CSS (`1`, `1.05`, `1.1`, `1.15`, `1.2`,
  `1.25`, `1.3`, `1.35`, `1.4`, `1.45`, `1.5`, `1.52`, `1.55`, `1.65`, `1.7`, `1.74`…).
  Le même paragraphe secondaire est tantôt en 1.4, 1.45, 1.5 ou 1.55.

### T3. Le gras est un faux gras : les graisses 700/800 ne sont pas chargées

`index.vite.html:36` ne charge DM Sans qu'en `300;400;500;600` (et Playfair en `500;700`).
Or le CSS demande `font-weight:700` **96 fois** et `800` **4 fois**. Le navigateur
synthétise donc un faux-bold (épaississement algorithmique), visuellement différent d'une
vraie graisse et différent d'un 600 réel — deux titres censés identiques ne le sont pas.

### T4. 1 114 styles inline court-circuitent toute feuille de style

**1 114 occurrences de `style={{`** sur **183 des 448 fichiers `.jsx`** (41 %), dont
**333 `fontSize:` inline** et **570 littéraux hex** de couleur (**158 couleurs
distinctes**). Six gris différents servent le même rôle de « texte secondaire » :
`#64748b` ×45, `#6b7280` ×40, `#555` ×13, `#666` ×12, `#999` ×7, `#888` ×6 — aucun ne
vient d'une variable. Exemples concentrés :

- `src/components/groups-views.jsx` (48 `style={{`, 16 `fontSize:` mêlant `.78` à `1rem`) ;
- `src/components/profiles/ProfilesRoleProgressionConfig.jsx` (5 tailles différentes,
  palette `#1e3a5f`/`#334155` hors tokens ForetMap) ;
- `src/components/map/mapModalShared.jsx:18-163` — fichier _partagé_ par plusieurs modales
  de carte : 10 `fontSize:` inline et **quatre gris différents** (`#999`, `#555`,
  `#64748b`, `#333`).

À spécificité maximale, ces styles ne sont corrigeables par aucune feuille sans
`!important` : tant qu'ils existent, aucune harmonisation CSS ne peut aboutir.

### T5. Cinq couches de style concurrentes, tokens dupliqués

1. Le monolithe `src/index.css` (8 273 lignes, 1 106 classes, 230 couleurs hex en dur) ;
2. 13 partiels `@import`és depuis `src/index.css:1-13` ;
3. 2 partiels importés à part par `src/main.jsx:2-3` (`tooltip.css`, `floating-dock.css`)
   → ordre de cascade différent ;
4. le thème GL (`gl-theme.css` 6 630 l., `gl-admin.css` 1 777 l.) — `gl-admin.css` est
   importé **au niveau composant** (`GLSettingsView.jsx:3` et 4 autres), donc sa position
   dans la cascade dépend de l'ordre de montage React ;
5. les 1 114 styles inline (T4).

Les piles de polices elles-mêmes sont **définies trois fois** : `src/index.css:39-40`,
`src/shared/styles/motion.css:12-16` (redéfinit `--font-emoji-stack` à l'identique),
`src/gl/styles/gl-base.css:122-131` (écrase `--font-sans` en Caudex, légitime pour GL,
mais redéfinit aussi les piles emoji).

### T6. Trois systèmes de boutons, plus 23 boutons ad hoc

46 sélecteurs « btn » répartis en trois familles de base non alignées :

| Famille       | Base                                                                                        | Petit bouton                                                             |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.btn`        | `13px 20px`, `min-height:44px`, sans `line-height`, DM Sans forcé (`src/index.css:141-174`) | `.btn-sm` : `0.85rem`, 38 px (`src/index.css:173`)                       |
| `.gl-btn`     | tokens `--gl-space-*`, `line-height:1.25`, `font-family:inherit` (`gl-theme.css:995-1022`)  | `.gl-btn--sm` : `0.875rem`, 36 px (`gl-theme.css:1114`)                  |
| `.shared-btn` | `8px 16px`, `line-height:1.25`, `font:inherit` (`shared-controls.css:28-53`)                | `.shared-btn--sm` : `0.875rem`, hauteur 44 px (`shared-controls.css:81`) |

Trois « petits boutons » de trois tailles, qui cohabitent dès qu'un composant
`src/shared/components/` est monté dans ForetMap. `.btn-sm` est en outre resurchargé
localement à **13 endroits** de `src/index.css` (1751, 2331-2333, 2421, 3870, 5321…). S'y
ajoutent 23 classes de boutons hors familles (`.nav-btn`, `.emoji-btn`,
`.map-toolbar-zoom-btn`, `.pedago-chip-btn`, `.visit-marker-btn`…).

### T7. Typographie en rem, boîtes en px : deux échelles désolidarisées

`font-size` est à 98 % en rem (498 déclarations rem contre 8 px) — bien. Mais
espacements, hauteurs et rayons sont à 79 % en px (3 949 px vs 995 rem). Si l'utilisateur
augmente la taille de police du navigateur, les textes grandissent mais pas leurs
conteneurs. Cinq `fontSize: 12` (nombre nu JSX → `12px`) échappent en plus totalement au
redimensionnement.

---

## 2. Les emojis sur les plans — les mécanismes de la déformation et des tailles

Rappel d'architecture : il n'y a **pas un moteur de carte mais quatre** — carte ForetMap
(HTML zoomé + SVG en pixels-image, `src/components/map-views.jsx:949-1091`), carte Visite
(SVG `viewBox 0 0 100 100` **étiré** par `preserveAspectRatio="none"`,
`src/components/visit/VisitZonesSvgLayer.jsx:81`), plateaux GL (image `object-fit:contain`
sans zoom, `src/gl/components/GLPctMapCanvas.jsx`), aperçus biodiversité
(`src/components/biodiv/BiodivLocationMaps.jsx:93-121`, étiré aussi). Un socle commun de
typographie d'overlay existe depuis le commit `8e420d9` (`src/shared/typographyTokens.js`,
`src/utils/mapOverlayTypography.js`), mais son adoption est incomplète — c'est le cœur du
problème.

### E1. `textLength` + `lengthAdjust="spacingAndGlyphs"` déforme les noms de zones

`src/components/map/ZonePolygonsLayer.jsx:136-137` (et son jumeau
`VisitZonesSvgLayer.jsx:143-144`) :

```jsx
textLength={compressLongName ? labelMaxWorldLength : undefined}
lengthAdjust={compressLongName ? 'spacingAndGlyphs' : undefined}
```

Dès qu'un nom dépasse **12 caractères** (`MAP_OVERLAY_LABEL_COMPRESS_CHARS`,
`typographyTokens.js:49`), sa largeur est **imposée** à 96 px écran (128 px tactile). En
SVG, `textLength` n'est pas un maximum : un nom de 13 caractères naturellement plus étroit
est **étiré** (glyphes élargis), un nom de 30 caractères est **écrasé**. Deux zones
voisines ont donc des glyphes de largeurs différentes — c'est le mécanisme le plus direct
des « écrits déformés sur les plans ». Et si un emoji est resté dans le nom (voir E5),
il est déformé avec.

### E2. SVG étiré non compensé : textes anamorphosés, cercles en ellipses, traits inégaux

La Visite compense correctement l'étirement de son viewBox pour les textes
(`visitZoneSvgTextUniformYTransform`, `src/utils/visitMascotGeometry.js:16-21`, appliqué
en `VisitZonesSvgLayer.jsx:88,121`). Mais **rien d'autre n'est compensé** :

- **GL feuillets** : `GLFeuilletZoneOverlay.jsx:73-80` rend numéros/titres de zones dans
  un SVG `preserveAspectRatio="none"` **sans transform correcteur**, avec
  `font-size: 2px` en dur (`gl-theme.css:6345-6349`). Les textes sont anamorphosés
  proportionnellement au ratio du plateau (aplatis sur un plateau large, étirés sur un
  plateau haut) et leur taille apparente varie avec ses dimensions.
- **Cercles** : `BiodivLocationMaps.jsx:113-119` (`r={2.4}`) et
  `GLFeuilletZoneOverlay.jsx:67-72` (`r="0.9"`) se rendent en **ellipses**.
- **Contours** : `.visit-zone-poly { stroke-width:.3 }` (`src/index.css:4445`),
  `.gl-feuillet-zone-polygon` (`gl-theme.css:6308`), `GLKingdomZoneMapOverlay.jsx:31`,
  `BiodivLocationMaps.jsx:108` — traits plus épais sur un axe que sur l'autre.
  **Aucune occurrence de `vector-effect: non-scaling-stroke` dans le dépôt.**

### E3. Emojis flous au zoom : rasterisés à ~5 px puis agrandis par le GPU

Sur la carte ForetMap, la taille des emojis est **divisée** par l'échelle du monde
(`mapOverlayTypography.js:104`, consommée en `map-views.jsx:1078`) pendant que le calque
est agrandi par `scale(s)` (`src/hooks/useMapGestures.js:105`). À zoom 4×, le navigateur
met en page l'emoji à ~4,75 px puis l'étire 4× : les emojis couleur (bitmaps CBDT de
Noto) sortent flous, bords écrasés. Le problème est partiellement connu du code — le
commentaire de `MapViewWorldLayer.jsx:10-13` documente le retrait de `will-change` pour la
même raison, mais ne traite que le cache de composition, pas la mise en page sous-pixel.

### E4. Trois régimes de zoom pour le même concept de « repère »

- Carte ForetMap : taille compensée → repère de taille **constante** à l'écran ;
- Visite : `resolveMapOverlayMarkerCssTypography()` force `worldScale:1, zoomRatio:1`
  (`mapOverlayTypography.js:131-135`) alors que les repères vivent **dans** le calque
  zoomé (`visit-views.jsx:1078-1097`) → les repères **doublent** à zoom 2× pendant que
  les noms de zones ne grandissent que de ×1,27 (`growth` 35 %) ;
- GL : pas de zoom, et `GLPctMapCanvas.jsx:32-34` ne transmet **ni** `isCoarsePointer`
  (donc pas le ×1,2 tactile de `typographyTokens.js:24`) **ni** `userTextSizePercent`.

S'y ajoutent : la préférence « taille du texte » (bouton Aa) réglable uniquement depuis la
carte ForetMap (`MapViewToolbar.jsx:429-431` ; la Visite la lit mais n'offre aucun
contrôle) ; des pastilles à taille **fixe** dans un calque zoomé (le rapport
pastille/emoji change continûment au zoom — `MapViewMarkerBubble.jsx:45-47`,
`.visit-marker-indicator` `src/index.css:4488`) ; deux tailles figées hors système
(`2px` `gl-theme.css:6346`, `16px` réseau trophique `src/index.css:7813`) ; et un
`Math.round()` appliqué **avant** la division par l'échelle avec des planchers séparés
emoji/libellé (`mapOverlayTypography.js:85-99`) → le ratio emoji/libellé change sur les
petits plans.

### E5. Le même emoji n'est pas rendu par la même fonte selon l'endroit

Trois asymétries se cumulent :

1. **L'ordre de la pile s'inverse selon la variable.** `--font-sans` place la police
   auto-hébergée `ForetMapColorEmoji` **en dernier** (`src/index.css:37`),
   `--font-emoji-stack` la place **en premier** (`src/index.css:39`). Or la pile emoji
   n'est ciblée que sur **17 sélecteurs** — les **995 emojis** répartis dans **209
   fichiers `.jsx`** (46,7 % des composants) passent donc majoritairement par
   `--font-sans`, où la police système gagne. Concrètement, sur un poste Windows :
   l'épingle d'un repère (pile emoji → Noto) et un emoji resté dans un nom de zone
   (pile sans → Segoe UI Emoji) affichent le même caractère avec deux dessins et deux
   chasses **sur le même plan**.
2. **L'emoji de zone n'existe pas en base** : c'est un préfixe du champ `zones.name`,
   ré-extrait à l'affichage (`detectLeadingMarkerEmoji`, `src/constants/emojis.js:158-178`)
   avec une détection exigeant une espace de séparation et l'appartenance à la liste
   configurée (`emojis.js:124-153`). Un `🌳Verger` sans espace n'est pas détecté :
   l'emoji reste dans le libellé, rendu en pile texte **et** soumis à la déformation E1.
   Dans la fiche zone, `ZoneInfoModalHeader.jsx:23` affiche le nom brut dans un `<h3>`
   qui hérite de **Playfair Display** (`src/index.css:95`) — même caractère, troisième
   fonte.
3. **FOUT côté ForetMap** : `gl.html:12-18` précharge la police emoji (5,5 Mo),
   `index.vite.html:34-38` **non**. Là où `ForetMapColorEmoji` est premier de pile, les
   emojis s'affichent d'abord en fonte système puis **basculent** vers Noto
   (`font-display: swap`, `src/index.css:15-21`, sans `unicode-range`) — saut de taille
   et de position visible sur les épingles. Enfin `font-variant-emoji: emoji` n'existe
   que côté GL (`gl-theme.css:1721,1734,1786`), et la réparation du sélecteur `U+FE0F`
   perdu (mojibake) n'a été faite que sur les tables GL
   (`migrations/141_gl_emoji_variation_selector_repair.sql`) — rien sur `zones.name`,
   `map_markers.emoji`, `location_categories.emoji`, `plants.emoji`.

### E6. Mélange emoji couleur / glyphes texte dans les mêmes barres

`src/components/map/MapViewToolbar.jsx` (le fichier le plus chargé : 35 emojis) mélange
dans la même rangée des emojis couleur (`🖐️`, `📍`, `✅`, `💾`) et des caractères
typographiques monochromes rendus par la police texte : `🗑` (U+1F5D1 **sans** VS16),
`☑`, `⬚` (U+2B1A), `⛶`, `＋` (U+FF0B), `✕` (`MapViewToolbar.jsx:174-441`). Métriques,
chasses et couleurs différentes → boutons de hauteurs de glyphe inégales sur la même
ligne. Divers : `✕` (39 occurrences) cohabite avec `×` (15) pour « fermer ».

### E7. Divers rendus incohérents du même libellé

Le halo des noms de zones est un `stroke` SVG (`paint-order:stroke`,
`src/index.css:2261-2264`) sur les zones mais un triple `text-shadow` sur la variante HTML
(`src/index.css:2265-2274`) ; `.visit-marker-label` écrase le `line-height:1` commun par
`1.15` (`src/index.css:4487`) ; quatre `font-family` différentes existent pour du texte de
carte, dont deux classes **sans aucune** déclaration (`.gl-feuillet-zone-label`,
`.pedago-foodweb-graph__node-emoji`). Les variables `--map-overlay-*` calculées pour la
carte ForetMap (`map-views.jsx:501-509,958`) ne sont consommées par **aucun** descendant —
les bulles reçoivent leurs tailles en styles inline : deux mécanismes parallèles pour le
même besoin. Enfin `clampEmojiInput()` coupe en unités UTF-16 (`emojis.js:181-183`) alors
que MySQL compte en caractères : une séquence ZWJ (`👩‍🏫`) peut être tronquée et se rendre
en deux glyphes.

---

## 3. L'interface chargée — où et pourquoi

### D1. Navigation : 13 et 17 onglets scrollables, jusqu'à 4 niveaux

- Élève : **13 entrées** dans la barre basse (`StudentBottomNav.jsx:43-106`) ; prof :
  **17 onglets** en haut (`TeacherTopTabs.jsx:44-126`). Les deux barres passent en
  défilement horizontal **sans indicateur visuel** (barres de scroll masquées,
  `src/index.css:492-514, 695-709`) — des onglets existent hors écran sans que rien ne le
  signale.
- Les libellés s'allongent dynamiquement (« ✅ Tâches (7 à valider) »,
  « Cartes & tâches · tuto » — `TeacherTopTabs.jsx:41-42`, `StudentBottomNav.jsx:48-67`)
  dans des barres déjà en `nowrap`.
- Quatre niveaux s'empilent : onglet → sous-onglet (4 barres de sous-onglets, dont
  Paramètres et Audit) → modale → **onglets de modale** (`LocationModalTabBar.jsx:19-53` :
  5 onglets à `0.8rem` sur la largeur d'une modale mobile).
- Deux conventions pour l'emoji d'onglet : slot `aria-hidden` séparé côté élève
  (`StudentBottomNav.jsx:12-27`), collé dans le texte (lu par les lecteurs d'écran) côté
  prof (`TeacherTopTabs.jsx:12-24`).
- **Bug avéré** : l'onglet `media_library` (`TeacherTopTabs.jsx:98-100`) est absent de
  `KNOWN_TAB_VALUES` (`src/constants/app-runtime.js:43-61`) → seul onglet prof jamais
  restauré au rechargement (`appShellHelpers.js:53` retombe sur `map`).

### D2. L'écran carte : 18 surfaces superposables, 20 boutons dans la barre

`MapView` (`map-views.jsx:676-1100`) rend jusqu'à **18 surfaces** (6 modales, barre
d'outils, bannière GPS, filtres + résultats, mascotte + bulle, bulles de repères, indices
haut **et** bas, toast, aide, nav basse, bandeau d'état). La barre d'outils seule
(`MapViewToolbar.jsx`, 500 lignes) porte **20 boutons**, jusqu'à 28 contrôles en mode
édition de sommets (2 sliders inclus). Deux cibles y sont **sous les 44 px** requis par
les conventions du projet : `.map-toolbar-mode-btn` `min-height:30px`
(`src/index.css:2153`) et `.map-toolbar-pill` 36 px (`:2159`) — dans la barre la plus
dense de l'application.

Collisions résiduelles en bas du canevas : `.map-canvas-hint--bottom` (`z-index:20`,
`src/index.css:2219-2231`), mascotte (`z-index:12`, positionnée en %,
`visit-map-mascot.css:23-24`) et bulle de repère ne se réservent aucun espace. En plein
écran, rien ne réserve d'espace entre `MapLocationFiltersBar` (toujours rendue,
`map-views.jsx:930-948`) et le bouton « Fermer » absolu en haut à droite
(`map-fullscreen.css:45-49`).

### D3. Le dock flottant partagé n'est pas utilisé côté ForetMap

Le correctif « les commandes flottantes ne se marchent plus dessus » (commit `82fc5a6`) a
produit `FloatingDock` + `floating-dock.css`. L'échelle de z-index commune
(`z-layers.css`, 17 paliers) est bien adoptée, mais le **dock lui-même n'a qu'un seul
point de rendu : GL** (`src/gl/AppGL.jsx:69,1114-1133` ; grep `fm-floating-dock` côté
ForetMap : 0 rendu). Le bandeau ForetMap recopie les variables à la main en
`.app-inline-toast` (`src/index.css:5257-5266`), avec un ancrage différent de `.toast`
(`toast-shell.css:8,65`) pour le même rôle — la garantie anti-chevauchement n'existe que
par duplication manuelle de constantes.

### D4. Modales : un shell commun, contourné aux endroits sensibles

`DialogShell` (portail, Escape, focus trap) est utilisé par 23 fichiers ForetMap — bien.
Mais :

- **1 câblage cassé** : `MapLocationFiltersBar.jsx:168-174` passe
  `className`/`panelClassName` à un shell qui n'accepte que
  `overlayClassName`/`dialogClassName` (`shared/components/DialogShell.jsx:20-21`). Les
  deux props sont ignorées : la feuille de filtres carte mobile **n'obtient jamais** son
  style bottom-sheet (`src/index.css:2946-2984`). Le jumeau `TaskFiltersBar.jsx:230-235`
  utilise les bons noms.
- **3 modales ad hoc** sans portail/focus/Escape : `MascotPackImagesPanel.jsx:513`,
  `MascotPackInteractionBulkDialog.jsx:68`, `notifications-center.jsx:117`.
- **54 dialogues natifs** cassent le thème : `confirm()` ×25, `alert()` ×21, `prompt()`
  ×8 — dont la **création d'objets métier au `prompt()`** (`visit-views.jsx:691,732`) et
  9 `alert()` dans `VisitEditorPanel.jsx`. Un `TaskConfirmDialog` stylé existe… utilisé
  une seule fois (`tasks-views.jsx:879`).
- **4 boutons `✕` muets** (sans `aria-label`) : `MarkerModal.jsx:193,244`,
  `ZoneDrawModal.jsx:71`, `ZoneInfoModal.jsx:266`.

### D5. Vocabulaire et glyphes d'action incohérents

- Valider : « Valider » ×11 / « Enregistrer » ×24 / « Sauvegarder » ×3 ;
- Supprimer : « Supprimer » ×68 / « Retirer » ×37 / « Effacer » ×10 / `🗑️` nu ;
- Fermer : `✕` ×39 / `×` ×15 / bouton texte « Fermer » ; feuilles jumelles de filtres avec
  actions primaires différentes (« Voir N tâches » vs « Appliquer ») ;
- `↩️` sert **deux actions différentes côte à côte** dans l'en-tête — « Revenir au rôle
  normal » et « Déconnexion » (`AppHeader.jsx:167-209`) ; « ↩ Annuler » et « ↩ Undo »
  (fr/en) coexistent **dans la même barre** (`MapViewToolbar.jsx:207,323`) ;
- même carte de tâche : cinq actions emoji-seules (`✏️ 📄 📦 🗑️`) sous cinq actions
  emoji + libellé (`TaskTileCard.jsx:403-726`), le même `✏️` étant tantôt nu tantôt
  libellé.

### D6. Formulaires et écrans admin sans replis

- « Paramètres généraux » (`settings-admin-views.jsx:525-953`) monte **simultanément** :
  gating (10 champs), grille de 9 sections / 90 clés, panneau mascotte, bloc
  cartes & plans (≈ 8 champs + panneau de calage GPS de 420 lignes **par carte**),
  catégories (9 champs), actions système, diagnostics. Aucun accordéon ; la recherche ne
  filtre que la grille générique (`settingsAdminSections.js:85-107`).
- `PlantEditForm.jsx` : **29 champs à plat** sous un seul `<h4>`, sans `<fieldset>`, avec
  une palette de **56 boutons emoji** avant le premier champ (102 boutons dans la palette
  des repères).
- 32 seuils de media queries distincts (380 → 1280 px, orthographes multiples) rendent le
  comportement responsive illisible ; **aucun projet Playwright mobile** (un seul projet
  Desktop Chrome, `playwright.config.js:58` ; l'écran carte n'a aucune spec mobile).

---

## 4. Plan d'amélioration priorisé

Ordre de traitement recommandé : chaque lot est livrable séparément et apporte un effet
visible. Les items marqués **[bug]** sont des corrections sans arbitrage produit.

### Lot A — corrections ciblées à fort effet visuel (petits diffs)

| #   | Action                                                                                                                                                                                                                                                                                                                                                                  | Traite |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | **Ne plus déformer les glyphes des noms de zones** : ne poser `textLength` que si le texte dépasse réellement la largeur cible (mesure `getComputedTextLength()` ou estimation), et préférer une réduction de `font-size` bornée + ellipse à `lengthAdjust="spacingAndGlyphs"` (au pire `lengthAdjust="spacing"`, qui n'écrase que les espacements, jamais les glyphes) | E1     |
| A2  | **Charger DM Sans 700** dans `index.vite.html` (et rabattre les 4 usages de 800 sur 700) — supprime le faux-gras                                                                                                                                                                                                                                                        | T3     |
| A3  | **Précharger la police emoji côté ForetMap** (copier le `<link rel="preload">` de `gl.html:12-18`) et **unifier l'ordre des piles** : `ForetMapColorEmoji` en premier partout où l'on veut un rendu identique inter-appareils, avec `unicode-range` sur le `@font-face` pour ne la télécharger qu'à l'usage                                                             | E5     |
| A4  | **Compenser l'anamorphose GL feuillets** (réutiliser `visitZoneSvgTextUniformYTransform`) et poser `vector-effect: non-scaling-stroke` sur tous les tracés des SVG étirés ; remplacer les `<circle>` par des cercles compensés                                                                                                                                          | E2     |
| A5  | **[bug]** Corriger les props de `MapLocationFiltersBar` (`overlayClassName`/`dialogClassName`) — la bottom-sheet mobile des filtres carte s'affichera enfin comme prévu                                                                                                                                                                                                 | D4     |
| A6  | **[bug]** Ajouter `media_library` à `KNOWN_TAB_VALUES`                                                                                                                                                                                                                                                                                                                  | D1     |
| A7  | **[a11y]** `aria-label="Fermer"` sur les 4 `✕` muets ; porter `.map-toolbar-mode-btn` et `.map-toolbar-pill` à ≥ 44 px de cible tactile                                                                                                                                                                                                                                 | D4, D2 |
| A8  | **Normaliser les caractères d'action** : `🗑` → `🗑️` (VS16), `×` → `✕` partout, remplacer `⬚ ☑ ＋ ⛶` par des équivalents cohérents (emoji VS16 ou petits SVG inline) ; poser `font-variant-emoji: emoji` sur les classes partagées d'overlay                                                                                                                             | E6     |
| A9  | Étendre la **réparation mojibake/VS16 aux tables ForetMap** (`zones.name`, `map_markers.emoji`, `location_categories.emoji`, `plants.emoji`) sur le modèle de `migrations/141_*`, et brancher `emojiMojibakeCore` sur le chemin de rendu zones/repères                                                                                                                  | E5     |

### Lot B — un seul système typographique

| #   | Action                                                                                                                                                                                                                                     | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| B1  | Étendre l'échelle de tokens : `--text-xs/sm/base/md/lg/xl/2xl` (7 crans suffisent pour 879 usages), `--fw-regular/medium/semibold/bold`, `--lh-tight/normal/relaxed` — définis une seule fois, consommés par GL via ses propres valeurs    | T1, T2 |
| B2  | **Migration mécanique** des littéraux vers les tokens (les 14 variantes de « petit texte » → 2 crans ; script de remplacement + revue visuelle par vue). Règle ESLint/Stylelint interdisant les nouveaux `font-size` littéraux hors tokens | T1     |
| B3  | Résorber les styles inline typo/couleur (333 `fontSize:`, 570 hex) au profit de classes utilitaires ; réduire les 6 gris « texte secondaire » à 2 tokens (`--ink-soft`, `--ink-faint`)                                                     | T4     |
| B4  | Fusionner les trois familles de boutons sur une seule base (garder `.btn` comme alias le temps de la migration) : mêmes hauteurs 44/36, même `line-height`, même petite taille ; résorber les 13 surcharges locales de `.btn-sm`           | T6     |
| B5  | Dédupliquer les piles de polices (une seule définition, `motion.css` et `gl-base.css` n'écrasant que ce qui diffère vraiment) ; importer `gl-admin.css` à un point fixe plutôt qu'au niveau composant                                      | T5     |

### Lot C — emojis homogènes sur les plans

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                          | Traite |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | **Un seul régime de zoom** : compenser les repères Visite comme ceux de la carte ForetMap (cesser de forcer `worldScale:1`), diviser aussi les pastilles fixes par l'échelle, et faire consommer les variables `--map-overlay-*` par les bulles ForetMap au lieu des styles inline                                                                                                                              | E4, E7 |
| C2  | Transmettre `isCoarsePointer` + `userTextSizePercent` à GL (`GLPctMapCanvas`) ; exposer le réglage « Aa » aussi sur la Visite (le hook existe déjà)                                                                                                                                                                                                                                                             | E4     |
| C3  | Rapatrier `2px` (GL feuillets) et `16px` (réseau trophique) dans `typographyTokens.js`                                                                                                                                                                                                                                                                                                                          | E4     |
| C4  | **Colonne `zones.emoji` dédiée** (migration + rétro-remplissage depuis le préfixe du nom) : plus d'extraction fragile, un rendu unique de l'emoji de zone sur le plan **et** dans les fiches (fini le Playfair Display sur emoji)                                                                                                                                                                               | E5     |
| C5  | Supprimer le saut au zoom (E3) : re-rendre la taille de police au palier de zoom stabilisé (comme aujourd'hui) mais en arrondissant **après** division et en appliquant le plancher au couple emoji+libellé, pas séparément                                                                                                                                                                                     | E3, E4 |
| C6  | Option de fond à trancher : réserver les **emojis au contenu métier** (zones, plantes, repères — choisis par les utilisateurs) et passer le **chrome d'interface** (onglets, actions, barres d'outils) sur un jeu d'icônes SVG cohérent (par ex. [lucide](https://github.com/lucide-icons/lucide), ISC) — supprime d'un coup les différences de fonte, de chasse et de couleur du chrome sur tous les appareils | E5, E6 |

### Lot D — désencombrer

| #   | Action                                                                                                                                                                                                                                                       | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| D1a | Rendre le débordement des barres d'onglets **visible** (dégradé de bord / chevrons) et raccourcir les libellés dynamiques (badge numérique plutôt que « (7 à valider) ») ; à terme, regrouper les 17 onglets prof (p. ex. Contenus / Suivi / Administration) | D1     |
| D1b | Généraliser `TaskConfirmDialog` : remplacer les 54 `confirm/alert/prompt` natifs (en commençant par les `prompt()` de création métier de la Visite)                                                                                                          | D4     |
| D1c | Harmoniser le vocabulaire : « Enregistrer » (persister) / « Valider » (workflow) / « Supprimer » ; un seul glyphe de fermeture ; une seule forme « icône + libellé » pour les actions de même rang                                                           | D5     |
| D1d | Replier les écrans admin (accordéons par section dans Paramètres, `<fieldset>` par thème dans `PlantEditForm`, palette emoji derrière un bouton « Choisir un emoji »)                                                                                        | D6     |
| D1e | Monter les alertes/bandeaux ForetMap dans `FloatingDock` (déjà testé par contrat) au lieu de dupliquer ses constantes dans `.app-inline-toast`                                                                                                               | D3     |
| D1f | Réduire les 32 seuils de media queries à 4-5 tokens de breakpoints documentés ; ajouter un projet Playwright mobile (390×844) couvrant l'écran carte et la nav basse                                                                                         | D6     |

### Ce que ça change, concrètement

- **Lot A seul** règle l'essentiel du « déformé » (A1, A4), du « pas net » (A2) et du
  « pas le même emoji ici et là » (A3, A8, A9) — sans refonte.
- **Lot B** est la condition pour que « tout se ressemble » durablement : tant que 879
  tailles littérales et 1 114 styles inline subsistent, chaque nouvel écran recrée de
  l'hétérogène.
- **Lot C** aligne les trois cartes sur un seul comportement.
- **Lot D** traite le « chargé » — c'est le seul lot qui demande des arbitrages produit
  (regroupement d'onglets, C6).

## 5. Déjà traité par les audits précédents (ne pas réauditer)

- **Chevauchements des commandes flottantes** : diagnostiqués et corrigés par
  `AUDIT_ICONES_FLOTTANTES_2026-08.md` (échelle `z-layers.css` + `FloatingDock`). Le
  présent audit ajoute seulement que le dock n'est pas encore adopté côté ForetMap (D3)
  et que 3 `z-index` en dur subsistent (`visit-map-mascot.css:5,24`,
  `src/index.css:2219`).
- **Boutons GL** (police, variantes écrasées, variables non définies) :
  `AUDIT_UI_BOUTONS_GL_2026-08.md`, corrigé. Le présent audit traite l'étage au-dessus :
  l'alignement **entre** les trois familles (T6).
- **Typo d'overlay carte** : les commits `8275b54` et `8e420d9` ont posé le socle
  (`typographyTokens.js`, `mapOverlayTypography.js`, classes partagées). Le présent audit
  documente ce qui reste hors du socle (E2, E4, E7).
- **Parcours élève** : `AUDIT_UX_ELEVE.md` (2026-03) reste valable pour les flux ;
  plusieurs de ses constats de navigation recoupent D1.

## 6. Suivi

| Lot | Statut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | **Traité** (même lot que l'audit) — A1 `fitOverlayLabelToWidth` remplace `textLength/spacingAndGlyphs` (réduction bornée puis « … », `<title>` avec le nom complet) ; A2 DM Sans 700 chargée, 4 usages de 800 rabattus sur 700 ; A3 preload + `unicode-range` + un seul ordre de pile (`ForetMapColorEmoji` avant les polices système, `--font-sans-with-emoji` devient un alias) ; A4 dé-anamorphose par `transform-box: fill-box` + `--map-fit-aspect` (feuillets GL, éditeur royaume, aperçus biodiv) et `vector-effect: non-scaling-stroke` sur tous les tracés étirés ; A5 props `DialogShell` corrigées (bottom-sheet filtres carte réparée et alignée sur la feuille tâches) ; A6 `media_library` restaurable ; A7 `aria-label` sur les 4 `✕` muets + cibles 44 px de la barre carte en tactile ; A8 `🗑️`/`☑️ ⬜`/`✕` normalisés, `font-variant-emoji` sur `.map-overlay-emoji-label` et `.emoji-btn` ; A9 migration `205_foretmap_emoji_variation_selector_repair.sql` + réparation mojibake branchée sur `detectLeadingMarkerEmoji`/`stripLeadingMarkerEmoji`, `clampEmojiInput` coupe en points de code. |
| B   | **Traité** — B1 échelle 8 crans (`--text-2xs…2xl`) + `--fw-*` / `--lh-*` / `--ink-*` définis par produit ; B2 migration mécanique des littéraux (500 `font-size` CSS + 335 inline → tokens ; 271 graisses ; 119 interlignes fusionnés sur 3 crans) — il ne reste que 2 tailles « display » en allowlist ; B3 les six gris inline convergent sur `--ink-soft`/`--ink-faint` ; B4 petits boutons alignés ; B5 piles dédupliquées. Garde-fou : `tests/typography-tokens-guard.test.js` (tout littéral réintroduit fait échouer la CI). Hors périmètre restant : couleurs hex du CSS (230) et le reliquat de styles inline non typographiques — améliorations continues, plus des lots.                                                                                                                                                                                                                                                                                                                                                                                                                                |     |
| C   | **Traité sauf C4** — C1 repères Visite compensés (`compensateWorldScale`, pastilles ÷ échelle via `--map-overlay-world-inv`) ; C2 GL reçoit `isCoarsePointer` + préférence « Aa », le réglage « Aa » est exposé sur la Visite ; C5 arrondi après division et plancher appliqué au couple (ratio conservé). **C4 traité** (lot suivant) : colonne `zones.emoji` (migration 206), API `POST/PUT` avec dérivation depuis le préfixe, affichage plan/fiche/filtres colonne d'abord — le nom garde son préfixe pour la compatibilité des autres affichages (le nettoyage des noms reste possible plus tard). **Reste** : le rattachement du `16px` du réseau trophique (C3 partiel : feuillets GL corrigés via A4).                                                                                                                                                                                                                                                                                                                                                                                                     |
| D   | **Arbitrages tranchés** (3 pôles + sous-nav ; icônes SVG lucide pour le chrome ; remplacement complet des dialogues natifs ; accordéons admin). **D-1 traité** : les 82 `window.confirm/alert/prompt` (recomptés — l'audit disait 54) migrés sur `AppDialogsProvider` (`useAppDialogs`), alerts → toasts, garde-fou `tests/native-dialogs-guard.test.js` ; vocabulaire unifié (Enregistrer, ↩ Annuler, 🚪 Déconnexion, `×`→`✕`, feuille de filtres carte alignée). **Restent** : D-2 icônes lucide, D-3 accordéons admin + dock + breakpoints + Playwright mobile, D-4 navigation en 3 pôles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
