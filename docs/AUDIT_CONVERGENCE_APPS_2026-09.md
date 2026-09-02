# Audit — Convergence des applications (ForetMap, Visite, Gnomes & Licornes, Plan Lyautey) : existant, différences, meilleur de chacune et plan d'action final (septembre 2026)

> **Statut : audit et cadrage, sans aucune modification de code.** Relevé effectué sur la tête de
> `main` (`package.json` 1.142.0), par lecture exhaustive de `src/shared/**` (100 fichiers),
> `src/gl/**` (333), `src/components/**`, `lib/**` (278 fichiers, 53 141 lignes), `routes/**`
> (58 fichiers, 31 107 lignes), des tests et des documents d'orientation existants. La mesure
> textuelle est reproductible : `node scripts/audit-duplication-fm-gl.mjs --top 40` (27 paires
> front et 22 paires backend au-dessus du seuil ce jour). Chaque constat porte une référence
> `fichier:ligne`.
>
> **Objet.** Avant de construire le troisième produit Plan Lyautey
> (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md`), établir précisément ce que les applications du monorepo
> partagent, ce qui diverge sans raison, ce que chacune fait de mieux, et en déduire **un socle
> commun** et **un plan d'action unique** dont chaque lot profite à toutes les applications.
>
> **Ce document ne rouvre pas** ce que `docs/PARTAGE_FM_GL.md` a tranché (grille de décision §8,
> axe C « ce qu'on ne partage pas », lots A/B livrés) ni ce que `docs/AUDIT_CODE_2026-07.md` et
> `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md` ont déjà exécuté. Il s'y appuie et les complète sur ce
> qu'ils ne mesurent pas : la **direction** des dépendances, la couche **plateforme**, le kit
> d'**interface** et le moteur **carte**.

---

## 1. En une page

**La logique métier est factorisée ; la plateforme et l'interface ne le sont pas.** Le dépôt a
réussi le partage des noyaux (gating pédagogique : 1 122 lignes de noyau pur servant les deux
produits ; QCM ; commentaires contextuels ; visites guidées ; import tableur ; médiathèque
partitionnée par produit ; temps réel à rooms séparées dans un seul module ; pipeline JWT unique).
Ce qui reste écrit deux fois, ou une seule fois au mauvais endroit, relève de quatre familles :

1. **La couche plateforme n'est pas consciente des produits.** Le host `gl.` est en dur
   (`lib/productResolver.js:24`), l'index SPA GL en dur (`lib/spaFallback.js:15`), un seul service
   worker et un seul manifest pour tous les hosts (`public/sw.js`, `public/manifest.json`), deux
   registres de réglages de conception opposée (`lib/settings.js` déclaratif à 3 portées,
   `lib/glSettings.js` + validateurs dans une route), quatre implémentations de cache mémoire, le
   journal d'audit exporté par un **routeur** (`routes/audit.js:136-139`) et importé par 18
   fichiers, la garde d'accès par cookie signé enfouie dans `routes/visit.js:26-99`.
2. **Le kit d'interface est coupé en trois.** Trois systèmes de boutons (`.btn`, `.gl-btn`,
   `.shared-btn`), deux systèmes d'aide, deux centres de notifications, deux fiches de glossaire,
   un plein écran carte réécrit côté GL, 19 tokens typographiques recopiés à l'octet près
   (`src/gl/styles/gl-base.css:126-153`), le panneau de modale défini deux fois
   (`.log-modal` / `.fm-modal-panel`), une seule « feuille basse » sans glisser, sans crans et sans
   bouton retour, aucun mode sombre et pas même `color-scheme: light` côté ForetMap.
3. **Le moteur carte existe en quatre exemplaires** (carte de travail, Visite, plateaux GL,
   aperçus biodiversité) et aucun n'est complet : la carte de travail a les gestes mais pas de
   bornes, la Visite a les bornes mais pas de dézoom, GL n'a ni zoom ni pan.
4. **`src/shared/` n'est pas étanche.** Vingt dépendances remontent de `src/shared/` vers du code
   produit (dont un module « partagé » qui importe cinq modules GL et un autre qui importe les deux
   transports API), six noyaux vivent en double ESM/CJS sans script de synchronisation
   (≈ 1 090 lignes), sept modules GL-only sont rangés côté ForetMap, GL traverse l'arbre ForetMap
   pour atteindre des composants partagés, et un composant de glossaire lore n'échappe pas le HTML
   avant insertion (`src/gl/components/GLLoreGlossaryMarkdown.jsx:50-70`).

**Et chaque application a quelque chose que les autres n'ont pas.** ForetMap : le bouton retour
Android géré sur 16 surfaces, les dialogues applicatifs, le centre de notifications, les accordéons
admin, la recherche carte, les caches versionnés par écriture, le registre de réglages déclaratif.
GL : le thème de marque paramétrable à deux niveaux, le dock d'aide à contenu serveur et variante
par rôle, le bouton d'action carte unifié, la liste table/cartes responsive, la navigation basse
avec tiroir « Plus » en ARIA complet, le socket refcompté, les fixtures de test métier, la grille
d'espacement et les encres d'état. La Visite : la transformation bornée, le fit par
`ResizeObserver`, un rendu par geste, la file hors ligne, le cookie anonyme signé. **Plan Lyautey
n'apporte pas une cinquième carte : il apporte le troisième appelant** qui, selon la grille du
dépôt, autorise enfin à mutualiser ce qui n'avait que deux usages.

**Le plan d'action (§6) enchaîne dix lots** : garde-fous et hygiène (0), socle plateforme
multi-produit (1), noyau carte partagé (2), kit d'interface commun (3), shell Plan Lyautey (4),
désencombrement et lisibilité (5), position (6), convergence aide / thème / notifications (7),
parcours et hors ligne pour toutes les apps (8), contenu Lyautey (9). Chaque lot nomme les
applications qui en bénéficient ; aucun lot ne crée quelque chose dans `src/plan/` qui pourrait
vivre dans `src/shared/`.

### Chiffres qui comptent

| Mesure                                                               | Valeur                                               | Source |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| Modules `src/shared/` réellement consommés par les deux produits     | 43 sur 100                                           | §4.1   |
| Modules `src/shared/` consommés par un seul produit                  | 24 (11 ForetMap, 13 GL)                              | idem   |
| Dépendances inversées `src/shared/` → code produit                   | 20                                                   | §4.2   |
| Noyaux en double ESM / CJS sans synchronisation                      | 6 (≈ 1 090 lignes)                                   | §4.3   |
| Modules de fait partagés hors de `src/shared/`                       | 22 (dont `utils/markdown.js`, 421 l.)                | §4.2   |
| Modules `lib/` requis directement par des routes des deux produits   | 36                                                   | §4.6   |
| Tables réellement partagées entre produits                           | 6 (+ RBAC, audit, packs mascotte)                    | §4.6   |
| Tables miroir `x` ↔ `gl_x`                                           | 14 paires                                            | §4.6   |
| Systèmes de boutons / d'aide / de notifications / de fiche glossaire | 3 / 2 / 2 / 2                                        | §4.4   |
| Moteurs de carte                                                     | 4                                                    | §4.5   |
| Tests UI GL / e2e GL vs ForetMap                                     | 164 fichiers, 21 specs / — , 12 specs                | §4.6   |
| Composants partagés les plus consommés sans test direct              | `DialogShell` (33), `icons.jsx` (98), `Tooltip` (11) | §4.6   |

---

## 2. Les quatre surfaces en face à face

| Dimension             | ForetMap (élève / prof)                                                                            | Visite (invité)                                                                      | Gnomes & Licornes                                                                                 | Plan Lyautey (cible)                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Entrée / host         | `index.vite.html` → `src/main.jsx`, host par défaut                                                | même bundle, `UnauthenticatedShell` + `VisitView` lazy                               | `gl.html` → `src/gl/main.jsx`, host `gl.*`                                                        | `plan.html` → `src/plan/main.jsx`, host `planlyautey.*` |
| Auth                  | JWT `product` absent = foret, RBAC `users`/`user_roles`                                            | aucune ; cookie anonyme HMAC (`routes/visit.js:26-83`)                               | JWT `product:'gl'`, `gl_players`/`gl_admins`, droits recalculés à chaque requête                  | aucune ; garde d'accès optionnelle (cookie HMAC)        |
| Navigation            | 13 entrées basses (défilement horizontal) / 3 pôles prof                                           | bandeau + plan                                                                       | hub → sous-onglets, **barre basse 3 + tiroir « Plus »** en ARIA tab/tabpanel (`GLMobileNav.jsx`)  | carte plein écran, recherche, chips, feuille basse      |
| Carte                 | image + SVG pixels-image, `useMapGestures` 688 l., pas de bornes, pas de double-tap, pas d'inertie | SVG `viewBox 0 0 100 100` étiré, bornes [1, 8], `ResizeObserver`, un rendu par geste | `GLPctMapCanvas` 95 l., contain-fit, **clic seulement** (`useGlPctMapGestures` 24 l.)             | noyau partagé complet (§5.4)                            |
| Édition de polygones  | `useZoneEditPoints` 634 l. + `EditPointsLayer`                                                     | idem                                                                                 | `shared/pct-map/PctPolygonEditOverlay` (« inspiré de la carte tâches ForetMap »)                  | lecture seule                                           |
| Détail d'un lieu      | modale plein cadre 5 onglets (`ZoneInfoModal` 725 l.)                                              | panneau sous le plan (`VisitDetailPanel`)                                            | popovers portalisés, `themeStyle` relayé                                                          | feuille basse à trois crans                             |
| Plein écran           | `MapFullscreenShell` + `useMapFullscreen` (partagés)                                               | idem                                                                                 | **réécrit** (`GLGameBoard.jsx:123,321-340,706-708`)                                               | partagé                                                 |
| Aide                  | `HelpPanel` modale, contenu constantes locales + registre, métriques `useHelp`                     | astuce `content.help.visit_quick_tip`                                                | **`GLHelpDock` + `GLHelpDialog`**, contenu serveur, variante MJ, pulse jusqu'à première ouverture | dock d'aide partagé                                     |
| Notifications         | **centre complet** (catégories, rôle, dates relatives, diagnostic)                                 | —                                                                                    | `useGLNotificationCenter` minimal, stockage partagé                                               | aucune                                                  |
| Dialogues / toasts    | `AppDialogsProvider`, `TimedToast`, `AppStatusSticky`                                              | idem                                                                                 | `AppDialogsProvider`, `FixedToast` + timing maison (`useGlToasts.js:16-26`)                       | partagés                                                |
| Bouton retour Android | `overlayHistory` + garde file-picker, **16 surfaces**                                              | oui                                                                                  | **aucune** (0 usage hors composant partagé)                                                       | requis (feuille, recherche)                             |
| Thème                 | palette figée `:root`, aucun réglage couleur                                                       | idem                                                                                 | **marque paramétrable** (8 couleurs, polices, logo, favicon) ⊕ thème par chapitre                 | marque paramétrable (logo, couleurs de l'établissement) |
| Tokens                | typo, `--space-*` fluides, pas d'échelle d'espacement, pas d'encres d'état, pas de `color-scheme`  | idem                                                                                 | copie des tokens typo + `--gl-space-1..6`, `--gl-ink-*`, `color-scheme: light`                    | tokens partagés                                         |
| PWA                   | manifest + SW v8 manuel, invite d'installation, hint iOS                                           | SWR sur `/api/visit/content`                                                         | **aucun**                                                                                         | manifest + SW par produit                               |
| Réglages              | `app_settings`, registre déclaratif 350 clés, 3 portées, cache 15 s                                | idem                                                                                 | `gl_settings` plat, validateurs dans `routes/gl/admin.js:822-955`, 3 caches 30 s                  | `ui.plan.*` — dans un registre commun (§5.2)            |
| Temps réel            | `lib/realtime.js`, rooms par domaine + `map:<id>`                                                  | non                                                                                  | même module, rooms `gl:game`/`gl:class`, **client refcompté** (`glSocketClient.js`)               | non                                                     |
| Tests                 | 124 fichiers backend, fixtures d'auth seulement, 12 e2e, 1 e2e mobile                              | e2e partiel                                                                          | 104 backend + **`glFixtures.js`** métier, 164 UI, 21 e2e dont responsive                          | projet Playwright `mobile-chromium`                     |

---

## 3. Le meilleur de chacune

Ce paragraphe est la matière première du socle : chaque brique citée est **à généraliser**, pas
à réécrire.

### 3.1 ForetMap

- **Bouton retour et overlays** — `src/utils/overlayHistory.js` (pile `pushState`, dépilage au
  `popstate`, `abandonAllOverlays`) avec la **garde file-picker** (`:16-44`, absorbe les `popstate`
  parasites d'Android au retour caméra) et `useOverlayHistoryBack`. Seize surfaces l'utilisent ;
  GL aucune.
- **Dialogues applicatifs** — `src/shared/components/AppDialogsProvider.jsx` : promesses, file
  d'attente, repli natif hors provider. Déjà adopté par GL (18 fichiers). Modèle de convergence
  réussie.
- **Centre de notifications** — `src/components/notifications-center.jsx` : catégories,
  préférences par rôle, dates relatives, actions, bloc de diagnostic. Le stockage est déjà
  partagé (`shared/notifications/storage.js`), le composant non.
- **Accordéons admin mémorisés** — `shared/components/AdminSection.jsx`, `forceOpen` non
  persistant pendant une recherche. GL utilise `.gl-admin-section` en dur dans cinq panneaux.
- **Recherche et filtres de carte** — moteur pur `utils/mapLocationFilters.js` (NFD, tokens ET,
  tri fr), chips révocables, compteur `aria-live`, bascule inline / feuille basse.
- **Gestes de carte** — `hooks/useMapGestures.js` : pan sous rAF sans re-render, pinch, molette
  bornée, clavier, `visualViewport`, `will-change` retiré au repos pour re-pixelliser. Il manque
  bornes, double-tap, inertie ; le reste est le meilleur du dépôt.
- **Géolocalisation** — chaîne complète, auditée, sans envoi réseau (`docs/AUDIT_GEOLOCALISATION_2026-09.md`).
- **Caches versionnés par écriture** — `lib/visitContentCache.js` (clé = version d'écriture
  globale de `database.js`) et `lib/rbac.js:13-25` : l'invalidation ne peut pas être oubliée.
- **Registre de réglages déclaratif** — `lib/settings.js:42-395` : type, défaut, bornes, portée
  `public`/`teacher`/`admin`, validation croisée. C'est la forme cible pour tous les produits.
- **Convention zod « permissive »** — schémas de query en `.catch()` / `preprocess` pour ne jamais
  introduire un 400 nouveau ; commentaires identiques des deux côtés (`routes/audit.js:13-19`,
  `routes/gl/stats.js:14-20`). La convention la mieux tenue du dépôt.
- **Médiathèque partitionnée par produit** — `lib/mediaLibrary.js` : une seule médiathèque
  physique, étiquette `app` en paramètre. Le patron « produit en paramètre » réussi.
- **Temps réel product-aware dans un seul module** — `lib/realtime.js:211-265`.

### 3.2 Gnomes & Licornes

- **Thème de marque à deux niveaux** — `src/gl/hooks/useGLBrandTheme.js` (205 l.) : 8 couleurs
  validées par regex, polices Google injectées, logo et favicon restreints à `/uploads/` et
  `/maps/` (anti-exfiltration), objet `style` de 10 variables CSS appliqué inline et **relayé aux
  popovers portalisés** ; `mergeBrandWithChapterTheme` fusionne un thème sparse par chapitre.
  Éditeurs `GLBrandEditor`, `GLBrandColorEditor` (mode sparse, reset par couleur), `GLBrandHub`.
  ForetMap n'a aucun réglage de couleur.
- **Dock d'aide** — `GLHelpDock` (24 l.) + `GLHelpDialog` (126 l.) + `useGlHelpContent` (89 l.) :
  contenu chargé du serveur et éditable sans déploiement, variante par rôle
  (`shared/help/roleText.js`), pulse jusqu'à la première ouverture, tooltip, CTA visite guidée,
  `useGlHelpReady()` pour ne pas ancrer une bulle sur un bouton absent.
- **Bouton d'action carte unifié** — `GLBoardActionButton` (101 l.) : point de passage unique des
  commandes en icône seule, arbitrage `Tooltip` vs `title` centralisé, 44 px, rôles
  `primary`/`display`/`tool`, `labelShort`.
- **Liste responsive** — `ui/GLDataList.jsx` : même donnée en `<table>` sur bureau et en cartes
  sur mobile. Aucun équivalent ForetMap.
- **Kit de primitives** — `GLButton` (variantes, `loading`, `type="button"` par défaut,
  `:focus-visible` dédié), `GLField`, `GLInput`… ForetMap n'a pas de composant `Button`.
- **Navigation compacte** — barre basse à 3 entrées + tiroir « Plus » (`GLMobileNav.jsx`) en
  `role="tab"`/`aria-selected`/roving `tabIndex`, `useDialogA11y`, compteur d'overflow annoncé.
  Helpers de navigation **purs et testés** (`glAppShellHelpers.js`, 278 l.) filtrés par module ×
  rôle × réglage.
- **Modules produit** — `src/gl/constants/modules.js` : 16 drapeaux, normalisation stricte.
- **Socket refcompté** — `src/gl/realtime/glSocketClient.js` : un socket par jeton, rooms
  refcomptées (« jusqu'à 4 long-polls par onglet » auparavant). ForetMap n'a pas cette forme.
- **Ponts de tokens** — `gl-theme.css:78-95` re-mappe `--fm-modal-*`, `--learning-gating-*`,
  `--attention-pulse-*` sur les tokens GL au lieu de dupliquer les feuilles partagées. La bonne
  façon de rhabiller un composant commun.
- **Échelle d'espacement et encres d'état** — `--gl-space-1..6`, `--gl-ink-info/success/warning/danger`,
  `--gl-tap-target: 44px`, `color-scheme: light` justifié (`gl-theme.css:75-77`).
- **Cadres d'image contextuels** — `shared/image-frame/glImageFrameCore.js` + `GLImageFrameEditor` :
  ratio, fit, point focal, recadrage canvas réel, défauts par contexte. Le préfixe `gl` est
  trompeur, l'outil est générique.
- **Chemins numérotés** — `shared/glBoardPathCore.js` (déjà partagé, nom GL) : tri, numérotation
  avec offset, avance signée, cases traversées.
- **Fixtures de test métier** — `tests/helpers/glFixtures.js` (210 l., 57 fichiers) : admin,
  classe, joueur, chapitre, partie. ForetMap n'a que des fixtures d'authentification.
- **Adoption de zod et d'`asyncHandler`** légèrement supérieure (63 % des routes contre 58 %).

### 3.3 Visite

- **Transformation bornée** — `utils/visitMapTransform.js:24-34` (pur, sans React).
- **Fit par `ResizeObserver` + `computeMapImageContainRect`** et **un seul re-render par geste**
  (`hooks/useVisitMapTransform.js`, ref vive + style impératif).
- **Trois appels au chargement** (`useVisitContent.js:52-95`) contre sept domaines pour le shell
  ForetMap.
- **File hors ligne** — `utils/visitProgressClient.js` : compactage « dernier état par cible »,
  flush au retour réseau, bug de rebouclage corrigé et documenté. Modèle pour toute écriture
  différée.
- **Cookie anonyme signé** — `routes/visit.js:26-99` : HMAC-SHA256, `timingSafeEqual`, HttpOnly,
  SameSite, TTL, secret obligatoire en prod. ≈ 75 lignes correctes, prêtes à sortir de la route.
- **Blocs éditoriaux** — `VisitEditorialRenderer` + `normalizeEditorialBlocks`, repli généré si
  `body_json` absent.

### 3.4 Ce que Plan Lyautey apporte aux autres

Le noyau carte complet (bornes, double-tap, pinch + pan, inertie, regroupement des repères,
étiquettes au pôle d'inaccessibilité avec collisions, couche position), la **feuille basse à
crans**, le **registre de produits**, le service worker et le manifest **par produit**, la
**garde d'accès** extraite, le **compteur d'usage** product-aware, les **parcours**, et le premier
routeur écrit à 100 % sur la convention cible (`asyncHandler` + `validate` + handler central) —
détail dans `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §4, §5 et §8.

---

## 4. Ce qui diverge sans raison — doublons et dettes

Gravité pour la construction du socle : 🔴 bloque ou casse, 🟠 coûte à chaque évolution,
🟡 hygiène.

### 4.1 Inventaire de `src/shared/` : 43 partagés, 24 « de nom », 8 chaînés

| Catégorie                        | Fichiers                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consommés par ForetMap seul (11) | `icons.jsx` (98 consommateurs, **0 GL**), `TimedToast`, `AdminSection`, `AppInlineToast`, `MapFullscreenShell`, `useMapFullscreen`, `foodWebEdgeStyle`, `foodWebTypes`, `typographyTokens`, `validationUi`, `learningGatingState`                                                                                                                                                                 |
| Consommés par GL seul (13)       | `glBoardPathCore`, `glMarkerAppearanceCore`, `glMarkerBackgroundsCore`, `glMarkerEventConfigCore`, `image-frame/glImageFrameCore`, `glPackValidationUi`, `MascotPackSpriteCutPreview`, `MascotPackValidationList`, `pct-map/PctPolygonEditOverlay`, `pct-map/usePctPolygonEditSession`, `qcm/QcmPreviewModal`, `ScrollProgressBar`, `useMediaQuery`, `useScrollReveal`, `useStickyHeaderScrolled` |
| Le plus consommé des deux côtés  | `AppDialogsProvider` (27 + 18), `AutoSaveStatus` (5 + 22), `DialogShell` (21 + 12), `useDebouncedAutoSave` (5 + 16)                                                                                                                                                                                                                                                                               |

Aucun fichier mort. Le problème n'est pas le volume, c'est la **direction** des dépendances.

### 4.2 🔴 Dépendances inversées et rangement

- `src/shared/qcm/QcmPreviewModal.jsx:2-6` importe **cinq modules GL** (`glQcmDisplay`,
  `GLGlossaryMarkdown`, `GLLoreGlossaryMarkdown`, deux autolinks) et n'a aucun consommateur
  ForetMap : c'est un module GL déplacé prématurément.
- `src/shared/mascot-pack/MascotPackArchiveImportDialog.jsx:3-4` importe **`api.js` et
  `apiGL.js`** : viole l'invariant « transport injecté » de `PARTAGE_FM_GL.md` §7.4.
- `src/shared/components/MediaLibraryMenu.jsx:2-17` importe six modules ForetMap ;
  `MascotSpeaker.jsx:1,6` importe `VisitMascotFallbackSvg` (720 l.) ; `DialogShell`,
  `ImageLightbox`, `LearningQuizPopover`, `LearningAcknowledgeButton` importent
  `hooks/useDialogA11y`, `hooks/useOverlayHistoryBack`, `utils/body-scroll-lock` ;
  `useGuidedTour`, `useMapFullscreen`, `notifications/storage` importent `utils/browserStorage`.
- **Partagés de fait hors de `src/shared/`** (22) : `utils/markdown.js` (421 l., 6 GL + 7 FM — le
  rendu Markdown des deux produits), `services/apiTransport.js` (248), `hooks/useDialogA11y.js`,
  `utils/image.js`, `utils/visitMascotState.js`, `utils/mapViewMascotMotion.js`,
  `constants/app-runtime.js`, `utils/mapOverlayTypography.js`, `utils/appPublicSettings.js`, les
  trois utilitaires temps réel, `hooks/useIsCoarsePointer.js`, `ErrorBoundary.jsx`…
- **GL-only rangés côté ForetMap** (7) : `src/utils/glImageFrame.js` (10 consommateurs GL),
  `glGlossaryAutolink`, `glLoreGlossaryAutolink`, `glMascotCatalog`, `glMascotPack`,
  `glMascotPackToVisit`, `glTermAutolink`.
- **GL traverse l'arbre ForetMap** pour atteindre des partagés via des shims d'une ligne :
  `src/components/DialogShell.jsx` (12 imports GL), `src/components/MediaLibraryMenu.jsx` (6).
- `lib/shared/` mélange deux sémantiques : 14 fichiers « ForetMap ↔ GL » et 8 fichiers « front ↔
  back GL » (`questionQueryFactory`, `questionPoolFiltering`, les `gl*Core`).

### 4.3 🔴 Miroirs ESM / CJS sans synchronisation

Six noyaux existent en double, à la syntaxe de module près, **sans script ni test de
non-divergence** — alors que `sync:visit-pack-lib` et `sync:gl-pack-lib` existent pour les packs :

| Module                            | `src/shared` | `lib/shared` | Lignes de diff |
| --------------------------------- | ------------ | ------------ | -------------- |
| `glMarkerEventConfigCore.js`      | 444          | 446          | 7              |
| `glMarkerAppearanceCore.js`       | 206          | 208          | 10             |
| `image-frame/glImageFrameCore.js` | 141          | 149          | 22             |
| `emojiMojibakeCore.js`            | 57           | 63           | 24             |
| `glMarkerBackgroundsCore.js`      | 108          | 128          | 78             |
| `glBoardPathCore.js`              | 131          | 145          | 91             |

Les tests n'existent que côté CJS (`tests/gl-board-path-signed.test.js`, `tests/emoji-mojibake.test.js`,
`tests/gl-marker-effects.test.js`) : l'ESM peut diverger sans qu'un test échoue.

### 4.4 🟠 Le kit d'interface coupé en trois

| Sujet                 | ForetMap                                                                                                                                               | GL                                                                                      | Partagé                                                                            | Constat                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Boutons               | `.btn` (`index.css:170-188`), aucun composant                                                                                                          | `.gl-btn` + `GLButton.jsx` (26 l.)                                                      | `.shared-btn` — 4 consommateurs, médiathèque seule                                 | trois systèmes ; **le plus abouti est `GLButton`**                                                                         |
| Panneau de modale     | `.modal, .log-modal` (`index.css:1394-1453`)                                                                                                           | `.fm-modal-panel`                                                                       | `modal-shell.css:29-63`                                                            | **même bloc écrit deux fois**, media queries divergentes                                                                   |
| Tokens typographiques | `index.css:81-99`                                                                                                                                      | `gl-base.css:126-153` copie à l'octet                                                   | `typographyTokens.js` (JS, FM seul)                                                | 19 tokens recopiés ; seul `--font-sans` devait diverger                                                                    |
| Espacement / encres   | 4 `--space-*` fluides, pas d'encres d'état                                                                                                             | `--gl-space-1..6`, `--gl-ink-*`, `--gl-accent-*`                                        | —                                                                                  | ForetMap n'a ni l'un ni l'autre                                                                                            |
| `color-scheme`        | absent (contrôles natifs repeints en sombre par l'OS)                                                                                                  | `light` justifié (`gl-theme.css:75-77`)                                                 | —                                                                                  | ForetMap a le bug que GL a corrigé                                                                                         |
| Feuille basse         | `DialogShell` + 2 classes (`index.css:3055-3096`), sans drag, sans crans, **sans `useOverlayHistoryBack`** (`TaskFiltersBar`, `MapLocationFiltersBar`) | tiroir latéral `.gl-nav-drawer` avec verrou de scroll réécrit (`GLMobileNav.jsx:47-54`) | —                                                                                  | pas de composant `BottomSheet` ; le retour Android ferme la page                                                           |
| Hooks de panneau      | `useTaskFiltersPanel` / `useMapLocationFiltersPanel`                                                                                                   | —                                                                                       | —                                                                                  | ≈ 40 lignes identiques                                                                                                     |
| Aide                  | `HelpPanel` + `useHelp` (métriques)                                                                                                                    | `GLHelpDock` + `GLHelpDialog` + `useGlHelpContent` (serveur)                            | `help/roleText.js`                                                                 | interaction différente (tranché en axe C) mais **GL est le plus abouti** ; `GLHelpPanel.jsx:7-23` réécrit `browserStorage` |
| Notifications         | centre complet                                                                                                                                         | `GLNotificationsCenter` 62 l.                                                           | `notifications/storage.js`                                                         | le composant ForetMap doit remonter                                                                                        |
| Fiche glossaire       | `GlossaryPopover` 453 l. (contrôle d'origine `postMessage`, `lockBodyScroll`)                                                                          | `GLGlossaryPopover` 349 l.                                                              | `useDialogA11y`, `CLOSE_MS`, `NIVEAU_LABELS` identiques                            | fusion écartée (B5) ; **≈ 60 lignes de noyau** extractibles (`glossaryCardCore`)                                           |
| Toasts                | `TimedToast`                                                                                                                                           | `useGlToasts.js:16-26` réimplémente le timing                                           | `FixedToast`                                                                       | 10 lignes ; GL perd `role="status"`                                                                                        |
| Plein écran carte     | `MapFullscreenShell` + `useMapFullscreen` (`visualViewport`)                                                                                           | réécrit dans `GLGameBoard.jsx`                                                          | (dans `shared/`, non chargé par GL : `map-fullscreen.css` absent de `gl/main.jsx`) | duplication + incohérence de chargement                                                                                    |
| Icônes                | `shared/icons.jsx`, 98 consommateurs                                                                                                                   | **0** : emojis comme icônes                                                             | —                                                                                  | asymétrie                                                                                                                  |
| Badge de version      | `.app-version-badge` dans `index.css`                                                                                                                  | `GLAppVersionBadge.jsx:6` réutilise la classe **sans charger `index.css`**              | —                                                                                  | **bug visuel réel**                                                                                                        |
| Dates FR              | `utils/datetime-fr.js`                                                                                                                                 | 7 fichiers appellent `toLocaleDateString` en direct                                     | —                                                                                  | doublon diffus                                                                                                             |
| Bouton retour         | 16 surfaces                                                                                                                                            | 0                                                                                       | `useOverlayHistoryBack` importé par 1 composant partagé                            | asymétrie majeure sur mobile                                                                                               |
| Breakpoints           | liste canonique documentée (`index.css:32-39`) **mais 13 seuils hors liste**                                                                           | 4 seuils propres (640/641 cohabitent, `useGlCompactNav` bascule à 639)                  | 8 seuils                                                                           | aucun test ne garde la liste ; `zLayers.test.js:16` ne scanne pas `index.css`                                              |
| Sélecteurs d'emoji    | 3 composants                                                                                                                                           | aucun                                                                                   | —                                                                                  | asymétrie                                                                                                                  |

### 4.5 🟠 Quatre moteurs de carte

Voir `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §2.1 et §3 pour le détail ForetMap / Visite. Côté GL :
`GLPctMapCanvas.jsx` (95 l.) fait le contain-fit correctement (`useGlBoardImageFit` +
`--map-fit-aspect` pour dé-anamorphoser les SVG étirés — astuce à conserver) mais
`useGlPctMapGestures.js` (24 l.) n'expose que `toImagePct` : **ni zoom, ni pan, ni pinch**. Sur
un téléphone, un plateau chargé n'est pas explorable ; le plein écran ne fait qu'agrandir la
boîte. `GLMapView.jsx` (120 l.) est un pur tunnel de ~50 props vers `GLGameBoard` (767 l.).

### 4.6 🟠 Backend : plateforme non product-aware

| Sujet         | État                                                                                                                                                                                                                                                                                                                                                                     | Conséquence                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Produits      | `gl.` en dur (`productResolver.js:24`), `distGlIndex` en dur (`spaFallback.js:15`), `gl.html` absent de `NO_STORE_HTML_BASENAMES` (`staticCacheHeaders.js:5`), chemins d'auth du rate limiter en dur (`server.js:182-191`)                                                                                                                                               | un troisième produit empile des `if`                                                        |
| Réglages      | deux registres de conception opposée ; validateurs GL **dans une route** (`routes/gl/admin.js:822-955`, 133 l.) ; clé GL sans validateur persistée telle quelle (`:983`) ; `upsertGlSetting` n'invalide aucun cache (`glSettings.js:571`) ; **GL écrit dans `app_settings`** (`routes/gl/admin.js:991-1002`) ; `learningGatingRuntime.js:9-11` importe les deux magasins | ajouter `ui.plan.*` dans `lib/settings.js` reproduirait la dette                            |
| Caches        | 4 implémentations : `memoryTtlCache` (TTL), `settings` (TTL 15 s + `loadedAt = 0`), `glSettings` (3 caches, TTL 30 s, invalidation par l'appelant), `visitContentCache` et `rbac` (**version d'écriture**, invalidation automatique)                                                                                                                                     | deux stratégies excellentes cohabitent avec deux fragiles ; aucun cache n'est product-aware |
| Audit         | `logAudit`/`logSecurityEvent` exportés par **le routeur** `routes/audit.js:136-139`, importé par 18 fichiers dont `routes/gl/admin.js:5`, `routes/gl/auth.js:7` ; `resolveCanonicalActorId` ne canonise pas un acteur `gl_player`                                                                                                                                        | couplage route → route                                                                      |
| Garde d'accès | cookie HMAC complet dans `routes/visit.js:26-99` ; `visitCookieSecret()` **lève en prod si la variable manque** (`:33`)                                                                                                                                                                                                                                                  | à extraire ; comportement à rendre configurable par produit                                 |
| OAuth         | `lib/googleOAuthShared.js` (74 l.) n'est requis que par `routes/gl/auth.js` ; `routes/auth.js` (1 175 l.) réimplémente sa chaîne                                                                                                                                                                                                                                         | une correction de faille ne toucherait qu'un produit                                        |
| Erreurs       | `asyncHandler` à 0 % dans `routes/visit/mascot.js` (26 handlers), `admin-ops`, `health`, `gl/games/spell-casts`, `gl/forum` ; le handler central (`server.js:578`) **n'incrémente pas** `logMetrics.recordRouteError()`                                                                                                                                                  | les 500 passés par `asyncHandler` échappent aux métriques                                   |
| Nommage       | `lib/glGlossaryMatch.js`, `glQcmChoices.js`, `glQcmPresentationUse.js` consommés par `routes/quiz.js` (ForetMap)                                                                                                                                                                                                                                                         | piège de `grep`                                                                             |
| Identités     | `users` unifiée couvre élèves et enseignants ForetMap ; `gl_players`/`gl_admins` restent autonomes (`linked_foretmap_user_id` seul pont) ; `docs/USERS_MIGRATION.md` ignore GL                                                                                                                                                                                           | même personne, deux identités ; décision structurante (§6, lot 10)                          |
| Tests         | fixtures métier côté GL seulement ; e2e 21 GL / 12 ForetMap ; `DialogShell` (33 consommateurs), `Tooltip` (11), `icons.jsx` (98), `ImageLightbox` (7) **sans test direct** ; 14 feuilles `shared/styles/*` sur 15 sans contrat vérifié                                                                                                                                   | tout refactor du kit part sans filet                                                        |

### 4.7 🔴 Un écart de sécurité

`src/gl/components/GLLoreGlossaryMarkdown.jsx` n'a pas été migré au lot B5 : il recopie
`bindLoreClick` (`:8-19`), réécrit le `try/catch` de repli (`:35-39`), et son
`GLLoreGlossaryInlineText` (`:50-70`) **n'échappe pas le HTML source** avant insertion des liens,
contrairement à ses trois pendants (`renderPlainTextWithGlossaryLinks` échappe puis
`sanitizeRichHtml`). Par ailleurs `src/utils/glLoreGlossaryAutolink.js:30-39` parcourt le DOM
(`document.createElement`) là où les deux autres façades balayent une chaîne — non exécutable côté
serveur, non testable sans DOM. Correction courte, à faire en premier (lot 0).

### 4.8 Documents à corriger

`docs/PARTAGE_FM_GL.md` : la table §6 marque B1 « à faire » alors que §B1 dit « livré »
(`src/shared/richtext/richTextCore.js` existe) ; A2 marqué « à faire » alors que
`QuestionEditorPanel.jsx:3,71` consomme `useAdminCrud` ; A3, A4, B1 absents du récapitulatif §9 ;
« 23 modules » dans `lib/shared/` alors qu'il y en a 30. `docs/GL_ARCHITECTURE.md:33` présente
`reactionEmojiCore` comme socle des deux routeurs de commentaires alors qu'il n'est requis que par
`contextCommentsCore` et `routes/forum.js`. `docs/USERS_MIGRATION.md` est antérieur à GL et ne le
dit pas.

---

## 5. Architecture cible : le socle commun

### 5.1 Principes

1. **La grille de `PARTAGE_FM_GL.md` §8 reste la règle** : trois appelants (ou deux et un
   troisième certain), de la logique et non de la donnée, une poignée de paramètres, des tests
   avant. Plan Lyautey est le troisième appelant certain de la plupart des briques ci-dessous.
2. **`src/shared/` et `lib/shared/` n'importent jamais de code produit.** Une règle ESLint
   `no-restricted-imports` (motifs `../gl/`, `../components/`, `../services/api`, `../hooks/` depuis
   `src/shared/**`) passe en avertissement au lot 0, en erreur quand les vingt cas sont résorbés.
   `lib/shared/` se scinde en `lib/shared/` (ForetMap ↔ GL) et `lib/shared/gl/` (front ↔ back GL),
   ou adopte une convention de nommage documentée.
3. **Le produit est un paramètre, jamais une branche.** Le patron réussi de `lib/mediaLibrary.js`
   (`{ app }`), `lib/gatingPolicyRouteHelpers.js` (`{ table }`), `lib/realtime.js` (rooms par
   produit dans un module) et `gatingSettingsCore.js` (`fmKey`/`glKey`) s'étend à tout ce qui est
   product-aware : registre de produits, réglages, caches, garde d'accès, compteur d'usage, SW et
   manifest.
4. **Un composant partagé se thème par variables, jamais par copie.** Le pont de tokens de
   `gl-theme.css:78-95` devient la convention documentée ; les tokens communs (typographie,
   espacement, encres d'état, rayons, `color-scheme`) descendent dans `src/shared/styles/`.
5. **Un seul moteur de carte.** Toutes les surfaces (carte de travail, Visite, plateaux GL, aperçus
   biodiversité, plan) consomment `src/shared/pct-map/` ; chaque produit n'écrit que ses couches
   spécifiques (tâches, mascotte, feuillets).
6. **Le meilleur de chaque application remonte, l'autre l'adopte dans le lot suivant.** Pas de
   « composant partagé » qui reste consommé par un seul produit plus d'un lot.
7. **Toute brique partagée arrive avec son test et son garde-fou anti-retour** (patron
   `tests/shared-cores-fm-gl.test.js` : interdire de redéclarer une borne, un normaliseur, un
   palier).

### 5.2 Couches du socle

**Plateforme backend (`lib/`)**

| Module cible                                                              | Remplace / extrait                                                                                                                                                                                                                   | Appelants                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `lib/products.js`                                                         | `productResolver.js:11-25`, `spaFallback.js:8-18`, favicon et garde `/index.vite.html` de `server.js`, `staticCacheHeaders.js:5`, chemins d'auth du rate limiter, choix `/sw.js` et `/manifest.json`                                 | foret, gl, plan                         |
| `lib/shared/settingsRegistryCore.js`                                      | `SETTINGS_REGISTRY` + `castValue` (`lib/settings.js`), `SETTINGS_VALUE_VALIDATORS` (`routes/gl/admin.js:822-955`) ; descripteur `{type, default, bornes, scope, keys:{fm, gl, plan}}` sur le modèle exact de `gatingSettingsCore.js` | foret, gl, plan                         |
| `lib/shared/settingsStore.js`                                             | cache plat de `settings.js`, trois caches de `glSettings.js`, `upsertGlSetting` ; magasin paramétré `{table, columns}` + **cache versionné par écriture** (patron `visitContentCache`)                                               | foret, gl, plan                         |
| `lib/accessGate.js`                                                       | `routes/visit.js:26-99` (cookie HMAC, `timingSafeEqual`, TTL), secret par produit, essais limités par `lib/rateLimit.js`                                                                                                             | visite invitée, plan, partie GL invitée |
| `lib/auditLog.js`                                                         | `logAudit` / `logSecurityEvent` sortis de `routes/audit.js:36-135`, canonisation d'un acteur `gl_player`                                                                                                                             | 18 fichiers                             |
| `lib/usage.js` + table `usage_counters (day, product, event, key, count)` | nouveau ; première table conçue multi-produit                                                                                                                                                                                        | foret, gl, plan                         |
| `lib/visitContentCache.js` → `lib/shared/writeVersionCache.js`            | même fabrique, renommée ; sert `GET /api/plan/content` tel quel                                                                                                                                                                      | visit, plan, (settings)                 |
| Handler central `server.js:578`                                           | + `logMetrics.recordRouteError()` ; `routes/plan/*` écrit à 100 % en `asyncHandler` + `validate`                                                                                                                                     | référence pour combler §4.6             |

**Plateforme front (`src/shared/platform/`)**

`appBase`, `fetchJsonWithRetry`, `apiRetryGate`, `apiTransport` (promu), `browserStorage`
(promu), `overlayHistory` + `useOverlayHistoryBack` (promus, garde file-picker comprise),
`useDialogA11y` (promu), `body-scroll-lock` (promu), `markdown.js` (promu), `datetime-fr` (promu),
`registerServiceWorker(product)` (extrait de `src/main.jsx:19-61`), `useIsCoarsePointer`,
`useMediaQuery`, `usePrefersReducedMotion`, `useApiResource`, bus `appStatusEvents`.

**Kit d'interface (`src/shared/ui/` + `src/shared/styles/`)**

| Brique                                                                                    | Origine                                                                                                                                                                                                              | Adopté par                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Button`                                                                                  | `GLButton.jsx` (variantes, `loading`, focus visible) ; `.btn` et `.gl-btn` deviennent des alias thémés de `.shared-btn`                                                                                              | ForetMap (aucun composant aujourd'hui), plan                              |
| `BottomSheet`                                                                             | nouveau : crans (aperçu / mi-hauteur / plein), glisser, poignée, `useOverlayHistoryBack`, `lockBodyScroll`, `--safe-bottom`, `inert` derrière ; remplace `.task-filters-sheet` et le tiroir GL                       | ForetMap (filtres, fiche lieu mobile), GL (tiroir « Plus », fiches), plan |
| `useCompactPanelState`                                                                    | fusion de `useTaskFiltersPanel` / `useMapLocationFiltersPanel`                                                                                                                                                       | ForetMap, plan                                                            |
| `DialogShell`, `AppDialogsProvider`, `Tooltip`, `FloatingDock`, `AppStatusSticky`, toasts | existants ; `TimedToast` absorbe `useGlToasts` ; tests directs ajoutés                                                                                                                                               | tous                                                                      |
| `MapActionButton`                                                                         | `GLBoardActionButton.jsx`                                                                                                                                                                                            | carte ForetMap (barre de 20 boutons), plan                                |
| `DataList`                                                                                | `GLDataList.jsx` (table / cartes)                                                                                                                                                                                    | inventaire admin ForetMap, listes GL, plan                                |
| `AdminSection`                                                                            | ForetMap                                                                                                                                                                                                             | panneaux GL (`.gl-admin-section` ×5)                                      |
| `HelpDock` + `useHelpContent`                                                             | `GLHelpDock` + `GLHelpDialog` + `useGlHelpContent` ; contenu serveur par produit, variante par rôle, métriques de `useHelp` conservées                                                                               | ForetMap, plan                                                            |
| `NotificationCenter`                                                                      | `notifications-center.jsx` ForetMap, sur `notifications/storage.js`                                                                                                                                                  | GL                                                                        |
| `BrandTheme`                                                                              | `useGLBrandTheme` + `glBrandTheme` + `GLBrandColorEditor` ; réglage par produit (`ui.<product>.brand`)                                                                                                               | ForetMap (logo, couleurs), plan (établissement)                           |
| `ImageFrame`                                                                              | `image-frame/glImageFrameCore` + `GLImageFrameEditor`, renommés sans préfixe                                                                                                                                         | photos de lieux ForetMap, plan                                            |
| `glossaryCardCore`                                                                        | `GlossaryPopover.jsx:30-60` ↔ `GLGlossaryPopover.jsx:11-42`                                                                                                                                                          | les deux fiches, sans fusion                                              |
| Icônes                                                                                    | `shared/icons.jsx`                                                                                                                                                                                                   | GL (0 usage aujourd'hui)                                                  |
| Tokens                                                                                    | `typography-tokens.css` (19 tokens), `spacing-tokens.css` (`--space-1..6` depuis GL), `state-inks.css`, `--tap-target`, `color-scheme: light` déclaré par les deux produits ; palettes de marque restent par produit | tous                                                                      |
| Breakpoints                                                                               | liste canonique de `index.css:32-39` + `app-runtime.js`, gardée par un test ; GL rabat 640/641 sur 639/640                                                                                                           | tous                                                                      |

**Noyau carte (`src/shared/pct-map/`)**

| Brique                                              | Origine                                                                                                                                                                                                                      | Consommateurs                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `PctMapViewport`                                    | `useMapGestures.js` purifié (PUT marqueur sorti en callback), + bornes (`visitMapTransform.js`), double-tap, pinch + pan, inertie, fit `ResizeObserver` (Visite), `--map-fit-aspect` (GL), `will-change` au repos (ForetMap) | carte de travail, Visite, plateaux GL, aperçus biodiv, plan |
| `PctImageLayer`, `PctZonesLayer`, `PctMarkersLayer` | `MapViewBackgroundImage`, `ZonePolygonsLayer`, `MapViewMarkerBubble`, `VisitZonesSvgLayer`, `GLBoardMarkers` ; pastilles de tâches, feuillets et mascottes deviennent des **slots**                                          | idem                                                        |
| `PctPositionLayer`                                  | nouveau (point bleu, halo, cap) sur `useGeolocation` + `mapGeoTransform`                                                                                                                                                     | carte de travail (sans mascotte), Visite, plan              |
| `clusterMarkers`, `labelPlacement`                  | nouveaux, purs, testés (grille écran, pôle d'inaccessibilité, collisions, priorité par catégorie)                                                                                                                            | tous                                                        |
| `PctPolygonEditOverlay`, `usePctPolygonEditSession` | existants (GL) ; `useZoneEditPoints` (634 l.) et `EditPointsLayer` de ForetMap convergent dessus                                                                                                                             | ForetMap, GL                                                |
| `PctPathsLayer`                                     | lot 10 ; unifie `glBoardPathCore` (chemin numéroté) et le futur graphe de chemins                                                                                                                                            | GL, plan, ForetMap                                          |
| `MapFullscreenShell`                                | existant ; GL abandonne sa réécriture ; `map-fullscreen.css` chargé par les deux entrées                                                                                                                                     | tous                                                        |

**Par produit**

Un dossier par produit (`src/components|hooks|utils` pour ForetMap — à terme `src/foret/`,
`src/gl/`, `src/plan/`) ne contient que : le shell, les adaptateurs de transport (`api`, `apiGL`),
les catalogues métier, les couches de carte spécifiques et le CSS de marque. Les sept modules
GL-only de `src/utils/` rejoignent `src/gl/utils/`.

### 5.3 Garde-fous à poser en premier

- `scripts/sync-shared-cores.js` (modèle `sync-gl-pack-server-lib.js`) génère les six miroirs CJS
  depuis l'ESM, enchaîné par `build-safe.js` ; test de non-divergence.
- Règle ESLint `no-restricted-imports` sur `src/shared/**` (§5.1, point 2).
- `tests-ui/utils/zLayers.test.js:16` étendu à `src/index.css` ; test de la liste canonique de
  breakpoints ; test de présence des tokens communs dans les deux entrées.
- Tests directs de `DialogShell`, `Tooltip`, `ImageLightbox`, `icons.jsx`, des quatre `gl*Core`
  ESM.
- Test de montage du shell ForetMap (`tests-ui/AppShellWiring.test.jsx`) et de `VisitView`
  **avant** le lot 2 ; scénario e2e `mobile-chromium` carte avant et après.
- Fixtures métier ForetMap (`tests/helpers/fmFixtures.js` : carte, zone, repère, catégorie,
  plante, tâche) sur le modèle de `glFixtures.js`, prérequis des tests du lot 1 et de
  `routes/plan/*`.

---

## 6. Plan d'action final

Ce plan **remplace** le phasage du §6 de `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` (qui y renvoie) et
absorbe les candidats non livrés de `docs/PARTAGE_FM_GL.md` et de `docs/AUDIT_CODE_2026-07.md`
§5. Une PR par lot, tests avant, `CHANGELOG.md` et doc de référence dans le même lot, règle de
cohérence inter-PR du projet. Efforts indicatifs en jours de développement.

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Bénéficiaires                                      | Dépend de | Effort   | Risque |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- | -------- | ------ |
| 0   | **Garde-fous et hygiène.** Correctif `GLLoreGlossaryMarkdown` (échappement + migration B5) ; script de synchronisation des six miroirs + test ; `typography-tokens.css` ; extension de `zLayers.test.js` + test breakpoints ; tests `DialogShell`/`Tooltip`/`ImageLightbox` ; `GLAppVersionBadge` ; `apiTransport` → `shared` ; règle ESLint en avertissement ; `color-scheme: light` ForetMap ; corrections des trois documents (§4.8) ; renommage `lib/glGlossaryMatch` et consorts.                                                                                                                                                                                              | tous                                               | —         | 3 j      | faible |
| 1   | **Socle plateforme multi-produit.** `lib/products.js` et ses consommateurs (résolveur, fallback SPA, favicon, `no-store`, rate limiter, `/sw.js`, `/manifest.json`) ; gabarit de service worker + `scripts/build-pwa.js` (manifeste Vite) ; `lib/accessGate.js` extrait de `routes/visit.js` ; `lib/auditLog.js` ; `settingsRegistryCore` + `settingsStore` avec clés `ui.plan.*` et rapatriement des validateurs GL ; `usage_counters` + `POST /api/usage` ; `plan.html` coquille ; `FRONTEND_ORIGINS` ; fixtures ForetMap ; tests de routage à `serveDist: true`.                                                                                                                 | foret, gl, plan (chacun sa PWA)                    | 0         | 7 j      | moyen  |
| 2   | **Noyau carte partagé.** Tests de montage ; `PctMapViewport` (bornes, double-tap, pinch + pan, inertie, fit, `--map-fit-aspect`) ; couches image / zones / repères avec slots ; carte de travail, Visite **et plateaux GL** rebranchés (GL gagne pinch-zoom et `MapFullscreenShell`) ; bug `mapFocusLocation.js:9` ; rendu des repères filtré par carte ; e2e mobile verts sur les trois surfaces.                                                                                                                                                                                                                                                                                  | foret, visite, gl, plan                            | 0         | 6 j      | élevé  |
| 3   | **Kit d'interface commun.** Promotions dans `shared/platform/` (dialogA11y, overlayHistory, bodyScrollLock, browserStorage, markdown, datetime-fr) et suppression des shims ; `BottomSheet` à crans ; `useCompactPanelState` ; `Button` depuis `GLButton` + alias `.btn`/`.gl-btn` ; `MapActionButton` ; `DataList` ; `AdminSection` côté GL ; icônes côté GL ; `TimedToast` absorbe `useGlToasts` ; dédoublonnage `.log-modal`/`.fm-modal-panel` et `.role-preview-banner` ; `spacing-tokens.css`, `state-inks.css` ; sortie de `QcmPreviewModal` et injection du transport dans `MascotPackArchiveImportDialog` ; déménagement des sept modules GL-only ; règle ESLint en erreur. | foret, gl, plan                                    | 0         | 6 j      | moyen  |
| 4   | **Shell Plan Lyautey v1.** Carte plein écran, recherche (moteur partagé + alias + tri distance), chips-légende, liste de résultats, `BottomSheet` fiche à trois crans, lien profond `?lieu=`, « Y aller » en ligne droite, endpoint agrégé `GET /api/plan/content` sur `writeVersionCache`, visibilité par surface et `search_aliases` (migration), doc API, projet Playwright `plan-mobile`.                                                                                                                                                                                                                                                                                       | plan ; visibilité par surface pour foret et visite | 1, 2, 3   | 6 j      | moyen  |
| 5   | **Désencombrement et lisibilité.** `clusterMarkers` (grille écran, éventail ou liste), priorité par catégorie, étiquettes de repères au zoom, pôle d'inaccessibilité, collisions, halo, légende ; rapport de densité (script lecture seule) ; réglage `default_category_ids` par surface.                                                                                                                                                                                                                                                                                                                                                                                           | foret, visite, gl (plateaux denses), plan          | 2, 4      | 5 j      | moyen  |
| 6   | **Position.** `PctPositionLayer` (point bleu, halo, cap), « Me situer » à quatre états, mode boussole de « Y aller », toasts d'état repris de `MascotGpsStatusBanner`, hors plan au bord ; « Me suivre » ForetMap découplé de la mascotte ; e2e `setGeolocation`.                                                                                                                                                                                                                                                                                                                                                                                                                   | plan, foret, visite (guidage terrain)              | 2, 4      | 2 j      | faible |
| 7   | **Aide, thème, notifications convergés.** `HelpDock` + `useHelpContent` par produit (ForetMap passe au contenu serveur, `useHelp` garde ses métriques) ; `BrandTheme` par produit (ForetMap gagne logo et couleurs, plan reçoit l'identité de l'établissement) ; `NotificationCenter` côté GL ; `glossaryCardCore` ; `ImageFrame` renommé et éditeur exposé à ForetMap.                                                                                                                                                                                                                                                                                                             | foret, gl, plan                                    | 3         | 5 j      | moyen  |
| 8   | **Parcours, hors ligne, QR, accès.** Tables `map_routes` / `map_route_steps`, API, panneau admin ForetMap, mode « suivant » dans le plan, visite guidée ordonnée côté Visite, export PDF avec QR ; SW par produit branché sur le plan (image + JSON + parcours) et ForetMap (bundles hachés en cache-first) ; **PWA GL** (manifest, plateaux et lectures en SWR) ; garde d'accès activée sur le plan et proposée à la Visite invitée ; compteur d'usage branché sur les trois produits + écran admin « Usage ».                                                                                                                                                                     | plan, visite, foret, gl                            | 1, 4      | 6 j      | moyen  |
| 9   | **Contenu Lyautey** (hors développement). Fond de plan sans texte et sans capture Google (`AUDIT_PLAN_LYAUTEY` §8.2), catégories, alias, sous-titres, photos, calage GPS terrain, `docs/reference/plan/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | plan                                               | 4         | —        | —      |
| 10  | **Décisions structurantes ultérieures**, chacune sur son audit : identités unifiées (`users` couvrant GL, canonisation d'un acteur `gl_player`) ; chaîne OAuth partagée (`googleOAuthShared` promu, tests avant) ; graphe de chemins et vrai routage (`PctPathsLayer`) ; étages ; mode sombre (tokens prêts au lot 3, palettes à dessiner) ; scission `src/foret/`.                                                                                                                                                                                                                                                                                                                 | tous                                               | 1, 3, 6   | à cadrer | élevé  |

Ordre : 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, le lot 9 en parallèle dès le lot 4. Les lots 1, 2 et 3
sont indépendants entre eux et peuvent se chevaucher sur trois branches, à condition que chacun
soit livré seul. **Le lot 2 est le seul à risque élevé** : il ne démarre pas sans les tests de
montage et l'e2e mobile de référence, et il se livre sans aucun changement de comportement visible
autre que les quatre corrections nommées (bornes, double-tap, inertie, centrage des repères).

### 6.1 Ce que chaque lot rend possible

| Après le lot | ForetMap                                                                    | Visite                             | GL                                                               | Plan Lyautey                         |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| 0            | contrôles natifs corrects (`color-scheme`), échelle typo unique             | idem                               | glossaire lore sûr, badge de version visible                     | —                                    |
| 1            | SW généré (bundles hachés), réglages typés, audit hors routeur              | garde d'accès configurable         | **PWA installable**, réglages validés hors route                 | host qui répond, manifest propre     |
| 2            | plan qui ne sort plus de l'écran, double-tap, inertie, repères recadrés     | dézoom sous le cadre, mêmes gestes | **pinch-zoom sur les plateaux**, plein écran partagé             | noyau prêt                           |
| 3            | fiche de lieu en feuille basse sur mobile, `Button`, retour Android partout | idem                               | retour Android, icônes SVG, accordéons admin, listes responsives | kit prêt                             |
| 4            | visibilité par surface, alias de recherche                                  | textes publics partagés            | —                                                                | **v1 utilisable**                    |
| 5            | carte lisible avec beaucoup de repères, légende                             | idem                               | plateaux denses lisibles                                         | désencombrement                      |
| 6            | « Me suivre » sans mascotte                                                 | guidage sur le terrain             | —                                                                | point bleu, boussole                 |
| 7            | aide à contenu serveur, logo et couleurs paramétrables                      | idem                               | centre de notifications complet                                  | identité visuelle de l'établissement |
| 8            | feuilles de séance, hors ligne solide                                       | visite guidée ordonnée             | jeu consultable hors ligne                                       | parcours, QR, hors ligne, compteur   |

---

## 7. Ce que cet audit ne fait pas

- Aucune modification de code, de schéma ni de réglage. Aucune donnée de production consultée.
- Il ne rouvre pas les fusions écartées par `PARTAGE_FM_GL.md` (fiches et vues de glossaire,
  forum, stats, tutoriels, transports API, fabrique de routes CRUD, libellés d'auth) : la mesure du
  jour les confirme.
- Il ne tranche pas les décisions du lot 10 ; chacune mérite son propre audit court avant
  exécution.
