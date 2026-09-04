# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

**ForetMap :** pendant le développement sur `main`, le champ **`version`** de **`package.json`** est incrémenté **à chaque lot livré** (`npm run bump:*`, voir [docs/VERSIONING.md](docs/VERSIONING.md) — *Lots livrés sur `main`*), tandis que **`[Non publié]`** ci-dessous accumule les notes jusqu’à une **release** formelle (section renommée en **`[X.Y.Z] - date`** + tag **`vX.Y.Z`**). Les sections **datées** plus bas conservent l’historique des releases passées.

## [Non publié]

### Correctif — reprise Socket.IO et compte révoqué

- **La reprise de session rejoue l'auth** : après une micro-coupure, Socket.IO
  restaurait rooms et droits en mémoire sans relire le compte. Un MJ ou un
  joueur désactivé (ou retiré de la partie) gardait le flux live jusqu'à 120 s.
  L'hydratation tourne maintenant à chaque reprise ; un refus d'abonnement
  quitte aussi la room restaurée.
- Tests : `tests/realtime.test.js`, `tests/gl-realtime.test.js`.

### Lot 8 — Parcours, hors ligne, QR, accès et compteur (plan de convergence §6)

- **Parcours de carte** (migration `210`, `map_routes` / `map_route_steps`, API
  `/api/map-routes`) : listes ordonnées de lieux, sans validation ni progression enregistrée.
  Les étapes pointent vers les lieux existants — aucun lieu n'est dupliqué. Publication par
  surface (plan, visite, carte), brouillon par défaut, étapes remplacées en bloc.
- **Mode parcours du plan** : puce « Parcours », étape courante en feuille basse avec
  « Précédent » / « Suivant », recadrage de la carte sur l'étape, « Y aller » qui vise l'étape,
  lien profond `?parcours=<slug>`. L'avancement vit sur l'appareil, rien n'est envoyé.
- **Export PDF avec QR code** (`GET /api/map-routes/:id/pdf`) : une page imprimable avec les
  étapes et un QR code vers le lien profond, à afficher à l'accueil. QR généré localement
  (`qrcode`, licence MIT — https://github.com/soldair/node-qrcode) : une affiche
  d'établissement ne doit dépendre d'aucun service tiers.
- **Accès du plan par code** (`ui.plan.access_mode = 'code'`) : `POST /api/plan/access` vérifie
  le code (bcrypt, limiteur d'authentification) et pose un cookie signé de 30 jours ; la charge
  publique répond 401 `access_required` sans laissez-passer, et un lien profond `?code=` ouvre
  le plan sans saisie. Composant partagé `AccessCodeGate`. Mode `code` sans code configuré : le
  plan reste ouvert plutôt que muré.
- **Hors ligne** : les service workers du **plan** (charge publique, réglages, parcours) et de
  **G&L** (contenus éditoriaux, chapitres) branchent enfin leurs lectures ; bandeau
  « Hors ligne — plan mémorisé » côté plan.
- **Compteur d'usage sur les trois produits** : envoi partagé (`src/shared/usage/reportUsage.js`),
  ouvertures et onglets côté ForetMap et G&L, parcours et hors ligne côté plan. Nouvel écran
  admin **« Usage »** (compteurs par produit et événement, et la liste des **recherches sans
  résultat** — les mots à ajouter en alias de recherche).
- **Éditeur de parcours** dans la console ForetMap (_Réglages → Parcours_) : liste des parcours
  d'une carte (brouillons compris), création et édition, choix des lieux par le **moteur de
  recherche partagé** du plan (alias compris), réordonnancement au **glisser-déposer** avec
  boutons ↑/↓ comme voie clavier, titre et texte propres par étape, publication et surfaces,
  suppression, et téléchargement de l'**affiche PDF**. Une étape dont le lieu a été supprimé est
  signalée au lieu de rendre une ligne vide.
- Nouveau réglage **`ui.plan.public_base_url`** : base des liens profonds imprimés. L'affiche est
  exportée depuis la console, servie par un autre domaine que le plan — sans ce réglage, le QR
  code renverrait le visiteur vers un écran de connexion. Ordre retenu : `?base_url=`, puis le
  réglage, puis l'hôte de la requête.
- Tests : `tests/map-routes.test.js` (dont l'export PDF, la publication sur le plan et la
  résolution de la base du lien), garde d'accès dans `tests/plan-content.test.js`,
  `tests-ui/plan/planRoutes.test.js`, mode parcours et écran de code dans le montage de
  `AppPlan`, `tests-ui/utils/mapRoutesEditor.test.js` et
  `tests-ui/components/settings/MapRoutesPanel.test.jsx` pour l'éditeur.

### Lot 7 — Aide, thème et notifications convergés (plan de convergence §6)

- **Dock d'aide partagé** (`src/shared/help/HelpDock.jsx`), généralisé depuis `GLHelpDialog` :
  bouton « ? » qui pulse jusqu'à la première ouverture, modale, rappel de la visite guidée,
  mémoire par clé. G&L le consomme sans changer une classe ni un comportement (ses classes
  de thème sont passées en `classNames`, comme pour `MapActionButton`), et le **Plan Lyautey
  gagne une aide** : chercher, filtrer, se déplacer, comprendre les pastilles de groupe, se
  situer.
- **Thème de marque par produit** (`src/shared/brand/`) : noyau pur extrait de
  `useGLBrandTheme` — huit couleurs validées, deux polices, logo et favicon, variables CSS
  préfixées par produit. Nouveaux réglages publics **`ui.foret.brand`** et **`ui.plan.brand`**
  (objets JSON) ; ForetMap et le plan peuvent désormais porter l'identité de l'établissement,
  et sans réglage leur apparence est **inchangée au pixel près**. Les URL de logo et de
  favicon restent bornées à `/uploads/` et `/maps/` (garde anti-exfiltration de G&L).
- **Centre de notifications** : noyau partagé (`notificationCenterCore.js`) — dates relatives
  en français, niveaux, regroupement par catégorie, comptage des non-lues. ForetMap y délègue
  ses helpers ; **G&L gagne** les dates lisibles, les niveaux et le regroupement, les groupes
  porteurs de non-lues en tête.
- **Fiche de glossaire** : noyau commun aux deux fiches (`glossaryCardCore.js`) — durée de
  fermeture, libellés de niveau, cache mémoire et accent de catégorie. Les deux composants
  restent distincts, chacun avec sa palette.
- **Éditeur de cadre d'image** promu dans le socle (`src/shared/image-frame/ImageFrameEditor.jsx`,
  avec son aide) : l'outil n'avait rien de propre au jeu et sert aux photos de lieux. Les
  anciens noms G&L restent en alias, classes CSS inchangées.
- Tests : `tests-ui/shared/HelpDock.test.jsx`, `brandThemeCore.test.js`,
  `notificationCenterCore.test.js`.

### Lot 6 — Position (plan de convergence §6)

- **Point de position partagé** (`src/shared/pct-map/useMapPosition.js` +
  `PctPositionLayer.jsx`) : point bleu, **halo de précision** proportionnel à la précision
  annoncée par le capteur, **cap** de l'appareil quand la boussole le donne (permission iOS
  demandée explicitement, absence gérée sans flèche). Hors du plan, le point se colle au bord
  le plus proche avec une flèche vers l'endroit réel plutôt que de disparaître.
- **Bouton « Me situer » à quatre états** : inactif, recherche, position affichée, suivi. Un
  déplacement manuel de la carte quitte le suivi sans éteindre la position.
- **« Y aller »** sur la fiche d'un lieu du plan : ligne droite entre la position et le lieu,
  avec la distance. Ce n'est pas un itinéraire, et l'interface le dit. Sans calage, le bouton
  reste désactivé avec la raison en clair.
- **Six messages d'état** (refus, calage incohérent, erreur d'acquisition, acquisition, hors
  plan, signal faible) repris de la bannière ForetMap, servis en **toast discret** sur le plan.
- **ForetMap : « Me suivre » découplé de la mascotte.** La carte de travail passe au noyau
  partagé et affiche le point de position même quand la mascotte est masquée ; la mascotte
  suit toujours quand elle est à l'écran. `useMascotGpsFollow` reste pour la mascotte seule.
- **Promotions dans le socle partagé** : `mapGeoTransform.js` devient
  `src/shared/pct-map/pctGeoTransform.js` et `useGeolocation` rejoint
  `src/shared/platform/` ; les anciens chemins ré-exportent, aucun importateur n'est cassé.
- Nouveau module pur `positionGeometry.js` (halo, position hors plan, distance et cap,
  lecture du cap de l'appareil, orientation du nord dans l'image) avec ses tests, et scénario
  Playwright `e2e/plan-mobile-position.spec.js` à position simulée.
- La position reste **100 % côté client** : elle n'est jamais envoyée au serveur.

### Lot 5 — Désencombrement et lisibilité (plan de convergence §6)

- **Regroupement des repères au dézoom** (`src/shared/pct-map/clusterMarkers.js`, grille écran
  d'une cible tactile) : les repères qui se chevauchent deviennent une **pastille chiffrée**
  (emoji du repère le plus prioritaire, couleur de sa catégorie). Un tap zoome sur l'enveloppe
  du groupe s'il se sépare ; sinon le **plan** ouvre la liste des lieux du groupe en feuille
  basse, et la **carte de travail** ouvre la fiche du repère principal. Actif sur le plan et
  sur la carte ForetMap, où un bouton de la barre d'outils le débraye (et où le mode édition
  le désactive toujours).
- **Priorité par catégorie** : `sort_order` sert de rang, sans nouveau champ à saisir — les
  catégories de tête sont nommées en premier et regroupées en dernier.
- **Catégories « visibles seulement au zoom »** (migration `209`, `location_categories.zoom_only`,
  case dans le panneau Catégories de lieux) : leurs lieux disparaissent tant que la carte est
  vue en entier.
- **Étiquettes de repères adaptatives** sur le plan : l'emoji seul au dézoom, le nom au zoom
  en commençant par les catégories prioritaires, toujours le nom du lieu sélectionné. Le nom
  **accessible** du bouton reste complet quand l'étiquette visible est masquée.
- **Étiquettes de zones au pôle d'inaccessibilité** (`pctPolylabel.js`, d'après *polylabel* de
  Mapbox, licence ISC) au lieu du centroïde : sur une zone en L ou en croissant, le nom
  tombait hors de sa zone. Appliqué à la carte de travail **et** à la Visite.
- **Priorité et collisions d'étiquettes** (`mapOverlayLabelCollision.js`) : module pur de
  placement glouton, épinglage du lieu sélectionné, estimation de boîte sans mesure DOM.
- **Légende** : chaque puce de catégorie du plan porte la pastille de couleur de sa catégorie
  — la couleur des contours n'était expliquée nulle part à l'écran.
- **Catégories par défaut par surface** : nouveaux réglages publics
  `ui.map.default_category_ids` et `ui.visit.default_category_ids`, à côté de
  `ui.plan.default_category_ids`.
- **Rapport de densité** (`scripts/report-marker-density.js`, lecture seule) : repères par
  catégorie, cellules du plan qui en contiennent plusieurs, paires de repères pratiquement
  superposées — pour régler les seuils sur les données réelles.
- Tests : `tests-ui/shared/clusterMarkers.test.js`, `pctPolylabel.test.js`,
  `mapOverlayLabelCollision.test.js`, scénario de groupe dans le montage `AppPlan`, et
  `tests/plan-content.test.js` pour `zoom_only`.

### Lot 4 — Plan Lyautey v1 (plan de convergence §6)

- **Surfaces d'affichage des lieux** (migration `208`) : un même lieu — zone ou repère — est
  montré, ou non, sur la carte de travail, la Visite et le **Plan Lyautey**, sans jamais être
  dupliqué. Réglage à deux niveaux : `surfaces` sur la **catégorie** (« Visible sur » dans le
  panneau Catégories de lieux — décocher une surface y retire d'un coup tous ses lieux) et
  `hidden_surfaces` sur le **lieu** (« Masquer sur » dans la fiche Modifier, avec avertissement
  quand tout est masqué). Un lieu sans catégorie reste visible partout où il n'est pas masqué.
  Lecture filtrée par **`?surface=`** sur `/api/zones`, `/api/map/markers` et
  `/api/map-categories` ; sans le paramètre, les réponses sont inchangées.
- **Alias de recherche** (`search_aliases`, zones et repères) : autres noms d'un lieu séparés
  par `;` (« CDI ; bibliothèque »), saisis dans la fiche Modifier, jamais affichés — ils ne
  servent qu'à retrouver le lieu.
- **Plan Lyautey (produit `plan`)** : coquille complète servie par host. Carte **plein écran**
  (moteur de carte partagé du lot 2 en mode scène : pan, pinch, double-tap, inertie, bornes),
  recherche en haut d'écran, puces de catégories (choix retenu sur l'appareil, défauts
  d'établissement), **feuilles basses** du kit d'interface pour les résultats et la fiche d'un
  lieu, message d'accueil affiché une fois, lien profond `?lieu=` (partage, QR code), mention
  de source du fond de plan. Sans compte, sans cookie, sans donnée d'élève : seuls les
  compteurs anonymes `open`, `place_open` et `search_empty` sont émis. Le bouton « Y aller »
  est présent mais **désactivé** — la position arrive au lot 6.
- **API publique du plan** : `GET /api/plan/content` (carte, réglages `ui.plan.*`, catégories,
  lieux visibles sur la surface `plan`, textes publics et photo de tête) et
  `GET /api/plan/settings`, mises en cache par la version d'écriture globale
  (`lib/shared/writeVersionCache.js`, mécanique désormais partagée avec `visitContentCache`)
  et servies avec `Cache-Control: public, max-age=60`.
- **Noyau carte partagé** : calques `PctImageLayer`, `PctZonesLayer`, `PctMarkersLayer` ;
  `parseZonePoints` promu dans `src/shared/pct-map/pctPolygon.js` (`parsePctPolygonPoints`),
  `src/utils/zoneGeometry.js` le ré-exporte sous son nom public.
- **Recherche de lieux partagée** (`src/shared/search/placeSearch.js`) : insensible à la casse
  et aux accents, tous les mots doivent correspondre, classement nom > alias > sous-titre >
  catégorie > texte libre.
- Tests : `tests/location-surfaces.test.js`, `tests/plan-content.test.js`,
  `tests-ui/plan/**` (dont le montage réel de `AppPlan`), `tests-ui/shared/PctLayers.test.jsx`,
  `tests-ui/shared/placeSearch.test.js`, `tests-ui/shared/SurfaceVisibilityField.test.jsx`, et
  un projet Playwright **`plan-mobile`** (390×844 tactile) avec `e2e/plan-mobile-shell.spec.js`.
- Documentation : nouvelle référence fonctionnelle
  [`docs/reference/plan/presentation.md`](docs/reference/plan/presentation.md), section
  « Où apparaît un lieu » dans `docs/reference/foretmap/carte-et-zones.md`, section
  **Plan Lyautey** et **Surfaces d'affichage des lieux** dans `docs/API.md`.

### Lot 3 — Kit d'interface commun (plan de convergence §6)

- **Plateforme front `src/shared/platform/`** : `useDialogA11y`, `overlayHistory` +
  `useOverlayHistoryBack`, `browserStorage`, `markdown`, `datetime-fr` promus (imports réécrits,
  anciens chemins supprimés, shim `services/apiTransport` retiré) ; nouveau `bodyScrollLock`
  (verrou à compteur + `useBodyScrollLock`) adopté par la visionneuse d'images et les popovers
  G&L. `src/shared` n'importe plus de code produit : la règle ESLint `no-restricted-imports`
  passe en **erreur** ; `MascotPackArchiveImportDialog` reçoit son transport en prop ; les
  modules G&L seuls de `src/utils/` (`glImageFrame`, `glMascotCatalog`, `glMascotPackToVisit`)
  rejoignent `src/gl/utils/`.
- **`BottomSheet`** (`src/shared/ui/`) : feuille basse à crans (aperçu / mi-hauteur / plein),
  poignée glissable (aimantation, fermeture par glisser bas), piège de focus, Échap, retour
  Android, verrou du défilement, `inert` sur le reste de la page, zone sûre basse. Adoptée par
  les **filtres des tâches**, les **filtres de la carte** (pied « Réinitialiser / Voir la
  carte ») et le tiroir « Plus » de la navigation G&L ; feuilles maison et CSS morts supprimés.
- **`useCompactPanelState`** : fusion des états de panneau compact tâches / carte (mêmes clés
  de stockage, mêmes défauts) ; les deux anciens hooks délèguent.
- **`Button`**, **`MapActionButton`**, **`DataList`** (`src/shared/ui/`) issus de `GLButton`,
  `GLBoardActionButton`, `GLDataList`, qui deviennent des enveloppes iso-thème (classes
  neutres `shared-btn…`, `fm-map-action…`, `fm-data-*` posées en plus des classes G&L) ; feuilles
  `map-action.css` et `data-list.css` chargées par les deux entrées. `.btn` (ForetMap) reste
  la classe de thème historique : l'adoption de `Button` côté ForetMap se fait écran par écran
  (lot 4 pour le plan).
- **Tokens communs** `spacing-tokens.css` (`--space-1..6`, `--tap-target`) et `state-inks.css`
  (`--ink-*`, `--accent-*`) — G&L les aliasse (`--gl-space-*`, `--gl-ink-*`…) ; garde
  `tests-ui/utils/sharedTokens.test.js`.
- **Dédoublonnage CSS** : bannière « aperçu rôle / impersonation » dans
  `shared/styles/role-preview-banner.css` (copiée jusqu'ici dans `index.css` et `gl-base.css`) ;
  `.modal` / `.log-modal` deviennent des alias du panneau partagé `.fm-modal-panel`.
- **`useTimedToastState`** partagé (`useGlToasts` s'y branche) ; icône SVG partagée sur le
  bouton Fermer du plateau G&L.
- Reporté au lot 7 (convergence des écrans d'administration) : accordéons `AdminSection` sur les
  panneaux d'administration G&L.

### Lot 2 — Noyau carte partagé (plan de convergence §6)

- **Un seul moteur de carte** `src/shared/pct-map/` : géométrie pure `pctMapTransform.js`
  (bornes « contain », élasticité, zoom à pivot, pinch à médian vivant, centrage, inertie) et
  hook `usePctMapViewport.js` (modes image / scène, pan avec capture, molette, pinch +
  déplacement, double-tap, inertie, retour en butée, flèches clavier, verrou tactile, mesure
  `ResizeObserver`, glisser externe sans réseau). Molette (`pctMapWheelZoom`) et rectangle
  « contain » (`pctMapFit`) promus dans `src/shared` (anciens chemins ré-exportés).
- **Carte de travail** : `useMapGestures` devient un adaptateur mince (mesure du cadre,
  `--fm-map-canvas-w`, persistance du repère glissé). Visible : le plan **ne sort plus du
  cadre** (butée souple), **double-tap** tactile, **inertie** au relâchement, pinch qui déplace
  en même temps qu'il zoome ; le verrou « Gestes » sur téléphone se relâche dès que la carte
  est zoomée par rapport à son ajustement (et non plus au-delà de la taille naturelle de
  l'image). Corrections : les repères des autres cartes n'étaient pas filtrés à l'affichage ;
  le centrage sur un repère depuis la recherche lisait `yp` au lieu de `y_pct` (toujours en
  haut du plan).
- **Visite** : scène rebranchée sur le moteur en mode scène ; bornes inchangées à l'échelle
  ≥ 1, **dézoom possible jusqu'à 0,5×**, mêmes gestes ; le glisser peut démarrer sur une zone
  ou un repère (le clic qui suit n'est pas pris pour un tap). `useVisitMapTransform` et
  `visitMapTransform.js` supprimés.
- **Gnomes & Licornes** : `useGlPctMapGestures` sur le moteur — les plateaux gagnent **pan,
  molette, pinch-zoom, double-tap**, des boutons **+ / − / ⊡** (`GLPctMapCanvas`,
  `showZoomControls`) ; le **plein écran** passe par `MapFullscreenShell` / `useMapFullscreen`
  partagés (`map-fullscreen.css` chargé par l'entrée GL, testids e2e conservés) ; gestes
  suspendus pendant l'édition d'un plateau. `useGlBoardImageFit` supprimé. Correction : des
  défauts de props tableau (`[]`) recréés à chaque rendu faisaient boucler `GLGameBoard` dès
  qu'un état changeait après le montage.
- **Tests de montage** (posés avant les refontes) : `MapViewMount`, `VisitViewMount`,
  `GLGameBoardMount` sur le moteur réel ; tests du noyau (`pctMapTransform`,
  `usePctMapViewport`) ; docs de référence carte, visite et plateau mises à jour.

### Lot 1 — Socle plateforme multi-produit (plan de convergence §6)

- **Registre des produits** `lib/products.js` (`foret`, `gl`, `plan` — Plan Lyautey, host
  `planlyautey.*`) : préfixes de host, entrée HTML, dossier d'assets, préfixe d'API, chemins
  d'authentification, fichiers PWA. Le résolveur de produit, le fallback SPA (entrée du
  produit si présente dans `dist/`, sinon ForetMap), les en-têtes `no-store`, le favicon, la
  garde qui redirige l'entrée HTML d'un produit demandée sur le host d'un autre et le
  limiteur d'authentification lisent ce registre — plus aucun `gl` en dur.
- **Entrée Plan Lyautey** : `plan.html` → `src/plan/` (coquille « le plan arrive bientôt »),
  assets `public/plan/`, métas de partage par entrée dans `vite.config.js`.
- **Service worker et manifest PWA par produit** : gabarit `src/shared/pwa/swTemplate.js` +
  `scripts/build-pwa.js` (enchaîné par le build, `npm run build:pwa`) génèrent
  `dist/sw-<produit>.js` et `dist/manifest-<produit>.webmanifest` depuis le manifeste Vite
  (bundles hachés en cache-first, stratégies historiques conservées) ; `/sw.js` et
  `/manifest.json` servent le fichier du produit résolu (`lib/pwaRoutes.js`). `public/sw.js`
  reste le SW de développement ForetMap.
- **Garde d'accès par cookie signé** `lib/accessGate.js`, extraite de `routes/visit.js` sans
  changement de comportement (HMAC, temps constant, HttpOnly, Secure en production) ; base du
  mode d'accès par code du plan et d'une partie G&L invitée.
- **Journal d'audit** `lib/auditLog.js` : `logAudit` / `logSecurityEvent` sortent du routeur
  `routes/audit.js` (ré-export conservé) ; les dix-huit consommateurs importent le module.
- **Compteur d'usage anonyme** (migration `207_usage_counters`, `lib/usage.js`) :
  `POST /api/usage` public (événements en liste blanche par produit, agrégés par jour, sans
  identifiant ni cookie) et `GET /api/admin/usage` (permission `admin.settings.read`).
- **Registre et magasin de réglages communs** `lib/shared/settingsRegistryCore.js` et
  `lib/shared/settingsStore.js` (cache versionné par écriture) : `lib/settings.js` et
  `lib/glSettings.js` s'y branchent sans changer de contrat ; les validateurs G&L quittent
  `routes/gl/admin.js` pour le registre ; clés `ui.plan.*` déclarées (carte, titre, message
  d'accueil, mode d'accès, attribution, catégories par défaut / masquées).
- **Fixtures métier ForetMap** `tests/helpers/fmFixtures.js` (carte, zone, repère, catégorie,
  plante), pendant de `glFixtures.js`.
- Déploiement : `deploy:check:prod` et `prepare-dist-deploy` couvrent le troisième host
  (`PLAN_PROD_BASE_URL`, contrôle de `dist/gl.html` et `dist/plan.html`) ; `.env.example`,
  `docs/EXPLOITATION.md`, `docs/GL_ARCHITECTURE.md` (routage produit), `docs/API.md`
  (compteur d'usage), `CLAUDE.md`.

### Lot 0 — Garde-fous et hygiène (plan de convergence, `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6)

- **Correctif de sécurité — glossaire lore G&L** : `GLLoreGlossaryInlineText` échappe désormais le
  HTML saisi avant d'insérer les liens de glossaire puis assainit le résultat, comme ses trois
  pendants ; `GLLoreGlossaryMarkdown` passe sur la mécanique partagée `useGlossaryLinkedHtml` +
  `glossaryLinkClick` (fin du lot B5) et `glLoreGlossaryAutolink.js` balaie des chaînes au lieu
  de parcourir le DOM (exécutable côté serveur et en test sans `document`). Le sanitizer
  reconnaît l'attribut `data-gl-lore-code` au même titre que les deux autres glossaires.
- **Miroirs ESM/CJS synchronisés** : `scripts/sync-shared-cores.js` (+ `npm run
  sync:shared-cores[:check]`, enchaîné par le build) régénère les six noyaux de `lib/shared/`
  depuis `src/shared/` ; `tests/shared-cores-sync.test.js` échoue à la moindre divergence et
  vérifie l'égalité des exports. ≈ 1 090 lignes ne sont plus maintenues à la main.
- **Tokens typographiques communs** : `src/shared/styles/typography-tokens.css` (échelle
  `--text-*`, graisses, interlignes, encres, pile emoji) chargée par les deux entrées ; les 19
  déclarations recopiées de `gl-base.css` et `index.css` sont retirées, seule `--font-sans`
  reste par produit. `color-scheme: light` déclaré côté ForetMap (contrôles natifs plus
  repeints en sombre par le système, comme G&L).
- **Cliquets** : `tests-ui/utils/zLayers.test.js` contrôle aussi `src/index.css` ;
  `tests-ui/utils/breakpoints.test.js` interdit tout nouveau seuil `@media` hors liste
  canonique (dette existante tolérée explicitement) et toute redéclaration des tokens communs.
- **Tests directs** des trois composants partagés les plus consommés et jusque-là sans filet :
  `DialogShell`, `Tooltip`, `ImageLightbox` (+ `ImageLightboxProvider`). Au passage, la lightbox
  pose enfin le focus initial sur son bouton « Fermer » (le conteneur du portail était attaché
  après l'effet de focus).
- **Étanchéité de `src/shared/`** : règle ESLint `no-restricted-imports` en avertissement sur
  tout import de code produit depuis le partagé (20 cas recensés, à résorber au lot 3).
- **Rangement** : `src/services/apiTransport.js` promu en `src/shared/apiTransport.js`
  (ré-export de compatibilité conservé) ; `lib/glGlossaryMatch.js`, `lib/glQcmChoices.js`,
  `lib/glQcmPresentationUse.js` renommés `glossaryMatch.js`, `qcmChoices.js`,
  `qcmPresentationUse.js` — consommés par ForetMap (`routes/quiz.js`) autant que par G&L, le
  préfixe `gl` était un piège de recherche.
- **Badge de version G&L** enfin stylé : `.app-version-badge` vit dans la feuille partagée
  `src/shared/styles/version-badge.css`, importée par les deux composants qui le rendent.
- Documents d'orientation corrigés : `docs/PARTAGE_FM_GL.md` (états A2, B1, récapitulatif §9,
  32 modules dans `lib/shared/`), `docs/GL_ARCHITECTURE.md` (rôle de `reactionEmojiCore`),
  `docs/USERS_MIGRATION.md` (périmètre antérieur à G&L).

### Lisibilité des repères et des zones du Plan Lyautey (suites de l'audit)

- **Étiquettes départagées, plus jamais superposées** : les noms de zones **et** de repères
  passent dans une seule résolution de collisions (`src/shared/pct-map/pctMapLabels.js`, qui
  branche enfin `resolveLabelCollisions`, écrit au lot 5 et appelé nulle part). Plus aucun
  seuil de zoom : tout nom est candidat dès la vue d'ensemble, et les noms masqués
  réapparaissent en zoomant puisque les étiquettes gardent une taille constante à l'écran. Sur
  les données de production, on passe de 28 noms de zone dont **10 paires en collision** et
  **aucun** nom de repère, à 23 noms de zone + 7 noms de repère **sans aucun recouvrement** à
  l'ouverture, puis la totalité à ×2,5.
- **Ancrage au pôle d'inaccessibilité** (`polygonPoleOfInaccessibilityPct`) plutôt qu'au
  centroïde : deux noms de bâtiment flottaient sur le voisin.
- **Emoji plus dessiné deux fois** : le préfixe emoji d'un nom (« 📚 CDI ») est séparé du texte
  sur la carte, dans la fiche et dans la liste de résultats. La logique passe dans
  `src/shared/emojiPrefixCore.js` — le plan n'importe plus le catalogue d'emojis de ForetMap ;
  `src/constants/emojis.js` la ré-exporte, comportement inchangé.
- **Étiquettes de zones hors du SVG déformé** (`PctLabelsLayer`) : fini la compression
  horizontale de 16 % du texte. Étiquettes, pastilles, contours, trait « Y aller » et point de
  position gardent une **taille constante à l'écran** (variable CSS `--pct-inv`) — un emoji de
  repère mesurait ~170 px à l'échelle maximale.
- **Repères** : cible tactile de 44 px centrée sur le point, et l'étiquette ne déplace plus la
  pastille quand elle apparaît.
- **Zones accessibles** : `role="button"`, `tabIndex` et `aria-label`, activation clavier
  (Entrée / Espace). 28 lieux sur 48 étaient jusqu'ici inatteignables au clavier et muets pour
  un lecteur d'écran. Contour porté à 1,5 px écran (3 px pour la zone ouverte).
- **Puces de catégorie** : une puce sans aucun lieu n'est plus proposée (elle vidait la carte) ;
  un filtre qui ne laisse rien affiche « Aucun lieu dans cette sélection » et « Tout afficher ».
- **Lien direct d'un lieu** enfin transmis à sa fiche (`shareUrl`), pour les QR codes internes.
- Suppression de `shouldShowMarkerLabel`, devenu sans emploi.
- **Halo de précision de la position enfin visible** : il était dimensionné en pourcentage d'un
  parent sans dimension (tous les enfants de `.fm-pct-position` sont en `position: absolute`,
  le conteneur se calculait donc à 0 × 0) et se rendait à 2 × 2 px, recouvert par le point bleu
  — invisible depuis le lot 6, sur le **plan comme sur la carte de travail**. Le diamètre passe
  en **pixels du calque** (`accuracyHaloDiameterPx`) : disque rond et non plus ellipse, rayon
  calé sur l'axe qui a servi à convertir les mètres en pourcentage (donc jamais plus optimiste
  que le capteur), et solidaire du zoom puisqu'il représente une distance au sol. Sur le calage
  réel de Lyautey, 33 px de diamètre à 12 m de précision. `.fm-pct-position` reçoit au passage
  une boîte réelle : il portait un `role="img"` sur un élément de taille nulle.
- Tests : `tests-ui/shared/pctMapLabels.test.js` (nouveau) et compléments dans
  `PctLayers.test.jsx` et `plan/AppPlanMount.test.jsx` — le rendu de la carte du plan n'était
  couvert par aucun test.

### Audit — Affichage des repères et des zones du Plan Lyautey

- **Nouveau document `docs/AUDIT_PLAN_AFFICHAGE_2026-09.md`** (relevé ; les corrections qu'il
  a déclenchées sont la section ci-dessus, et son §7 dit ce qui reste ouvert) :
  relevé du rendu de `planlyautey.olution.info` confronté aux **données réelles de production**
  (28 zones, 20 repères, 4 catégories, fond 852 × 1012 px) sur la version servie (1.145.0).
  Constat bloquant d'exploitation (certificat TLS auto-signé sous un domaine `HSTS
  includeSubDomains` : page non ouvrable, pas de géolocalisation, pas de service worker) ;
  cinq constats majeurs de rendu — noms de zones ni ajustés ni départagés (11 étiquettes sur 28
  en collision, jusqu'à 45 % de la largeur d'écran pour un bâtiment de 9 px), ancrage au
  centroïde au lieu du pôle d'inaccessibilité (2 noms hors de leur polygone), emoji dupliqué sur
  12 zones, nom des repères invisible avant un zoom ×3,2 (seuil de priorité 50 contre
  `sort_order` 100 en base), absence de contre-échelle au zoom ; sept constats moyens
  (texte SVG comprimé de 16 %, saut de la pastille à l'apparition de l'étiquette, cible tactile
  < 44 px, zones ni focusables ni annoncées, contour de 0,35 px, puces de catégorie qui vident
  la carte, fond de plan trop peu défini) et six points d'hygiène de données. Le document montre
  que `PctZonesLayer` est le moins outillé des trois calques de zones du monorepo alors que
  `polygonPoleOfInaccessibilityPct`, `stripLeadingMarkerEmoji`, `fitOverlayLabelToWidth` et
  `resolveLabelCollisions` (écrit pour ce plan, appelé nulle part) sont déjà écrits et testés ;
  plan de correction en neuf lots.

### Audit — Convergence des applications ForetMap / Visite / GL / Plan et plan d'action final

- **Nouveau document `docs/AUDIT_CONVERGENCE_APPS_2026-09.md`** (audit seul, aucun code
  modifié) : inventaire de `src/shared/` (43 modules réellement partagés, 24 consommés par un
  seul produit, 20 dépendances inversées vers du code produit, 6 noyaux en double ESM/CJS sans
  synchronisation), comparaison des quatre surfaces, ce que chaque application fait de mieux
  (bouton retour, dialogues et notifications ForetMap ; thème de marque, dock d'aide, bouton
  d'action carte et navigation compacte GL ; transformation bornée et file hors ligne de la
  Visite), doublons et dettes (trois systèmes de boutons, deux aides, quatre moteurs de carte,
  réglages et caches non product-aware, écart d'échappement HTML dans le glossaire lore GL),
  architecture cible du socle commun et **plan d'action en dix lots** qui remplace le phasage
  de l'audit Plan Lyautey.

### Audit — « Plan Lyautey » : cadrage d'un plan de repérage mobile dérivé de ForetMap

- **Nouveau document `docs/AUDIT_PLAN_LYAUTEY_2026-09.md`** (audit seul, aucun code modifié) :
  état des lieux des deux moteurs de carte, des API publiques, de la recherche et du calage GPS ;
  douze constats d'ergonomie mobile (bornes de pan absentes, gestes incomplets, détail en modale
  plein cadre, filtre sans tri ni légende, bug de centrage des repères `mapFocusLocation.js`) ;
  expérience cible (carte plein écran, recherche d'abord, chips de catégories, feuille basse à
  crans, point bleu de position, PWA) ; plan de portage en troisième produit du monorepo sur le
  schéma GL (`plan.html` → `src/plan/`, host `planlyautey.*`, noyau carte partagé
  `src/shared/pct-map/`) ; décisions du propriétaire intégrées et propositions détaillées :
  fond de plan (licence), désencombrement des repères superposés, visibilité par surface,
  « Y aller » et mode boussole, parcours, garde d'accès, service worker et manifest par
  produit (hors ligne pour ForetMap, GL et le plan), compteur d'usage anonyme, matrice des
  bénéfices pour chaque application ; phasage en dix lots.
### Tâches et projets validés masqués par défaut

- **Vue Tâches** : une tâche **validée** (ou rattachée à un projet validé) et un **projet
  validé** ne sont plus rendus à l'ouverture — même principe que les archives : la section
  « Validées » (n3boss) / « Récemment validées » (n3beur) et le bloc « Projets validés »
  n'apparaissent que si le filtre de statut « Validée » / « Projet validé » les demande.
  Le compteur de résultats et l'état vide tiennent compte du masquage ; la vue
  « 📦 Archivés » continue d'afficher tout son contenu.
- **Découvrabilité** : une ligne discrète en fin de liste annonce ce qui est masqué
  (`TasksValidatedHiddenNotice`, nouveau) avec un bouton « Afficher les validés » qui pose
  le filtre de statut.
- Helpers purs `isTaskValidated` / `filterStatusShowsValidated` / `partitionTasksByValidated`
  dans `src/utils/taskSectioning.js`.
- Tests : `tests-ui/components/TasksValidatedHiddenNotice.test.jsx`,
  `tests-ui/components/TasksViewValidatedHidden.test.jsx` (montage de `TasksView`) et cas
  ajoutés dans `tests-ui/utils/taskSectioning.test.js`. Doc :
  `docs/reference/foretmap/taches-tutoriels-et-validation.md`.

### Correctif — espace mort sous la barre d'onglets n3boss

- Depuis la navigation en trois pôles (D-4), les deux rangées d'onglets vivent dans
  `.teacher-nav` mais gardaient la marge basse de l'ancienne **barre unique** : ~20 px de
  vide entre les pôles et leurs onglets, puis ~16 px de plus avant la carte / les tâches /
  les tutoriels. L'espacement vertical est désormais porté par le seul conteneur
  (`gap` + marge basse de la nav), ce que la hauteur d'onglets déjà calculée par
  `--fm-maptasks-teacher-tabs-h` supposait.

### Correctif — la navigation prof s'étirait sur la moitié de l'écran

- Suite du correctif ci-dessus : les marges étaient bien en cause pour ~36 px, mais le vide
  restant venait d'ailleurs.
- La barre de navigation prof (`.teacher-nav`, deux rangées depuis D-4) occupait **la moitié de
  la hauteur utile** au lieu de sa hauteur de contenu : le conteneur prof porte à la fois `main`
  et `teacher-main`, donc `.main > * { flex:1 }` lui donnait un `flex-grow:1` que le
  `flex-shrink:0` de `.teacher-main > .teacher-nav` ne neutralisait pas. L'ancienne barre unique
  y échappait grâce au `max-height` de `.top-tabs` ; le conteneur des deux rangées, lui, n'en a
  pas. Mesure en 1440×900 : **398 px de conteneur pour 114 px d'onglets**, d'où l'espace mort
  entre la rangée d'onglets et la carte / les tâches (onglet « Cartes, tâches et tuto »), et de
  même sur les autres onglets prof. Corrigé par `flex:0 0 auto`.
- **Volet carte du split, côté prof ET côté élève** : le `position:sticky` du volet se cale sur
  `.desktop-split-view` (en `overflow:hidden`, donc conteneur de défilement), pas sur le
  document — un décalage haut de la hauteur d'en-tête y poussait la carte de 56 px vers le bas
  sans rien dégager. Décalage remis à `0` sur les deux branches ; la marge sous l'en-tête reste
  prise en compte par `--fm-maptasks-map-max-h`.
- Garde-fou : `tests-ui/utils/teacherNavLayoutGuard.test.js` échoue si l'une des trois
  déclarations repart en arrière.

### Correctif — mécaniques d'échéance

- **`daysUntil` en jours de calendrier locaux** (`src/utils/badges.jsx`) : la puce
  d'échéance comparait un instant (`new Date('2026-09-02')` = minuit **UTC**) à l'heure
  locale — à l'est de Greenwich, une tâche due le jour même s'affichait « Demain » entre
  minuit et le décalage horaire. Une valeur illisible renvoie désormais `null` (aucune puce)
  au lieu d'un `NaN`.
- **Notifications d'échéance n3beur** : « Échéance proche » et « Tâches en retard »
  deviennent des avis **d'état** — clé stable et **clôture** dès que plus aucune tâche ne
  les justifie. Avec une clé porteuse du compte, chaque variation créait un item de plus et
  aucun n'était jamais refermé. Elles s'appuient sur `daysUntil` : une tâche due
  **aujourd'hui** est « proche », plus « en retard » (l'ancien calcul la déclarait en retard
  dès minuit).
- Tests : `tests-ui/utils/daysUntil.test.js` (nouveau) et section « échéances n3beur » dans
  `tests-ui/hooks/useNotificationCenter.test.jsx`. Doc :
  `docs/reference/foretmap/stats-forum-et-suivi.md`.

### Documentation — audit des échéances

- **`docs/AUDIT_ECHEANCES_2026-09.md`** (nouveau) : inventaire de tout ce qui dépend d'une
  date côté tâches/projets (champs, affichage, notifications, date de départ, récurrence,
  archivage automatique, job quotidien, validation à l'écriture, tri), avec les correctifs
  du lot et les constats laissés en l'état (fuseau du calcul de `start_date`, absence de
  contrôle de format et de cohérence `due_date >= start_date` à l'API, `setInterval`
  quotidien calé sur le démarrage du process).
- **`docs/reference/foretmap/taches-tutoriels-et-validation.md`** : nouvelle section
  « Et pendant les vacances ? » — ForetMap ne connaît aucun calendrier scolaire ; le seul
  levier est l'interrupteur manuel de duplication des tâches récurrentes.

### Couleurs de carte : une seule palette pour les zones et les catégories

- **Champ couleur unifié** (`src/components/ColorPaletteField.jsx`, nouveau) : la palette
  prédéfinie de dix teintes (`ZONE_COLORS`) est désormais proposée **à l'identique** au
  dessin d'une zone, dans la fiche d'une zone et dans l'administration des **catégories de
  zones/repères**. Chacun de ces trois écrans offre les mêmes trois façons de choisir :
  pastilles de la palette, pastille de sélection du système, saisie hexadécimale directe
  (la transparence des deux derniers caractères est conservée par le sélecteur).
- Les pastilles de palette deviennent de vrais `<button>` (accessibles au clavier,
  `aria-pressed`) et leurs styles passent en CSS partagé `.color-palette-field*`
  (ex-`.map-category-color-field*`).
- Tests : `tests-ui/components/ColorPaletteField.test.jsx` (nouveau) et cas couleur dans
  `tests-ui/components/ZoneDrawModal.test.jsx`. Doc :
  `docs/reference/foretmap/carte-et-zones.md`.

### Contour continu pour les lieux « Infrastructure »

- **Carte principale** : le contour des zones marquées « Infrastructure » (mare, ruches,
  compostage, cuve…) est désormais tracé en **trait continu**, comme celui de toutes les
  autres zones — le tiretage qui les distinguait est supprimé. Le reste du comportement
  « Infrastructure » est inchangé (pas de section Biodiversité en visite, lieu jamais
  proposé comme cible de mission ou de tutoriel).
- Doc mise à jour : `docs/API.md` et `docs/reference/foretmap/carte-et-zones.md`.
- Test : cas de non-régression dans `tests-ui/components/map/ZonePolygonsLayer.test.jsx`.

### Correctif — « Serveur indisponible » affiché alors que le voyant est au vert

- **Notifications d'état closes à la reprise** : « Serveur indisponible — Synchronisation
  ralentie », « Temps réel hors ligne » et « Session non vérifiée » passent en lues dès
  que leur cause retombe (y compris pour un item restauré du `localStorage`, persisté
  7 jours). Auparavant l'item restait non lu et le bandeau critique d'`App.jsx` — rendu
  précisément quand `serverDown` est redevenu faux — continuait d'afficher « Serveur
  indisponible » avec le temps réel au vert, jusqu'à un clic manuel ou l'expiration.
- **Comptage « serveur indisponible » aligné sur le catch global** : dans `fetchAll`, un
  domaine qui échoue en **4xx** (403, 404, 429) conserve les données affichées et suspend
  la baseline du polling différentiel, mais ne compte plus comme échec serveur — le
  serveur répond. Seuls les échecs réseau et 5xx lèvent le bandeau après trois cycles.
- Tests : `tests-ui/hooks/useNotificationCenter.test.jsx` (nouveau) et cas 4xx dans
  `useAppDataSync.test.jsx`.

### Interface désencombrée : icônes, navigation en pôles, accordéons (audit UI — D-2/D-3/D-4)

Fin du lot D de l'audit homogénéité, selon les arbitrages validés :

- **Icônes SVG lucide pour le chrome (D-2)** : barres d'outils, modales, en-têtes,
  boutons et badges d'état abandonnent les emojis (tailles et rendus incohérents selon
  l'OS) pour des icônes vectorielles [lucide](https://lucide.dev) (licence ISC), servies
  par un point d'import unique `src/shared/icons.jsx` (taille et graisse uniformes,
  `aria-hidden`, chunk de build dédié). Les emojis restent réservés au **contenu
  métier** : emoji d'une plante ou d'une zone, palette de choix, organismes du réseau
  trophique, mascottes.
- **Navigation professeur en 3 pôles (D-4)** : les 17 onglets ne défilent plus dans une
  barre unique — trois pôles (Contenus / Suivi / Administration) déploient chacun leur
  rangée d'onglets ; le compteur « à valider » devient un badge sur le pôle Suivi et
  l'onglet Tâches. Le pôle actif est dérivé de l'onglet courant (rien de nouveau n'est
  persisté) ; l'onglet Glossaire devient atteignable côté prof.
- **Écrans admin repliables (D-3)** : les grandes consoles (Paramètres administrateur,
  fiche plante) se replient en accordéons qui mémorisent leur état (`localStorage`) et
  s'ouvrent d'office pendant une recherche ; les bandeaux inline passent dans le dock
  flottant commun ; premier filet e2e **mobile** (projet Playwright `mobile-chromium`,
  390×844 tactile : carte, navigation basse, feuille de filtres).

### Fin des dialogues natifs du navigateur (audit homogénéité UI — lot D-1)

Les 82 `window.confirm/alert/prompt` du front (64 ForetMap, 18 GL) passent sur un
système de dialogues commun, `AppDialogsProvider` (`useAppDialogs()`) :

- **confirmations** stylées au thème, promesses (`await confirm({...})`), CTA explicite
  (Supprimer/Archiver/Réinitialiser/Redémarrer…) et variante danger — fini la boîte
  système qui gèle le thread (animations, polling, Socket.IO) et peut être supprimée
  silencieusement en PWA/WebView ;
- **saisies** (`prompt`) avec valeur par défaut, champ requis et annulation propre — le
  triple `prompt()` de création de groupe devient trois étapes du même dialogue, et les
  éditeurs riches (FM et GL) préservent la sélection du texte autour de la saisie d'URL ;
- **erreurs** (`alert`) converties en toasts non bloquants (`notify`) ;
- file d'attente intégrée, repli natif hors provider (tests unitaires inchangés),
  5 tests dédiés du provider + garde-fou `tests/native-dialogs-guard.test.js`
  (tout `window.confirm/alert/prompt` réintroduit fait échouer la CI ; deux replis
  documentés en allowlist).

Vocabulaire unifié au passage : « Sauvegarder »/« Sauver » → **« Enregistrer »**,
« ↩ Undo » → « ↩ Annuler », et le glyphe ↩️ ne sert plus deux actions différentes dans
l'en-tête (Déconnexion → 🚪).

### Dépendances npm (lot patch/mineur Dependabot)

Onze mises à jour groupées : `mysql2`, `nodemailer`, `pdfkit` (0.19 → 0.20, export
PDF tutoriels côté Node), `sharp`, `@rive-app/react-canvas` (4.30 → 4.33),
bibliothèques de test (`@testing-library/*`), `@vitejs/plugin-react`, `eslint`,
`isomorphic-dompurify`, `marked`. Artefacts `dist/` régénérés (nouveaux wasm Rive).

### Correctif — sauvegarde de zone n’efface plus le corps visite

La liste carte n’envoie plus le JSON éditorial visite (anti-LVE). Enregistrer la fiche
avant le chargement du détail — ou après un poll qui renvoyait la liste allégée —
réécrivait un corps vide et effaçait paragraphes / titres. La sauvegarde omet désormais
ces blocs tant que le détail n’est pas chargé, et un poll ne remplace plus un détail déjà lu.

### Temps réel : filet REST, un socket GL, observations

Sur l’hébergement mutualisé (o2switch / Passenger), le canal live reste un **signal** :
les données passent par un rechargement REST. Le filet de rafraîchissement global
tourne aussi **quand le live est vert** (toutes les 90 s), pour rattraper un événement
manqué. Gnomes & Licornes n’ouvre plus qu’**une** connexion par jeton (au lieu de
jusqu’à quatre). Le carnet d’observations notifie enfin les autres écrans. Un compte
supprimé n’est plus accepté sur le canal live (le jeton est revérifié en base).

Couverture : `tests/realtime.test.js`, `tests-ui/hooks/useAppDataPolling.test.jsx`,
`tests-ui/gl/glSocketClient.test.jsx`. Le mock de `useGlGameRuntime` suit le socket
mutualisé (`off` / `disconnect` + reset entre tests) — sans ça `test:ui` cassait
après le merge du filet o2switch.

### Documentation gating GL — cascade effective

Correction des docs techniques GL sur le conditionnement QCM : `docs/GL_QCM_SETS.md`,
`docs/API.md` et l'audit feuillets distinguent désormais clairement les constats initiaux des
comportements livrés (cascade site → type → ressource, granularité chapitre/scope GL, signaux
`effective_sources`, `pending_count` et `ask_count`).

### Runbook LVE — profiler les parcours mémoire

Documentation du script `npm run test:profile:memory` dans `docs/LOCAL_DEV.md` et raccord dans la
checklist `hard_kills` de `docs/EXPLOITATION.md` : prérequis locaux, scénarios couverts, options de
concurrence/itérations et lecture des signaux `ΔRSS`, `Δheap`, `Mo resp` et `413`.

### Import quiz : rattachements glossaire plus effacés si l'import est interrompu

L'import tableur du catalogue Quiz (ForetMap) vidait tous les rattachements
automatiques questions ↔ glossaire, puis les reconstruisait, **hors transaction**.
Le même motif venait d'être sécurisé pour Gnomes & Licornes. Une interruption
(timeout, kill mémoire) laissait le catalogue à jour et **tous** ces rattachements
effacés — le contrôle de compréhension rattaché au glossaire ne se déclenchait
plus. L'import passe désormais en une seule transaction : échec = rien n'a changé.

### Le verrou ForetMap ignorait les surcharges type/fiche

La cascade site → type → fiche (erreurs tolérées, délai, portée du verrou) était
annoncée dans le challenge et appliquée côté GL, mais l’écriture du verrou
ForetMap (`POST /api/quiz/questions/:code/answer`) relisait uniquement les
réglages du site. Un professeur qui assouplissait une fiche (2 erreurs permises)
ou au contraire y posait un délai alors que le site était à 0 voyait l’élève
verrouillé trop tôt — ou jamais. L’écriture utilise désormais la même politique
effective que l’annonce.

### Chargement des données : onglets pédago et anti-course

Le rafraîchissement global (`fetchAll`) traitait encore glossaire, quiz, réseau trophique
et médiathèque comme des onglets « chauds » : polling à cadence nominale, et **aucun**
rechargement en les quittant pour revenir à la carte ou aux plantes. Ils rejoignent les
onglets calmes (`POLLING_COARSE_TABS`) — intervalle doublé hors temps réel, un `fetchAll`
à la sortie.

Les listes du glossaire, du réseau trophique et des catégories de quiz ignoraient une
réponse plus récente au profit d'une requête plus lente (changement de filtre). Une
garde de séquence conserve uniquement le chargement le plus récent, comme le carnet
d'observations.

Couverture : `tests-ui/hooks/useAppDataPolling.test.jsx`,
`tests-ui/components/pedago/pedagoLoadRace.test.jsx`. Le scénario e2e glossaire
seede un terme unique (la base e2e n’importe pas le contenu biodiv) puis filtre
dessus — plus de recherche « photo » qui masquait une liste périmée.

### Un seul système typographique (audit homogénéité UI — B2/B3)

Migration mécanique de la typographie vers les tokens posés au lot précédent —
**1 340 remplacements**, aucun littéral restant hors allowlist :

- **Tailles** : les 85 valeurs littérales de `font-size` (500 en CSS, 335 en styles inline
  JSX) sont regroupées sur l'échelle fluide `--text-2xs` → `--text-2xl` (8 crans, nouveau
  cran `--text-2xs` pour les badges) ; seules deux tailles « display » (2.5/3 rem) restent
  littérales. Le « petit texte » écrit de 14 façons entre 0.68 et 0.88 rem tient désormais
  sur deux crans.
- **Graisses** : 271 `font-weight` littéraux → `--fw-regular/medium/semibold/bold`
  (descripteurs `@font-face` exclus).
- **Interlignes** : les grappes 1.4/1.45/1.5/1.52 → `--lh-normal`, 1.55–1.74 →
  `--lh-relaxed`, 1.2 → `--lh-tight` (119 remplacements) ; les interlignes d'alignement
  fin (1, 1.25 des boutons…) restent explicites.
- **Gris secondaires** : les six gris inline (`#64748b`, `#6b7280`, `#555`, `#666`,
  `#999`, `#888` — 120 occurrences) convergent sur `--ink-soft` / `--ink-faint`
  (`#8a94a0`, plus lisible que l'ancien `#999`).
- Les tokens sont définis **par produit** (`src/index.css` et `gl-base.css`, mêmes
  valeurs) car les pages GL ne chargent pas `index.css`.
- **Garde-fou** : `tests/typography-tokens-guard.test.js` échoue si un `font-size` littéral
  rem (CSS), un `fontSize`/gris inline littéral (JSX) ou un token manquant réapparaît —
  la dispersion mesurée par l'audit ne peut plus se reconstituer silencieusement.

### L'inventaire « Zones & repères » devient une grille d'édition directe avec actions par lot

Refonte du sous-onglet **Réglages administrateur → « Zones & repères »** livré au lot
précédent : plus de bouton « Modifier », chaque ligne est un mini-formulaire
**toujours éditable** qui enregistre à la sortie du champ (Entrée valide, Échap
annule).

- **Champs exhaustifs** en édition directe : emoji, nom, carte (déplacement d'un
  lieu vers un autre plan), description/note, **espèces** (pastilles + champ à
  suggestions du catalogue), **catégories** (pastilles à activer/désactiver, seules
  les applicables au type et à la carte sont proposées), et dans le dépliant
  « Visite & détails » les quatre textes du mode Visite, la couleur d'une zone et la
  position X/Y d'un repère. Seuls le tracé, les photos et les blocs d'images de
  visite restent sur la carte.
- **Édition par lot** sur la sélection (cases + « Tout sélectionner ») : ajouter /
  retirer une catégorie ou une espèce, déplacer vers une carte, définir l'emoji,
  **rechercher / remplacer** dans les noms (et sur option descriptions/notes),
  **supprimer** après confirmation. Le bouton « Appliquer » annonce le nombre de
  lieux réellement concernés, une progression s'affiche, et le bilan distingue mis à
  jour / déjà conformes / échecs.
- Logique pure extraite dans `src/utils/adminLocationsGrid.js` (26 nouveaux cas de
  test). Toujours **aucune nouvelle route ni migration** : `PUT`/`DELETE` unitaires
  existants, permissions « Gestion zones » / « Gestion repères » inchangées côté
  serveur.

Doc : `docs/reference/foretmap/carte-et-zones.md` (section réécrite).
### Emoji de zone en colonne dédiée (audit homogénéité UI — C4)

La colonne `zones.emoji` (migration `206`) remplace l'extraction fragile du préfixe du nom
comme source de vérité de l'emoji de zone :

- **API** : `POST`/`PUT /api/zones` acceptent `emoji` (normalisé, `''` = effacement) et le
  dérivent du préfixe du nom quand il est omis (anciens clients) ; toutes les réponses zone
  l'exposent.
- **Affichage** : le plan (carte et Visite), la fiche zone et les filtres carte privilégient
  la colonne et se replient sur le préfixe pour les lignes non migrées. L'en-tête de la
  fiche rend l'emoji dans la pile emoji (nouvelle classe `.emoji-glyph`) au lieu de le
  laisser passer par Playfair Display avec le nom brut.
- **Formulaires** : les modales de création et d'édition envoient l'emoji du sélecteur en
  champ dédié ; le nom conserve son préfixe pour la compatibilité des autres affichages.
- Couverture : `tests/zone-emoji.test.js` (helper serveur, sans BDD),
  `tests/zone-emoji-column.test.js` (POST/PUT/GET), tests UI `zoneDisplay` et
  `parseZonesForLayer` (préférence colonne).

### Homogénéité de l'interface : lots A et C de l'audit exécutés (+ socle du lot B)

Mise en œuvre du plan de `docs/AUDIT_UI_HOMOGENEITE_2026-09.md` (état détaillé en §6 du
document) :

- **Fin de la déformation des noms de zones** (carte et Visite) : l'ancien
  `textLength`/`lengthAdjust="spacingAndGlyphs"` étirait les noms courts et écrasait les
  longs dès 13 caractères. Un nom trop large est désormais légèrement réduit (borné à
  −20 %) puis coupé avec « … » — glyphes intacts, nom complet dans la fiche et en
  info-bulle SVG. Nouvelle fonction testée `fitOverlayLabelToWidth`.
- **SVG étirés dé-anamorphosés** : numéros/points des zones feuillets GL, éditeur de
  sommets du royaume et aperçus biodiversité ne sont plus aplatis/étirés selon le ratio
  du plan (`transform-box: fill-box` + `--map-fit-aspect`) ; tous les contours étirés
  passent en `vector-effect: non-scaling-stroke` (trait identique sur les deux axes,
  constant au zoom).
- **Un seul rendu d'emoji partout** : pile de polices unifiée (`ForetMapColorEmoji` avant
  les polices système dans toutes les piles, ForetMap et GL), `unicode-range` sur le
  `@font-face` (les 5,5 Mo ne se téléchargent que si un emoji est rendu), préchargement
  côté ForetMap comme côté GL (fin de la bascule visible au chargement),
  `font-variant-emoji` sur les classes d'overlay, glyphes normalisés (`🗑️`, `☑️/⬜`,
  `✕` remplace `×`). Migration `205` : réparation du sélecteur U+FE0F corrompu étendue
  aux tables ForetMap (zones, repères carte/visite, catégories, plantes, rôles) ; la
  réparation mojibake est aussi appliquée à l'affichage des noms de zones, et la saisie
  d'emoji ne peut plus scinder une séquence (coupe en points de code).
- **Vrai gras** : DM Sans est désormais chargée en 700 (le CSS en demandait ~100 usages
  jamais chargés → gras synthétisé) ; les 4 usages de 800 sont rabattus sur 700.
- **Un seul régime de zoom pour les trois cartes** : les repères de la Visite suivent la
  même croissance douce que les noms de zones au lieu de doubler linéairement, leurs
  pastilles gardent un rapport constant avec l'emoji pendant le zoom ; GL applique enfin
  le multiplicateur tactile (×1,2) et la préférence « taille du texte », désormais
  réglable aussi depuis le bandeau de la Visite (bouton « Aa »). Les planchers de taille
  s'appliquent au couple emoji+libellé (ratio conservé sur les petits plans) et les
  arrondis n'introduisent plus de sauts d'1 px au redimensionnement.
- **Corrections avérées** : la feuille de filtres carte mobile retrouve son style
  bottom-sheet (props `DialogShell` corrigées) et s'aligne sur la feuille des tâches ;
  l'onglet Médiathèque est de nouveau restauré au rechargement ; `aria-label` sur les
  4 boutons `✕` muets ; cibles tactiles ≥ 44 px dans la barre d'outils carte.
- **Socle typographique (lot B)** : échelle étendue à 7 crans (`--text-xs`…`--text-2xl`),
  tokens de graisse (`--fw-*`) et d'interligne (`--lh-*`), piles de polices dédupliquées,
  petits boutons alignés (0.875rem / 36 px pour `.btn-sm`, `.gl-btn--sm`,
  `.shared-btn--sm`) et `line-height` explicite sur `.btn`. La migration des tailles
  littérales (B2/B3) et la colonne `zones.emoji` (C4) restent des lots dédiés.

### Audit — homogénéité de l'interface (écrits, emojis sur les plans, densité)

Nouveau document [`docs/AUDIT_UI_HOMOGENEITE_2026-09.md`](docs/AUDIT_UI_HOMOGENEITE_2026-09.md),
en réponse au signalement « écrits et emojis hétérogènes sur les plans, déformation,
tailles différentes, interface parfois chargée ». Audit sans modification de code :

- **Écrits** — l'échelle typographique (`--text-*`) existe mais n'est utilisée que 3 fois
  contre 879 tailles littérales (85 valeurs distinctes, dont 14 variantes de « petit
  texte ») ; graisses 700/800 demandées ~100 fois mais jamais chargées (faux-gras) ;
  1 114 styles inline sur 41 % des composants ; trois familles de boutons non alignées.
- **Emojis sur les plans** — déformation des noms de zones par
  `textLength`/`spacingAndGlyphs` au-delà de 12 caractères ; textes et cercles
  anamorphosés dans les SVG étirés non compensés (feuillets GL, aperçus biodiversité) ;
  emojis rasterisés à ~5 px puis agrandis au zoom ; trois régimes de zoom différents pour
  le même concept de repère ; pile de polices emoji inversée selon la variable, préchargée
  côté GL mais pas côté ForetMap ; réparation `U+FE0F` limitée aux tables GL.
- **Densité** — 13/17 onglets en barres scrollables sans indicateur, 18 surfaces
  superposables sur l'écran carte, 54 dialogues natifs `confirm/alert/prompt`,
  formulaires admin sans replis ; deux bugs avérés consignés (bottom-sheet des filtres
  carte jamais stylée par props ignorées, onglet Médiathèque jamais restauré).
- **Plan d'amélioration** en 4 lots priorisés (A corrections ciblées → D désencombrement),
  chaque constat référencé `fichier:ligne`.
### Réglages : un sélecteur de couleur pour les catégories de lieux

La couleur d'une catégorie ne se saisissait qu'en hexadécimal, à l'aveugle. Un **sélecteur
de couleur natif** est ajouté à côté du champ, qui reste éditable pour ceux qui préfèrent
coller un code.

Les couleurs de catégories portent un canal **alpha** (`#86efac90`) — la transparence est ce
qui laisse le plan visible sous la zone — alors que `<input type="color">` ne sait manipuler
que du `#rrggbb`. Le sélecteur ne touche donc qu'à la teinte et **reconduit l'alpha** déjà
saisi : `#86efac90` + teinte `#fca5a5` donne `#fca5a590`. Une saisie incomplète en cours de
frappe ne fait pas retomber la pastille sur du noir. Logique isolée dans
`src/utils/hexColorWithAlpha.js`, couverte par des tests unitaires et un test de montage du
panneau.

### Les constats de l'audit géolocalisation sont tous traités

Suite directe de l'audit ci-dessous : les 7 points du plan d'action de
`docs/AUDIT_GEOLOCALISATION_2026-09.md` sont appliqués (état point par point en §6 du
document).

- **Plausibilité géographique du calage (C1)** — le trou que l'audit BDD d'août avait
  mesuré en production est fermé côté code : un calage dont les points GPS sont alignés
  ou confondus, ou dont les échelles m/% sont incompatibles entre paires d'ancres
  (ratio > 8 ; le cas prod était à 26), est **refusé à l'enregistrement** (400 explicite)
  et **bloqué dans l'outil prof** avec un message détaillé. L'outil affiche désormais
  l'**échelle déduite** (« plan ≈ L m × H m ») pour un contrôle à vue. La résolution de
  la transformation passe par les différences au premier point avec un test de
  singularité **relatif** (plus d'epsilon absolu inopérant à l'échelle d'un site). Les
  calages déjà stockés ne sont pas invalidés à la lecture ; sur un plan au calage
  invraisemblable, le suivi affiche « calage incohérent — signalez-le à un professeur »
  (`bad_georef`) au lieu d'un faux « hors zone » (C4).
- **Erreurs d'acquisition visibles (C2)** — « Position indisponible » et « Délai
  dépassé » s'affichent dans la bannière et l'infobulle du bouton, au lieu d'un
  « Acquisition… » sans fin.
- **Pas de position périmée rejouée (C3)** — l'arrêt du suivi purge la dernière position
  et l'erreur ; la réactivation attend un fix frais.
- **e2e (C8)** — `e2e/map-gps-follow.spec.js` : calage d'un plan par l'API admin,
  géolocalisation simulée Playwright, bouton « Me suivre », bannière, sortie de zone.
- **Docs (C5)** — `docs/API.md` acte l'exposition publique des ancres `georef` (choix
  assumé) et documente le nouveau 400 ; la doc de référence `carte-et-zones.md` décrit
  l'échelle affichée, les refus expliqués et les états de la bannière.
- **Micro-hygiène (C6, C7)** — transformation résolue une fois par jeu d'ancres
  (`useMemo` + `applyGeoTransform`), objets des hooks stabilisés.

### Audit du système de géolocalisation

État des lieux complet du suivi GPS de la mascotte et du calage des plans, sans
modification de code : **`docs/AUDIT_GEOLOCALISATION_2026-09.md`**. Le système est petit,
bien découpé et bien testé, et la position de l'élève ne quitte jamais son appareil. Trois
constats appellent une action — le principal (C1) reprend le §3.1 de l'audit BDD d'août :
la validation des ancres ne contrôle toujours rien dans le repère géographique, et le
garde-fou logiciel (plausibilité d'échelle), dissociable du recalage terrain resté
réservé, n'a jamais été livré. S'y ajoutent deux erreurs d'acquisition invisibles pour
l'élève (C2) et deux comportements mineurs (position périmée rejouée, calage dégénéré
affiché comme « hors zone »). Plan d'action proposé en fin de document, points 1 à 4
regroupables en un lot « robustesse du calage GPS ».
### Un inventaire « Zones & repères » dans les Réglages administrateur

Nouveau sous-onglet **Réglages administrateur → « Zones & repères »** : la liste de
toutes les zones et de tous les repères, **toutes cartes confondues** — là où la
recherche de la carte ne couvre que le plan affiché.

- **Recherche libre** avec le même moteur que la barre de la carte (nom, espèces,
  catégories, textes de visite, note d'un repère), plus des filtres **type**
  (zones seules / repères seuls) et **carte**.
- Chaque ligne montre l'emoji, le nom, le type, la carte, les catégories et le
  nombre d'espèces associées.
- **Édition rapide** des champs textuels : nom et description d'une zone ; libellé,
  emoji et note d'un repère (`PUT` partiel sur les routes existantes — tracé,
  position, photos, espèces, catégories et contenus de visite restent du ressort de
  la fiche sur la carte, et les permissions « Gestion zones » / « Gestion repères »
  restent exigées côté serveur).

Aucune nouvelle route ni migration. Doc : `docs/reference/foretmap/carte-et-zones.md`
(section « L'inventaire admin “Zones & repères” »).

### Les constats de l'audit stabilité/performance de septembre sont traités (sauf un, à arbitrer)

Suite directe de l'état des lieux ci-dessous : tous les constats ouverts de
`docs/AUDIT_STABILITE_PERF_2026-09.md` sont corrigés — sans changement de comportement
visible, à une exception près : le bac à sable des tutoriels (C5), tranché par arbitrage
produit en faveur de l'assainissement serveur.

- **Marché G&L (G1, G2)** : la page de marché se charge en requêtes groupées — une requête
  par table au lieu de quatre par échange, soit un coût **constant** (6 requêtes) quelle
  que soit la taille de page ; et les rafraîchissements déclenchés par les événements de
  classe (`useGLMarketTrade`, `useGLSpellCast`) sont **étalés de 0 à 600 ms** comme côté
  ForetMap. Le pic de ~2000 requêtes SQL dans la même seconde pour 25 postes disparaît.
- **RBAC (C1)** : `getRoleBySlug` — le chemin qu'emprunte chaque requête G&L — passe par le
  cache versionné : une requête SQL de moins par requête G&L.
- **Imports G&L (G4)** : les cinq imports (chapitres, QCM, espèces, sortilèges, glossaire)
  écrivent **en transaction** (une interruption ne laisse plus de contenu amputé) et **par
  lots de 100 lignes** (un import de plusieurs centaines de lignes ne dépasse plus le délai
  d'attente du navigateur).
- **Purge (C3, G3)** : `scripts/purge-audit-logs.js` couvre désormais `gl_game_events` et
  `zone_history`, avec une rétention distincte (`--history-days`, défaut un an) ;
  `docs/CRONTAB.md` dit désormais franchement que la ligne de purge **n'est pas
  optionnelle** (données personnelles d'élèves mineurs dans `security_events`).
- **Fiches tutoriels (C5, arbitrage produit rendu)** : le contenu d'une fiche est
  **assaini par le serveur avant affichage** (mise en page, styles, images et liens
  conservés ; scripts, formulaires et pages embarquées retirés), l'aperçu s'affiche dans
  un bac à sable **sans exécution de script** (les clics — définitions du glossaire,
  liens « nouvel onglet » — sont relayés par l'application), et une fiche `.html`
  demandée directement est redirigée vers cette vue assainie. Une fiche importée qui
  reposait sur son propre code pour s'afficher doit être reprise ou proposée en lien
  externe.
- **Hygiène (C2, G5, C4)** : les séparateurs de `lib/tutorialViewCache.js` sont écrits en
  échappements (le fichier redevient visible de `grep`) ; plus aucun `LIMIT` interpolé
  (« SQL toujours paramétré », sans exception) ; `withTransaction` journalise les
  transactions lentes (seuil `FORETMAP_TX_SLOW_WARN_MS`, défaut 10 s) avec un plafond dur
  optionnel (`FORETMAP_TX_MAX_MS`, désactivé par défaut).

Chaque lot embarque ses tests (compteur de requêtes constant du marché, rollback d'un
import interrompu, cache de rôle périmé par une écriture RBAC, cibles de purge, garde-fou
de durée…) ; l'audit `docs/AUDIT_STABILITE_PERF_2026-09.md` est mis à jour constat par
constat et reste le point d'entrée fiable.


### Un audit de stabilité qui couvre enfin le jeu et les briques partagées

Les deux audits précédents portaient sur ForetMap. Celui-ci étend l'examen à **Gnomes &
Licornes** et aux **composants communs aux deux produits**, et devient le point d'entrée
unique sur la tenue en charge : `docs/AUDIT_STABILITE_PERF_2026-09.md`. Aucun code n'est
modifié dans ce lot — c'est un état des lieux, avec l'ordre de traitement suggéré.

Ce qu'il relève, résumé : **l'affichage du marché du jeu coûte jusqu'à quatre-vingts requêtes
à la base**, et comme un échange modifié prévient toute la classe en même temps et sans
décalage, une seule action peut en déclencher deux mille d'un coup. **Les imports de contenu
du jeu** (chapitres, QCM, espèces, sortilèges) écrivent ligne à ligne, sans transaction : un
import long dépasse le délai d'attente côté navigateur pendant que le serveur continue, et
l'import des chapitres — le seul qui supprime avant de réécrire — peut laisser un chapitre
amputé si on l'interrompt. Côté briques communes, **une vérification de rôle échappe au cache**
sur le seul chemin qu'emprunte le jeu, et **deux tables de journal grossissent sans purge**.

L'audit note aussi, pour ne pas les réauditer, les points **vérifiés et sains** (bornes des
tampons mémoire, caches de réglages, calculs de gating sans accès base, index des chemins
chauds) et récapitule tout ce que les lots précédents ont déjà corrigé.

Détail : `docs/AUDIT_STABILITE_PERF_2026-09.md` (nouveau) ; renvois depuis
`docs/AUDIT_CHARGE_SERVEUR_2026-08.md`, `docs/AUDIT_CHARGE_ET_BUGS_2026-08.md`,
`docs/EXPLOITATION.md`, `docs/CRONTAB.md` et `CLAUDE.md`.

### Le serveur encaisse mieux les pics (audit charge & bugs)

Audit complet du code — bugs, incohérences, postes de charge — dont les constats sont
consignés dans `docs/AUDIT_CHARGE_ET_BUGS_2026-08.md`. Le premier audit mesurait le régime
nominal ; celui-ci regarde les **cas dégradés et les pics**, là où se produisent justement
les arrêts forcés du process que personne n'arrivait à expliquer.

**Un envoi volumineux ne peut plus faire tomber le serveur.** La limite de 25 Mo par
requête était appliquée à des **familles entières d'adresses** : valider une tâche, poster
un commentaire ou enregistrer un réglage ouvrait la même porte que l'import d'un tableur.
Or le serveur met tout le contenu reçu en mémoire avant de le lire — une seule requête de
cette taille pouvait tripler sa consommation, et deux simultanées suffisaient
vraisemblablement à provoquer l'arrêt forcé, donc la coupure. Trois paliers remplacent ce
réglage unique : 2 Mo pour les échanges ordinaires, 8 Mo pour les contenus illustrés,
25 Mo pour les seuls imports. S'y ajoute une limite **par photo** (8 Mo), qui n'existait
pas du tout : un message pouvait en porter trois de n'importe quelle taille.

**L'enregistrement d'une photo ne fige plus le site.** L'écriture du fichier sur le disque
était **bloquante** : pendant toute sa durée, le serveur ne répondait plus à personne — ni
aux autres élèves, ni à la surveillance, ni au temps réel. Elle est désormais asynchrone.

**Trois pages coûtaient beaucoup plus cher qu'il n'y paraissait.** La liste des zones
rapatriait **tout** l'historique de récolte de toutes les zones pour n'en afficher que cinq
lignes par zone ; la liste des tutoriels chargeait le contenu HTML complet de chaque fiche
alors qu'elle ne l'affiche jamais ; la page de visite publique — accessible sans compte —
enchaînait huit requêtes à chaque consultation, sans jamais rien mémoriser. Les trois sont
corrigées : historique découpé côté base, colonnes limitées à l'utile, et contenu de visite
mis en cache jusqu'à la prochaine modification.

**Une classe entière ne se bouscule plus au même instant.** Quand un professeur valide une
tâche, tous les postes de la salle étaient prévenus et rechargeaient **exactement en même
temps**. Un léger décalage aléatoire étale désormais ces rechargements, sans que personne
ne voie la différence.

**Deux expositions refermées.** La sonde de synchronisation, qui révèle l'identité du
processus et le rythme d'activité du site, était accessible **sans être connecté** : elle
exige un jeton (vérifié au coût le plus faible, pour ne pas alourdir ce qu'elle sert à
alléger). Et le mot de passe chiffré était masqué « à la main » à huit endroits avant
l'envoi au navigateur : c'est maintenant une liste blanche unique — une colonne sensible
ajoutée demain ne partira pas au navigateur par simple oubli.

**Enfin, le jeu Gnomes & Licornes reçoit la protection déjà posée côté ForetMap** : ses
connexions temps réel cessent de réessayer indéfiniment quand la session a expiré.

Détail : `lib/jsonBodyLimit.js`, `lib/publicUser.js`, `lib/visitContentCache.js` (nouveaux),
`lib/uploads.js`, `lib/userContentImages.js`, `lib/profileUpdate.js`, `lib/mediaLibrary.js`,
`routes/zones.js`, `routes/tutorials.js`, `routes/visit.js`, `routes/auth.js`,
`routes/students.js`, `routes/rbac.js`, `server.js`, `src/utils/realtimeRefreshDelay.js`,
`src/hooks/useForetmapRealtime.js`, `src/gl/hooks/useGLMarketTrade.js`,
`src/gl/hooks/useGLSpellCast.js` ; tests `tests/server-load-hardening.test.js`,
`tests/sync-state-and-scope-cache.test.js`, `tests-ui/utils/realtimeRefreshDelay.test.js` ;
docs `docs/AUDIT_CHARGE_ET_BUGS_2026-08.md`, `docs/AUDIT_CHARGE_SERVEUR_2026-08.md`,
`docs/API.md`, `docs/EXPLOITATION.md`, `docs/reference/foretmap/stats-forum-et-suivi.md`.

### Les réessais réseau ne se retournent plus contre la classe

Suite du diagnostic précédent : la boucle de réessai était bien dimensionnée pour un
redémarrage serveur, mais chaque requête la parcourait **pour son compte**, sans jamais
rien apprendre des autres.

**Une fenêtre de réessai partagée.** Un cycle de rafraîchissement lance neuf requêtes en
parallèle ; pendant une coupure, chacune retentait donc jusqu'à huit fois — près de
soixante-dix requêtes par poste. Dans une salle, tous les postes sortent par la **même IP
publique** : le plafond de l'API (1200 requêtes/minute) était atteint par les réessais
eux-mêmes, et un `429` n'est pas réessayé — l'élève récoltait « Trop de requêtes » au
moment précis où le serveur revenait. Désormais, la première requête qui constate
l'indisponibilité ouvre une pause que les autres attendent (plafonnée à 5 s pour ne jamais
bloquer une action), et la première réponse correcte la referme pour tout le monde. Un
`429` ouvre la même pause, au lieu de laisser les requêtes sœurs creuser le trou.

**Un serveur qui « pend » n'échoue plus du premier coup.** Le délai d'attente de 40 s
levait une erreur immédiate, sans aucun réessai : la fenêtre de reprise ne couvrait que les
coupures franches et les réponses de passerelle, pas un démarrage à froid qui traîne. Une
seconde tentative est accordée — aux seules lectures, un délai dépassé ne disant pas si le
serveur a traité la requête (rejouer un enregistrement pourrait le dupliquer), et deux
tentatives au maximum, chacune coûtant déjà 40 s d'attente.

**Et ce délai couvre enfin la réponse entière.** Il était désarmé dès l'arrivée des
en-têtes : une réponse tronquée en cours de route laissait la requête pendante
indéfiniment, sans plus aucune limite de temps.

**Le temps réel cesse de marteler avec un jeton refusé.** Quand la session expire, le
serveur refuse la connexion Socket.IO ; le client, réglé pour se reconnecter indéfiniment,
rejouait le même jeton toutes les 1 à 5 secondes — et le transport étant du long-polling,
chaque tentative était une requête HTTP. La reconnexion s'arrête maintenant sur un refus
d'authentification (le rafraîchissement périodique prend le relais) et repart d'elle-même
dès qu'un nouveau jeton est disponible. Une base momentanément injoignable, elle, reste
traitée comme une panne passagère : la reconnexion continue.

**Un compte supprimé est enfin vu par la sonde de synchronisation.** Le `401` remonté par
`GET /api/sync-state` était traité comme une sonde muette ; la session restait ouverte
jusqu'à ce qu'un autre appel remonte la même réponse.

Détail : `src/shared/apiRetryGate.js` et `src/utils/realtimeAuthRejection.js` (nouveaux),
`src/shared/fetchJsonWithRetry.js`, `src/services/apiTransport.js`,
`src/hooks/useForetmapRealtime.js`, `src/hooks/useAppDataSync.js` ; tests
`tests-ui/shared/apiRetryGate.test.js`, `tests-ui/utils/realtimeAuthRejection.test.js`,
`tests-ui/hooks/useForetmapRealtime.test.jsx`, `tests-ui/shared/fetchJsonWithRetry.test.js`,
`tests-ui/apiTransport.test.js`, `tests-ui/hooks/useAppDataSync.test.jsx` ; docs
`docs/EXPLOITATION.md`, `docs/reference/foretmap/presentation.md`.

### Le serveur ne reste plus en panne tout seul (déconnexions à répétition)

Diagnostic parti d'un symptôme simple : des « déconnexions » et des tentatives de
reconnexion qui s'enchaînent sans fin. La boucle de réessai (8 tentatives sur ~25 s)
n'était pas en cause — elle faisait son travail. Trois défauts en amont l'étaient.

**Une panne MySQL au démarrage n'est plus définitive.** Si `initDatabase()` échouait au
boot, l'erreur était seulement journalisée : le process restait debout avec sa base
marquée « non prête », donc **tout `/api/*` répondait `503` jusqu'à un redémarrage
manuel** — pendant que `/api/health` répondait `200`, si bien que le keepalive
entretenait un service inutilisable. Une indisponibilité MySQL de deux secondes au
mauvais moment coûtait ainsi une demi-journée. L'initialisation est désormais **reprise
automatiquement** (2 s, 5 s, 10 s… jusqu'à une tentative par minute) et son état est
exposé dans `GET /api/admin/diagnostics` (champ `databaseInit`), en tête du rapport
`npm run prod:uptime-report`.

**Une coupure passagère ne vide plus l'écran.** Chaque domaine du rafraîchissement
(zones, tâches, plantes, repères, tutoriels, cartes) repliait son échec sur une liste
**vide**, appliquée telle quelle à l'affichage : la carte et les tâches disparaissaient
le temps d'une coupure, ce qui se lit comme une perte de données. Les données du dernier
chargement réussi sont maintenant conservées. Corollaire : comme l'erreur était avalée,
le compteur d'échecs ne montait jamais et le bandeau **« Serveur indisponible »** ainsi
que le repli du polling à 2 minutes n'étaient quasiment jamais atteints — ils
fonctionnent à nouveau.

**Le diagnostic dit enfin la vérité sur deux points.** Un redémarrage demandé depuis
l'IHM admin (`restart-gui`) était compté comme un arrêt de l'hébergeur : trois clics
suffisaient à produire le verdict `host_idle_stops` et à conseiller un keepalive
Passenger sans rapport. Et un `SIGTERM` reçu **avant** l'ouverture du port ne laissait
aucune trace d'arrêt — le démarrage suivant était alors classé « process tué sans
signal », verdict `hard_kills`, qui envoie l'opérateur vers les quotas LVE d'o2switch
pour rien. Les gestionnaires de signaux sont désormais posés dès la première ligne du
démarrage. Enfin, la liste « derniers évènements » du rapport respecte la fenêtre
demandée (`--hours=`) au lieu de piocher dans tout le journal.

Détail : `lib/databaseInitRetry.js` (nouveau), `server.js`, `routes/admin-ops.js`,
`src/hooks/useAppDataSync.js`, `lib/bootJournal.js`, `scripts/prod-uptime-report.js` ;
tests `tests/database-init-retry.test.js`, `tests/boot-journal.test.js`,
`tests-ui/hooks/useAppDataSync.test.jsx` ; docs `docs/API.md`, `docs/EXPLOITATION.md`,
`docs/reference/foretmap/presentation.md`.
### Catégories de zones et de repères

Deux mécanismes hétérogènes classaient les lieux de la carte : un **état de culture**
(`zones.stage` : Vide / En croissance / Prêt à récolter) et une **case « zone spéciale »**
(`zones.special`). Le filtre carte les mélangeait en un axe unique — une zone d'infrastructure
ne pouvait pas être « en croissance » — l'état était de toute façon dérivé automatiquement des
espèces saisies (`empty` = aucune espèce, `growing` = au moins une) et n'était consommé nulle
part : ni statistique, ni alerte. Les repères, eux, n'avaient **aucune classification**, et
cocher une case d'état les faisait **tous disparaître** de la carte.

Ces deux champs sont remplacés par de **vraies catégories**, partagées par les zones et les
repères :

- une catégorie est **globale** (toutes les cartes) ou **propre à une carte** ; elle peut être
  restreinte aux zones, aux repères, ou valoir pour les deux ;
- un lieu peut en porter **plusieurs** ; la carte se filtre dessus (OU logique), repères
  compris ;
- une case **« Infrastructure »** reprend intégralement le comportement de l'ancienne case
  « zone spéciale » : pas de section Biodiversité en visite, lieu jamais proposé comme cible
  de mission, contour en pointillés ;
- gestion dans **Réglages administrateur → « Catégories de lieux »** (permission
  `zones.manage`) : libellé, emoji, couleur, description, ordre, portée, activation.

**Reprise des données** : la migration `204` crée une catégorie **Infrastructure** globale et y
rattache toutes les zones qui portaient `special = 1`. Aucun historique de récolte n'est touché
— `zone_history` dépend de `current_plant`, jamais de `stage`.

**Contrat d'API** : les zones et les repères exposent désormais `categories`, `category_ids` et
`is_infrastructure`, et acceptent `category_ids` en écriture. `special` reste en **réponse**
comme miroir déprécié de `is_infrastructure` mais **n'est plus accepté en entrée** ; la colonne
`stage` n'est plus ni lue ni écrite par l'application. Nouveau routeur `/api/map-categories`.

Nettoyage au passage des constantes mortes de `src/constants/garden.js` (`SPECIAL_EMOJI`,
`SPECIAL_DESC` : des catégories codées en dur sur les identifiants de zones du Lyautey, sans
aucun consommateur) et de `stageBadge`.

### Les rapports d'audit s'ouvrent enfin — et seulement pour qui de droit

Cliquer sur **SITE_ISSUES** depuis l'onglet « À propos » ouvrait un onglet affichant
`{"error":"Token requis"}`. Ce n'était ni une régression ni un problème de droits : les
deux entrées étaient de simples `<a href>` pointant vers des routes protégées par
`admin.settings.read`. Une navigation de navigateur n'emporte aucun en-tête
`Authorization`, et le jeton vit dans le stockage local, pas dans un cookie — **ces liens
ne pouvaient donc fonctionner pour personne**, administrateur compris, depuis leur
création.

Second défaut, plus discret : ils étaient proposés à **tout le monde, élèves compris**,
alors qu'ils annoncent un inventaire des faiblesses connues du site.

Les deux rapports quittent donc la liste des liens publics. Ils apparaissent maintenant
dans un encart **« Audit interne »** visible des seuls détenteurs du droit de lecture des
réglages, et le clic récupère le document avec le jeton de session puis l'affiche dans la
page — plus d'onglet, plus de JSON brut. Un refus affiche une phrase lisible qui rappelle
le droit nécessaire et le cas de la session expirée.

Le reste de la carte « Documentation » (présentation, journal des versions, guide
d'installation, API…) reste public et inchangé.

Détail : `src/components/about-views.jsx`, `src/components/app/PedagoTabs.jsx`,
`src/App.jsx` ; doc `docs/reference/foretmap/comptes-roles-et-groupes.md` ;
tests `tests-ui/AboutView.test.jsx`.

### CSP : mesurer avant de durcir

L'application ne posait qu'un `img-src` — **ni `default-src`, ni `script-src`** : aucune
atténuation d'XSS par CSP sur la SPA (audit du 26/08, §2.5). Poser d'un coup une politique
complète aurait été le geste risqué : une CSP trop stricte casse l'application **en silence**,
côté navigateur, sans qu'aucun test serveur ne s'en aperçoive.

**Ce lot ne durcit donc rien : il mesure.** La politique imposée reste le `img-src` historique,
strictement inchangée. À côté d'elle, une politique candidate complète (`default-src 'self'`,
`script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'`, `base-uri`, `form-action`,
`frame-ancestors`…) part en `Content-Security-Policy-Report-Only` : le navigateur ne bloque rien,
il **signale** ce qui serait bloqué. C'est la donnée qui manquait pour décider.

Chaque directive a été établie par inspection du build, pas par recopie d'un modèle : le HTML
construit ne contient aucun script inline ; le runtime Rive est servi **depuis notre origine**
(`src/utils/riveRuntime.js` remplace les URL unpkg/jsdelivr), donc `'wasm-unsafe-eval'` suffit et
aucun CDN tiers n'est nécessaire ; `frame-src 'self' https:` parce qu'un tutoriel de type « lien »
embarque une URL externe saisie par un professeur. `lib/csp.js` porte ce raisonnement en
commentaire, directive par directive.

**Le collecteur ne peut pas noyer les journaux.** `POST /api/csp-report` (`lib/cspReport.js`)
regroupe les signalements par (directive violée, origine bloquée), vide ses compteurs toutes les
60 s et écrit alors **une seule ligne** portant les totaux, avec au plus 40 signatures distinctes
suivies. Corps borné à 16 ko, réponse toujours `204`. Sur un hébergement mutualisé qui tombe déjà
par épuisement de ressources, un `report-uri` sans ces gardes aurait ajouté au problème qu'il sert
à comprendre.

Reste une décision, pas un développement : **promouvoir** la politique candidate en politique
imposée quand les signalements se seront tus en usage réel. `tests/csp.test.js` (15 tests) contient
un test qui échoue si quelqu'un le fait sans le décider.
### Anti-kills LVE — allègement mémoire polling

Réduction des pics RSS (SIGKILL CloudLinux) sans retirer de fonctionnalité visible :
listes `GET /api/tasks` et `GET /api/zones` allégées, archives tâches chargées à la demande
(vue « Archivés »), corps JSON global à **2 Mo** (préfixes médias/imports à **25 Mo**),
batch gating summary, cache glossaire quiz, liste packs mascotte sans `pack_json` plein.

### Conditionnement granulaire FM/GL (cascade site → type → fiche)

Les paramètres de session et de verrou (erreurs tolérées, questions par session, délai et
portée du verrou, granularité GL) ne sont plus figés au site : ils s’héritent et se
surchargent par type de contenu puis par fiche (et, en GL, par chapitre/scope). Éditeur
commun, parité API `type-policy` GL, runtime et doc de référence alignés.

### Lisibilité carte — unification Visite et GL

Variables CSS `--map-overlay-*` partagées sur le plan visite et les plateaux GL ;
libellés optionnels sur les repères visite, alignés sur le moteur typographique ForetMap.

### Le verrou après erreurs tolérées ne tombait jamais

Le réglage « erreurs tolérées avant blocage » (`allowed_wrong_attempts`) comptait une
faute, puis **oubliait** la suivante. Pour porter le compteur sans verrouiller, la ligne
recevait `locked_until = NOW()` — déjà échue. La lecture suivante traitait toute date
passée comme « série soldée, on recommence à zéro » : avec une tolérance à 2, la 2ᵉ, la
3ᵉ et la 20ᵉ faute restaient la « première ». L’annonce promise à l’élève (« 2 erreurs
permises, puis 3 jours ») n’avait donc aucun effet. Le comptage utilise désormais une
date sentinelle (1970), distincte d’un vrai verrou expiré.
### Audit de refactoring : `src/App.jsx` remis à hauteur de vue

**`src/App.jsx` passe de 1 808 à 1 457 lignes, sans changement de comportement.** Le shell de
l'application avait ré-accumulé quatre responsabilités qui n'y appartiennent pas : le cycle de
rechargement des données, l'écran d'accueil non authentifié, trois copies du même loader, et
quatre dérivations de droits écrites deux fois chacune. Rien de ce lot ne modifie l'UI ni l'API —
c'est un déplacement de code, appuyé par 30 tests unitaires neufs sur les parties devenues pures.

**Le cycle de données quitte le composant.** `fetchAll` (≈ 250 lignes : polling différentiel via
`/api/sync-state`, refetch ciblé par domaine, boucle de rafraîchissements concurrents, bandeau
« serveur indisponible ») vit désormais dans `src/hooks/useAppDataSync.js` avec les quatorze états
de domaine qu'il pilote. La cadence de rafraîchissement — intervalle adaptatif selon le temps réel,
l'onglet navigateur et les onglets « calmes », plus le refetch en quittant un onglet secondaire —
part dans `src/hooks/useAppDataPolling.js`. `App.jsx` n'en garde que deux appels et un objet de
contexte mémoïsé ; les seuils codés en dur (90 s en temps réel, 120 s en arrière-plan) deviennent
des constantes nommées.

**Trois dérivations dupliquées deviennent des helpers purs testés.** `canManageTutorials` et
`canManageQuiz` étaient le même bloc à un nom de permission près (`src/utils/appAccess.js`) ;
`canParticipateForum` et `canParticipateContextComments` aussi (même fichier) ; la portée des
cartes selon le rôle était écrite une fois dans le mémo `visibleMaps` et une fois à l'intérieur de
`fetchAll`, avec la résolution de carte active qui va avec (`src/utils/appMapScope.js`). Le
calcul du nom affiché, recopié à quatre endroits, rejoint `src/utils/appIdentity.js`.

**Le JSX répété devient quatre composants.** `AppLoader` (trois copies du loader « feuille »),
`AppFooter` (deux copies du pied de page « Version »), `AppUserDialog` (les modales statistiques
et profil partageaient overlay, croix et zone défilante au caractère près) et
`UnauthenticatedShell` (écran de connexion + visite invitée, avec ses deux gestionnaires jusque-là
écrits en flèches inline dans le rendu). Trois objets de style et un tableau vide passent en
constantes de module, et la cible de la modale statistiques est mémoïsée : autant de props qui
cassaient les `React.memo` des vues à chaque rendu du shell.

### La mascotte de visite suit enfin le compte, et `App` gagne ses premiers tests de rendu

**Le choix de mascotte d'un compte connecté n'était jamais enregistré.** `App.jsx` calculait bien
un persisteur (`onPersistVisitMascotId`) mais ne le passait à personne, alors que `MapTasksArea`,
`PedagoTabs` et `VisitView` acceptent tous la prop, que la route `PUT /api/visit/mascot-preference`
existe, est testée et documentée, et que la doc de référence promet déjà que « avec un compte, la
mascotte suit la personne, pas l'appareil ». Le choix retombait donc sur le stockage local : il ne
suivait pas l'élève d'un appareil à l'autre, et une tablette partagée le transmettait à l'élève
suivant. Quatre props branchées, rien d'autre à écrire — tout le mécanisme était déjà là.

**Effet de bord à connaître :** un compte qui avait un choix mémorisé dans son navigateur repart
sur la mascotte par défaut à la première visite, jusqu'à ce qu'il rechoisisse — le stockage local
n'est plus lu dès lors que la mascotte vit dans le compte.

**Au passage, `profileTargetUser` ne se recalculait pas sur la mascotte.** La dépendance
`sessionUser?.visit_mascot_catalog_id` manquait : « Mon profil » rouvrait sur la mascotte
précédente juste après un changement depuis le plan.

**`App` n'avait aucun test de rendu — il en a quatre.** Le nouveau
`tests-ui/AppShellWiring.test.jsx` monte réellement le composant, avec de simples sondes à la
place des grosses vues, et couvre les deux branches (session élève, session prof, shell invité)
plus le fait que le persisteur appelle bien la route du compte. Ce test a immédiatement rattrapé
une **zone morte temporelle introduite par le lot de refactoring ci-dessus** : `handleProfileUpdated`
listait `updateTeacherSession` dans ses dépendances alors que ce `const` était déclaré plus bas
dans le corps du composant — un `ReferenceError` à chaque rendu de l'écran authentifié, invisible
pour le lint, le build et les 3 153 tests existants, puisque aucun ne montait `App`.

### L'audit de refactoring est documenté, et ce qu'il a coûté aussi

**`docs/AUDIT_REFACTORING_APP_2026-08.md`** rend compte du chantier : l'inventaire de ce que
contenait `src/App.jsx`, la carte de ce qui en est sorti, le défaut fonctionnel trouvé (la
mascotte qui ne suivait pas le compte) — et le post-mortem de la régression que le refactoring a
lui-même introduite. Ce dernier point est le plus utile du document : un `ReferenceError` levé à
**chaque rendu** de l'écran authentifié a été poussé, sa CI est passée au vert, et ni le lint, ni
le build, ni 3 153 tests ne l'ont vu — parce qu'aucun ne montait `App`. C'est un test écrit
ensuite, pour une correction sans rapport, qui l'a rattrapé.

**Les quatre valeurs GL calculées puis ignorées entrent au registre d'arbitrage**
(`docs/reference/INCOHERENCES.md`, entrée **G15**), rédigées pour leur public : ce que chaque cas
donne probablement à l'écran, et deux options à trancher. Elles ne sont pas « nettoyées » — les
supprimer effacerait la trace de ce qui manque.

**Les acquis passent dans les règles plutôt que dans un document qu'on oublie de rouvrir.**
`CLAUDE.md`, `.cursor/rules/foretmap-conventions.mdc` et les skills `foretmap-context` /
`foretmap-testing` portent désormais les trois consignes issues du chantier : pas d'`import React`
pour du JSX, `no-use-before-define` bloquant sur la zone morte temporelle, et **poser un test de
montage avant** de refactorer un composant racine — pas après.

### Les 460 fichiers de tests React n'étaient lintés par personne

**`tests-ui/**` n'apparaissait dans aucun bloc `files:` d'`eslint.config.cjs`** : ESLint répondait
`File ignored because no matching configuration was supplied` et passait son chemin. Un tiers du
code du dépôt échappait donc à `no-undef`, `no-unused-vars` et aux garde-fous ajoutés cette
semaine — dont l'interdiction de la zone morte temporelle.

Le trou se comble presque sans bruit : sur 253 avertissements révélés, **247 étaient encore des
imports `React` morts** (même cause que côté `src/`) et **six seulement** étaient réels — trois
déstructurations `form` jamais lues, un paramètre de mock, deux imports morts. Après nettoyage,
`tests-ui` linte à **zéro avertissement**, et la règle qui a rattrapé le plantage d'`App.jsx`
couvre désormais aussi les tests.

Le bloc reprend les règles de `src/**` sans celles des Hooks : un test **monte** des composants,
il n'en déclare pas.

### Code mort : la moitié du reste part, l'autre moitié est signalée plutôt que masquée

**33 avertissements de plus en moins, sans rien masquer.** Une fois le bruit `React` retiré, les
100 variables réellement mortes sont devenues lisibles. Celles dont la suppression ne peut rien
changer sont traitées : dix `catch` dont l'erreur n'était pas lue passent à `catch (_)` (la
convention déjà en place dans le dépôt), onze imports morts disparaissent, et sept paramètres
conservés pour la signature sont préfixés `_` — dont le `next` du gestionnaire d'erreurs Express,
qui **doit** garder ses quatre arguments pour être reconnu comme tel.

**Le reste n'est pas du bruit, et n'est donc pas supprimé.** Plusieurs de ces variables mortes
ressemblent à du comportement perdu, pas à de l'oubli — exactement le profil du persisteur de
mascotte jamais branché. Les faire taire les enterrerait une seconde fois. Les cas repérés,
laissés visibles dans le lint et à trancher :

- `lib/glJournalPresent.js` — quatre valeurs calculées puis jamais rendues (`xp`, `yp`,
  `deltaStr`, `reasonPart`) dans le module qui **met en forme** les entrées de journal.
- `GLFeuilletZonePlateauPanel` reçoit `mapImageFrame` de `GLChaptersAdminView` et ne s'en sert
  pas, alors que `GLChapterMapStudio` l'applique bien via `glImageFrameToStyle` : l'aperçu du
  plateau ignore donc probablement le cadrage configuré du plan de chapitre.
- `useGLKingdomZoneEditor` déclare et documente une option `onDeleteZone` qu'il ne lit jamais
  (la suppression passe en fait par `GLKingdomZoneSidePanels`).
- `GLGameMasterConsoleLive` reçoit `currentTeamId` et ne l'utilise pas, contrairement à
  `GLGameBoard` et `GLMapView`.

### 394 imports `React` morts en moins : le lint redevient lisible

**Trois quarts des avertissements du lint étaient un seul faux problème.** Sur 523
avertissements, **394** disaient `'React' is defined but never used` — le vestige de l'ancien
runtime JSX, que `@vitejs/plugin-react` a rendu inutile (runtime *automatic* : le compilateur
injecte lui-même `jsx()`, plus besoin de `React` dans la portée). Sept fichiers du dépôt
écrivaient déjà du JSX sans aucun import `react` et étaient livrés sans problème : la preuve
était sous les yeux.

Ce bruit avait un coût réel : c'est exactement ce qui a permis à un `onPersistVisitMascotId`
jamais branché de passer inaperçu pendant des mois dans la même liste d'avertissements. **Le lint
passe de 523 à 129 avertissements**, et les 100 variables réellement mortes qui restent
deviennent enfin visibles.

Suppression purement mécanique : seul le binding `React` disparaît de l'import (les imports
nommés `useState`, `useMemo`… sont conservés), et uniquement dans les fichiers où plus aucune
ligne de **code** ne référence l'identifiant — les mentions `React.ReactNode` en JSDoc ne
comptent pas, celles en code (`React.memo`, `React.Fragment`) gardent leur import.

### Le lint attrape désormais la zone morte temporelle

**Le bug qui a cassé l'écran authentifié était détectable par une règle ESLint standard.** Un
`const` déclaré plus bas dans le corps d'un composant, référencé depuis un tableau de dépendances
de hook, lève un `ReferenceError` à **chaque rendu** — et ni le build, ni le lint tel qu'il était
configuré, ni 3 153 tests ne le voyaient. `no-use-before-define` (variables uniquement ; les
déclarations de fonction restent hissées, donc libres d'ordre) est activée en **erreur** sur
`src/**` : elle signale exactement ce motif, et fait donc échouer la CI.

**Coût d'activation : cinq réordonnancements.** `settings-admin-views.jsx` référençait `saveSetting`
depuis quatre points de rendu situés avant sa déclaration, et `quizGlossaryReveal.js` sa constante
`EMPTY_ITEMS`. Aucun des deux ne plantait — les appels arrivaient après l'évaluation — mais les
deux étaient à un déplacement de ligne du même accident. `load` et `saveSetting` remontent avant
`renderSettingField`, l'ordre du source suit maintenant celui des dépendances.

### Le versionnage, les branches et deux noyaux communs (v1.136.0)

**Le numéro de version s'incrémente désormais après la fusion, plus dans la PR.** Une branche
qui bumpait revendiquait un numéro *avant* de savoir quand elle fusionnerait : deux PR
ouvertes en parallèle prenaient le même, et le conflit était garanti sur `package.json` **et**
`package-lock.json`. Mesuré sur les quatre PR du 26/08 : 8 des 88 conflits portaient sur cette
seule ligne, pour trois renumérotations manuelles. `.github/workflows/version-bump.yml` déduit
le niveau SemVer du message de fusion (`feat` → mineur, `type!:` → majeur, le reste →
correctif), et le commit de bump déclenche à son tour la création du tag et de la release.
Bumper explicitement dans une PR reste possible pour forcer un niveau — le workflow le détecte
et s'abstient, donc rien n'est à désapprendre en urgence.

**Le tri des branches reposait sur un chiffre faux.** L'audit du 26/08 annonçait « 79 branches,
32 fusionnées, 46 non fusionnées ». Ces chiffres venaient d'un **clone superficiel** : sur un
tel clone, une branche ancienne n'a pas d'ancêtre commun visible, `git branch --merged` la
classe « non fusionnée », et `git diff main...branche` échoue en renvoyant un diff **vide** —
qu'un tri automatique lit volontiers comme « n'apporte rien ». Sur l'historique complet :
**53 fusionnées, 26 non fusionnées**. `scripts/prune-merged-branches.sh` refuse désormais de
tourner sur un clone superficiel plutôt que de produire un tri faux, et revérifie chaque
branche avec `merge-base --is-ancestor` avant toute suppression.

**Les 26 branches non fusionnées sont toutes superséquées**, vérifié défaut par défaut plutôt
que par la date : récurrence des tâches archivées, `validated` écrasé par un recalcul
concurrent, `reponse_correcte` exposée, jeton de QCM rejouable, usurpation d'identité, photos
de journaux de tâche, cloisonnement de la médiathèque, double vitalité, exports XLSX — tous
fermés dans `main`, souvent par une réimplémentation **meilleure** que la proposition d'origine.
Aucune n'est à fusionner.

**Deux noyaux communs de plus entre ForetMap et Gnomes & Licornes.** Les deux paires les plus
dupliquées du rapport sont traitées : commentaires contextuels (bornes de saisie, normaliseur
de type, décision de réaction) et filtre des liens ressource ↔ question. Le compteur ne bouge
que modestement — ce qui restait, ce sont les handlers CRUD, qui diffèrent là où les produits
diffèrent. Ce qui a été extrait était la duplication coûteuse : des bornes portant des **noms
différents pour des valeurs identiques**, qu'aucun `grep` ne rapprochait, et l'ordre des
critères d'un filtre SQL, qui fixe l'ordre des `?`. Les 12 tests livrés n'éprouvent pas
seulement les noyaux : ils **interdisent le retour de la duplication**, et vérifient que les
types de contexte des deux produits restent disjoints.

**Documentation** — `docs/VERSIONING.md`, `CLAUDE.md` et le skill `foretmap-release` décrivent
le nouveau flux ; `docs/PARTAGE_FM_GL.md` §9.2 explique pourquoi le gain mesuré est modeste et
pourquoi c'est le bon résultat ; l'audit corrige ses chiffres de branches plutôt que de les
effacer.

### Durcissements issus de l'audit du 26/08 (v1.135.0)

**La chaîne de publication des releases était cassée depuis toujours.**
`.github/workflows/release-tag.yml` interpolait le corps des notes — un extrait de ce fichier —
directement dans un script shell. GitHub substitue une expression `${{ … }}` dans le **texte du
script** avant que bash ne l'analyse : le Markdown était relu comme du code, l'étape échouait, et
comme le tag est poussé juste avant, le dépôt accumulait les tags sans jamais publier de release
(**134 tags, 0 release**). Les notes passent désormais par l'environnement, donc opaques à bash —
ce qui ferme du même coup un sink d'injection alimenté par le CHANGELOG, sous `contents: write`.
Un second défaut aurait maintenu l'étape rouge : `[Non publié]` est un accumulateur, il pesait
731 Ko, soit six fois le plafond GitHub. Le corps est borné à 60 000 octets avec un lien vers le
journal complet.

**Une URL `/api/…` inconnue renvoyait `200 text/html`.** Le fallback SPA attrapait aussi les
chemins d'API : un client appelant un endpoint supprimé ou mal orthographié recevait un
**succès**, puis échouait au `res.json()` sur du HTML, avec un message qui ne désignait pas la
cause. La supervision, elle, ne pouvait plus distinguer « endpoint disparu » de « tout va bien ».
Réponse désormais `404 { "error": "Route introuvable" }`, toutes méthodes ; les chemins hors
`/api` retombent toujours sur l'application (`/apiculture` reste une route d'application).

**Mot de passe des comptes à privilèges.** Le réglage `security.password_min_length` vaut 4 par
défaut — assumé pour des élèves de sixième, hors de proportion pour un compte qui porte
`admin.impersonate`, c'est-à-dire la prise de contrôle de n'importe quel compte. Le réglage garde
son sens (plancher **élève**) ; les comptes professeur et administrateur reçoivent un plancher
propre de **12 caractères**, jamais inférieur. Les mots de passe déjà en place restent valides :
la règle ne joue qu'à la création ou au changement. Le point était signalé depuis juin (G8).

**Dépendances.** `npm audit fix` sans changement cassant : **8 vulnérabilités → 2**, les
**quatre `high` fermées** — dont deux sur Socket.IO (épuisement de connexions et de mémoire),
exactement la classe de défaut visée par le journal de cycle de vie du lot 30. Seul
`package-lock.json` change. Restent deux `moderate` sur la chaîne `exceljs` → `uuid`, dont la
correction exigerait une rétrogradation cassante : assumées.

**Garde de profondeur sur l'image de tâche.** Le repli `GET /api/tasks/:id/image` est public par
conception, comme `/uploads/tasks/…`. Il lisait cependant `image_path` sans vérifier la
**famille** d'`uploads/` visée : un chemin pointant vers `observations/` ou `task-logs/` aurait
servi sans authentification un média que le montage statique refuse — la garde contournée par
une route API, alors que sa raison d'être écrite est l'inverse. Aucun chemin d'écriture actuel ne
produit une telle valeur ; l'invariant est fermé plutôt que le seul cas connu.

**Collision de numéros de migration : échec plus rapide.** Le contrôle existait déjà et il est
correct ; ce qui manque n'est pas un garde-fou mais sa fraîcheur (deux PR parallèles peuvent
apporter le même numéro sans qu'aucune ne soit en collision au moment de sa propre CI). Il est
désormais rejoué dans le job `quality`, sans base : la collision tombe en une minute au lieu
d'être noyée derrière la suite backend.

**L'audit se corrige.** Deux de ses constats étaient inexacts et sont rectifiés dans
`docs/AUDIT_GENERAL_2026-08-26.md` plutôt qu'effacés : la prétendue exposition des photos de
tâches (§2.1, en réalité un choix documenté et arbitré à l'audit B2) et la recommandation d'un
contrôle CI de collision de migrations (§3.1, qui existait déjà).

### Audit général du 26/08 — après fusion des quatre dernières PR

`docs/AUDIT_GENERAL_2026-08-26.md`. Relecture transversale menée **avec une base MariaDB
réelle**, donc en exécutant l'application plutôt qu'en la lisant : suites backend et UI
complètes, `db:init` sur base vierge, et sondage des endpoints contre un serveur en
`NODE_ENV=production`. Aucun fichier de code applicatif n'est modifié par ce lot.

Trois constats reproduits appellent une correction rapide : les photos de tâches sont servies
sans authentification alors que la liste publique des tâches en fournit les identifiants ;
une URL `/api/…` inconnue renvoie `200 text/html` (l'index de la SPA) au lieu d'un `404`
JSON ; huit vulnérabilités npm subsistent en dépendances de production, dont deux `high` sur
Socket.IO corrigeables sans changement cassant.

Un quatrième constat ne relève d'aucune suite de tests : **le workflow « Release tag » n'a
jamais publié une seule release** — 134 tags pour zéro release, et un échec à chaque push sur
`main`. Une interpolation `${{ … }}` du CHANGELOG dans un script shell fait relire les notes
de version comme du code. Le correctif tient en trois lignes.

Le rapport chiffre par ailleurs le coût du versionnement de `dist/` : sur les quatre PR
fusionnées, **80 des 88 conflits portaient sur des fichiers générés**. Et il vérifie ce que
l'audit du 23/08 signalait — quatre de ses cinq points les plus graves sont fermés.

### Les fiches ne s'ouvrent plus derrière ce qui les appelle (lot 31)

Constat de départ : **des fiches demandées, mais invisibles**. Cliquer un terme de
glossaire depuis un quiz ouvert en fenêtre ouvrait bien la définition — derrière le quiz.
Le diagnostic a montré que ce n'était pas un cas isolé mais un symptôme : les deux
applications avaient dérivé sur **deux échelles d'empilement sans rapport** (ForetMap de
80 à 99 999, G&L de 55 à 12 050), et les surfaces *partagées* par les deux portaient une
valeur en dur, donc calibrée pour une seule d'entre elles.

**Ce qui était cassé, et qui est réparé :**

- La **fiche glossaire ForetMap** s'ouvrait sous le popover de quiz qui l'appelait.
- La **fiche glossaire G&L** s'ouvrait sous la découverte de feuillet qui l'appelait.
- La **question de contrôle de compréhension G&L** était enterrée sous la barre du haut
  et la barre de navigation.
- La **fiche espèce G&L** passait sous la barre de navigation.
- L'**accueil des mascottes** (ForetMap) passait sous la barre de navigation basse.

**L'onglet Glossaire est enfin accessible aux professeurs.** Il était rendu pour les deux
branches, mais seule la barre élève l'exposait : un professeur ne pouvait l'atteindre
qu'en cliquant un terme dans un contenu, puis « Voir la fiche complète ».

**Une seule échelle, partagée par les deux produits** (`src/shared/styles/z-layers.css`).
Une couche y vaut pour un *rôle* — modale, popover de contenu, fiche, validation, visite
guidée — et non pour un composant. L'invariant qui ferme les inversions ci-dessus est
l'ordre dans lequel les surfaces s'appellent : *un contenu ouvre une fiche de glossaire, et
depuis cette fiche on peut demander à valider le terme — jamais l'inverse.* La validation
(« j'ai lu ce tutoriel », « j'ai appris ce terme ») est donc la couche réellement terminale,
au-dessus des fiches ; elle se distingue de la simple *fenêtre* du quiz, qui reste sous les
fiches qu'elle ouvre.

**Ce que la refonte supprime plutôt qu'elle n'ajoute :**

- Les **deux patchs identiques** qui remontaient les modales au-dessus du plein écran,
  écrits mot pour mot de chaque côté (`map-fullscreen.css` et `gl-theme.css`) : dans
  l'échelle commune, le plein écran est un conteneur de vue, donc déjà sous les dialogues.
- Les **deux surcharges G&L** qui rabaissaient une coque partagée sous la navigation.
- Le **doublon de jetons** `--fm-toast-z` / `--fm-z-toast` (deux noms, deux valeurs, un
  seul rôle) et la double déclaration de `--fm-z-nav`.
- G&L ne recalibre plus aucun palier : `--fm-modal-overlay-z` disparaît de son thème.

**Davantage de code commun aux deux applications.** La délégation de clic sur un terme
auto-lié était écrite deux fois à l'attribut de données près : elle devient
`bindGlossaryLinkClick`. La mécanique de rendu qui l'entoure — produire le HTML lié,
**retomber sur un texte sans liens plutôt que casser l'écran** si l'auto-lien échoue,
brancher l'écouteur — était répétée dans quatre composants : elle devient le hook
`useGlossaryLinkedHtml`. Un terme mal formé en base ne peut plus faire disparaître le
texte que l'élève est en train de lire, et ce repli n'est écrit qu'une fois.

Un garde-fou (`tests-ui/utils/zLayers.test.js`) verrouille l'ordre des paliers, interdit
qu'une feuille redéclare l'un d'eux ou rechoisisse un `z-index` global en dur, et vérifie
que les patchs de plein écran ne reviennent pas.
### Une seule liste, vraiment : plus de modèles, et tout se supprime

Deux restes de l'ancienne organisation traînaient encore au studio, et se lisaient exactement
comme ce que la fusion catalogue / packs devait supprimer : **une liste de choses qu'on ne peut
pas toucher**.

**Le menu « Partir d'un modèle livré »** affichait seize noms au-dessus de la liste — donc, à
l'écran, une seconde liste. Il faisait doublon avec « Dupliquer le pack sélectionné », qui part de
la ligne en base et copie **aussi les images téléversées** là où le clone catalogue repartait de
la version d'usine. Il a disparu : pour créer une mascotte, on part d'un brouillon, ou on en
duplique une.

**Les mascottes livrées ne se supprimaient pas.** Le refus avait une raison réelle — le semis
réinsère toute livrée absente, donc la suppression se serait annulée au prochain
`npm run db:migrate`, des semaines plus tard, sans prévenir. Ce n'était pourtant pas une
fatalité, seulement une mémoire qui manquait : la suppression est désormais **inscrite en base**
(migration 202), et le semis la respecte. Toutes les lignes de la liste se suppriment donc de la
même façon.

Deux conséquences valaient d'être traitées avant de livrer, pas après :

- Une livrée supprimée n'a **plus de ligne** — et le repli catalogue sert justement les mascottes
  sans ligne. Sans filtrage, la suppression aurait réussi au studio **sans rien changer pour les
  visiteurs**. C'est le même piège que celui déjà rencontré sur la dépublication, et il est
  refermé de la même façon.
- La confirmation dit maintenant ce que la suppression coûte, avant le clic : elle est définitive,
  les images partent avec, et le retour en arrière passe par `npm run visit:mascots:restore` —
  qui rend l'apparence d'origine, pas les modifications.

Les mascottes livrées gardent « Réinitialiser depuis l'origine » **en plus** de « Supprimer » :
c'est ce qui rend leur édition sans risque.

### Le studio peut à nouveau ouvrir — et enregistrer — les packs Rive et spritesheet

Ouvrir au studio une mascotte à moteur **Rive** ou **spritesheet** affichait aussitôt une erreur,
sans que personne ait rien modifié :

> Champ « stateFrames » réservé aux packs « sprite_cut » : ce pack est « rive ».

Le pack était pourtant valide tel qu'il était enregistré. C'est **le passage par le studio qui
l'invalidait** : la fonction qui met le brouillon au propre écrivait `stateFrames` sans regarder le
moteur, et posait donc un objet vide sur des packs auxquels ce champ est interdit. L'enregistrement
devenait impossible, et le message désignait un champ que l'utilisateur n'avait jamais saisi.

Quatre des six mascottes proposées étaient concernées, ainsi que les dix mascottes Rive laissées au
studio par le lot précédent — c'est-à-dire, en pratique, presque tout ce qu'on pouvait y ouvrir.

`stateFrames` n'est désormais écrit que pour les packs `sprite_cut`, et un `stateFrames` hérité d'un
JSON écrit à la main est retiré du brouillon plutôt que conservé — sans quoi le pack resterait
inenregistrable sans qu'on sache quoi corriger.

C'est le même défaut, sous la même forme, que celui déjà fermé sur `framesBase` : un champ propre à
un moteur écrit pour tous. Le nouveau test porte donc sur la **propriété générale** — un pack valide
le reste après le studio, quel que soit son moteur — de façon à attraper la prochaine fuite quel que
soit le champ en cause.
### Savoir enfin pourquoi le serveur tombe (lot 30)

Constat de départ : des indisponibilités régulières, y compris avec un seul utilisateur et
sans manipulation lourde — et **aucun moyen de savoir pourquoi**. `startup.log` et
`startup-diag.log` sont écrasés à chaque démarrage : ils décrivent le démarrage courant, pas
l'histoire. Après coup, il ne restait rien.

**Un journal de cycle de vie survit maintenant aux redémarrages.** À chaque démarrage,
chaque arrêt maîtrisé et chaque crash, une ligne est ajoutée à `logs/boot-journal.ndjson`
(hors dépôt, borné, écriture best-effort). L'information décisive n'est pas le nombre de
redémarrages mais **leur nature** : un démarrage qui n'est précédé d'aucun arrêt tracé
signifie que le process a été tué sans signal — c'est la signature d'un plafond mémoire ou
processus de l'hébergeur, indiscernable jusqu'ici d'un simple redémarrage de déploiement.

**Quatre causes, quatre traitements.** Le champ `restarts` de `GET /api/admin/diagnostics`
(fenêtre réglable par `?restartsWindowHours=`) rend un verdict et la conduite à tenir :
redémarrages de déploiement (`deploy_churn`), arrêts d'inactivité Passenger
(`host_idle_stops`), crash applicatif (`crashes`), process tué par LVE (`hard_kills`) — ou
`stable`, auquel cas l'application n'est pas en cause et il faut chercher côté réseau,
navigateur ou frontal. Lecture en clair depuis le poste de travail :
**`npm run prod:uptime-report`** (`-- --hours=168`, `-- --json`).

**Une rafale de merges ne fait plus qu'un redémarrage.** Le cron de déploiement attend
désormais une accalmie (`DEPLOY_QUIET_SECONDS`, défaut 180 s) avant d'appliquer une tête
distante : plusieurs PR fusionnées d'affilée produisaient auparavant autant de fenêtres
d'indisponibilité que de commits.

**Le keepalive passe à `*/3`.** La cadence de 5 minutes documentée jusqu'ici tombait pile sur
le seuil d'inactivité par défaut de Passenger (300 s) et laissait passer un arrêt sur deux.
La ligne est ajoutée au mémo `docs/CRONTAB.md`, qui compte désormais quatre lignes ; la sonde
`uptime-check.sh` reste ce qu'elle est — elle constate et alerte, elle ne maintient pas
éveillé.

**Les diagnostics ne se taisent plus quand la base tombe.** `GET /api/admin/diagnostics` et
`GET /api/admin/logs` étaient soumis au verrou de readiness qui renvoie `503
SERVICE_NOT_READY` sur tout `/api/*` : en cas de panne MySQL, l'outil qui sert à
diagnostiquer était donc muet exactement quand il fallait le lire. Ils sont désormais
exemptés de ce seul verrou — la garde `DEPLOY_SECRET` et le refus pendant un redémarrage
restent inchangés.

Détail : `lib/bootJournal.js`, `docs/EXPLOITATION.md` (§ Indisponibilités récurrentes),
`docs/CRONTAB.md`, `docs/API.md`, `docs/AUDIT_CHARGE_SERVEUR_2026-08.md` §2.E ;
tests `tests/boot-journal.test.js`, `tests/api-availability.test.js`.
### Correctif — le délai après une erreur ne tombait jamais dans Gnomes & Licornes

Une mauvaise réponse au contrôle de compréhension, dans le flux « marquer appris » de
Gnomes & Licornes, devait verrouiller la fiche pendant le délai réglé (3 jours par
défaut). L'écriture du verrou était refusée par la base (nombre de colonnes et de
valeurs différent), l'erreur était avalée, et l'élève pouvait réessayer tout de suite.
ForetMap n'était pas touché. Le verrou se pose à nouveau côté Gnomes & Licornes.

### La sensibilité de l'aimant de contour se règle, elle aussi (lot 29)

**Le rayon d'accroche était réglable, pas le seuil de contraste.** L'aimant qui colle un
sommet de zone sur les limites visibles du plan exigeait un contraste figé dans le code :
sur un plan dessiné il tombait juste, mais sur une photo aérienne où deux parcelles se
ressemblent, la limite réelle passait sous le seuil et l'aimant restait muet — sans qu'on
puisse rien y faire. À l'inverse, personne ne pouvait le rendre plus strict quand il
accrochait une ombre plutôt qu'un bord de parcelle.

Un second curseur, **« sensibilité »**, apparaît à côté du rayon quand l'aimant est prêt.
Il parcourt dix niveaux, du plus exigeant — seules les limites franches attirent le sommet
— au plus permissif, qui accroche aussi les transitions ténues. Le niveau par défaut
reproduit exactement le comportement précédent : rien ne change pour qui n'y touche pas.

- **Nouvel utilitaire** — `sensitivityToMinStrength` dans `src/utils/edgeSnap.js` traduit
  le niveau choisi en contraste minimal, sur une échelle explicite de dix valeurs. Un
  niveau hors bornes est ramené dans l'échelle, une valeur illisible retombe sur le défaut
  plutôt que de désactiver l'aimant.
- **Réglage transmis partout** — le glissement d'un sommet et le bouton « 🧲 Coller »
  (recalage groupé) utilisent le même seuil.
- **Tests** — 4 cas sur l'échelle, dont la vérification qu'un contour ténu est ignoré au
  niveau le plus strict et accroché au plus permissif ; 1 cas sur la barre d'outils ;
  1 cas sur la transmission du réglage jusqu'à l'aimant.
- **Documentation** — les deux réglages sont décrits dans « Retoucher le contour d'une
  zone » (`docs/reference/foretmap/carte-et-zones.md`), et le point d'attention sur les
  photos peu contrastées indique désormais quoi régler.
### Le glossaire se valide, et ne donne plus la réponse (lot 28, suite)

**Le glossaire ForetMap porte un bouton « J'ai appris ce terme ».** Il était purement
consultatif : rien ne distinguait un terme travaillé d'un terme jamais ouvert et, surtout, le
contrôle de compréhension n'avait aucun geste auquel se rattacher — une question rattachée à un
terme ne conditionnait rien du tout, et rien ne le signalait. Gnomes & Licornes savait valider un
terme depuis longtemps ; ForetMap le fait maintenant aussi, avec le même bouton, le même popover
et les mêmes pastilles d'état. Le cœur des accusés d'apprentissage devient commun aux deux
applications : une seule différence subsiste, celle que les produits imposent — G&L identifie son
lecteur par un couple (type, identifiant), ForetMap par son compte.

En conséquence, **les trois types de contenus ForetMap sont désormais validables**, et un lien
bloquant sur un terme de glossaire a enfin un sens.

**Le glossaire ne donne plus la réponse.** Les termes reconnus dans l'énoncé d'une question et
dans les propositions de réponse étaient cliquables : sur une question du type « Comment
appelle-t-on le processus par lequel… ? », ouvrir le terme lié **donnait la réponse**. Ce qui
devait aider à comprendre servait à deviner. Le texte reste affiché tel quel — aucun mot n'est
masqué —, mais rien ne s'ouvre tant que l'élève n'a pas répondu ; la liste « Glossaire utile »
suit la même règle, pour la même raison. Après la réponse, tout revient : c'est le moment où
aller lire la définition est utile. La règle est commune aux deux applications et vaut aussi pour
l'aperçu du professeur ou du MJ, qui doit montrer ce que l'élève verra.

### Le conditionnement devient visible, et enfin armable (lot 28)

Constat de départ : **rien n'apparaissait jamais**. Le diagnostic a montré que le mécanisme
n'était pas cassé — il n'était jamais armé. Trois conditions doivent être réunies (interrupteur
allumé, lien **approuvé**, lien **coché bloquant**) et aucune ne l'était par défaut, sans que
rien ne le dise.

**L'écran de rattachement dit maintenant où on en est** : interrupteur allumé ou éteint, nombre
de questions bloquantes, contenus couverts, propositions en attente. Un avertissement distinct
prévient quand l'interrupteur est allumé mais qu'aucun lien n'est bloquant — le cas le plus
fréquent derrière « rien ne se passe ».

**Les propositions s'approuvent d'un geste.** Le rattachement automatique enregistre en
« proposé », statut sans effet ; il fallait quarante changements de liste déroulante pour
quarante propositions, et personne n'allait au bout. Approuver n'est pas conditionner : le
caractère bloquant reste coché ligne par ligne.

**L'écran couvre les trois types de contenus.** Il ne servait que les tutoriels ; fiches
espèces et glossaire n'avaient aucun point d'entrée, alors que le moteur d'appariement les
couvre. Chacun est traité par la méthode qui lui convient : rapprochement de contenu pour un
tutoriel, recherche du libellé pour une espèce ou un terme.

**Un lien bloquant sur un type non validable est refusé, avec un message qui dit pourquoi.**
Côté ForetMap, un terme de glossaire ne se valide pas : un lien bloquant y restait inerte pour
toujours, sans un mot, et le professeur croyait avoir conditionné la fiche.

**Des pastilles d'état** accompagnent les boutons de validation : **✓** acquis, **?** questions
restantes, **🔒** bloqué. Rien ne s'affiche là où rien n'est conditionné ni sur un contenu déjà
validé — une marque partout ne signalerait plus rien. La forme porte l'information, la couleur
ne fait que la renforcer.

**L'annonce, les pastilles et le popover sont désormais partout.** L'aperçu de tutoriel, la
section visite et le bouton « Espèce découverte » n'annonçaient rien ; le popover n'existait
qu'à un seul endroit. Les quatre points d'entrée de Gnomes & Licornes en héritent aussi : le
produit n'avait ni annonce ni popover.

**La ré-observation d'une espèce est conditionnée comme la première.** Elle empruntait une
branche de code entièrement séparée : une fois l'espèce observée, plus aucune question n'était
jamais posée sur cette fiche. Ce n'était pas une décision, c'était une divergence.

**L'onglet Quiz peut ouvrir la question en fenêtre**, en complément de l'affichage pleine page.

**Deux réglages corrigés.** « Annoncer le contrôle sur le bouton » était un réglage **mort** :
exposé dans les deux grilles, consulté par aucun code. Il prend effet. S'y ajoute « Afficher les
pastilles d'état ». Les deux valent pour les deux applications.

**Un défaut de sérialisation corrigé** : les routes `challenge` calculaient `ask_count` et
`allowed_wrong_attempts` sans les transmettre. Le plafond de questions par session ne
s'appliquait donc jamais, et les règles annoncées promettaient un blocage dès la première erreur
même quand des essais étaient tolérés.

**Ce qui a été mutualisé** : le calcul d'état (`learningGatingState`), la pastille d'icône, le
popover, le hook de résumé, la sérialisation des réponses, l'approbation en lot, le garde-fou de
type et la feuille de style — que Gnomes & Licornes ne chargeait pas, alors qu'il utilisait déjà
les composants. G&L gagne au passage la route de résumé par lot qu'il n'avait pas.

Aucun changement de comportement à réglages par défaut.
### Les mascottes livrées qui ne peuvent pas s'animer ne sont plus proposées

Dix des seize mascottes livrées déclarent une animation **Rive** et pointent vers
`/assets/rive/*.riv`. Aucun de ces fichiers n'existe, et l'historique du dépôt montre qu'**aucun
n'a jamais été versionné** : ces entrées ont toujours décrit des animations absentes.

À l'écran, l'échec était **silencieux par conception** : le chargement échouait, le rendu basculait
sur la silhouette dessinée, et un visiteur voyait un joli dessin parfaitement immobile sans aucun
moyen de comprendre que ce n'était pas prévu. Le sélecteur promettait dix personnages animés dont
pas un ne bougerait jamais.

Elles ne sont donc plus proposées aux visiteurs. Elles **restent au studio**, marquées « Livrée »,
modifiables et exportables : les republier est un clic, le jour où les fichiers arrivent. Le
sélecteur ne propose plus que des mascottes réellement animées.

La règle se **mesure** — le fichier existe-t-il ? — plutôt que de figer une liste de dix
identifiants : déposer les `.riv` suffira à les faire revenir sur une installation neuve. Les
installations déjà en service sont rattrapées **une seule fois** au démarrage, avec une marque de
passage : republier délibérément une de ces mascottes est un choix légitime, qu'aucun redémarrage
ne doit défaire en silence.


### Lancer un script de maintenance depuis cPanel, sans terminal

Le terminal cPanel n'est pas toujours disponible, et plusieurs opérations d'exploitation n'avaient
alors aucun chemin documenté. `docs/EXPLOITATION.md` décrit désormais les deux voies qui marchent
sans lui — le bouton **Run JS Script** de *Setup Node.js App*, et une tâche **cron à usage unique**
qu'on supprime après passage — avec le piège qui fait échouer la seconde neuf fois sur dix : le
script lit `.env` **relativement à la racine du dépôt**, donc le `cd` préalable n'est pas
décoratif.

Le bouton *Run JS Script* attend un **nom de script npm**, pas un chemin de fichier : quatre alias
sont ajoutés pour que le compactage des registres d'aide y soit accessible en un clic —
`gl:help:compact:dry` / `gl:help:compact` et `help:compact:dry` / `help:compact`, la variante
« dry » ne touchant à rien.


### Le conditionnement devient une brique commune aux deux applications (lot 27)

Suite de l'audit [docs/AUDIT_GATING_2026-08.md](docs/AUDIT_GATING_2026-08.md). Trois constats de
plus corrigés, un quatrième bloqué faute de donnée — et l'ensemble du dispositif mutualisé entre
ForetMap et Gnomes & Licornes.

**Chaque application redéfinissait les mêmes réglages de son côté**, avec ses propres bornes, et
les deux avaient fini par diverger : GL avait la granularité que ForetMap n'avait pas, ForetMap
avait la tolérance d'erreurs et le plafond de questions que GL n'avait pas. Un réglage ajouté d'un
côté restait invisible de l'autre. Il existe désormais un **catalogue commun** : un descripteur par
réglage, dont les deux tables sont dérivées. Ajouter une ligne l'ajoute aux deux applications, avec
la même sémantique. GL hérite du coup de tous les réglages nés côté ForetMap.

**Le professeur voit enfin qui est bloqué.** Un élève pouvait rester plusieurs jours sans pouvoir
valider, sans que personne ne le sache ni ne puisse le débloquer. Nouvel écran **« Élèves
bloqués »** : qui, quelle fiche, quelle question ratée, combien d'erreurs, jusqu'à quand — et un
bouton pour lever le verrou. Le même écran sert les deux applications.

**Une erreur ne condamne plus forcément toute la fiche.** Nouveau réglage de **portée du blocage** :
la fiche entière (comme avant) ou la seule question ratée, l'élève pouvant alors poursuivre sur les
autres. Se tromper sur une question ne dit rien de ce qu'on sait des autres.

**Les questions mal formulées se repèrent.** Nouveau tableau des **taux de réussite par question**,
les plus ratées en tête. Une question que presque tout le monde rate est rarement difficile — le
plus souvent son énoncé laisse deux lectures. Le signalement n'apparaît qu'avec assez de tentatives :
sur deux essais, 0 % ne prouve rien.

**Le rattachement automatique couvre les trois types de ressources.** Il ne servait que les
tutoriels ; fiches espèces et termes de glossaire attendaient une ligne de commande. Chacun est
traité par le moteur qui lui convient : rapprochement de **contenu** pour un tutoriel, recherche du
**libellé** dans l'énoncé pour une espèce ou un terme.

**Le réglage « marquage automatique sur bonne réponse » a disparu.** Lu et exposé des deux côtés,
il n'était consulté par aucune décision depuis le retrait de l'auto-marquage.

**Un constat n'a pas pu être corrigé** : le contrôle ignore toujours le niveau des questions, parce
que l'application ne sait pas en quelle classe est un élève — cette information n'existe nulle part
en base. Livrer l'interrupteur sans la donnée aurait fait un second réglage sans effet. L'audit dit
ce qu'il faut trancher avant de l'implémenter.

### Un schéma en retard se dit, au lieu de rendre « Erreur serveur »

Signalé en production juste après la mise à jour : le studio mascotte répondait
**« Erreur serveur [requête … ] »**, un message qui ne dit ni ce qui manque ni quoi faire.

**Cause.** Le serveur **n'applique pas les migrations à son démarrage** — `initDatabase()` ne
fait qu'un ping ; la colonne `origin`, le semis des mascottes livrées et la bascule de
visibilité vivent dans `initSchema()`, donc dans `npm run db:migrate` (l'étape de migration du
déploiement, conditionnée à `DEPLOY_AUTO_MIGRATE=1`). Un déploiement qui remplace les fichiers
sans jouer cette étape met le nouveau code devant l'ancien schéma : la requête du studio demande
une colonne absente, et l'erreur SQL retombait sur le 500 générique.

**Ce qui change.** Une colonne absente sur `visit_mascot_packs` répond désormais **503** en
nommant la colonne et la commande : « Schéma MySQL en retard sur le code : colonne `origin`
absente. Appliquer les migrations (`npm run db:migrate`) puis redémarrer — le démarrage ne les
applique pas tout seul. » Même traitement que la table absente, qui était déjà expliquée.

**Correction de documentation.** Le lot précédent annonçait « le semis se fait au démarrage » et
« aucune action requise » : c'était faux, et c'est précisément ce qui pouvait faire sauter
l'étape de migration. CHANGELOG, `docs/API.md`, doc de référence et en-têtes des trois modules
concernés disent maintenant que ces trois opérations font partie des **migrations**.

Aucune migration. Aucun changement de comportement du studio lui-même : ses routes ont été
exercées une à une contre une base à jour, sans aucun 5xx.
### Le contrôle de compréhension prévient avant de frapper (lot 26)

**Audit du dispositif** dans [docs/AUDIT_GATING_2026-08.md](docs/AUDIT_GATING_2026-08.md). Trois
constats corrigés ici, quatre documentés.

**Il n'existait aucun entre-deux.** La première mauvaise réponse verrouillait la ressource entière
pour trois jours — en mode « toutes », une erreur à la quatrième question sur cinq annulait tout.
Et régler le délai à zéro supprimait toute vérification : rien ne limitait les tentatives, il
suffisait de réessayer jusqu'à tomber juste. Nouveau réglage **« Erreurs tolérées avant blocage »**
(0 par défaut, comportement inchangé) : le professeur peut accorder une ou deux erreurs avant que
le verrou ne tombe. Le compteur repart à zéro dès que le verrou expire.

**L'élève découvrait l'épreuve après s'être engagé.** Le bouton disait « ✓ Marquer comme lu », rien
de plus ; l'annonce n'arrivait qu'une fois la fenêtre ouverte. Un élève pouvait déclencher trois
jours de blocage sans avoir su qu'il jouait quelque chose. Le bouton porte désormais une pastille
(« 1 question », « 🔒 » si la validation est bloquée), alimentée par un **résumé groupé** — une
seule requête pour toute la liste des tutoriels, pas une par carte.

**Les règles sont énoncées avant de commencer** : combien de questions maintenant, combien il en
restera, combien d'erreurs sont permises, ce que coûte une erreur de trop, et le rappel
qu'abandonner ne coûte rien.

**La question s'affiche maintenant dans un panneau qui surgit par-dessus la page**, au vocabulaire
visuel du popover de glossaire, plutôt que dans une modale pleine largeur : le tutoriel qu'on vient
de lire reste visible derrière, et l'exercice ressemble moins à un examen.

**Plus de marathon** : nouveau réglage **« Questions posées d'affilée au maximum »** (3 par défaut).
En mode « toutes », une ressource portant huit questions bloquantes les enchaînait sans plafond ;
l'élève avance désormais par paliers, ses bonnes réponses restant acquises.

Restent documentés comme points d'attention, non corrigés : le professeur **ne voit pas** quels
élèves sont bloqués, le conditionnement **ignore le niveau** des questions, et le réglage
_marquage automatique sur bonne réponse_ demeure un reliquat sans effet.

### Une seule liste de mascottes, et la « liste figée » disparaît (fusion catalogue/packs, étape 3)

Le studio n'affiche plus qu'**une** liste de mascottes, livrées comprises, chacune portant son
origine (**Livrée** / **Créée ici**). Le volet séparé « Mascottes livrées » et le détour par
« Éditer une copie » disparaissent : une mascotte livrée s'ouvre et se modifie directement.

**Le défaut de fond est fermé.** Une mascotte importée pouvait rester invisible aux visiteurs
sans que rien ne le signale : le réglage `ui.visit.mascot.allowed_ids` était une **liste blanche
d'identifiants**, qui ignorait par construction toute mascotte ajoutée après sa pose. Ce réglage
est **supprimé**. Proposer une mascotte aux visiteurs, c'est la **publier**, là où on la modifie.
Une restriction existante est reportée sur les publications **quand les migrations sont appliquées**
(`npm run db:migrate`, joué par le déploiement), puis le réglage est effacé.

**Ce qui change pour un professeur :**

- une mascotte livrée se modifie, s'exporte et se retire de la visite comme les autres ;
- **« Réinitialiser depuis l'origine »** lui rend son apparence d'origine à tout moment — on peut
  donc l'essayer sans rien perdre. La réinitialisation ne touche pas à sa publication ;
- **supprimer** une mascotte livrée est refusé, avec l'explication : l'application la recréerait
  au démarrage suivant. Les deux gestes qui durent sont nommés (la retirer de la visite, ou la
  réinitialiser) ;
- **importer une archive « en remplacement » sur une mascotte livrée la change vraiment**, sous
  son identifiant — c'était impossible auparavant, l'archive créait une mascotte à côté ;
- partir d'un modèle livré reste possible ; ceux qui n'ont **qu'une image fixe** y sont signalés.

**Ce qui change pour un administrateur :** **Paramètres → Mascottes de visite** ne règle plus que
la **mascotte par défaut**, et signale le cas où celle-ci a été retirée de la visite.

Correctif au passage : un pack `rive` ou `spritesheet` était refusé par le serveur au nom d'un
champ `framesBase` qu'il ne porte pas — quinze des seize mascottes livrées étaient en réalité
inenregistrables — et, s'il passait, la ligne écrite ne pouvait plus être relue.

Aucune migration. Aucune action requise.

### Les mascottes livrées deviennent des packs éditables (fusion catalogue/packs, étape 2)

Les seize mascottes fournies avec l'application vivaient dans le code : ni modifiables, ni
supprimables, ni exportables autrement qu'en les clonant. Elles sont désormais **semées dans la
même table que les packs** — au moment où les migrations sont appliquées — et se gèrent
exactement comme eux.

Concrètement : modifier une mascotte livrée fonctionne enfin, et la modification est celle qui
s'affiche. Supprimer une mascotte livrée est possible — et un redémarrage la **remet en place
telle qu'elle a été fournie**, ce qui donne un « réinitialiser depuis l'origine » gratuit.

**Ce qui protège l'existant :**

- une ligne modifiée n'est **jamais** écrasée par un redémarrage ;
- le catalogue en code reste en **filet** : si le semis échoue, les mascottes continuent d'être
  proposées. Vidage complet de la table testé — le sélecteur reste peuplé ;
- une mascotte qui ne se convertit pas est **écartée et nommée**, pas semée à moitié.

**Le semis fait partie des migrations, pas du démarrage** : `initDatabase()` ne fait qu'un ping,
c'est `npm run db:migrate` (étape de déploiement) qui pose la colonne, sème les mascottes et
reporte la visibilité. Un déploiement qui remplace les fichiers sans jouer cette étape laisse le
studio devant un schéma en retard ; il le dit maintenant explicitement au lieu de rendre
« Erreur serveur ».

Migration `198_visit_mascot_packs_origin.sql` (ajout de la colonne `origin`).


### Le format de pack mascotte décrit les trois moteurs (fusion catalogue/packs, étape 1)

Arbitrage rendu sur l'audit : c'est la piste radicale qui est suivie — **fusionner le catalogue
livré et les packs en un registre unique**. Première étape, celle qui débloque tout le reste.

Le format de pack ne savait décrire qu'un moteur sur trois. Or **onze** mascottes livrées sont en
`rive` et **quatre** en `spritesheet` : tant que le format les ignorait, elles ne pouvaient pas
devenir des packs, et le catalogue en code restait un univers parallèle — avec ses droits, son
outillage et ses incohérences propres.

Un pack peut désormais annoncer `sprite_cut`, `spritesheet` ou `rive`, et porter le bloc
correspondant. **Un pack en décrit un seul** : porter les champs d'un autre est refusé, avec le
champ nommé, plutôt qu'arbitré en silence — un pack à moitié converti ne doit pas passer.

Les packs `sprite_cut` déjà enregistrés valident **à l'identique**.

Étapes suivantes, à livrer séparément : le semis des mascottes livrées dans la table (migration),
puis le studio à liste unique où « réinitialiser depuis l'origine » remplace le masquage.


### Les questions se rattachent enfin aux tutoriels, à la main ou toutes seules (lot 22)

**Le contrôle de compréhension était injoignable.** Le serveur savait exiger des questions
avant de valider la lecture d'un tutoriel — modes, seuils, délai après erreur — mais aucun
écran ne permettait de relier une question à une fiche. Allumer l'interrupteur ne changeait
donc rien : sans lien, la validation restait une simple case à cocher. Seul Gnomes & Licornes
disposait de cet écran.

**Nouvel écran professeur** « Rattacher des questions aux tutoriels », dans l'onglet Quiz,
organisé par tutoriel. On y rattache une question (recherche par code ou par texte), on la
rend bloquante ou non, on approuve ou rejette, et on fixe l'exigence propre à la fiche —
jusqu'à la dispenser. La liste de gauche annonce, pour chaque tutoriel, le nombre de
questions bloquantes et de propositions en attente.

**Rattachement automatique par le contenu.** Un bouton compare le texte des questions et
celui des tutoriels — énoncé, réponse rédigée, tags et explication d'un côté ; titre, résumé
et corps de la fiche de l'autre — et propose les rapprochements trouvés, avec un pourcentage
de confiance et les mots qui les ont motivés. Le moteur existant ne cherchait que le *titre*
de la ressource dans l'énoncé : il convenait à un terme de glossaire, pas à un tutoriel
(« Le compostage » n'apparaît pas dans « Que met-on dans le compost ? »).

Deux garde-fous : le premier clic **ne fait que simuler** — rien n'est écrit tant que le
professeur n'a pas confirmé —, et les propositions enregistrées arrivent en statut
« proposé », donc **sans effet sur les élèves** avant approbation une par une.

L'outil récupère au passage les **« questions liées »** saisies sur une fiche question depuis
la mise en place du modèle unifié : elles n'avaient jamais été répercutées dans le
conditionnement, la reprise initiale n'ayant eu lieu qu'une fois.

Mesuré sur le catalogue réel (10 tutoriels, 131 questions actives) : 48 rattachements
proposés, les mieux notés étant justes — compost → Compostage, mycorhize → Sol vivant,
paillage → Eau au jardin, tomate et basilic → Associations de plantes.
### Audit du système de mascottes — pourquoi la mascotte importée n'apparaît pas (documentaire)

Signalement : « la mascotte importée OLU n'est pas utilisable dans la carte ou les visites, j'ai
une liste figée à la place ». Deux causes, indépendantes, toutes deux dans le code :

- **L'import réécrit l'identifiant du pack.** Le pack OLU déclare `olu-spritesheet` pour
  remplacer la mascotte livrée ; à l'import cet identifiant est écrasé par un `srv-<uuid>`. Le
  pack devient donc une mascotte **de plus**, à côté d'un OLU silhouette. Plus largement, aucun
  chemin de code ne permet aujourd'hui de créer un pack qui remplace une mascotte livrée — la
  fonctionnalité existe côté lecture et est documentée, mais elle est inatteignable.
- **La liste d'autorisation fige le registre.** Tant qu'on n'a rien décoché, tout nouveau pack
  publié est proposé ; au **premier décochage**, la liste est gelée, et tout pack publié ensuite
  en est absent — sans message.

Contournement immédiat, sans livraison : recocher toutes les mascottes dans Paramètres →
Mascottes de visite.

L'audit décrit aussi ce qui rend l'ensemble difficile à lire — quatre portes avant qu'une
mascotte atteigne un visiteur, dont trois échouent en silence ; trois notions de « mascotte » aux
droits et outillages différents ; trois magasins d'images — et propose six pistes, de l'ajustement
à la fusion du catalogue et des packs en un registre unique.

Audit complet : `docs/AUDIT_MASCOTTES_2026-08.md`. Documentaire : aucune correction appliquée,
aucun comportement modifié, pas de montée de version.


### Le rafraîchissement ne recharge plus que ce qui a changé (lot 21)

Prolongement du lot 20, toujours sans changement fonctionnel visible :

**Refetch ciblé par domaine.** `GET /api/sync-state` expose désormais un compteur par
domaine de données (cartes, zones, tâches, plantes, repères, tutoriels, session) ;
quand quelque chose a changé, le client ne recharge que les domaines concernés au
lieu des huit appels systématiques — valider une tâche ne refait plus recharger
plantes et tutoriels. La sûreté prime : table inconnue du mapping → tout est
rechargé ; activité sans rapport (forum, jeu G&L) → rien ne l'est ; changement de
carte, redémarrage serveur ou sonde en échec → cycle complet, comme avant.

**`nodemailer` chargé au premier envoi d'email** (résets de mot de passe, alertes) :
encore ~15 Mo de mémoire rendus au démarrage, même recette que le lot 20.

**Côté Gnomes & Licornes, rien à faire** : l'audit du rafraîchissement GL confirme
qu'il est purement événementiel (Socket.IO + relectures après action), sans polling
périodique — déjà optimal.

### Le serveur travaille moins, sans rien perdre (lot 20)

Mise en œuvre du plan de l'audit charge serveur
(`docs/AUDIT_CHARGE_SERVEUR_2026-08.md`), quatre volets, aucun changement
fonctionnel visible :

**Le polling ne refait plus huit requêtes pour rien.** Avant chaque cycle de
rafraîchissement périodique, le client interroge une nouvelle sonde ultra-légère
`GET /api/sync-state` (compteur global d'écritures + identité du process) : si rien
n'a été écrit en base depuis le dernier cycle réussi, le cycle est sauté — une
requête au lieu de huit dans le cas courant « personne n'a rien changé ». Toute
écriture, un redémarrage serveur, une erreur de sonde ou un plafond de sauts
consécutifs redéclenchent un cycle complet : la fraîcheur perçue est inchangée.

**~30 Mo de mémoire rendus au serveur.** Les bibliothèques d'export/import
(tableur, PDF, ZIP, vignettes images) ne sont plus chargées au démarrage mais au
premier usage — sur mutualisé, la mémoire est le premier critère d'arrêt forcé du
process, et chaque arrêt était un redémarrage avec sa fenêtre d'indisponibilité.

**Deux requêtes SQL de moins sur chaque appel authentifié.** Le périmètre de
groupes de l'utilisateur est désormais mis en cache comme le sont déjà rôles et
permissions (invalidation garantie à la moindre écriture sur les tables de
groupes).

**Un commit de documentation ne redémarre plus la prod.** Le cron de déploiement
saute désormais le redémarrage par défaut quand le lot ne touche que docs/CHANGELOG
(revenir en arrière : `DEPLOY_SKIP_RESTART_IF_SOFT_ONLY=0` dans `.env`). Les
réglages restants côté hébergeur (Passenger mono-instance, keepalive, statique
servi par le frontal) sont documentés pas à pas dans `docs/EXPLOITATION.md`.

### « Service momentanément indisponible » ne s'affiche presque plus (lot 19)

**Le message d'erreur sortait à presque chaque redémarrage du serveur**, même avec un
seul utilisateur connecté : le client abandonnait après 4 tentatives étalées sur ~4
secondes, alors qu'un redémarrage réel (relance Passenger + initialisation de la base)
en dure couramment 10 à 30. L'application réessaie désormais jusqu'à **8 fois sur une
fenêtre d'environ 25 secondes** (backoff progressif), respecte l'en-tête `Retry-After`
que le serveur envoie maintenant avec ses 503 transitoires, et traverse donc un
redémarrage complet sans afficher d'erreur. Les 503 « métier » (module désactivé…)
gardent leur comportement immédiat.

Au passage, la panne de base transitoire pendant la vérification de session (ForetMap
et G&L) est désormais marquée `SERVICE_UNAVAILABLE` : le client sait qu'il peut
rejouer la requête sans risque, mutations comprises, au lieu d'échouer du premier coup.

### Une pastille d'état sticky en bas d'écran (lot 19)

**Les messages « Enregistrement… / Enregistré ✓ » vivaient au fil du contenu** : dès
qu'on scrollait, plus aucun retour visuel. Une **pastille discrète et fixe en bas
d'écran** (ForetMap et G&L) relaie désormais en permanence ce qui se passe :
enregistrement en cours, confirmation fugace, erreur persistante tant qu'elle n'est
pas résolue, et **« reconnexion en cours… (tentative n/8) »** pendant que le client
retente de joindre un serveur qui redémarre, suivie de « connexion rétablie ✓ ».
Elle ne bloque aucun clic, respecte les lecteurs d'écran (`aria-live`) et se place
au-dessus des toasts pour ne jamais les masquer. Les indicateurs inline existants
gagnent en lisibilité (couleurs dédiées enregistrement / succès / erreur).

En complément, un **audit de la charge serveur** (mesures mémoire/boot, profil des
requêtes, sources de redémarrage) et ses pistes de réduction sans perte
fonctionnelle : `docs/AUDIT_CHARGE_SERVEUR_2026-08.md`.
### Les boutons de Gnomes & Licornes retrouvent la police du jeu (lot 18)

**Ils s'affichaient en Arial 13 pixels**, la police par défaut du navigateur, alors que tout
le reste de l'application est composé en Caudex 16 pixels. C'est ce décalage qu'on lisait
comme une « apparence ancienne ». La cause tenait à une ligne : le remise à zéro des styles
donnait la police du jeu aux champs de saisie, mais avait oublié les boutons — un bouton
n'hérite pas de la police de son conteneur.

**Et dans les formulaires, tous les boutons se ressemblaient.** « Annuler » était aussi
sombre que « Valider », et surtout **« Supprimer » avait perdu son rouge** : un bouton
destructeur déguisé en bouton de confirmation, sur une trentaine d'écrans. Les variantes
sont rétablies. Les boutons gagnent au passage un état désactivé lisible, un survol qui se
voit aussi sur les fonds clairs, et l'alignement correct des libellés à pictogramme.

**Des pans entiers de l'interface ignoraient les couleurs choisies par le MJ.** Vingt-sept
variables de style étaient appelées sans avoir jamais été définies — le plus souvent une
faute de frappe dans leur nom. Le carnet de Séléné, plusieurs panneaux d'administration et
la vue plateau s'affichaient donc en turquoise figé, insensibles au thème de marque. Les
noms sont corrigés, les rôles qui manquaient vraiment sont ajoutés au système.

**L'administration ressemblait à un back-office générique.** Deux cents teintes de gris et
de bleu venues d'une palette par défaut se mêlaient au thème médiéval ; il en reste deux.
Les états de sélection, qui viraient au bleu système, reprennent le turquoise du produit.

**Enfin, l'harmonie avec ForetMap est rétablie** : mêmes rayons, mêmes ombres, même
géométrie de contrôles, seule la palette diffère. La bibliothèque de médias, partagée par
les deux produits, affichait des boutons non stylés d'un côté ou de l'autre selon la
commande — elle utilise désormais des contrôles neutres que chaque produit habille.

Environ 80 lignes de styles morts ont été supprimées et un conflit de sélecteur corrigé.
Audit complet et mesures : `docs/AUDIT_UI_BOUTONS_GL_2026-08.md`.
### Un contour de zone se retouche vraiment : on peut enfin ajouter et retirer des sommets (lot 15)

**Jusqu'ici, « Modifier le contour » ne savait que déplacer.** Les sommets posés au dessin
initial étaient définitifs : impossible d'en ajouter un pour épouser un décrochement de
parcelle, impossible d'en retirer un devenu inutile. La seule issue était de redessiner la
zone entière et de supprimer l'ancienne — en perdant au passage ses photos, ses tâches et
son historique.

Le mode d'édition affiche désormais une **poignée pointillée au milieu de chaque côté** :
on la tire, un sommet naît là et suit le doigt dans le même geste — sans changer d'outil,
et sans que rien ne clignote sur la carte. Pour viser un point précis d'un long côté, la
bascule « ＋ Sommet » rend le contour lui-même cliquable : le sommet se pose exactement sur
le trait, projeté sur l'arête la plus proche. La suppression se fait par la touche Suppr ou
le bouton « 🗑 », avec le garde-fou des **trois sommets minimum** déjà imposé par l'API.

- **Nouveaux utilitaires** — `findEditEdgeInsertion`, `insertEditPointAt`,
  `editEdgeMidpoints`, `removeEditPointsAt` et `canRemoveEditPoints` dans
  `src/utils/zoneEditGeometry.js`. La projection sur l'arête réutilise les helpers déjà
  partagés avec la carte du royaume de Gnomes & Licornes (`src/shared/pct-map/`) plutôt
  que d'en écrire une seconde version.
- **Tolérance constante à l'écran** — la distance « assez proche du bord pour insérer »
  est dérivée de 28 pixels écran, pas d'un pourcentage fixe : viser une arête reste aussi
  facile en zoom fort qu'en vue d'ensemble.
- **Historique** — chaque ajout et chaque retrait entre dans la pile d'annulation : « ↩
  Annuler » et Ctrl+Z reviennent en arrière pas à pas comme pour un déplacement.
- **Tests** — 30 cas ajoutés sur les utilitaires purs, 16 sur le hook d'édition et 10 sur
  le calque SVG (insertion enchaînée sur un glissement, insertion refusée, garde des trois
  sommets).
- **Documentation** — nouvelle section « Retoucher le contour d'une zone » dans
  `docs/reference/foretmap/carte-et-zones.md`. Contrat HTTP inchangé : `PUT /api/zones/:id`
  reçoit toujours le même tableau de `{ xp, yp }`, `docs/API.md` n'évolue pas.

### Les sommets se sélectionnent à plusieurs et se déplacent d'un bloc (lot 16)

**Recaler un côté entier d'une zone demandait de déplacer ses sommets un par un**, en
espérant conserver leurs écarts. Sur un contour à quinze sommets, l'opération était longue
et le résultat approximatif.

On peut maintenant **désigner plusieurs sommets** : Maj+clic pour les prendre un à un, ou
un **rectangle tracé sur le fond de carte** pour attraper tout ce qu'il contient. Les
sommets retenus s'entourent d'un cercle orange, et glisser l'un d'eux **déplace tout le
groupe** en conservant sa forme — le groupe glisse le long du bord de l'image au lieu de
s'écraser dessus quand il l'atteint. Suppr retire toute la sélection d'un coup. Sur
tablette, où la touche Maj n'existe pas, une bascule « Multi » rend chaque appui additif.

- **Sélection** — état porté par `useZoneEditPoints`, réindexé après chaque suppression et
  après une annulation, pour qu'aucun index ne pointe vers un sommet disparu.
- **Déplacement groupé borné** — `clampEditMoveDelta` limite le déplacement au lieu de
  borner chaque sommet séparément : la forme de la sélection est préservée.
- **Gestes tactiles** — le lasso s'abandonne dès qu'un second doigt se pose, pour ne pas
  transformer un zoom à deux doigts en sélection involontaire.
- **Tests** — Maj+clic (ajout puis retrait), lasso, clic sur le fond qui désélectionne,
  déplacement de groupe borné, suppression multiple, réindexation.
- **Documentation** — décrit dans la même section du guide « La carte et les zones ».

### Un aimant colle les sommets sur les limites visibles du plan (lot 17)

**Suivre à la souris le bord d'une parcelle demande une main sûre.** Sur un plan dessiné,
la limite est pourtant parfaitement visible : c'est un trait franc, un changement d'aplat.

La bascule « 🧲 Aimant » analyse l'image de fond de la carte — détection de contours par
l'opérateur de Sobel sur la luminance — et **colle le sommet déplacé sur le contraste le
plus marqué autour de lui**, exactement comme l'aimantation d'un logiciel de retouche
photo. Un curseur règle la distance d'accroche, en pixels écran (donc constante quel que
soit le zoom) ; « 🧲 Coller » applique l'aimant d'un coup aux sommets sélectionnés, ou à
tout le contour si rien n'est sélectionné ; **Alt maintenu** le suspend le temps d'un geste.

- **Analyse à la demande** — rien n'est calculé tant que l'aimant n'est pas allumé, l'image
  est sous-échantillonnée à 1400 px de côté au maximum, et le résultat est mis en cache par
  URL de plan : rallumer l'aimant est instantané.
- **Repli explicite** — si l'image du plan vient d'un autre domaine, le navigateur interdit
  d'en lire les pixels : le bouton affiche « Indispo. » et l'édition continue sans aimant,
  au lieu d'échouer en silence.
- **Limite assumée** — sur une photo aérienne peu contrastée, l'aimant peut accrocher une
  ombre plutôt que la vraie limite ; c'est signalé comme point d'attention dans le guide.
- **Tests** — 16 cas sur la détection de contours (`src/utils/edgeSnap.js`) avec des images
  de synthèse, plus la couverture du branchement dans le hook d'édition.
- **Documentation** — mode d'emploi et point d'attention dans « Retoucher le contour d'une
  zone » ; aucune route ni table modifiée.
### Les mascottes livrées se gèrent depuis le studio (lot 14)

Visualiser, modifier, exporter ou retirer une **mascotte livrée avec l'application** demandait
jusqu'ici de savoir où chercher : un peu dans « Packs mascotte », un peu dans « Paramètres », et
l'export imposait de cloner d'abord — créer un pack pour le jeter aussitôt.

Un volet **Mascottes livrées** rassemble tout ça. Pour chaque mascotte : un aperçu, un bouton
**Cloner pour modifier**, un bouton **Exporter ZIP** direct, et la case **« proposée aux
visiteurs »**.

**Le volet dit enfin la vérité sur ce qu'il propose.** Quatre des seize mascottes livrées portent
une vraie animation ; les douze autres n'ont qu'une image fixe et s'affichent en silhouette. Un
badge le signale, et l'archive d'un de ces modèles part avec son avertissement — plutôt que de
laisser croire qu'on a exporté une animation.

La case de visibilité écrit **le réglage qui existait déjà** (Paramètres → Mascottes de visite) :
un seul réglage, deux endroits où le voir, aucune mécanique parallèle. Elle demande un rôle
d'administration ; un professeur qui ne gère que les packs la voit grisée, avec l'explication.

### Les mascottes livrées se clonent enfin avec leurs vraies animations (lot 13b)

Le studio proposait de partir d'une **mascotte livrée avec l'application** comme modèle. Sauf que
pour la plupart d'entre elles, la copie obtenue faisait pointer **les vingt et un états sur une
seule et même image fixe**. On pouvait la cloner, on n'y voyait aucune animation, et l'exporter
n'exportait que ce figurant.

**OLU se clone désormais avec ses 88 vraies trames.** Le visualiser, le modifier ou l'exporter
depuis le studio ne demande plus d'importer quoi que ce soit.

**Gnome 1 réapparaît dans la liste des modèles.** L'application savait déjà le construire, mais il
manquait de la liste : clonable par appel direct, introuvable dans le studio.

### OLU s'anime : ses vingt et un états, prêts à importer (lot 13)

OLU n'avait pas de planche d'animation : il apparaissait en **silhouette dessinée**. Les dix-neuf
planches manquantes ont été générées, découpées, et assemblées en une **archive importable** depuis
l'onglet « Packs mascotte ». Une fois importée puis publiée, OLU s'anime partout où il apparaît.

**Les vingt et un états sont couverts** — repos, marche, course, parole, désignation, joie, saut,
célébration, tour sur soi, examen de carte, recherche, salut, mise en garde, surprise, gravité,
affection, contrariété, sommeil, repas, danse. Aucun ne retombe plus sur `idle` faute d'images :
c'était le cas de neuf d'entre eux.

Le découpage se fait **par contenu et non par grille** — les modèles d'image alignent mal les cases
d'une bande, et les dix-neuf planches ont été segmentées correctement du premier coup malgré des
espacements inégaux. Deux points méritaient de l'attention :

- **la ligne de sol est celle de la planche, pas celle du sujet** : caler chaque trame sur ses
  propres pieds aurait aplati les sauts de `happy_jump`, `celebrate` et `dance` ;
- **l'échelle est ramenée à une hauteur commune** planche par planche : OLU y sortait de 335 à
  523 px de haut selon la planche, il aurait changé de taille en changeant d'humeur.

Deux planches (`alert`, `surprise`) viennent d'une passe où le personnage a dérivé — le poitrail
crème y disparaît. Elles sont livrées telles quelles et **signalées comme à régénérer** :
`docs/MASCOT_OLU_PLANCHES_SPRITES.md` §5.5.

Outils : `npm run mascot:olu-cut` (découpage), `npm run mascot:olu-pack` (archive).
Prompts de génération : `docs/MASCOT_OLU_PROMPTS_A_COLLER.md`.

### Doc — Audit UI : pourquoi les boutons de G&L paraissent d'un autre âge

L'impression n'était pas subjective. Mesures faites dans Chromium sur du markup G&L réel :
**tous** les boutons du jeu s'affichent en **Arial 13,3 px** — la feuille de style du
navigateur — au lieu du Caudex 16 px de l'application, parce que `.gl-btn` est une copie
appauvrie du `.btn` de ForetMap à qui il manque `font-family` et `font-size`. Sur 84 règles
CSS ciblant des boutons, une seule fixe la police.

Second défaut mesuré : dans un `.gl-form`, les variantes `secondary`, `ghost` et `danger`
s'affichent toutes en primaire foncé. S'ajoutent 80 lignes de CSS bouton mort et 27 variables
CSS jamais définies (dont `--gl-primary`, 28 usages — ces zones ignorent donc le thème de
marque).

L'audit décrivait les remèdes sans les appliquer ; **ils l'ont été depuis, au lot 14
ci-dessus**. Deux de ses constats se sont révélés surévalués à la vérification et sont
corrigés dans le document : le nombre de sélecteurs dupliqués (1, et non 27 — le comptage
confondait surcharges `@media` et doublons) et les cibles tactiles, déjà conformes grâce au
pseudo-élément du lot 4. Détail : `docs/AUDIT_UI_BOUTONS_GL_2026-08.md`.

### Les questions redeviennent lisibles, côté fiche comme côté écran (lot 13)

**La fiche d'une question du Quiz s'intitulait par ses noms de colonnes.** Le panneau
d'édition affichait le champ brut, underscores remplacés par des espaces : « numero dans
categorie », « reponse texte », « photo legende », « notes pedagogiques ». Les six champs
`feedback_*` étaient les plus coûteux : rien ne disait qu'ils correspondent chacun à un
choix précis. Chaque champ porte désormais un libellé français explicite — « Explication
si l'élève choisit B », « Photo — légende (affichée sous l'image) » — dans les trois
éditeurs (Quiz ForetMap, QCM biomes et QCM lore de Gnomes & Licornes).

**L'aperçu « Présenter » ne montrait pas l'illustration.** Un professeur qui renseignait
une photo ne pouvait la vérifier nulle part : ni dans la fiche, ni dans l'aperçu. L'aperçu
affiche maintenant l'image avec sa légende et son crédit. La légende reste réservée à
l'administration : dans le catalogue livré, elle nomme le sujet photographié — l'afficher
à l'élève donnerait la réponse.

**La question du contrôle de compréhension affichait sa photo sans crédit.** Le crédit et
la licence apparaissaient dans l'onglet Quiz, mais pas dans la fenêtre de validation d'un
tutoriel. C'est corrigé, et le code de la question y est annoncé comme ailleurs
(« Question QF0351 »).

**Les réglages du contrôle de compréhension n'avaient pas de nom.** Les cinq réglages
`learning.gating.*` tombaient dans « Autres paramètres » sous le dernier segment de leur
clé : un interrupteur nommé « Enabled » commandait, sans le dire, l'obligation de répondre
à des questions avant de valider une lecture. Ils forment désormais leur propre section,
« Validation des lectures (contrôle de compréhension) », chacun sous un libellé qui décrit
son effet — le délai de blocage après une erreur (3 jours par défaut) compris.

La documentation de référence explique en clair ce que ce dispositif fait, ce qu'il exige
pour fonctionner, et pourquoi il reste aujourd'hui sans effet visible côté ForetMap : les
questions ne peuvent pas encore être rattachées aux tutoriels depuis l'interface.
### Cinq mises à jour de dépendances npm (lot d'intégration)

Les montées de version proposées automatiquement et restées en attente sont reprises
d'un bloc : `better-sqlite3` 12 → **13.0.3**, `jsdom` 29 → **30.0.1**,
`@testing-library/jest-dom` 6 → **7.0.1**, `google-auth-library` 10 → **11.0.2** et
`artillery` 2.0.33 → **2.0.34**.

Les quatre premières sont des versions **majeures** : `better-sqlite3` et `jsdom` ne
servent qu'aux tests (fork SQLite d'import de carte, rendu React), `jest-dom` aux
assertions d'interface, et `google-auth-library` à la connexion Google. Le verrou
(`package-lock.json`) a été régénéré d'un seul tenant pour que les cinq montées
cohabitent.

### Un feuillet découvert deux fois en même temps ne double plus les cœurs

Deux élèves de la même équipe (ou un double clic) qui présentaient le même feuillet
au même instant encaissaient **deux fois** les cœurs et/ou payaient **deux fois** les
gemmes. La garde « déjà présenté » lisait le journal **avant** la transaction, et
l'événement n'était écrit **qu'après** le commit : les deux requêtes voyaient un
carnet encore vide.

Même garde que pour une zone-feuillet : on verrouille l'équipe, on relit, et on
journalise dans la même transaction. La seconde requête reçoit `409` et la vitalité
n'a bougé que d'un cran.

### Un échange au plafond ne fait plus disparaître des gemmes

Depuis le plafond de jeu (cœurs/gemmes max), finaliser un troc alors que le
receveur était déjà au maximum **débitait le donneur et jetait la monnaie** :
le plafond rognait le gain, pas la dépense. Deux élèves qui s'accordent
« je te donne 2 gemmes » voyaient les 2 gemmes s'évaporer.

L'échange est désormais **refusé** (comme un solde insuffisant) : personne ne
perd rien, personne n'en gagne. Les récompenses de cases et de feuillets
continuent d'ignorer un gain au-delà du plafond — là, rien n'est pris à
personne.

### Un QCM d'entraînement ne se brute-force plus (lore + quiz ForetMap)

Le catalogue biomes consommait déjà le jeton de présentation à la première réponse.
Le QCM **lore** hors partie et le **quiz ForetMap** laissaient rejouer le même jeton :
cinq requêtes suffisaient à révéler la bonne réponse, et à enregistrer une tentative
juste qui débloque un conditionnement. Même filet désormais : rejeu → 409, il faut
une nouvelle présentation (choix remélangés).

### Un échange ne mange plus un feuillet déjà lu dans le carnet personnel

Le Marché savait déjà ne pas écraser l'état **d'équipe** : si les receveurs avaient
trouvé un feuillet intact, une copie très effacée ne l'opacifiait pas. La trace
**personnelle** — celle qui survit à un changement de partie ou d'équipe — n'avait pas
cette garde. Un élève qui avait lu un feuillet au chapitre 1, puis recevait la même
page « mangée » dans une nouvelle partie, voyait son carnet s'obscurcir.

L'instantané personnel garde désormais le moins effacé, comme la lecture du carnet le
faisait déjà. Les camarades qui n'avaient pas le feuillet reçoivent bien la copie.

### Les boutons flottants ne se marchent plus dessus (lot 12)

**Deux d'entre eux tombaient dans la barre de navigation du bas.** Côté Gnomes & Licornes,
la cloche de notifications se posait par-dessus et masquait un onglet. Côté ForetMap, le
bandeau de message se posait par-dessous : il ne s'affichait **jamais** pour un élève.

**Et le « ? » d'aide changeait de place selon l'onglet** : il vivait en fin de contenu, donc
sa position dépendait de la longueur de la page. Sur un onglet court il restait haut, sur un
onglet long il venait buter contre la cloche.

Les commandes du coin bas-droit tiennent désormais dans **un seul empilement** : elles ne
choisissent plus leur place, l'ordre et l'espacement leur sont donnés, et la hauteur à
dégager au-dessus de la barre est calculée au lieu d'être recopiée à la main. Le « ? » y
gagne une place fixe, la même d'un onglet à l'autre.

**Sept commandes en pictogramme étaient trop petites pour le doigt** (36 à 40 px au lieu des
44 px que le projet s'impose), dont la barre de sous-onglets de G&L. Leur zone cliquable est
portée à 44 px sans que rien ne grossisse à l'écran.

Audit complet : `docs/AUDIT_ICONES_FLOTTANTES_2026-08.md`.

### Les filtres de tâches libèrent le haut de l'écran sur téléphone (lot 12)

**Sur smartphone, l'écran Tâches n'affichait pas de tâche.** Les sept contrôles de la
barre de filtres — mode d'affichage, carte, recherche, lieu, projet, catégorie, statut,
plus le groupe côté professeur — passaient chacun en pleine largeur : **331 px** mesurés
sur un écran de 390 px de large, soit deux tiers de la hauteur utile. Avec le titre, le
sous-titre et le bandeau de missions actives, la première tâche commençait sous la ligne
de flottaison.

La barre tient désormais sur **une seule ligne** : recherche, bouton « ⚙️ Filtres » et
choix d'affichage en pictogrammes. Les filtres eux-mêmes s'ouvrent dans un panneau — sous
la barre sur ordinateur, en feuille refermable sur « Voir les N tâches » sur téléphone.
**Aucun filtre n'a été retiré** ; ils sont rangés, et le bouton porte le compte de ceux
qui sont posés.

Ce compte se lit aussi sous la barre, en étiquettes : « Lieu : 🐝 Ruche », « Statut :
Terminée ». Un appui les retire une à une, « Tout effacer » d'un coup — de quoi
comprendre enfin pourquoi une liste paraît vide.

Le haut de page a maigri en conséquence : sur écran étroit, le sous-titre et le bandeau
de missions actives passent en version courte (le texte complet reste sur grand écran).
Et sans préférence enregistrée, un téléphone démarre en affichage **condensé**, une ligne
par tâche. Bilan sur un écran de 390 × 844 : **58 px de filtres au lieu de 331**, et
quatre tâches lisibles sans faire défiler la page, contre une seule auparavant.

### Les commandes GL en icône seule s'expliquent enfin (lot 11)

**GL n'avait aucune infobulle.** Ses boutons en pictogramme — les dés, la musique, le
plein écran, le « ? », la cloche — comptaient sur l'infobulle du navigateur : une à deux
secondes d'attente, rien à la prise de focus au clavier, **rien du tout au doigt**.

ForetMap avait déjà le bon composant. Il n'avait rien de propre à ForetMap : il rejoint
le socle partagé et sert désormais les deux produits, avec les couleurs du royaume côté
GL. Ouverture temporisée au survol, immédiate au focus clavier, appui long sur écran
tactile, et retournement quand la bulle déborderait de la fenêtre.

Un bouton qui affiche déjà son libellé n'en reçoit pas : il n'a rien à expliquer.

**Une visite guidée perdait sa dernière bulle sur le premier onglet ouvert.** En
verrouillant tout cela par des tests, une course est apparue : le bouton « ? » n'est
affiché qu'une fois l'aide reçue du serveur, alors que la visite démarre 650 ms après
l'affichage de l'onglet. Sur un premier onglet à froid, la bulle finale — celle qui
montre où retrouver OLU — disparaissait sans un mot, et l'onglet étant compté comme vu,
elle ne revenait plus. La visite attend désormais que l'aide soit là.
### Correctifs d'audit sans arbitrage (sécurité, BDD, a11y, docs)

Suite de l'audit général (`docs/AUDIT_GENERAL_2026-08.md`), les correctifs qui ne
demandaient aucune décision de conception :

- **Sécurité & intégrité GL** : rate-limit sur les endpoints prof forgot/reset-password ;
  `/api/site-issues` réservé à `admin.settings.read` ; jeton de présentation QCM
  d'entraînement à usage unique (fin du brute-force des réponses, migration `197`) ;
  `present-question` exige que le joueur soit sur le repère (anti-farm) ; validation des
  coordonnées de repères ; `connectTimeout` sur le pool MySQL.
- **Intégrité base de données** : inscription de groupe aux tâches sous verrou
  (`FOR UPDATE`, plus de dépassement de capacité en concurrence) ; suppressions de tâche
  et de groupe transactionnelles ; détachement (`NULL`) des `group_id` orphelins ;
  suppression de joueur GL transactionnelle + purge des jetons + `409` explicite sur FK
  RESTRICT ; `FOREIGN_KEY_CHECKS` réarmé après `initSchema`.
- **Accessibilité** : contrastes des textes secondaires conformes WCAG AA ;
  `aria-current` sur l'onglet actif ; zones de la carte accessibles au clavier.
- **Documentation de référence** : contradiction sur les « tours » levée, encadré « pas
  de lore » actualisé, dé virtuel documenté, renvois et terminologie corrigés.
### Le jeu tenait des promesses qu'il n'appliquait pas (audit des mécaniques G&L)

**Aucun élève n'a jamais gagné un cœur ni une gemme en jouant.** Les quatre parties
réelles de juin 2026 ont produit 483 événements : douze effets de case, tous à
`healthDelta: 0` et `powerDelta: 0`, quinze réponses de QCM, zéro gemme créditée. Les
seuls mouvements de vitalité du corpus sont sept ajustements manuels du MJ. Les compteurs
sont décoratifs — ce qui invalide au passage le diagnostic d'économie inflationniste sur
lequel reposait la refonte prévue : le jeu n'est pas déséquilibré, il est inerte.

La cause est une divergence silencieuse. Chaque case porte deux champs indépendants : un
texte d'effet, que l'élève lit, et une configuration machine, seule exécutée. Rien ne les
relie et aucune erreur n'est levée quand ils s'écartent. **103 des 217 cases (47 %)
annoncent un effet que le moteur n'applique pas** : 96 promesses conditionnelles
(« Bonne réponse : +1 gemme ») que le moteur ne sait pas exprimer — ses branches sont
neutre/gnome/licorne, jamais bonne/mauvaise réponse — et 7 « Passe ton tour » sans effet.
Un contrôle de cohérence les liste désormais par chapitre et par repère
(`GET /api/gl/admin/plateaux/coherence`). Il ne corrige rien : câbler l'effet ou retirer
la promesse est une décision de conception, pas une réparation mécanique.

**Un avantage scolaire ne s'achète plus au comptant.** Le réglage global d'approbation des
sortilèges vaut `per_spell`, et les 31 sorts étaient en `auto` : *Consécration*, qui vaut
un « vert + » au bulletin, partait donc sans qu'aucun adulte soit consulté, dès qu'un élève
réunissait huit gemmes. Les cinq sortilèges à effet scolaire réel — Esquive, Révélation,
Mentorat, Annulation, Consécration — exigent maintenant une validation du MJ. Les coûts
sont inchangés, aucun sort n'est supprimé, et les sortilèges fictionnels restent en
lancement libre.

**Un plafond de vitalité réglable** (« Cœurs maximum », « Gemmes maximum », 0 à 99) permet
de rendre les cœurs de nouveau rares — sans quoi les sortilèges de soin répondent à une
pénurie qui n'existe pas. La valeur par défaut est 0, soit aucun plafond : rien ne change
tant qu'elle n'est pas fixée. Deux règles le gouvernent : il **bloque les gains sans jamais
confisquer** un solde déjà supérieur (un élève à 9 cœurs le jour où le plafond passe à 5
n'en perd aucun), et il s'applique aux cases, aux feuillets et au Marché — sans quoi le
Marché serait le contournement évident — mais laisse souverain l'ajustement manuel du MJ.

L'audit complet et les options de finition, pensées pour une classe de 6ème, sont dans
[docs/reference/gl/audit-mecaniques-2026-08.md](docs/reference/gl/audit-mecaniques-2026-08.md).

### Les visites guidées GL atteignent enfin les écrans où l'on arrive (lot 10)

**Quatre des douze visites du lot 9 ne pouvaient pas se déclencher.** La navigation GL
replie les identifiants de regroupement sur un sous-onglet : ouvrir « La nature » place
l'application sur *Écosystèmes*, jamais sur `nature`. Les parcours rangés sous `nature`,
`adventure`, `monde-gl` et `joueurs` attendaient donc une valeur que rien ne produit —
un contenu correct, invisible, et silencieux. Pendant ce temps `Introduction`, l'onglet
d'arrivée par défaut, n'avait aucune visite.

Les parcours sont désormais rangés sous les onglets où l'on atterrit vraiment :
**dix-huit visites** couvrent tout ce qui se joue — cartes, écosystèmes, biodiversité,
glossaire, histoire, carnet, sortilèges, introduction, règles, lexique du récit,
tutoriels, forum, marché, statistiques, journal de partie, journal personnel, plateau de
découverte, console MJ. Les quatre écrans d'administration restent sans visite : le
corpus d'aide y est déjà neutre, OLU n'y parle pas.

**Les bulles désignent quelque chose.** Toutes les étapes du lot 9 visaient la zone de
contenu entière : le projecteur éclairait la page complète, donc ne montrait rien. Les
étapes pointent maintenant des ancres dédiées (la barre de sous-onglets, la recherche du
glossaire, la liste des tutoriels, la barre du journal…), et celles qui présentent un
écran entier n'ont plus de cible du tout — bulle centrée, sans projecteur inutile.

**Une étape d'orientation par regroupement**, partagée par ses sous-onglets et éditable
une seule fois dans le studio : elle désigne la barre de sous-onglets et dit ce qu'il y a
à côté.

**Une visite qui n'a rien pu montrer n'est plus considérée comme vue.** Le moteur
marquait l'onglet « découvert » avant de vérifier que ses bulles pouvaient s'afficher :
si une cible n'était pas encore chargée, la visite ne montrait rien — et ne se relançait
plus jamais. Elle attend désormais qu'au moins une bulle soit affichable. La correction
vaut pour les deux produits, le moteur étant commun — **c'est donc un changement de
comportement côté ForetMap aussi**, où un onglet dont aucune bulle ne s'affichait était
jusqu'ici compté comme découvert.

Deux garde-fous ferment la classe de défaut : une clé de visite doit être un onglet que
l'application peut réellement afficher, et une ancre citée par une visite doit exister
dans le code des vues. Un test d'interface vérifie en plus que les quatre barres de
sous-onglets **rendent** leur ancre — l'écrire ne suffit pas.

### Les MJ peuvent réécrire les visites guidées, et GL en gagne six de plus (lot 9)

Suite des chantiers laissés ouverts au lot 8.

**L'édition des parcours depuis l'application, côté GL.** ForetMap l'avait, GL non : un
MJ devait attendre une mise à jour pour changer un mot. C'est désormais symétrique —
onglet **Contenus → Visites guidées**, chaque parcours étape par étape, le texte livré en
filigrane, une version joueur et une version MJ. Seuls les **textes** circulent : ce que
chaque bulle désigne à l'écran reste en code, une cible saisie à la main étant le moyen
le plus simple de faire disparaître une étape sans le moindre message d'erreur.

Comme côté ForetMap, seules les clés réécrites sont stockées : améliorer un texte livré
reste visible partout où personne ne l'a réécrit.

**L'écran d'édition est le même pour les deux produits**
(`shared/components/TourOverridesEditor.jsx`), et son extraction a fait fondre le panneau
ForetMap de 240 à 79 lignes. Elle a aussi révélé un défaut du lot précédent : le parcours
d'accueil n'avait pas de titre et se serait affiché « welcome » dans le studio. Les
26 parcours des deux produits en ont un désormais, vérifié par test.

**Six visites guidées GL de plus** — découverte, la nature, le monde G&L, forum, journal
personnel, statistiques —, soit onze onglets couverts au lieu de cinq.

Un test de charte couvre ce corpus, et verrouille **la règle §8.4 dans ce qu'elle a de
mécanisable** : aucune bulle d'OLU ne contient « Souffle », « Sélène », « gnome » ni
« licorne ». Il parle du jeu, pas dans le jeu, et ne prend pas parti entre les peuples.

Restent ouverts : les infobulles GL (toujours aucune), l'intro cinématique en iframe, et
quinze onglets GL sans parcours — surtout ceux d'administration, où OLU se tait déjà.

### OLU se présente, et GL gagne aide appelable et visites guidées (lot 8)

Revue d'ensemble de l'aide, des tutoriels et des visites des deux produits. Elle a
montré une asymétrie que personne n'avait regardée d'un bloc : ForetMap avait
13 parcours guidés, 21 infobulles et une aide qu'on appelle d'un bouton ; GL avait un
encadré replié en bas de page, aucune visite, et le même texte pour un joueur et un MJ.
Et **aucun des deux ne présentait jamais l'application** à un nouveau venu.

**Le socle est désormais partagé** (`src/shared/`) : le noyau de registre de parcours
(filtrage par rôle, surcharges), le moteur (`useGuidedTour`), l'overlay
(`GuidedTourOverlay`, ex-`DiscoveryTour`), ses styles et la résolution de texte par
rôle. Le **contenu** reste à chaque produit, et les mémoires sont distinctes : avoir
fait le tour du verger ne vaut pas avoir vu le royaume. L'API ForetMap n'a pas changé
d'un signe.

**Côté Gnomes & Licornes :**

- **L'aide s'appelle** — un bouton « ? » par onglet, qui pulse tant que l'aide de cet
  écran n'a jamais été ouverte. L'encadré en bas de page ne se lisait que si l'on
  descendait jusqu'à lui : le corpus réécrit au lot précédent ne servait qu'à moitié.
- **Une variante MJ** (`bodyMj`, optionnelle) sur les dix écrans partagés avec les
  joueurs. Ailleurs, tout le monde lit le même texte — et sur les écrans réservés, OLU
  se tait déjà.
- **Cinq visites guidées** (cartes, aventure, carnet de Sélène, marché, console MJ),
  relançables depuis le « ? ». Désactivées pour les invités, dont le passage est
  éphémère, et alignées sur l'interrupteur du module d'aide.

**Des deux côtés, OLU accueille.** Trois bulles centrées à la première connexion : il se
présente, dit ce qu'on fait ici, indique où le retrouver. Jouées une seule fois, avant
tout parcours d'onglet — se faire présenter la carte par quelqu'un qu'on n'a pas encore
rencontré met la charrue avant les bœufs. Aucune ne désigne d'élément : à la première
seconde, montrer un bouton qu'on n'a pas appris à lire n'apprend rien.

Côté GL, l'accueil **ne raconte pas le lore** : c'est la règle du §8.4, et une première
version la violait en faisant dire à OLU ce que le Souffle avait fait. Il renvoie
désormais l'histoire à qui elle appartient — « ce n'est pas la mienne à raconter ».

Restent hors de ce lot : les infobulles GL (inexistantes), l'édition des parcours GL
depuis l'application (ForetMap l'a, GL non), et l'intro cinématique, toujours une iframe
statique hors du système d'aide.

### Mascottes : six alias d'états qui ne servaient à rien, et un état des lieux figé (lot 7a)

Audit du mapping d'états d'OLU demandé au §3.1a de `docs/MASCOT_NARRATEUR_OLU.md`. Deux
défauts s'y trouvaient, tous deux vérifiables sans disposer de la planche d'animation.

- **Six alias morts, supprimés.** `resolveStateSpec` consulte `stateFrames` **avant**
  `stateAliases` ; or les six clés d'alias de l'entrée `olu-spritesheet` figuraient déjà
  dans `stateFrames`, et trois étaient des identités (`spin -> spin`). Aucune ne
  s'exécutait. Comportement inchangé, code mort en moins.
- **Neuf états canoniques ne sont pas mappés** (`angry`, `sleep`, `wave`, `dance`, `eat`,
  `search`, `sad`, `love`, `point`) : ajoutés au moteur par le lot « comportements » après
  l'écriture de l'entrée, ils retombent sur `idle`. Ils n'ont **pas** été inventés — leur
  donner une rangée reviendrait à décrire une planche qui n'existe pas. Le repli est
  assumé, et figé par test.

Un garde-fou (`tests/visit-mascot-catalog-states.test.js`) interdit désormais l'alias mort
dans tout le catalogue, exige que tout alias vise un état réellement défini, vérifie que
deux états partageant une rangée y lisent le même nombre d'images, et **fige la liste des
douze entrées dont l'asset n'est pas versionné** (OLU, le template et dix Rive). Ces
entrées restent proposées dans le sélecteur : les retirer changerait ce que voient les
profs et ce que devient une mascotte déjà choisie — c'est un arbitrage produit, pas un
nettoyage de test.

**Pour animer OLU, la voie recommandée n'est pas de versionner une planche** mais de
publier un pack mascotte portant l'identifiant de catalogue `olu-spritesheet` : à
identifiant égal, c'est l'entrée du pack qui est affichée. Le pack apporte son propre
découpage, se retouche au studio sans déploiement, et respecte l'arbitrage §5.1 (aucun
visuel figé au dépôt).
### Mises à jour npm du lot Dependabot (v1.107.0)

Les 21 montées correctives et mineures proposées par #287 (`adm-zip`, `express-rate-limit`,
`helmet`, `mysql2`, `nodemailer`, `eslint`, `vite`, `vitest`, `react`, `prettier`,
`@playwright/test`…) sont reprises ici. La PR d'origine restait inmergeable non pas à cause
des dépendances — `package.json` et le lock fusionnaient sans conflit — mais parce que sa
branche du 10 août portait un `dist/` régénéré par le workflow `frontend-dist`, dont les
empreintes de bundles entraient en conflit avec celles produites depuis sur `main`.

Point regardé de près : **`adm-zip` `0.5.18` → `0.6.0`**, seule montée à franchir un palier
`0.x`. Ses deux appelants — `lib/mascotPackArchive.js` et `lib/contentLibraryBulk.js` — sont
couverts par `tests/mascot-pack-archive.test.js` et `tests/content-library-bulk-zip.test.js`,
verts avec la nouvelle version.

### Deux failles trouvées en auditant les PR fermées (v1.106.0)

En vérifiant que les correctifs des PR fermées sans fusion (le grand ménage du 20 août)
étaient bien arrivés dans `main` par une autre voie, deux cas ne l'étaient pas — et
restaient ouverts.

- **Une prise de contrôle GL survivait à la révocation de celui qui l'avait ouverte.**
  `POST /api/gl/admin/impersonate` vérifie que l'acteur est un staff GL actif, mais
  seulement à la délivrance du jeton : les requêtes suivantes ne relisaient que l'identité
  du **joueur** contrôlé. Un MJ désactivé, supprimé ou rétrogradé gardait donc le contrôle
  du compte jusqu'à l'expiration du JWT — de 90 minutes à 7 jours — alors que ses propres
  droits, eux, étaient bien révoqués à la requête suivante. L'acteur est désormais
  revalidé à chaque hydratation, comme le fait déjà ForetMap pour `admin.impersonate`.
- **L'écran Intro de l'administration GL pouvait effacer l'intro en base.** Son brouillon
  démarrait sur un objet vide mais complet, qui servait de référence à l'enregistrement
  automatique. Après un GET en échec, la référence restait ce brouillon : la première
  frappe écrivait `scenes: []` et des textes vides par-dessus le contenu réel. Les deux
  autres écrans de la même famille (bulles d'aide, réglages) avaient déjà été corrigés ;
  l'Intro était restée en arrière. Elle applique maintenant la même règle — pas de
  formulaire, donc pas d'écriture, tant que le chargement n'a pas abouti.

### Cinq correctifs repris de PR en attente (v1.105.0)

Cinq correctifs restés en attente sur des branches devenues inmergeables (conflits sur les
bundles `dist/` et les numéros de version) sont repris ici, **réécrits sur le code
actuel** : entre-temps, `main` a introduit `lib/tasks/assignmentIdentityMatch.js` et le
compare-and-set du recalcul de statut, qui couvraient déjà une partie du terrain. Ce qui
suit est ce qui restait ouvert, et chaque correctif porte un test qui échoue sans lui.

- **Un n3beur ne peut plus agir sous le nom d'un tiers.** Les noms d'action venaient du
  corps de la requête en priorité sur la fiche `users`. Or le couple prénom+nom sert encore
  de clé d'appariement aux inscriptions **héritées** (`student_id IS NULL`) : envoyer le nom
  d'un camarade suffisait à supprimer son inscription ou à marquer sa part « faite ». La
  fiche fait désormais foi, le corps n'étant qu'un repli pour un compte sans nom en base.
  Au passage, le contrôle « déjà assigné » de la route d'inscription applique la même règle
  que le SQL (`assignmentRowMatchesStudent`) : deux homonymes ne se reconnaissent plus.
- **Une inscription concurrente ne passe plus sur une tâche qui vient d'être validée.** Le
  statut est relu **sous le verrou** de la ligne `tasks` (`lib/tasks/assignmentSeat.js`) :
  `validated` et `on_hold` refusent l'inscription (400), une tâche disparue renvoie 404, et
  le recalcul part de la ligne verrouillée au lieu d'un objet lu avant la transaction.
- **Un joueur GL n'est plus bloqué après avoir changé son mot de passe.** `POST
  /api/gl/auth/change-password` remettait bien `password_must_reset` à 0 en base, mais le
  drapeau était relu dans le **JWT** : le middleware continuait de barrer toute la session
  jusqu'à reconnexion. Il est désormais relu en base pour les joueurs, comme les
  permissions (contrat B6).
- **Marquer un feuillet « lu » ou « tenu » ne restaure plus le texte mangé par le Souffle.**
  Ces routes n'envoient que `status` ; le défaut `effacementPct = 0` réécrivait le
  pourcentage posé à la découverte — y compris sur un feuillet à 100 %. La valeur existante
  est conservée sauf demande explicite de l'appelant.
- **Deux écrans d'administration GL n'écrivent plus par-dessus un chargement raté.** Un GET
  en échec laissait l'éditeur de **feuillet** avec un formulaire vide (un PUT vidait alors
  toutes les colonnes) et le panneau **Doc de référence** avec le document précédent sous le
  nouveau slug (l'autosave écrivait dans le mauvais document). Les deux exigent maintenant
  un chargement réussi pour le slug courant avant d'exposer la moindre mutation.

### OLU prend la parole dans GL — et il sait aussi se taire (lot 6b)

Arbitrage §11.7 de `docs/MASCOT_NARRATEUR_OLU.md` tranché : **OLU est du seuil, pas du
royaume — ni gnome ni licorne.** Il a traversé, il n'y a pas pris de forme, il note dans
son carnet d'explorateur et non dans celui de Sélène. Ce statut donne une règle d'écriture
tenable : **OLU parle du jeu, jamais dans le jeu.** Il dit comment on ouvre un feuillet ;
il ne dit jamais ce que le feuillet raconte, et il ne prend pas parti entre les deux
peuples — un narrateur qui aurait un camp, des élèves le discuteraient.

- **La bulle d'un feuillet ne porte plus d'étiquette de locuteur.** Le texte y est écrit
  par le MJ : le signer « OLU » lui attribuait des mots qui ne sont pas les siens. Il
  garde le portrait — il montre le feuillet, il ne le récite pas.
- **Les 26 entrées d'aide GL sont réécrites à sa voix**, et chaque onglet a enfin son
  propre titre : 25 d'entre eux s'appelaient « Aide GL ».
- **Sur les cinq écrans d'administration et la console MJ, OLU se tait** : textes
  factuels, pas de première personne, pas d'humour. On ne plaisante pas avec des comptes
  et des permissions.

Deux défauts de l'ancien corpus disparaissent au passage : la consigne « Désactive un
module dans Réglages plateforme… » était répétée à des **joueurs** qui n'y ont pas accès
— elle rejoint l'entrée `tab:settings`, où elle s'adresse à qui peut agir — et sa coquille
« épurger », présente en cinq exemplaires, tombe avec elle.

Un test verrouille les règles mécaniques de la charte (aucun emoji, plafond
d'exclamations, tournures bannies, 1 à 3 phrases par ligne, silence sur les écrans de
responsabilité). La règle « du jeu, jamais dans le jeu » n'est pas automatisable : elle
reste à la relecture.

**Et le corpus est enfin atteignable.** `lib/glHelp.js` persistait l'objet **dense** — les
26 entrées, y compris celles que personne n'avait touchées. La première sauvegarde d'un MJ
gelait donc tout le corpus, et améliorer un texte du dépôt n'avait plus le moindre effet à
l'écran : cette réécriture serait restée invisible en production. C'est la dette symétrique
signalée au §11.2 du plan, côté GL. L'écriture ne stocke désormais que la **surcharge**, et
`scripts/compact-gl-help-registry.js` réécrit une ligne dense existante à rendu identique
(il compare la configuration résolue avant/après et refuse d'écrire au moindre écart).

> ⚠️ **Geste d'exploitation à passer une fois par instance** :
> `node scripts/compact-gl-help-registry.js --apply`. Sans lui, une instance qui a déjà
> enregistré ses bulles d'aide GL continuera d'afficher les anciens textes.

### OLU entre dans Gnomes & Licornes — et c'est le même OLU (lot 6a)

Le narrateur de l'aide ForetMap accompagne désormais aussi Gnomes & Licornes. **Un seul
personnage, un seul réglage, un seul jeu de portraits** : c'est la révision de l'arbitrage
§8.2 de `docs/MASCOT_NARRATEUR_OLU.md`, qui prévoyait une configuration GL distincte. Les
portraits ayant été téléversés une fois, côté ForetMap, un second studio aurait imposé de
re-téléverser les mêmes fichiers puis de tenir deux jeux en phase — pour un personnage dont
le plan dit qu'il est le même des deux côtés.

- **Ouverture d'un feuillet** (`GLFeuilletPopover`) : portrait latéral, bulle signée et effet
  de frappe — le registre « visual novel léger » du §4.5. Sous 480 px, le portrait devient un
  médaillon pour laisser la largeur au texte. Un clic dans la bulle affiche tout d'un coup.
- **Encadrés d'aide GL** (`GLHelpPanel`, donc tous les onglets) : portrait `face` en en-tête.
- **Nouvelle route publique `GET /api/gl/content/narrator`**, en lecture seule.

L'isolement GL reste entier : GL lit sous `/api/gl/*` et n'appelle jamais `/api/settings/*`,
aucun jeton ne traverse, aucune table `gl_*` n'entre en jeu, et l'écriture du réglage demeure
au studio ForetMap (`PUT /api/settings/admin/help-narrator`). Le partage est **serveur**, à
l'image de `VisitMapMascotRenderer` déjà réutilisé par GL.

Le portrait reste décoratif (`aria-hidden`, `alt` vide) : sans image téléversée, la silhouette
SVG prend le relais sans un octet de réseau, et éteindre l'interrupteur retire portrait et nom
des deux côtés sans toucher aux textes.

**Ce que ce lot ne fait pas :** le **corpus** d'aide GL (~26 entrées par onglet) n'est pas
réécrit à la voix d'OLU — c'est le lot 6b, un lot d'écriture séparé (§13 : ne pas mélanger lot
technique et lot corpus), qui suppose de trancher d'abord §11.7 (OLU est-il un personnage *du*
lore GL ou un narrateur extérieur ?).
### Glossaire ForetMap — vrai popover, auto-liens partout, moteur corrigé

Suite de l'audit `docs/AUDIT_GLOSSAIRE_FORETMAP_2026-08.md` : les cinq lots de son plan de
correction sont livrés (§6 de l'audit). Fiche d'arbitrage **F8** de `docs/reference/INCOHERENCES.md`
close, options A + C.

- **Popover de définition (A1)** — un clic sur un terme n'éjecte plus l'élève de son tutoriel.
  `GlossaryPopover` est rendu par portail à la racine de l'application, donc hors des onglets :
  la modale de lecture reste ouverte derrière, à la bonne page. Termes voisins parcourus sans
  fermeture, bouton « voir la fiche complète » pour l'ancienne bascule d'onglet, piège à focus
  et Échap, animation neutralisée sous `prefers-reduced-motion`.
- **Moteur d'auto-liens mutualisé et corrigé (A3, A5, A6, A10)** — `lib/foretmapGlossaryAutolink.js`
  était un fork dégradé de `src/utils/glTermAutolink.js` : son filtre `SKIP_TAGS` était inopérant
  (les deux branches du ternaire renvoyaient la même valeur), ce qui injectait **26 ancres dans
  des blocs `<style>` sur 6 des 10 fiches de `tutos/`** — du CSS corrompu servi à l'élève. Une
  seule implémentation désormais : `src/utils/termAutolink.js` et son miroir CJS
  `lib/term-autolink/` (`npm run sync:term-autolink-lib`). **Bug jumeau corrigé côté GL** : un
  `<img>` non auto-fermé, ce que produit DOMPurify, coupait tous les auto-liens suivants dans
  n'importe quel contenu markdown comportant une image. Tokenisation consciente des guillemets
  et des commentaires, attribut échappé, `postMessage` et `event.origin` restreints à l'origine
  de l'application.
- **Tous les tutoriels couverts (A2)** — un contenu local passe par `/api/tutorials/:id/view`
  quel que soit son `type` ; les fichiers non-HTML restent servis tels quels. Les fiches servies
  en statique depuis `/tutos/` n'étaient jusqu'ici ni hyperliées ni cliquables.
- **Auto-liens hors tutoriels (A11, A12)** — définitions du glossaire, rôle et utilité des fiches
  plantes, énoncé/choix/feedback du quiz, réseau trophique, et les définitions du popover
  lui-même. `src/utils/foretmapGlossaryAutolink.js`, `GlossaryMarkdown` / `GlossaryInlineText`,
  `useGlossaryLinkIndex`. Le hook de sanitisation supprimait le `href` des ancres ForetMap
  (lien non focalisable, sans rôle) : il connaît désormais les deux glossaires.
- **Performance (A4)** — regex précompilées et cache LRU du HTML enrichi, clé
  `id | updated_at | version d'index | empreinte du HTML source`, invalidé à chaque écriture de
  tutoriel. Affichage d'une fiche de 32 ko en régime chaud : **104 ms → 0,107 ms** de CPU
  bloquant ; 30 élèves sur la même fiche : ~3 120 ms → **~22 ms**.
- **Style (A8)** — `.fm-glossary-inline-link` n'était défini nulle part : dans l'iframe, les
  termes héritaient du style `a` de chaque fiche, souvent inexistant. Style ajouté côté
  application et injecté dans l'iframe, sans `!important` pour ne pas défigurer les chartes des
  fiches de `tutos/`.
- **Tests (A7)** — le module ForetMap n'en avait aucun : 85 tests ajoutés (`term-autolink-core`,
  `foretmap-glossary-inject`, `tutorial-view-cache`, `tutorials-inline-legacy`, et 5 fichiers UI).
  Chaque cas de bug a été confronté au code d'avant pour vérifier qu'il échouait sans le correctif.
- **Cohérence de déploiement** — le nouveau miroir CJS est déclaré dans
  `scripts/prepare-runtime-deploy.js` et dans le workflow `frontend-dist`, comme les deux autres.
- Doc de référence mise à jour : `pedagogie-quiz-glossaire-reseau.md`,
  `taches-tutoriels-et-validation.md`, `plantes-et-biodiversite.md`. Deux constats de l'audit
  ont été **démentis par l'implémentation** et portent un encadré de correction : **A9**
  (surévalué — aucune route d'écriture du glossaire n'existe) et **A12** (mauvais coupable).

### Audit — Glossaire ForetMap : hyperliens de termes et « popover » de définition

Audit sans changement de comportement : `docs/AUDIT_GLOSSAIRE_FORETMAP_2026-08.md` suit la
chaîne complète « terme du glossaire cité dans un contenu », du `SELECT` sur `glossary_terms`
jusqu'au clic de l'élève, et confronte code, écrans, doc de référence et tests.

Constat central : **il n'existe pas de popover côté ForetMap** — `openPedagoGlossaryTerm`
bascule d'onglet, ce qui démonte la vue Tutoriels et **ferme la modale de lecture** ; d'où le
symptôme « le popover ne fonctionne pas sur les tutos ». Trois points rouges (A1 absence de
popover, A2 tutoriels servis en statique donc jamais enrichis, A3 `SKIP_TAGS` inopérant dans
`lib/foretmapGlossaryAutolink.js` → 26 balises `<a>` injectées dans des blocs `<style>` sur
6 fiches de `tutos/` sur 10), trois orange (A4 108 ms de CPU bloquant par affichage sans
cache de sortie, A5 fork dégradé de `src/utils/glTermAutolink.js`, **A6 bug jumeau GL** : un
`<img>` non auto-fermé coupe tous les auto-liens suivants — reproduit de bout en bout sur
`renderGlMarkdownWithGlossaryLinks`), six jaunes (tests absents, aucun style
`.fm-glossary-inline-link`, cache d'index sans invalidation, robustesse de la tokenisation et
du `postMessage`, couverture limitée aux tutoriels, `data-glossary-code` non autorisé par le
sanitizer).

Plan de correction en 5 lots proposé au §4 ; aucun n'est implémenté. Fiche d'arbitrage
**F8** ajoutée à `docs/reference/INCOHERENCES.md`.
### Tâches : une tâche « Urgent ! » validée rejoint enfin « Validées » — et audit de l'archivage

L'encart « 🚨 Urgent ! » extrait ses tâches de **toutes** les autres sections de l'écran
Tâches. Il les retenait sur le seul degré d'importance, sans regarder le statut : une tâche
urgente **validée** y restait donc piégée à vie, absente de « ✅ Validées » (prof) comme de
« ✅ Récemment validées » (élève), et l'encart se remplissait de travail terminé.

- L'encart ne retient plus que les tâches urgentes **encore en vie** : une fois validée
  (directement ou via son projet), la tâche redescend dans la section de son statut.
  « Terminée » et « Proposée » y restent — elles attendent une décision du professeur.

L'audit du système d'archivage mené dans la foulée
(**[docs/AUDIT_ARCHIVAGE_TACHES_2026-08.md](docs/AUDIT_ARCHIVAGE_TACHES_2026-08.md)**)
conclut à un mécanisme solide — marqueur de
cascade plutôt que rapprochement par horodatage, portée forcée à `active` hors
`tasks.manage`, périmètre du job limité aux éléments validés — mais relève **trois défauts**,
corrigés ici :

- **Des tâches invisibles.** Archiver un projet **sans cascade** (geste manuel, ou archivage
  automatique du projet, qui n'entraîne jamais ses tâches) laissait ses tâches actives dans
  un statut effectif (`project_validated` / `project_completed`) que **aucune section ne
  rendait** : elles disparaissaient de l'écran, sans message ni compteur. Elles sont
  désormais reclassées sur leur statut propre.
- **Des tâches importées jamais archivables.** L'import acceptait le statut `validated` sans
  écrire `validated_at` — or le job quotidien ignore les lignes sans cette date. Une reprise
  d'historique produisait donc des tâches validées inéligibles **à vie** à l'archivage
  automatique. La date est maintenant posée à l'import.
- **Des actions encore acceptées sur une archive.** `assign`, `assign-group` et `done`
  ne vérifiaient pas `archived_at` : depuis un écran resté ouvert, on pouvait s'inscrire sur
  une tâche rangée — et échapper au plafond de tâches actives, qui ne compte que les
  non-archivées. Les trois routes répondent désormais `400`. Le retrait reste autorisé.

Deux comportements sont documentés plutôt que modifiés : la progression des élèves **compte**
les tâches archivées validées (l'inverse rétrograderait un élève parce qu'un prof range ses
listes), et le job quotidien dépend de la longévité du processus — sans conséquence ici, le
critère étant un seuil de date et non un compteur.

Cinq tests figent les règles (deux backend, trois UI) ; tous échouent sans les correctifs.


### Sortilèges : lancer un sort n'est plus lié au tour de l'équipe (G13-a)

Arbitrage G13-a tranché, option A. Quand les tours sont activés, l'assistant de lancement
ne proposait que **l'équipe active** — la règle séquentielle d'avant le « mode classique ».
Or ce mode fait jouer toutes les équipes dans un même tour et ne borne pas les sortilèges :
le tour cadence les déplacements de mascotte et les dés (une fois par tour chacun), et c'est
la validation du MJ qui régule les sorts. L'écran promettait donc une règle que le serveur
n'a jamais appliquée, et une équipe non active ne voyait pas comment lancer un sort.

- Le filtre par tour est retiré de l'assistant : **toutes les équipes restent proposées**,
  tours activés ou non.
- Ce qui continue de s'appliquer : le périmètre d'équipe du joueur (« Uniquement son
  équipe ») et la réservation d'un sort à un peuple.
- Deux tests figent la règle ; ils échouent tous deux sans le correctif.

**G13-b** (le statut « proposé », jouable comme un officiel) reste en attente : la décision
est suspendue le temps d'assainir le catalogue existant — 17 des 35 sortilèges livrés sont
des propositions, et rien ne montre encore lesquelles sont déjà rattachées à un chapitre.

### Sortilèges : G13 réanalysé — ce n'était pas une règle manquante, mais un vestige d'écran

Analyse seule, aucun changement de comportement. En détaillant le point G13 du registre, la
relecture du code a corrigé une prémisse fausse de la rédaction initiale.

- **Le filtre « c'est le tour de telle équipe » (G13-a).** On avait écrit que le serveur ne
  tenait pas une règle annoncée à l'écran. C'est l'inverse : la migration `139` (« mode
  classique ») a **volontairement** sorti les sortilèges du tour par tour — le serveur
  applique un quota par tour aux mascottes et aux dés, et laisse les sorts libres, régulés
  par l'approbation du MJ. C'est **l'assistant de lancement** qui applique encore l'ancienne
  règle séquentielle. Les options ont été réécrites en conséquence (retirer le filtre,
  aligner les sorts sur le quota par tour, ou rétablir la séquence pour de bon).
- **Le statut « proposé » (G13-b).** Chiffré : dans le corpus livré, **17 des 35 sortilèges
  sont des propositions** (`source = proposition_claude`, avec justification pédagogique),
  jouables aujourd'hui comme les officiels dès qu'on les rattache à un chapitre — et l'écran
  de rattachement n'affiche même pas le statut.

Le point est scindé en **G13-a** et **G13-b** dans
[docs/reference/INCOHERENCES.md](docs/reference/INCOHERENCES.md) : ce sont deux décisions
distinctes. `docs/AUDIT_SORTILEGES.md` (S5, S6) est corrigé en conséquence.

### Sortilèges : les arbitrages G11 et G12 sont livrés

Deux décisions prises sur le registre d'arbitrage, mises en œuvre.

**G11 — le MJ n'est plus seul à se souvenir des effets** (option A). Le logiciel continue de
ne pas exécuter les effets des sortilèges : ils restent du texte, appliqué à la table par le
maître du jeu. Mais un sort payé dont l'effet est oublié ne passe plus inaperçu.

- La console MJ tient une file **« Sortilèges à appliquer »** : chaque sort lancé y reste tant
  que le MJ n'a pas coché « Effet appliqué ✔ ». L'entrée rappelle l'effet, la portée, la cible,
  le moment et la limite d'usage — précisément les champs que le logiciel n'applique pas.
- Un bouton **« Raconter cet effet »** pré-remplit la narration : le MJ relit, ajuste, envoie.
  Rien n'est jamais écrit au journal à sa place.
- Cocher horodate l'application, nomme l'acteur et inscrit une ligne au journal de partie.
  L'écriture est conditionnée : deux clics ne laissent qu'une trace et qu'un événement.
- Migration `195` (`gl_spell_cast_drafts.effect_applied_*`), routes
  `GET /api/gl/games/:id/spell-casts/awaiting-effect` et
  `POST /api/gl/games/:id/spell-casts/drafts/:draftId/effect-applied`, événement
  `spell_effect_applied`.

**G12 — un élève ne dépense plus les points d'un camarade** (option A). Les réglages sortis
d'usine étaient les plus permissifs des trois possibles : un joueur pouvait ouvrir un sort pour
n'importe quelle équipe et puiser dans la vitalité de n'importe qui, la seule barrière étant une
confirmation dans son propre navigateur.

- Défauts basculés sur **« Chaque joueur saisit uniquement sa contribution »** et
  **« Uniquement son équipe »**.
- **Le MJ et l'admin répartissent toujours librement** — c'est leur rôle, rien ne change pour eux.
- Les modes permissifs restent disponibles, mais deviennent un choix conscient : ils portent un
  ⚠️ dans les réglages et disent en clair ce qu'ils autorisent.
- Une classe déjà réglée en « Les deux » **garde son réglage** : seuls les défauts changent,
  aucun choix existant n'est écrasé.

Restent ouverts au registre : G13 (tour d'équipe et statut « proposé » annoncés à l'écran mais
non tenus par le serveur) et le sort à coût nul, injouable par l'assistant.

### Sortilèges : neuf défauts corrigés — dont un débit qui pouvait partir deux fois

Suite directe de [docs/AUDIT_SORTILEGES.md](docs/AUDIT_SORTILEGES.md) : les points dont la
bonne réponse ne se discute pas sont corrigés. Chaque correctif a son test, et chaque test a
été vérifié **rouge sans son correctif**. Les six points restants demandent un choix de jeu et
attendent l'arbitrage (G11 à G13 du registre).

- **Un sort ne se paie plus deux fois (S2).** Deux clics simultanés sur « lancer » — deux
  onglets, deux membres de l'équipe, un double-clic — pouvaient débiter deux fois et écrire
  deux événements : le statut du brouillon était lu hors transaction et l'écriture n'était
  pas conditionnée. Le brouillon est désormais verrouillé en tête de transaction et son
  passage à « lancé » n'a lieu qu'une fois ; la seconde tentative reçoit « ce sortilège a
  déjà été lancé ». Même verrouillage pour la soumission au MJ et pour le refus. Correctif
  repris de la PR #276 (restée en brouillon sur v1.85.5) et réécrit sur la base actuelle.
- **On ne verse plus dans un axe que le sort ne demande pas (S3).** Des gemmes déposées sur
  un sort qui n'en coûte pas n'étaient comparées à rien — mais bien débitées. L'écran ne
  proposait pas le champ ; une requête fabriquée passait. Refus en `400` à l'écriture, plus
  un filet arrière dans le contrôle de complétude.
- **La portée solo/collectif est rejouée avant le débit (S9)**, comme l'était déjà la
  restriction de peuple : un sort dont la portée change pendant qu'il attend le MJ ne part
  plus en contradiction avec sa fiche.
- **Plus de doublon dans la file du MJ (S10).** Une équipe dont le sort attendait validation
  pouvait en ouvrir un second identique — et le MJ, les accepter tous les deux.
- **« MJ seul » ne ferme plus la lecture (S11).** Le réglage réserve le lancement au MJ ; il
  privait aussi les joueurs de la consultation du pot, alors que les événements temps réel la
  leur poussaient quand même.
- **Les notes de préparation du MJ ne partent plus chez le joueur (S12).** `source` et
  `notes_pedagogiques` étaient servis par l'API à tout compte de lecture, sans être affichés.
  Les routes joueur servent désormais une projection dédiée ; les écrans d'administration
  gardent la fiche complète.
- **Défense en profondeur sur les droits (S13).** `gl.mascot.position`, accordée aux joueurs,
  ne fait plus partie des permissions qui identifient le staff — la distinction ne repose
  plus sur le seul type de compte.
- **Le journal ne met plus un sort collectif au compte d'une seule équipe (S14).** Quand le
  MJ ouvre un pot sur tout le plateau, la ligne dit « Toute la partie lance… ».
- **Documentation d'API alignée (S15)** : migration `173` citée, refus ajoutés décrits,
  `rosterScope` documenté dans la charge utile de l'événement.

### Audit des sortilèges : ce que l'application encaisse, et ce que personne n'applique

Audit de lecture, **sans changement de code ni de comportement** :
[docs/AUDIT_SORTILEGES.md](docs/AUDIT_SORTILEGES.md) suit un sortilège du catalogue au débit
et répond à la question posée — comment son effet s'applique-t-il aujourd'hui ?

- **Réponse : il ne s'applique pas.** Un sort lancé retire les cœurs et les gemmes promis,
  affiche le texte de sa fiche et écrit une ligne au journal. C'est tout. « Portée »,
  « cible », « timing », « limite d'usage » et « cumul » sont affichés au joueur et **jamais
  interprétés** : le moteur est un pot commun collaboratif, pas un moteur d'effets, et c'est
  le MJ qui applique l'effet à la main — sans rappel ni trace.
- **Quinze points d'attention** classés par gravité, dont un 🔴 : deux lancements
  simultanés peuvent débiter deux fois (le correctif dort dans la PR #276, bâtie sur
  v1.85.5 — reprise à faire sur la base actuelle). Puis, en 🟠 : une contribution sur un axe
  à coût nul est débitée sans contrepartie, et les réglages sortis d'usine (`any_team` +
  `both`) laissent un élève dépenser la vitalité d'un camarade d'une autre équipe, la seule
  barrière étant une confirmation côté navigateur.
- **Doc de référence** : [economie-marche-sorts.md](docs/reference/gl/economie-marche-sorts.md)
  décrit désormais noir sur blanc ce qui se passe quand le sort part, et ce qui reste à la
  charge du MJ.
- **Registre d'arbitrage** : quatre points ouverts à trancher (G11 à G14) dans
  [docs/reference/INCOHERENCES.md](docs/reference/INCOHERENCES.md).
### Documentation technique remise au niveau du code

Quatre lots de documentation restés en brouillon depuis juillet (PR #260, #271, #280, #289) ont été
re-vérifiés ligne à ligne contre le code actuel, puis repris sur la base courante — les constats
devenus faux ont été écartés, les autres corrigés et complétés.

- **Jobs quotidiens serveur** (`docs/EXPLOITATION.md`, `docs/LOCAL_DEV.md`, `README.md`) : cadence
  réelle (premier passage 45–165 s après le boot, puis 24 h), réglages de suspension, logs Pino à
  surveiller, rattrapage manuel. Le piège du nom historique est désormais écrit noir sur blanc :
  `FORETMAP_DISABLE_RECURRING_TASK_JOB=1` coupe **aussi** l'archivage automatique.
- **Médias privés sous `/uploads`** (`docs/EXPLOITATION.md`, `docs/API.md`) : garde monté avant
  `express.static`, familles concernées, point de contrôle après déploiement.
- **Contrats API manquants** (`docs/API.md`) : affectation de groupe (`assign-group` — capacité,
  idempotence, absence de `FOR UPDATE`), limites et validation réelle des avatars, trois routes
  admin GL de médiathèque (`audit`, `chapter-scenes`, `scene-meta`), nature `qcm_lore`.
- **Onglet Contenus GL** (`docs/GL_ARCHITECTURE.md`) : flux analyse → application, plafonds,
  collisions de noms dans un ZIP, cloisonnement logique de la médiathèque, documentation de
  référence éditable (surcouche en base, jamais d'écriture dans le dépôt).
- **Frontière produit et pipeline JWT** (`docs/GL_ARCHITECTURE.md`) : réutilisation des claims
  vérifiés, épinglage HS256, rappel qu'un JWT est signé et non chiffré.
- **Trackers** (`docs/SITE_ISSUES.*`, `docs/AUDIT_CODE_2026-07.md`, `docs/EVOLUTION.md`,
  `docs/GL_TESTS.md`) : statuts remis à l'état vérifié, inventaire des tests GL recompté, et
  bandeaux sur les deux audits de mars 2026 qui pouvaient encore se lire comme l'état courant.

### GL — le double clic ne donne plus deux fois les cœurs (ni deux jets de dés)

Toutes les gardes « une seule fois » du jeu étaient bâties sur le même schéma : lire l'état,
puis, plus tard, l'écrire. Entre les deux, une seconde requête lisait la même valeur périmée et
concluait elle aussi « pas encore fait ». Deux clics rapprochés, deux onglets ouverts ou deux
membres de la même équipe suffisaient donc à encaisser deux fois les effets d'un repère, à
lancer deux fois les dés pour un même tour, ou à présenter deux fois une zone feuillet.

- **Effets de repères et zones feuillets** — la ligne d'équipe est verrouillée (`FOR UPDATE`)
  *avant* le contrôle d'idempotence, et non après : la seconde transaction attend la fin de la
  première, puis relit un journal où l'événement figure désormais. La route « appliquer les
  effets » refait ce contrôle sous verrou au lieu de se fier au seul contrôle d'entrée.
- **Vitalité d'un joueur** — l'écriture est un lire-modifier-écrire en valeur absolue
  (`SET health_points = ?`) : sans verrou de ligne, deux effets simultanés lisaient la même
  valeur de départ et l'un des deux deltas disparaissait. La ligne joueur est verrouillée.
- **Jet de dés et déplacement de mascotte** — la consommation du tour devient un `UPDATE`
  conditionnel atomique (`… WHERE COALESCE(last_*_round_number, 0) < ?`) : la seconde requête
  ne touche aucune ligne, sa transaction est annulée et l'événement n'est jamais inséré.

Les contrôles rapides hors transaction sont conservés — ils évitent d'ouvrir une transaction
pour rien dans le cas courant — mais ce ne sont plus eux qui garantissent l'unicité. Réponses
et messages d'erreur inchangés (`409`). Diagnostic repris de la PR #279.

### ForetMap — la modale de tâche ne s'ouvrait plus du tout

`ReferenceError: Cannot access 'normalizedTutorialIds' before initialization` à chaque
ouverture de « Nouvelle tâche » ou « Modifier la tâche » : les enseignants ne pouvaient ni
créer ni modifier de tâche. La constante était référencée dans le tableau de dépendances de
l'enregistrement automatique — **évalué à chaque rendu** — alors qu'elle était déclarée
soixante lignes plus bas, donc en zone morte temporelle. Sa déclaration remonte avant le
bloc concerné.

Aucun test ne montait cette modale : c'est ce qui a permis au crash de passer. Il en existe
un désormais, en création comme en édition. Diagnostic repris de la PR #295.

### Deux panneaux d'administration pouvaient écraser leurs contenus après un échec réseau

Quand le `GET` initial échouait (coupure, 500, délai dépassé), **Contenus → Aide** et
**Réglages** affichaient un formulaire éditable garni de valeurs par défaut, avec
l'enregistrement automatique déjà armé. Une seule frappe déclenchait alors un `PUT` qui
écrivait ces défauts en base : bulles d'aide personnalisées perdues, charte de la
plateforme réinitialisée. L'écran ne montrait rien d'anormal — c'est précisément ce qui
rendait le piège efficace.

- **Aide** — le brouillon reste `null` tant que le chargement n'a pas abouti ; le
  formulaire cède la place à l'erreur et à un bouton « Réessayer ».
- **Réglages** — les quatre enregistrements automatiques (identité, charte, taille des
  repères, vitalité) sont conditionnés à un chargement réussi.

Les autres panneaux à enregistrement automatique ont été passés en revue : tous portaient
déjà leur garde. Diagnostic repris de la PR #291.

### Tâches — deux homonymes ne se marchent plus dessus

`task_assignments` et `task_logs` portent à la fois `student_id` et le nom de l'élève,
l'identifiant étant arrivé plus tard. La condition employée en six endroits — `student_id = ?
OR (prénom, nom)` — appliquait le `OR` **même aux lignes possédant un identifiant** : deux
élèves qui portent le même prénom et le même nom se reconnaissaient donc mutuellement.

Les conséquences allaient bien au-delà d'un compteur faussé : plafond d'inscriptions
partagé (l'un bloquait l'autre), « tâche faite » pouvant cocher la ligne du camarade,
désinscription pouvant retirer la sienne — et surtout, **supprimer un compte effaçait les
inscriptions et les journaux de son homonyme.**

La règle vit désormais dans `lib/tasks/assignmentIdentityMatch.js` : une ligne qui porte un
identifiant n'est reconnue que par lui, une ligne héritée reste reconnue par le nom. Aucune
reprise de données n'est nécessaire et l'historique est préservé. Diagnostic repris de la
PR #276.

### Tâches — une validation ne peut plus être écrasée par un recalcul concurrent

`recalculateTaskStatusWithConn` protège bien le statut `validated`, mais sur la valeur lue
en entrée — souvent issue d'une lecture antérieure, hors transaction. Si un enseignant
validait entre cette lecture et l'écriture, l'`UPDATE` inconditionnel rétrogradait
silencieusement la tâche. L'écriture est devenue un compare-and-set (`AND status <=> ?`) :
si l'état a bougé, elle ne s'applique pas, et le recalcul suivant repart de la valeur à
jour. Diagnostic repris de la PR #274.

### Sécurité GL — la possession d'un feuillet n'est plus forgeable

`POST …/feuillets/:code/read` et `…/hold` écrivaient l'état du feuillet **sans vérifier que
l'équipe l'avait trouvé**, ni même que le code existait. Or `read` et `held` comptent parmi
les statuts « trouvés » : un joueur s'attribuait donc n'importe quel feuillet du corpus —
sans QCM, sans coût en gemmes, sans canal de découverte — et la possession se propageait à
toute son équipe puis à son carnet personnel. Les codes étant lisibles dans l'aperçu
verrouillé du carnet, il n'y avait rien à deviner ; la garde de portée posée sur `present`
au lot précédent se contournait par ces deux routes. Elles exigent désormais un feuillet
déjà trouvé (`409` sinon). Le MJ n'est pas concerné : marquer l'avancée d'une équipe est un
geste d'animation. Diagnostic repris de la PR #267.

### Sécurité — une purge de médiathèque ne déborde plus sur l'autre produit

ForetMap et G&L partagent le **même dossier** `uploads/media-library/` ; seule l'étiquette
`app` de `_keys.json` sépare les deux médiathèques logiques, et la lecture en tenait compte.
Les suppressions, non : `clear_all` listait puis effaçait **tout**, sans filtre. Une purge
déclenchée depuis les réglages G&L emportait donc les médias ForetMap, et réciproquement —
sans confirmation, sans trace, et sans rien pour le deviner. Une suppression ciblée par
chemin franchissait la même frontière.

Chaque route passe désormais sa médiathèque (`gl` ou `foretmap`) : la purge s'y limite, et
une suppression hors périmètre est refusée. Diagnostic repris de la PR #286 — le plus
destructeur des correctifs restés en brouillon.

### Sécurité GL — le flux temps réel révoque enfin les comptes désactivés

Socket.IO acceptait les claims **brutes** du jeton (`socket.data.auth = claims`) sans
relire l'état du compte. Un jeton GL valant 24 h, un membre du staff désactivé ou supprimé
conservait le flux live de sa classe jusqu'à expiration — alors que la même révocation
prend effet immédiatement sur les routes HTTP, qui ré-hydratent à chaque requête. Une
connexion socket étant bien plus durable qu'une requête, c'est précisément là qu'il fallait
revérifier. L'authentification GL passe maintenant par `hydrateGlAuthFromClaims` ; une
panne de base rend `unavailable` plutôt que de déconnecter tout le monde. Repris de la #272.

### Tâches — l'archivage tient enfin ses promesses

Archiver une tâche, c'est la retirer du jeu. Trois mécanismes l'ignoraient :

- **Quota d'inscriptions** — une tâche archivée non validée continuait d'occuper un créneau
  du plafond de l'élève. Un enseignant qui rangeait ses vieilles tâches bloquait ses élèves
  sans que personne puisse comprendre pourquoi : les tâches en cause avaient disparu de
  leur écran (PR #263).
- **Récurrence** — une tâche récurrente archivée continuait d'engendrer une occurrence à
  chaque échéance. La ranger ne suffisait pas, il fallait aussi penser à retirer la
  récurrence (PR #266). Le filtre est posé aux **deux** endroits : la sélection des
  candidates et la relecture verrouillée qui garde la course.
- **Duplication de projet** — copier un projet recopiait aussi ses tâches archivées, en
  clones **actifs**, ressuscitant du travail justement rangé (PR #267).

### Sécurité — la bonne réponse des QCM ForetMap était en accès libre

`GET /api/quiz/questions` est une route **publique** — le catalogue des questions doit être
consultable. Elle renvoyait aussi `reponse_correcte`, pour **toutes** les questions actives,
à n'importe quel appelant : une seule requête suffisait à obtenir le corrigé complet.

La conséquence dépasse cette route. Le lot v1.100.1 avait retiré la bonne réponse du jeton
de présentation, précisément pour qu'un élève ne puisse pas la lire avant de répondre ; ce
durcissement ne servait à rien tant que la même information s'obtenait ailleurs, sans même
ouvrir le QCM. Le mélange des choix à chaque tirage non plus.

`reponse_correcte` n'est désormais exposé qu'à un appelant détenant **`plants.manage`**,
c'est-à-dire à qui gère le catalogue. C'est exactement la règle déjà appliquée côté GL
(`routes/gl/qcm.js` : `gl.content.manage`) — ForetMap était le seul des deux catalogues à ne
pas la poser. Le reste de la fiche (énoncé, catégorie, niveau, difficulté) reste public.

Aucun écran n'est affecté : le front ne consomme `reponse_correcte` que dans les éditeurs,
servis par les routes `/api/quiz/admin/*`, elles-mêmes déjà derrière `plants.manage`.
Diagnostic repris de la PR #284, restée en brouillon depuis le 6 août.

### GL — le score du QCM se compte par joueur : règle tranchée, pas un défaut

`docs/AUDIT_APP_ET_JEU_2026-08.md` §6.2 laissait une question ouverte : une équipe de cinq
marque mécaniquement +5 sur la même question du plateau, chaque joueur obtenant sa propre
présentation. Le document y voyait un défaut d'unicité à corriger côté serveur.

**Décision : le score se compte par joueur, et c'est voulu.** Chaque élève qui répond juste
rapporte un point à son équipe. L'intention est pédagogique — on veut que *chacun* réponde,
pas qu'un seul réponde pour tout le groupe pendant que les autres regardent ; compter par
équipe aurait récompensé le plus rapide et dispensé les autres.

Aucun changement de code : le comportement actuel est le bon. Ce qui change, c'est qu'il est
désormais **écrit** — dans l'audit (le point est tranché, plus « à trancher »), dans
`docs/API.md` et dans la doc de référence MJ, avec le corollaire d'équilibrage à connaître :
une équipe nombreuse marque plus qu'une équipe réduite, donc mieux vaut des effectifs
voisins si les scores doivent être comparés. La garde d'usage unique introduite en v1.100.1
reste indispensable et porte sur **la présentation** : elle empêche un élève de rejouer son
jeton, pas ses camarades de répondre à leur tour.

### GL — on ne récolte plus le plateau sans le parcourir

Deux routes de partie accordaient leurs récompenses sans vérifier que l'équipe se trouvait
là où l'action se joue. Le déplacement de la mascotte est pourtant tout le jeu : sans ces
gardes, une classe encaissait cœurs et gemmes de l'ensemble du plateau depuis sa chaise.
Diagnostic et approche repris de la PR #285, restée en brouillon sur une base antérieure.

- **Zones feuillets** — `POST …/feuillet-zones/:zoneId/present` refuse désormais (`409`)
  si la mascotte n'est pas **dans le polygone** de la zone : position libre, ou héritée du
  repère où l'équipe se tient. Les 24 zones du catalogue étaient jusqu'ici présentables
  d'affilée sans bouger, chacune inscrivant son événement `feuillet_zone_presented`.
  Le contrôle est un miroir CJS exact de `src/gl/utils/glPointInPolygon.js`
  (`lib/shared/glPointInPolygon.js`) : le serveur doit conclure comme l'écran du joueur,
  faute de quoi une mascotte visiblement dans la zone se verrait refusée.
- **Effets de repère** — `POST …/markers/:markerId/present-arrival` refuse (`409`) si
  l'équipe n'est pas sur ce repère : « présenter une arrivée » suppose d'être arrivé.
  Le paramètre `playerIds`, qui cible un sous-ensemble de joueurs, redevient un geste de
  MJ — laissé au joueur, il permettait de choisir qui encaisse un gain ou subit une perte.
- **Ciblage** — `applyMarkerVitalityEffects` vérifie que chaque joueur ciblé appartient au
  **roster de l'équipe** (`400` sinon) : `playerIds` désignait des lignes de `gl_players`
  sans autre contrôle, donc un joueur d'une autre équipe, d'une autre classe, ou ne
  participant à aucune partie pouvait être crédité ou débité. La liste est aussi
  dédoublonnée — le même identifiant deux fois appliquait le delta deux fois.

Dans les deux cas, **le MJ n'est pas soumis à la garde** : présenter à distance est un geste
d'animation légitime (démonstration, rattrapage d'une équipe bloquée).

Une faiblesse du brouillon d'origine a été corrigée au passage : `Number(null)` valant `0`,
une équipe de position inconnue était traitée comme posée au coin `(0, 0)` du plateau au lieu
d'être refusée. La coercition est désormais stricte, et c'est couvert par un test.

### GL — les téléchargements XLSX du panneau contenus lore ne livraient aucun fichier

Les six boutons « Modèle XLSX » / « Exporter » du carnet de Sélène, du glossaire lore et du
QCM lore ne produisaient rien. Deux causes, indépendantes, reprises de la PR #265 :

- `wrapXlsxRoute` n'envoyait pas le retour `{ buffer, filename }` des handlers lore —
  **Express ignore la valeur de retour d'un handler**, si bien que la réponse ne partait
  jamais et que la requête restait pendante jusqu'au délai du navigateur. L'enveloppe
  envoie désormais ce retour, sans double envoi si le handler a déjà répondu.
- `GET /admin/feuillets/export` était déclarée **après** `/admin/feuillets/:code` : `export`
  étant un segment unique, la route était capturée comme un code de feuillet et répondait
  `404 « Feuillet introuvable »`. Elle remonte avant la route paramétrée.

Les six routes sont désormais couvertes par un test HTTP qui exige un `200`, le type MIME
XLSX et la signature ZIP — un handler muet échoue donc au lieu de faire patienter.

### Intégrité du QCM : la bonne réponse ne quitte plus le serveur, et une question ne se joue qu'une fois

Deux défauts identifiés par [docs/AUDIT_APP_ET_JEU_2026-08.md](docs/AUDIT_APP_ET_JEU_2026-08.md)
§6.2, dont les correctifs dormaient en brouillon (PR #277 et #275) : ils sont repris ici sur
la base actuelle. Le second était accompagné d'une migration `171` qui, sur une base déjà
migrée au-delà, aurait été **sautée sans bruit** par le runner (`num < current`) — d'où sa
renumérotation.

- **La bonne réponse était lisible avant de répondre.** Le `presentationToken` est un JWT :
  signé, donc infalsifiable, mais **pas chiffré** — sa charge utile est du base64. Il portait
  `correctChoiceId` ; un élève ouvrant les outils de développement de son navigateur lisait
  la solution avant de cocher. Le jeton ne porte désormais qu'un `nonce` et l'**empreinte
  HMAC-SHA256** de la bonne réponse (clé : `JWT_SECRET`) : le serveur recalcule l'empreinte
  pour le choix reçu et compare, à temps constant. Sans le secret, elle n'est ni lisible ni
  reproductible, et deux présentations d'une même question ne donnent pas la même empreinte.
  La bonne réponse n'est renvoyée qu'une fois trouvée. Les jetons de l'ancien format sont
  **refusés** plutôt qu'acceptés par compatibilité : une question ouverte au moment du
  déploiement doit être rechargée.
- **Le même jeton pouvait rapporter des points indéfiniment.** `POST /api/gl/games/:id/qcm/answer`
  ne marquait pas le jeton comme consommé : pendant ses 15 minutes de validité, renvoyer la
  même requête — légitime, sans rien forger — recréditait l'équipe à chaque appel. Chaque
  présentation porte maintenant un `jti` consommé par la première réponse (migration
  **`193_gl_qcm_presentation_uses.sql`**, clé primaire = arbitre) ; un rejeu reçoit `409`
  « Présentation déjà utilisée ». Consommation et attribution du score sont dans la même
  transaction, et l'enregistrement de tentative pour le conditionnement pédagogique passe
  **après** : un rejeu refusé ne pose plus de verrou de re-tentative.
- **Tests** — `tests/gl-qcm-choices.test.js` décode réellement le jeton pour vérifier
  l'absence de la réponse et l'unicité du `jti` ; `tests/gl-qcm-presentation-reuse.test.js`
  rejoue la requête et vérifie que le score reste à 1.

### GL — un échange de feuillet n'écrase plus une découverte déjà faite

Sur le Marché, livrer une copie à une équipe qui **possédait déjà** le feuillet réécrivait son
état : une découverte faite sur la carte était reclassée en échange, et un feuillet encore
lisible pouvait devenir illisible (copie plus effacée que la sienne). L'équipe conserve
désormais l'état qu'elle a ; la copie ne s'écrit que si le feuillet lui est nouveau, et le
compteur `delivered` ne compte que ces feuillets-là. Correctif repris de la PR #314, restée en
brouillon sur une base antérieure. Tests : `tests/gl-market-feuillets-deliver.test.js` (les
quatre statuts de possession, sans base) et un scénario d'échange complet dans
`tests/gl-market-feuillets.test.js`.

### Cohérence — un seul point d'entrée pour les jetons, les horodatages et les images

Trois conventions étaient énoncées quelque part et appliquées à moitié. Aucun changement de
comportement, mais un seul endroit à lire — et à corriger — pour chacune.

- **Jetons** — `jsonwebtoken` était appelé depuis neuf endroits (`server.js`, `routes/auth.js`,
  `lib/realtime.js`, `lib/glQcmChoices.js`, `middleware/requireTeacher.js`). Tout passe
  désormais par `lib/auth/jwtPipeline.js`, qui **épingle l'algorithme** (`HS256`) à la
  signature comme à la vérification : un jeton présenté en `none` ou en RS256 est rejeté avant
  lecture des claims, sans dépendre du défaut de la bibliothèque.
- **Horodatages** — le lot précédent a introduit `nowIsoUtc()` (colonnes temporelles héritées
  en `VARCHAR`, où deux formats concurrents cassent le tri) mais laissait une vingtaine
  d'écritures en `new Date().toISOString()` littéral. Toutes les écritures en base passent
  maintenant par le helper ; les usages qui ne sont pas des horodatages de colonne (nom de
  fichier d'export, date seule, manifestes JSON) restent inchangés.
- **Images** — le contrôle du type d'une data-URL existait en **cinq exemplaires**, avec deux
  listes de formats à garder d'accord. Il vit dans `lib/shared/dataUrlImage.js`, chaque module
  gardant son export d'origine. La liste reste fermée — un `image/svg+xml`, qui porte du
  script, n'y figure toujours pas — et c'est désormais vérifié par un test.

### Documentation

- `CHANGELOG.md` : le correctif « mot de passe oublié GL » figurait **trois fois** sous
  `[Non publié]` (deux rédactions du même lot et un titre orphelin), séquelle de fusions
  croisées le même jour. Une seule version, la complète, est conservée.
- `docs/API.md` : nouveau paragraphe sur le contrat du `presentationToken` (ce qu'il ne
  contient pas, son usage unique, quand la bonne réponse est révélée) ; comportement de
  l'échange de feuillet quand le receveur possède déjà la page.
- Doc de référence : `qcm-et-pedagogie.md` (une question affichée = une réponse comptée) et
  `economie-marche-sorts.md` (l'échange ne dégrade pas ce que l'équipe a déjà).

### Intégration continue — une étape figée ne coûte plus six heures

`.github/workflows/ci.yml` ne posait aucun `timeout-minutes`. Une étape suspendue consommait
donc les **6 heures** du délai GitHub par défaut, après quoi le job `test` — le check requis
par les protections de branche — terminait en `cancelled`, indiscernable d'un vrai échec.
C'est arrivé le 19/08/2026 : `npx playwright install --with-deps chromium` est resté bloqué
5 h 55, alors que les tests backend étaient passés en 4 minutes. Les jobs sont désormais
bornés (30 min pour `test`, 20 pour `quality` — un run sain tient en ~15 min), et l'étape
d'installation du navigateur, seule à dépendre d'un réseau externe, l'est à 10 min.

### GL — la liasse du copiste, remise en fin de voyage

Sur les 40 feuillets de la liasse `copiste`, 14 étaient déjà distribués en jeu (un par
milieu, un à l'entrée de chaque pays) : la voix du copiste ponctuait donc déjà le voyage.
Les 26 autres — couverture, préface, origine, marginalia, inserts, les trois actes, la
confession, la finale et la clôture — n'étaient rattachés à rien, donc inatteignables.
Les éparpiller dans les pools aurait dilué les feuillets de terrain, ceux qui portent la
biodiversité ; et deux de ces pages sont la **clé de lecture de la fin** (le carnet de
Sélène s'arrête sur un mot suspendu, délibérément — le copiste est le seul à le dire).
La liasse est donc remise **en bloc, à la fin du voyage**.

- **Remise automatique** — quand une partie du **dernier plateau** passe en « terminée »,
  chaque équipe reçoit la liasse entière : sans QCM, sans coût en gemmes, sans effacement.
  Le déclenchement est réservé au plateau 5 : livrée plus tôt, la liasse dévoilerait la fin.
- **Remise à la demande du MJ** — nouvelle route `POST /api/gl/lore/games/:id/liasses/:bundle`
  (`ouverture` | `cloture`, permission `gl.game.manage`) : le filet pour une classe qui
  s'arrête avant le chapitre 5 ou pour une dernière séance dédiée. Idempotente — un feuillet
  déjà trouvé n'est jamais réattribué.
- **Base de données** — migration **`191_gl_feuillets_liasse_cloture.sql`** : colonne
  `offert_cloture` (pendant de `offert_ouverture`), marquage piloté par la donnée (`liasse`,
  et non une liste de codes), provenance `cloture` ajoutée en fin d'ENUM. **Plus aucun
  feuillet du corpus n'est hors de portée.**
- **Position des trois actes dans le récit** — migration **`192_gl_feuillets_ordre_recit_places.sql`** :
  les actes portaient 210, 693 et 2050, hors de l'échelle du récit (1→150), donc rejetés en
  fin de lecture. Leur texte dit où ils vont : « CHACUN POUR SA PEAU » s'adresse au joueur
  « à ta première case » (→ 14), « LE BÂTON » commente la scène de la tourbière où Sélène se
  couche dans la boue (→ 76, juste après elle), « LA MÊME CORDE » tend le carnet au lecteur
  et conclut « Tourne la page » (→ 150, le dernier mot, après les feuillets vierges).
  La même migration replace **cinq scènes** que la migration 178 avait ramenées trop tôt : en
  soustrayant 80 000 elle transformait un rang local au plateau en position globale, et deux
  scènes des landes atterrissaient au milieu des tropiques. Elles rejoignent la portion de
  récit de leur milieu (tourbière après la page des landes, ligne de feu auprès de sa version
  d'origine, rechute après la page du désert froid).
- **Technique** — `lib/glFeuilletStarterGrant.js` devient `lib/glFeuilletBundleGrant.js` :
  une seule mécanique de remise, paramétrée par liasse.

### Correctif — « mot de passe oublié » réparé pour les joueurs GL

La migration 185 posait une clé étrangère `password_reset_tokens.user_id → users.id`.
L'intention était bonne (un jeton ne doit pas survivre au compte qui l'a demandé), mais la
table est **polymorphe** : `user_id` désigne un compte de `users` (élève, enseignant) **ou**
un joueur GL de `gl_players`. Depuis, la demande de réinitialisation d'un joueur GL échouait
(`ER_NO_REFERENCED_ROW_2`), et `tests/gl-auth-forgot-password.test.js` était rouge. Les
comptes élèves et enseignants n'étaient pas touchés.

- **Base de données** — migration **`189_password_reset_tokens_polymorphic_fk.sql`** : la
  clé étrangère est retirée (une FK ne peut pas exprimer « existe dans `users` **ou** dans
  `gl_players` »). La clé étrangère de `user_roles` est conservée, sa population étant bien
  limitée à `users`.
- **Base de données** — migration **`190_password_reset_drop_redundant_user_index.sql`** :
  l'index `idx_password_reset_user (user_id)`, qui n'existait que pour porter la clé
  supprimée, part à son tour. `sql/schema_foretmap.sql` ne le déclare plus : le garder en
  base aurait fait diverger une installation migrée d'une installation fraîche. Aucune
  requête ne lit la table par `user_id` seul — `idx_password_reset_lookup (user_type,
  user_id)` couvre la purge de `lib/studentDeletion.js`, `uq_password_reset_token_hash` la
  lecture du jeton.
- **Schéma** — `sql/schema_foretmap.sql` cesse de déclarer cette clé : sinon le fichier de
  schéma la poserait à la création de la table pour qu'une migration la retire aussitôt.
- **Test** — `tests/password-reset-polymorphic.test.js` : un joueur GL obtient son jeton, la
  table ne porte aucune contrainte référentielle, et l'index redondant a bien disparu.
- **Audit** — `docs/AUDIT_BDD_2026-08.md` §4.2 et §8 : la recommandation d'origine était
  juste pour `user_roles` et fausse pour `password_reset_tokens`. Le document le dit
  désormais, et acte que le manque d'intégrité signalé n'est comblé qu'à moitié.

Deux correctifs indépendants ont visé ce même défaut et ont été fusionnés le même jour, ce
qui a laissé sur `main` **deux migrations numérotées 189** — de quoi bloquer le démarrage
(`assertNoNewDuplicateMigrationNumbers`). Le doublon
`189_password_reset_drop_users_fk.sql` et le test qui l'accompagnait sont supprimés ; la
version conservée est celle ci-dessus.

### GL — feuillets : atteignables, mieux répartis, et un cadre offert à l'ouverture

Audit du corpus (205 feuillets actifs) : 18 % n'étaient atteignables par **aucun** canal
d'acquisition, la répartition entre pays était très inégale (3 feuillets liés aux espèces
pour le pays 1 contre 15 pour le pays 4, alors que chaque chapitre propose une cinquantaine
d'espèces), la finale du voyage arrivait **entièrement effacée**, et n'importe quel joueur
pouvait faire apparaître n'importe quel feuillet par l'API. Ce lot corrige tout cela.
La trame du copiste (`cop-*`) reste volontairement de côté : son rattachement est un choix
éditorial à part.

- **Feuillets d'ouverture** — les feuillets qui posent la situation (la boîte confiée à la
  classe, le pacte du seuil, ce que voit un gnome / garde une licorne, les formes de Sélène)
  sont désormais **donnés à chaque équipe au démarrage de la partie**, sans QCM, sans coût en
  gemmes et sans effacement ; une équipe créée après le démarrage reçoit le même lot. Le lot
  est piloté par la donnée (`gl_lore_feuillets.offert_ouverture`, éditable en masse) : aucun
  développement n'est nécessaire pour l'ajuster.
- **Étude d'espèce** — après le feuillet dédié à l'espèce puis ceux de son pays, la
  révélation **bascule sur le pool du chapitre**. Étudier la biodiversité rapporte autant au
  premier chapitre qu'au dernier, et les biomes hors voyage (mangrove, prairie/steppe), qui
  ne rapportaient rien, comptent enfin.
- **Portée de la présentation directe** — `POST /api/gl/lore/games/:id/feuillets/:code/present`
  n'accepte plus, hors MJ, qu'un feuillet du pool du chapitre (ou du lot d'ouverture) : 404
  sinon. Un joueur ne peut plus débloquer un feuillet d'un autre chapitre en appelant l'API.
- **Base de données** — migration **`178_gl_feuillets_atteignabilite.sql`**, idempotente :
  `effacement = 'oui'` (traité comme un effacement total, texte vidé dès la découverte)
  repasse sur `partiel` ; cinq feuillets dont l'`ordre_voyage`/`ordre_recit` était à 80 0xx
  retrouvent l'échelle du corpus (ils étaient rejetés en fin de pool, donc quasi jamais
  servis) ; quatre `lien_pays` contredisant leur biome sont réalignés (ils faisaient
  apparaître le feuillet dans deux chapitres) ; les cinq « échos », rattachés à rien, sont
  répartis un par plateau ; nouvelle colonne `offert_ouverture` et provenance `ouverture`.
- **Lien direct** — le canal générique cherchait un feuillet dédié en comparant `lien_canal`
  (français : `espece`, `glossaire`…) au type de ressource (anglais : `species`, `glossary`…) :
  la correspondance était impossible et l'on retombait toujours sur le premier feuillet du
  pool. Une table d'alias rend ce ciblage opérationnel pour le corpus à venir.
- **Documentation** — `docs/reference/gl/chapitres-et-progression.md` (canaux d'obtention,
  feuillets d'ouverture) et `docs/reference/gl/qcm-et-pedagogie.md` (posséder un feuillet
  n'est pas l'avoir étudié : le QCM garde la porte du carnet personnel, pas celle du feuillet).

### Base de données — exécution du plan d'audit (points 2 à 12)

Le plan d'action de [`docs/AUDIT_BDD_2026-08.md`](docs/AUDIT_BDD_2026-08.md) est appliqué,
à l'exception du calage GPS (§3.1, relevé de terrain) et du passage des 29 colonnes de date
en `DATETIME` (§3.2, lot dédié). Six migrations, 183 à 188, toutes idempotentes.

**Ce qui ne peut plus se reproduire.** Trois classes de défauts sont fermées par un
garde-fou, pas seulement réparées :

- Les objets supprimés par une migration ne ressuscitent plus au démarrage.
  `sql/schema_foretmap.sql` doit continuer à les déclarer pour que les migrations
  historiques se rejouent sur une base neuve — c'est désormais `lib/legacySchemaCleanup.js`
  qui les retire, **après** les migrations, à chaque démarrage. Un test statique fait
  échouer la CI au prochain oubli du même genre.
- Les vues SQL sont ramenées sur la base courante (migration 183), et un test interdit
  qu'une vue cite un autre schéma — c'est ce qui faisait qu'une copie de la base lisait la
  production.
- Les tutoriels ne se dupliquent plus : le jeu de démarrage ne s'applique qu'à une base
  vide. Il était rejoué à chaque démarrage et créait une seconde copie de chaque fiche dès
  que l'import depuis `tutos/*.html` l'avait déjà créée sous un autre slug — la production
  comptait 24 tutoriels pour 14 contenus, la plupart affichés deux fois aux élèves.

**Intégrité et hygiène.** Clé étrangère `user_roles → users` après purge des orphelins
(celle de `password_reset_tokens` a dû être retirée, voir le correctif ci-dessus) ;
attributions de rôles croisant
les populations retirées ; trois tables de jonction héritées supprimées après rejeu de leur
reprise ; 14 index redondants supprimés ; collations alignées ; slugs de rôle réparés et
leur cause corrigée à la saisie (`src/utils/slugify.js`, accent-conscient).

**Horodatages.** Trois colonnes `VARCHAR` mélangeaient l'ISO-8601 UTC et l'heure locale, ce
qui inversait l'ordre d'affichage — MySQL compare `'T'` à `' '` au dixième caractère. Elles
convergent vers l'ISO-8601 UTC, l'offset Europe/Paris étant retiré selon la saison de
chaque ligne. `audit_log.occurred_at` est recalé sur `created_at`, qui fait foi.

**Deux outils, à blanc par défaut.** `npm run tutorials:dedup` fusionne les tutoriels au
contenu identique sans perdre un seul lien ; `npm run logs:purge` applique une durée de
conservation aux journaux, qui gardaient sans limite adresses IP et user-agents. Ligne de
crontab documentée dans [`docs/CRONTAB.md`](docs/CRONTAB.md).

**Garde-fou.** La suite de tests refuse de démarrer sur une base dont le nom ne ressemble
pas à une base de test : sans `TEST_DB_NAME`, elle reprenait le `DB_NAME` du `.env`.

Le document d'audit est mis à jour : trois constats étaient sous-estimés (une troisième
colonne de dates mixtes, l'ampleur réelle des doublons de tutoriels) et un quatrième était
faux — les deux journaux d'audit ne divergent pas, l'écart s'explique entièrement par la
date de création de `security_events`.

### Documentation — audit complet de la base de données (août 2026)

Nouveau document [`docs/AUDIT_BDD_2026-08.md`](docs/AUDIT_BDD_2026-08.md) : audit de la
base de production `oliviera_foretmap` (135 tables, 19 460 lignes, 176 clés étrangères,
418 index), réalisé sur une copie fraîche exportée le 18 août 2026, et confrontée au
schéma, aux 171 migrations et au code applicatif. **Aucun comportement ni aucune donnée
modifiés** — le document constate, chiffre et propose ; il ne corrige rien.

Trois constats sérieux, chacun avec sa requête de vérification :

- **Le calage GPS de la carte « forêt comestible » est géométriquement impossible** :
  deux ancres distantes de 85 % du plan sont à 3,7 m l'une de l'autre, contre 55,2 m pour
  deux ancres distantes de 48 % — facteur 26 entre les échelles implicites. La validation
  ne teste la colinéarité que dans le repère écran, jamais dans le repère GPS. La
  longitude des deux cartes est en outre probablement de signe inversé ; la PR #310
  corrige la *saisie* future, pas les ancres déjà en base.
- **Deux colonnes de date mélangent deux formats incompatibles** (ISO-Z et datetime
  local), et le tri en est faux à l'écran : 15 paires de marqueurs et 30 paires de
  tutoriels sont affichées dans le désordre. Symptôme de 29 colonnes temporelles typées
  `VARCHAR(32)`.
- **`role_pin_secrets` et `elevation_audit`, supprimées par la migration 164, sont
  recréées à chaque démarrage** parce que `sql/schema_foretmap.sql` les déclare encore et
  qu'`initSchema()` s'exécute avant les migrations.

Également documentés : les deux vues SQL portent le nom de la base en dur, ce qui
n'affecte pas la production mais fait qu'une copie restaurée lit la base d'origine (ou
casse l'import local) ; deux orphelins RBAC sans clé étrangère ; deux journaux d'audit
qui divergent ; 3 230 lignes de tables de liaison remplacées mais jamais supprimées
(reprise vérifiée complète) ; un `.gitignore` qui ne couvre pas le nom de dump donné par
`docs/LOCAL_DEV.md`. Un plan d'action en 13 points, classé par rapport bénéfice/risque,
clôt le document.
### GL — les ressources rattachées au mauvais chapitre

Dans GL, une ressource (espèce, terme de glossaire, question de QCM, feuillet) n'est
pas rangée « dans » un chapitre : son rattachement est **déduit des biomes** du
chapitre. Quelques liens biome erronés suffisaient donc à faire remonter des centaines
de ressources sous un chapitre de test ou de démonstration, et à les compter deux fois
dans la vue d'ensemble admin des feuillets. En base, deux dérives cumulées : le
chapitre de plateau « Toundra arctique » n'avait **aucun** biome (donc aucune espèce,
aucun glossaire et un pool de QCM vide), tandis que le chapitre de démonstration
`foret-magique` et un chapitre bac à sable portaient les biomes des vrais chapitres.

- **Base de données** — migration **`177_gl_chapter_biomes_repair.sql`**, idempotente et
  pilotée par la donnée (aucun identifiant en dur) : un chapitre de plateau **sans aucun**
  biome reçoit ceux de son plateau (`gl_lore_plateaux`), et un chapitre **hors plateau**
  perd les biomes déjà portés par un chapitre de plateau. Les paramétrages existants ne
  sont jamais réécrits, et un chapitre hors plateau garde ses biomes qui lui sont propres.
- **Aucun contenu n'est supprimé ni déplacé** : la migration ne touche que la table de
  liaison `gl_chapter_biomes`. La suppression des chapitres fautifs a été écartée — les
  clés étrangères vers `gl_chapters` sont en `ON DELETE CASCADE`, supprimer un chapitre
  détruirait ses repères, ses zones et ses sortilèges au lieu de les rendre orphelins.
- **Documentation** — `docs/reference/gl/chapitres-et-progression.md` explique désormais
  que les biomes d'un chapitre décident de son contenu (et qu'un chapitre de test ne doit
  porter aucun biome du voyage).
- **Technique** — `splitSqlStatements` est exporté par `database.js` pour que les tests de
  migration rejouent un fichier SQL avec le découpage exact du runner.

### ForetMap — calage GPS : saisie des coordonnées tolérante

Les champs latitude/longitude du calage GPS d'un plan étaient des champs `number` : selon la
locale du navigateur, le point décimal saisi était réaffiché en virgule (voire la valeur vidée),
donnant l'impression que la correction n'était pas enregistrée. La saisie accepte désormais les
formats usuels et n'est plus réécrite pendant la frappe.

- **Nouvel utilitaire** — `src/utils/geoCoordParse.js` : lecture tolérante d'une coordonnée
  (`parseGeoCoordinate`), d'une paire collée (`parseGeoPair`) et rendu canonique
  (`formatGeoCoordinate`). Formats acceptés : séparateur décimal point **ou** virgule,
  hémisphère en lettre (`48.8534 N`, `7.5898 O`, `W 7.5898`), degrés-minutes-secondes
  (`48°51'12"N`) et degrés-minutes (`48° 51.2' N`), signes moins typographiques.
  Les cas ambigus restent refusés : `48,85` est une coordonnée française, jamais une paire.
- **Outil « Calage GPS » (prof)** — champs en `type="text"` + `inputMode="decimal"` : le texte
  saisi est conservé tel quel pendant la frappe puis normalisé en degrés décimaux à la sortie du
  champ. Coller une paire (`48.8534, 2.3488`) ou un lien Google Maps / OpenStreetMap dans l'un
  des deux champs remplit latitude **et** longitude. Une valeur illisible ou hors bornes est
  signalée sous la ligne (`aria-invalid`) sans effacer la saisie.
- **API** — `PUT /api/settings/admin/maps/:id/georef` accepte une coordonnée envoyée en chaîne
  (`"48,8534"`) et la normalise en nombre avant stockage, au lieu de répondre `400`.
- **Tests** — `tests-ui/utils/geoCoordParse.test.js` (parsing), `tests/map-georef-anchors.test.js`
  (validation/normalisation serveur, sans BDD), plus 3 scénarios ajoutés à
  `tests-ui/components/MapGeorefPanel.test.jsx` et 1 à `tests/settings-maps-georef.test.js`.
- **Documentation** — `docs/API.md` et `docs/reference/foretmap/carte-et-zones.md` (nouvelle
  section « Comment saisir les coordonnées du calage »).

### ForetMap — les mascottes ne sont plus rattachées à une carte

Le studio « Packs mascotte » affichait une liste **différente selon la carte affichée** :
les packs étaient stockés avec un `map_id`, alors que les visiteurs, eux, voyaient déjà
toutes les mascottes publiées, quelle que soit la carte. Un pack créé sur une carte
restait invisible dans le studio d'une autre, et ne pouvait y être déplacé qu'en passant
par un export/import d'archive. Une mascotte est désormais un objet **global** de la
visite, et le studio n'a plus qu'**une seule liste**.

- **Base de données** — migration **`176_visit_mascot_packs_drop_map.sql`** : la colonne
  `map_id` disparaît de `visit_mascot_packs` et de `visit_mascot_sprite_library`,
  l'unicité passe de `(map_id, catalog_id)` à `catalog_id` et de `(map_id, filename)` à
  `filename` (dédoublonnage préalable : pack le plus récemment mis à jour, sprite le plus
  ancien). Migration idempotente, aucune donnée de pack perdue.
- **API** — `GET /api/visit/mascot-packs` ne demande plus `map_id` (un `?map_id=` hérité
  est ignoré) et renvoie tous les packs ; `POST`, `PUT` et l'import d'archive n'acceptent
  plus `map_id` ; le clonage d'un pack n'est plus limité à « la même carte ». La
  bibliothèque de sprites passe de `/api/visit/mascot-sprite-library/:mapId/assets…` à
  **`/api/visit/mascot-sprite-library/assets…`**, et `GET /api/visit/content` renvoie
  désormais **tous** les packs publiés (il filtrait par carte, contrairement au registre
  `GET /api/visit/mascots`).
- **Compatibilité des packs existants** — aucun fichier n'est déplacé sur le disque :
  l'URL historique `/api/visit/mascot-sprite-library/<carte>/assets/<fichier>`, référencée
  dans le `framesBase` de packs déjà publiés, reste **servie en lecture**, et les sprites
  restés dans un sous-dossier de carte sont résolus automatiquement
  (**`lib/visitMascotSpriteLibraryFiles.js`**).
- **Studio simplifié** — le sélecteur « Carte active » de l'onglet Packs mascotte
  disparaît, ainsi que les mentions de carte dans la liste des packs, le panneau Images et
  l'aperçu. Le filtre d'images « Carte » devient **« Bibliothèque »**, et les boutons
  « Importer sur la carte… » / « framesBase → carte » deviennent « Envoyer à la
  bibliothèque… » / « framesBase → bibliothèque ».
- **Tests** — la liste studio globale, la compatibilité de l'URL historique et la
  résolution disque des sprites hérités sont couvertes (`tests/api.test.js`,
  **`tests/visit-mascot-sprite-library-files.test.js`**, `tests/visit-helpers.test.js`,
  `tests-ui/**`). Documentation : `docs/API.md`, `docs/MASCOT_PACK.md` et
  `docs/reference/foretmap/visite-et-mascottes.md`.
### ForetMap — les titres du studio narrateur OLU redeviennent lisibles

Dans **Paramètres → Narrateur OLU**, les noms des comportements d'OLU (« Neutre », « Parle »,
« Montre »…) s'affichaient en vert foncé sur un bandeau vert foncé : illisibles, surtout sur
téléphone en mode portrait.

- **Cause.** La barre verte de l'application était stylée par un sélecteur d'élément nu
  (`header { … }`) dans `src/index.css`. Toute balise `<header>` de l'app héritait donc du
  bandeau vert collant : l'en-tête de chaque carte d'expression du studio narrateur, dont le
  titre reste en vert forêt — vert sur vert.
- **Correctif.** Le bandeau est désormais réservé à `header.app-header`. Les en-têtes
  sémantiques redeviennent de simples titres de section, sur fond clair.
- **Effet de bord réparé au passage.** Les en-têtes des vues pédagogiques (Quiz, Glossaire,
  Réseau alimentaire) subissaient le même héritage : titre et sous-titre étaient posés sur le
  bandeau vert et tronqués par sa hauteur fixe. Ils s'affichent de nouveau normalement.
- Un test de garde (`tests-ui/utils/appHeaderCssScope.test.js`) empêche le retour d'un
  sélecteur `header` nu dans la feuille de styles.

### ForetMap — la médiathèque accepte enfin les photos d'un téléphone Android

Le bouton **Importer** de la médiathèque ne fonctionnait pas depuis un smartphone Android.
Trois causes indépendantes se cumulaient, toutes propres au mobile ; elles sont traitées
ensemble, et le reste des imports d'images de l'application en profite.

- **Type MIME manquant.** Les sélecteurs Android (Google Photos, Fichiers, Drive, galeries
  tierces) renvoient très souvent un fichier dont le `type` est vide ou
  `application/octet-stream`. `FileReader` recopiait ce type dans la data URL, et le serveur
  refusait la photo avec « Type MIME non autorisé » alors qu'il s'agissait d'un JPEG.
  Le nouveau module **`src/utils/mediaImport.js`** normalise le type (alias, extension du nom,
  **signature binaire** du fichier) avant l'envoi, et **`lib/mediaLibrary.js`** applique le même
  repli côté serveur — les autres clients (dont G&L) en bénéficient sans changement.
- **Photos trop lourdes.** Un capteur récent produit des fichiers que l'encodage base64
  gonfle de 33 % : au-delà de la limite de corps HTTP, l'envoi partait en **413**. Les images
  de plus de 4 Mo sont désormais **allégées avant l'envoi** (2400 px de côté maximum), en
  **PNG** si la source est un PNG ou un WebP — la transparence survit — et en JPEG sinon.
  GIF (animation) et SVG (vectoriel) ne passent jamais par le canvas. Plafond explicite à
  15 Mo par média, refusé **avant** l'envoi avec le poids du fichier dans le message.
- **Sélecteur qui refermait la fenêtre.** Le bouton était un `<label>` englobant un `input`
  masqué : les WebView Android n'ouvrent pas toujours le sélecteur ainsi, et le `popstate`
  émis au retour fermait la modale hôte (studio narrateur, éditeurs G&L) **avant**
  l'événement `change` — l'import était perdu sans message. On passe au clic programmatique
  sur une `ref` avec la garde **`armNativeFilePickerGuard`** déjà utilisée par les autres
  champs photo de l'application. Même correction sur la carte **portrait du narrateur**.

- **Effet de bord assumé côté G&L.** La médiathèque transmet désormais le **nom d'origine**
  du fichier (`original_name`) : les médias importés depuis **Contenus → Bibliothèque**
  reçoivent enfin la **clé stable** que le panneau annonçait déjà (« Copiez la clé stable
  affichée dans la galerie après import »).

- **Ce que l'utilisateur voit** : un bouton **📸 Prendre une photo** à côté d'**📁 Importer** ;
  le nom d'origine du fichier conservé (et donc sa clé stable) ; en cas d'import multiple,
  un fichier refusé **n'interrompt plus le lot** et est nommé dans le message d'erreur ;
  les photos **HEIC/HEIF** — que nul navigateur ne sait décoder — sont refusées avec le
  réglage Android à changer, au lieu d'un « Type MIME non autorisé » opaque.

Tests : `tests-ui/utils/mediaImport.test.js` (20 cas — normalisation, planification, signature
binaire, ré-encodage), `tests-ui/components/MediaLibraryMenu.test.jsx` (ouverture du sélecteur,
garde `popstate`, photo sans type, lot partiellement refusé),
`tests/media-library-generic-mime.test.js` (repli serveur). Documentation : `docs/API.md`
(résolution du type MIME à l'upload) et `docs/reference/foretmap/stats-forum-et-suivi.md`
(formats, taille maximale, avertissement HEIC).


### ForetMap — OLU parle enfin à la première personne (lot 4), et ses visites guidées deviennent éditables

**Le corpus.** Les 21 étapes des 13 visites guidées, les 7 panneaux d'aide et les 3 astuces sont
réécrits à la voix d'OLU : le **jeune renard explorateur** du brief graphique — curieux, motivé,
espiègle et blagueur, sans être niais. Il dit « je », tutoie, tient en une à trois phrases et n'emploie
aucun emoji — l'expression passe par le portrait posé au lot 3. Les infobulles, les
bandeaux de tracé et les indicateurs temps réel restent au registre fonctionnel : on les lit la
main déjà sur le bouton, il n'y a pas de place pour une voix.

- **Le miroir `src/constants/help.js` ↔ `data/help.default.json` est désormais identique au
  caractère près**, et un test le vérifie. Les deux divergeaient sur les apostrophes, et le JSON
  portait des `d abord` / `c est` sans apostrophe du tout : l'utilisateur voyait un texte avant la
  réponse serveur, un autre après.
- **`RELAUNCH_STEP` n'a pas été dupliqué.** Son texte est écrit pour fonctionner dans les treize
  parcours ; un test vérifie qu'il reste un objet unique partagé par référence.
- **Cinq passages « lourds » sur treize parcours**, portant l'expression `grave`. La règle d'un
  passage grave par parcours est un plafond, pas un quota : les huit autres restent au registre
  courant, faute de quoi le ton devient moralisateur.
- **Le personnage a été révisé en fin de lot.** La charte du lot 0 décrivait un « copiste cool » —
  un observateur âgé qui recopie et transmet. Le brief graphique montre tout autre chose : un jeune
  renard explorateur, sac à dos, boussole, « sourcils froncés par la curiosité et non par
  l'inquiétude ». Le corpus écrit sur la première hypothèse sonnait faux à côté du portrait ; il a
  été entièrement repris, et toutes les tournures scribales (« j'ai recopié », « mon herbier »,
  « mes vieux yeux ») retirées. `docs/MASCOT_NARRATEUR_OLU.md` §2 et la doc de référence suivent.
- **Une règle d'or encadre l'humour** (§2.2bis, nouvelle) : la cible d'une plaisanterie est
  toujours OLU lui-même — jamais l'utilisateur, et surtout pas une erreur qu'il vient de faire ;
  la chute arrive **après** l'information, de sorte qu'une lecture en diagonale récupère quand
  même le renseignement ; et trois endroits restent sans plaisanterie — permissions,
  avertissements, passages graves. Le plafond d'un point d'exclamation par parcours est
  **conservé** : deux suffisent sur tout le corpus, l'humour venant du décalage et du placement
  de la chute, pas de la ponctuation.
- **Le registre comique a été rééquilibré après relecture d'ensemble.** Une première version
  comptait **neuf autodérisions sur vingt et une bulles** : chacune respectait la règle « une
  pointe par bulle », mais c'était neuf fois le même procédé, et enchaîner trois parcours donnait
  trois fois « OLU est nul en quelque chose ». Ramené à **trois**, avec rotation des registres
  (complicité, litote, détail de terrain, anti-climax, fausse évidence). Deux corrections au
  passage : l'étape de relance — la seule lue treize fois — quitte l'autodérision pour la
  complicité, et « tu vas voir des trucs que tu as piétinés toute l'année » disparaît, parce
  qu'elle visait le lecteur en contradiction directe avec la règle d'or qu'on venait d'écrire.
  Le §2.2bis retient la leçon : **compter les formes, pas seulement les blagues.**
- Nouveau test de non-régression du corpus (`tests/help-corpus-olu.test.js`) : aucun emoji dans les
  textes de parcours, au plus un point d'exclamation par parcours, une à trois phrases par bulle,
  structure des étapes intacte, défauts d'aide valides au regard du schéma Zod.

**L'édition des parcours.** Jusqu'ici les visites guidées étaient en code seul, alors que l'aide
était éditable — un écart que le passage à la première personne rendait visible. Elles s'éditent
maintenant depuis **Paramètres → Visites guidées**.

- **Permission dédiée `tours.manage`**, distincte de `admin.settings.write` : réécrire une bulle
  est un geste éditorial, il n'a pas à ouvrir toute la console de réglages. Accordée à l'admin par
  la matrice de rôles, **absente de `prof`** — l'attribuer est un choix d'établissement, fait
  depuis « Profils RBAC ». Un prof qui ne détient que ce droit voit l'onglet Paramètres et
  uniquement cette section ; l'appel à `/api/settings/admin` n'est même pas tenté.
- **Seuls trois champs sont exposés** (`title`, `body`, `bodyTeacher`). `target`, `placement`,
  `role` et `expression` restent en code, et c'est ce qui rend la délégation acceptable : une
  étape dont la cible est absente du DOM est ignorée **silencieusement**, un champ « sélecteur
  CSS » offert à un prof serait un moyen de faire disparaître une étape sans message d'erreur.
- **Le serveur ne connaît pas le corpus par défaut** : il ne stocke que la surcharge
  (`content.tour.registry`, clés plates `<parcours>.<étape>.<champ>`), le client l'applique sur les
  textes du bundle. Améliorer un texte versionné reste donc visible partout où personne n'a
  réécrit ce champ — la propriété obtenue en v1.95.1 pour l'aide, acquise ici par construction.
- **Un champ vide vaut retour au défaut**, contrairement au registre d'aide où vider une ligne est
  une décision qu'on conserve : une bulle de parcours sans texte n'a pas de rendu acceptable.
- **L'étape de relance s'édite une seule fois**, sous une section « Étape commune ». La montrer
  treize fois laisserait croire qu'on peut l'adapter à un onglet, alors que l'objet est partagé.
- Routes `/api/settings/admin/tour-content` (GET/PUT + `/reset`), audits
  `settings_tour_content_update` / `_reset`, exposition publique `content.tour.registry`.

**Doc de référence** : `docs/reference/foretmap/visite-et-mascottes.md` décrit comment OLU parle et
comment modifier ses textes ; le point d'attention « les textes ne sont pas encore à sa voix »
tombe, remplacé par celui qui compte désormais — OLU n'a pas de mémoire et redit le même texte à
chaque ouverture.

### ForetMap — dégel du registre d'aide : la base ne stocke plus que ce qui a été modifié

**Le bug latent.** Enregistrer les bulles d'aide écrivait en base l'**objet complet** : les 21
infobulles, les 7 panneaux, les astuces, les libellés. À partir de la première sauvegarde, la
ligne gagnait pour *toutes* les clés — y compris celles que personne n'avait touchées. Conséquence
invisible mais lourde : améliorer un texte dans `data/help.default.json` n'atteignait plus jamais
l'écran de cette instance. Le corpus était gelé au jour du premier clic.

- `saveHelpConfigToDb()` ne persiste plus que la **surcharge** — ce qui diffère réellement des
  défauts versionnés. La lecture est inchangée : les normalisations retombaient déjà sur les
  défauts pour toute valeur absente, un objet creux se fusionne donc exactement comme un dense.
- Règle de réduction dans le noyau partagé (`lib/shared/jsonDefaultsStore.js`,
  `diffAgainstDefaults` / `buildStoredOverride`), donc réutilisable pour l'aide GL, qui présente la
  même dette (correctif à venir en commit `feat(gl)` séparé).
- **Vider un texte reste une décision** : une chaîne vide face à un défaut non vide est conservée.
  Les `items` d'un panneau se diffent **position par position**, les positions inchangées devenant
  des trous — c'est la forme qu'attend la fusion positionnelle existante.
- La référence de comparaison est le corpus **normalisé**, pas le fichier brut : la normalisation
  rogne les espaces et matérialise des champs, un fichier brut aurait produit des « écarts »
  fantômes à chaque enregistrement.
- `POST /admin/help-content/reset` stocke désormais une surcharge vide : le corpus suit à nouveau
  intégralement le dépôt.
- **Instance déjà en service** : `node scripts/compact-help-registry.js --apply` réécrit la ligne
  dense en surcharge, à rendu identique (il refuse d'écrire si l'affichage changerait). Dry-run par
  défaut. Documenté dans `docs/EXPLOITATION.md` §9.
- Contrôle de la production avant livraison : registre **identique aux défauts**, aucune
  personnalisation existante — le compactage n'y retire donc rien d'éditorial.

13 tests purs, dont celui qui porte tout le lot : « un défaut amélioré reste visible partout où
rien n'a été réécrit », et son pendant qui documente l'ancien comportement.

### ForetMap — OLU entre en scène : portrait dans les parcours, studio prof pour ses images

Le narrateur de l'aide existait en base et en composants depuis le lot 2, mais rien ne l'affichait
et rien ne permettait de lui donner un visage sans passer par un appel d'API à la main. Les deux
bouts manquants sont livrés.

**Lot 3 — le portrait suit l'étape.**

- Chaque étape de visite guidée porte désormais une **expression** (`parle`, `montre`, `cherche`,
  `vigilant`, `complice`…). Une étape sans expression, ou avec une valeur inconnue, retombe sur
  `neutre` : le portrait n'est jamais une dépendance du parcours.
- `DiscoveryTour` rend le portrait à gauche de la bulle. La carte s'élargit de 320 à 384 px quand
  un portrait est affiché — sinon le texte tombait à ~210 px de large — et **sous 480 px le
  portrait devient un médaillon de 44 px**, texte pleine largeur.
- Aucune ancre CSS de parcours n'a bougé : les étapes existantes ciblent les mêmes sélecteurs.

**Lot 5 — un studio pour les images (Paramètres → Narrateur OLU).**

- Écran dédié, **distinct de « Bulles d'aide »** : les deux réglages ont des réinitialisations
  séparées côté serveur, les mélanger aurait rendu le bouton « Réinitialiser » ambigu.
- **La cascade est montrée, pas expliquée** : chaque expression affiche le rendu effectif — image
  dédiée, reprise de « Neutre », ou silhouette de repli — avec un badge de provenance. Illustrer
  la seule expression « Neutre » suffit ; les sept autres s'appuient dessus.
- **Un seul geste pour illustrer** : « Importer » téléverse dans la médiathèque *et* affecte
  l'emplacement ; « Choisir… » ouvre la médiathèque en galerie pour l'emplacement visé.
- **Aperçu en situation** dans les deux surfaces réelles (visite guidée, panneau d'aide), avec
  sélecteur d'expression et rendu de l'état éteint.
- Cadrage `bust` au premier plan, `face` et `body` repliés — le visage est recadré automatiquement
  depuis le buste tant qu'aucune image dédiée n'est fournie. Avertissement (non bloquant) au-delà
  du budget conseillé de 30 Ko par portrait.
- Enregistrement automatique, réinitialisation du seul narrateur, et **portrait `face` dans
  l'en-tête des panneaux d'aide**. Le nom accessible des dialogues est inchangé : le portrait est
  décoratif (`aria-hidden`), le texte reste le contenu.

**À savoir** : OLU est visible, mais le corpus n'est pas encore réécrit à sa voix (lot 4). Sans
aucune image fournie, tout fonctionne — c'est la silhouette SVG qui tient la place, à coût réseau
nul.
### Mascottes — le choix suit la personne, la carte de travail obéit aux packs

Suite directe du lot précédent, sur ses trois angles morts.

**La mascotte suit la personne, plus l'appareil.** Nouvelle route étroite
**`PUT /api/visit/mascot-preference`** : elle n'écrit que la préférence mascotte, **sans exiger le
mot de passe actuel** (contrairement à l'édition complète du profil, qui reste inchangée). Le
runtime en tire une règle simple — **une seule source par contexte** : compte connecté → le
compte ; visiteur anonyme → l'appareil. Un élève retrouve donc sa mascotte sur un autre poste, et
une tablette de classe ne transmet plus son choix à l'élève suivant.

**Le profil d'interaction d'un pack agit enfin sur la carte de travail.** `useMapViewMascot`
passe par les émetteurs déclaratifs déjà en place côté visite (`emitMascotEvent`) au lieu d'états
d'animation câblés en dur : les paliers de déplacement, l'ouverture d'une zone et celle d'un
repère résolvent l'animation via le pack. Défauts identiques → aucun changement visible pour un
pack sans profil.

**Fusion de registre partagée ForetMap / G&L.** Nouveau `lib/mascotRegistryMerge.js` (groupes
ordonnés → liste dédoublonnée, premier gagnant), consommé par les deux produits. Dans la foulée,
`visitMascotPackCatalog` cesse de refaire sa propre requête sur les packs publiés et
`glUnifiedMascotCatalog` lit le catalogue livré via le registre de visite — **ce qui corrige un
échec en production** : il importait `src/utils/visitMascotCatalog.js` en dur, chemin absent d'un
déploiement « runtime », et `GET /api/gl/mascots` échouait au lieu de servir le catalogue. Côté
front, la forme d'entrée `sprite_cut` vient d'un helper partagé au lieu d'être recopiée des deux
côtés.

Doc : `docs/API.md`, `docs/reference/foretmap/visite-et-mascottes.md` et
`docs/MASCOT_ARCHITECTURE_CONVERGENCE.md` (**étape 9**, avec ce qui reste : panneau de sélection
commun FM/GL, narrateur OLU).

### Mascottes de visite — une seule liste, un seul défaut, un panneau de réglages

Le système de mascottes tenait sa liste d'identifiants en **quatre exemplaires**, qui avaient
divergé : `gnome1` figurait au catalogue mais dans aucune liste blanche, ce qui la rendait
**inatteignable** par l'interface. Les packs publiés au studio, eux, vivaient à côté du système :
jamais soumis à la liste autorisée, jamais éligibles au rôle de mascotte par défaut, et chargés
carte par carte. Et l'admin réglait tout cela en saisissant des identifiants à la main dans deux
champs texte rangés sous « Autres paramètres ».

**Une mascotte est une mascotte, quelle que soit son origine.**

- Nouveau registre serveur `lib/visitMascotRegistry.js` et route publique **`GET /api/visit/mascots`** :
  mascottes livrées avec l'application (`source: "catalog"`) **et** packs publiés
  (`source: "pack"`), dans une seule liste.
- La liste autorisée s'applique désormais **aux deux** : un pack peut être proposé, restreint, ou
  devenir la **mascotte par défaut** — ce qui était jusqu'ici impossible.
- Le serveur ne tient plus aucune liste blanche d'ids : seule la **forme** de l'identifiant est
  validée. `gnome1` redevient sélectionnable ; plus aucune copie de liste à synchroniser.
- Les réglages `ui.visit.mascot.allowed_ids` / `default_id` ont pour défaut la **valeur vide** :
  « aucune restriction » et « mascotte livrée par défaut ». Une mascotte ajoutée plus tard est
  proposée sans intervention. Invariant conservé : la mascotte par défaut est toujours proposée.

**Un défaut global, un choix utilisateur qui tient.**

- Les packs publiés sont servis **toutes cartes confondues** (dédoublonnés par `catalog_id`) : la
  mascotte par défaut et le choix du visiteur valent sur **toutes** les cartes.
- **Le dernier choix gagne** : la préférence de profil ne s'applique plus qu'à son changement.
  Auparavant elle réécrasait le choix fait pendant la visite dès qu'une dépendance bougeait
  (arrivée des packs, rafraîchissement des réglages) — le sélecteur du bandeau semblait marcher
  puis revenait en arrière.
- Le sélecteur « Mascotte préférée » du profil propose enfin les packs publiés, comme le plan.

**Un éditeur, pas deux.** Nouveau panneau **Paramètres → Mascottes de visite** : vignette animée
par mascotte, case « proposée aux visiteurs », bouton « par défaut », signalement des identifiants
orphelins (pack dépublié). Les deux clés correspondantes sont retirées de la grille de réglages en
texte libre.

Doc : `docs/API.md`, `docs/reference/foretmap/visite-et-mascottes.md`, et
`docs/MASCOT_ARCHITECTURE_CONVERGENCE.md` (nouvelle **étape 8 — registre unifié de sélection**,
avec ce qui reste ouvert : persistance du choix dans le compte, `useMapViewMascot`, convergence GL,
narrateur OLU).

### G&L — le carnet de feuillets devient durable, et les feuillets s'échangent

**Le carnet ne dépend plus de l'équipe.** La possession d'un feuillet n'était pas stockée : elle
était *recalculée* comme l'union des états des équipes auxquelles un joueur appartenait. Elle était
donc révocable — sortir un élève d'une partie, le changer d'équipe ou supprimer la partie lui
retirait **rétroactivement** des feuillets qu'il avait lui-même découverts. Invisible jusqu'ici ;
inacceptable dès lors qu'un feuillet peut être acheté.

- Nouvelle table `gl_player_feuillet_states` (migration `175_gl_feuillet_possession_and_trade.sql`),
  écrite à chaque acquisition pour **chaque membre présent de l'équipe**. La migration reprend
  l'existant : aucun carnet ne rétrécit au déploiement. La règle de partage est inchangée — une
  découverte profite toujours à toute l'équipe.
- Le carnet est désormais l'union « ce que mes équipes ont trouvé » + « ce que je possède en
  propre ».

**Échange de feuillets au Marché** (`gameplay.market_feuillets_enabled`, défaut `true`, exige le
module Carnet de Sélène) :

- **Copie, pas transfert** : le donneur garde son feuillet. Thématiquement le copiste recopie ;
  mécaniquement, personne n'est puni d'avoir partagé.
- **Le don puise dans un carnet personnel, la réception écrit dans une équipe** : on peut donner ce
  qu'on a trouvé au chapitre précédent, et ce qu'on donne profite à toute l'équipe du receveur.
  La cible est sa partie `live`/`paused` la plus récente ; sans partie en cours, l'échange est
  refusé avec un message explicite plutôt que de créer un état orphelin.
- **Un feuillet reçu n'est pas un feuillet trouvé** : `unlocked_via = 'echange'` et
  `acquired_via = 'echange'` les distinguent, pour qu'un futur bonus de complétion de chapitre
  récompense l'exploration et non le troc.
- **L'attribution d'origine voyage avec la copie** : le feuillet reçu crédite toujours celui qui l'a
  trouvé, jamais celui qui l'a donné.
- Offre plafonnée à 10 feuillets ; un feuillet absent du carnet est refusé en `409`.
- Front : sélecteur de feuillets dans l'offre, rappel de la règle de la copie, liste des feuillets
  reçus côté camarade. Nouvelle route `GET /api/gl/market/feuillets`.

### G&L — les cœurs ne s'échangent plus sur le Marché (réglable)

Les cœurs et les gemmes partageaient le même Marché. Dès lors qu'un cœur peut être retiré pour un
écart de conduite, le laisser s'échanger permet de **racheter — ou de se faire offrir — la
sanction** : un échange peut même être unilatéral (don pur). Une monnaie s'échange, une sanction
non.

- **Nouveau réglage `gameplay.market_hearts_enabled`, défaut `false`** (migration
  `174_gl_market_hearts_setting.sql`) : seules les **gemmes 💎** circulent sur le Marché. Le
  comportement historique reste accessible d'un clic — Réglages GL → Gameplay → **« Cœurs
  échangeables sur le Marché »**.
- **Double verrou serveur** : une offre en cœurs est refusée en `409` au dépôt **et** à la
  finalisation. Une offre déposée avant une bascule du réglage ne se finalise pas — l'échange est
  refusé, jamais amputé en silence.
- **Front** : le champ « Cœurs ❤️ » disparaît du formulaire d'offre, l'offre du camarade n'affiche
  plus que les gemmes, et le mode d'emploi affiché aux élèves explique que les cœurs
  n'appartiennent qu'à eux. Aucun montant en cœurs n'est envoyé au serveur, même si un ancien
  brouillon d'offre en contenait.
- Documentation à jour : `docs/API.md`, `docs/reference/gl/economie-marche-sorts.md`,
  `docs/reference/gl/presentation.md` (le schéma des flux disait « les points circulent »).

### Documentation — analyse du rapport de refonte de l'équilibrage G&L

Nouveau document d'analyse `docs/GL_EQUILIBRAGE_ANALYSE_RAPPORT.md` : relecture critique du
« Rapport de passation : refonte de l'équilibrage » de Gnomes & Licornes, **recertifiée sur le
code** plutôt que sur le dump SQL daté qui servait de base au rapport. Aucun comportement métier
modifié — le document analyse et propose.

- **Recertification** des 12 constats techniques du rapport (câblage réel, `fichier:ligne`).
  Constat principal : **aucun crédit de gemme n'est câblé sur le chemin QCM** — le robinet
  effectif de l'économie est le geste du MJ, ce qui déplace le diagnostic d'équilibrage.
- **Trois briques jugées « à construire » existent déjà** : états de chasse aux feuillets
  (`gl_game_feuillet_states`), pot commun de sortilèges (support de la Consécration), application
  d'un delta à toute une équipe (support du pont « Team Spirit → gemmes »).
- **Cinq points d'attention non couverts par le rapport**, dont deux bloquants avant de faire
  porter la conduite aux cœurs : les soldes de tous les joueurs sont visibles de la classe via le
  Marché, et un cœur perdu peut y être racheté à un camarade.
- **Ordre des opérations révisé** isolant ce qui ne dépend d'aucune décision d'architecture, et
  réponses proposées aux 13 questions ouvertes du rapport.
### Doc — Audit : le remède aux conflits de PR existe déjà, mais ignore les brouillons

Complément au §2.3/§2.4 de [`docs/AUDIT_APP_ET_JEU_2026-08.md`](docs/AUDIT_APP_ET_JEU_2026-08.md),
qui sous-estimait l'outillage existant. **Document d'audit uniquement — aucun comportement
modifié.**

- Le dépôt dispose de `auto-resolve-conflicts.yml` (+ `scripts/auto-resolve-conflicts.js`) :
  à chaque push sur `main` et **toutes les heures**, il réintègre `main` dans les PR
  ouvertes et résout sans risque les conflits récurrents (`CHANGELOG.md` par union, bumps
  `package.json` / `package-lock.json`). Il fonctionne — vérifié en conditions réelles sur
  la PR de l'audit elle-même, dès son passage en « prêt à relire ».
- **Mais il ignore les brouillons** : `AUTO_RESOLVE_INCLUDE_DRAFTS` ne vaut `'1'` que sur
  `workflow_dispatch` manuel ; les exécutions horaires et sur push passent `'0'`, et le
  script coupe court (`scripts/auto-resolve-conflicts.js:370`). Or **les 26 PR de la file
  sont toutes en brouillon** : l'automatisation ne s'exécute donc sur aucune d'elles.
- **Second effet, découvert sur la même PR** : quand le workflow agit, il pousse sa
  résolution avec le `GITHUB_TOKEN` par défaut, **qui ne re-déclenche aucun workflow** (le
  fichier le documente ; `AUTO_MERGE_PAT` n'est pas configuré). Le head résolu se retrouve
  donc avec **zéro check** et un `mergeable_state` bloqué à `unstable`, sans reprise
  spontanée — il a fallu un commit vide pour relancer la CI.
- Conséquence pratique : le correctif reste un simple réglage de workflow, mais il en faut
  **deux, indissociables** — `include_drafts` sur la planification horaire **et** le secret
  `AUTO_MERGE_PAT`. Le premier sans le second donnerait 26 PR résolues mais non vérifiées,
  état plus trompeur que le conflit. C'est le premier geste du lot 0.

### Données — le jeu SQL versionné se limite au contenu pédagogique

Le dépôt ne versionne plus d'export SQL complet : seules les tables de **contenu** biodiversité et
glossaire le sont désormais, conformément à la règle du projet (`CLAUDE.md`).

- **`sql/biodiv_pedago_seed.sql`** (176 Ko) remplace l'ancien export : 11 tables de contenu
  (`plants`, `plant_name_aliases`, `zone_species`, `marker_species`, `task_species`,
  `species_interactions`, `glossary_terms`, `glossary_term_*`), aucune colonne nominative.
  **`npm run db:import:biodiv` fonctionne sans changement de contrat** — comptages de lignes
  vérifiés identiques pour les 11 tables, zéro perte de contenu.
- **Extraction reproductible** : `npm run db:seed:biodiv:extract -- <export.sql>`
  (`scripts/extract-biodiv-pedago-seed.js`), depuis un export local non versionné. Le script
  **refuse d'écrire** si sa sortie contient une adresse email ou un hachage bcrypt — un échec
  bruyant plutôt qu'une fuite silencieuse. Garde-fou testé.
- **`.gitignore`** bloque désormais `*_bdd_complete.sql`, `*_dump.sql`, `*-dump.sql`,
  `sql/dumps/`, et la règle est rappelée avec un pointeur vers le seed dans `CLAUDE.md`,
  `.cursor/rules/foretmap-conventions.mdc` et les deux skills `foretmap-database`.
- **Runbook d'exploitation** ajouté (`docs/EXPLOITATION.md` § 10) pour la marche à suivre lorsqu'un
  fichier sensible a été versionné : mesure de portée, réécriture d'historique sur clone miroir, et
  les suites obligatoires (support GitHub, rotation des secrets, rebase des branches, re-clonage).

### G&L — `/api/gl/context-comments` : API sans interface, documentée comme telle

La route est montée et testée mais **aucune UI G&L ne l'appelle** ; le composant
`GLContextComments`, écrit en juillet 2026, n'a jamais été monté. Choix retenu : **garder la
route**, corriger la documentation. C'est le chemin canonique décidé en architecture (les types
`gl_*` ont été retirés de l'API ForetMap pour éviter deux chemins JWT), il est testé et partage
`contextCommentsCore` avec le côté ForetMap bien vivant ; démonter une API montée serait un
changement de comportement, et il faudrait la réécrire le jour où l'écran arrive.

- `docs/GL_ARCHITECTURE.md` et `docs/PARTAGE_FM_GL.md` disent maintenant explicitement que le
  backend est prêt mais sans consommateur, et où retrouver le composant dans l'historique.
- Correction d'une affirmation fausse : `gl-theme.css` était présenté comme portant des styles de
  commentaires contextuels « pour rester homogène avec le shell GL ». Les sélecteurs
  `.gl-context-comments` n'étaient rendus que par le composant jamais monté : ils sont retirés.

### Ménage — code mort et documentation obsolète

Audit de code sans changement de comportement : tout ce qui est retiré a été vérifié par
deux méthodes indépendantes (analyse du graphe de références + `git grep -w` sur l'arbre
complet hors `dist/`), puis re-scanné après suppression pour attraper les cascades.

- **7 composants/utilitaires GL orphelins supprimés** — aucun import nulle part, créés
  fin juin/début juillet et jamais recâblés depuis : `GLChapterMapEditor` et
  `GLKingdomZoneEditor` (remplacés par `GLChapterMapStudio`, qui consomme directement
  `useGLKingdomZoneEditor`), `GLFeuilletZoneEditor` (déjà marqué `@deprecated` au profit
  de `GLPlateauMapEditor`), `GLMarkdownImageInsert` (l'insertion passe par
  `GLImageInlineInsertControls`), `GLContextComments`, `GLChapterCharteImportPanel`,
  `glBoardPointToPct`. En cascade : `src/shared/markdown/insertImage.js` (plus aucun
  appelant) et `pickZoneAtPctGeneric`.
- **22 symboles exportés morts retirés** (déclarés, exportés, jamais appelés — ni en
  interne ni ailleurs) dans `lib/` et `src/` : `ensureCanonicalUserFromStudent`/
  `…FromTeacher` et leur chaîne privée `upsertCanonicalUser`/`buildDisplayName`,
  `loadZoneSpeciesList`/`loadMarkerSpeciesList`/`loadTaskSpeciesList`,
  `getPlayerVitalitySnapshot`, `listCorrectQcmCodesForTeam`, `resolveQcmSetFromCode`,
  `buildJournalEmbedHtml`, `setPublicImageCacheHeaders`, `fetchPlantDiscoveredIds`
  (déjà `@deprecated`), `ZONE_FILL`, `PLANT_SELECT_OPTIONS`, etc. Les symboles seulement
  **sur-exportés** (utilisés en interne dans leur propre module) ont été laissés en place :
  ce n'est pas du code mort.
- **`scripts/verify-gating-snapshot-import.js` supprimé** : script de vérification ponctuel
  d'un import de snapshot, référencé nulle part (ni `package.json`, ni doc). Les autres
  scripts hors `package.json` sont documentés dans `docs/EXPLOITATION.md` et sont conservés.
- **8,8 Mo d'assets d'intro G&L en double supprimés** : les fichiers UUID bruts laissés par
  `gl-intro-debundle.js` (`2d653905….mp3`, `bde208ef….mp3`, `a10b070c….bin`) — les deux mp3
  sont octet pour octet identiques à `assets/audio/final.mp3` et `assets/audio/loop.mp3`, qui
  sont les seuls référencés par `public/gl/intro/index.html`.
- **Documentation obsolète corrigée** : `lib/helpers.js` (supprimé depuis l'audit de juillet)
  était encore cité comme fichier courant dans `CLAUDE.md`, deux skills Claude, deux skills
  Cursor et une règle Cursor — les helpers concernés vivent dans `lib/tasks/taskQueries.js` ;
  `README.md` décrivait encore le mode prof « protégé par PIN » et documentait `TEACHER_PIN`,
  lu nulle part ; `public/index.html` (inexistant) au lieu de `public/deploy-help.html` ;
  `sql/migrations/…` au lieu de `migrations/…` ; `npm run test:load:normal` (inexistant).
- **Variables d'environnement fantômes retirées** de `.env.example`/`README.md` :
  `RBAC_DEFAULT_STUDENT_ROLE` et `GL_VISIT_COOKIE_SECRET` n'étaient lues par aucun code —
  les documenter laissait croire qu'on pouvait les régler. `DOTENV_CONFIG_QUIET` est
  conservée : elle est consommée par dotenv lui-même.

### G&L — sortilèges réservés à un peuple (gnomes / licornes)

Nouveau réglage **par sortilège** et **modifiable par lot** : qui a le droit de lancer ce
sort. Le peuple d'un lanceur est celui de **son équipe** (`gl_teams.type`), on réutilise
donc son vocabulaire plutôt que d'en inventer un parallèle.

- **Migration `173`** : colonne `gl_spells.caster_kind` (`any` \| `gnome` \| `unicorn`,
  défaut `any` — le comportement historique est strictement conservé sur l'existant).
- **Règle appliquée en trois points** (`lib/glSpellCast.js`), pas seulement à l'ouverture :
  refus **403** à la création du brouillon pour une équipe du mauvais peuple, au moment
  d'enregistrer une contribution **non nulle**, puis **de nouveau juste avant le débit**
  (au lancement comme à l'acceptation MJ d'un sort en attente). Un sort restreint après
  coup, sur un pot déjà réuni, ne part donc pas et ne coûte rien. Une contribution à zéro
  reste un no-op légitime : le front envoie une ligne par joueur du roster.
- **Peuple indéterminé refusé** : faute de pouvoir vérifier, on bloque plutôt que de
  laisser passer. Le roster expose désormais `teamType` (`lib/glRoster.js`).
- **Édition en masse** : `POST /api/gl/admin/spells/bulk` (`{ codes | categorySlug, patch }`,
  liste blanche `lib/glSpellBulkPatch.js`, max 500 sorts), et dans l'éditeur de sorts une
  case à cocher par ligne + « Tout sélectionner » + bandeau d'application — même contrat
  et même ergonomie que l'édition en masse des feuillets. Une valeur inconnue est une
  **erreur** et non un retour au défaut : un lot touche trop de fiches pour se permettre
  un silence.
- **UI joueur** : pastille « 🧙 Gnomes uniquement » / « 🦄 Licornes uniquement » sur la
  fiche et les tuiles du catalogue, équipes du mauvais peuple retirées du sélecteur de
  l'assistant, contributeurs non éligibles affichés mais verrouillés avec la raison.

### G&L — `approval_mode` et `cast_scope` enfin administrables

Correctif d'un manque relevé à l'audit : la migration `139` avait ajouté ces deux colonnes
et le moteur de lancement les lisait, mais **aucun chemin d'écriture ne les exposait** —
ni la fiche admin, ni le CRUD, ni l'import/export. Elles n'étaient réglables qu'en SQL
direct, ce qui rendait inopérants le mode d'approbation `per_spell` (pourtant le défaut)
et toute portée solo/collective.

- Les deux colonnes rejoignent `SPELL_LIST_COLUMNS`, le CRUD admin, le formulaire de
  fiche (listes déroulantes) et le tableur (colonnes `validation_mj`, `portee_lancement`).
- **Import non destructif pour les trois options** : une colonne **absente** de la feuille
  laisse la valeur en base inchangée (`COALESCE` à l'upsert) au lieu de la remettre au
  défaut. Ré-importer un ancien fichier ne lève plus silencieusement une restriction. Une
  valeur *présente mais illisible* est signalée ligne par ligne.
- `spellToForm` retombe sur les valeurs du formulaire vierge plutôt que sur la chaîne
  vide : une liste déroulante ne se retrouve plus sur une option inexistante.
### Doc — Audit général de l'application et du jeu (août 2026)

Nouveau document [`docs/AUDIT_APP_ET_JEU_2026-08.md`](docs/AUDIT_APP_ET_JEU_2026-08.md) :
audit transversal ForetMap + Gnomes & Licornes, centré sur **ce que le joueur perçoit**.
**Document d'audit uniquement — aucun comportement modifié.**

- **Le constat qui domine tous les autres est un constat de process** : **26 PR ouvertes**,
  à raison d'environ **une par jour depuis le 20 juillet**, presque toutes des `fix(...)`
  (dont ~8 de sécurité / anti-triche), **toutes en brouillon et jamais fusionnées** — alors
  que la file « fonctionnalités » (OLU, partage FM/GL) est fusionnée normalement. Les deux
  défauts QCM les plus sérieux relevés par cet audit sont **présents sur `main`** et
  **déjà corrigés**, avec tests et documentation, dans les PR **#277** et **#275** (diffs
  relus ligne à ligne). Le goulot n'est pas le diagnostic, c'est la fusion — et l'attente
  aggrave mécaniquement les conflits (chaque PR bumpe `package.json` et la tête du
  `CHANGELOG`, depuis des bases v1.85–1.87 alors que `main` est à 1.88).
- **Charge — le principal constat technique restant** (aucune PR ouverte ne le traite) :
  chaque `gl:game:event` déclenche un
  `GET /api/gl/games/:id` complet **chez tous les clients** ; cette réponse relit et renvoie
  **l'intégralité** de `gl_game_events` (sans `LIMIT`) **deux fois** — `events` et
  `replay.timeline`. Or `replay` n'a **aucun consommateur** dans `src/` (seuls deux tests le
  référencent) et `events` n'est lu que pour son **dernier élément**, lequel vient d'arriver
  par le socket. Le coût d'une séance croît donc quadratiquement avec sa durée, sous un
  plafond de 1200 req/min partagé par toute l'IP de l'établissement. Le scénario de charge
  GL n'appelle jamais cet endpoint.
- **QCM** : le jeton de présentation embarque `correctChoiceId` dans sa charge utile JWT
  (base64, lisible côté navigateur) et n'est pas à usage unique — la bonne réponse est
  lisible avant de répondre, et le score d'équipe est rejouable pendant 15 minutes. Point
  **non couvert** par les PR en attente : une équipe de 5 marque +5 sur la même question,
  chaque joueur obtenant sa propre présentation.
- **Les deux régimes de jeu ne sont visibles que pour un seul** : GL se joue en séance
  (plateau animé par le MJ) **et hors séance** (feuillets, marquage « appris », carnet,
  entraînement). Recherche exhaustive sur `src/`, `lib/`, `data/` et `docs/reference/` :
  **zéro occurrence** de « hors séance » ou équivalent. L'onglet d'arrivée est toujours
  Cartes ; le statut de la partie (`draft`/`live`/`paused`/`ended`) n'est lu côté front que
  par la console MJ ; hors séance, les clics du joueur sur le plateau n'ont aucun effet et
  aucun message ne l'explique. L'aide contextuelle (26 entrées) se termine partout par une
  consigne d'administration affichée à l'élève. Techniquement le hors séance fonctionne,
  mais l'acquisition de feuillets est dure-gatée sur `gameId` avec un `return null`
  silencieux (`routes/gl/learning.js:132-133`) : un élève jamais affecté à une équipe peut
  marquer « appris » sans jamais gagner un feuillet, sans le savoir.
- **Premier écran d'un nouveau joueur** : sans équipe attribuée — l'état de départ normal —
  l'onglet Cartes affiche `/maps/map-foret.svg`, la carte de **ForetMap**, sans mascotte,
  sans repère et sans message. Les fallbacks `Suspense` (`gl-tab-loading`) n'ont par ailleurs
  **aucun style** : les chargements d'onglet sont des pages blanches.
- **Pourquoi ces deux points n'ont jamais été attrapés** : la fixture e2e code en dur
  `status = 'live'` et affecte aussitôt le joueur à une équipe
  (`e2e/fixtures/gl.fixture.js:22-23`). Les 41 scénarios jouent donc tous en séance, dans
  une partie active, avec une équipe — le trou de couverture épouse le trou de conception.
- **Points robustes confirmés** : ré-hydratation des droits en base à chaque requête,
  isolement produit appliqué jusqu'au socket, assainissement Markdown par liste blanche,
  règlement d'échange du Marché transactionnel et verrouillé, migrations idempotentes,
  documentation de référence honnête, accessibilité de la navigation.
- **Plan d'action en 6 lots**, classés par rendement, avec la liste explicite de ce que
  l'audit **n'a pas** couvert (aucune exécution : ni base, ni dépendances installées).
### OLU narrateur — lot 2 : le portrait et son réglage

Deuxième lot du plan [`docs/MASCOT_NARRATEUR_OLU.md`](docs/MASCOT_NARRATEUR_OLU.md). Comme le
lot 1, il ne demande **aucun visuel** : il pose le réceptacle et la cascade d'affichage, de sorte
que les portraits n'aient plus qu'à être déposés quand ils existeront.

- **Réglage `content.help.narrator`** (`lib/helpNarrator.js`) : interrupteur global, nom du
  locuteur, silhouette de repli et portraits par expression. Trois routes d'administration
  (`GET`/`PUT /api/settings/admin/help-narrator`, `POST …/reset`) avec audit dédié, et exposition
  dans `GET /api/settings/public`.
- **Réglage distinct du corpus d'aide**, et non une extension de `/admin/help-content` comme le
  prévoyait le plan. La raison est concrète : réinitialiser le corpus — une opération que le plan
  envisage sérieusement en production — ne doit pas emporter les portraits au passage. Un test
  vérifie précisément cette indépendance.
- **URL de portrait restreintes** aux chemins absolus du site et aux URL `http(s)`. `data:`,
  `javascript:`, protocole-relatif et chemin relatif sont écartés à l'enregistrement plutôt que
  corrigés silencieusement — ces valeurs finissent dans un `src` d'image.
- **`MascotSpeaker`** (`src/shared/components/`) : rend le portrait, et rien d'autre. Cascade
  cadrage demandé → `bust` de la même expression (recadrage CSS) → `neutre` → SVG de repli : il
  n'existe aucun état où l'emplacement reste vide, et un déploiement sans le moindre portrait est
  un fonctionnement normal, pas une panne. `aria-hidden` systématique — le portrait ne porte
  jamais d'information.
- **Garde-fou d'architecture** : un test casse si `MascotSpeaker` en vient à importer un renderer
  de mascotte animée (100–170 Ko en chunks lazy). C'est la règle de performance du plan, écrite
  en test plutôt qu'en commentaire.
- **`mascotExpressions.js`** : les 8 expressions et leur projection sur les états canoniques
  existants de `VISIT_MASCOT_STATE` — aucun énuméré concurrent n'est introduit.
- **Visite guidée** : le nom du locuteur s'affiche désormais au-dessus des bulles, alimenté par
  le réglage. Il reste vide si le narrateur est éteint ou sans nom.

### OLU narrateur — lot 1 : la bulle de dialogue

Premier lot du plan [`docs/MASCOT_NARRATEUR_OLU.md`](docs/MASCOT_NARRATEUR_OLU.md) : la **mise en
scène du texte**, qui porte l'essentiel de l'effet ludique et ne demande aucun visuel.

- **Nouveau composant partagé `SpeechBubble`** (`src/shared/components/SpeechBubble.jsx`, styles
  `src/shared/styles/speech-bubble.css`) : cadre, étiquette de locuteur optionnelle et effet
  machine à écrire. Écrit d'emblée dans `src/shared/` pour que GL le consomme au lot 6 sans
  dédoublement. Les couleurs passent par des variables `--fm-bubble-*` surchargeables par produit.
- **Visite guidée** : le texte de chaque étape s'écrit progressivement. Un clic sur la bulle — ou
  une première pression sur `Entrée` / `→` — l'affiche intégralement ; la pression suivante passe
  à l'étape. Les boutons et `Échap` restent inconditionnels, on ne peut jamais se retrouver
  bloqué à attendre la fin d'un texte.
- **Accessibilité** : sous `prefers-reduced-motion: reduce`, l'affichage est immédiat. Le texte
  **complet** est dans le DOM dès le premier rendu — la portion non encore écrite est masquée par
  `opacity: 0` et reste donc dans l'arbre d'accessibilité. La bulle n'est délibérément pas une
  région `aria-live` : un lecteur d'écran la relirait à chaque caractère. Corollaire utile, la
  hauteur de la carte ne bouge pas pendant la frappe.
- **Le nom du locuteur n'est pas encore affiché** dans la visite guidée : le composant sait le
  rendre, mais coiffer d'un « OLU » un corpus encore rédigé à la troisième personne lui
  attribuerait une voix qui n'est pas la sienne. Le câblage vient au lot 2, depuis le réglage
  `content.help.narrator`.
- **Brief de production graphique** : [`docs/MASCOT_OLU_BRIEF_VISUEL.md`](docs/MASCOT_OLU_BRIEF_VISUEL.md)
  — spécifications des portraits, prompts de génération à partir de la planche d'expressions,
  post-traitement et recette.

### Axe A — l'outillage d'administration de GL arrive dans ForetMap

Mise en œuvre de l'axe A du plan [`docs/PARTAGE_FM_GL.md`](docs/PARTAGE_FM_GL.md) : combler
l'asymétrie d'outillage entre les deux produits, plutôt que de chasser la duplication.

- **Panneau d'édition de questions** (QCM biomes GL, QCM lore GL, Quiz ForetMap) : le CRUD
  réécrit à la main cède la place au hook partagé `useAdminCrud` (~70 lignes en moins). Le hook
  gagne trois capacités générales — réconciliation `mergeServerForm` (préserve les frappes
  saisies pendant une requête en vol), `persist()` exposé pour les soumissions manuelles, et une
  clé de réinitialisation d'autosave découplée de l'identifiant. Ce dernier point corrige un
  défaut réel : dériver la clé de l'identifiant la faisait muter à la création, ce qui supprimait
  l'enregistrement de suivi et perdait silencieusement une frappe en vol.
- **Enregistrement automatique** sur la fiche biodiversité, l'édition de tâche et l'éditeur de
  tutoriel — **en édition seule**. Deux de ces panneaux publient immédiatement vers les élèves
  (une tâche est visible et assignée dès l'enregistrement ; un tutoriel a `is_active` à 1 sans
  état brouillon) : l'autosave n'agit donc que sur un enregistrement déjà créé. Rien n'est plus
  publié à moitié construit, et les assignations initiales — propres à la création — ne peuvent
  pas être déclenchées automatiquement. Le bouton d'enregistrement explicite subsiste partout.
- **Doc de référence consultable dans l'application** (onglet Paramètres administrateur → « Doc
  de référence ») : les 8 documents fonctionnels de `docs/reference/foretmap/` sont lisibles sans
  passer par le dépôt. **Lecture seule** — contrairement à GL, les fichiers versionnés font foi.
  Nouvelles routes `GET /api/admin/reference-docs[/:slug]` (`admin.settings.read`).
- **Noyau partagé `lib/shared/referenceDocsFiles.js`** : la couche fichiers de la doc de
  référence (validation de slug, extraction titre/résumé, listage trié) était générique — elle est
  désormais commune aux deux produits, `lib/glReferenceDocs.js` la consommant à son tour. La
  surcouche d'édition en base reste propre à GL.

### Partage ForetMap/GL — audit outillé, plan en trois axes et deux noyaux mutualisés

Nouveau document [`docs/PARTAGE_FM_GL.md`](docs/PARTAGE_FM_GL.md) : audit **mesuré** de la
duplication entre les deux produits du monorepo et plan d'enrichissement mutuel. Constat
central : la logique métier est déjà largement factorisée (23 noyaux `lib/shared/`, 61 fichiers
`src/shared/`, convergence mascotte achevée) ; ce qui se répète est la **plomberie**, et le vrai
gisement est l'**asymétrie** — GL disposait d'outils d'administration absents de ForetMap.

- **Audit reproductible** : nouveau script `scripts/audit-duplication-fm-gl.mjs` (comparaison des
  lignes substantielles, front et back). Documente aussi un **faux positif instructif** : la paire
  la plus similaire de tout le dépôt (0,87) ne recouvre aucune dette — ce sont des listes de
  champs, et les deux fichiers sont déjà des adaptateurs d'un noyau partagé.
- **`src/shared/hooks/useAdminCrud.js`** — le squelette CRUD des panneaux admin (liste, fiche,
  « next-code », autosave débouncé, états loading/error/info), jusqu'ici réservé à GL, est promu
  en hook partagé avec **transport HTTP injecté**. `useGlAdminCrud` devient un adaptateur mince
  liant `apiGL` ; ForetMap peut désormais consommer le même hook avec `api`. Aucun changement de
  comportement pour les panneaux GL existants (espèces, sorts, glossaire).
- **`lib/shared/jsonDefaultsStore.js`** — le mécanisme « défauts JSON versionnés + surcharge en
  base » était écrit deux fois (`lib/helpContent.js`, `lib/glHelp.js`). Extraction de
  `createDefaultsLoader` (lecture cachée + clone défensif) et `resolveStoredConfig` (repli sur les
  défauts si la valeur stockée est absente ou illisible). L'écriture (upsert) reste par produit :
  les tables et colonnes d'audit diffèrent.
- Tests ajoutés : `tests-ui/shared/useAdminCrud.test.jsx` (8 cas) et
  `tests/json-defaults-store.test.js` (9 cas).
- Le plan détaille désormais chaque lot des axes A et B (objectif, périmètre, démarche,
  critères d'acceptation, piège spécifique).

### Corrigé — File de progression « vu » : une entrée sans horodatage ne se vidait jamais

`compactVisitSeenQueue` attribuait `updated_at = Date.now()` aux entrées de la file locale
dépourvues d'horodatage valide. Comme `loadVisitSeenQueue()` normalise à chaque lecture et que
`flushVisitSeenQueue()` lit la file **deux fois** (avant les POST, puis après, pour détecter une
modification concurrente), une telle entrée recevait deux horodatages différents dès que le flush
franchissait une milliseconde. Elle était alors jugée « modifiée pendant le flush » et **remise en
file indéfiniment** : action re-POSTée à chaque synchronisation et compteur « en attente » bloqué
à une valeur non nulle.

- **Correctif** : repli sur la valeur **stable** `0` au lieu de l'heure courante. Ces entrées
  trient en tête (origine inconnue = traitées comme les plus anciennes) et se persistent à
  l'identique, rendant les lectures successives idempotentes. Les entrées créées par
  `enqueueVisitSeenAction` / `replaceQueuedVisitSeenAction` portent toujours leur propre
  horodatage : elles ne sont pas concernées. La garde « une entrée re-modifiée pendant le flush
  reste en file » est préservée.
- **Origine** : ce défaut se manifestait comme un test intermittent (`useVisitSeenSync`), échec
  récurrent de la CI **sur `main`** et jusque-là attribué à la contention CPU des runners.
  Remplacer l'attente sur l'horloge (`waitFor`) par un drainage de micro-tâches — le flush ne
  comporte aucun timer — a rendu l'échec reproductible en isolation et révélé la vraie cause.
- Tests : `tests-ui/utils/visitSeenQueueStability.test.js` (9 cas, dont la reproduction explicite
  du franchissement de milliseconde).

### Doc — Plan d'implantation « OLU narrateur » (avatar des bulles d'aide et du récit)

Nouveau document [`docs/MASCOT_NARRATEUR_OLU.md`](docs/MASCOT_NARRATEUR_OLU.md) : plan
d'implantation d'un avatar narrateur, **OLU**, portant à la première personne l'aide
contextuelle et les passages narratifs de ForetMap et de Gnomes & Licornes. **Document de
conception uniquement — aucun comportement modifié.**

- **Charte rédactionnelle** : personnalité « copiste cool » (bienveillante, lucide, sage,
  humoristique), règle des trois temps pour porter les messages lourds de sens, exemples de
  conversion tirés du corpus réel, liste de ce qu'OLU ne dit jamais.
- **Architecture en trois niveaux de rendu** (mascotte animée / portrait / fallback SVG) pour
  éviter de charger les renderers lourds de la carte dans une bulle d'aide ; composant
  `MascotSpeaker` partagé ForetMap/GL, expressions mappées sur les états canoniques existants.
- **Arbitrage d'architecture signalé** : `visit_mascot_packs` est par carte et ne convient pas
  à un narrateur global — un réglage `content.help.narrator` est recommandé à la place.
- **Constat** : l'entrée catalogue `olu-spritesheet` existe depuis longtemps mais son asset
  n'a jamais été versionné ; OLU retombe donc systématiquement sur le fallback SVG.
- Découpage en 7 lots (les 4 premiers livrables sans aucun sprite), arbitrages restants,
  anti-patterns, obligations d'accessibilité et de tests.
- **Faut-il refactoriser avant ? (§15)** — audit mesuré du partage ForetMap/GL : inventaire de
  `lib/shared/` (22 noyaux) et `src/shared/` (59 fichiers), lignes substantielles communes entre
  routes homonymes, distinction entre vrais doublons et faux jumeaux (forum, glossaire).
  Conclusion : la logique métier est déjà factorisée, seule la plomberie se répète ; le vrai
  gisement est l'**asymétrie** (GL dispose d'outils que ForetMap n'a pas) plutôt que la
  duplication. Aucun lot de refactor préalable recommandé.

### GL — Contenus → Doc de référence : lire et amender la doc fonctionnelle depuis le jeu

Les documents de référence non techniques de Gnomes & Licornes (`docs/reference/gl/*.md` :
présentation, lore, rôles, chapitres, carte du royaume, économie, QCM, guide du MJ) sont
désormais **consultables et modifiables** depuis l'onglet **Contenus** (nouveau sous-onglet
**Doc de référence**, droit `gl.content.manage`). Ils décrivent les composantes du jeu en
français simple pour les professeurs, MJ et administrateurs — et ce qui y est écrit vaut
demande d'évolution (repère `🔧 À implémenter :`).

- **Stockage à deux étages, non destructif** : le fichier Markdown versionné dans Git reste la
  base ; une modification faite dans l'application est stockée en surcouche (nouvelle table
  `gl_reference_docs`, migration `172`) et survit donc aux déploiements, qui réécrivent les
  fichiers du dépôt. Le serveur ne réécrit jamais les fichiers.
- **Réversible et exportable** : « Réinitialiser depuis le dépôt » supprime la surcouche ;
  « Télécharger le .md » permet de reverser une modification dans Git. La liste signale d'un
  point les documents modifiés depuis l'application.
- **Édition en Markdown brut** (pas l'éditeur visuel) : ces textes partent dans Git, tableaux,
  ancres et repères `🔧 À implémenter :` doivent être préservés à l'identique.
- API : `GET/PUT /api/gl/admin/reference-docs[/:slug]` et `POST …/:slug/reset`. Le `slug` est
  restreint à `^[a-z0-9]+(-[a-z0-9]+)*$` — aucune traversée de chemin possible ; la création de
  document par l'API est refusée (404 hors des documents existants). Voir `docs/API.md`.
### GL — popover d'aperçu et d'édition des feuillets depuis la vue d'ensemble

- **Contenus → Carnet de Sélène → Vue d'ensemble** : chaque ligne dispose désormais d'un bouton
  **« Aperçu »** qui ouvre un popover montrant le **contenu du feuillet tel que le joueur le
  verra** (illustration, titre, incipit, corps, ancrage scientifique) accompagné de ses
  caractéristiques résumées et de ses chapitres rattachés. Un onglet **« Édition »** donne accès
  au formulaire complet (tous les champs, associations, zone du royaume, ordre de liasse) :
  enregistrement, archivage/réactivation et rechargement de la vue se font sans changer d'onglet.
  La vue d'ensemble n'est donc plus en lecture seule.
- **Mutualisation** : le popover est le composant partagé `GLFeuilletEditorDialog`, également
  utilisé par l'onglet « Feuillets » (qui l'ouvre directement en mode édition) ; le rendu des
  champs est extrait dans `GLFeuilletFormFields`. Aucun changement d'API : les endpoints
  `GET/PUT/PATCH /api/gl/lore/admin/feuillets/:code` sont inchangés.
- Tests : `tests-ui/gl/GLFeuilletEditorDialog.test.jsx` (aperçu, bascule vers l'édition, PUT,
  feuillet introuvable) et un scénario d'ouverture du popover dans
  `tests-ui/gl/GLLoreFeuilletsOverviewPanel.test.jsx`.

### Audit bugs juillet 2026 : confidentialité des photos d'élèves et intégrité des inscriptions

Nouveau document [docs/AUDIT_BUGS_2026-07.md](docs/AUDIT_BUGS_2026-07.md) (audit transversal
« bugs de tous types » : sécurité, contrôle d'accès, concurrence, logique métier, cohérence
front/back) **et correction de 4 des 6 constats** dans le même lot.

**Sécurité — photos d'élèves (B2, B3)**

- Les photos de **carnet d'observation** (`uploads/observations/`) et de **journal de tâche**
  (`uploads/task-logs/`) étaient servies **en clair** par le montage statique `/uploads`, ce
  qui contournait entièrement l'autorisation de `GET /api/observations/:id/image`. Les noms de
  fichiers étant prédictibles (`<studentId>_<logId>.jpg`), ces photos étaient énumérables sans
  aucun jeton. Ces deux familles sont désormais refusées en **403** par `/uploads`
  (`lib/uploadsPrivatePaths.js`) ; leur lecture passe obligatoirement par la route API, qui
  contrôle les droits. Les familles publiques (`zones/`, `markers/`, `tasks/`, `forum-posts/`,
  `context-comments/`, `students/`, `media-library/`…) sont inchangées.
- `GET /api/tasks/:id/logs/:logId/image` n'avait **aucun contrôle d'accès**, alors que la route
  liste voisine était gardée au motif « journaux = PII ». Elle exige désormais la même chose
  qu'elle : compte connecté, profil non visiteur.

**Intégrité — inscription aux tâches (B4)**

- Une même tâche pouvait enregistrer **deux inscriptions du même élève** (double-clic, lot) ou
  **dépasser `required_students`** : le contrôle était fait avant l'insertion, sans transaction
  ni contrainte. Ajout d'un index unique `(task_id, student_id)`
  (migration `170`, avec dédoublonnage préalable) et sérialisation du contrôle de capacité.
  Les inscriptions héritées (`student_id` absent) ne sont pas contraintes.

**Ergonomie (B5)**

- En mode collectif, le raccourci n3boss « marquer la part d'un élève » était proposé pour les
  inscriptions **héritées sans compte rattaché**, alors que l'API rejette systématiquement ce
  cas en 400. Le bouton n'est plus affiché pour ces inscriptions (le nom reste visible).

**Sécurité — révocation des droits Gnomes & Licornes (B6)**

- Les permissions GL étaient lues **telles quelles dans le JWT** : retirer son rôle à un MJ,
  rétrograder un Admin ou désactiver un joueur restait sans effet **jusqu'à l'expiration du
  jeton** (90 min par défaut, jusqu'à 7 jours), là où ForetMap révoque immédiatement.
- GL relit désormais ses droits **à chaque requête**, comme ForetMap : l'identité est vérifiée
  dans `gl_players` / `gl_admins` (compte supprimé ou désactivé → `401`) et les permissions
  viennent du **catalogue RBAC partagé** (`lib/rbac.js`), au lieu d'une liste codée en dur
  côté GL qu'il fallait tenir alignée à la main. Une panne BDD renvoie `503`, jamais `401`.
- Composants mutualisés : `buildAuthzPayloadFromRole` / `buildAuthzPayloadForRoleSlug`
  (`lib/rbac.js`, source unique des permissions pour les deux produits) et
  `lib/auth/glHydration.js`, pendant GL de `hydrateAuthFromTokenClaims`. Le pipeline JWT
  (`lib/auth/jwtPipeline.js`) était déjà partagé.
- Le tableau `permissions` du jeton devient purement informatif ; un test verrouille son
  alignement avec le catalogue.

**Reste à traiter** : B1 (usurpation d'identité n3beur) est traité par une PR dédiée. Le document
liste aussi **13 pistes vérifiées puis écartées** (injection SQL, traversée de chemin, isolement
produit GL, `await` manquants…) pour éviter qu'un prochain audit ne les re-signale.

### Carnet de Sélène : « trouvé en jouant » vs « étudié » enfin distincts (UX)

Lève l'ambiguïté des deux notions de « feuillet acquis » (point d'attention de
`docs/reference/gl/chapitres-et-progression.md`), sans changer le modèle de données.

- **État de jeu de l'équipe** (`GLSeleneCarnetView` + `glFeuilletProgressLabels`, nouveau) :
  les pastilles affichent désormais des libellés **français lisibles avec picto**
  (🔒 Non trouvé · 🗺️ Trouvé · 📖 Lu · ✋ Tenu · 🌫️ Effacé) au lieu des valeurs techniques
  brutes en anglais (`discovered`, `read`…).
- **Marquage pédagogique personnel** renommé **« Marquer comme étudié »** / « ✓ Étudié »
  (au lieu de « découvert », qui entrait en collision avec l'état de jeu).
- **Règle** : le marquage « étudié » n'est plus proposé sur un feuillet **verrouillé** en
  partie (on ne peut pas étudier ce qu'on ne peut pas lire).
- Doc de référence mise à jour ; tests du helper de libellés + du carnet.

### UX élève / MJ : garde-fous, lexique vitalité et fiabilisation du feedback

Lot d'améliorations UX ciblées (issu de l'analyse UX élève), purement additif, sans
changement de comportement métier. Plusieurs pistes de l'audit étaient déjà corrigées
depuis : on verrouille l'acquis par des tests et on ajoute les manques réels.

- **Garde-fou « chapitre sans plateau »** (`GLChaptersAdminView`) : avertissement dans
  l'éditeur de chapitre quand aucun plateau (1–5) n'est assigné — ses feuillets de carte
  seraient sinon inatteignables sur la carte du royaume, sans message (piège de config
  signalé dans la doc de référence).
- **Lexique cœurs/gemmes** (`GLVitalityDisplay`) : `aria-label`/`title` explicites sur
  chaque jauge (« Cœurs : tes points de vie » / « Gemmes : tes points de pouvoir ») et
  légende visible optionnelle (`showHint`) — pour les élèves de cycle 3. Rétro-compatible.
- **Bandeau « Serveur indisponible »** (`App.jsx`) : le bouton « Réessayer maintenant »
  se désactive pendant la tentative (anti double-clic) et garantit une cible tactile
  ≥ 44px ; le rafraîchissement automatique reste inchangé.
- **Carnet d'observations** (`ObservationNotebook`) : la relance après échec affiche le
  loader pendant la nouvelle tentative (au lieu du placeholder « carnet vide »).
- **Tests de non-régression** : accessibilité des toasts (`TimedToast` : `role="status"`
  + `aria-live` déjà en place, désormais couverts), erreur+retry du carnet, garde-fou
  plateau, libellés de vitalité.

### Feuillets Sélène : associations complètes (zone, chapitre, liasse) + aperçu joueur

Réalise les pistes UI restantes de l'éditeur de feuillets.

- **Zone du royaume depuis l'éditeur** (`GLFeuilletKingdomZonePicker`, nouveau) : chapitre → zone
  polygonale, association via `PUT …/feuillets/:code/kingdom-zone` (détachement possible). Plus
  besoin de passer par la carte.
- **Chapitres rattachés lisibles** (`GLFeuilletChapterMemberships`, nouveau) : affiche les chapitres
  déduits (via `overview`) + rappelle que le rattachement dépend du biome / plateau / pays. Lecture
  seule — aucun changement du modèle métier (le rattachement reste déduit, pas de table de lien).
- **Réordonnancement d'une liasse** (`GLFeuilletLiasseReorder`, nouveau + endpoint
  `PUT /api/gl/lore/admin/feuillets/reorder`) : monter/descendre ou glisser-déposer les feuillets
  d'une liasse ; mise à jour groupée de `ordre_liasse` (champ déjà éditable, sans impact jeu).
- **Aperçu « comme le joueur le verra »** (`GLFeuilletReaderPreview`, nouveau) : bouton dans
  l'en-tête de la modale ; rendu miroir du carnet joueur (illustration, markdown lore, ancrage
  scientifique) à côté du formulaire (empilé sur mobile).
- Tests : 4 nouveaux composants (Vitest) + endpoint `reorder` (backend) + non-régression éditeur.

### Édition des feuillets Sélène : modale plein écran + associations facilitées

- **Édition plein écran (`GLLoreFeuilletsEditorPanel` + `DialogShell`)** : l'édition d'un feuillet
  s'ouvre désormais dans une **modale plein écran** (échap + piège de focus), avec en-tête collant
  (Enregistrer / Archiver / Fermer). Champs en grille 2 colonnes (1 colonne sur mobile).
- **Contenu d'abord** (`glFeuilletFieldLabels.js`) : sections réordonnées — **Contenu** et
  **Associations** ouvertes en haut, réglages techniques repliés ensuite. Les champs **Texte** et
  **Texte accessible** utilisent l'**éditeur markdown enrichi** (`GLMarkdownEditor`) au lieu de
  petites zones de texte, pour lire/écrire plus confortablement.
- **Association d'espèce simplifiée** (`GLFeuilletSpeciesPicker`, nouveau) : au lieu de taper à la
  main `lien_canal='espece'` + `lien_ref='SP0001'`, un **sélecteur d'espèce** (liste scopée au biome
  du feuillet) renseigne les deux champs d'un coup ; repli « référence manuelle » pour les autres
  canaux ou l'absence de biome. Le biome est libellé « Biome (→ chapitres) » pour clarifier le
  rattachement chapitre, et zone / plateau / liasse / ordres sont regroupés dans « Associations ».
- Tests : `GLFeuilletSpeciesPicker` (repli manuel, liste, effacement) + non-régression éditeur.

### Correctif : export / modèle XLSX des feuillets du carnet de Sélène sur smartphone

- **`src/shared/downloadAuthedFile.js`** : téléchargement des fichiers binaires (XLSX/CSV) rendu
  compatible mobile. Le lien `<a>` est désormais attaché au document avant `click()` et le
  nettoyage (`URL.revokeObjectURL` + retrait du lien) est **différé**. Sur iOS Safari / Chrome
  Android, la révocation synchrone de l'URL blob annulait l'écriture asynchrone du fichier →
  fichier vide/absent (« l'export ne s'exporte pas dans le contenu »). Nouvelle fonction exportée
  `triggerBlobDownload`. Corrige aussi bien l'**export du catalogue** que le **modèle XLSX** des
  feuillets Sélène, et par ricochet tous les téléchargements ForetMap/GL.
- **`GLLoreFeuilletsImportPanel.jsx`** : les boutons « Modèle XLSX » / « Exporter le catalogue »
  attendent désormais le téléchargement, affichent un état de chargement et **remontent les
  erreurs** (échec auparavant silencieux sur mobile). Import du hook `useEffect` inutilisé retiré.
- **UI onglets de gestion des feuillets** (`GLContentCatalogPanel.jsx` + `gl-theme.css`) :
  sous-onglets défilables horizontalement sur petit écran (`gl-subtabs--scroll`, plus d'empilement
  vertical), sémantique `role="tablist"/"tab"` + `aria-selected`, cibles tactiles ≥ 44px, et
  panneau import/export stylé (carte, zone de dépôt, rapport JSON défilable, boutons pleine largeur
  sur mobile).
### GL — récupération des ancrages carte des feuillets après suppression d'un chapitre

Supprimer un chapitre efface ses zones du royaume en cascade, ce qui détache (met à `NULL`) le
`kingdom_zone_id` des feuillets qui y pointaient — sans les supprimer. L'outillage admin ne
permettait de re-lier ces feuillets que zone par zone, en ajout seulement, sans signalement. Ce
lot comble le maillon faible.

- **Vue d'ensemble du carnet (`GET /api/gl/lore/admin/feuillets/overview`)** : expose désormais
  `kingdomZoneId` par feuillet et deux compteurs `mapAnchoredCount` / `mapAnchorLostCount`
  (feuillets de canal `zone` sans ancrage carte). Le panneau admin ajoute un KPI **« ancrage carte
  perdu »** (cliquable), une colonne **Ancrage carte** et un filtre dédié (lié / non lié / perdu).
- **Détachement** : le linker de zone (`GLKingdomZoneFeuilletLinker`) gagne un bouton **« Détacher »**
  par feuillet lié (`PUT …/:code/kingdom-zone` avec `kingdomZoneId:null`).
- **Éditeur de feuillet** : nouveau champ **Ancrage carte** (persisté via la route dédiée, hors
  payload générique) avec boutons Enregistrer / Détacher.
- **(Dé)ancrage en masse** : nouvelle route `PUT /api/gl/lore/admin/feuillets/kingdom-zone/bulk`
  (zone validée, `null` = détacher) + option d'édition en masse **« Ancrage carte »** dans l'éditeur.
- **Tests** : cas purs `assembleFeuilletOverview` (ancrage + compteurs) et intégration de la route
  bulk (ancrage, détachement, `404` zone inconnue, `400` sélection vide).
- **Docs** : `docs/API.md` (routes overview + bulk kingdom-zone) et
  `docs/reference/gl/carte-du-royaume.md` (point d'attention suppression de chapitre).
### Archivage (soft-delete) des tâches et des projets de tâches

Nouvelle fonctionnalité : archiver une tâche ou un projet pour le masquer des vues actives
sans le supprimer (réversible), plutôt que de le supprimer définitivement.

- **Base de données** : migration `169_tasks_and_projects_archived_at.sql` — colonne
  `archived_at DATETIME NULL` (+ index) sur `tasks` et `task_projects` (`null` = actif). Schéma
  canonique `sql/schema_foretmap.sql` aligné.
- **API** :
  - `GET /api/tasks` et `GET /api/task-projects` acceptent `?archived=active|archived|all`
    (défaut `active` ; portées `archived`/`all` réservées à `tasks.manage`, forcé à `active`
    sinon — les archives ne sont jamais exposées aux n3beurs).
  - `POST /api/tasks/:id/archive` · `/unarchive` (permission `tasks.manage`, idempotents).
  - `POST /api/task-projects/:id/archive` · `/unarchive` (permission `tasks.manage`) avec
    cascade par défaut vers les tâches du projet ; le désarchivage ne restaure que les tâches
    archivées par ce projet (marqueur `archived_via_project`) — celles archivées
    individuellement restent archivées. Corps optionnel `{ cascade }`.
  - Le calcul automatique de complétion d'un projet **exclut** désormais les tâches archivées.
- **Front-end** : les listes partagées restent actives uniquement (carte/modales non impactées) ;
  les archives (prof) sont isolées dans un état dédié et consultables via le filtre de statut
  « 📦 Archivés ». Boutons Archiver/Désarchiver (📦/♻️) sur les tuiles de tâche et les blocs
  projet, badge « 📦 Archivé ».
- **Tests** : `tests/tasks-archive.test.js` (intégration), `tests/tasks-helpers.test.js`
  (filtre `normalizeArchivedFilter`/`archivedFilterSql`), `tests-ui/utils/taskArchive.test.js`.
- **Docs** : `docs/API.md`, `docs/reference/foretmap/taches-tutoriels-et-validation.md`,
  `docs/EVOLUTION.md`.

#### Archivage automatique paramétrable

- **Job quotidien** `lib/autoArchive.js` (branché dans `server.js` à côté du job de tâches
  récurrentes) : archive automatiquement les **tâches validées** et **projets validés** dont la
  validation dépasse un délai. Portée limitée aux éléments **terminés** (jamais les tâches
  actives). Réversible.
- **Réglages** (portée prof) : `tasks.auto_archive_enabled` (défaut `true`) et
  `tasks.auto_archive_after_days` (défaut **120** ≈ 4 mois ; bornes 7–3650).
- **Migration 169** étendue : colonnes `tasks.validated_at` et `task_projects.finished_at`
  (référence du délai, posées à la validation), `tasks.archived_via_project` (marqueur de cascade
  fiable). Backfill des éléments déjà validés à la date de migration (pas d'archivage rétroactif
  massif). Horodatage de validation posé dans `POST /api/tasks/:id/validate`, `PUT /api/tasks/:id`
  (transition → `validated`) et `POST /api/task-projects/:id/validate`.
- **Tests** : cas d'archivage auto (tâche/projet ancien vs récent, non-validé épargné, bornage du
  délai) ajoutés à `tests/tasks-archive.test.js`.

### Audit `AUDIT_CODE_2026-07` — lot 5b : découpage des monolithes admin GL (sans changement de comportement)

Suite du découpage §6.1 sur les vues admin GL lazy (faible blast radius), à iso-comportement
(DOM/textes/endpoints inchangés, JSX déplacé verbatim, handlers restés dans le parent). Validé par
la suite Vitest complète (382 fichiers, 2517 tests verts).

- **`GLChaptersAdminView.jsx` : 723 → 659 lignes**. Quatre feuilles extraites sous
  `src/gl/components/admin/chapters/` (`GLChaptersSidebar`, `GLChapterMapDisplayFieldset`,
  `GLChapterThemePanel`, `GLChapterMapPreview`). Nouveau test `GLChaptersSidebar`.
- **`GLChapterMapStudio.jsx` : 695 → 561 lignes**. Deux sections périphériques extraites
  (`GLChapterMarkerList`, `GLChapterMarkerForm`) ; **le cœur d'interaction carte** (gestes,
  pan/zoom, calculs de coordonnées, glisser-déposer) reste intégralement dans le parent, par
  prudence.
- **`GLContentLibraryView.jsx` : 475 → 407 lignes**. Trois feuilles extraites sous
  `src/gl/components/admin/content-library/` (`GLContentLibraryConsultSection`,
  `GLContentLibraryFileList`, `GLContentLibraryImportActions`) ; `GLContentLibraryAuditPanel` et
  `GLContentLibraryAnalysisTable` réutilisés tels quels. Nouveau test `GLContentLibraryFileList`.

### Audit `AUDIT_CODE_2026-07` — lot 2b : double `jwt.verify` par requête (§2.6, sans changement de comportement)

- **`server.js` + `middleware/requireTeacher.js` + `lib/auth/jwtPipeline.js`** : chaque requête
  authentifiée sur l'API ForetMap vérifiait le JWT **deux fois** (garde d'isolement produit de
  `server.js`, puis middleware de route). La garde mémorise désormais les claims vérifiés sur
  `req.verifiedForetJwt` (liés au token exact) ; `requireTeacher` les réutilise au lieu de
  re-vérifier, tout en **réappliquant le contrôle de produit** via le nouveau helper pur
  `checkClaimsProduct`. Sémantique inchangée : token invalide jamais mis en cache (la garde
  échoue silencieusement → vérification complète + 401 par la route) ; token GL rejeté 403 par
  la garde avant d'atteindre la route ; fallback vérification complète si la garde n'a pas tourné
  (montage direct du middleware en test). Test pur `checkClaimsProduct` ajouté ; l'intégration est
  couverte par les suites `auth`/`rbac`.

Point §2 **différé** (non livré) : `stats /all` — restreindre `syncStudentPrimaryRoleFromProgress`
au seul cas où l'avancement change modifierait **quand** les promotions de rôle surviennent (effet
de bord métier sur un GET). Non optimisable sans changement de comportement observable ; à traiter
séparément avec des tests de caractérisation dédiés et validation base.

### Audit `AUDIT_CODE_2026-07` — lot 5 : découpage god components (partiel, sans changement de comportement)

Découpage de composants volumineux (§6.1) à iso-comportement (DOM, textes, endpoints, toasts
inchangés), validé par la suite Vitest complète (380 fichiers, 2508 tests verts).

- **`src/gl/components/GLSettingsView.jsx` : 663 → 352 lignes (−47 %)**. Quatre sections de
  réglages extraites en sous-composants prop-driven sous `src/gl/components/settings/`
  (`GLMascotMoveSettings`, `GLPlateauMarkerScaleSettings`, `GLVitalityDefaultsSettings`,
  `GLLoreRetriggerSettings`), sur le modèle des sections déjà externalisées. JSX déplacé verbatim,
  handlers pointant vers les mêmes fonctions du parent (`onSaveSetting`/`onToggle`) ; les hooks
  d'auto-save restent dans le parent. Nouveau test de rendu `GLLoreRetriggerSettings`.
- **`src/hooks/useMascotPackEditorState.js`** : extraction du cluster « état d'édition + logique
  dirty + resynchronisation » de `VisitMascotPackManager.jsx` dans un hook dédié, unitairement testé
  (6 cas). Comportement inchangé (mêmes états, effets et mémos, setters stables).
- **`tests-ui/hooks/useVisitSeenSync.test.jsx`** : timeouts du test « flush automatique » élargis
  (10 s / budget 25 s) pour absorber la contention CPU de la suite complète.

**Différé** : l'extraction `useAppData` de `src/App.jsx` (logique data/polling/temps réel) est
reportée — ce composant central a une couverture de tests trop faible pour un refactor de cette
ampleur ; conformément au garde-fou §9 de l'audit, elle nécessite d'abord des tests de
caractérisation dédiés.

### Audit `AUDIT_CODE_2026-07` — lot 3c : reliquats asyncHandler (O8, sans changement de comportement)

Poursuite de la migration O8 : remplacement des `try/catch` **génériques** (log + 500 générique
via `respondInternalError`) par l'enveloppe `asyncHandler`, qui route les exceptions vers le
gestionnaire d'erreurs central de `server.js` (même corps `{ error: 'Erreur serveur' }`, même
masquage 5xx). Contrat d'erreur public strictement inchangé.

- **`routes/students.js`** : `POST /import`, `POST /:id/duplicate`, `PATCH /:id/profile`.
- **`routes/rbac.js`** : `POST /users`, `PATCH /users/:userType/:userId`.
- **`routes/auth.js`** : `PATCH /me/profile`, `POST /register`, `POST /admin/impersonate`,
  `POST /admin/impersonate/stop`.
- **`routes/gl/games/markers.js`** : `present-question`, `present-arrival`, `apply-effects`.
- **`routes/plants.js`** : suppression d'un import `respondInternalError` déjà mort.

Les `catch` **spéciaux** sont intégralement conservés (statuts/messages précis : conflits
`1062`/`ER_DUP_ENTRY` → 409, `rethrowSlugConflict`, `resolveVitalityError`, contrat 404-vs-403 de
`games.js` join-team, `respondInternalError` avec `exposeDetail` de `tasks.js`, 502 `plants` de
`/autofill`/`plantnet`, callback OAuth Google). `logRouteError` reste importé là où un 500
diagnostic spécifique subsiste. Aucun message, statut ni corps de réponse modifié.

### Audit `AUDIT_CODE_2026-07` — lot mutualisation frontend 4 (sans changement de comportement)

Mutualisations frontend §5, à comportement observable strictement inchangé (surface d'API
publique et noms exportés préservés). Validé par la suite Vitest complète (378 fichiers, 2499
tests verts).

- **`src/shared/appBase.js` (§5.1)** : `API` + `withAppBase` (primitives pures d'URL, sans
  session/claim) extraites de `src/services/api.js`, qui les **ré-exporte** (compat : ~85
  importateurs ForetMap intacts). Les **14 modules GL** qui n'avaient besoin que de `withAppBase`
  importent désormais `src/shared/appBase.js` au lieu de tirer tout `api.js` (session ForetMap,
  `AccountDeletedError`, événements prof). **Isolement produit préservé** : `appBase.js` ne contient
  aucun store de session ni logique 401.
- **`src/utils/glTermAutolink.js` (§5.3)** : fabrique `createTermAutolink({ codeField, cssClass,
  dataAttr })` mutualisant le tronc commun byte-identique des autolinks de glossaire ;
  `glGlossaryAutolink.js` (SVT) et `glLoreGlossaryAutolink.js` (Lore) l'invoquent avec leur config
  et gardent leur stratégie de rendu propre (tokenisation regex vs parcours DOM) et **tous leurs
  noms exportés**. HTML généré identique.
- **`src/utils/zoneGeometry.js` (§5.3)** : module fédérateur des utilitaires canoniques
  `parseZonePoints` (parsing des sommets `{xp,yp}`) et `computeMapImageContainRect` (rect de fit
  `contain`) ; `visitMapGeometry.js` / `mapImageFit.js` / `biodivMapGeometry.js` les ré-exportent
  sous leurs alias existants (`parseVisitZonePoints`, `parseZonePointsJson`,
  `computeBiodivMapFitRect`). Les parses inline non équivalents (points bruts non normalisés) sont
  laissés distincts.
- **`src/hooks/useApiResource.js` (§5.4)** : nouveau hook `useApiResource(fetcher, deps, {
  onForceLogout })` → `{ data, loading, error, reload }` (fetch au montage/deps, garde anti-course,
  gestion `AccountDeletedError`), généralisant le pattern `safeApi`. **Additif** : aucune vue migrée
  pour l'instant (migration progressive ultérieure), couvert par 7 tests Vitest.

### Audit `AUDIT_CODE_2026-07` — lot mutualisation backend 3b : dédup helpers purs (sans changement de comportement)

Suppression de définitions locales **prouvées byte-identiques** à leur canonique (comparaison
`diff` corps à corps), remplacées par un import ; comportement inchangé, exports préservés là où
d'autres modules importent le nom. Les variantes ne serait-ce que d'un caractère ont été **laissées
en l'état** (signalées ci-dessous) pour ne prendre aucun risque de régression.

- **`normalizeImportHeader`** (canonique `lib/shared/stringHelpers.js`) : dédupliqué dans
  `lib/glSpeciesImport.js`, `lib/glPlayersImport.js`, `lib/glChaptersImport.js`,
  `lib/glLoreFeuilletsImport.js`, `lib/tasks/taskImport.js`, `lib/studentRouteHelpers.js` (export
  ré-exporté conservé).
- **`normalizeOptionalString`** (canonique `lib/shared/httpHelpers.js`) : dédupliqué dans
  `lib/glJournalPresent.js`, `lib/glZoneContent.js`, `lib/glProfile.js` (ré-exports conservés :
  `routes/gl/auth.js` importe depuis `glProfile`).
- **`normalizeIdArray`** (canonique `lib/taskRouteHelpers.js`) : dédupliqué dans
  `lib/tutorialRouteHelpers.js` (ré-export conservé) et `routes/task-projects.js`.
- **`parseId`** (canonique `lib/shared/httpHelpers.js`, déjà partagé) : définition locale
  identique retirée de `routes/gl/games.js` au profit de l'import existant.

Variantes **volontairement non fusionnées** (sémantique ou texte différents) : `parseId` de
`lib/gl/loreRouteHelpers.js` (troncature + rejet des ≤ 0, distinct de `httpHelpers`) ;
`normalizeOptionalString` de `taskImport`, `glSpeciesImport`, `glPlayersImport` (variante
`asTrimmedString`), `glLoreFeuilletsImport` (gère `—`/`-` → null), `glHelp`/`glIntro` (retour `''`
au lieu de `null`).

### Audit `AUDIT_CODE_2026-07` — lot mutualisation backend 3a (sans changement de comportement)

Factorisation de duplications backend prouvées identiques, à comportement observable
strictement inchangé, plus un correctif de robustesse de test :

- **`lib/shared/oauthCommon.js` (§4.3)** : trois fonctions OAuth **pures** (`parseCsvLowercaseSet`,
  `googleOauthConfigured`, `isGoogleEmailAllowed`), auparavant dupliquées **byte-à-byte** entre
  `lib/authRouteHelpers.js` (ForetMap) et `lib/gl/authRouteHelpers.js` (GL), sont mutualisées dans
  un module partagé. Les deux fichiers d'origine ré-exportent ces noms → aucun importateur modifié.
  **Isolement produit préservé** : aucune fusion de store de session, de claims ou de redirection
  OAuth — seules des fonctions pures sont partagées (les `normalize*OAuthMode` /
  `build*OAuthFrontendErrorRedirect` divergents restent locaux).
- **`lib/gl/questionDrawShared.js` (§4.2)** : le handler de tirage aléatoire de question, quasi
  identique entre `GET /api/gl/qcm/draw` (`gl_qcm_questions` / `biome_slug`) et
  `GET /api/gl/lore/qcm/draw` (`gl_qcm_lore_questions` / `chapitre_slug`), est mutualisé dans un
  helper paramétré par table et colonne de scope (constantes contrôlées, jamais d'entrée
  utilisateur interpolée — toutes les valeurs HTTP restent `?`). Requête, filtres, codes,
  messages et tirage `Math.random` inchangés ; chaque route garde sa résolution de scope propre.
- **`tests-ui/hooks/useVisitSeenSync.test.jsx` (§7.3)** : budget du test « flush automatique »
  porté à 15 s (3ᵉ argument de `it`). Le test enchaînait deux `waitFor` dont un à `timeout: 5000`,
  supérieur au budget par défaut de 5 s du test lui-même → expiration prématurée sur runner CI
  lent (flake). Aucune logique de test modifiée.

### Audit `AUDIT_CODE_2026-07` — lot N+1 & transactions backend (sans changement de comportement)

Correctifs de performance et de cohérence, à comportement observable strictement identique
(mêmes codes HTTP, messages français exacts, ordre des gardes, événements et corps de réponse) :

- **`lib/tasks/taskQueries.js` — `validateTaskLocations` (§2.3)** : élimination d'un N+1.
  Les zones et repères liés à une tâche étaient validés **un par un** (`getZone`/`getMarker`
  par id). Ils sont désormais chargés en **deux requêtes groupées**
  (`SELECT id, map_id FROM zones WHERE id IN (…)` et idem `map_markers`), la validation se
  faisant ensuite en mémoire — priorité zones-avant-repères, messages d'erreur et map_id
  agrégés inchangés. Helpers `getZone`/`getMarker` devenus inutilisés : supprimés.
- **`routes/task-projects.js` — POST/PUT (§2.5)** : la création et la mise à jour d'un projet
  (INSERT/UPDATE + liens zones/repères/tutoriels) sont regroupées dans **une transaction**.
  Un échec au milieu ne laisse plus le projet désynchronisé de ses liens. Les helpers
  `setProject*` / `replaceProjectJunctionRows` acceptent désormais un exécuteur (`tx`), sur le
  modèle de `lib/speciesJunction.js`. Validations 400/403/404 inchangées, avant la transaction.
- **`routes/tutorials.js` — POST création (§2.5)** : l'INSERT du tutoriel et ses liens
  zones/repères sont regroupés dans **une transaction** ; `replaceTutorialZonesMarkers` accepte
  un exécuteur optionnel rétrocompatible (`conn = pool` par défaut, le PUT reste inchangé).

Relevés mais **différés** vers un lot dédié avec tests (comportement sensible) : synchronisation
de rôle par élève dans `GET /api/stats/all` (effets de promotion), double `jwt.verify` par
requête (garde d'isolement produit + middleware de route), projections `SELECT *`
(`routes/auth.js`, liste `plants`).

### Audit `AUDIT_CODE_2026-07` — lot quick-wins (perf & simplification, sans changement de comportement)

Suite de l'audit de code : correctifs à comportement strictement identique.

- **`lib/httpRequestLog.js` (§2.6)** : `parseHttpLogMode()` / `parseSlowMs()` sont désormais
  résolus **une seule fois** à la création du middleware (au démarrage) au lieu d'être
  recalculés à chaque requête HTTP. Les variables `FORETMAP_HTTP_LOG` / `FORETMAP_HTTP_SLOW_MS`
  ne changent pas en cours d'exécution — sortie du chemin chaud par requête.
- **`src/utils/markdown.js` (§3.5)** : cache LRU (300 entrées, éviction FIFO) sur
  `marked.parse()`. Les longues listes (glossaire, lore, carnet) re-parsaient en boucle les
  mêmes textes à chaque rendu ; le parse étant déterministe à partir du texte brut, il est
  désormais mémoïsé. Rendu HTML final inchangé.
- **`routes/tasks.js` + `lib/taskRouteHelpers.js` (§6.2)** : la clause `ORDER BY` de tri des
  tâches (épinglage `sort_order`, barème d'importance, échéance), auparavant dupliquée à
  l'identique entre la liste et la réordonnance de projet, est factorisée dans
  `taskImportanceOrderBySql(prefix)`. SQL généré sémantiquement identique.

### Audit général du code — lot 2 : factorisation des duplications (sans changement de comportement)

Déduplication des trois blocs identifiés par l'audit, à comportement strictement
identique (mêmes chemins, gardes, messages, codes HTTP, événements) :

- **`lib/entityPhotoRoutes.js`** : les 5 routes « galerie photos » (liste, réordonner,
  data, ajout, suppression), auparavant dupliquées entre `routes/zones.js` et
  `routes/map.js` (~250 lignes), sont générées par une fabrique paramétrée (table,
  colonne FK, permission, messages, dossier uploads, événements). Les schémas de
  validation O7 restent exportés sous leurs anciens noms pour les tests de contrat.
- **`lib/profileUpdate.js`** : blocs communs des deux PATCH profil
  (`/api/auth/me/profile` et `/api/students/:id/profile`) — drapeaux de champs,
  validation mascotte visite, traitement avatar (upload/suppression), contrôle
  d'unicité pseudo/email, détection de doublon SQL. Les différences voulues entre
  les deux routes (messages, normalisation email, validation des champs, dossier
  avatar, `display_name`, événement d'audit) restent locales.
- **`lib/shared/participationGuards.js`** : noyau commun forum / commentaires
  contextuels — `getActor`, modération (`admin`/`prof`/`teacher.access`), rôle
  visiteur, fabrique de cooldown anti-spam (état privé par module, purge), et
  participation n3beur par colonne de rôle (liste blanche `forum_participate` /
  `context_comment_participate`).

### Audit général du code — correctifs de cohérence et de robustesse (sans changement fonctionnel)

Correctifs issus d'un audit complet des routes backend (bugs confirmés par lecture du code,
aucune modification du comportement métier attendu) :

- **Tutoriels — POST `/api/tutorials`** : la validation des zones/repères liés se fait
  désormais **avant** l'INSERT (comme dans le PUT). Auparavant, une sélection invalide
  répondait 400 mais laissait un tutoriel orphelin actif en base (doublons en cas de
  nouvelle tentative).
- **Réglages — PUT `/api/settings/admin/:key`** : validation complète (normalisation +
  cohérence croisée, nouveau helper `validateSettingCandidate` dans `lib/settings.js`)
  **avant** persistance — un 400 ne peut plus être renvoyé alors que la valeur était déjà
  enregistrée. Les pannes internes répondent désormais 500 (gestionnaire central) au lieu
  d'un 400 avec message brut. Même correction sur
  `PATCH /api/rbac/progression-by-validated-tasks`.
- **Tâches — PUT `/api/tasks/:id` et POST `/api/tasks/:id/validate`** : toutes les
  écritures (UPDATE + jonctions zones/repères/tutoriels/référents + espèces + colonnes
  legacy + image) sont regroupées dans **une transaction**, comme le POST — un échec au
  milieu ne laisse plus la tâche désynchronisée de ses jonctions. L'image invalide est
  refusée (400) avant toute écriture ; l'ancienne image n'est supprimée qu'après commit.
- **Tâches — PUT `/api/tasks/:id`** : un titre vide explicite est refusé (400 « Titre
  requis », aligné sur le POST).
- **Projets — PUT `/api/task-projects/:id`** : le changement de carte est refusé (400)
  tant que des tâches du projet restent liées à l'ancienne carte (préserve l'invariant
  tâche↔projet sur la même carte).
- **Groupes — PATCH `/api/groups/:id`** : les parentés circulaires sont refusées (400) —
  auparavant deux PATCH croisés créaient un cycle qui faisait disparaître les groupes de
  l'arborescence et élargissait leur périmètre mutuel. **DELETE `/api/groups/:id`** :
  les rôles des élèves ex-membres sont resynchronisés immédiatement (comme après une mise
  à jour de membres).
- **Zones — POST/PUT** : `points` doit être un vrai tableau de sommets `{xp, yp}` numériques
  (une chaîne passait la garde `length ≥ 3` et corrompait la géométrie).
- **Observations — POST** : `zone_id` inconnu répond 400 « Zone introuvable » au lieu
  d'un 500 (violation de clé étrangère).
- **Forum — POST réponse** : le cooldown anti-spam n'est plus consommé quand la requête
  est refusée (sujet introuvable/hors périmètre/verrouillé) ; purge périodique de l'état
  de cooldown en mémoire (forum + commentaires contextuels).
- **Élèves — PATCH `/api/students/:id/profile`** : contrôle d'unicité pseudo/email élargi
  à **tous** les comptes (même périmètre que `PATCH /api/auth/me/profile` et que les index
  uniques), pour un 409 précis au lieu du repli générique.
- **Redémarrage GUI — POST `/api/settings/admin/system/restart`** : utilise le même arrêt
  gracieux que `/api/admin/restart` (drain HTTP, Socket.IO, pool MySQL) au lieu d'un
  `process.exit` brutal.
- Nettoyage : suppression de `serializeLivingBeings`/`withLivingBeings` (code mort) dans
  `routes/zones.js` et `routes/map.js`.

Points relevés mais **non modifiés** (décision métier à trancher) : filtre de rôle
`TUTORIAL_MANAGER_ROLES` sur `tutorials.manage` (incohérent avec le modèle RBAC des autres
permissions) ; possibilité pour un détenteur de `admin.users.assign_roles` non admin de
changer le mot de passe d'un autre prof.

### Documentation de référence — sommaire complet (13 nouveaux documents)

- `docs/reference/` est désormais **complet** : 7 documents ForetMap (carte et zones,
  plantes et biodiversité, tâches/tutoriels/validation, comptes/rôles/groupes, visite
  et mascottes, pédagogie, stats/forum/suivi) et 6 documents GL (rôles et connexion,
  chapitres et progression, carte du royaume, économie, QCM et pédagogie, guide du
  MJ), tous en français non technique pour admins/profs/MJ, avec encadrés
  « ⚠️ Points d'attention » honnêtes.
- Sommaire `docs/reference/README.md` : 17/17 ✅.
- Précision corrigée dans la présentation ForetMap : le suivi GPS de la mascotte
  existe sur la carte de travail, pas dans le mode Visite (déplacement au clic).

### Troisième tour d'arbitrage — F3 et G1 livrés

- **F3 (A) — navigation stabilisée** : la fusion contextuelle Tâches/Tuto (déclenchée
  par un « lieu en focus ») est supprimée — Tâches et Tuto sont des onglets séparés en
  toutes circonstances, côté élève comme côté prof. La vue grand écran
  « Cartes & tâches » (carte + tâches côte à côte) et le masquage par module sont
  conservés. Garde de navigation `tuto→tasks` retirée ; tests UI adaptés.
- **G1 (B) — socle narratif « Les deux peuples du seuil »** :
  `docs/reference/gl/lore-deux-peuples.md` — gnomes (peuple du proche/observation) et
  licornes (peuple du loin/récit), pacte du seuil, **transformation entre chaque
  chapitre** (le seuil donne la forme dont le prochain biome a besoin — les équipes
  changent de compagnon en chemin) et **Sélène qui a incarné les deux formes**.
  Textes prêts à coller : page « Pourquoi Gnomes & Licornes ? », 4 feuillets, pistes
  QCM lore, mode d'emploi d'intégration MJ/admin. Donne un sens narratif aux effets
  de repères différenciés gnome/licorne déjà mécanisés.
- Registre `docs/reference/INCOHERENCES.md` : les 17 points de l'état des lieux sont
  désormais tous ✅ traités (hors suites notées : plancher vitalité, points images
  R1-R3 de l'audit, intégration du corpus dans les contenus du jeu).

### Second tour d'arbitrage — F2, G2, G8, G9 livrés

- **F2 (A+B) — parcours du nouvel inscrit** : bandeau d'explication pour les comptes
  « visiteur » non rattachés ; liste « comptes en attente de rattachement » côté prof
  (`GET /api/groups/pending-visitors`) avec rattachement en un clic
  (`POST /api/groups/:id/members/:userId`, helper partagé `lib/groupMembers.js`) ;
  **code de classe** par groupe (migration `167_groups_class_code.sql`,
  `POST /api/groups/:id/class-code` generate/clear, panneau prof) et champ optionnel
  `classCode` à l'inscription — code invalide → 400 sans création de compte (tracé
  `security_events`), code valide → rattachement + promotion n3beur automatique.
- **G2 (A)** : Réglages GL — avertissement quand le Marché est activé sans la vitalité
  + bouton « Activer la vitalité ».
- **G8 (A)** : doc interne alignée (défaut sorts = joueurs ; profils de séance pour le
  mode MJ seul).
- **G9 (C — libellés)** : « tu dépenses tes cœurs/gemmes — il te restera N » au Marché
  et dans l'assistant de sorts.
- Stabilisation d'un test UI flaky en CI (`useVisitSeenSync`, timeout waitFor élargi).
- Registre `docs/reference/INCOHERENCES.md` : options détaillées + avis pour F2, F3,
  G1, G2, G8, G9 ; statuts ✅ mis à jour ; présentations ForetMap/GL et `docs/API.md`
  synchronisées.

### Assainissement — registre d'incohérences (lots F1/F4-F7, G3-G7/G10)

- **Sécurité (F1)** : `POST /api/tasks/proposals` dérive désormais l'identité élève du
  JWT (403 sans jeton ou si `studentId` diverge) ; contexte d'action élève mutualisé
  dans `lib/tasks/studentActionContext.js`. **(G7)** mots de passe staff GL : 8
  caractères minimum (changement + réinitialisation par token enseignant).
- **Nouveau (G3)** : écrans d'administration du conditionnement par QCM — « Contenus →
  Conditionnement QCM » (liens ressource ↔ question) et « Réglages plateforme →
  Conditionnement par QCM » (`gating.*` via `PUT /api/gl/learning-links/settings`).
- **Nommage (G4/G6)** : « Glossaire scientifique » vs « Lexique lore », « QCM biomes »
  vs « QCM lore » partout ; libellés Biodiversité/Écosystèmes harmonisés (biotope/
  biocénose réservés aux contenus pédagogiques).
- **Nettoyages (F6/F7/G5/G10)** : vestiges PIN purgés (UI profils, docs, CI) ;
  endpoint doublon `POST /api/gl/admin/players/:id/reset-pin` supprimé (alias body
  `pin` conservé en compat) ; règle de numérotation des migrations documentée ;
  scories `lib/glSettings.js` supprimées (`settingKeyForCamel` dérivé automatiquement).
- **Dette (F4/F5)** : migration destructive `166_drop_visit_v1_content.sql` (tables
  visite V1 supprimées après copie filet) ; `task_zones`/`task_markers` unique source
  de vérité (colonnes directes = copie auto write-only, replis en lecture retirés).
- **Docs de référence** : registre `docs/reference/INCOHERENCES.md` (11 points ✅
  livrés, 6 reportés), présentations ForetMap/GL mises à jour, `docs/API.md`,
  `docs/EVOLUTION.md`, `docs/GL_CARNET_JOUEUR.md`.

### Documentation — registre d'arbitrage des incohérences

- Nouveau `docs/reference/INCOHERENCES.md` : 17 points relevés (7 ForetMap, 10 GL)
  avec gravité, options de correction et recommandations, découpage en 5 lots ;
  lignes « Décision : » éditables par l'utilisateur pour arbitrer.

### Documentation — base de référence fonctionnelle (`docs/reference/`)

- **Nouveau dossier `docs/reference/`** : documentation fonctionnelle non technique
  (français simple, sans jargon) destinée aux admins, profs et MJ. Triple objectif :
  état de l'existant (encadrés « ⚠️ Points d'attention »), base d'évolution (les
  éditions utilisateur marquées `🔧 À implémenter` valent demandes de changement pour
  le code), documentation finale pour non-codeurs.
- Premiers documents : `docs/reference/README.md` (index + règles de maintien),
  `docs/reference/foretmap/presentation.md` et `docs/reference/gl/presentation.md`
  (présentations générales, avec points d'attention honnêtes sur l'existant).
- **Convention de maintien perpétuel** inscrite dans `CLAUDE.md`, nouvelle règle
  `.cursor/rules/foretmap-docs-reference.mdc` (alwaysApply) et skill
  `foretmap-docs-reference` (`.claude/skills/` + `.cursor/skills/`).
- `CLAUDE.md` : correction de la description obsolète « mode prof via PIN » (remplacée
  par les rôles RBAC attribués à la connexion ; anciennes routes en 410 Gone).
- Correctif CI : formatage Prettier de `tests/media-library-path.test.js`.

### Consolidation Git

- Fusion des commits uniques encore absents de `main` (tests médiathèque, `workflow_dispatch` CI) et correctif PWA `manifest.json` (`Content-Type: application/manifest+json`).
- Suppression de toutes les branches locales et distantes sauf `main` (contenu déjà intégré via PR ou obsolète sur l’historique actuel).

### Documentation

- **GL — QCM** : nouvelle synthèse `docs/GL_QCM_SETS.md` (+ schéma visuel
  `docs/GL_QCM_SETS.html`) décrivant les deux sets de QCM (`qcm` écologie/biome et `qcm_lore`
  narratif), leur ancrage aux ressources, les trois voies d'accès élève (marqueur de carte,
  dé/modale, hors partie) et le backbone commun de rattachement/gating.

### Ajout — verrou de re-tentative (cooldown) sur la validation par QCM

- **Comportement.** Après une **mauvaise réponse** à une question bloquante **pendant le flux
  « Marquer comme acquis/lu/appris »**, la **ressource entière** est **verrouillée pendant N jours**
  (réglage, défaut **3**) : toute nouvelle tentative de validation est refusée (**403**) tant que le
  verrou court, même si toutes les questions sont ensuite réussies. Le quiz libre et le jeu GL ne
  déclenchent jamais le verrou (le déclenchement dépend d'un contexte ressource transmis avec la
  réponse, propre au flux de validation). Applicable **ForetMap + GL**.
- **Base de données** : migration `165_learning_gating_cooldown` — tables miroirs
  `resource_gating_cooldowns` (FM, clé `user_id`) et `gl_resource_gating_cooldowns` (GL, clé lecteur),
  colonne `locked_until`.
- **Réglages** : `learning.gating.retry_cooldown_days` (FM, `app_settings`, scope prof, 0–365, def. 3)
  et `gating.retry_cooldown_days` (GL, `gl_settings`) — `0` = verrou désactivé.
- **Backend** : `lib/learningGatingCooldown.js` (helpers) ; le challenge et les réponses d'accusé
  exposent un bloc `cooldown: { locked, locked_until, retry_days, remaining_days }` ; les routes de
  réponse QCM (`/api/quiz/.../answer`, `/api/gl/qcm/.../answer`, `/api/gl/lore/qcm/.../answer`)
  acceptent un contexte ressource optionnel et posent le verrou sur erreur.
- **Front** : le panneau de quiz gating affiche « réessaie dans N jours » au lieu de « Réessayer » en
  cas d'erreur verrouillante, et le bouton d'accusé montre un écran de verrou si la ressource est déjà
  verrouillée à l'ouverture.

### Changement majeur — suppression de l’élévation par PIN

- **Fin du « mode sudo » par PIN.** Un utilisateur connecté possède désormais **directement**
  toutes les permissions de son rôle : la dimension d’élévation (PIN de profil, session « élevée »)
  est entièrement retirée. Le RBAC (rôles + permissions + création dynamique de profils) est conservé.
- **Backend** : `hasPermission`/`requirePermission` n’ont plus de notion d’élévation ;
  `buildAuthzPayload` accorde toutes les permissions du rôle ; suppression de `verifyRolePin`,
  `hashPin`, du seed PIN `1234`, de `requireTeacherElevated` et de l’option `{ needsElevation }`
  sur ~80 routes. Les endpoints **`POST /api/auth/elevate`** et **`POST /api/auth/teacher`**
  renvoient désormais **410 Gone**.
- **Base de données** : migration `164_drop_pin_elevation_system` — suppression des tables
  `role_pin_secrets` et `elevation_audit` et de la colonne `role_permissions.requires_elevation`.
- **Front** : la modale « Mode prof » devient une **connexion professeur** (e-mail/mot de passe,
  reset, Google) ; suppression du bouton cadenas d’élévation, de la colonne « PIN » de l’admin
  des profils et du champ PIN de profil. Le bouton d’en-tête ouvre la connexion prof (🔑).
- **Réglages/env** : suppression des réglages `security.allow_pin_elevation` et
  `security.jwt_ttl_elevated_seconds`, de la variable `TEACHER_PIN` et du script
  `db:reset:role-pins:local`. La sécurité « appareil partagé » repose désormais sur la durée de
  session standard (`security.jwt_ttl_base_seconds`).
- **Effet métier** : le profil `eleve_chevronne` peut proposer des tâches (`tasks.propose`) sans
  PIN ; tout profil dynamique dont une permission était « à élévation » l’obtient directement.
  Le profil `prof` est inchangé en pratique (il était déjà `nativePrivileged`, donc sans PIN).
### Sécurité — Audit de code (bugs, incohérences, logique)

- **GL — élévation MJ → Admin** : `getGlRolePermissions('mj')` accordait les mêmes
  permissions qu'`admin`, dont `gl.settings.manage`. Un MJ pouvait modifier les réglages
  globaux GL (vitalité, scoring, gating). Permissions MJ désormais alignées sur le
  catalogue RBAC (sans `gl.settings.manage`) ; le joueur récupère `gl.mascot.position`.
- **RBAC — promotion vers `admin`** : `PUT /users/:type/:id/role` protégeait la
  rétrogradation du dernier admin mais pas la promotion vers `admin`. Seul un acteur admin
  peut désormais attribuer/retirer le rôle admin (symétrie avec `POST`/`PATCH /users`).
- **Isolement produit temps réel** : l'auth Socket.IO ne vérifiait pas le claim `product`.
  Un jeton GL rejoignait les rooms métier ForetMap (`tasks/students/garden/forum`). Les
  rooms ForetMap sont désormais réservées aux jetons ForetMap ; les jetons GL restent
  limités à `subscribe:gl-*`.
- **GL — fuite des réponses QCM** : `GET /api/gl/qcm/questions` et `.../lore/qcm/questions`
  exposaient `reponse_correcte` sous `gl.read` (joueurs/invités). La bonne réponse n'est
  plus renvoyée qu'au staff (`gl.content.manage`).
- **Réinitialisation de mot de passe GL — poisoning via en-tête Host** : le lien de reset
  retombait sur `req.get('host')` non validé. Le Host n'est accepté que s'il correspond à
  une origine configurée (sinon repli sur la base d'env) ; `resetUrl` est aussi échappé
  dans le corps HTML de l'e-mail.
- **Auth — panne BDD masquée en 401** : `resolveAuthOrRespond` renvoyait « token invalide »
  (401) si l'hydratation RBAC échouait (panne BDD). Vérification JWT (401) et hydratation
  (503) désormais dissociées.
- **Isolement `/api/gl`** : la garde produit sautait tout chemin commençant par `/gl`
  (dont `/api/glossary`). Frontière stricte `=== '/gl'` ou `/gl/`.
- **Observations — séparation lecture/écriture** : la suppression d'un carnet était gardée
  par une permission de *lecture* (`observations.read.*`). Nouvelles permissions
  `observations.manage.all` / `observations.manage.group` (migration `163`, attribution
  idempotente aux rôles ayant déjà la lecture) : un rôle en lecture seule ne peut plus
  supprimer les carnets d'autrui.

### Correctif

- **Forum — périmètre de groupe en écriture** : `POST` message, réaction et signalement ne
  vérifiaient le périmètre visible qu'en lecture. Contrôle désormais appliqué aux écritures.
- **Tâches — dévalidation en mode `single_done`** : `POST /:id/done` forçait `status='done'`
  sans garde, permettant à un élève de faire régresser une tâche `validated`/`on_hold`.
- **GL sorts — double-dépense de vitalité** : `finalizeCastTx` relisait le solde sans
  `FOR UPDATE`. Verrou pessimiste ajouté (comme le marché) pour sérialiser les lancements
  concurrents d'un même contributeur.
- **Carte — liaison de tâche effacée** : `linkTaskToLocation` comparait un id numérique à
  la chaîne d'un `<select>` (`5 === "5"` faux), écrasant les autres lieux liés. Coercition
  `Number()` + garde sur tâche inconnue.
- **Médiathèque — détection MP4** : la signature `ftyp` était testée à l'offset 0 au lieu de
  4-7 ; les vidéos MP4 sans indice MIME étaient rejetées.
- **Notifications — préférences/métriques par rôle** : non rechargées au changement de rôle
  et métriques écrasées sur la mauvaise clé de stockage.
- **Temps réel — jeton figé** : le socket ne se reconnectait pas après élévation PIN /
  refresh / expiration ; le jeton est désormais réactif (`foretmap_session_changed`).
- **Duplication de projet** : la copie vers une autre carte conservait des liens
  zones/repères d'une carte étrangère. Ces liens ne sont copiés que si la carte cible est
  identique à la source.
- **Journaux de tâche** : `GET /:id/logs` (prénoms/noms, commentaires) était lisible sans
  authentification. Réservé désormais à un compte connecté non visiteur.
- **Autofill espèces** : `Promise.all` iNaturalist rejetait tout le lot si une requête
  échouait ; passage à `Promise.allSettled`.
- **Divers** : message d'avertissement CORS corrigé (`origin: false` = restrictif),
  ternaire mort dans la conversion de zones legacy simplifié.
- **Front — gardes de course** : compteurs d'observations (`usePlantObservationCounts`) et
  commentaires contextuels (`context-comments`) appliquent désormais un compteur de requête
  (seule la réponse la plus récente est retenue) ; le debounce de `fetchAll` (`App.jsx`)
  annule correctement le timer en attente (plus de double-fetch pendant les rafales au boot).

- **GL — boutons invisibles dans les popovers/modales** : les popovers GL (QCM,
  « J'ai appris » / gating, feuillets…) sont rendus via `createPortal(document.body)`,
  donc hors de `.gl-app`. Les variables de palette (`--gl-color-primary`, `--gl-border`,
  `--gl-accent-danger`…) n'étaient déclarées que sur `.gl-app` : sans fallback,
  `background: var(--gl-color-primary)` retombait sur `transparent` → boutons primaires
  invisibles (texte blanc sur fond transparent). Variables désormais portées par
  `body.gl-body` (ancêtre commun de `.gl-app` et des portails), le thème de marque
  restant prioritaire inline sur `.gl-app` / via `themeStyle` sur les popovers.
- **BDD** : migration `162_repair_task_zones_markers_fk` — réparation idempotente des FK `task_zones` / `task_markers` (drift local sans contraintes).
- **e2e** : quiz pédagogique — attente du bloc `.pedago-qcm-feedback` (feedbacks personnalisés type « Exact ! »).

### Technique

- **Format** : normalisation Prettier LF (cohérence CI / Windows).
- **Build** : régénération `dist/` après build local.

### Audit — Vague 7 (clôture) : derniers reliquats

- **GL `admin.js` 1355 → 1217 L** : reset-password/pin unifiés, `PUT
  /settings/:key` en table de validateurs (Map anti-`__proto__`) +
  `upsertGlSetting`, import joueurs extrait (`lib/gl/importPlayers.js`) avec
  fin du N+1 d'unicité (`IN (…)` borné au fichier au lieu de la table
  entière) ; re-fetch après écriture réduits (mascots/context-comments
  construits depuis `insertId`, conservations justifiées en commentaire).
- **Projections `SELECT *`** : stats (3 sites, `password_hash` ne transite
  plus), auth (PATCH profil, réponse, register) ; liste plantes volontairement
  inchangée (36/37 colonnes réellement consommées par le front — documenté).
- **AppGL 1574 → 1098 L** : `useGlGameRuntime` (gameplay + socket + dés,
  609 L zéro JSX, 13 tests) et `useGlSessionState` ; callbacks console MJ
  stabilisés. **Panneaux admin GL** : `useGlAdminCrud` adopté par
  Species/Spells/Glossary (−145 L), feuillets 17 → 8 useState
  (`useGlFeuilletBulkEdit`).
- **TasksView 1174 → 990 L** : 5 hooks de domaine (modales, filtres, données
  prof, affectation rapide, drag & drop), 40 nouveaux tests.
- **App.jsx** : snapshot `fetchAll` posé en effet (sûr en rendu concurrent),
  fallback `currentUser` mémoïsé.


### Audit — Vague 6 (finale) : micro-items soldés

- **Formulaires** : `LocationPickList` (3 clones de pick-list zones/repères),
  `useTutorialSearch`, `TaskFormTutorialsField` réutilisé ; `ImportPanel`
  générique partagé (imports tâches/n3beurs/plantes en adaptateurs).
- **Tâches** : `assignmentMatchesStudent` unifie le matching (×4 copies +
  variantes App/notifications) ; props volatiles des tuiles séparées —
  `React.memo(TaskTileCard)` réellement effectif ; `TaskProjectsBlock`
  mémoïsé ; toasts de tutorials-views via `showToast` (timers nettoyés).
- **Hooks & perf** : `useTutorialReadIds`/`usePlantObservationCounts` (fin du
  refetch par poll), `usePlantCatalogFilters`, Map plante→lieux,
  `TeacherLeaderboard` mémoïsé, `FoodWebGraph` en rAF, resync des champs
  cartes (AdminSettingFields), code mort `useNotificationCenter`, géométrie
  dédupliquée, micro-items mascotte (double filtre, préchargement, props mortes).
- **GL (chore(gl))** : `isMj()` (×17 tests inline), `buildDynamicUpdate`
  déclaratif (PUT chapters/games, ×47 if-chains, « présent mais null »
  préservé), `validateEventPayload`, `upsertGlSetting`, tirage QCM sur
  `question_code` seul ; message « Accès refusé à cette partie » restauré
  (contrat testé, unification erronée d'agent corrigée).

### Audit — Vague 5 : god components découpés, chargement initial allégé

- **App.jsx 2 270 → 1 697 lignes** : `AppHeader` (vague 4) + `NoticeBanner`,
  `isTeacher` dérivé d'`authClaims`, hook `useAuthSession` (session,
  impersonation, restauration — testé), dédup des arbres prof/élève
  (`MapTasksArea`, `PedagoTabs`, différences de props cartographiées et
  préservées).
- **VisitViewImpl −438 lignes** : `useVisitContent`, `useVisitSeenSync`,
  `useVisitMapMascotController`, couches `VisitZonesSvgLayer` (polygones
  pré-parsés) / `VisitMarkersLayer` mémoïsées.
- **MapViewImpl −430 lignes + correctifs P1 gestes** : listeners plus
  ré-attachés à chaque rendu, API `useMapGestures` mémoïsée, borne pinch
  alignée (6→8) ; `ZonePolygonsLayer`/`DrawingLayer`/`EditPointsLayer` +
  `useZoneDrawing`/`useZoneEditPoints`/`useMapCrudActions`.
- **VisitMascotPackManager −450 lignes** : `savePack` unifié, hooks
  assets/bulk-actions testés, `fileToPngDataUrl` en util, timers de feedback
  nettoyés (`useTransientMessage`).
- **GL (chore(gl))** : `useGlToasts`, `socket.io-client` en import dynamique
  (chunk hors chargement initial des deux fronts), `gl-admin.css` (1 704 L)
  extrait de `gl-theme.css` et chargé par les vues lazy.

### Audit — Vague 4 : chantiers structurants

- **Modales carte mutualisées** : panneaux tâches/tutoriels paramétrés par
  `locationKind` et réutilisés par `MarkerModal` (fin des versions inline),
  `LocationModalTabBar` unique, aside visite commun, dérivations partagées
  (`useLocationModalData`, mémoïsation P0 anti-boucle préservée), médias visite
  (`useVisitMediaBlocks`) — ~400 lignes dupliquées éliminées.
- **Hooks « arrival » GL (chore(gl))** : 33 tests de caractérisation écrits
  AVANT refactor, puis noyau `useGLZonePresence` (dédup, suivi de position,
  timers) — 4 hooks migrés en stratégies minces, `useGLMarkerArrival` laissé
  volontairement (divergence documentée). La mécanique temps réel n'existe
  plus qu'en un exemplaire testé.
- **Socle QCM backend (chore(gl))** : `lib/shared/questionCrudCore.js` +
  `xlsxImportCore.js` — les 6 fichiers gl/fm Qcm{Crud,Import} deviennent des
  adaptateurs (3 176 → 2 649 lignes), schémas de colonnes et messages français
  exacts préservés par produit.
- **ProfilesAdminView** : panneaux autonomes (CreateUserPanel,
  StudentImportPanel, UserEditModal possèdent leur état ; `useRoleEditFields`)
  — fin du prop drilling à 21-35 props, ~920 → 751 lignes.
- **App.jsx** : extraction d'`AppHeader` (2 270 → 2 127 lignes, étape 1 du
  découpage ; suite prévue : `useAuthSession`, dédup des arbres prof/élève).

### Audit — Vague 3 : extraction server.js, perf visite, infra

- **server.js 950 → 619 lignes** (déplacement pur) : `routes/admin-ops.js`
  (4 endpoints DEPLOY_SECRET + middleware `requireDeploySecret` factorisant la
  garde répétée 4×), `routes/health.js`, `lib/rateLimit.js` (propriétés
  `message` mortes supprimées). `middleware/requireTeacher.js` : bloc
  verify+hydrate unique (`resolveAuthOrRespond`) pour les 3 middlewares —
  statuts, messages et ordre inchangés, tests auth passés sans modification.
- **Perf (visite mobile)** : pan/zoom sans re-render par frame — nouveau hook
  `useVisitMapTransform` (transform en ref + style impératif sous rAF, commit
  en fin de geste, pattern `useMapGestures`) ; fin du setState par pointermove
  qui re-rendait ~1 600 lignes par frame.
- **Infra** : `uuid` → `crypto.randomUUID()` natif (dépendance retirée) ;
  `marked`/`isomorphic-dompurify`/`@rive-app/react-canvas`/`turndown` en
  devDependencies (runtime prod allégé) ; globals ESLint via le paquet
  `globals` (~120 lignes de listes manuelles en moins) ; `initSchema` mémoïsé
  entre fichiers d'un même run de tests (sentinelle vérifiée par empreinte
  schéma+migrations et version BDD) ; scripts npm morts supprimés
  (`test:load:normal`, `release:*`), login en dur retiré de `db:admin:audit*` ;
  garde-fou anti-miroir-CJS-incomplet dans `sync-gl-pack-server-lib`.
- **Éditeur QCM générique** : `src/shared/qcm/QuestionEditorPanel.jsx`
  (descripteur : endpoints, formulaire, filtres/tris, autosave GL vs soumission
  manuelle FM, client HTTP et composants UI injectés) + `questionEditorFormCore` —
  les 3 panneaux clones (~68 %) deviennent des adaptateurs minces, exports des
  modules de formulaire inchangés (diff +490/−1185 sur l'existant).
- **Frontière GL** : 10 utilitaires GL-only déménagés de `src/utils/` vers
  `src/gl/utils/` (git mv purs, 42 fichiers d'imports) ; `glMascotCatalog` et
  `glMascotPackToVisit` restent (lus dynamiquement par le backend).

### Audit — Vague 2 : mutualisations structurelles (lots 4-5 partiels)

- **Cluster tasks** : 18 fonctions recopiées 2-3× entre `routes/tasks.js`,
  `tasks/proposals.js` et `tasks/assignments.js` regroupées dans
  `lib/tasks/taskQueries.js` (≈ −360 lignes) ; les réponses proposals/assign
  exposent désormais les mêmes champs espèces que `GET /api/tasks/:id`.
  **Transactions** : `POST /api/tasks` et `POST /proposals` atomiques
  (rollback remplaçant le nettoyage manuel qui laissait des jointures
  orphelines) ; `replaceTaskJoinRows`/`setTask*` acceptent un exécuteur (db/tx).
- **Cluster visit** : `nowIso`/`resolveVisitMapId`/`mapExists` (6 copies
  identiques) regroupés dans `lib/visitRouteShared.js` (≈ −72 lignes) ;
  rebuild-from-map de `visit/sync.js` en 1 SELECT `IN` par type de cible.
- **GL (chore(gl))** : paires Lore/non-Lore mutualisées —
  `lib/shared/questionQueryFactory.js`, `questionPoolFiltering.js`,
  `glossaryNormalization.js` ; les 6 fichiers `gl*` deviennent des adaptateurs
  minces, exports et messages inchangés à l'octet près (≈ −180 lignes).
- **Frontend** : boucle fetch/retry commune extraite dans
  `src/shared/fetchJsonWithRetry.js` (composée avec `apiTransport`, getters de
  jeton et gestion 401 injectés — stores de session ForetMap/GL inchangés) ;
  `api()`/`apiGL()` adaptateurs ; `src/shared/downloadAuthedFile.js` pour
  `downloadApiFile`/`downloadGlFile` (≈ −150 lignes dupliquées, dérive
  historique `jwt_expired` préservée et documentée).
- **Helpers backend** : `lib/helpers.js` supprimé (mort) ;
  `getPasswordMinLength`, `rethrowSlugConflict`, `normalizeOptionalString`
  (×10), `normalizeImportHeader` (×6), `parseId` (×9) unifiés vers leurs
  canoniques ; `routes/learning-links.js` (FM et GL) migrés vers
  `asyncHandler` (fin du reliquat O8 sur ces fichiers, ≈ −185 lignes).
- **Tests** : nouveaux tests unitaires purs (`gl-qcm-shared-helpers`,
  `tasks-queries-atomic`, `fetchJsonWithRetry`, `downloadAuthedFile`).

### Audit — Lot 2 (partie 1) : hygiène et code mort

- **Code mort supprimé** : `src/components/mascot/MascotAssetsLibraryPanel.jsx`
  (264 L, remplacé par le panneau Images unifié, plus importé nulle part) + son
  test ; shim `src/gl/utils/glQcmCatalogPanel.js` (ré-exports jamais consommés —
  test retargeté sur `src/shared/qcm/qcmCatalogPanelQuery.js`) ; variable
  `plantObj` inutilisée (`ZoneInfoModal`).
- **Mutualisation front** : copies locales de `usePrefersReducedMotion`
  remplacées par le hook partagé (`VisitMapMascotSpriteCut`,
  `MascotPackRenderPreview`) ; les 3 téléchargements authentifiés « à la main »
  (modèles d'import n3beurs/tâches, export stats) passent par
  `downloadApiFile` (meilleurs messages d'erreur 401/403/404) ;
  `canRename`/`canReplace` fusionnés (`MascotPackImagesPanel`).

### Audit — Lot 3 (partie 1) : élimination des N+1 SQL

- **Perf (stats prof)** : `GET /api/stats/all` et `/api/stats/export` n'exécutent
  plus « un SELECT `task_assignments` par élève » : agrégation unique
  `GROUP BY (élève, statut)` avec matching id OU (prénom, nom) conservé **en SQL**
  (collation `_ci` du matching legacy préservée). La synchro de rôle garde ses
  effets de bord (promotion) — pour ~200 élèves : ~400 requêtes → ~N lectures de
  rôle indexées + 5 requêtes.
- **Perf (groupes)** : `GET /api/groups` — enrichissement batch (`enrichGroupRows`,
  2 requêtes `IN`) au lieu de 2 `queryOne` par groupe.
- **Perf (zones)** : `GET /api/zones` ne charge plus toute la table `zone_history`
  (SELECT `IN` sur les zones retournées + regroupement en `Map`, fini le filtre
  JS en O(zones × historique)).
- **Perf (visite)** : `PUT /api/visit/tutorials` — 1 SELECT `IN` + 1 INSERT
  multi-valeurs au lieu d'un exists-check + INSERT par tutoriel (ordre et skip
  silencieux préservés).
- **Perf (projets)** : `setProjectZones/Markers/Tutorials` en DELETE + INSERT
  multi-valeurs (au lieu d'un INSERT par ligne) ; `validateProjectLinksForMap`
  en 2 requêtes `IN` (messages d'erreur et ordre de validation inchangés).

### Audit — Lots 0 & 1 : correctifs P0 et quick wins performance

- **Fix (P0)** : boucle infinie de re-renders dans `MarkerModal`/`ZoneInfoModal`
  (« Maximum update depth exceeded », CPU saturé modale ouverte) — chaîne
  `linkedTasks` → `studentAssignableTasks` mémoïsée + setState qui garde la
  référence quand la sélection ne change pas.
- **Fix (GL, concurrence)** : les 14 sites « INSERT événement → re-SELECT
  `ORDER BY id DESC LIMIT 1` » passent par un helper `insertGameEvent()`
  (`lib/glGameEvents.js`) basé sur `insertId` — sous charge, une requête ne peut
  plus émettre l'événement d'une autre. Corrige aussi la ré-émission d'un vieil
  événement par le `LIMIT 2` de la résolution d'action.
- **Fix (migrations)** : garde-fou au démarrage contre les numéros de migration
  dupliqués (doublons historiques 021/037 tolérés et désormais réellement
  appliqués lors d'une migration fraîche ; tout nouveau doublon fait échouer le boot).
- **Perf (BDD)** : migration `161_perf_indexes_audit.sql` — index
  `task_assignments`/`task_logs` (prénom+nom), `zone_history (zone_id, harvested_at)`,
  `observation_logs (created_at)` (snapshot mis à jour) ; suppression des
  `LOWER(col)=LOWER(?)` non sargables sur `users` (17 requêtes login/inscription/reset,
  collation `_ci` : sémantique inchangée, les index uniques redeviennent utilisables).
- **Perf (HTTP)** : `dist/assets/*` (noms hashés Rollup) servis en
  `Cache-Control: public, max-age=31536000, immutable` (`lib/staticCacheHeaders.js`) —
  fin des revalidations à chaque visite (dont ~2×1,9 Mo de wasm Rive) ; HTML toujours `no-store`.
- **Perf (front)** : chaîne de filtrage de `TasksView` entièrement mémoïsée
  (`visibleProjects`, `allFiltered`, partition par statut, `collectUsedLocationIds`) —
  les `useMemo` en aval ne sont plus invalidés à chaque frappe/toast.
- **Perf (front, polling)** : `fetchAll` (App.jsx) conserve la référence des tableaux
  quand le contenu re-téléchargé est identique (`src/utils/stableCollection.js`,
  égalité profonde) — plus de re-render global du DataContext à chaque poll sans
  changement ; handlers de la visite publique invitée stabilisés en `useCallback`
  (`React.memo(VisitView)` redevient effectif en mode invité).
- **Bundle** : le chunk visite n'importe plus via le barrel `map-views`
  (`ImageLightbox` et panneaux biodiversité importés directement) ; ré-exports
  morts de `foretmap-views.jsx` supprimés (ils tiraient `tasks-views` +
  `map-views` dans le chunk lazy biodiversité).
- **CI** : suite backend exécutée une seule fois (coverage) au lieu de deux ;
  job `quality` parallèle (lint + format + Vitest, sans MariaDB ni db:init) ;
  bloc `env` BDD hissé au niveau du job. Chunk `react-vendor` borné par regex
  (`react|react-dom|scheduler`).
- **Tests** : `tests/static-cache-headers.test.js`, `tests/migrations-guard.test.js`
  (garde-fou + présence des index), fake tx du test auto-move aligné sur `insertGameEvent`.

### Audit de code — simplification, mutualisation, performance

- **Documentation** : nouvel audit expert consolidé `docs/AUDIT_CODE_2026-07.md` (analyse en
  lecture seule, aucun comportement modifié) : correctifs P0 (boucle de re-renders
  MarkerModal/ZoneInfoModal vérifiée, `insertId` vs re-SELECT sur les événements GL, numéros de
  migration dupliqués), performance BDD (index manquants, `LOWER()` non sargable, N+1 de
  `stats /all`), performance frontend (identité des tableaux du polling, chaînes de mémoïsation,
  pan/zoom visite), mutualisation backend (cluster tasks ×3, paires Lore/non-Lore GL) et frontend
  (`api`/`apiGL`, modales carte, éditeurs QCM), infra/CI (cache immutable des assets, suite backend
  exécutée deux fois en CI), plan d'exécution en 7 lots avec garde-fous anti-régression.
- **Tests (fix GL)** : `tests-ui/gl/GLLoreFeuillets{EditorPanel,OverviewPanel}.test.jsx` alignés sur
  le rendu double desktop/mobile des listes (table + cartes) — `getAllByText`/`getAllByLabelText`
  au lieu de `getByText`/`getByLabelText` (CI verte rétablie, 3 tests réparés).

### GL — Activation de l'acquisition ③ + gestion admin des feuillets (vue d'ensemble & édition en masse)

- **Activation** : `gameplay.lore_feuillet_acquisition_enabled` passe à **`true` par défaut** (tous
  canaux) ; reste pilotable par partie via le toggle Réglages GL → Carnet de Sélène.
- **Vue d'ensemble admin** (nouvel onglet « Vue d'ensemble » du panneau Feuillets) : couverture par
  **canal d'acquisition** (zone / lien espèce / pool biome-plateau-pays / orphelins), **liens
  résolus en noms** d'éléments (espèce, pays), **rattachement par chapitre** (déduit : biome ∈
  chapitre / plateau / lien_pays), **stats de découverte** (parties/équipes), filtres et KPI.
  Endpoint `GET /api/gl/lore/admin/feuillets/overview`.
- **Édition en masse** : sélection multiple dans le panneau Feuillets + barre d'action (canal, réf,
  pays, biome, plateau, statut, coût gemme, gain cœur). Endpoint
  `POST /api/gl/lore/admin/feuillets/bulk` (patch partiel validé, biome hors-référentiel refusé).
  La liste admin expose désormais les colonnes de lien/plateau/effets.
- **Backend** : modules purs `lib/glFeuilletChannelClassify.js` (classification canal),
  `lib/glFeuilletChapterMembership.js` (rattachement chapitre), `lib/glFeuilletBulkPatch.js`
  (validation patch masse), `lib/glFeuilletAdminOverview.js` (assemblage vue d'ensemble) +
  `getZoneFeuilletCodes` (catalogue zones). Tous testés sans BDD.
- **Frontend** : `GLLoreFeuilletsOverviewPanel`, enrichissement de `GLLoreFeuilletsEditorPanel`
  (sélection + masse) et de `GLContentCatalogPanel` (onglet vue d'ensemble optionnel),
  util `glFeuilletChannelLabels`.
- **Tests** : `tests/gl-feuillet-admin-pure.test.js` (19 cas purs), tests UI
  (`GLLoreFeuilletsOverviewPanel`, bulk dans `GLLoreFeuilletsEditorPanel`, `glFeuilletChannelLabels`).
- **Doc** : `docs/API.md` (overview + bulk + colonnes liste).

### GL — Acquisition des feuillets rendue visible (popover générique + progression du carnet)

- **Frontend** : le flux d'acquittement générique (`GLLearnAndImport` : lore, écosystème, page
  de contenu, tutoriel) affiche désormais le popover « nouveau feuillet ! »
  (`GLFeuilletDiscoveryPopover`) quand la réponse `mark/:type/:ref` contient `feuilletRevealed` —
  même expérience que la découverte de zone/espèce. `GLLearnAndImport` transmet `gameId`/`teamId`
  au backend (corps de requête) quand ils sont connus (carnet, écosystèmes) ; à défaut le backend
  retombe sur le contexte JWT.
- **Carnet de Sélène** (`GLSeleneCarnetView`) : indicateur de progression
  « **N trouvés / M du chapitre** » et filtres **Tous / Trouvés / Verrouillés** (basés sur
  `progressStatus`). Masqués pour le MJ (accès intégral).
- **Tests** : `tests-ui/gl/GLLearnAndImport.test.jsx` (popover + transmission `gameId`/`teamId`)
  et compléments dans `tests-ui/gl/GLSeleneCarnetView.test.jsx` (compteur, filtre, masquage MJ).
- **Rappel** : l'acquisition ③ reste **désactivée par défaut**
  (`gameplay.lore_feuillet_acquisition_enabled`). Contrat d'API inchangé (`feuilletRevealed`
  déjà exposé).

### GL — Carnet : approfondissements onboarding, a11y clavier & e2e (B.8, B.9, E.13)

- **Onboarding (B.8)** : aide contextuelle `tab:my-journal` enrichie (geste clé « marquer appris →
  importer », sens du quiz, épinglage, recherche/filtre/tri) dans `data/gl/help.default.json` ;
  indice du bouton d'import renforcé (« … parfois après un court quiz »).
- **Accessibilité clavier (B.9)** : `GLLoreGlossaryPopover` passe au hook partagé `useDialogA11y`
  (focus initial, piège de focus, Échap, retour du focus au déclencheur) + `role="dialog"` /
  `aria-modal` / `aria-labelledby` ; `GLGlossaryPopover` et `GLSpellPopover` étaient déjà conformes.
  Nouveaux tests `GLLoreGlossaryPopover.test.jsx` et `GLSpellPopover.test.jsx`.
- **e2e (E.13)** : scénario Playwright du **flux d'import complet** (appris → importé → visible dans
  le fil, bouton « Voir ») via API pour le marquage/import et l'UI pour la vérification ; helper
  `seedGlGlossaryTerm` (`e2e/fixtures/gl.fixture.js`).

### GL — Carnet : lien « Voir » profond des espèces (B.5, complément)

- **Deep-link espèce** : « Voir » sur une fiche biodiversité importée ouvre désormais **la fiche
  précise** (et plus seulement l'onglet). Nouvel endpoint `GET /api/gl/species/:code` (`gl.read`,
  `{ species }` enrichi `glossaryTerms[]` + `learned`) ; `GLBiodiversityView` monte
  `GLSpeciesDetailModal` sur `speciesFocusCode` (récupération par code, indépendante de l'onglet
  biome). Complète les 6 autres types déjà profonds.
- **Tests** : `GET /species/:code` (200 + 404) dans `tests/gl-species-catalog.test.js`. `dist/` reconstruit.
- **Docs** : `docs/API.md` + `docs/GL_CARNET_JOUEUR.md` (le suivi « espèces » est levé).

### GL — Carnet : épinglage, onboarding, a11y & libellés harmonisés (B.7 pin, B.8, B.9, D.11, D.12, E.13)

- **Épinglage (B.7)** : articles et imports peuvent être **épinglés** ; les entrées épinglées
  remontent en tête du fil. Persistance serveur : colonne `pinned` (migration **`160`**,
  idempotente `ADD COLUMN IF NOT EXISTS`), routes `PUT /player-journal/me/articles/:id/pin` et
  `.../me/imports/:id/pin` (`{ pinned }`), booléen `pinned` exposé dans `GET /me`. Front : bascule
  d'épinglage sur chaque carte + tri « épinglés d'abord » (`GLPlayerJournalView`).
- **Libellés harmonisés (D.11)** : intitulés « marquer appris » unifiés sur **toutes** les pages
  (« Marquer comme appris » / « ✓ Appris ») au lieu des variantes « lu / étudié / découvert ».
- **Onboarding & textes (B.8, D.12)** : état vide du carnet remanié en guide d'amorçage (écrire un
  article **ou** marquer appris → importer), mention du **sens du quiz** (valider sa lecture).
- **Accessibilité (B.9)** : `aria-label` explicites sur les boutons des cartes et le bouton
  d'import (« Voir “…” », « Épingler “…” », « Retirer “…” », « Ajouter “…” »), `aria-pressed` sur
  les bascules d'épinglage ; surlignage visuel des entrées épinglées (contraste).
- **e2e (E.13)** : scénario Playwright du carnet (`e2e/gl-player-journal.spec.js`) — nouvel article
  + auto-save + barre de recherche (résultat / message d'absence).
- **Perf (E.14)** : évaluation documentée — pagination non justifiée à la volumétrie attendue
  (chargement unique + filtrage client), piste conservée pour plus tard.
- **Tests** : `GLPlayerJournalImportCard.test.jsx` (pin + a11y), tests backend d'épinglage
  (`gl-player-journal.test.js`). `dist/` reconstruit.
- **Correctif CI hérité de `main`** : isolation du test `gl-feuillet-acquisition.test.js` (ajout
  d'un `after()` nettoyant le feuillet seedé — le pool global polluait la seconde exécution de la
  suite `test`/`test:coverage` sur la BDD partagée) et compteur `ALLOWED_GAMEPLAY_SETTINGS` (27 → 30).

### GL — Carnet : recherche / filtre / tri du fil (B.7)

- **Fil du carnet** (`GLPlayerJournalView`) : nouvelle **barre d'outils** côté joueur —
  **recherche** texte (titre/corps des articles, titre/référence des imports), **filtre** par type
  d'entrée (tout / articles / imports) et **tri** (plus récent / plus ancien). Contrôles **côté
  client** sur les données déjà chargées (aucun appel réseau supplémentaire) ; message dédié quand
  aucune entrée ne correspond. _(Épinglage : non inclus — nécessite une persistance dédiée, en suivi.)_
- **Tests** : `tests-ui/gl/GLPlayerJournalViewFilter.test.jsx`. `dist/` reconstruit.
- **Docs** : `docs/GL_CARNET_JOUEUR.md` (section 1).

### GL — Carnet : vue MJ enrichie (C.10)

- **Consultation MJ** (`GLPlayerJournalReadModal`, lecture seule) enrichie pour l'accompagnement
  pédagogique : **récapitulatif** (nombre d'articles / d'imports), **filtre des imports par type**,
  et **export markdown** du carnet (`Exporter (.md)` : articles + liste des imports, hors
  illustrations). Aucune écriture, aucune nouvelle route (réutilise `GET /player-journal/players/:id`).
- **Tests** : `tests-ui/gl/GLPlayerJournalReadModal.test.jsx` (comptages, filtre, export). `dist/` reconstruit.
- **Docs** : `docs/GL_CARNET_JOUEUR.md` (section 6).

### GL — Carnet : validation écosystème resserrée & titres d'import frais (A.3 + A.4)

- **A.3 — validation `ecosystem`** : `resourceExists('ecosystem', slug)` valide désormais le biome
  contre la table de registre **`gl_biomes`** (source de vérité, cible de la FK `gl_chapter_biomes`)
  au lieu de la seule présence d'espèces. Un slug bien formé mais non enregistré est **rejeté**
  (404 à l'import / accusé). `resolveResourceTitle('ecosystem')` renvoie maintenant `gl_biomes.nom`.
- **A.4 — titres d'import à jour** : à l'affichage du carnet, le titre de chaque import est
  **re-résolu** depuis la source (reflète un renommage), avec **repli sur le titre figé** si la
  source est supprimée/non résolvable. Résolutions en parallèle dans `getPlayerJournalImports`.
- **Tests** : extension de `tests/gl-player-journal.test.js` (rejet slug écosystème inconnu,
  résolution/renommage/repli du titre d'import).
- **Docs** : `docs/GL_CARNET_JOUEUR.md` (section 4).

### GL — Carnet : encarts d'article hydratés (titre réel) (B.6)

- **Problème** : dans le corps d'un article, un encart `gl-journal-embed` (sortilège, espèce,
  glossaire, chapitre, module) s'affichait en **code brut** (« type · ref ») au lieu de son titre.
- **Solution** : nouvel endpoint `POST /api/gl/player-journal/embeds/resolve` (batch, joueur **et**
  MJ) qui résout le **titre réel** de chaque encart (`gl_spells.nom`, `gl_species.nom_commun`,
  `gl_glossary_terms.terme`, `gl_chapters.title`, module statique). Côté client, le hook
  `useGlJournalEmbedTitles` injecte ces titres en attribut `data-gl-title` sur le HTML **déjà
  sécurisé** (aperçu d'article + lecture MJ) ; le CSS affiche le vrai titre, avec **repli** sur
  « type · ref » si non résolu. **Le markdown stocké n'est jamais modifié** (round-trip d'édition
  intact).
- **Tests** : `tests-ui/gl/useGlJournalEmbedTitles.test.jsx` (hydratation client) + extension de
  `tests/gl-player-journal.test.js` (endpoint `embeds/resolve`). `dist/` reconstruit.
- **Docs** : `docs/GL_CARNET_JOUEUR.md` (section Encarts) + `docs/API.md`.

### GL — Carnet : lien « Voir » profond & état « déjà importé » (B.5 + A.2)

- **A.2 — état « déjà dans mon journal »** : le bouton d'import reflète l'état **dès le chargement**
  de la page de l'élément (plus besoin de cliquer). Nouvel endpoint léger
  `GET /api/gl/player-journal/me/imports/refs` (liste des `(resourceType, resourceRef)` importés,
  sans charger tout le carnet) ; `GLLearnAndImport` le consomme et `GLJournalImportButton` bascule
  en « ✓ Dans mon journal » même quand l'info arrive en asynchrone.
- **B.5 — lien « Voir » profond** : « Voir » ouvre désormais l'**élément précis** dans sa vue et
  pas seulement l'onglet. `importTargetNav` produit une cible `{ tab, focusType, focusRef }` ;
  `AppGL` pose un focus (nouveaux états `ecosystemFocusSlug` / `tutorialFocusId` / `feuilletFocusCode`,
  en plus des focus glossaire/lore existants) puis navigue, et chaque vue ouvre l'élément via un
  `useEffect` (écosystème → onglet du biome, tutoriel → lecture, feuillet → lecteur, glossaire/lore →
  terme, page → onglet). **Espèces** : dégradation gracieuse (ouvre l'onglet Biodiversité — pas
  d'endpoint `GET /species/:code`), noté en suivi.
- **Tests** : `tests-ui/gl/glJournalImportMeta.test.js` (cibles de navigation), extension de
  `tests/gl-player-journal.test.js` (endpoint `/me/imports/refs`). `dist/` reconstruit.
- **Docs** : `docs/GL_CARNET_JOUEUR.md` (sections « État déjà importé » + « Lien Voir profond ») et
  `docs/API.md` (endpoint refs).

### GL — Carnet : quiz-gating des nouveaux types marquables (A.1)

- **Vérification & documentation** : le conditionnement par quiz (« marquer appris » exige un QCM)
  couvre désormais explicitement **les 7 types marquables** (`GL_MARKABLE`), dont `ecosystem`,
  `feuillet`, `content_page` et `lore_glossary`, au même titre que `species`/`glossary`/`tutorial`.
  Le core (`resourceQuestionGatingCore`, routes `learning`/`learning-links`, composant générique
  `GLLearningAcknowledgeButton`) acceptait déjà ces types ; ce lot **verrouille et documente** le
  flux de bout en bout (consulter → quiz → confirmer → appris), sans modification du comportement.
- **Docs** : nouvelle section « Configurer un gating par quiz (prof/MJ) » dans
  `docs/GL_CARNET_JOUEUR.md` (marche à suivre API `learning-links`, exemple de lien, réglages
  `gating.*`) ; liste de types corrigée dans `docs/API.md` (endpoint `learning/gating/challenge`,
  ajout de `learning/mark/:resourceType/:ref`).
- **Tests** : `tests/gl-learning-gating-newtypes.test.js` (challenge + accusé générique `mark` pour
  `content_page` et `ecosystem` : 403 sans bonne réponse, 200 après, accusé persisté).
### GL — Backfill biome des feuillets « cop-bio » (couverture d'acquisition)

- **Données** : migration idempotente `159_gl_feuillet_copbio_biome_backfill.sql` — pose
  `biome_slug` sur les 8 feuillets `cop-bio-<biome>` (savane, sahara, foret_mediterraneenne,
  foret_caducifoliee, landes, taiga, toundra, desert_froid) d'après le suffixe de leur code, sans
  écraser une valeur existante. Ces feuillets copiste, orphelins de tout canal, deviennent
  atteignables via le **pool du chapitre** (biome). Réduit les orphelins du corpus de production de
  **40 à 32**. Cf. `docs/AUDIT_FEUILLETS_ACCES.md` §11.6.

### GL — Socle d'acquisition des feuillets par consultation (stratégie ③)

- **Évolution métier** : pose le socle permettant qu'un élément consultable du site donne un
  feuillet. À la **première consultation gatée réussie** (QCM lié passé), le joueur gagne un
  feuillet du **pool du chapitre** **pour son équipe** ; le **nom du découvreur** est mémorisé et
  affiché dans le carnet (« Découvert par … »). Acquisition **au niveau équipe**, carnet
  **cumulatif par joueur**, **sans filet de clôture** (exhaustivité non garantie, choix produit).
- **Base de données** : migration `157_gl_feuillet_attribution.sql` — colonnes
  `discovered_by_player_id`, `discovered_by_name`, `discovered_source` (texte libre) sur
  `gl_game_feuillet_states`, posées une seule fois (premier découvreur).
- **Backend** : moteur générique `lib/glFeuilletAcquisition.js`
  (`awardFeuilletFromConsultation` + `commitFeuilletDiscovery`), pool de chapitre
  `lib/glFeuilletChapterPool.js` (biome ∈ chapitre **ou** `plateau_number` **ou** `lien_pays`),
  mapping biome→pays extrait en module pur `lib/glBiomePays.js`. Branchement sur le flux
  d'acquittement gaté (`routes/gl/learning.js` : `mark/:type/:ref`, glossaire, tutoriel) →
  `feuilletRevealed?`. Canal **espèce** existant enrichi de l'attribution.
- **Réglages plateforme** : `gameplay.lore_feuillet_acquisition_enabled` (défaut **off**) et
  `gameplay.lore_feuillet_acquisition_channels` (liste, défaut = tous), pilotables dans
  **Réglages GL → Carnet de Sélène**.
- **Frontend** : « Découvert par … » dans le carnet ; toggle + canaux dans les réglages
  (`GLSettingsView.jsx`, `glSettingsForm.js`).
- **Tests** : unitaires purs (`gl-feuillet-acquisition-pure` : pool pays/clause, canaux) +
  intégration (`gl-feuillet-acquisition` : attribution, pool, idempotence).
- **Doc** : `docs/API.md` (learning `feuilletRevealed`, réglages), `docs/AUDIT_FEUILLETS_ACCES.md`
  (§11 décisions + socle). Reste à câbler les canaux `scene`/`reponse`/`message` et affiner via le corpus.

### GL — Feuillets non lisibles par défaut (anti-spoiler du carnet)

- **Évolution métier** : côté joueur, les feuillets du carnet de Sélène ne sont **plus lisibles par
  défaut**. Le joueur ne voit que la **liste** des feuillets associés aux biomes des chapitres
  auxquels il a **participé** (parties `live`/`paused`/`ended`). Un feuillet ne devient **consultable**
  qu'une fois **trouvé** sur le site (p. ex. traversée d'une zone feuillet). Les autres moyens
  d'obtention seront détaillés ultérieurement.
- **Backend** (`routes/gl/lore.js`) : `GET /api/gl/lore/feuillets` et `GET /api/gl/lore/feuillets/:code`
  scopent désormais la liste joueur **côté serveur** (biomes des chapitres joués ∪ feuillets trouvés)
  et renvoient un **aperçu verrouillé** (titre + champs configurés, `texte`/`displayText`/images `null`)
  tant que le feuillet n'est pas trouvé ; `:code` répond `404` hors périmètre. **MJ/Admin** : accès
  intégral inchangé. Nouveaux helpers `resolveAccessiblePlayerBiomes`, `loadPlayerFeuilletStates`,
  `isFeuilletFound` (`lib/glLoreFeuillets.js`) et module `lib/glLoreFeuilletPreview.js`.
- **Réglage plateforme** : `gameplay.lore_feuillet_preview_fields` (liste, défaut `["incipit"]`) pilote
  les champs révélés en aperçu (parmi `incipit`, `ideeCle`, `imageUrl`, `ancrageScientifique`).
  Réglable dans **Réglages GL → Carnet de Sélène**. Migration idempotente `158_gl_lore_feuillet_preview_fields.sql`.
- **Frontend** (`GLSeleneCarnetView.jsx`) : feuillet verrouillé cliquable (badge 🔒) affichant l'aperçu
  + un rappel « trouvez-le sur la carte » ; aucune vignette ni texte tant qu'il n'est pas révélé.
  Sélecteur des champs d'aperçu dans `GLSettingsView.jsx` (`glSettingsForm.js`).
- **Tests** : unitaires (`gl-lore-feuillet-preview`) + intégration (`gl-lore-feuillet-access` :
  scoping biomes, masquage/aperçu, révélation via réglage, accès MJ intégral, `404` hors périmètre).
- **Doc** : `docs/API.md` (feuillets joueur/MJ, nouveau réglage), `docs/AUDIT_FEUILLETS_ACCES.md`.
### GL — Carnet personnel : import d'éléments appris

- **Le joueur peut faire figurer dans son carnet les éléments du site qui l'intéressent** :
  feuillets de Sélène, écosystèmes (biotope/biocénose), fiches biodiversité (espèces), tutoriels,
  définitions (glossaire écologie **et** glossaire lore) et pages de contenu. L'import se fait
  **depuis la page de l'élément**, une fois celui-ci **marqué appris / lu / découvert** — marquage
  éventuellement **conditionné par un quiz** à réussir (système de gating existant).
- **Les éléments importés s'affichent dans le carnet en ordre chronologique**, mêlés aux articles,
  avec leur **vrai titre** et un **lien « Voir »** vers leur onglet d'origine ; ils sont retirables.
- **Système « appris » étendu** aux nouveaux types : accusé générique
  `POST /api/gl/learning/mark/:resourceType/:ref`, types ajoutés dans `GL_MARKABLE` /
  `GL_RESOURCE_TYPES` / `LEARNING_TARGET_TYPES`, registre d'existence/titre `lib/glLearnableResources.js`.
- **Nouvelle table `gl_player_journal_imports`** (migration `156`) ; endpoints
  `POST`/`DELETE /api/gl/player-journal/me/imports`, imports inclus dans `GET /me` et la lecture MJ.
- **Front** : contrôle réutilisable `GLLearnAndImport` (marquer + importer) et `GLJournalImportButton`,
  câblés sur écosystèmes, biodiversité, glossaires, tutoriels, feuillets et pages de contenu ;
  timeline `GLPlayerJournalView` fusionnant articles et imports, carte `GLPlayerJournalImportCard`.

### GL — Carnet personnel : refonte en articles

- **Le carnet personnel du joueur fonctionne désormais par « articles ».** Le joueur clique sur
  « Nouvel article » et saisit ce qu'il souhaite : un titre optionnel, un texte markdown, des
  images associées au texte — ou tout simplement des médias (article « média seul », corps vide).
  Chaque article conserve ses horodatages de **création** et de **dernière modification**.
- **Nouveau modèle de données** (migration `155`) : tables `gl_player_journal_articles` et
  `gl_player_journal_article_assets` (médias rattachés à l'article). L'ancien modèle mono-document
  (`gl_player_journals` / `gl_player_journal_assets`) est supprimé — on repart de zéro.
- **API** : `GET /me` renvoie la liste d'articles ; `POST/PUT/DELETE /me/articles[/:id]` pour le
  CRUD ; `POST/DELETE /me/articles/:id/assets[/:assetId]` pour les médias par article ;
  `GET /players/:id` (MJ) renvoie les articles du joueur. Les plafonds optionnels
  (`gameplay.player_journal_max_chars/assets`, `0` = illimité) s'appliquent désormais **par article**.
- **UI** : `GLPlayerJournalView` (fil d'articles + « Nouvel article ») avec un éditeur par article
  `GLPlayerJournalArticleCard` (auto-save, images, encarts, aperçu) ; lecture MJ
  (`GLPlayerJournalReadModal`) refondue en liste d'articles.

### ForetMap — Zones spéciales désormais éditables

- **Évolution** : les zones spéciales (bâtiments, mares, ruches, compostage…) étaient jusqu'ici
  entièrement verrouillées côté interface (aucun onglet « Modifier », ni actions Copie/Supprimer,
  ni édition du contour), alors que le backend ne les protégeait pas. Elles sont maintenant
  **pleinement éditables par les profs** au même titre qu'une zone normale.
- **Frontend** : l'onglet « ✏️ Modifier », les actions Copie/Supprimer et l'édition du contour
  sont réaffichés pour les zones spéciales (`ZoneInfoModal`, `ZoneInfoModalHeader`). Ajout d'une
  case à cocher **« Zone spéciale (bâtiment / infrastructure) »** dans le formulaire d'édition
  et dans le formulaire de création (`ZoneDrawModal`) pour **basculer** le statut ou **créer**
  directement une zone spéciale. La duplication préserve le drapeau `special`.
- **Backend** : `PUT /api/zones/:id` prend désormais en compte le champ `special` (bascule dans les
  deux sens ; omis = valeur inchangée) et `POST /api/zones` accepte `special` à la création
  (défaut `0`). Nouveau helper `normalizeSpecialFlag` (booléen / nombre / chaîne → bit MySQL).
  Réponse `POST` uniformisée (`special` renvoyé en booléen comme `GET`/`PUT`).
- **Inchangé** : les zones spéciales restent exclues des associations tâches/tutoriels et de la
  section biodiversité de la fiche visite (choix de périmètre).
- **Tests** : backend (création spéciale, bascule du drapeau dans les deux sens, préservation
  quand `special` est omis) ; UI (case à cocher `ZoneDrawModal`, actions prof sur zone spéciale).
- **Doc** : `docs/API.md` (colonnes `special` de `POST`/`PUT /api/zones`).
### ForetMap — Plein écran carte visite : les zones ne s'étirent plus hors du fond de carte

- **Correctif** : en plein écran (immersion) pendant la visite, le calque `visit-map-fit-layer`
  était forcé à `100% × 100%` de la scène au lieu du rectangle réel de l'image
  (`object-fit: contain`). Le SVG des zones (`preserveAspectRatio="none"`) ainsi que les repères
  et la mascotte, positionnés en `%` de ce calque, s'étiraient donc sur toute la scène letterboxée
  sans tenir compte de la taille du fond de carte.
- **Correction** : le calque est désormais **toujours** aligné sur le rectangle « contain » de
  l'image (`visitMapFit`, déjà recalculé pour le plein écran via `applyVisitMapFit(..., { fullscreen: true })`),
  comme en mode normal. Zones, repères et mascotte restent alignés sur le fond de carte, sans
  distorsion, en plein écran comme en affichage classique.

### ForetMap — Mode visite/découverte : ne se relance plus qu'à la première découverte

- **Correctif** : la visite guidée se relançait à chaque connexion (voire à chaque visite d'onglet)
  au lieu de la seule première fois. L'onglet n'était marqué « vu » qu'à la fin/fermeture explicite du
  parcours, via un `setSeen` **imbriqué dans l'updater de `setActive`** (`nextStep`/`stopTour`) — un
  effet de bord dans un updater, non fiable : l'écriture `localStorage` (clé `foretmap_discovery_seen_v1`)
  pouvait ne jamais se produire, si bien qu'aucun onglet n'était réellement mémorisé.
- **Correction** : l'onglet est désormais marqué « découvert » **dès le démarrage** de la visite
  (`useDiscoveryTour.startTour`), avec une écriture `localStorage` hors updater. Quitter la page,
  recharger ou se reconnecter ne relance plus le parcours d'un onglet déjà présenté ; `stopTour`/`nextStep`
  se contentent de fermer. Nouveau test : marquage « vu » dès le démarrage (avant la fin du parcours).

### ForetMap — Tests : stabilité BDD partagée et build local

- **Correctif tests** : `repairSystemN3beurParticipationDefaults()` rétablit forum / commentaires
  sur les paliers `eleve_*` système après `initSchema()` (pollution RBAC entre fichiers de test).
- **E2E GL** : sélecteurs moins ambigus (intro, carnet joueur « Enregistré »).
- **Backend** : tolérance arrondi coords plateau GL ; reset gating learning-links ; seed tutoriel
  `arrosage-potager` ; filtre QCM standard dans le catalogue admin.
- **Build** : régénération complète `dist/` (Vite prod + sync packs).

### GL — Carnet personnel : plus de limite explicite par défaut

- **Le carnet personnel du joueur n'impose plus de plafond de caractères ni de nombre
  d'illustrations par défaut.** Les réglages `gameplay.player_journal_max_chars` et
  `gameplay.player_journal_max_assets` valent désormais **`0` = illimité** (nouveau défaut),
  et la validation backend comme le frontend ne bloquent plus la saisie ou l'ajout d'images
  tant qu'aucun plafond n'est défini.
- **Plafond toujours réglable** : un MJ/admin peut fixer une limite optionnelle
  (`max_chars` : 500–200000, `max_assets` : 1–200) via les réglages GL ; remettre `0` rétablit
  l'illimité. Le compteur affiché dans le carnet devient purement informatif lorsqu'aucun
  plafond n'est défini.
- **Migration `154_gl_player_journal_unlimited_default.sql`** : bascule à `0` les installations
  encore réglées sur l'ancien défaut seedé (20000 / 30), en conservant toute valeur déjà
  personnalisée.
### GL — Plateau : popovers de repères au-dessus des dés et boutons en icônes

- **Popovers d'arrivée (QCM / effet de repère) lisibles à l'arrivée du pion.** Le lanceur de dés
  passait au-dessus (z-index élevé) et masquait le popover du repère ; un même clic refermait alors
  les deux fenêtres, donnant l'impression que le popover s'ouvrait puis se fermait aussitôt. Le
  lanceur de dés se **referme automatiquement** dès qu'un popover d'arrivée s'ouvre
  (`GLVirtualDiceDock` : prop `forceClose`, câblée via `GLBoardChrome`/`GLGameBoard` et le plateau
  démo invité), laissant le popover du repère seul au premier plan.
- **Boutons du plateau réduits à leur icône.** Les boutons d'action superposés à la carte
  (sortilège, plein écran, dés, son, fermeture plein écran) n'affichent plus le libellé texte à côté
  de l'icône ; le libellé reste disponible en infobulle (`title`) et pour les lecteurs d'écran
  (`aria-label`).

### GL — Sortilèges : suppression complète même si liés à un chapitre

- **`DELETE /api/gl/admin/spells/:code` supprime désormais un sort lié à un ou plusieurs chapitres.**
  Auparavant l'API renvoyait `409` et exigeait de retirer manuellement le sort de chaque chapitre.
  La suppression retire d'abord les liens `gl_chapter_spells` (FK `ON DELETE RESTRICT`) puis le sort,
  le tout dans une **transaction** ; les chapitres concernés subsistent et perdent simplement ce sort
  de leur liste. La réponse expose `{ ok, deleted, unlinkedChapters }` (nombre de chapitres déliés),
  et le panneau d'administration des sortilèges en informe l'opérateur (confirmation + message).

### ForetMap — Carte `lyautey` : tracé fidèle et étiqueté des bâtiments

- **`sql/zones_lyautey_batiments.sql` retravaillé** sur la vue OpenStreetMap **étiquetée** du
  campus : 12 zones nommées d'après le plan réel (Bâtiments G, D, S, M, I, L, K, H + Salle
  Delacroix, Infirmerie, CDI, Vie scolaire), polygones en quads suivant l'inclinaison du quartier
  (au lieu des rectangles génériques de la 1re passe). Ids parlants (`lyautey-bat-g`,
  `lyautey-cdi`…) ; par sécurité, l'import ne remplace pas automatiquement les anciens
  `lyautey-bat-01..12` s'ils existent déjà, car ils peuvent porter des liens métier.
- ⚠ Les coordonnées (`{xp,yp}`, %) sont relatives au **cadrage de l'image OSM** : le fond de la
  carte `lyautey` doit être cette image pour que les zones s'alignent (sinon re-mapper).

### ForetMap — Tâches : retrait élève sans promotion de rôle parasite

- **Correctif** : `ensureStudentPermission` (assignations et propositions) n'appelait plus
  `syncStudentPrimaryRoleFromProgress` avant le contrôle de permission — ce qui pouvait promouvoir
  un élève (rôle groupe / progression) et faire échouer son propre `unassign` faute de
  `tasks.unassign_self` sur le nouveau profil.
- Résolution du rôle via groupe (`resolveDefaultRoleForStudent` + `setPrimaryRole`) uniquement si
  la permission manque encore après synchro groupe.
- Tests : `tests/api.test.js` (non-régression unassign), `e2e/tasks-unassign-flow.spec.js`
  (parcours simplifié via assignation prof).

### ForetMap — Visite : suppression carte propagée à la couche visite (fin des repères/zones « fantômes »)

- **Correctif** : supprimer une zone (`DELETE /api/zones/:id`) ou un repère (`DELETE /api/map/markers/:id`)
  **côté carte** ne retirait pas la cible **visite** de même `id`. La ligne `visit_zones` / `visit_markers`
  (avec son nom/sa position figés au moment de la synchro), ses médias et la progression vue survivaient,
  si bien que **l'onglet Visite continuait d'afficher des repères/zones obsolètes** déjà retirés de la
  carte (`GET /api/visit/content` lit la couche visite, jointure `LEFT JOIN` tolérante aux orphelins).
- La suppression carte cascade désormais sur la couche visite : ligne `visit_zones` / `visit_markers`,
  médias `visit_media` (fichiers disque + lignes) et progression (`visit_seen_students`,
  `visit_seen_anonymous`). Logique de nettoyage factorisée dans **`lib/visitTargetCleanup.js`**
  (`deleteVisitTargetCascade`), réutilisée par les suppressions côté visite (`routes/visit/zones.js`,
  `routes/visit/markers.js`) — source unique, plus de duplication.
- **Robustesse** : les suppressions carte + couche visite sont exécutées dans une même transaction
  SQL, afin d'éviter une zone/repère supprimé côté carte mais un nettoyage visite partiellement
  appliqué en cas d'erreur BDD.
- Pour réaligner d'un coup une visite déjà désynchronisée (renommages/déplacements antérieurs),
  l'outil prof **« Tout réaligner sur la carte »** (`POST /api/visit/rebuild-from-map`) reste la voie
  recommandée (textes/médias conservés par `id`).
- Tests : `tests/visit-target-cleanup.test.js` (cascade zone/repère, best-effort fichiers, no-op type
  inconnu). Docs : `docs/API.md` (notes `DELETE /api/zones/:id` et `DELETE /api/map/markers/:id`).
### ForetMap — Carte `lyautey` : zones « bâtiments » du centre importables

- **Nouveau fichier importable `sql/zones_lyautey_batiments.sql`** : 12 zones polygonales
  représentant les bâtiments de la partie centrale du campus (carte `lyautey`), prêtes à charger
  en base (`mysql … < sql/zones_lyautey_batiments.sql`). Import **idempotent** (ids stables
  `lyautey-bat-01..12`, `ON DUPLICATE KEY UPDATE`), couleur gris semi-transparent pour distinguer
  les bâtiments des zones de culture.
- **Générateur `scripts/gen-zones-lyautey-batiments.js`** : les coordonnées (sommets en % de
  l'image, `{xp,yp}`) sont relevées visuellement sur la capture de la carte (premier jet) ; pour
  les affiner, éditer le tableau `BATIMENTS` puis relancer le script — le SQL est régénéré avec un
  JSON `points` toujours valide.

### ForetMap — Cartes : étiquettes nettes au zoom (fin de la pixellisation)

- **Texte et emojis ne pixellisent plus en zoomant.** Les deux cartes (carte des tâches et plan de
  visite) appliquaient le zoom via un calque `transform: scale()` marqué `will-change: transform` en
  permanence : le calque était mis en cache GPU à l'échelle 1× puis **agrandi** → texte SVG flou et
  emojis couleur (glyphes bitmap) pixellisés à fort zoom.
- `will-change: transform` n'est désormais posé **que pendant les gestes** (fluidité), puis **retiré
  au repos** : le navigateur re-pixellise alors le contenu (texte + repères + emojis) à l'échelle
  réellement affichée → étiquettes nettes une fois le zoom posé. Carte des tâches : pilotage impératif
  dans `useMapGestures` (activé sur molette/pinch/pan/boutons, retiré au commit/ajustement),
  `MapViewWorldLayer` ne pose plus le `will-change` en dur. Plan de visite : `markVisitInteracting()`
  (pose + retombée après ~180 ms d'inactivité), `.visit-map-world` sans `will-change` statique.
### Mascotte — Import souple : auto-déclaration des comportements personnalisés

- **Problème** : un pack mascotte révisé (forme objet `stateFrames`) comportant des états
  d'animation **non canoniques** non déclarés dans `customStates` (ex. `dig`, `campfire`,
  `idle_back`, `treasure`…) était refusé à l'import (« Archive lisible mais pack invalide »),
  alors que la forme `states[]` les auto-déclarait déjà. L'intégralité du pack devenait
  inimportable pour un seul oubli de déclaration à la source.
- **Correctif** : l'import d'archive visite (`POST …/import` et `…/import/analyze`) déclare
  désormais automatiquement en `customStates` toute clé `stateFrames.<état>` non canonique non
  déclarée, à condition de respecter le format des clés (`^[a-z0-9]+(?:[-_][a-z0-9]+)*$`, ≤ 40
  car.). Un libellé prof est dérivé de la clé (`idle_back` → « Idle back »). Option opt-in
  `autoDeclareCustomStates` de `parseMascotPack`/`validateMascotPack` (`src/utils/mascotPack.js`,
  miroir `lib/visit-pack/`).
- **Studio inchangé (validation stricte)** : `POST`/`PUT` packs n'activent pas l'option — une clé
  d'état inconnue y reste une erreur (faute de frappe révélée).
- **Remontée UI** : les états auto-déclarés sont exposés dans `autoDeclaredStates` et `warnings`
  (analyse + import), pour informer le prof des comportements créés.
- Tests : `tests/mascot-pack.test.js` (auto-déclaration souple, contraste strict/souple,
  préservation des `customStates` existants). Docs `docs/MASCOT_PACK.md`, `docs/API.md`.

### Mascotte — Runtime commun mono+multi : `useMascotTransientState` (étape 7 convergence)

- **Hook partagé** `src/hooks/useMascotTransientState.js` : factorise la mécanique « état
  transitoire + timeout + garde anti-idle » des deux runtimes mascotte, **paramétrée par arité**
  via une *clé* (un timer par clé). Le runtime **mono** (visite) utilise une clé fixe ; le runtime
  **multi** (plateau GL) utilise l'identifiant d'équipe.
- **Consommé par** `useVisitMascotStateMachine` (`triggerMascotTransientState` /
  `resetMascotTransientState`) **et** `useGLBoardMascotMotion` (`triggerTransient(teamId, …)`). La
  logique dupliquée (refs de timeout, garde anti-idle, clamp de durée, nettoyage au démontage)
  disparaît des deux côtés.
- Chaque produit ne fournit que ses spécificités : `resolveState` (visite :
  `resolveVisitMascotState({ extraStates })` ; GL : trim brut), `idleState`, durées (visite `1500`,
  GL `900`) et les applicateurs d'état (visite `setState` ; GL `patchMotion`).
- **Comportement observable strictement préservé** : priorité `transient > happy > walking`,
  localStorage de l'id mascotte, aperçu/reset (visite) ; `walking`/`happy`/`faceRight`/`snapCenter`,
  timers de déplacement, ambiant per-équipe et états personnalisés (GL).
- Tests : `tests-ui/hooks/useMascotTransientState.test.js` (garde anti-idle, arité N, re-déclenche,
  reset, résolution de durée, identité stable) ; suites existantes (mono / GL / ambiant) restées
  vertes. Docs `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte — Write-side WYSIWYG : forme unifiée `states[]` (export/import archive + aperçu)

- **Décision (Option 1, faible risque)** : le modèle interne de l'éditeur visuel reste en forme
  **canonique** (`stateFrames`) ; on ajoute la **lecture/écriture** de la forme unifiée `states[]`
  aux frontières (export/import archive + aperçu), sans aucune régression du modèle interne.
- **Import d'archive rétro-compatible (les deux formes)** : `rewriteVisitPackForServerImport`
  accepte désormais un `pack.json` en forme **`states[]`** (réécrit les refs d'assets dans chaque
  entrée et conserve la forme tableau ; `normalizeUnifiedStates` la désucre à la validation) **et**
  la forme historique `stateFrames`. La logique de réécriture des refs est factorisée
  (`rewriteImportedStateSpec`).
- **Export d'archive en forme `states[]` (opt-in)** : `buildVisitExportArchive({ unified: true })`
  émet `pack.json` en `states[]` (helper CJS `visitPackToUnifiedForm`, miroir de
  `mascotPackToUnifiedStates`) + `manifest.statesForm`. Exposé via `GET …/export.zip?unified=1` et
  un bouton **« Exporter ZIP (states[]) »** au studio (`MascotPackListAside`).
- **Aperçu « forme unifiée `states[]` »** (lecture seule + copie) dans l'éditeur WYSIWYG
  (`MascotPackWysiwygEditor`) : réintégrable tel quel à l'import / onglet JSON.
- **Round-trip sans perte** : export `states[]` → import → `normalizeUnifiedStates` re-dérive
  `customStates` à partir des clés non canoniques. Persistance serveur inchangée (forme canonique).
- Tests : `tests/mascot-pack-archive.test.js` (import `states[]`, export `unified`,
  `visitPackToUnifiedForm`), `tests-ui/components/mascot/MascotPackListAside.test.jsx` (bouton
  dédié), `tests-ui/components/MascotPackWysiwygEditorUnified.test.jsx` (aperçu). Docs
  `docs/MASCOT_PACK.md`.

### Mascotte — Retrait du pont GL→visite : adaptateur mince (étape 6 convergence)

- **`glMascotPackSpriteCutToVisitValidation` réduit à un adaptateur mince** : il ne fait plus que
  la **spécificité GL** (résoudre les indices `frames` → `srcs` depuis `assets`, remapper les clés
  d'état via `mapGlMascotStateKeyToVisit`, porter les `triggers` GL vers `customTriggers`, fournir
  les defaults de cadrage absents du schéma GL). Il produit désormais la **forme unifiée `states[]`**
  et **délègue entièrement** à `validateMascotPack` (désucrage via `normalizeUnifiedStates` +
  clamp/defaults d'animation `fps`/`pixelated`/`displayScale` via `expandMascotPackToSpriteCut`).
- **Suppression de la logique dupliquée** : construction manuelle de `stateFrames`, des libellés
  d'états personnalisés et des `customStates`, ainsi que les defaults `fps`/`pixelated`/`displayScale`
  re-codés dans le pont — désormais un **seul chemin** (le cœur visite).
- **Non cassant** : `expandGlMascotPackSpriteCut`, la prévisualisation GL
  (`GLMascotPackPreviewPanel`, `GLMascotPackWysiwygEditor`), `buildGlMascotExtraCatalogEntries` et le
  catalogue serveur (`lib/glMascotPackCatalog.js`) fonctionnent à l'identique (états personnalisés +
  triggers + dialogProfile préservés).
- **Collision de clés d'état** : l'adaptateur dédoublonne par clé visite (`Map`) pour préserver le
  comportement « **dernière occurrence gagne** » (libellé + frames) de l'ancien pont — sinon le
  désucrage `normalizeUnifiedStates` (première occurrence) aurait changé le libellé retenu. Couvert
  par un test de non-régression dédié.
- Tests : `tests/gl-mascot-pack-to-visit.test.js` étendu (mêmes assertions + vérification que les
  defaults/clamp viennent du seul chemin visite). Docs `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte — Schéma de pack unifié `states[]` en lecture (étape 5 convergence)

- **Forme `states[]` acceptée côté FM** (alignée sur GL) : un pack peut déclarer ses états en
  tableau `[{ key, label?, files?|srcs?, fps?, frameDwellMs? }]`. `normalizeUnifiedStates`
  (`mascotPack.js`) désucre cette forme vers `stateFrames`/`customStates` **avant validation** —
  validation/expansion/runtime inchangés. Une entrée à clé non canonique **déclare** l'état.
  Helper inverse `mascotPackToUnifiedStates`. **Non cassant** : packs historiques toujours valides,
  persistance en forme canonique. Miroir `lib/visit-pack/` resync.
- **Write-side studio (JSON)** : l'onglet **JSON** du studio accepte la forme `states[]` à
  l'application (désucrée) et offre un bouton **« Forme unifiée states[] »** (`packToUnifiedForm`)
  pour réécrire le brouillon. Modèle de l'éditeur visuel et persistance restent canoniques.
- Tests : `tests/mascot-pack.test.js` (states[] désucré, clé custom mal formée refusée, round-trip),
  `tests-ui/utils/mascotPackEditorModelUnified.test.js` (`packToUnifiedForm` + round-trip).
  Docs `docs/MASCOT_PACK.md` et `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte — Émetteurs d'événements déclaratifs + l'interactionProfile agit sur le plan live (étape 4 convergence)

- **`emitMascotEvent(eventKey)`** (`visit-views.jsx`) : les sites d'émission (déplacement long/très
  long, marquage « vu », ouverture zone/repère, tap) émettent un événement nommé résolu via
  `resolveVisitMascotInteraction` (profil du pack, défaut = comportement historique) au lieu d'états
  câblés en dur.
- **Correctif notable** : le **profil d'interaction (`interactionProfile`) d'un pack agit désormais
  sur le plan de visite *live*** — il n'avait auparavant d'effet qu'en aperçu studio (les vues
  ignoraient le profil et jouaient des états/durées figés). Comportement par défaut inchangé (les
  défauts du profil correspondent aux valeurs historiques) ; contrat verrouillé par
  `tests/visit-mascot-interaction.test.js`.
- Docs `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte — Moteur de comportement unifié FM/GL (étape 3 convergence)

- **Moteur partagé** `src/utils/mascotBehaviorEngine.js` : `resolveTriggerAction(entry, trigger)` →
  action produit-agnostique (`state`, `durationMs`, `dialog`, `everyMs`), `getAmbientActions` /
  `getTapActions`, et `runBehaviorAction(action, { playState, showDialog })`. La visite
  (`useAmbientMascotBehavior` + tap) consomme désormais ce moteur au lieu d'une logique ad-hoc.
- **Plateau GL : comportements ambiants par équipe enfin câblés** — nouveau hook
  `src/gl/hooks/useGLBoardAmbientBehavior.js` (par équipe via `triggerTransient(teamId, …)` exposé
  par `useGLBoardMascotMotion`), branché dans `GLGameBoard` avec résolution d'entrée par
  `resolveVisitMascotEntry` + catalogue GL. Les entrées catalogue GL portent désormais
  `customStates`/`customTriggers`/`dialogProfile` (`glMascotCatalogExtras`). Lève la limite connue
  des étapes 1-2 (ambiant GL non câblé).
- Tests : `tests-ui/utils/mascotBehaviorEngine.test.js`, `tests-ui/gl/useGLBoardAmbientBehavior.test.js`.
  Docs `docs/MASCOT_PACK.md` et `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte — Dialogues data-driven (étape 2 convergence)

- **Profil de dialogue extensible** : `dialogProfile` n'est plus une énumération figée
  (`.strict()`) — il accepte désormais les événements connus **ou** des clés personnalisées
  (`a-z0-9_-`), validées par format ; `sanitizeDialogProfile` les conserve. Une clé mal formée
  (camelCase) reste rejetée.
- **Bulle des déclencheurs personnalisés centralisable** : `resolveTriggerDialogLines` résout la
  bulle d'un `customTriggers` via `dialogProfile[clé]` (prioritaire) puis l'inline ; éditable au
  **studio dialogue** (`VisitMascotDialogEditor` liste les déclencheurs personnalisés du pack).
  Runtime (moteur ambiant + tap) câblé sur ce helper.
- Tests : `tests/visit-mascot-dialog.test.js` (clés perso acceptées/rejetées, `sanitizeDialogProfile`,
  `resolveTriggerDialogLines`), `tests-ui/components/VisitMascotDialogEditor.test.jsx`. Miroir
  `lib/visit-pack/` resync. Docs `docs/MASCOT_PACK.md` et `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.

### Mascotte (visite + GL) — Comportements extensibles : palette élargie, états & déclencheurs personnalisés (studio prof)

- **Palette d'états élargie** : 8 nouveaux états d'animation prédéfinis communs visite + GL —
  `sleep`, `wave`, `dance`, `eat`, `search`, `sad`, `love`, `point` (`VISIT_MASCOT_STATE`,
  libellés FR dans `src/constants/mascotStateLabels.js` et aperçu studio). Alias GL→visite
  ajoutés (`src/utils/glMascotPackToVisit.js`).
- **États personnalisés par pack (`customStates`)** : le prof crée ses propres états (clé + libellé)
  dans le studio (visite : nouvel onglet « Comportements personnalisés » de l'éditeur WYSIWYG ;
  GL : champ `states` libre + `label` optionnel). Validés (collision/doublon), rendus via
  `stateFrames`, utilisables comme cibles d'alias, de règles d'interaction et de déclencheurs.
- **Déclencheur général `mascotTap`** : tap/clic direct sur la mascotte (palette d'interaction v2 +
  câblage runtime `VisitMapMascot`).
- **Déclencheurs personnalisés (`customTriggers` / GL `triggers`)** : comportements pilotés par les
  données du pack — `periodic` (joue un état toutes les `everyMs`, moteur ambiant
  `useAmbientMascotBehavior`) ou `tap` (au clic). Bulles optionnelles. Édition au studio.
- **Schéma & validation** : `mascotPack.js` (visite, v1/v2) et `glMascotPack.js` (GL) étendus
  (Zod : clés uniques, non réservées, état cible valide, `everyMs` requis si périodique). Règle
  d'interaction `transient` : l'appartenance de l'état (canonique **ou** personnalisé) est vérifiée
  au niveau pack. Miroirs serveur `lib/visit-pack/` et `lib/gl-pack/` resynchronisés.
- **Runtime** : `resolveVisitMascotState({ extraStates })` accepte les états personnalisés du pack
  actif ; la machine à états visite expose l'entrée active et joue les états/déclencheurs custom ;
  le plateau GL (`GLBoardMascot`) respecte les états personnalisés déclenchés.
- **Registre central des comportements** (`src/utils/visitMascotBehaviorRegistry.js`, étape 1 du
  plan de convergence) : source unique dérivant les options d'états/déclencheurs depuis
  `(palette canonique ⊕ pack actif)`. Les éditeurs (profil d'interaction, alias, comportements
  personnalisés, WYSIWYG, lot d'interaction, panneaux images) ne dépendent plus de constantes
  figées : **les états personnalisés sont désormais sélectionnables partout** (cibles d'alias,
  d'interaction, d'insertion d'images), plus seulement dans l'éditeur dédié. Voir
  `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.
- Tests : `tests/mascot-pack.test.js` (palette, `customStates`, `customTriggers`),
  `tests/gl-mascot-pack-to-visit.test.js` (préservation d'état GL + portage des triggers),
  `tests-ui/utils/visitMascotCustomBehaviors.test.js`, `tests-ui/utils/visitMascotBehaviorRegistry.test.js`,
  `tests-ui/hooks/useAmbientMascotBehavior.test.js`,
  `tests-ui/components/mascot/MascotPackCustomBehaviorsEditor.test.jsx`. Docs `docs/MASCOT_PACK.md`
  et `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.
### GL — Édition du plateau : déplacement de repères enregistré de façon fiable (fix)

- **Fin du glisser-déposer perdue** : lors du déplacement d'un repère sur la carte du chapitre
  (`GLChapterMapStudio`), le `pointerup` lisait la position finale via la closure `editableMarkers`,
  qui reflète le dernier rendu React committé et pouvait être **en retard sur le point de lâcher**.
  Le `PUT` enregistrait alors une position intermédiaire et le repère « se replaçait » au rechargement.
  La position est désormais lue via une **ref** (`dragLatestPctRef`) mise à jour à chaque `pointermove`,
  garantissant l'enregistrement exact du point de lâcher. Les écouteurs ne se ré-abonnent plus à chaque
  mouvement (sortie de `editableMarkers` des dépendances de l'effet).
- **Rechargements concurrents dans le désordre** : plusieurs déplacements enchaînés déclenchaient
  autant de `loadDetail` non sérialisés ; une réponse périmée pouvait écraser l'état frais et faire
  revenir des repères à leur ancienne position. Ajout d'un **garde-fou de séquence**
  (`detailLoadSeqRef`) dans `GLChaptersAdminView.loadDetail` : seule la réponse du rechargement le plus
  récent est appliquée.
- Test : `tests-ui/gl/GLChapterMapStudio.test.jsx` (régression — le drag persiste la position finale,
  jamais une position intermédiaire périmée).

### GL — Autosave QCM : création sans perte de saisie en vol

- **Éditeurs QCM biomes + lore** : après la création initiale d'une question, le passage du brouillon
  (`new:<code>`) à la fiche persistée (`<code>`) rebaselinait l'autosave avec la saisie courante. Une
  frappe effectuée pendant le `POST` de création restait visible à l'écran mais pouvait ne jamais être
  envoyée en `PUT`, puis disparaître au rechargement. La clé de reset de l'autosave est maintenant pilotée
  uniquement par les chargements explicites de fiche/brouillon, et un test UI couvre le second autosave
  attendu après création.
### ForetMap — Cartes : étiquettes plus grandes, grossissement au zoom configurable

- **Étiquettes un peu plus grandes** : tailles de référence portées de 17→**19 px** (emoji) et 12→**14 px**
  (libellé) dans `resolveMapOverlayTypography` (`src/utils/mapOverlayTypography.js`).
- **Grossissement progressif au zoom** : les étiquettes (emojis + noms, zones et repères) peuvent
  désormais **grossir légèrement quand on zoome**, au lieu de garder une taille apparente strictement
  constante. Formule `taille = base × ratio_zoom^g` où `g = overlay_zoom_growth_percent / 100`. Appliqué
  de façon **cohérente aux deux cartes** : la carte des tâches passe une hauteur au repos stable +
  un `zoomRatio` (nouvelle échelle d’ajustement `fitScale` exposée par `useMapGestures`), le plan de
  visite utilise le `zoomRatio` par défaut (= zoom courant, repos à 1).
- **Configurable dans les réglages** : nouveau réglage public `ui.map.overlay_zoom_growth_percent`
  (entier 0–100, défaut **35** ; `0` = taille constante, `100` = grossissement linéaire), éditable depuis
  l’admin (section Modules) au même endroit que les autres réglages carte. Backend `lib/settings.js`,
  défaut public `src/utils/appPublicSettings.js`, libellé admin `src/constants/settingsAdminMeta.js`.
- Tests : `tests/map-overlay-typography.test.js` (tailles de référence 19/14, grossissement 0 %/100 %/défaut,
  bornage `clampZoomGrowthPercent`). Doc : `docs/API.md` (réglages `ui.map.*`).
### ForetMap — Mode visite/découverte (onboarding guidé par onglet)

- **Découverte « petit à petit » à la première ouverture de chaque onglet** : un nouveau mode visite
  présente les éléments de la page sous forme de coach marks (spotlight + carte explicative,
  Précédent / Suivant / Passer). Le parcours démarre automatiquement **la première fois qu'un onglet est
  ouvert**, puis ne se relance plus seul (mémorisé par onglet dans `localStorage`,
  clé `foretmap_discovery_seen_v1`).
- **Relance depuis le bouton d'aide** : chaque panneau d'aide « ? » (`HelpPanel`) propose désormais un
  bouton **« ▶ Visite guidée »** qui rejoue le parcours de la page courante.
- **Contenu adapté au rôle** : textes différenciés élève / n3boss, étapes réservées à un rôle
  (ex. Profils, Paramètres), et étapes dont la cible est absente du DOM automatiquement ignorées
  (on ne montre que ce qui figure à l'écran).
- **Activation** : respecte `modules.help_enabled` et un nouveau drapeau `help.discovery_tour` des
  réglages publics ; l'auto-démarrage attend que l'application soit prête et qu'aucun onboarding mascotte
  invité ne soit en attente.
- Nouveaux fichiers : `src/constants/discoveryTour.js` (définitions des parcours), `src/hooks/useDiscoveryTour.js`
  (état + persistance), `src/components/DiscoveryTour.jsx` (overlay/coach marks),
  `src/contexts/TourContext.jsx` (provider + auto-démarrage). Câblage dans `src/App.jsx`, `HelpPanel.jsx`
  et styles dans `src/index.css`.
- Tests : `tests-ui/hooks/useDiscoveryTour.test.jsx` (persistance, filtrage par rôle, démarrage/progression)
  et `tests-ui/components/DiscoveryTour.test.jsx` (rendu, navigation, texte prof).

### ForetMap — Cartes : zoom plus profond et étiquettes de zones/repères plus lisibles

- **Étiquettes à taille apparente constante (zones SVG + repères HTML, carte des tâches et plan de
  visite)** : `resolveMapOverlayTypography` (`src/utils/mapOverlayTypography.js`) calcule désormais les
  tailles en **px-écran** puis les contre-échelonne par `worldScale`. Les planchers de lisibilité étaient
  exprimés en unités-monde : au-delà d'un zoom ~2,3× ils se déclenchaient et **faisaient gonfler** les
  libellés (ex. ~36 px à ×6 au lieu des ~14 px voulus). Les textes gardent maintenant une taille apparente
  **stable quel que soit le zoom**. L'écart emoji/libellé suit la même logique (plus de décalage géant en
  zoomant).
- **Étiquettes légèrement plus petites** : tailles de référence ramenées de 19→17 px (emoji) et 14→12 px
  (libellé) pour des repères plus discrets sur les plans denses.
- **Zoom plus profond sur les deux cartes** : échelle maximale portée de **6 à 8** (carte des tâches via
  `MAP_VIEW_SCALE_MAX` dans `useMapGestures.js` — molette, pinch, boutons +/− et barre d'outils ; plan de
  visite via `VISIT_MAP_SCALE_MAX`). La hausse de zoom est sans effet de bord visuel grâce à la correction
  ci-dessus.
- Tests : `tests/map-overlay-typography.test.js` (tailles de référence, invariance de la taille apparente
  à fort zoom, planchers) et `tests-ui/utils/visitMapTransform.test.js` (bornes `[1, 8]`).

### GL — Pistes audio de zone (carte du royaume) : la sélection ne s'appliquait pas / le menu se repliait

- **Persistance de la playlist multi-pistes** : `useGLKingdomZones` (`createZone` / `updateZone`) ne
  transmettait que le champ legacy `musicUrl` (singulier) et **ignorait `musicUrls` (pluriel)** envoyé
  par l'éditeur (`saveZoneMeta`, `clearZoneMusic`) et par la duplication de zone
  (`zoneDuplicateCreatePayloadFromZone`). Conséquence : la piste audio sélectionnée n'était jamais
  enregistrée, « Retirer la musique » ne persistait pas, et dupliquer une zone perdait sa musique et son
  volume. Le pluriel est désormais forwardé à l'API (déjà accepté côté serveur, cf. `lib/glZoneMusic.js`).
- **Autovalidation qui repliait le menu et écrasait l'édition en cours** : l'effet de chargement des
  brouillons de zone (`useGLKingdomZoneEditor`) se redéclenchait à chaque `reload()` post-autosave
  (nouveaux objets zone, même id), réinitialisant `draftMusicUrls` / `draftPopoverImages`… La ligne de
  piste vide disparaissait et le `MediaLibraryMenu` ouvert se démontait (« le menu se replie trop vite »).
  Le rechargement des brouillons est maintenant **gardé par id de zone** : un simple refresh de la même
  zone ne réécrase plus une saisie en cours.
- Tests : `tests-ui/gl/useGLKingdomZones.test.js` (forwarding `musicUrls`/volume, playlist vide,
  duplication avec musique) et `tests-ui/gl/useGLKingdomZoneEditor.test.js` (le brouillon survit à un
  reload de la même zone ; changer de zone recharge bien les valeurs serveur).

### Éditeurs — récurrences d'autovalidation / persistance (audit du bug pistes audio)

- **Éditeur de visite (`VisitEditorPanel`)** : l'effet de chargement du formulaire se redéclenchait à
  chaque reload post-action média (`visit-views` recrée l'objet `selected`), écrasant le texte et les
  blocs éditoriaux en cours de saisie. Rechargement désormais **gardé par identité (type + id)** : on ne
  réinitialise le formulaire qu'au changement d'élément sélectionné.
- **Chapitres GL (`GLChaptersAdminView`)** : `persistChapter` appelait `chapterDetailToForm(data.chapter, …)`
  au lieu de `chapterDetailToForm(data)` → `TypeError` à chaque autovalidation (refresh cassé, image de
  carte jamais uploadée à la création). Argument corrigé.
- **Éditeurs QCM (`GLQcmQuestionEditorPanel` + lore)** : `setForm(nextForm)` après save écrasait les
  frappes saisies pendant la requête en vol. Nouveau helper `src/gl/utils/mergeAutoSaveForm.js` :
  applique la version serveur sauf pour les champs édités entre-temps.
- **Effacement de feedback QCM (FM quiz, GL QCM, GL QCM lore)** : l'upsert d'import
  (`feedback_x = COALESCE(NULLIF(VALUES(…), ''), feedback_x)`, volontaire pour l'import XLSX partiel)
  était réutilisé par l'éditeur, empêchant d'effacer un feedback existant. Nouvelle variante
  `QUESTION_UPSERT_SQL_FORM` (`feedback_x = VALUES(…)`) dérivée via `lib/shared/feedbackUpsertSql.js`,
  utilisée par les chemins éditeur (`*Crud.upsert*Question`) ; l'import conserve sa sémantique.
- **Tests glossaire RQL rouges depuis #205** (`tests/quiz-api.test.js`, `tests/gl-glossary-origin-scope.test.js`) :
  le fixture entrait en collision avec le seed sur la clé unique
  `quiz_questions(categorie_slug, numero_dans_categorie)` → l'upsert d'import mettait à jour une question
  seedée au lieu de créer la question de test (lien RQL ignoré via FK `question_code`, `present` en 404).
  Corrigé côté test (catégorie dédiée + 5e choix manquant) ; la feature de liaison glossaire est correcte.
- Tests : `tests/feedback-upsert-sql.test.js`, `tests-ui/gl/mergeAutoSaveForm.test.js`,
  `tests-ui/components/visit/VisitEditorPanel.test.jsx`.

### GL & ForetMap — liens glossaire ↔ questions : source de vérité unifiée

- **GL (écritures + lectures)** : les liens « glossaire » QCM ne transitent plus par les tables de
  jonction héritées `gl_qcm_question_glossary` / `gl_qcm_lore_question_glossary` mais par la table
  unifiée `gl_resource_question_links` (cf. migration `145`). `lib/glQcmCrud.js`, `lib/glQcmLoreCrud.js`,
  `lib/glQcmImport.js`, `lib/glQcmLoreImport.js` : `INSERT IGNORE` (`origin='import'`, `status='approved'`,
  `is_gating=1`, `resource_type='glossary'` / `'lore_glossary'`). Les compteurs `glossaryLinks` de
  `routes/gl/qcm.js` et `routes/gl/lore.js` lisent l'unifiée.
- **Scope du `DELETE` de resync = `origin='import'`** (et non `status='approved'`) : le matcher
  déterministe ne supprime QUE les liens qu'il sait recréer, préservant les liens curatés
  (`manual`/`auto`/`generated`/`suggested`) des autres pipelines. Migration `149` : requalifie les
  19 liens manuels `origin='point4'` en `origin='manual'` (couplé au nouveau scope — sinon ils seraient
  effacés au prochain resync).
- **ForetMap (miroir)** : `lib/fmQuizCrud.js` et `lib/fmQuizImport.js` écrivent désormais dans
  `resource_question_links` (migration `144`) au lieu de `quiz_question_glossary` ; `routes/quiz.js`
  (COUNT admin + affichage des termes après réponse, **recalculé à la volée** via le matcher, sans
  lecture de table de liens) et `routes/glossary.js` (questions liées à un terme) lisent l'unifiée.
  Même scope `origin='import'`. Tests `tests/quiz-api.test.js`, `tests/glossary-api.test.js`,
  `tests/fm-quiz-import.test.js`, `tests/gl-glossary-origin-scope.test.js`.
- **Tables héritées conservées** (non droppées dans ce lot) : plus aucun code applicatif ne les touche.
  Pas de changement de comportement métier visible.

### BDD — intégrité, régularisation et nettoyage (suite à l'audit du dump)

- **Intégrité `task_*`** (migration `150`) : recréation idempotente et défensive des FK
  `fk_task_assignments_student` / `fk_task_logs_student` (`student_id → users(id) ON DELETE SET NULL`),
  absentes en prod (drift hors-migration) ; purge préalable des orphelins (`SET NULL`) puis index garanti
  avant la FK (pré-requis InnoDB). Test `tests/task-student-fk.test.js`.
- **Constantes de jeu GL** (migration `151`) : régularisation des tables `gl_game_constants` (14) et
  `gl_game_constant_refs` (13), créées manuellement hors pipeline ; **source documentaire NON câblée au
  runtime**, recréées en collation projet `utf8mb4_unicode_ci`. Test `tests/gl-game-constants.test.js`,
  note `docs/EVOLUTION.md`.
- **Colonnes legacy/seed-only supprimées** (migration `153`) : `tasks.recurrence_end` et
  `quiz_questions.photo_species_id` / `photo_source` / `photo_licence_url` / `photo_sujet` (jamais lues
  ni écrites ; l'affichage/import s'appuie sur `photo_url` / `photo_credit` / `photo_licence` /
  `photo_legende`, conservées). Tables GL homonymes non touchées. Test `tests/drop-legacy-columns.test.js`.
- **Vues mortes supprimées** (migration `152`) : `v_species` et `v_gl_food_web` (jamais consommées) ;
  `v_food_web` / `v_zone_inventory` conservées. Test `tests/gl-dead-views-dropped.test.js`. DROP des tables
  QCM héritées GL prévu au lot suivant (cf. `docs/EVOLUTION.md`, § 1.2bis).

### Tests — isolation RBAC (élèves bloqués en profil visiteur)

- **Cause** : avec le modèle d'accès n3beur par groupes, `syncStudentRoleFromGroups` (exécuté au login/inscription) démote tout élève sans **groupe n3beur** vers `visiteur`. Les helpers de test affectaient le rôle `eleve_novice` uniquement via `user_roles` puis se reconnectaient, ce qui le faisait redémoter → écritures refusées en `403` (suite CI rouge : `api`, `forum`, `context-comments*`).
- **Correctif** : nouveau helper partagé `tests/helpers/studentRoles.js` (`setStudentPrimaryRole`) qui rattache l'élève à un groupe n3beur de test (`grants_n3beur_access = 1`, `default_role_id`) avant le login, pour que le rôle survive à la synchronisation. Helpers des fichiers concernés alignés. Aucun changement de comportement applicatif.

### Sécurité — groupes, pont GL et imports bulk

- **Groupes** : `default_role_id` refuse désormais les profils staff/GL ou avec permissions non élèves ; la synchronisation ignore aussi un rôle dangereux déjà présent en base.
- **Pont GL → ForetMap** : un joueur GL non lié ne peut plus capturer un compte ForetMap par collision pseudo/email, et la synchronisation n’écrase plus le mot de passe d’un compte ForetMap existant.
- **Imports bulk GL** : les archives ZIP avec plusieurs fichiers de même nom (dans des dossiers différents) sont refusées pour éviter qu’un fichier prévisualisé soit remplacé par un autre à l’application.
### Mascotte — suivi GPS (smartphone)

- **Suivi de position** : sur un plan calé, la mascotte suit la position GPS réelle de l'élève via un bouton « 📍 Me suivre » (toolbar carte). Conversion lat/lng → % par transformation affine à 3 points (`src/utils/mapGeoTransform.js`). Position traitée 100 % côté client (jamais envoyée au serveur).
- **Outil prof « Calage GPS »** : dans Réglages → Cartes, poser 3 repères sur le plan + saisir/capturer leurs coordonnées GPS, puis activer le suivi par plan (`MapGeorefPanel`).
- **API** : `PUT /api/settings/admin/maps/:id/georef` ; champs `georef`/`gps_enabled` exposés par `GET /api/maps` (cf. `docs/API.md`). Migration `148_map_georef.sql` (colonnes `geo_anchors_json`, `gps_enabled`).
- **Correctif calage GPS** : un brouillon incomplet dans l'outil prof n'envoie plus `anchors: []` et ne peut donc plus effacer silencieusement le calage existant ; côté API, omettre `anchors` conserve désormais les ancres stockées.
- **Dégradation** : bouton masqué si capteur absent (`navigator.geolocation`) ou plan non calé ; HTTPS requis. Seuil de précision + détection hors-zone pour éviter les sauts.
- **Calage prof — ergonomie** : plan affiché en pleine largeur (plus de plafond à 240 px) ; clic direct sur le plan pour poser les repères (ciblage automatique du point suivant, plus besoin d'armer un bouton), bannière de guidage et curseur réticule. Image du plan exclue de la lightbox globale (`data-no-lightbox`) : le clic pose un repère au lieu d'ouvrir l'aperçu plein écran.
- **Suivi — légende de statut** : légende textuelle sous la barre d'outils carte (`MascotGpsStatusBanner`) explicitant l'état du suivi (actif + précision, localisation refusée, hors zone du plan, signal faible, acquisition en cours), avec icône dédiée par état. Le bouton « 📍 » distingue désormais le signal faible (📶) de l'erreur bloquante (⚠️).
- **Tests** : `map-geo-transform`, `settings-maps-georef`, `useGeolocation`, `useMascotGpsFollow`, `MapGeorefPanel`.

### Réseau trophique — mise en page et filtre par carte

- **Graphe** : colonne latérale pour les filtres, zone de représentation agrandie (880×560), légende à côté sur grand écran.
- **Liste** : groupes par type d'interaction en grille multi-colonnes ; contrôles compacts en tête.
- **Filtre carte** : « Toutes les cartes » ou une carte précise ; sous-filtre zone optionnel sur la carte choisie.
- **API** : `GET /api/food-web?mapId=` (documenté dans `docs/API.md`) ; tests `food-web-api`.

### Studio pack mascotte — actions en lot sur les images

- **Sélection multiple** : barre d'outils bulk (insertion, suppression, renommage, remplacement d'images).
- **Interactions** : dialogue d'application groupée des profils d'interaction sur les cellules sélectionnées.
- **Tests** : `mascotPackEditorFrames`, `visitMascotPackManager`, `MascotPackImagesPanel` ; routes visit mascotte étendues.

### GL — marché sous l'onglet Les joueurs

- **MJ sans aperçu joueur** : message explicite au lieu d'un marché vide ; sous-onglet Marché toujours visible si le module vitalité est actif.

### Groupes — création

- **Validation** : `default_role_id` et `grants_n3beur_access` acceptés à la création (`POST /api/groups`) ; tests associés.

### GL — navigation par onglets regroupés

- **La nature** : Écosystèmes, Biodiversité et Glossaire SVT sous un onglet parent.
- **L'aventure** : Histoire, Carnet Sélène et Sortilèges (sous-onglets filtrés par modules).
- **Le monde G&L** : Introduction, Règles du jeu, Lexique lore et Tutoriels.
- **Les joueurs** : Forum, Marché et Statistiques (marché selon vitalité ; stats classe MJ / perso joueur).
- **Introduction** : ancien onglet « Le monde de G&L » renommé en sous-onglet.
- **Tests** : vues groupées (`GLNatureView`, `GLAdventureView`, `GLMondeView`, `GLJoueursView`), `glAppShellHelpers`, e2e navigation GL.

### GL — onglet Écosystèmes et hyperliens glossaire

- **Écosystèmes** : retrait de l’illustration de couverture dupliquée (déjà dans Histoire) ; biotope et biocénose fusionnés sous le nom de l’écosystème (sans titres « Biotope » / « Biocénose »).
- **Glossaire** : auto-liens étendus aux fiches espèces (Biodiversité), au popover glossaire et aux champs texte des définitions.
- **Tests** : `GLEcosystemsView`, `glEcosystemMarkdown`.

### Identité visuelle GL — favicon

- **Favicon** : logo gnome + licorne (`public/gl/`) déclaré dans `gl.html` ; script `npm run icons:gl` ; route `/favicon.ico` sensible au produit (`gl.*` vs ForetMap).
- **Charte** : `brand.faviconUrl` (upload MJ) appliqué via `useGLBrandTheme`.

### Utilisateurs / groupes partagés ForetMap ↔ GL et rôle visiteur

- **Groupes** : `default_role_id`, `grants_n3beur_access` ; résolution RBAC élève via `lib/groupRole.js` ; `POST /api/groups/:id/apply-default-role`.
- **Visiteur ForetMap** : persistance après login (plus de promotion auto `visiteur` → `eleve_novice`) ; UI sans onglets carte/tâches, arrivée sur **Visite**.
- **Pont GL** : `gl_classes.foretmap_group_id`, création joueur synchronisée (`users` + `group_members` + `linked_foretmap_user_id`), login GL accepte le mot de passe du compte ForetMap lié.
- **Pont GL (correctif)** : backfill au démarrage des joueurs GL préexistants vers `users` / `group_members` ; resynchro sur `PUT /api/gl/admin/players/:id` ; migration **147** ; tests `tests/gl-group-bridge.test.js`.

### Tutoriels — import des fiches `tutos/` manquantes

- **`lib/importTutosFromFilesystem.js`** : scan du dossier `tutos/*.html`, détection des fiches déjà en BDD
  (chemin, contenu, slug, titre, nom de fichier) et import idempotent des nouvelles fiches (HTML en base).
- **API** : `GET /api/tutorials/import/scan`, `POST /api/tutorials/import/files` (`dryRun` optionnel).
- **UI prof** : bouton « Importer /tutos/ » sur l’écran Tutoriels.
- **Tests** : `tests/tutorials.test.js` ; doc `docs/API.md`.

### Réseau trophique — légende et styles par type de relation

- **Graphe** : couleur et figuré (plein, pointillés) distincts par type d'interaction ; légende
  visuelle sous le graphe (flèche simple ↔ double sens) ; export PNG/SVG aligné.
- **Liste** : barre colorée sur chaque relation selon le type.
- **Affichage** : en-tête fixe (plus de rognage en mode prof) ; bouton « Flux trophiques » et
  légende cliquable pour masquer/afficher les relations (par type ou flux trophique d'un coup) ;
  **vue graphe par défaut** (au lieu de la liste).
- **Code** : `src/shared/foodWebEdgeStyle.js`, `FoodWebEdgeLegend.jsx` ; tests UI associés.

### Conditionnement « lu/appris » — aperçu avant quiz gating

- **UI** : étape « Contrôle de compréhension » avant le quiz (résumé du nombre de questions,
  **Commencer** / **Annuler**) dans `LearningAcknowledgeButton`.

### Conditionnement « lu/appris » — gating pull à l'accusé (phase 3)

- **`lib/learningGatingAcknowledge.js`** : challenge (`GET …/gating/challenge`) et garde **403** sur les
  `POST` d'accusé si une question liée n'a pas de bonne réponse en BDD (mode **all**).
- **UI** : au clic « Marquer comme lu/appris/étudié », enchaînement quiz → confirmation
  (`LearningGatingQuestionPanel`, essais illimités, abandon). Branché FM (tutoriels, plantes) et GL
  (espèces, glossaire, tutoriels).
- **Suppression de l'auto-marquage push** : les réponses QCM enregistrent les tentatives uniquement
  (`recordGlQcmAttemptIfGatingEnabled`, y compris QCM en partie GL).
- Routes : `GET /api/learning/gating/challenge`, `GET /api/gl/learning/gating/challenge`.
- Tests : `tests/learning-gating-acknowledge.test.js`, `tests/gl-learning-gating-acknowledge.test.js`,
  `tests-ui/shared/learningGatingChallengeClient.test.js`.

### Conditionnement « lu/appris » — runtime d'auto-marquage (branchement) — remplacé

- L'auto-marquage sur bonne réponse (phase 2) est **retiré** au profit du flux pull ci-dessus.

### Conditionnement « lu/appris » — génération de questions liées (enrichissement contenu)

- **`scripts/generate-linked-questions.js`** (`npm run learning:generate-questions`) : génère, pour
  chaque ressource sans question liée (status='approved'), une question dont la réponse EST dans la
  ressource (identité d'espèce GL, définition de glossaire FM/GL/lore, idée-clé/incipit de feuillet,
  identité de plante FM), avec distracteurs tirés des pools réels et bonne réponse placée
  aléatoirement. Lien créé en `origin='generated'`, `status='approved'`, `is_gating=1`. Dry-run par
  défaut, `--apply` pour écrire, idempotent (ne cible que les ressources non couvertes).
- **`scripts/suggest-learning-links.js`** : option `--types=…` pour cibler/exclure des types de
  ressources (ex. exclure `species`).
- **`lib/shared/resourceQuestionGatingCore.js`** : ajout de l'origine de lien `'generated'`.
- Catégorie quiz FM `glossaire_definitions` (créée à la volée) pour les questions de vocabulaire.

### Corrigé

- **GL — Carnet de Sélène (admin « Contenus › Carnet Sélène »)** : l'onglet d'édition des feuillets
  affichait « Impossible de charger le contenu — le serveur a renvoyé une page HTML (vérifiez l'API /
  le proxy) ». Le panneau `GLLoreFeuilletsEditorPanel` appelait `/api/gl/admin/feuillets` (préfixe
  `/lore` manquant) : la requête retombait sur le fallback SPA (HTML 200) au lieu d'atteindre la route
  `/api/gl/lore/admin/feuillets`. Chemins corrigés (liste, détail, PUT, PATCH) + test UI de
  non-régression `tests-ui/gl/GLLoreFeuilletsEditorPanel.test.jsx`.

### GL — correctif import partiel des feuillets Sélène

- **Correctif critique** : l’upsert des feuillets GL respecte maintenant le contrat
  « cellule vide = champ inchangé » pour les mises à jour partielles. Un import limité à
  quelques colonnes ne remet plus à `NULL` les textes, biomes, images, liens ou compteurs
  existants, et ne force plus `type`, `mode_apparition`, `effacement` ou `statut` à leurs
  valeurs par défaut.
- **Tests** : couverture ciblée dans `tests/gl-lore-import.test.js` sur les drapeaux de mise à
  jour générés pour une feuille `code,titre`.
### GL — page de garde de la connexion : titre, accroches tournantes, « Franchir le miroir », 4ᵉ de couverture

- **Écran de connexion** (`src/gl/components/GLAuthView.jsx`) : nouvelle page de garde —
  titre de couverture, **accroche narrative tirée au hasard** parmi trois registres
  (Mystère / Mission / Émerveillement) à chaque chargement, baseline
  « De l'équateur au pôle, réécrivez le monde vivant avant que le Souffle ne l'efface. »,
  et bouton d'entrée renommé **« Franchir le miroir »** (remplace « Se connecter »).
  Le formulaire (identifiant, mot de passe, Google, mode découverte) reste visible et inchangé.
- **Quatrième de couverture** : dépliant accessible « Lire la quatrième de couverture »
  (`<details>`, cible tactile ≥ 44 px) sous la couverture — le texte (≈ 85 mots, trois paragraphes)
  prolonge la métaphore du livre (couverture → on retourne le livre).
- **Métadonnées de partage** (`vite.config.js`, plugin `gl-share-meta`) : la 4ᵉ de couverture est
  aussi injectée comme `description` + Open Graph (`og:title/description/type/site_name/locale`) +
  Twitter Card dans **`gl.html` uniquement** (aperçus de lien / SEO), depuis la même source unique.
- **Contenus isolés** (`src/gl/constants/authCover.js`) : accroches, baseline, **4ᵉ de couverture**,
  libellé du CTA et helper `pickGlAuthTagline()` (RNG injectable) — source unique des textes,
  prévue pour un pilotage ultérieur via `gl_settings` sans retoucher le composant.
- **Intro cinématique inchangée** : la métaphore « boîte / copiste » est conservée ; le « miroir »
  ne se superpose pour l'instant que sur l'écran de connexion.
- **Tests** (`tests-ui/gl/glAuthCover.test.js`, `tests-ui/gl/GLAuthView.test.jsx`) : tirage des
  accroches, conformité CTA/baseline/4ᵉ de couverture, rendu de la page de garde ; libellé du
  submit mis à jour.
### Conditionnement « lu/appris » — phase 2 (pré-préparation : suggestion + validation des liens)

- **Moteur de suggestion textuelle** `lib/shared/resourceQuestionMatch.js` (pur, sans BDD) :
  rapproche l'énoncé/tags/mots-clés des questions des libellés des ressources (termes/variantes,
  noms d'espèces, titres de feuillets/tutoriels), avec score de confiance et raison.
- **Script** `scripts/suggest-learning-links.js` (`npm run learning:suggest-links`) : charge la BDD,
  produit un rapport **dry-run** par défaut, et `--apply` insère les candidats en `origin='auto'`,
  `status='suggested'` (idempotent : ne re-suggère jamais un couple déjà présent).
- **Validation en masse** : `POST /api/learning-links/review` et `POST /api/gl/learning-links/review`
  (`{ ids, action: 'approve'|'reject' }`) pour prof/MJ.
- **Tests** : `tests/resource-question-match.test.js` (moteur) + cas `/review` dans les tests
  d'intégration ; **doc** `docs/API.md` (§ « Suggestion automatique de liens »).
- Le branchement runtime (auto-marquage + tentatives, sur liens `status='approved'`) reste à venir.

### Conditionnement « lu/appris » par réussite au quiz — backbone structurel (gating OFF par défaut)

- **Modèle polymorphe de liens ressource ↔ question** (N-N) : tables `resource_question_links`
  (ForetMap) et `gl_resource_question_links` (GL, + `question_dataset` qcm/qcm_lore). Reprise **non
  destructive** des liens d'enrichissement quiz existants (`quiz_question_*`,
  `gl_qcm_*_question_glossary`) dans le modèle unifié.
- **Politique de conditionnement par ressource** : `resource_gating_policy` /
  `gl_resource_gating_policy` (`mode` off|any|all|threshold, `required_correct`, `enabled`) + défauts
  **configurables** : `learning.gating.*` (`app_settings`, prof) et `gating.*` (`gl_settings`, MJ —
  dont `granularity` player|team|per_resource, surchargeable par chapitre
  `gl_chapters.gating_granularity` et scope lore `gl_qcm_lore_scopes.gating_granularity`).
- **Persistance des tentatives QCM GL par lecteur** : table `gl_qcm_attempts` (alimente le mode `player`).
- **Endpoints CRUD** prof (`/api/learning-links`) et MJ (`/api/gl/learning-links`), avec isolement
  cross-produit. Cœur de logique partagé `lib/shared/resourceQuestionGatingCore.js`.
- **Migrations** : `144_resource_question_links.sql`, `145_gl_learning_resource_links.sql`.
- **Désactivé par défaut** : aucun changement de comportement tant que le gating n'est pas activé
  (branchement du marquage/auto-mark et de l'enregistrement des tentatives prévus au lot suivant).
- **Tests** : `tests/resource-question-gating-core.test.js` (unitaire pur),
  `tests/learning-links.test.js`, `tests/gl-learning-links.test.js` (intégration + isolement).
- **Doc** : `docs/API.md` (section « Liens ressources ↔ questions & conditionnement »).
### GL — éditeur des feuillets du carnet de Sélène (liste + édition)

- **Onglet Contenus → Carnet de Sélène** : sous-onglets « Feuillets » (éditeur) / « Import / export »
  (comme espèces, glossaire, sortilèges), via `GLContentCatalogPanel`.
- **Liste** tabulaire des feuillets avec leurs caractéristiques principales (code, titre, type, liasse,
  biome, zone, mode, ordre, statut) + filtres recherche / type / biome / statut (`GLDataList`).
- **Édition unitaire** de toutes les colonnes utiles, regroupées en sections (identité, récit & ordre,
  localisation, effacement & jeu, ancrage scientifique, liens espèce/pays, textes, images) +
  **archivage / réactivation**. Composant `GLLoreFeuilletsEditorPanel` + utilitaires
  `glFeuilletEditorForm` / `glFeuilletFieldLabels`.
- **API** : `PUT /api/gl/lore/admin/feuillets/:code` (réutilise la normalisation d'import + tolérance
  biome : hors-référentiel → `biome_slug = NULL` + `warning`) et `PATCH …/:code` (statut). Helper
  `updateFeuilletFields` (`lib/glLoreFeuillets.js`, UPDATE paramétré sans COALESCE : vider un champ le
  vide bien en base).
- **Tests** : `tests/gl-lore-feuillet-admin.test.js` (routes PUT/PATCH/404/403),
  `tests/gl-lore-feuillet-update.test.js` (helper SQL, sans BDD),
  `tests-ui/gl/glFeuilletEditorForm.test.js` (logique de formulaire). Doc `docs/API.md`.

### GL — import carnet de Sélène : tolérance maximale + corpus v3 (157 feuillets)

- **Import feuillets robuste** (`lib/glLoreFeuilletsImport.js`) — ce type de fichier ne doit jamais
  faire échouer l'import :
  - **Biome hors-référentiel** → feuillet importé **sans biome** (`biome_slug = NULL`) + avertissement
    `report.feuillets.warnings`, au lieu d'un skip/erreur (respecte la FK `gl_biomes`, colonne nullable).
  - Noms de feuilles **insensibles à la casse/aux accents** (`Feuillets`, `PLATEAUX`, …) ; feuilles
    (`README`, `biomes`) et colonnes en trop **ignorées** ; `type`/`mode_apparition` inconnus → défaut.
  - Plafond de lignes relevé **500 → 1000**.
- **Corpus de référence** : `data/gl/corpus-feuillets-selene.xlsx` mis à jour en **v3** (144 → 157
  feuillets ; sur-ensemble strict — aucun code retiré, 4 codes du mode Découverte conservés).
- **Correctif** : `scripts/gl-import-lore-feuillets.js` n'attendait pas (`await`) le parsing →
  l'import CLI n'écrivait rien silencieusement.
- **Tests** (`tests/gl-lore-import.test.js`) : compteur figé `144` remplacé par une assertion liée
  au nombre réellement parsé ; nouveaux tests « biome inconnu toléré » et « nom de feuille en casse ».
- **Doc** : `docs/API.md` (endpoint import feuillets), `data/gl/README.md`.

### Pipeline opérationnel — sauvegardes BDD, rollback auto, alertes email, tag/release auto

- **Sauvegarde BDD** : `scripts/db-backup.sh` (`mysqldump` compressé + rotation
  `BACKUP_RETENTION_DAYS`, dossier `backups/` non versionné). Snapshot **pré-migration**
  automatique dans `scripts/auto-deploy-cron.sh` avant `db:migrate`. Cron quotidien documenté.
- **Rollback auto** : si `post-deploy-check` échoue après redémarrage, le cron revient au
  commit précédent (`git reset --hard` + re-sync + `npm ci` + restart + re-check). Activé par
  défaut (`DEPLOY_AUTO_ROLLBACK=1`). Annule le code, pas une migration BDD déjà appliquée.
- **Alertes email** : `lib/mailer.js` → `sendOpsAlert()` + CLI `scripts/ops-alert.js` ; le cron
  alerte sur échec migration / restart non confirmé / post-deploy-check KO / issue du rollback.
  Sonde de disponibilité `scripts/uptime-check.sh` (alerte au changement d'état). Variables
  `OPS_ALERT_TO`, `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `DEPLOY_AUTO_ROLLBACK`,
  `DEPLOY_DB_PRE_MIGRATE_BACKUP` (voir `.env.example`).
- **Tag/release auto** : `.github/workflows/release-tag.yml` pose `vX.Y.Z` + GitHub Release
  (notes depuis le CHANGELOG) quand la version change sur `main` (idempotent).
- **Doc** : `docs/EXPLOITATION.md` (section « Sauvegardes, rollback et alertes »), `docs/VERSIONING.md`,
  `docs/CRONTAB.md` (mémo crontab serveur prêt à coller : deploy + sauvegarde + uptime).
- **Tests** : `tests/ops-alert.test.js` (`sendOpsAlert`, transport JSON).

### Pipeline build — garde-fou `dist/` à jour (CI + hook) et correctif sync miroir

- **CI `frontend-dist.yml`** : reconstruit le front à chaque PR/push et garantit que le
  `dist/` (+ miroirs CJS `lib/visit-pack/` & `lib/gl-pack/`) commité correspond aux sources —
  l'invariant du déploiement par `git pull` du cron. Sur une PR du dépôt, le `dist/` régénéré
  est **recommité automatiquement** ; sur push `main` ou PR de fork, le job **échoue** en
  garde-fou bloquant.
- **Hook `pre-push`** (`.githooks/pre-push`) : bloque en local tout push de modifications
  frontend (`src/`, `index.vite.html`, `vite.config.js`, `public/`) sans mise à jour de
  `dist/`, en complément du `pre-commit` (lint+format) existant.
- **fix sync miroir** : `scripts/sync-visit-pack-server-lib.js` copie désormais
  `gnome1-cut-manifest.js` et réécrit **tous** les imports `../data/…` → `./data/…`. Le
  miroir serveur `lib/visit-pack/visitMascotCatalog.js` était périmé (mascotte `gnome1`
  absente côté API alors qu'elle existe dans le front) → rebaseline complet de `dist/`.

### Réseau trophique — sens écologique de la flèche + graphe interactif

- **Sens écologique** : la flèche du réseau trophique est désormais orientée « est mangée par »
  (sens du flux d'énergie, de la ressource vers le consommateur). Inversion **par type**
  d'interaction via le nouveau noyau partagé `INTERACTION_TYPE_META` / `orientInteraction`
  (`lib/shared/foodWebCore.js`, miroir `src/shared/foodWebTypes.js`) : trophiques (`herbivorie`,
  `predation`, `decomposition`) inversés, dirigés (`pollinisation`, `plante_hote`, `nitrification`)
  conservés, mutuels (`symbiose`, `competition`) en double sens `↔`. Liste et graphe réordonnés en
  conséquence ; légende + repère de saisie dans le formulaire prof.
- **Graphe interactif** : têtes de flèches orientées, **zoom/pan** (molette + glisser), **nœuds
  déplaçables**, **mise en évidence au survol** (nœud/arête + voisins), **infos au survol** des
  arêtes (type + relation + description).
- **Réseaux simplifiés** : **mode focus** (clic sur une espèce → isole son voisinage direct),
  **disposition par niveau trophique** (producteurs → consommateurs → décomposeurs), filtres
  zone/type dynamiques, **export PNG/SVG** du réseau affiché.
- **API/BDD** : `GET /api/food-web` renvoie `from_role`/`to_role` (rôle trophique) ; migration
  idempotente `143_food_web_trophic_roles.sql` (vue `v_food_web` enrichie). **Doc** : `docs/API.md`.
- **Tests** : `tests/food-web-core.test.js` (méta + `orientInteraction`),
  `tests-ui/components/pedago/foodWebGraphModel.test.js` et `FoodWebGraph.test.jsx`.
### Carte — mascotte issue d'un pack serveur/importé (rendu)

- **fix** : la carte (`map-views`) résout et rend désormais une mascotte issue d'un **pack serveur publié** (`catalog_id` `srv-…`, ex. pack importé), au lieu de retomber sur le catalogue statique. Nouveau hook `useVisitMascotCatalogExtras` (récupère `GET /api/visit/content` → `mascot_packs` publiés → `extraCatalogEntries`), passés à `useMapViewMascot` et à `MapViewMascotOverlay` → `VisitMapMascotRenderer`. Traite le constat **A** de `docs/MASCOT_AUDIT.md`.
- **Tests** : `tests-ui/hooks/useVisitMascotCatalogExtras.test.jsx`, `tests-ui/utils/visitMascotPackExtras.test.js`.
### Visite — aperçu studio d'un pack mascotte brouillon (rendu tokenisé)

- **fix** : l'**aperçu global** du studio (`VisitMascotStudioPreviewSection`) applique désormais les `preview_url` signées au pack **en cours d'édition** (`applyPackAssetPreviewUrlsToSpriteCut` + `assetPreviewByFilename` du manager) → un **brouillon** s'affiche au lieu de retomber sur la silhouette (les `<img>` ne portent pas le JWT → 403 sur assets non publiés). Suite de l'audit `docs/MASCOT_AUDIT.md` (constat B, partiel). Constat **A** (carte éditeur sans `extraCatalogEntries`) documenté, à traiter avec validation UI.
- **Tests** : `tests-ui/utils/visitMascotPackManager.test.js` (`buildPackAssetPreviewByFilename`, `applyPackAssetPreviewUrlsToSpriteCut`).

### Visite — import pack mascotte publié par défaut (affichage immédiat)

- **fix** : un pack importé (`POST /api/visit/mascot-packs/import`, mode `create`) est désormais **publié par défaut** (`is_published = 1`) → visible immédiatement en visite (la visite publique ne sert que `is_published = 1`). Avant, l'import forçait un brouillon → mascotte invisible côté élève et `403` sur les assets. Override possible : `is_published: 0` (import en brouillon) ; `replace` conserve l'état du pack cible. Nouveau helper pur `resolveVisitMascotImportPublishState`.
- **UI** : case **« Publier dès l'import »** (cochée par défaut) dans le dialogue d'import ; libellé du mode `create` corrigé (« Nouveau pack »).
- **Audit** : `docs/MASCOT_AUDIT.md` (flux, cause racine, modèle de sécurité publié/brouillon, constats secondaires : carte éditeur sans `extraCatalogEntries`, aperçu global non tokenisé, gnome1 hors catalogue).
- **Tests** : `tests/visit-mascot-import-publish.test.js`. **Doc** : `docs/API.md`.
- **chore(format)** : `prettier --write` sur fichiers préexistants non conformes (débloque `format:check`).

### Visite — studio packs mascotte (import ZIP)

- **fix** : `rewriteVisitPackForServerImport` conserve des **basenames** dans `stateFrames.files` (`cell-r0-c0.png`) avec `framesBase` API — ne réinjecte plus d’URLs `/api/visit/mascot-packs/…/assets/…` (régression export/import site).
- **Tests** : `tests/mascot-pack-archive.test.js`.

### Visite — studio packs mascotte (références frames)

- **fix** : normalisation des `stateFrames.files` (chemins `/api/visit/…` → basenames), import catalogue → médiathèque pack (bouton gnome1 / renard2 / renard sac), silhouette **`gnome1`** reconnue, clone serveur **`gnome1`** via `clone_from_catalog_id`.
- **Tests** : extension `tests-ui/utils/mascotPackEditorFrames.test.js`.

### Visite — studio packs mascotte (aperçu brouillon)

- **fix** : les PNG d’un pack **brouillon** (`framesBase` `/api/visit/mascot-packs/{id}/assets/`) sont prévisualisables dans le studio via **`preview_url`** / query **`preview_token`** (HMAC, TTL ~1 h) — les balises `<img>` n’envoient pas le JWT Bearer.
- **Backend** : `lib/visitMascotPackAssetPreview.js`, routes `GET/POST` assets pack.
- **Frontend** : `VisitMascotPackManager`, `MascotPackRenderPreview`, vignettes WYSIWYG.
- **Tests** : `tests/visit-mascot-pack-asset-preview.test.js`, extension `tests/api.test.js` ; doc **`docs/API.md`**.

### Visite — mascotte gnome1 (pack importable)

- **feat** : pack mascotte `gnome1` (`sprite_cut`) — découpe planche pixel art 9×3, mapping 13 états visite, archive ZIP importable (`npm run mascot:gnome1-pack` → Téléchargements), entrée catalogue statique.
- **Scripts** : `mascot:gnome1-cut`, `mascot:gnome1-pack` ; pack source `docs/packs/gnome1-pack.json`.
- **Tests** : `tests/visit-mascot-catalog.test.js` (entrée `gnome1`).

### GL — pool QCM repère question (contenus chapitre)

- **fix(gl)** : le tirage `present-question` retrouve les questions sélectionnées dans le studio carte — synchro `eventDraft` à la sélection du repère, auto-save qui conserve le repère en édition, coches du pool (exclusion depuis « tout le pool »), aperçu admin aligné sur `selectedQuestionCodes`.
- **Tests** : `tests/gl-marker-present-question.test.js`, `tests-ui/gl/glMarkerEventEditorForm.test.js`.

### GL — carte plateau (sélection équipe, feuillets, musique)

- **feat(gl)** : clic sur la mascotte d’une équipe sur la carte pour la sélectionner (MJ / observateur).
- **fix(gl)** : arrivée feuillet — attente du chargement des zones déjà présentées avant auto-popover ; suivi local après présentation.
- **fix(gl)** : popover QCM repère masqué sans erreur si question déjà présentée (409) ou pool vide (404).
- **fix(gl)** : fondu musique zone/plateau — `clampAudioVolume` évite `IndexSizeError` sur volume hors [0, 1].
- **Tests** : `tests-ui/gl/GLBoardMascot.test.jsx`, `tests-ui/gl/clampAudioVolume.test.js`.

### Visite — mascottes (aperçu / catalogue)

- **fix** : priorité des packs serveur (`extraCatalogEntries`) sur le catalogue statique ; remount renderer à chaque changement de mascotte ; reset erreur image spritesheet au changement d’atlas.
- **Tests** : `tests/visit-mascot-catalog.test.js`.

### Studio packs mascotte — rendu final interactif

- **feat** : panneau **Rendu final** dans le studio packs (`MascotPackRenderPreview`) — scène cliquable, puces animations et comportements visite (même logique que la carte).
- **UI** : onglets Édition guidée et Comportements visite ; bouton **▶ Tester** par règle d’interaction ; outil pack autonome aligné.
- **Tests** : `tests-ui/components/mascot/MascotPackRenderPreview.test.jsx`.

### Correctif — `npm install` en production (hook `prepare`)

- **fix** : le hook npm `prepare` (`node scripts/setup-git-hooks.js`) ne fait plus échouer `npm install` lorsque le script de hooks est introuvable ou exécuté hors dépôt Git (hébergement CloudLinux/cPanel `nodevenv/.../lib`, installation via tarball ou CI). Ajout d'un garde-fou `|| exit 0` : l'installation des dépendances aboutit toujours en production, tandis que la configuration des hooks Git versionnés (`core.hooksPath = .githooks`, pre-commit lint + format) reste active en développement.
### GL — déplacement automatique (effet de case)

- **feat(gl)** : en parcours numéroté, les repères avec `deltaMove` déplacent automatiquement l'équipe le long du chemin lors de `present-arrival` / `apply-effects` ; les effets du repère d'arrivée ne sont pas déclenchés (`skipDestinationEffects`).
- **fix(gl)** : un auto-déplacement issu d’un repère ne peut plus être rejoué par double appel `present-arrival` (verrouillage équipe + détection de l’événement `move` d’origine).
- **Réglage** : `gameplay.marker_effect_auto_move_enabled` (toggle Réglages → Affichage carte plateau).
- **Utilitaires** : `advancePathIndexSigned`, `targetMarkerAfterPathSteps`, `markersAlongPathSteps`, `lib/glMarkerEffectAutoMove.js` ; animation front + registre `glMarkerArrivalSkip`.
- **Tests** : `tests/gl-marker-effect-auto-move.test.js`, `tests/gl-marker-effect-auto-move-unit.test.js`, `glBoardPathCore` (delta signé).

### GL — tour de jeu sur la carte et dés (1×/équipe/tour)

- **feat(gl)** : compteur de tour visible sur la carte (`GLBoardTurnHud`) et bouton **Nouveau tour** pour le MJ (même API `POST /turn/next`).
- **feat(gl)** : chaque équipe ne peut lancer les dés **qu'une fois par tour** quand `gameplay.turns_enabled=true` ; bouton dés désactivé si tour non lancé ou déjà lancé ; suppression du relancement dans le popover.
- **BDD** : migration `142_gl_team_dice_round.sql` (`gl_teams.last_dice_round_number`).
- **API** : `POST /api/gl/games/:id/teams/:teamId/dice-roll` (événement `dice_roll`) ; `GET /turn` expose `hasRolledDiceThisRound` par équipe.
- **Tests** : `tests/gl-game-dice-round.test.js`, `tests/gl-dice-roll.test.js`.

### GL — musique de zone (continuité inter-onglets)

- **fix(gl)** : la musique de zone, une fois déclenchée par le déplacement d'une équipe, continue sur tous les onglets ; elle ne redémarre plus au changement d'équipe observée et ne change qu'à l'entrée réelle dans une autre zone musicale (`useGLZoneMusicArrival`, `detectZoneMusicOnTeamMove`). Bouton mute global hors onglet Cartes.

### GL — emojis Souffle / Trame (sélecteur de variation)

- **fix(gl)** : la réparation mojibake ne transforme plus `U+FE0F` en `U+1FE0F` (affichait 🸏 / rectangle après 🌫 ou ➡️) ; annulation des données déjà corrompues (migration `141_gl_emoji_variation_selector_repair.sql`) ; couverture Noto `➡️`.

### GL — emojis Souffle / Trame (mojibake Excel)

- **fix(gl)** : réparation plateforme des emojis tronqués (U+F32B → 🌫️, U+F9F5 → 🧵) dans le grimoire chapitre, les repères plateau et l’import XLSX ; utilitaire partagé `emojiMojibakeCore`, pré-traitement markdown, normalisation `normalizeMarkerEmoji`, migration `140_gl_emoji_mojibake_repair.sql`, couverture police Noto (`🌫️`, `🧵`). Tests `tests/emoji-mojibake.test.js`.

### CI — résolution automatique des conflits de merge des PR

- **feat(ci)** : nouveau workflow `.github/workflows/auto-resolve-conflicts.yml` (push sur `main` + cron horaire + déclenchement manuel) qui vérifie les PR ouvertes vers `main` et **corrige automatiquement** les conflits récurrents et sûrs — `CHANGELOG.md` (union des entrées) et bumps de version `package.json` / `package-lock.json` (version la plus haute) — puis pousse la résolution. Les conflits de code restants sont signalés (label `merge-conflict` + commentaire listant les fichiers).
- **Script** : `scripts/auto-resolve-conflicts.js` (fonctions pures de résolution exportées et testées) ; option `AUTO_RESOLVE_DRY_RUN` pour simuler, `AUTO_MERGE_PAT` (secret optionnel) pour relancer la CI après push.
- **`.gitattributes`** : `CHANGELOG.md merge=union` — réduit les conflits dès les merges locaux.
- **Tests** : `tests/auto-resolve-conflicts.test.js` (union changelog, semver max, garde-fous version-only).
### GL — système de tour « mode classique »

- **feat(gl)** : la rotation séquentielle (une seule équipe active) est remplacée par des **tours globaux**. Le MJ lance un tour (`POST /api/gl/games/:id/turn/next` ou `/turn/start`) → événement `round_start` `{ roundNumber }` ; toutes les équipes jouent simultanément.
- **feat(gl)** : chaque équipe peut **déplacer sa mascotte une fois par tour** (réarmement au nouveau tour). Acteur réglable via `gameplay.mascot_move_actor` (`players` | `mj`, exclusif) ; route joueur `POST /api/gl/games/:id/teams/:teamId/move` ; `GET /api/gl/games/:id/turn` expose l'état (`hasMovedThisRound` par équipe).
- **feat(gl)** : **sortilèges avec approbation MJ** selon `gameplay.spell_cast_approval_mode` (`auto` | `mj_required` | `per_spell` → `gl_spells.approval_mode`). Un sort soumis par un joueur passe en `pending_approval` **sans débit** ; le MJ tranche via `POST /api/gl/games/:id/spell-casts/drafts/:draftId/resolve` (`accept` = débit + `spell_cast` ; `reject` = `spell_cast_rejected`).
- **feat(gl)** : **portée solo/collectif** des sorts (`gl_spells.cast_scope` = `solo` | `collective` | `any`).
- **Mode classique** : suppression du blocage « ce n'est pas le tour de votre équipe » sur QCM, actions joueur et sortilèges (joueurs libres de leurs actions).
- **BDD** : migration `139_gl_game_turn_classic.sql` (`gl_games.current_round_number`/`current_round_started_at`, `gl_teams.last_move_round_number`, table `gl_game_rounds`, `gl_spells.approval_mode`/`cast_scope`, colonnes d'approbation sur `gl_spell_cast_drafts`, réglages par défaut, permission `gl.mascot.position` accordée au profil joueur).
- **Réglages** : `gameplay.mascot_move_actor`, `gameplay.spell_cast_approval_mode` (lecture/validation `glSettings` + `PUT /api/gl/admin/settings`).
- **Front (mode classique)** : console MJ — indicateur de tour + bouton « Lancer le tour », file de validation des sortilèges (valider / refuser), badge « déplacée » par équipe. Vue joueur — bandeaux temps réel `round_start` / sort refusé, état « en attente du MJ » dans l'assistant de sortilège, action « Déplacer ma mascotte » (plateau libre, 1×/tour) quand `mascot_move_actor='players'`. Réglages — sélecteurs « Validation des sortilèges » et « Déplacement de la mascotte ». Endpoint MJ `GET /spell-casts/pending`.
- **Tests** : `tests/gl-game-turns.test.js` (réécrit mode classique), `tests/gl-game-turn-classic.test.js` (approbation sorts, portées, déplacement joueur 1×/tour, file MJ). Doc `docs/API.md`.

### Sécurité — élévation legacy & import carte non destructif

- **Correctif élévation legacy** : `POST /api/auth/teacher` exige désormais une session valide (`requireAuth`) et vérifie le PIN du **rôle RBAC courant réhydraté depuis la base**, empêchant l'utilisation d'un JWT non expiré portant un ancien `roleId` (après changement/révocation de rôle) pour obtenir une session élevée.
- **Correctif sûreté import carte** : le SQL généré (`lib/sqliteGardenSqlExport.js`, fichier exemple `data/import/foret-comestible-garden.sql`) n'abaisse plus `FOREIGN_KEY_CHECKS`, s'exécute dans une **transaction** (`START TRANSACTION` / `COMMIT`) et **nettoie explicitement** les liaisons tâches/projets/tutoriels/visite avant remplacement des zones/repères (plus d'orphelins ni de réattachement silencieux en cas de réutilisation d'id).
- **Tests** : `tests/auth.test.js` (non-régression PIN rôle courant vs JWT obsolète) et `tests/legacy-zone-shape-convert.test.js` (SQL transactionnel + nettoyage des dépendances).

### GL — sélection des classes pour la création de partie

- **fix(gl)** : une classe créée (ou (ré)activée) dans « Gestion utilisateurs » apparaît désormais immédiatement dans le sélecteur de classe de la console MJ, sans rechargement de page. `GLUsersAdminView` notifie `AppGL` (`onClassesChange`) qui resynchronise la liste partagée `classes`.
- **Tests** : `GLUsersAdminView` — appel de `onClassesChange` avec la liste rechargée.

### Qualité — CI vert (lint + format)

- **Correctif** : `src/gl/components/GLProfileEditor.jsx` — `useMemo` et `useDebouncedAutoSave` appelés après un `return` conditionnel (`react-hooks/rules-of-hooks`) ; garde `!profile` déplacée après tous les Hooks (comportement inchangé).
- **Config** : `eslint.config.cjs` — ajout de `tests/auto-save.test.js` à l'override `sourceType: 'module'` (corrige le `Parsing error`).
- **Format** : `prettier --write .` sur les fichiers non formatés introduits par les lots récents (étape CI `format:check`).

### Outillage — hook Git pre-commit (lint + format)

- **`.githooks/pre-commit`** : vérifie `prettier --check` et `eslint` sur les **fichiers stagés** avant chaque commit, pour éviter que `main` ne re-régresse sur les étapes CI `lint` / `format:check`. Contournement ponctuel : `git commit --no-verify`.
- **`scripts/setup-git-hooks.js`** + script npm **`prepare`** : active `core.hooksPath=.githooks` automatiquement après `npm install` (no-op hors dépôt Git).

### Emojis multi-périphériques (police auto-hébergée en fallback universel)

- **fix** : la police Noto Color Emoji de Google déjà auto-hébergée (`public/fonts/noto-color-emoji.woff2`, `@font-face 'ForetMapColorEmoji'`) est désormais ajoutée en **dernier recours** des stacks de texte courant (`--font-sans` ForetMap et GL, titres `h1/h2/h3`, `body.gl-body`). Les emojis s'affichent ainsi **quel que soit le périphérique**, y compris ceux dépourvus de police emoji native (certains Linux, vieux Android, navigateurs minimaux).
- **Perf** : la police restant prioritaire aux polices système et son `cmap` ne contenant que des emojis, elle n'est téléchargée **à la demande** (cascade par caractère) que lorsqu'aucune police emoji native ne couvre le glyphe — aucun surcoût sur les appareils déjà équipés.

### Responsive — homogénéité de l’affichage ForetMap

- **Espacements fluides** : nouveaux tokens `--space-page-x`, `--space-card`, `--space-card-lg(-x)` (`clamp`) appliqués aux conteneurs `.main`/`.teacher-main`, aux cartes `.task-card`, `.pin-card`, `.auth-card` et aux états vides `.empty` → moins de marges perdues sur petit mobile, confort conservé sur tablette/desktop.
- **Grilles dégradables** : `.stats-grid` et `.plant-form-grid` passent en `auto-fit` + `minmax(min(…, 100%), 1fr)` (plus de colonnes minuscules ni de débordement sur écran étroit) ; vignettes `.plant-photo-thumb` en largeur fluide `clamp(96px, 30vw, 140px)`.
- **Anti-débordement images** : garde-fou global `img, video { max-width: 100% }` (les règles dédiées restent prioritaires) ; `.profile-promo-card__glow` resserré pour ne pas dépasser le conteneur.

### GL — homogénéité responsive (console MJ, joueurs, écosystèmes)

- **fix(gl)** : padding fluide de `.gl-main` (`clamp(10px, 3vw, 16px)`) → moins de marge perdue sur petit mobile, confort conservé sur desktop.
- **fix(gl)** : `gl-admin-grid-2` (formulaires console MJ) en `minmax(min(170px, 100%), 1fr)` → la colonne se réduit au lieu de déborder sur écran étroit.
- **fix(gl)** : nom de joueur du roster (`gl-map-roster-player__name`) avec `min-width:0` + `overflow-wrap:anywhere` → un nom long ne pousse plus la vitalité hors écran.

### GL — création d’équipes (partiellement) aléatoire

- **feat(gl)** : répartition aléatoire **équilibrée** des effectifs d’une partie via `POST /api/gl/games/:id/roster/auto-assign`.
  - Mode `fill` (défaut) : seuls les joueurs non assignés sont répartis, les équipes déjà constituées sont conservées → mode « partiellement aléatoire ».
  - Mode `reset` : tous les joueurs actifs de la classe sont redistribués.
  - Paramètre `teamIds` optionnel pour restreindre les équipes cibles ; équilibrage des effectifs (écart ≤ 1).
- **Console MJ** : boutons « Compléter aléatoirement (N) » et « Tout redistribuer » dans le panneau Effectifs (`GLGameRosterPanel`).
- **Backend** : helpers purs `computeBalancedAssignments` / `shuffleInPlace` et `autoAssignRosterTx` dans `lib/glRoster.js`.
- **Tests** : `tests/gl-roster-balance.test.js` (unitaires purs) et flux route dans `tests/gl-games-roster.test.js` ; doc `docs/API.md`.

### GL — déplacement au dé (repères numérotés)

- **fix(gl)** : la mascotte traverse chaque repère intermédiaire dans l’ordre (plus de saut direct) ; ancrage centré sur le repère à chaque étape (`snapCenter`, coordonnées exactes sans clamp viewport).
- **Utilitaire** : `markersAlongDicePath` ; `moveTeamAlongPath` dans `useGLBoardMascotMotion` ; tests `glBoardPathCore`, `glDicePathAdvance`, `useGLBoardMascotMotion`.

### GL — auto-save formulaires admin

- **Admin GL / ForetMap** : enregistrement automatique debouncé (800 ms) sur les formulaires d’édition via `useDebouncedAutoSave` + indicateur `AutoSaveStatus`.
- **Tests** : `tests/auto-save.test.js`, `tests-ui/shared/AutoSaveStatus.test.jsx`.

### GL — numéros de parcours sur les repères (partie)

- **Réglage** : `gameplay.plateau_marker_numbers_visible` ; toggle dans Réglages → Affichage carte plateau ; doc `docs/API.md`.
- **Partie** : numéros affichés si mode `numbered_path` actif et réglage plateforme activé (`glPlateauMapVisibility`).
- **fix(gl)** : clé autorisée côté `PUT /api/gl/admin/settings` (`adminRouteHelpers`) pour persister le toggle.
- **Tests** : `gl-admin-helpers` — décompte 24 clés gameplay.

### Build production

- **fix(gl)** : le panneau de configuration (liste zones/repères, export JSON) s’affiche sous la carte au lieu d’un overlay `position: fixed` qui se déplaçait de façon incohérente (admin chapitres et mode debug `?editPlateau=1`).
- **Refactor** : `GLPlateauMapEditor` scindé en `Provider` / `MapLayer` / `Panel`.

### Visite — correctifs onglet Packs mascotte

- **fix** : garde anti-perte des modifications (Actualiser, changement de carte, navigation onglet prof, draft JSON non appliqué, suppression).
- **fix** : héritage des bulles de dialogue via `clonedFromCatalogId` (plus `srv-{uuid}`).
- **fix** : multi-copies catalogue — « Éditer la copie » ouvre le pack sélectionné ou le plus récent.
- **fix** : lien Visite → studio aligne la carte active ; mode Dialogues utilise `allowed_catalog_ids` serveur.
- **fix** : import bibliothèque carte harmonisé (PNG redimensionné, `image/*`).
- **Tests** : `visitMascotPackManager`, `MascotPackListAside`.

### GL — numéros zones feuillets (admin chapitres)

- **Admin Contenus** : numéros (1, 2, 3…) sur les poignées de déplacement, les labels SVG et la liste « Zones feuillets », triés par code feuillet puis `zone_id`.
- **Utilitaire** : `glFeuilletZoneNumbers.js` ; tests `GLPlateauMapEditor`, `glFeuilletZoneNumbers`.
- **test(gl)** : fixture viewport `glDicePopoverPosition` (hauteur 900 px) pour valider l’absence de recouvrement plateau.

### GL — studio carte chapitre et dé numéroté

- **Admin Contenus** : numéros de parcours (1, 2, 3…) sur les repères de la carte et dans la liste « Repères » du studio chapitre, triés par `order_index`.
- **Partie** : jet du dé virtuel en mode `numbered_path` déplace la mascotte repère par repère le long du chemin et planifie le popover repère (question / effet) à l’arrivée finale.
- **Utilitaire** : `glDicePathAdvance.js` (plan d’avancement après jet de dés) ; tests `glDicePathAdvance`.
- **UI** : popover du dé virtuel repositionné pour ne pas masquer la carte plateau (`glDicePopoverPosition`).
- **Tests** : `GLChapterMapStudio`, `GLBoardMarkers`, `GLGameBoard`, `glDicePopoverPosition`.

### GL — correctifs admin Contenus (QCM lore + glossaire)

- **fix(gl)** : `GET /api/gl/lore/glossary/link-index` — route déclarée avant `/glossary/:code` (sinon 404 « Terme introuvable »).
- **fix(gl)** : migration QCM lore renommée `138_gl_qcm_lore.sql` (conflit avec `120_gl_chapters_plateau_number.sql` : la table `schema_version` ne déclenchait jamais la création des tables `gl_qcm_lore_*`, d’où les 500 sur `/api/gl/lore/qcm/categories` et `/scopes` en prod).
- **Tests** : `tests/gl-lore-feuillets.test.js` (link-index), `tests/migrations-unique-numbers.test.js`.

### GL — déplacement repères numérotés + dé

- **Partie** : réglages `board_movement_mode` (`free` | `numbered_path`) et `board_path_start_index` (0 ou 1) sur `gl_games` (migration `137_gl_board_movement.sql`) ; formulaire console MJ « Déplacement sur le plateau ».
- **Mode repères numérotés** : repères affichés avec numéro (ordre `order_index`) ; au démarrage, placement de toutes les équipes sur le repère de départ ; le MJ avance via le dé virtuel (total = nombre de cases) ; déplacement libre clic carte/repère désactivé (API `409`).
- **Module** : `glBoardPathCore` ; tests `tests-ui/gl/glBoardPathCore.test.js`, `glGameEditForm.test.js`.

### GL — effets vitalité des repères à l’arrivée

- **Arrivée sur repère** : `POST .../present-arrival` applique automatiquement les bonus/malus cœurs (❤️) et gemmes (💎) à **chaque joueur de l’équipe** (même mécanique que les zones feuillets et les sortilèges côté solde par joueur), une seule fois par repère et équipe (`marker_effect`).
- **API** : réponse enrichie `vitality: { applied, alreadyApplied, healthDelta, powerDelta, results, target }` ; `POST .../apply-effects` accepte `playerIds[]` optionnel pour cibler des joueurs ; refus `409` si déjà appliqué.
- **UI** : popover repère affiche l’application automatique ; bouton MJ conservé en secours si la vitalité n’a pas pu s’appliquer.
- **Module** : `lib/glMarkerVitalityEffects.js` ; tests `tests/gl-marker-vitality-effects.test.js`, `tests/gl-marker-present-arrival-vitality.test.js`.

### ForetMap + GL — lightbox image globale

- **Clic image** : `ImageLightboxProvider` (ForetMap + GL) ouvre la lightbox partagée `fm-lightbox-*` sur les illustrations et photos standalone (légende via `figcaption` / `alt`, repli `data-lightbox-src`).
- **Exclusions** : cartes interactives, mascottes, uploads, boutons/labels, logos ; opt-out `data-no-lightbox`.
- **Visite** : aperçu éditorial unifié sur `ImageLightbox` (suppression du doublon local).
- **Tests** : `tests/image-lightbox-click.test.js`, `tests-ui/shared/ImageLightboxProvider.test.jsx` ; override ESLint ESM pour le test node.

### GL — onglets Écosystèmes et Biodiversité

- **Navigation** : l’onglet « Biotope » devient **Écosystèmes** (`ecosystemes`) ; « Biocénose » devient **Biodiversité** (`biodiversite`), aligné sur ForetMap. Redirection des identifiants mémorisés (`biotope` → `ecosystemes`, `biocenose` → `biodiversite`).
- **Écosystèmes** : biotope et biocénose (textes + illustrations) regroupés par écosystème catalogue ; découpage markdown par titres `##` si plusieurs biomes.
- **Biodiversité** : catalogue espèces seul (fiches des êtres vivants) ; illustrations biocénose déplacées vers Écosystèmes.
- **Aide contextuelle** : clés `tab:ecosystemes` / `tab:biodiversite` (repli legacy admin).
- **Tests** : `glEcosystemSections`, `GLEcosystemsView`, `GLBiodiversityView`, `glAppShellHelpers`, `gl-help-content`.

### GL — édition chapitres (images et emojis repères)

- **Markdown admin** : résolution legacy `gl-*` et `scene:N` dans `GLRichTextEditor` (Contenus → Chapitres) — même logique que les pages joueur ; round-trip via `data-gl-md-src`.
- **Carte chapitre** : aperçu formulaire, studio repères et éditeur de cadre utilisent `resolveGlBoardImageUrl` (URLs legacy remappées) ; repli sur le fond convention plateau quand `map_image_url` est vide (migration 133).
- **Emojis repères** : retrait de `foretmap-emoji-text-mixed` sur carte/liste ; pile `--font-emoji-stack` sur l’input emoji du studio ; couverture police (`🌿`, `⭐`, `🚩`, `❓`).
- **Tests** : `tests-ui/gl/glMarkdownEditorDisplay.test.js`, extensions `GLRichTextEditor`, `GLBoardMarkers`, `GLChapterMarkerListVisual`.

### GL — panneau équipes/joueurs sur la carte

- **API** : `GET /api/gl/games/:id` inclut `roster` (joueurs assignés par équipe ; `healthPoints` / `powerPoints` si vitalité active).
- **UI** : panneau latéral responsive (droite desktop, dessous mobile) sur l’onglet Cartes — noms, ❤️/💎, badge « Tour », joueur courant mis en évidence ; masqué en plein écran.
- **Correctif** : `toGameViewModel` préserve `vitality` (top bar joueur).
- **Tests** : `tests/gl-games-roster.test.js`, `tests-ui/gl/GLGameBoardRoster.test.jsx`, `buildMapRosterGroups.test.js`, e2e `gl-game-flow.spec.js`.
- **Doc** : `docs/API.md`.

### Qualité — lint ESLint vert

- **Config** : `eslint.config.cjs` — ajout des tests ESM `map-overlay-scale`, `map-overlay-typography`, `pct-polygon`, `qcm-feedback` à l'override `sourceType: 'module'` (corrige les `Parsing error` qui bloquaient le job CI), + déduplication de la liste.
- **Correctif** : `src/App.jsx` — onglet « foodweb » passait `mapZones={mapZones}` (variable inexistante) ; corrigé en `mapZones={zones}` comme les autres usages de `FoodWebViewLazy`.
- **Correctif** : `src/gl/components/GLQcmPopover.jsx` — `useMemo` appelés après un `return` conditionnel (violation `react-hooks/rules-of-hooks`) ; hooks remontés avant l'early return (comportement inchangé).

### Outillage IA — CLAUDE.md & skills Claude Code

- **`CLAUDE.md`** : mémoire projet pour Claude Code (vue d'ensemble, architecture, commandes,
  conventions, pièges critiques, workflow Git) ; synthèse renvoyant à `.cursor/` et `docs/` comme
  sources de vérité pour éviter la dérive.
- **`.claude/skills/`** : jeu de 7 skills natifs Claude Code (`foretmap-context`, `foretmap-database`,
  `foretmap-testing`, `foretmap-gl`, `foretmap-biodiversity`, `foretmap-observability`,
  `foretmap-release`), adaptés des règles/skills Cursor existants.

### Studio Packs mascotte — sprites site, export et aperçu

- **API** : `DELETE /api/visit/mascot-assets/public` — suppression des fichiers statiques sous `public/assets/mascots/` (auth `visit.manage` + élévation PIN).
- **Panneau Images** : filtre « Site » limité au catalogue public ; suppression contextuelle (site / pack courant / bibliothèque carte) ; boutons **Copier URL** et **Télécharger** rétablis.
- **Correctifs** : import bibliothèque carte sans pack sélectionné ; aperçu global remonte au changement de mascotte (`key` sur le renderer Rive/sprites) ; brouillon du pack en cours reflété dans l’onglet **Aperçu global**.
- **Tests** : `tests/api.test.js`, `tests-ui/components/mascot/MascotPackImagesPanel.test.jsx`, extensions `visitMascotPackManager.test.js` et `VisitMascotStudioPreviewSection.test.jsx`.
- **Doc** : `docs/API.md`.

### Carte — ratio repères / plateau (ForetMap + GL)

- **Module partagé** : `src/shared/mapOverlayScale.js` — facteur `(fitHeightPx / 480) × (sizePercent / 100)` ; refactor `resolveMapOverlayTypography` (hauteur affichée du plan au lieu de `inv`).
- **ForetMap** : carte tâches et visite — repères proportionnels au plan ; visite sans contre-échelle zoom sur `.visit-marker-btn`.
- **GL** : repères plateau via `--map-overlay-scale` sur `GLPctMapCanvas` ; contexte `GlMapOverlaySettingsProvider`.
- **Réglage** : `ui.map.plateau_marker_size_percent` (50–200, défaut 100), éditable admin ForetMap et réglages GL (`PUT /api/gl/admin/settings/ui.map.plateau_marker_size_percent`).
- **Tests** : `tests/map-overlay-scale.test.js`, `tests/map-overlay-typography.test.js`, extensions `settings.test.js` / `gl-settings.test.js`.

### GL — unification boutons carte plateau

- **Composants** : `GLBoardActionButton` (rôles `primary` / `display` / `tool`) et `GLBoardChrome` (docks coins, barre mobile, fermer plein écran).
- **Style** : famille visuelle unifiée dans `gl-theme.css` (`.gl-board-action*`, `.gl-board-chrome*`).
- **Agencement** : outils (dés, musique) ancrés dans `gl-board-shell` ; toggle musique zones corrigé (plus de positionnement fragile hors shell).
- **Refactor** : `GLGameBoardHud`, `GLVirtualDiceDock`, `GLZoneMusicMuteButton`, `GLGuestDemoBoard` ; suppression `GLGameBoardHudToolbar`.

### GL — fonds des repères configurables (défaut transparent)

- **Réglage** : `gameplay.marker_backgrounds` (`{ label, emoji, icon }`) — transparent (défaut), `classic` (orange/blanc historique) ou couleur hex `#RRGGBB` par mode.
- **UI** : Réglages plateforme GL → « Affichage carte plateau » → « Fond des repères sur la carte ».
- **Runtime** : variables CSS `--gl-marker-bg-*` sur `.gl-app` ; exposé via `GET /api/gl/gameplay-settings` (`markerBackgrounds`).
- **Tests** : `tests/gl-marker-backgrounds.test.js`, extension `tests/gl-settings.test.js`, tests UI `glMarkerBackgrounds`, `glSettingsForm`, `GLSettingsView`.

### Réglages — désactivation des signalements

- **Réglage** : `ui.modules.reports_enabled` (public, défaut `true`) dans Paramètres admin → section Modules.
- **Effet** : masque les contrôles « Signaler » (forum, commentaires de contexte) et refuse `POST …/report` avec `403` / `code: "REPORTS_DISABLED"` (y compris GL context-comments).
- **Tests** : `tests/forum.test.js`, `tests/context-comments.test.js`, `tests/settings.test.js`, tests UI `ContextCommentItem` / `ForumPostCard`.

### Admin — édition des bulles d'aide (ForetMap + GL)

- **ForetMap** : registre `content.help.registry` (tooltips, panneaux ?, mini-astuces, libellés chrome, bandeaux carte, infobulles temps réel prof) ; sous-onglet **Bulles d'aide** dans Réglages admin ; API `GET/PUT/POST reset /api/settings/admin/help-content` ; défauts `data/help.default.json`.
- **GL** : registre `content.help` par onglet (`tab:{id}`) ; sous-onglet **Bulles d'aide** dans Contenus admin ; API `GET/PUT/POST reset /api/gl/admin/content/help` et lecture `GET /api/gl/content/help`.
- **Runtime** : `src/utils/helpResolve.js` (ForetMap), `useGlHelpContent` + `GLTabHelpPanel` (GL).
- **Tests** : `tests/help-content.test.js`, `tests/gl-help-content.test.js`, `tests/gl-help.test.js`, `tests-ui/shared/helpResolve.test.js`, extension `tests/settings.test.js`.

### Correctif — plein écran carte (fond vert sans plan)

- **Cause** : après portail `body`, le cadre carte pouvait rester à ~1×1 px (`MapView`, calcul via `.main` absent) ou conserver d’anciennes dimensions pixels (`VisitView`).
- **MapView** : `resolveMapLayoutAvailBox` + prop `mapFullscreen`, `remeasureMap` / `useLayoutEffect`, repli viewport.
- **Visite** : calque `visit-map-fit-layer` en 100 % en immersion ; recentrage zoom à l’entrée plein écran.
- **Styles** : shell plein écran en flex (remplissage viewport).
- **Tests** : `tests-ui/shared/resolveMapLayoutAvailBox.test.js` ; e2e visite (image visible en plein écran).

### Packs mascotte — archive ZIP portable (visite + GL)

- **Format** : `foretmap-mascot-pack-archive` v1 (`manifest.json`, `pack.json`, `assets/`) — module `lib/mascotPackArchive.js`.
- **API visite** : `GET …/export.zip`, `POST …/import/analyze`, `POST …/import` (`create` / `replace`).
- **API GL** : routes équivalentes sous `/api/gl/mascots/packs/…`.
- **UI** : boutons Export/Import ZIP dans le studio visite (`MascotPackListAside`) et GL (`GLMascotPackManager`) ; modale partagée `MascotPackArchiveImportDialog`.
- **Tests** : `tests/mascot-pack-archive.test.js`, extension `api.test.js` et `gl-mascots.test.js`.
- **Doc** : `docs/MASCOT_PACK.md` (section Archive ZIP), `docs/API.md`.

### Packs mascotte visite — audit UX (quick wins)

- **Libellés FR** : aperçu global (boutons d’état), sélecteur de prévisualisation WYSIWYG et fiche récap utilisent `STATE_LABELS` au lieu de clés techniques / anglais.
- **Actions** : boutons Enregistrer / Publier désactivés tant que la validation Zod échoue (infobulle explicative).
- **Accessibilité** : onglets éditeur avec `aria-controls` / `tabpanel` ; retours copie JSON et messages upload en `role="status"`.
- **Mobile** : mise en page studio empilée ≤768px, zones tactiles 44px sur onglets et actions frames.
- **Modifications non enregistrées** : bannière + surbrillance Enregistrer, confirmation avant changement de pack/mode, garde `beforeunload`.
- **Panneau Images unifié** : fusion médiathèque pack, bibliothèque carte et assets site (`MascotPackImagesPanel`) avec filtre par origine et insertion unique vers l’état cible.
- **Tests** : extension `MascotPackListAside.test.jsx`, `visitMascotPackManager.test.js`.

### ForetMap — plein écran carte (aligné GL)

- **Visite** : le bouton « Plein écran » porte la carte en viewport complet (portail `body`, fermeture **Fermer** / **Échap**, préférence persistée) ; remplace l’ancien agrandissement « Plein plan ».
- **Carte jardin (`MapView`)** : bouton **Plein écran** dans la barre d’outils ; même mécanisme portail + modales au-dessus.
- **Partagé** : `useMapFullscreen`, `MapFullscreenShell`, styles `map-fullscreen.css`.
- **Tests** : `tests-ui/shared/useMapFullscreen.test.js` ; e2e `visit-mode.spec.js`, `teacher-auth-map.spec.js`.

### Mutualisation ForetMap ↔ GL (composants partagés)

- **QCM feedback** : logique unifiée dans `src/shared/qcm/qcmFeedback.js` ; `PedagoQcmFeedbackBlock` et `glQcmDisplay.js` réexportent le module partagé.
- **DialogShell** : déplacé vers `src/shared/components/DialogShell.jsx` ; réexport de compatibilité dans `src/components/DialogShell.jsx`.
- **MediaLibraryMenu** : déplacé vers `src/shared/components/MediaLibraryMenu.jsx` ; réexport dans `src/components/MediaLibraryMenu.jsx`.
- **Tests** : `tests/qcm-feedback.test.js`.

### GL — glossaire dans les questions QCM (popover)

- **Clic terme / terme lié** : énoncé, choix et feedback hyperliés ; puces « Glossaire » / « Lexique lore » ouvrent le popover de définition (plateau et admin Contenus → QCM).
- **Fusion index** : termes liés à la question (`glossaryTerms` / `loreGlossaryTerms`) complètent l’index d’auto-lien pour couvrir les mots-clés hors biome courant.
- **Utilitaires** : `mergeGlossaryLinkItems`, `mergeLoreGlossaryLinkItems`.
- **Tests** : extension `gl-glossary-autolink.test.js`, `GLQcmPopover.test.jsx`.

### GL — affichage des icônes de repères sur le plateau

- **Emojis** : police Noto Color Emoji préchargée, variables `--font-emoji-stack` dans `gl-base.css`, `font-variant-emoji` sur les repères ; restauration de `foretmap-emoji-text-mixed` (évite rectangles / glyphes incorrects sous Caudex).
- **Icônes image** : résolution des clés stables médiathèque via `resolveGlMarkerIconDisplayUrl` / `useResolveGlMarkerIconDisplayUrl` (legacy `gl-*`, `local:/`, `/uploads/`) ; acceptation des clés stables dans `normalizeIconUrl`.
- **Tests** : `tests-ui/gl/resolveGlMarkerIconDisplayUrl.test.js`, extension `GLBoardMarkers.test.jsx`.

### GL — duplication repères et zones (studio carte chapitre)

- **Repères** : bouton « Dupliquer » dans la liste et le formulaire ; copie label « (copie) », position décalée (+3 %), événement et apparence conservés.
- **Zones royaume** : bouton « Dupliquer » dans la liste et le panneau d’édition ; copie contour (décalé), couleur, popover et musique.
- **Utilitaires** : `glMapDuplicate.js`, `markerDuplicatePayloadFromMarker`, `zoneDuplicateCreatePayloadFromZone`.
- **Tests** : `tests-ui/gl/glMapDuplicate.test.js`, extension `GLChapterMapStudio.test.jsx`.

### Build — correctifs imports et artefacts `dist/`

- **FMQuizCatalogPanel** : chemins `api` / `downloadApiFile` corrigés (`../../../`).
- **Quiz admin ForetMap** : liste complète du catalogue par défaut avec filtres, tris, import/export XLSX ; édition manuelle des questions (`FMQuizQuestionEditorPanel`, API `GET|POST|PUT /api/quiz/admin/questions*`).
- **useGlMarkdownWithLegacyMedia** : import `applyGlLegacyMediaRefs` depuis `glLegacyMediaUrl.js`.
- **dist/** : build production régénéré (ForetMap + GL).

### GL — déplacement zones feuillets et repères au clic

- **Placement au clic** : sélectionner une zone feuillet ou un repère puis cliquer sur la carte (curseur crosshair) ; glisser-déposer des zones conservé.
- **Plateau en partie** : mode `?editPlateau=1` (alias `?editFeuilletZones=1`) — panneau unifié zones + repères ; repères persistés via API admin.
- **Admin chapitres** : repère sélectionné déplaçable au clic dans le studio carte ; section « Zones feuillets — plateau N » avec export JSON.
- **Utilitaires** : `translateFeuilletZoneToPoint`, hook `useGlPlateauClickPlacement`, composant `GLPlateauMapEditor`.
- **Tests** : `tests/pct-polygon.test.js`, `tests-ui/gl/GLPlateauMapEditor.test.jsx`, `GLChapterMapStudio.test.jsx` ; doc `docs/GL_FEUILLET_ZONES.md`.

### GL — mise en page (images, texte éditorial, admin)

- **Images markdown** : rendu wrap+fill (`gl-content-image-wrap`) aligné sur le hub marque ; post-traitement dans `renderMarkdownToSafeHtml` / `sanitizeRichHtml`.
- **Texte éditorial** : largeur prose portée à 90 % (titres h2–h4 inclus) au lieu de 72ch.
- **Bannières pages** : `GLBrandPageBanner` en wrap+fill ; garde-fous WYSIWYG, popover zones, table bibliothèque contenu.
- **Admin responsive** : grille chapitres 1 col à ≤1024px ; grille cadre image 1 col à ≤520px.
- **Tests** : `tests/markdown.test.js`, `tests-ui/gl/GLRichTextEditor.test.jsx` ; doc `docs/GL_IMAGE_FRAMES.md`.

### Biodiversité pédagogique (glossaire, QCM, réseau trophique)

- **Migrations** : 122–132 (taxonomie plants, junction `*_species`, interactions/vues, glossaire, quiz ; **129** retrait colonnes legacy plants ; **130** retrait JSON `living_beings` ; **131** audit_log utf8mb4 ; **132** correctif AUTO_INCREMENT).
- **Import** : `npm run db:import:biodiv` (scripts + `sql/foretmap_bdd_complete.sql`).
- **API** : `/api/glossary`, `/api/quiz`, `/api/food-web` ; fiches plantes enrichies (`/:id/interactions`, `/glossary-terms`, `/quiz-questions`).
- **Lecture espèces** : `zone_species`, `marker_species`, `task_species` uniquement (plus de dual-write JSON).
- **Post-migration 130** : retrait résiduel de `living_beings` (tâches récurrentes, duplication projet, sync visite, propositions élève) ; import OpenAI species autofill ; tests quiz/plants-import alignés.
- **Schéma / seed** : `sql/schema_foretmap.sql` et seed `database.js` alignés sur le contrat post-129/130.
- **Scripts** : `scripts/backfill-gbif-keys.js`, `scripts/fix-auto-increment.js` (`npm run db:fix-auto-increment` si documenté).
- **UI élève** : Glossaire, Quiz, réseau trophique (libellés interactions alignés enum SQL), fiches espèces enrichies.
- **Tests** : `biodiv-read-model`, `glossary-api`, `glossary-search`, `quiz-api`, `food-web-api`, `plant-payload-sync`, `species-junction-read` ; e2e `pedago-quiz`, `pedago-food-web`, `pedago-glossary`.
- **Quiz — visibilité et admin prof** : onglet Quiz (élève : après Biodiversité ; prof : onglet dédié) ; catalogue import/export XLSX (`lib/fmQuizImport.js`, `plants.manage` + élévation) ; `GET /api/quiz/questions`, `/api/quiz/admin/*` ; panneau partagé `src/shared/qcm/` (GL + FM) ; tests `fm-quiz-import`.

### GL — images plateau / histoire (URLs legacy)

- **Médiathèque** : `npm run gl:import:media` + `npm run gl:audit:media-keys` ; résolution convention `plateau-N_*` / `recit_0N-chapN_*` via `_keys.json`.
- **Runtime** : priorité convention sur `map_image_url` legacy (`gl-plateau-*`) ; réécriture markdown `gl-*` (Histoire, Biotope, Biocénose).
- **Migration BDD** : `npm run gl:migrate:chapter-media -- --apply` ; migration SQL `133_gl_chapter_media_legacy_cleanup.sql` (héros → `scene:1`, feuillets copiste).
- **Tests** : `gl-legacy-media-url`, `gl-migrate-chapter-media`.

### GL — Mode Découverte (visiteur sans compte)

- **Auth** : `POST /api/gl/auth/guest` (token `gl_guest`, permission `gl.read` seule) ; `guestModeEnabled` dans `GET /api/gl/auth/config` ; désactivation via `platform.guest_mode_enabled=false` ou `GL_GUEST_MODE_DISABLED=1`.
- **Sécurité** : `requireGlAuth` refuse explicitement les invités (`guestBlocked`) ; `GET /api/gl/lore/demo-feuillets` (allowlist `ep-I-01`…`04`, indépendant du module carnet).
- **Front** : bouton « Découvrir sans compte », shell réduit (Monde, Règles, Découverte, glossaire SVT, biotope/biocénose), plateau P1 en bac à sable client (dé + 4 feuillets + mur de fin).
- **Tests** : `tests/gl-guest-mode.test.js`, `e2e/gl-guest-discovery.spec.js` (parcours dé → feuillets → mur de fin).

### Tests e2e (stabilisation des 13 échecs)

- **Fixtures partagées** (`e2e/fixtures/auth.fixture.js`) : sélecteur « Nouvelle tâche » via `hasText` (évite le blocage Playwright sur `getByRole` avec `+`) ; onglet Tâches robuste (split desktop « Cartes & tâches ») ; modales tâche via `aria-label` ; carte zone (`waitForTeacherMapReady`, repli clic) ; `disableTeacherMode` via cadenas header ; `createTeacherTask({ skipReload })`.
- **Scénarios** : `modals-responsive` (fixtures unifiées, timeouts réduits, fermeture modale) ; `teacher-auth-invalid-pin` (attente API 401) ; `gl-users-admin` (wait impersonate + bannière 20 s) ; `realtime-multi-session` / cycles tâches (`serial`, skip reload).
- **Playwright** : `retries: 1` en local. Suite complète : **84 passés**, 1 ignoré.

### GL — scènes de récit des chapitres (répartition automatique des images de l'Histoire)

- **Convention partagée** : préfixes `recit_0N-chapN_*` / `recit_00-prologue_*` centralisés dans `src/gl/utils/glChapterRecitConvention.js` (une seule source client + serveur : resolver assets, audit, scanner d'usage) ; bornes de chapitres en constantes (`GL_CHAPTER_RECIT_MIN/MAX`).
- **Visibilité admin (anti-suppression accidentelle)** : le scanner d'usage médiathèque détecte désormais les liaisons **par convention** (scènes de récit → « Histoire — chapitre N », feuillets de Sélène, fonds/musiques de plateau, biomes, clés intro) — ces médias ne s'affichent plus « Inutilisée » (`lib/mediaLibraryUsage.js`, `conventionLocationsForItem`/`collectConventionUsage`).
- **Audit dans l'admin** : `GET /api/gl/admin/media-library/audit` + section **Audit des conventions** (Contenus → Bibliothèque) — ressources requises manquantes et **clés `recit_*` suspectes** (typos rendant l'image invisible en jeu, `findSuspectRecitKeys`, aussi dans `npm run gl:audit:media-keys`).
- **Métas éditoriales de scène** (sans renommer les fichiers) : légende (`recitCaption`, alt + figcaption), ordre d'affichage (`recitOrder`), couverture explicite (`recitCover`, exclusive par chapitre — illustre la Biocénose et le repli plateau) stockées dans `_keys.json` ; panneau **Contenus → Chapitres → Scènes de récit** (aperçus + édition), API `GET /api/gl/admin/media-library/chapter-scenes?chapter=N`, `PATCH /api/gl/admin/media-library/scene-meta` ; métas préservées au ré-import d'un fichier homonyme (`lib/glChapterScenes.js`, `updateMediaKeyMeta`).
- **Intercalage dans le récit** : syntaxe `![légende](scene:N)` dans le markdown de l'Histoire — la N-ième scène conventionnelle est insérée dans le texte et quitte la galerie de fin (`src/gl/utils/glStorySceneRefs.js`, `GLHistoryView`, prop `excludeKeys` de `GLChapterScenes`).
- **Collisions de clé stable** : un upload qui ré-pointe une clé existante vers un autre fichier renvoie un avertissement `stable_key_collision` (affiché dans la bibliothèque) au lieu d'écraser en silence.
- **Manifestes runtime** : fetch en `no-cache` (revalidation ETag, réutilisation du cache navigateur) au lieu de `no-store` ; un échec réseau ne fige plus la session sur le repli embarqué (retry au montage suivant).
- Tests : `tests-ui/gl/glChapterRecitConvention.test.js`, `tests-ui/gl/glStorySceneRefs.test.js`, extensions `tests-ui/gl/glChapterIllustration.test.js` (tri), `tests/media-library-usage.test.js` (usage convention), `tests/gl-media-chapter-link.test.js` (collision, métas, typos). Doc `data/gl/README.md`.

### Import carte (fork SQLite)

- **Export zones/repères forêt** : conversion fork SQLite → SQL MySQL (`lib/legacyZoneShapeConvert.js`, `lib/sqliteGardenSqlExport.js`, `npm run export:sqlite-garden`) — polygones %, `living_beings` depuis `cultures`, `map_id=foret` ; fichier exemple `data/import/foret-comestible-garden.sql` ; migration `migrate:sqlite-to-mysql` alignée ; tests `tests/legacy-zone-shape-convert.test.js` ; devDep `better-sqlite3`.

### Performance & sécurité (audit optimisation — `docs/AUDIT_OPTIMISATION.md`, items O1-O14)

- **Bundle (O1, O11)** : `VisitMapMascotRenderer` charge le renderer sélectionné via `React.lazy`/`Suspense` — `rive` (~166 Ko) et `sprite_cut` (~102 Ko) quittent le preload initial de la Carte (seul le renderer monté est téléchargé) ; vues GL d'onglet en `lazy` (chunk `gl` 501→255 Ko) ; **`foretmap-views`/`stats-views` rendus purement lazy** (chunk `main` 431→315 Ko, gzip 111→81) ; `vite.config` `sourcemap: false` en build prod (~6 Mo de `.map` évités).
- **Build (correctif)** : `scripts/build-asset-manifest.mjs` ne **rétrécit plus** le manifest GL committé (`src/gl/assets/manifest.images.json`) quand la médiathèque GL n'est pas importée (CI / conteneur sans média) — évite des illustrations GL vides dans le bundle.
- **Tâches (O10)** : `replaceTaskJoinRows` — un INSERT multi-valeurs pour zones/repères/tutoriels/référents au lieu de boucles N+1.
- **Tableurs / sécurité (O4)** : remplacement complet de **`xlsx`@0.18.5** (CVE-2023-30533 prototype pollution + CVE-2024-22363 ReDoS) par un adaptateur **exceljs** (`lib/spreadsheet.js`), prouvé équivalent sur les vrais classeurs (`tests/spreadsheet-xlsx-equivalence.test.js` ; exceljs lit même correctement les emoji que xlsx mojibakait). **14 modules d'import/export migrés** : app principale (élèves, plantes, tâches) + 11 libs G&L (`gl*Import.js`) + `contentLibraryBulk`. Production **100 % xlsx-free** ; `xlsx` déplacé en **devDependencies** (fixtures de tests de confiance uniquement) → CVE **non joignables au runtime prod**. Lecture/écriture désormais asynchrones (exceljs).
- **Serveur (O13, O14)** : `helmet` (nosniff/frameguard/HSTS/referrer-policy ; CSP `img-src` conservé) ; `crypto.timingSafeEqual` pour `DEPLOY_SECRET` ; `/api/version` et `/api/admin/diagnostics` servent `startupVersion` sans relecture disque de `package.json`.

### Tests & rendu (O6, O2)

- **1er test UI de l'app principale ForetMap** : `tests-ui/components/TaskTileCard.test.jsx` (titre, actions n3boss vs n3beur, garde-fou mémoïsation) — `TaskTileCard` est désormais exporté et testé.
- **`TaskTileCard` mémoïsé** (`React.memo`) : fondation pour supprimer les re-rendus de tuiles à chaque tick de polling. Gain plein conditionné à la stabilisation `useCallback` des handlers de `TasksView` (suite documentée dans `docs/AUDIT_OPTIMISATION.md`, O2).

### Outillage (O12)

- `eslint-plugin-react-hooks` (`rules-of-hooks: error`, `exhaustive-deps: warn`) + `no-unused-vars` (warn) sur `src/` et backend ; config **Prettier** (`.prettierrc.json`, `.prettierignore`) + scripts `format` / `format:check`.

### Corrigé

- **Hooks conditionnels** (`BiodivLocationMapBlock`, `src/components/foretmap-views.jsx`) : 6 hooks appelés après un `return` anticipé → risque de crash React « rendered fewer/more hooks than expected » quand zones/repères passaient de vide à non-vide entre deux refetch. Court-circuit déplacé après tous les hooks (révélé par le lint react-hooks).

### Supprimé

- Fichiers morts : `tmp-test-ctx-one.js` (stub debug cassé) et `scripts/_patch_map_solo.py` (orphelin).

### Ajouté

- **Audit d'optimisation** : `docs/AUDIT_OPTIMISATION.md` (extensibilité / maintenabilité / performance) + tracker O1-O14, référencé dans `docs/SITE_ISSUES.md` / `.json`.
- **Optimisation ForetMap (bundle, maintenabilité, tests)** : lazy-load des onglets rares dans `App.jsx` + `manualChunks` Vite (`react-vendor`, `socket-io`, `rive`, `markdown`) — bundle `main` allégé (~431 Ko vs ~611 Ko) ; toast partagé `TimedToast` ; extraction `lib/tasks/taskImport.js`, `lib/auth/jwtPipeline.js`, `LivingBeingsCatalogPanel` ; garde-fous deploy runtime complets (`lib/visit-pack/*` + `lib/gl-pack/mascotPack.js`). **CI** : étape `npm run test:ui`. Tests : `tests/jwt-pipeline.test.js`, `tests-ui/components/AuthScreen.test.jsx`, `tests-ui/shared/TimedToast.test.jsx`. E2E : `plants-biodiversity`, `stats-foretmap`, `admin-impersonation`, `observations-notebook`.
- **Médiathèques — cloisonnement ForetMap / Gnomes & Licornes** : les deux médiathèques ne partagent plus le même affichage. Étiquetage par médiathèque d'origine dans `_keys.json` (champ `app`, sans déplacer de fichier), filtrage côté serveur (`listMediaLibraryItems(limit, { app })`, helpers `normalizeMediaApp` / `resolveMediaItemApp` / `mediaItemMatchesApp`) ; les médias hérités (non étiquetés) restent rattachés à G&L, dont le jeu dépend. Routes `app: 'foretmap'` (`/api/media-library`, `/api/settings/admin/media-library`) et `app: 'gl'` (`/api/gl/admin/media-library`, import en masse `content-library`). Présentation G&L alignée sur ForetMap (galerie). Affichage du **slug** (clé stable) de chaque ressource sous la miniature et en liste, recherche incluant le slug ; clic = copie de l'URL. Tests `tests/media-library-scope.test.js`, `tests-ui/components/MediaLibraryMenu.test.jsx`.
- **Médiathèques — usage des ressources (utilisée et où)** : à l'ouverture de la médiathèque, chaque média indique s'il est **utilisé** et **où** (badge « Utilisée · N » avec la liste des emplacements, ou « Inutilisée »). Scanner `lib/mediaLibraryUsage.js` : détection par **URL** (`/uploads/media-library/…` dans markdown / JSON / colonnes `*_url`) et par **slug** (config intro G&L `scenes[].imageKey`, `audio.*Key`) ; couche BDD défensive (introspection `SHOW COLUMNS`, n'interroge que les colonnes présentes). Sources G&L (chapitres, feuillets Sélène, zones royaume, espèces, QCM, QCM lore, pages de contenu, carnets joueur, intro/réglages) et ForetMap (réglages du site, tutoriels, zones/repères de visite). Endpoints `GET /api/media-library/usage` et `GET /api/gl/admin/media-library/usage`. Tests `tests/media-library-usage.test.js`, `tests-ui/components/MediaLibraryMenu.test.jsx`.
- **GL — e2e liaison médias** : scénarios `e2e/gl-media-assets.spec.js` (API `_keys.json`, intro, chapitres).
- **GL — helper e2e session** : `mountGlSession` dans `e2e/fixtures/gl.fixture.js` (intro passée, onglet actif).

- **GL — import médias local** : script `npm run gl:import:media` (`médias/images.zip` + MP3 → médiathèque, manifestes auto) ; audit `npm run gl:audit:media-keys` ; module `lib/glMediaKeysAudit.js`. Tests `tests/gl-media-chapter-link.test.js`. Doc `data/gl/README.md`.

- **GL — musique plateau par biome** : résolution `resolvePlateauAudioSlug` (sahara/jungle, savane/méditerranée, toundra jour/nuit, etc.) ; `plateauAudio` / `introAudio` ; script `node scripts/prepare-gl-audio-pack.mjs` → `data/gl/audio-pack/` (noms `GL_plateau-*`). Tests `tests/gl-plateau-audio-slug.test.js`. Doc `data/gl/README.md`.

### Corrigé

- **CI — suite de tests backend stabilisée (72 échecs)** : depuis la réactivation des tests backend en CI (lint + glob `tests/*.test.js`), 72 échecs préexistants apparaissaient. Causes corrigées : `tests/gl-chapters-admin.test.js` ne supprime plus le chapitre seedé partagé `foret-magique` (le test « DELETE chapitre lié (409) » acceptait « 200 ou 409 » et supprimait le seed quand aucune partie n'était liée → cascade sur ~70 suites GL) — il lie désormais une partie et exige un 409 strict ; `tests/gl-learning.test.js` génère des codes espèce/glossaire longs (timestamp complet) pour éviter la collision avec le corpus importé (`GL0083`).
- **GL — prise de contrôle (impersonate) bloquée si IDs identiques** : `POST /api/gl/auth/admin/impersonate` refusait à tort (400 « propre compte ») lorsqu'un `gl_admin` et un `gl_player` partageaient le même identifiant numérique (auto-increments indépendants). Le garde-fou anti-auto-impersonation compare désormais aussi le **type d'utilisateur**. Tests `tests/gl-auth.test.js`.
- **RBAC — échelle de progression (min = 0)** : `resolveStudentRoleSlugFromValidatedCount` ne retient plus le dernier palier `min_done_tasks = 0` (ex. rôle de test `eleve_ctx_ro_test`) au détriment de `eleve_novice` ; tie-break explicite à seuil nul vs paliers supérieurs, tie-break stable sur `display_order` / slug. Tests `tests/rbac-progression.test.js` (purge paliers orphelins + réparation seuils `eleve_*` en `before`).
- **E2E — tâches (assign / unassign / cycle complet)** : fixtures auth (session élève après élévation, création tâche prof, sync JWT), global-setup (purge tâches E2E + rôle test), specs `tasks-unassign-flow` et `tasks-full-cycle` ; rapport RichText via `fillTaskDescription`. Correctif logout (`studentRef` réinitialisé dans `App.jsx`).
- **E2E — stabilité suite** : `gl-mj-console` (cache gameplay), `modals-responsive`, `visit-mascot`, `visit-mode`, `realtime-multi-session` ; `playwright.config.js` (`globalSetup`).

- **Médiathèques — doc API usage** : endpoints `GET /api/media-library/usage` et `GET /api/gl/admin/media-library/usage` documentés (format `{ usage }`, sources scannées, limites).

- **Tests UI — Node 22+ / localStorage natif** : polyfill dans `tests-ui/setup.js` lorsque le stub Node (`--localstorage-file`) casse `setItem` / `clear` sous Vitest/jsdom (régression sur Node 25).
- **Médiathèques — doc API** : section `docs/API.md` alignée sur le cloisonnement ForetMap / G&L (`app`, champs `stableKey` / `app` dans les items, médias hérités).
- **Médiathèques — test route HTTP** : extension `tests/media-library-scope.test.js` (supertest `GET /api/media-library` vs `GET /api/gl/admin/media-library`).
- **GL — test chapterIllustration** : slug manifest embarqué aligné (`recit_01-chap1_le-carnet-et-le-monde`).
- **GL — liaison médias des chapitres (scènes de récit)** : les visuels conventionnels `recit_0N-chapN_*` / `recit_00-prologue_*` de la médiathèque ne se liaient à aucun chapitre (asymétrie avec les feuillets de Sélène, déjà résolus via `feuilletIllustration`). Ajout du resolver runtime `chapterIllustration` / `chapterIllustrations` / `chapterIllustrationKeys` (`src/gl/assets/index.js`) et du composant `GLChapterIllustration` / `GLChapterScenes` ; câblage dans l'Histoire (galerie des scènes), la Biocénose (couverture) et en repli du fond de carte (`GLGameBoard`). Audit `glMediaKeysAudit` étendu (catégorie `chapitre-recit`, plus aucune scène orpheline). Tests `tests-ui/gl/glChapterIllustration.test.js`, extension `tests/gl-media-chapter-link.test.js`.
- **GL — fermeture intro login** : état `introDismissed` pour re-render après « Passer l'intro » (évite no-op `setForceIntro(false)`). E2E `gl-intro.spec.js`.
- **GL — e2e navigation** : sélecteurs `role=tab` (remplace `button`), onglet « Royaume » → « Le monde de G&L », drawer mobile sans « Histoire » si module journal off.
- **RBAC — progression élève** : promotion automatique au palier mérité (montée de rang ou palier perso après tâches validées). Tests `rbac-progression`, `tasks-validate-rbac`.
- **GL — résolution fond plateau vs audio** : `resolvePlateauBoardSlug` exclut les clés audio du même préfixe `plateau-N_*` ; `audioByStableKey` résout via `_keys.json` en priorité. Tests `gl-plateau-board-slug`, `gl-media-chapter-link`.
- **GL — imports UI manquants** : `GLButton`, `DialogShell`, `GLSpeciesDetailModal` dans les composants feuillet/carte/biocénose.
- **GL — test QCM lore scopes** : alignement sur réponse API tableau (sans wrapper `items`).
- **GL — test zones feuillets** : joueur assigné à l'équipe (évite `TEAM_EMPTY`).

- **GL — import bibliothèque, noms de fichiers accentués** : décodage UTF-8 des noms multipart (`forÃªt` → `forêt`) côté serveur ; conservation `sourceFileName` côté client pour l’application après analyse parallèle. Tests upload/UI.

- **GL — import bibliothèque volumineux (~28 Mo)** : transport **multipart binaire** (`multer`, champs `archive` / `files[]`) à la place du JSON base64 ; limites **50 Mo** (ZIP) / **32 Mo** (fichier) / **100 Mo** décompressé ; XLSX bibliothèque via `lib/glImportLimits.js` ; handler **413** explicite (`PAYLOAD_TOO_LARGE`) ; UI avec validation client, uploads parallèles (×3), barres de progression et `GET /api/gl/admin/content-library/limits`. Tests `tests/content-library-upload.test.js`, extensions bulk/UI. Doc `docs/API.md`, `docs/EXPLOITATION.md`, `.env.example`.

- **GL — tests révélation feuillets espèce** : mock UI `GLLearningAcknowledgeButton` respecte `isDone` ; scénario pays 5 aligné sur 5 feuillets ; retrait import corpus lourd du hook `before` (tests plus rapides).

### Ajouté

- **GL — clés média stables et slug plateau carte** : utilitaire `glMediaStableKey`, résolution `resolvePlateauBoardSlug`, script audit `node scripts/audit-gl-media-keys.mjs` ; registre biomes et manifestes alignés ; tri médiathèque par clé stable. Tests `tests/gl-plateau-board-slug.test.js`, extensions manifest/biomes/UI.
- **GL — catalogue QCM lore (histoire G&L)** : tables `gl_qcm_lore_scopes`, `gl_qcm_lore_categories`, `gl_qcm_lore_questions`, `gl_qcm_lore_question_glossary` (migration `120_gl_qcm_lore.sql`) ; import XLSX (`lib/glQcmLoreImport.js`, `npm run gl:import:qcm-lore`, fichier `data/gl/qcm-lore-gnomes-et-licornes.xlsx`) ; admin **Contenus → QCM lore** (onglet séparé du QCM biomes, panneau partagé `GLQcmCatalogPanel`) ; API `/api/gl/lore/qcm/*` (present/answer, pool-preview, import/export) ; repères plateau avec `question.set: 'lore'` et pools filtrés par scope chapitre / `tier_lore` ; résolution unifiée biomes+lore (`lib/glQcmResolve.js`) ; glossaire lore dans les réponses (`loreGlossaryTerms`) ; classification bibliothèque bulk `qcm_lore`. Tests `tests/gl-qcm-lore-import.test.js`, `tests/gl-qcm-lore-catalog.test.js`, `tests/gl-marker-lore-question-pool.test.js`, extension `tests/gl-marker-present-question.test.js`. Doc `docs/API.md`, `data/gl/README.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — intro cinématique (écran de lancement)** : extraction depuis le bundle hors-ligne (`npm run gl:intro:debundle` → `public/gl/intro/`) ; overlay plein écran avant connexion (`GLIntroOverlay`, 1ère visite + lien « Revoir l'intro », module `modules.intro_enabled`) ; config éditoriale `content.intro` (admin **Contenus → Intro**, clés média `GL_intro_*`) ; API publique `GET /api/gl/content/intro`. Tests `tests/gl-intro-lib.test.js`, `tests/gl-intro.test.js`, e2e `e2e/gl-intro.spec.js`. Migration `121_gl_intro.sql`. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — système d'assets unifié** : clés stables médiathèque (`_keys.json`, `_manifest.*.json` auto après upload/bulk) ; module `src/gl/assets/` (`img`, `audio`, `feuilletIllustration`, `biomeImg`) ; registre `src/gl/data/biomes.registry.js` + `lib/glBiomesRegistry.js` ; `MusicPlayer` plateau ; sprites alpha `public/gl/sprites/` ; script `npm run gl:build:assets` (chaîné au build). Remap carnet/feuillets, biocénose, carte plateau. Tests `tests/gl-asset-manifest.test.js`, `tests/gl-biomes-registry.test.js`.
- **GL — zones feuillets sur la carte** : calque de 24 polygones (`src/gl/data/zones_feuillets.json`, coords 0–1) ; colonne `gl_chapters.plateau_number` ; détection traversée, popover `GLFeuilletPopover`, overlay SVG, effets gemmes/cœurs (`feuillet_zone_presented`) ; mode debug `?editFeuilletZones=1`. Tests dédiés. Doc `docs/GL_FEUILLET_ZONES.md`, `docs/API.md`.
- **GL — bibliothèque contenu, galerie médias** : consultation en grille de miniatures cliquables (images, audio, vidéo) ; filtres recherche/type et tri (date, nom, taille, type) ; sélection multiple (tout / rien), suppression groupée et vidage de la bibliothèque ; miniatures compactes ; utilitaire `src/utils/mediaLibraryView.js`. Tests `tests-ui/components/MediaLibraryMenu.test.jsx`, `tests-ui/utils/mediaLibraryView.test.js`.
- **GL — révélation de feuillets par étude d'espèces** : migration `119_gl_lore_feuillets_lien_espece.sql` (colonnes `lien_*` sur `gl_lore_feuillets`, `unlocked_via: espece` sur `gl_game_feuillet_states`) ; import/export XLSX enrichi ; révélation équipe à la première étude (`POST /api/gl/learning/species/:code` + `gameId`, feuillet `espece` prioritaire puis route `espece_pays` ordonnée par `lien_ordre_recit`) ; popover `GLFeuilletDiscoveryPopover` depuis la fiche espèce ; tri zone incluant `lien_ordre_recit` pour les intros `cop-mov`. Tests `tests/gl-lore-feuillet-species-reveal.test.js`, extensions import/UI. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — illustrations feuillets Sélène** : migration `118_gl_lore_feuillets_images.sql` (`image_url`, `image_coupe_url` sur `gl_lore_feuillets`) ; import/export XLSX enrichi (`lib/glLoreFeuilletsImport.js`, cellule vide = inchangé en mise à jour) ; API feuillets `imageUrl` / `imageCoupeUrl` ; affichage popover découverte et onglet **Carnet de Sélène** (illustration + coupe repliable). Tests `tests/gl-lore-import.test.js`, `tests/gl-lore-feuillets.test.js`, `tests-ui/gl/GLFeuilletDiscoveryPopover.test.jsx`. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — bibliothèque de contenu (admin Contenus)** : sous-onglet **Bibliothèque** (consultation médiathèque globale + import en masse multi-fichiers ou ZIP) ; classification automatique (médias, XLSX espèces/glossaire/QCM/chapitres/carnet Sélène…) ; analyse dry-run puis application explicite ; API `POST /api/gl/admin/content-library/analyze|apply`, module `lib/contentLibraryBulk.js`, dépendance `adm-zip`. Tests `tests/content-library-bulk.test.js`. Doc `docs/API.md`.
- **GL — Carnet de Sélène et glossaire narratif** : migration `117_gl_lore_carnet.sql` (feuillets, plateaux, glossaire lore séparé du SVT, progression `gl_game_feuillet_states`, surcharges `gl_games.lore_*`) ; import XLSX `data/gl/corpus-feuillets-selene.xlsx`, `glossaire-lore-gnomes-et-licornes.xlsx` (`npm run gl:import:lore-feuillets`, `gl:import:lore-glossary`) ; API `/api/gl/lore/*` (lecture, `present`/`read`/`hold`, admin import/export) ; modules `lore_carnet_enabled`, `lore_glossary_enabled` et gameplay `lore_*` (plateforme + partie) ; onglets joueur **Carnet de Sélène** / **Lexique du lore**, popover découverte zone, double auto-lien SVT+lore dans les feuillets ; admin **Contenus → Carnet Sélène / Glossaire lore**, liaison feuillets dans le studio carte. Tests `tests/gl-lore-import.test.js`, `tests/gl-lore-feuillets.test.js`, `tests-ui/gl/GLSeleneCarnetView.test.jsx`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`, `data/gl/README.md`.
- **GL — traits plateau des repères** : colonnes `sous_biome_slug`, `effet_mecanique` sur `gl_chapter_markers` et `souffle_face` sur `gl_chapters` (migration `116_gl_marker_plateau_traits.sql`) ; `event_config_json` v2 (`effects` neutre/gnome/licorne, `eventMeta`) ; types d’événement étendus (`event`, `souffle`, `trame`, `challenge`, `shortcut`, `frontier`, `finish` + alias import FR) ; API `POST .../present-arrival` et `POST .../apply-effects` ; éditeur admin `GLMarkerEffectsEditor`, popover jeu `GLMarkerEffectPopover` ; feuille `reperes` XLSX enrichie. Tests `tests/gl-marker-effects.test.js`. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — popover contenu des zones royaume** : texte markdown + galerie d’images par zone (`popover_markdown`, `popover_images_json`, migration `115_gl_kingdom_zone_popover.sql`) ; affichage en popover à l’entrée ou la traversée d’une zone (`POST /api/gl/games/:id/zones/:zoneId/present-content`, hook `useGLZoneContentArrival`, `GLZoneContentPopover`) ; re-déclenchement global `gameplay.zone_content_retrigger` (défaut `once_per_game`) et surcharge par partie `gl_games.zone_content_retrigger` ; édition dans **Contenus → Chapitres**. Tests `tests/gl-zone-content.test.js`, `tests/gl-zone-content-detect.test.js`. Doc `docs/API.md`.
- **GL — profils de gameplay et mode spectateur** : toggle `gameplay.qcm_mj_only` (migration `114_gl_qcm_mj_only.sql`) — QCM en partie réservé au MJ (`present-question` / `qcm/answer` refusés pour les joueurs, pas de popover à l’arrivée sur repère) ; **profils de séance** applicables en un clic dans Réglages (`src/gl/constants/gameplayPresets.js`, 5 combinaisons : minimal, MJ+tours, MJ+tours interactif, complet avec tours, complet libre). Tests `tests/gl-qcm-mj-only.test.js`, extension `tests/gl-settings.test.js`, `tests-ui/gl/GLSettingsView.test.jsx`, `tests-ui/gl/GLGameBoard.test.jsx`. Doc `docs/GL_GAMEPLAY_PRESETS.md`, `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — import / export XLSX série de chapitres** : trois portées (`content`, `content_markers`, `full`) — feuilles `chapitres`, `reperes`, `zones_royaume`, `chapitres_charte` ; API `GET/POST /api/gl/chapters/admin/import/template|export|import` (`syncReperes`, `syncZones`) ; module `lib/glChaptersImport.js` ; panneau **Contenus → Chapitres** ; fichier exemple `data/gl/chapitres-gnomes-et-licornes-exemple.xlsx`, `npm run gl:import:chapters`. Tests `tests/gl-chapters-import.test.js`, extensions `tests/gl-chapters-admin.test.js`, `tests/gl-content-import-export.test.js`. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — popup après lancement de sortilège** : récapitulatif grimoire pour tous les clients connectés (contributeurs, nom/emoji/coût, description via cache fiche sort) ; payload événement `spell_cast` enrichi (`casters[]` avec `displayName`) ; composant `GLSpellCastResultPopover`, utilitaires `buildSpellCastResultViewModel` et `glSpellDetailCache`. Tests `tests/gl-spell-cast.test.js`, `tests-ui/gl/GLSpellCastResultPopover.test.jsx`, `tests-ui/gl/GLSpellCastWizard.test.jsx`. Doc `docs/API.md`.
- **GL — lancement de sortilèges (MJ, multi-équipes)** : roster partie entière pour le staff (`roster_scope: game`, migration `113_gl_spell_cast_game_scope.sql`) ; `teamId` optionnel à la création du brouillon ; assistant sans étape « choix d’équipe » pour le MJ, liste groupée par équipe, état de chargement et message roster vide ; entrée **Lancer un sortilège** dans la console MJ (onglet En direct) ; garde-fou PUT si contribution &gt; solde. Tests `tests/gl-spell-cast.test.js`, `tests-ui/gl/GLSpellCastWizard.test.jsx`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — import / export XLSX charte chapitres** : feuille `chapitres_charte` (couleurs thème sparse, image carte, cadre) ; API `GET/POST /api/gl/chapters/admin/charte/import/template|export|import` ; module `lib/glChapterCharteImport.js` ; panneau **Contenus → Chapitres**. Tests `tests/gl-chapter-charte-import.test.js`, extensions `tests/gl-chapters-admin.test.js`, `tests/gl-content-import-export.test.js`. Doc `docs/API.md`, `data/gl/README.md`.

### Changé

- **GL — sélecteurs bibliothèque média** : tout choix de média pour un champ du site (`onPickUrl`) ouvre désormais la **galerie de miniatures** (filtres, tri) ; grilles compactes dans les formulaires embarqués. Tests UI.

- **GL — biocénose → catalogue espèces** : propagation de `gameId` et `loreCarnetEnabled` jusqu’à la fiche espèce (lien feuillet Sélène / révélation lore).

- **GL — console MJ et navigation mobile** : sections Parties / Équipes / En direct chargées à la demande (`React.lazy`) ; sous-onglets MJ en `role="tablist"` ; tiroir mobile monté uniquement à l’ouverture ; scénarios e2e accessibilité responsive (`e2e/gl-responsive-accessibility.spec.js`). Tests `tests-ui/gl/GLGameMasterConsole.test.jsx`.

### Corrigé

- **GL — import carnet Sélène** : alias de biomes narratifs (`jungle`, `caduc`, `toundra-hiver`) normalisés vers le catalogue `gl_biomes` à l'import XLSX ; 144 feuillets importables sans skip. Tests `tests/gl-lore-import.test.js`.

- **GL — lancement de sortilège (502 prod, flux MJ)** : `PUT` contributions et `launch` rechargeaient le brouillon sans `roster_scope` (roster limité à une équipe → 400 « joueur hors roster » en multi-équipes) ; corrigé. `POST .../launch` charge l’événement `spell_cast` par `insertId` ; garde si événement absent ; **503** si migration `113` manquante ; `handleSpellCastRoute` journalise en JSON. Assistant `GLSpellCastWizard` : batch contributions avant **Lancer**. Tests `tests/gl-spell-cast.test.js`, `tests-ui/gl/GLSpellCastWizard.test.jsx`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **ForetMap — chargement initial bloqué** : garde-fous sur `fetchAll` (plafond 90 s / 8 itérations, bannière `serverDown`), premier chargement garanti sans famine du debounce 250 ms quand la carte active change ; utilitaire `getFetchAllLoopAbortReason` ([`src/constants/app-runtime.js`](src/constants/app-runtime.js)). Tests `tests/fetch-all-loop-guard.test.js`.
- **GL — contenus éditoriaux** : `useScrollReveal` ré-observe quand le `ref` est attaché après un chargement différé (`GLContentPage`, etc.) ; tests `tests-ui/shared/useScrollReveal.test.jsx`, `tests-ui/gl/GLContentPage.test.jsx`.
- **GL — cadres d’images accueil (hub marque)** : les 3 cartes Monde / Règles / Sortilèges n’étaient plus visibles (`scroll-reveal` sans intersection + layout image fragile) après la transposition des effets index_olution ; `useScrollReveal` vérifie la visibilité au montage, options IO assouplies sur le hub, images en remplissage absolu dans le cadre, Ken Burns hero respecte le point focal (`--gl-hero-focal-*`). Tests `tests-ui/shared/useScrollReveal.test.jsx`, `tests-ui/gl/GLBrandHub.test.jsx`, `tests/motion-hooks.test.js`.
- **GL — assistant lancement de sortilèges** : les contributeurs n’apparaissaient plus après le choix d’équipe (passage à l’étape « fund » avant chargement du brouillon) ; coût réel affiché (`cout_gemmes` / `cout_coeurs`).
- **GL — feedback QCM sur repères question** : `POST /api/gl/games/:id/qcm/answer` charge désormais les colonnes `feedback_*` via `loadActiveQuestion` (retours pédagogiques importés, pas seulement les messages par défaut) ; popover repère (`GLQcmPopover`) met à jour l’affichage en local après validation et diffère `reloadGame` sur bonne réponse. Utilitaires `glQcmDisplay.js` (`shouldShowQcmAnswerPhase`, défauts client). Tests `tests/gl-marker-present-question.test.js`, `tests-ui/gl/GLQcmPopover.test.jsx`, `tests-ui/gl/glQcmDisplay.test.js`.
- **GL — onglet « Le monde de G&L »** : `useScrollReveal` appelé après les retours anticipés chargement/erreur dans `GLContentPage` (violation des règles des hooks → ErrorBoundary « Recharger la page ») ; hooks remontés avant tout `return`. Client : `parseApiBody` accepte JSON sans `Content-Type`, messages d’erreur contenu plus explicites, session GL expirée (`401`) avec purge + « Se reconnecter », bouton **Réessayer** sans reload complet ; repli markdown si auto-lien glossaire échoue. Tests `tests-ui/gl/GLContentPage.test.jsx`, extension `apiGL` / `apiTransport`.
- **API client / disponibilité serveur (HTTP 503 HTML)** : les mutations (`POST` validation tâche, etc.) réessayent sur réponses passerelle (502/503/504 HTML ou `SERVICE_RESTARTING` / `SERVICE_NOT_READY`) ; en-tête `Accept: application/json` ; messages utilisateur dédiés. Serveur : middleware `/api` (boot BDD + arrêt gracieux en JSON), erreurs `/api` toujours en `application/json`. Module `src/services/apiTransport.js`, `apiGL.js`, `server.js`, `taskActionErrors.js` ; tests `tests-ui/api.test.js`, `tests-ui/apiTransport.test.js`, `tests/api-availability.test.js` ; docs **`docs/API.md`**, **`docs/EXPLOITATION.md`**.
- **Stats élève — jauge de progression** : alignement de la barre et des paliers affichés sur la logique serveur (`min_done_tasks`, tie-break `displayOrder`) ; prise en charge des paliers perso. intermédiaires (ex. expert) ; messages distincts profil en avance / en retard sur l’objectif tâches. Utilitaire `src/utils/studentProgressionLadder.js`, tests `tests/student-progression-ladder.test.js` ; tri stable de `progression.steps` dans `getStudentProgressionConfig`.
- **RBAC / progression n3beur** : la montée automatique vers un palier personnalisé (ex. « expert », seuil 40 tâches) n’est plus bloquée lorsque le `rank` RBAC du palier cible est inférieur à celui d’un profil système attribué manuellement (ex. `eleve_chevronne`, rank 300) ; la promotion suit désormais l’ordre des seuils `min_done_tasks`. Tests `tests/rbac-progression.test.js` ; doc **`docs/API.md`**.
- **Validation des tâches (prof)** : boutons de statut filtrés selon `tasks.validate` / `tasks.manage` et état d’élévation PIN ; toasts explicites (cadenas, droits manquants). `PUT /api/tasks/:id` aligné sur le RBAC (`validated` → `tasks.validate`, autres statuts → `tasks.manage`). Snapshot récurrence à la validation tolère l’absence des colonnes migration 051 (log + pas de 500). Tests `tests/tasks-validate-rbac.test.js`, `tests/task-action-errors.test.js` ; doc **`docs/API.md`**.

### Modifié

- **GL — zones royaume dans Chapitres** : édition polygonale des zones et des repères sur une même carte dans **Contenus → Chapitres** (`GLChapterMapStudio`, hooks `useGLKingdomZones` / `useGLKingdomZoneEditor`) ; suppression de l’onglet joueur **Royaume** et du module `modules.kingdom_map_enabled` ; API `/api/gl/kingdom-map/*` inchangée (musique de zone sur **Cartes** si `modules.zone_music_enabled`). Tests `tests-ui/gl/GLChapterMapStudio.test.jsx`. Doc `docs/GL_ARCHITECTURE.md`, `docs/API.md`.
- **GL / ForetMap — effets visuels index_olution (transposition)** : couche motion enrichie (`kenBurns`, `heroStagger`, `scroll-reveal`, lightbox `fm-lightbox-*`) ; hooks partagés `useScrollReveal`, `useScrollProgress`, `useCountUp`, `useStickyHeaderScrolled` ; `ScrollProgressBar`, `ImageLightbox` ; hub marque `GLBrandHub` (Ken Burns desktop, stagger, reveal cartes, zoom hover) ; barre scroll + reveal sur auth et pages éditoriales ; topbar GL glassmorphism au scroll (sans backdrop tactile) ; compteurs animés sur stats vitalité ; tests `tests/motion-hooks.test.js`.
- **GL — hyperliens glossaire** : auto-lien des termes actifs dans les contenus markdown (histoire, biotope, biocénose, sortilèges, pages éditoriales, tutoriels) et textes QCM (énoncé, choix, feedback) ; clic → popover de définition pour tout utilisateur GL authentifié, quel que soit le rôle. Utilitaires `src/utils/glGlossaryAutolink.js`, composants `GLGlossaryMarkdown` / `GLGlossaryInlineText`, hook `useGlGlossaryLinkIndex`. Tests `tests/gl-glossary-autolink.test.js`, `tests-ui/gl/GLGlossaryMarkdown.test.jsx`.
- **Dépendances (PR GitHub #39–#43)** : lot Dependabot unifié — `vite` 8, `@vitejs/plugin-react` 6, `eslint` 10, `dotenv` 17 ; patch/minor (`mysql2`, `zod`, `react`, `@playwright/test`, `sharp`, `vitest`, etc.). `engines.node` ≥ 20.19 (requis par Vite 8). Chargement `.env` silencieux via `database.js` (`quiet: true`). Mock `matchMedia` dans `tests-ui/setup.js`. Artefacts `dist/` régénérés.
- **GL / ForetMap — effets visuels partagés (phase 2)** : `toast-shell.css`, `FixedToast` ; bundle GL sans `index.css` (`gl-base.css`) ; 4 modales restantes sur `DialogShell` ; perf animation multi-périphériques (`motion.css`, backdrop mobile, `gl-main-inner`) ; hook `usePrefersReducedMotion` partagé ; tests Vitest modales GL ; doc `GL_ARCHITECTURE`, skill GL, recette `LOCAL_DEV`.
- **GL — sortilèges (thème grimoire)** : onglet Sortilèges, fiche `GLSpellPopover` et assistant `GLSpellCastWizard` en style parchemin (scope `.gl-grimoire`, texture CSS, titres Playfair) ; police Playfair dans `gl.html` ; test Vitest `tests-ui/gl/GLSpellsView.test.jsx`.
- **GL — popover glossaire** : respect de `prefers-reduced-motion` pour la fermeture et l’animation d’ouverture.
- **Build production** : artefacts `dist/` régénérés (bundle GL feedback QCM).
- **GL — affichage feedback QCM** : bloc dédié après validation (carte, popover repère, aperçu admin) ; textes longs lisibles (`pre-wrap`, défilement) ; masquage des choix une fois la réponse envoyée. Composants `GLQcmFeedbackBlock`, `glQcmDisplay.js` ; tests `tests-ui/gl/glQcmDisplay.test.js`, `tests-ui/gl/GLQcmPopover.test.jsx`, `tests/gl-qcm-catalog.test.js`.
- **GL — journal de partie (lecture joueur)** : libellés entièrement en français, phrases naturelles par type d'évènement ; plus de JSON ni de codes techniques dans l'onglet Journal.
- **GL — lancement de sortilèges** : réglage `gameplay.spell_cast_mj_only` (case **Réglages → Lancement de sortilèges**) ; si activé, seul le MJ ouvre l’assistant et appelle `/api/gl/games/:id/spell-casts/*` (les joueurs consultent le catalogue). Migration `110_gl_spell_cast_mj_only.sql` ; tests `tests/gl-spell-cast.test.js`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — vue joueur staff (MJ / admin)** : aperçu UI « vue joueur » (onglets joueur seuls, bandeau, boutons ↩️ / 🎮 dans la barre) sans changer le JWT ; prise de contrôle joueur étendue au **MJ** (`gl_mj`) avec restauration du rôle d’origine ; corps optionnel **`gameId`** sur `POST /api/gl/auth/admin/impersonate` pour contextualiser partie/équipe ; entrées **Voir comme** dans la gestion joueurs et l’effectif console MJ. Fichiers `routes/gl/auth.js`, `src/gl/AppGL.jsx`, `src/gl/utils/glStaffView.js`, composants admin/roster. Tests `tests/gl-auth.test.js`, `tests-ui/gl/glStaffView.test.js`, e2e `e2e/gl-users-admin.spec.js`. Doc `docs/API.md`.
- **GL — statistiques joueurs** : libellés et infobulles sur le périmètre « vie en classe » ; affichage de la classe active quand une seule classe ; e2e `e2e/gl-stats.spec.js`.
- **ForetMap — stats collectives** : test `stats.read.all` pour un prof membre d’un groupe (vue globale sans filtre `group_id`).

### Corrigé

- **GL — mascottes (gestionnaire + carte)** : CSS partagé `visit-map-mascot.css` chargé dans l’app GL (ancrage %, transitions, animations) ; catalogue API enrichi avec `spriteCut` pour les packs GL `sprite_cut` ; onglet assignation découplé du module studio ; type gnome/licorne sur les packs ; preview admin honnête et machine à états filtrée par équipe ; avatar barre haute via `GLMascotRenderer` ; journal temps réel (reload debouncé Socket.IO). Tests `tests/gl-mascots.test.js`, `tests/gl-visit-map-mascot-css.test.js`, `tests-ui/gl/GLBoardMascot.test.jsx`.
- **GL — marché e2e** : synchronisation PATCH offre/acceptation et attente « L’autre joueur a accepté » avant la double validation.
- **GL — profil e2e** : gate `passwordMustReset` alimentée depuis `gl_players.password_must_reset` (cohérent avec `GET /api/gl/auth/me`).

### Ajouté

- **GL — QCM feedback pédagogique** : colonnes `feedback_correct`, `feedback_a`…`feedback_e` sur `gl_qcm_questions` (migration `112_gl_qcm_feedback.sql`) ; import/export XLSX et re-import par `question_code` (cellules feedback vides n’écrasent pas l’existant) ; validation API avec retours personnalisés selon le choix canonique après mélange (`lib/glQcmChoices.js`, `resolveQcmAnswerFeedback`). Fichier de référence `data/gl/qcm-biomes-gnomes-et-licornes-consolide.xlsx` mis à jour. Tests `tests/gl-qcm-import-lib.test.js`, `tests/gl-qcm-choices.test.js`. Doc `docs/API.md`, `data/gl/README.md`.
- **GL — e2e carnet personnel** : `e2e/gl-player-journal.spec.js` (sauvegarde automatique, navigation onglet Mon journal, lecture MJ via statistiques).
- **GL — Mon journal (carnet personnel)** : onglet `my-journal`, API `/api/gl/player-journal/*`, module `modules.player_journal_enabled`, migration `111_gl_player_journal.sql` ; journal de partie enrichi (présentation, narration illustrée). Tests `tests/gl-player-journal*.test.js`, `tests/gl-journal.test.js`.
- **GL — statistiques joueurs** : stats personnelles (`GET /api/gl/stats/me`, modal joueur depuis badge vitalité ou profil) et collectives classe (`GET /api/gl/stats/class`, onglet admin **Statistiques**) — cœurs/gemmes possédés, gagnés, perdus (agrégat vie en classe), espèces/glossaire/tutoriels appris ; `lib/glPlayerStats.js`, `GLStatsView`, composants partagés `StatCard` / `StatsSummaryGrid`. Tests `tests/gl-player-stats.test.js`, Vitest `tests-ui/gl/GLStatsView.test.jsx`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — dés virtuels sur la carte** : module `modules.virtual_dice_enabled` ; bouton flottant et popover (1 à 5 D6, animation, total) sur la carte de jeu en partie ; logique client `src/gl/utils/glVirtualDice.js`. Tests `tests/gl-virtual-dice.test.js`, `tests/gl-settings.test.js`, Vitest `tests-ui/gl/GLVirtualDicePopover.test.jsx`, e2e `e2e/gl-virtual-dice.spec.js`. Doc `docs/API.md`.
- **GL — lancement de sortilèges** : pool collaboratif gemmes (💎) et cœurs (❤️) par équipe selon le coût du sort ; brouillon partagé (`gl_spell_cast_drafts`, `gl_spell_cast_contributions`) ; module `modules.spell_cast_enabled` (requiert vitalité) ; réglages `gameplay.spell_cast_contribution_mode` et `gameplay.spell_cast_team_scope` ; routes `/api/gl/games/:id/spell-casts/*`, événement `spell_cast`, Socket.IO `gl:spell_cast:draft` ; UI `GLSpellCastWizard` (onglet Sortilèges, carte, popover fiche). Migration `109_gl_spell_cast.sql` ; `lib/glSpellCast.js` ; tests `tests/gl-spell-cast.test.js`, Vitest `tests-ui/gl/GLSpellCastWizard.test.jsx`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — catalogue sortilèges** : tables `gl_spell_categories`, `gl_spells`, `gl_chapter_spells` ; colonne `sortileges_markdown` sur `gl_chapters` ; import XLSX (`sortileges`, `categories_stats`) via `lib/glSpellsImport.js` et `npm run gl:import:spells` ; API `/api/gl/spell-categories`, `/api/gl/spells`, CRUD admin ; liaison sorts par chapitre (`spellCodes[]`, tout cocher/décocher) ; onglet joueur avec catalogue par catégorie et popover `GLSpellPopover` ; admin **Contenus → Sortilèges**. Migration `108_gl_spells_catalog.sql` ; données `data/gl/sortileges-gnomes-et-licornes.xlsx`. Tests `tests/gl-spells-*.test.js`, `tests/gl-chapter-spells.test.js`, Vitest `tests-ui/gl/GLSpellCatalog.test.jsx`.
- **GL — marché d’échanges** : échanges bilatéraux de cœurs (❤️) et gemmes (💎) entre joueurs d’une même classe ; négociation avec messagerie, figement des offres au premier « J’accepte », finalisation au double accord ; module `modules.market_enabled` (requiert `gameplay.vitality_enabled`) ; routes `/api/gl/market/*`, Socket.IO `gl:class:{id}` / `gl:market:trade-changed`. Migration `106_gl_market.sql` ; `lib/glMarket.js`, `GLMarketView` ; tests `tests/gl-market.test.js`, e2e `e2e/gl-market.spec.js`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **GL — progression « appris / étudié »** : table `gl_learning_acknowledgements` (migration `107_gl_learning_acknowledgements.sql`, remplace `gl_tutorial_reads`) ; API `GET /api/gl/learning/me`, `POST .../species/:code`, `.../glossary/:code`, `.../tutorials/:id` avec `{ confirm: true }` ; enrichissement `learned` sur listes espèces/glossaire ; UI joueur (tuiles biocénose, fiche espèce, popover et liste glossaire, tutoriels avec confirmation explicite). Mutualisation `lib/shared/learningAckCore.js`, `LearningAcknowledgeButton` (ForêtMap + GL). Tests `tests/gl-learning.test.js`, extension tests-ui espèce.
- **GL — saisie manuelle glossaire et biocénose** : CRUD admin (`POST/PUT/PATCH/GET` sur `/api/gl/admin/glossary/terms` et `/api/gl/admin/species`) avec validation partagée des imports XLSX ; onglets **Saisie manuelle** / **Import XLSX** dans **Contenus → Glossaire** et **Contenus → Espèces** (`GLGlossaryEditorPanel`, `GLSpeciesEditorPanel`). Tests `tests/gl-glossary-admin-crud.test.js`, `tests/gl-species-admin-crud.test.js`, Vitest et e2e `gl-content.spec.js`.
- **GL — points de vie et de pouvoir** : compteurs persistants par joueur (`gl_players.health_points`, `power_points`) ; module `gameplay.vitality_enabled` et défauts initiaux configurables (`gameplay.default_health_points`, `gameplay.default_power_points`) ; routes MJ `POST /api/gl/games/:id/vitality/player` et `.../vitality/team` ; événement `vitality_change` + Socket.IO ; console MJ (effectifs + bloc équipe) et badge joueur (❤️ / 💎). Migration `105_gl_player_vitality.sql` ; helper `lib/glVitality.js` ; tests `tests/gl-vitality.test.js`. Doc `docs/API.md`, `docs/GL_ARCHITECTURE.md`.
- **Mutualisation ForetMap ↔ GL** : presets compression `IMAGE_COMPRESSION_PRESETS` ; sync **`lib/gl-pack/`** (`npm run sync:gl-pack-lib`) ; mapper packs GL `sprite_cut` (`glMascotPackToVisit.js`) ; UI partagée `src/shared/mascot-pack/` (studio GL : validation + preview) ; services `lib/shared/contextCommentsCore.js` et `reactionEmojiCore.js` ; types `gl_*` réservés à `/api/gl/context-comments`. Tests `gl-pack-lib-mirror`, `gl-mascot-pack-to-visit`, `image-compression-presets`. Doc `GL_ARCHITECTURE.md`, `MASCOT_PACK.md`.
- **GL — musique d’ambiance par zone** : piste audio par zone royaume (`music_url`, `music_volume` sur `gl_kingdom_zones`) ; fondu enchaîné sur la carte de jeu selon la position mascotte (point-in-polygon, chevauchement = plus petite zone) ; module `modules.zone_music_enabled` ; bouton mute joueur (`localStorage`) ; éditeur royaume avec bibliothèque audio et préécoute. Migration `104_gl_kingdom_zone_music.sql` ; tests `tests/gl-point-in-polygon.test.js`, `tests/gl-zone-at-pct.test.js`, extension `tests/gl-collab-extensions.test.js`, e2e `e2e/gl-zone-music.spec.js`.
- **GL — carte de jeu plein écran** : bouton sur l’onglet **Cartes** ; la carte occupe tout le viewport au-dessus de la navigation (marqueurs, mascottes, QCM conservés) ; fermeture **Fermer** / **Échap** ; e2e `e2e/gl-game-flow.spec.js`.
- **GL — affichage carte des repères** : modes `label` / `emoji` / `icon` sur `gl_chapter_markers` (`display_mode`, `emoji`, `icon_url`) ; défaut question/quiz = emoji ❓ ; rendu `GLBoardMarkers`, éditeur admin `GLMarkerAppearanceEditor` ; migration `103_gl_marker_display.sql`. Tests `tests/gl-marker-appearance.test.js`, `tests-ui/gl/GLBoardMarkers.test.jsx`.
- **GL — repères événements « question »** : `event_config_json` sur `gl_chapter_markers` (question fixe ou pool aléatoire filtré biomes/catégories/niveaux/difficulté + sélection fine) ; admin `GLMarkerEventEditor` + `GET /api/gl/qcm/pool-preview` ; jeu `POST /api/gl/games/:id/markers/:markerId/present-question`, popover `GLQcmPopover` à l'arrivée mascotte (`useGLMarkerArrival`) ; réglage `gameplay.marker_question_retrigger` (`every_arrival` / `once_per_team` / `once_per_game`). Migration `102_gl_marker_event_config.sql` ; tests `tests/gl-marker-question-pool.test.js`, `tests/gl-marker-present-question.test.js`, `tests-ui/gl/GLQcmPopover.test.jsx`, e2e `e2e/gl-marker-question.spec.js`.
- **GL — popover glossaire (fiche rapide)** : composant `GLGlossaryPopover` (bottom sheet mobile, carte flottante desktop, blur, animations spring) ; ouverture depuis les puces Biocenose/QCM/carte sans quitter le contexte ; CTA « Voir le glossaire complet » ; onglet Glossaire conservé sur desktop, popover sur mobile. Tests `tests-ui/gl/GLGlossaryPopover.test.jsx`.
- **GL — multi-biomes par chapitre** : table `gl_chapter_biomes` (N:N chapitre ↔ biomes catalogue), API chapitres (`biomes[]`, `biomeSlugs[]`), état de partie `chapter_biomes`, glossaire/QCM en union (`biomeSlugs` csv), admin cases à cocher + ordre, biocénose joueur en onglets par biome. Migration `101_gl_chapter_biomes.sql`, tests `tests/gl-chapter-biomes.test.js`.
- **Visite — gestionnaire bulles mascotte** : défauts globaux (`content.visit.mascot_dialog.defaults`), surcharges catalogue (`content.visit.mascot_dialog.catalog_overrides`), champ pack v2 `dialogProfile` ; studio **Packs mascotte** (vue **Dialogues** + onglet **Bulles de dialogue**) ; résolution runtime hybride (`visitMascotDialogEvents.js`, `visitMascotDialogApply.js`) ; tests `visit-mascot-dialog.test.js`, extension `mascot-pack.test.js` / `settings.test.js`.
- **GL — accès parties verrouillé** : module `lib/glGameAccess.js` ; contrôle sur `GET /api/gl/games/:id`, journal et Socket.IO `subscribe:gl-game` ; tests `tests/gl-game-access.test.js`, extension `tests/gl-realtime.test.js`.
- **Visite — file progression** : `replaceQueuedVisitSeenAction` dans `visitProgressClient.js` ; tests `tests/visit-progress-client.test.js`, `tests/service-worker-cache.test.js`.
- **Sécurité — register élève** : `POST /api/students/register` exige une session élève correspondante.

### Modifié
- **Stats — périmètre global** : un compte avec `stats.read.all` (ou rôle admin) voit de nouveau tous les n3beurs sur `GET /api/stats/all` sans filtre `group_id`, même s’il est membre de groupes (`lib/groupScope.js`).
- **GL — onglet Glossaire** : clic sur un terme ouvre toujours le popover de définition (comme biocénose/QCM) ; liste pleine largeur en grille dense pour afficher plus de termes ; lien « Voir le glossaire complet » masqué lorsque le popover est déjà ouvert depuis l’onglet. Tests `tests-ui/gl/GLGlossaryView.test.jsx`, `tests-ui/gl/GLGlossaryPopover.test.jsx`.
- **GL — biocénose (grille espèces)** : tuiles à largeur fixe (108–120 px) alignées à gauche ; plus d’étirement ni de grands vides lorsqu’un groupe ne contient que peu d’espèces.
- **GL — boutons interface** : styles partagés `.gl-primary` / `.gl-danger` / secondaire et déconnexion dans `gl-theme.css` ; remplacement des boutons HTML legacy par `GLButton` dans les vues admin, carte, profil et impersonation.
- **Build production** : artefacts `dist/` régénérés (`npm run build`, bundle GL à jour).
- **GL — biocénose (fiche espèce)** : modale centrée (`dvh`, marges sûres), photo en `object-fit: contain` (non rognée), mise en page deux colonnes sur écran large pour limiter le défilement.
- **GL — biocénose (joueur)** : liste dense en tuiles (photo + noms) ; fiche complète en modale au clic (tous les champs catalogue `gl_species`, glossaire et liens conservés dans la modale uniquement). Tests `tests-ui/gl/GLSpeciesCatalog.test.jsx`, `tests-ui/gl/GLSpeciesDetailModal.test.jsx`.
- **GL — version application (staff)** : pastille `vX.Y.Z` dans le bandeau et pied de page pour les comptes admin/MJ (`gl_admin`) ; ligne discrète sur l’écran de connexion ; hook partagé `useAppVersion` (`GET /api/version`). Tests `tests-ui/gl/GLTopBar.test.jsx`.
- **Build production** : artefacts `dist/` régénérés (`npm run build`) — bundle GL à jour (QCM, carte fit, plein écran).
- **GL — popover question QCM** : bouton explicite **« C'est cette réponse ! »** pour valider la proposition avant feedback ; glossaire popover au-dessus du popover question (`z-index`).
- **GL — alignement repères sur l'image** : calque `gl-board-fit-layer` + hook `useGlBoardImageFit` pour positionner repères/mascottes sur l'image réelle (`object-fit: contain`). Tests `tests-ui/gl/useGlBoardImageFit.test.jsx`.
- **GL — QCM repère (board joueur)** : module partagé `lib/glQcmQuestionQuery.js` (rechargement question complète, validation présentable) ; popover portal + scroll body ; refonte placement popover sur la carte. Tests `tests/gl-qcm-question-query.test.js`.
- **GL — console MJ** : refonte ergonomique (sous-onglets Parties / Équipes & effectifs / Jeu en direct, bannière partie active, édition via `PUT /api/gl/games/:id`), contextualisation des équipes par partie, modernisation des actions (`GLButton` compact, `GLBadge`, `GLDataList`) ; reset de l’équipe sélectionnée au changement de partie. Tests `tests/gl-games.test.js`, `tests/gl-game-status.test.js`, `tests-ui/gl/GLGameMasterConsole.test.jsx`, e2e `e2e/gl-mj-console.spec.js`.
- **Build production** : artefacts `dist/` régénérés localement (`npm run build`, bundle GL à jour pour plein écran et affichage repères).
- **GL — admin repères question** : filtres biomes/catégories/niveaux via menus déroulants à cases à cocher (`GLMultiCheckDropdown`) ; liste des questions visible en mode fixe et aléatoire (`GLMarkerQuestionList`, aperçu pool aussi pour question fixe). Tests `tests-ui/gl/GLMultiCheckDropdown.test.jsx`, `tests-ui/gl/GLMarkerQuestionList.test.jsx`.
- **GL — gameplay joueur** : session JWT/`GET /me` expose `gameId` depuis le roster (`gl_team_members`) ; sync `AppGL.jsx` après connexion et `join-team`.
- **GL — actions joueur** : `team_id` pris depuis `gl_team_members` pour la partie (actions, QCM, tours) ; `join-team` vérifie classe/équipe ; blocage routes si `passwordMustReset`.
- **Médiathèque** : suppression refusée hors dossier `media-library/` (anti-traversée).
- **Service Worker visite** : `/api/visit/progress` exclu du cache stale-while-revalidate (`public/sw.js`, `dist/sw.js`).
- **CI lint** : tests Node ESM autorisés dans `eslint.config.cjs`.
- **Express 5** : migration `express@5.2.1`, retrait du patch `Layer` async ; route SPA `/{*splat}` ; deps `uuid@14`, `cross-env@10`.
- **Intégration PR GitHub** : correctifs des PR Cursor #28–#37 et Dependabot #25–#30 appliqués sur `main` (PR obsolètes/doublons fermées).

### Corrigé
- **GL — popover question QCM** : boutons du pied (valider, Re-mélanger, Fermer) visibles — le portail `document.body` n’héritait pas des variables de thème GL ; jetons CSS par défaut sur l’overlay + propagation `glBrandStyle` depuis la carte. Test `tests-ui/gl/GLQcmPopover.test.jsx`.
- **Tests API (stabilité suite)** : helper partagé `tests/helpers/adminAuth.js` (JWT admin élevé, permissions complètes) ; reset des plafonds d’inscription avant les scénarios RBAC ; forum groupes aligné sur le compte admin de test ; upsert `gl_admins` sans course ER_DUP_ENTRY ; parsing explicite de `max_concurrent_tasks = 0` dans `lib/studentTaskEnrollment.js`.
- **Tests — tutoriels** : `tests/tutorials.test.js` utilise `ensureAdminTeacherAuthToken` (élévation + `tutorials.manage` sans PIN) avec `beforeEach` — corrige le 403 intermittent sur `PUT /api/tutorials/reorder` en suite complète.
- **GL — module Musique des zones (réglages)** : activation du toggle `modules.zone_music_enabled` via `PUT /api/gl/admin/settings/:key` (clé autorisée, résolution robuste si le paramètre de route est tronqué). Test `tests/gl-settings.test.js`.
- **GL — carte royaume (CSS)** : `min-height` et retrait des styles image en double — les zones SVG s’alignent sur le calque fit comme la carte de jeu.
- **Tests** : pseudo unique dans `tests/gl-games.test.js` (roster) ; token prof via login réel dans `tests/tasks-project-reorder.test.js` (évite 403 après élévation partagée).
- **GL — validation réponse QCM** : `POST /api/gl/games/:id/qcm/answer` accepte le MJ (avec `teamId`) en plus du joueur ; le popover envoie `teamId` — corrige « Permission insuffisante » à la validation. Tests `tests/gl-marker-present-question.test.js`.
- **GL — repères / zones / mascottes sur la carte** : calque `gl-board-fit-layer` aligné sur le rectangle réel de l’image (`object-fit: contain`) ; les % ne dépendent plus de la boîte carte (corrige le décalage en plein écran et au redimensionnement). Hook `useGlBoardImageFit`, `GLPctMapCanvas` partagé (jeu, éditeur chapitre, carte royaume). Tests `tests-ui/gl/useGlBoardImageFit.test.js`.
- **GL — présentation QCM repère** : `POST …/present-question` recharge la question complète (`choix_a`…`e`, `reponse_correcte`) via `glQcmQuestionQuery` — corrige « Choix insuffisants pour la question ». Test `tests/gl-marker-question-pool.test.js`, `tests/gl-qcm-question-query.test.js`.
- **GL — tests fixtures** : création chapitre e2e sans colonne `created_by` absente sur `gl_chapters` (`tests/helpers/glFixtures.js`).
- **Sync visit-pack serveur** : copie `visitMascotCatalog.js`, `browserStorage.js` et manifest renard — rétablit la validation pack et le catalogue mascottes unifié (`GET /api/gl/mascots`). Test `tests/gl-mascots.test.js`.
- **E2e — stabilisation Playwright** : fixtures auth (élévation PIN via `Promise.all`, onglet Tâches prof `^✅` vs split « Cartes & tâches », vue `.teacher-main .tasks-view`), visite (repère N3 le plus récent, onboarding invité), GL admin impersonation, forum/paramètres ; retry `gl-mj-console`. Fichiers `e2e/fixtures/auth.fixture.js`, `visit-api.fixture.js`, `visit-mode.spec.js`, `src/utils/visitMascotPlacement.js`.
- **GL — popover question à l’arrivée sur repère** : déclenchement au clic MJ sur repère question (`schedulePresentOnArrival`) sans attendre uniquement la sync `position_marker_id` ; popover rendu hors zone `overflow: hidden` de la carte (`.gl-board-shell`) ; anti-doublon API. Test `tests-ui/gl/useGLMarkerArrival.test.js`.
- **GL — image de carte chapitre** : champ URL admin (`GLImageSourceField`) en `type="text"` au lieu de `type="url"` — les chemins `/uploads/…` après upload n’étaient plus bloqués par la validation HTML5 à l’enregistrement. Test `tests-ui/gl/GLImageSourceField.test.jsx`.
- **GL — téléchargement modèles / export XLSX** : routes aussi enregistrées sur le routeur `admin` (comme les joueurs), montage `/api/gl/admin` prioritaire, réponses binaires sans compression, messages d’erreur explicites côté UI (`downloadGlFile`).
- **GL — écran connexion** : `useGLBrandTheme` normalise la charte avant fusion thème chapitre — corrige le crash React « Une erreur s’est produite » au chargement (guest, `glConfig` vide). Test `tests-ui/gl/useGLBrandTheme.test.js`.
- **Fallback SPA (Express 4/5)** : route `GET /` explicite + wildcard selon la version Express (`/{*splat}` en v5, `*` en v4) via `lib/spaFallback.js` — corrige « Cannot GET / » en prod si `node_modules` reste en Express 4 après déploiement du code v5. Tests `tests/spa-fallback.test.js`, `tests/gl-product-routing.test.js`.

### Ajouté
- **GL — thèmes couleurs plateforme et par chapitre** : édition des 8 couleurs de `platform.brand` dans **Réglages plateforme** (`GLBrandColorEditor`) ; surcharges optionnelles par chapitre (`gl_chapters.theme_json`, admin **Contenus → Chapitres**) fusionnées sur toute l’app quand une partie est active ou qu’un chapitre est sélectionné sur la **Carte du royaume**. Migration `100_gl_chapters_theme.sql` ; helpers `lib/glBrand.js` / `src/utils/glBrandTheme.js`. Tests `tests/gl-brand.test.js`, `tests/gl-chapters-admin.test.js`, `tests/gl-chapter-detail.test.js` ; `docs/API.md`.
- **GL — biocénose (espèces/biomes) : modèle et export XLSX** : `GET /api/gl/admin/species/import/template`, `GET /api/gl/admin/species/export` (feuilles `especes` et `biomes_stats`, ré-importables) ; boutons dans **Contenus → Espèces** ; logique dans `lib/glSpeciesImport.js`. Tests étendus `tests/gl-content-import-export.test.js`.
- **GL — glossaire & QCM : modèles et export XLSX** : `GET /api/gl/admin/glossary/import/template`, `GET /api/gl/admin/glossary/export`, `GET /api/gl/admin/qcm/import/template`, `GET /api/gl/admin/qcm/export` (fichiers ré-importables, permission `gl.content.manage`) ; boutons dans **Contenus → Glossaire** et **Contenus → QCM** ; logique partagée dans `lib/glGlossaryImport.js` et `lib/glQcmImport.js`. Tests `tests/gl-content-import-export.test.js` ; `docs/API.md`, `data/gl/README.md`.
- **GL — catalogue QCM biomes** : tables `gl_qcm_categories`, `gl_qcm_questions`, `gl_qcm_question_glossary` ; champs repère `qcm_categorie_slug` / `qcm_question_code` ; import XLSX (`lib/glQcmImport.js`, `npm run gl:import:qcm`, admin **Contenus → QCM**) ; API présentation avec mélange aléatoire des réponses (`GET /api/gl/qcm/questions/:code/present`, token signé) ; validation joueur (`POST /api/gl/qcm/questions/:code/answer`, `POST /api/gl/games/:id/qcm/answer`) ; modale plateau sur repères `quiz` (`GLQcmModal`). Fichier `data/gl/qcm-biomes-gnomes-et-licornes-consolide.xlsx`. Tests `tests/gl-qcm-import-lib.test.js`, `tests/gl-qcm-choices.test.js`, `tests/gl-qcm-catalog.test.js`, `tests-ui/gl/GLQcmModal.test.jsx`, e2e `e2e/gl-content.spec.js`.
- **GL — glossaire pédagogique** : tables `gl_glossary_terms`, `gl_glossary_term_biomes`, `gl_glossary_term_relations` ; colonne `gl_species.mots_cles` ; import XLSX (`lib/glGlossaryImport.js`, `npm run gl:import:glossary`, admin **Contenus → Glossaire**), API `GET /api/gl/glossary`, `GET /api/gl/glossary/:code`, `POST /api/gl/admin/glossary/import`, `GET /api/gl/admin/glossary/stats` ; enrichissement `GET /api/gl/species` avec `glossaryTerms[]` ; onglet joueur **Glossaire** (`GLGlossaryView`) et navigation depuis les fiches espèces. Fichier de référence `data/gl/glossaire-gnomes-et-licornes.xlsx`. Tests `tests/gl-glossary-import-lib.test.js`, `tests/gl-glossary-catalog.test.js`, `tests-ui/gl/GLGlossaryView.test.jsx`, e2e `e2e/gl-content.spec.js`.
- **GL — catalogue espèces / biocénose structurée** : tables `gl_biomes` et `gl_species`, liaison chapitre via `gl_chapters.biome_slug`, import XLSX (`lib/glSpeciesImport.js`, `npm run gl:import:species`, admin **Contenus → Espèces**), API `GET /api/gl/biomes`, `GET /api/gl/species`, `POST /api/gl/admin/species/import`, rendu joueur `GLSpeciesCatalog` (intro markdown + fiches par biome). Fichier de référence `data/gl/especes-biomes-gnomes-et-licornes.xlsx`. Tests `tests/gl-species-import-lib.test.js`, `tests/gl-species-catalog.test.js`, `tests-ui/gl/GLSpeciesCatalog.test.jsx`, e2e `e2e/gl-content.spec.js`.

### Modifié
- **Build prod** : artefacts `dist/` régénérés (thèmes couleurs GL).
- **Visite — panneau détail** : retrait du sélecteur d’ambiance de lecture (Nature / Papier / Doux) ; style fixe « papier » par défaut.
- **Impersonation admin (ForetMap + GL)** : durcissement ForetMap pour empêcher l’héritage d’élévation PIN vers le compte ciblé (retour admin restauré avec son niveau initial), et ajout du flux GL admin strict `POST /api/gl/auth/admin/impersonate` + `POST /api/gl/auth/admin/impersonate/stop` avec bandeau de reprise de session côté UI GL (`Gestion utilisateurs` → `Voir comme`). Tests backend/UI/e2e : `tests/api.test.js`, `tests/gl-auth.test.js`, `tests-ui/gl/GLUsersAdminView.test.jsx`, `e2e/gl-users-admin.spec.js`.
- **ForetMap — éditeur WYSIWYG partagé** : les champs longs qui utilisaient l’éditeur Markdown léger basculent sur un éditeur visuel commun (`RichTextEditor`) tout en conservant le stockage Markdown existant ; rendu amélioré des titres, citations et séparateurs dans les contenus ForetMap.
- **GL — éditeur WYSIWYG enrichi (lisibilité + images inline)** : remplacement des zones markdown brutes par un éditeur visuel (titres, listes, citation, séparateur, liens, images) dans les pages éditoriales, chapitres et tutoriels ; rendu joueur unifié via `renderMarkdownToSafeHtml(..., { allowImages: true })` pour Histoire/Biotope/Biocénose/Tutoriels ; amélioration de la lecture (`.gl-markdown`) et styles dédiés de l’éditeur. Tests : `tests/markdown.test.js`, `tests-ui/gl/GLRichTextEditor.test.jsx`, `e2e/gl-content.spec.js`.
- **Mutualisation ForetMap ↔ GL** : extraction de helpers backend communs (`lib/shared/httpHelpers.js`), source unique pour les cadres d’image GL (`lib/shared/glImageFrameCore.js`), socle partagé de coordonnées carte en `%` (`src/shared/pct-map/`), utilitaires front headless (avatar, notifications, insertion image markdown) et enrichissement progressif des commentaires contextuels GL (images, réactions, signalements, realtime). Tests ajoutés : `tests/http-helpers.test.js`, `tests/gl-image-frame-parity.test.js`, `tests/pct-map-pointer.test.js`, `tests/avatar-shared-utils.test.js`.
- **GL — refonte visuelle complète (design system moderne)** : unification des tokens/surfaces/boutons/champs dans `gl-theme.css`, ajout de composants UI partagés (`src/gl/components/ui/` : `GLButton`, `GLField`, `GLInput`, `GLSelect`, `GLTextarea`, `GLSurface`, `GLBadge`, `GLDataList`, `GLMarkdownEditor`), migration des écrans d’auth/mot de passe et des formulaires principaux, admin responsive (table desktop + cartes mobile) avec reset mot de passe en modale (suppression du `window.prompt`), harmonisation des animations (`gl-animate-in`, `gl-animate-pop`) et aperçu visuel de charte dans `GLSettingsView`. Validation : `npm run test:ui -- tests-ui/gl/useGLBoardMascotMotion.test.js`, `npm run test:e2e -- e2e/gl-responsive-accessibility.spec.js`.
- **GL — plateau : états mascotte au déplacement** : course, surprise et inspecte sur repère alignés sur la visite ForetMap (`pickMapMascotMoveTransient`, `useGLBoardMascotMotion`) ; logique partagée avec `useMapViewMascot`. Tests `tests/map-view-mascot-motion.test.js`, `tests-ui/gl/useGLBoardMascotMotion.test.js`.
- **Carte forêt — mascotte** : suppression des surcharges CSS `map-view-forest-mascot` (mobile et vue intégrée) ; taille identique au mode visite (`clamp` des shells Rive / spritesheet / sprite_cut).
- **Studio packs mascotte — modèles intégrés** : bouton **Éditer sur cette carte** (réutilise la copie pack existante ou clone depuis le catalogue) ; champ JSON `clonedFromCatalogId` à la création `clone_from_catalog_id` ; libellés et aide clarifiés. Tests `tests/mascot-pack.test.js`, `tests/api.test.js`.
- **GL — visuels yo.olution.info (emplacements dédiés)** : import WordPress remplit `platform.brand.slots` (hero + cartes Monde / Règles / Sortilèges) depuis la page d’accueil yo, copie les images vers `uploads/gl_brand/*` (y compris médias hébergés sur `gl.olution.info`) ; affichage sur l’écran de connexion (`GLBrandHub`) et bannières des pages éditoriales (`GLBrandPageBanner`). Tests `tests/gl-brand.test.js`, `tests/gl-import-wp.test.js`.
- **GL — plateau de jeu : mascottes animées (style visite ForetMap)** : sur `GLGameBoard`, les équipes n’apparaissent plus dans un cadre blanc ; chaque mascotte est rendue en overlay (`visit-map-mascot`, déplacement fluide, états marche / joie, retournement) via `GLBoardMascot` et `useGLBoardMascotMotion` ; pastille nom d’équipe séparée (`gl-board-team-pin`). Tests Vitest `tests-ui/gl/GLBoardMascot.test.jsx`, `tests-ui/gl/useGLBoardMascotMotion.test.js`.
- **GL — transposition WordPress yo → GL** : l’importeur `scripts/gl-import-wp.js` prend désormais `--target=brand` et `--target=all` (titre/sous-titre, charte, logo, médias + contenus), avec source recommandée `https://yo.olution.info` (`canonicalHost` possible) et réécriture des médias WordPress vers `uploads/gl_import/wp/*`; `GET /api/gl/auth/config` expose maintenant `brand` pour appliquer la charte côté UI GL (`GLTopBar`, `GLAuthView`, `gl-theme.css`, hook `useGLBrandTheme`).
- **Carte — repères** : l’emoji associé à un repère est **optionnel** (bouton « Sans emoji », saisie vide) ; API `POST/PUT /api/map/markers` et visite `PUT /api/visit/markers/:id` acceptent `emoji: ""` ; sur le plan, repère sans emoji = pastille discrète + libellé sous le point si activé. Tests `tests/marker-emoji.test.js`, `tests/api.test.js` ; `docs/API.md`.
- **GL — chapitres (contenus éditoriaux)** : import d’image de carte depuis galerie ou appareil photo toujours visible (URL + fichier), y compris avant la première sauvegarde du chapitre (envoi automatique à la création) ; composant `GLImageSourceField`.
- **GL — pages éditoriales** : import d’images dans le markdown (galerie, appareil photo, bibliothèque média) via `GLMarkdownImageInsert` ; aperçu avec balises `img` sécurisées (`renderMarkdownToSafeHtml` option `allowImages`).
- **GL — connexion** : un seul formulaire (identifiant + mot de passe) pour joueurs, MJ et admins ; le profil est déterminé après authentification. Libellés « mot de passe » (plus « PIN ») côté UI admin joueurs. OAuth Google en mode `auto` par défaut (joueur puis staff). `POST /api/gl/auth/login` accepte aussi les comptes MJ/Admin ForetMap.

### Ajouté
- **ForetMap — médiathèque n3boss** : nouvel onglet **Médiathèque** dans l’interface ForetMap, routes dédiées `GET/POST/DELETE /api/media-library` (lecture n3boss, import/suppression avec droits étendus) et réutilisation de la bibliothèque globale `uploads/media-library/` partagée avec GL. Tests `tests/media-library.test.js` ; `docs/API.md`.
- **GL — cadres d’image configurables** : modèle partagé `glImageFrame` (ratio, object-fit, point focal, dimensions max) ; éditeur `GLImageFrameEditor` pour la charte (`platform.brand.slots.*.frame` via `GLBrandEditor`), les images markdown (`data-gl-frame`), les cartes chapitre (`mapImageFrame`, migration `091_gl_chapters_map_image_frame.sql`) et l’avatar profil (recadrage 1:1 avant upload). Doc `docs/GL_IMAGE_FRAMES.md`, tests `tests/gl-image-frame.test.js`, `tests-ui/gl/GLImageFrameEditor.test.jsx`, e2e `gl-content.spec.js`.
- **GL — mot de passe oublié** : panneau sur l’écran de connexion (`GLAuthView`) ; `POST /api/gl/auth/forgot-password` et `POST /api/gl/auth/reset-password` (joueur GL ou enseignant MJ/Admin, lien e-mail vers `gl.html#resetType=…`). Module partagé `lib/passwordReset.js`. Tests `tests/gl-auth-forgot-password.test.js`, `tests-ui/gl/GLAuthView.test.jsx` ; `docs/API.md`.

### Corrigé
- **Packs mascotte — sélection visite et G&L** : les packs publiés (`visit_mascot_packs`) ne sont plus exclus par la liste blanche `allowed_ids` ; le catalogue unifié GL charge aussi les packs visit publiés et les packs GL persistés (`lib/visitMascotPackCatalog.js`, `lib/glMascotPackCatalog.js`, contexte `GLMascotCatalogProvider`). Tests `tests/visit-mascot-catalog.test.js`, `tests/gl-mascots.test.js`.
- **Stats n3beur — session legacy** : les anciennes sessions locales `foretmap_student` réhydratent de nouveau leur JWT avant les appels protégés, évitant l’erreur brute « Token requis » à l’ouverture des statistiques personnelles.
- **Carte — mascotte** : la mascotte conserve une taille lisible lors du zoom arrière sur le plan grâce à une mise à l’échelle compensée.
- **Tâches — duplication/édition** : initialisation plus robuste des zones/repères liés lors de l’édition, et date de départ réinitialisée à aujourd’hui lors d’une duplication.
- **Tests backend — stabilité locale** : isolation des cas auth/admin et progression RBAC pour éviter les collisions avec des données de test persistantes ; alignement du test `resolveGlStaffLogin` sur le statut de refus actuel.
- **Build GL — cadres d’image partagés** : séparation explicite du cœur `glImageFrame` frontend ESM et backend CommonJS pour corriger le build Vite complet après mutualisation (`npm run build`).
- **GL — import médias yo** : les images pointant vers `gl.olution.info/wp-content/...` (HTML de l’app Node) sont re-téléchargées depuis `yo.olution.info` avec validation binaire ; journal `médias charte: N/N URL locales` à la fin de l’import brand.
- **Auth — alias admin `oliviera9`** : le login identifiant+mot de passe accepte l’alias canonique admin même si le pseudo BDD diffère (migration `users`) ; même résolution pour GL staff et script `db:admin:audit` (pose le pseudo canonique si absent). Test `tests/auth.test.js`.
- **OAuth Google (ForetMap + GL)** : `redirect_uri` et origine front dérivées via `lib/oauthPublicUrl.js` (retrait `www.`, `X-Forwarded-Proto/Host` derrière proxy) ; diagnostic `GET /api/admin/oauth-debug` inclut les URI GL résolues. Tests `tests/oauth-public-url.test.js`.
- **GL — auth admin/MJ par mot de passe** : le formulaire unifié retente la connexion staff si un joueur GL partage le même pseudo ; résolution `gl_admins` par pseudo alternatif quand l’email ForetMap diffère ; message explicite pour les comptes enseignant Google-only sans mot de passe local. Tests `tests/gl-staff-auth.test.js`.
- **GL — hôte www** : `www.gl.*` résolu comme produit GL ; redirection de `/index.vite.html` vers `/` sur le sous-domaine GL (évite l’écran ForetMap). Tests `tests/gl-product-routing.test.js`.
- **API client / biodiversité** : messages plus explicites lors d’une réponse HTML ou JSON illisible (`api.js`) ; rejet `400` sur corps JSON mal formé (`server.js`) ; validation côté bouton « Espèce observée » et `503` si table `user_plant_observation_events` absente (`routes/plants.js`, `PlantSpeciesDiscoveryAcknowledge.jsx`) ; test `tests/plants-discovery.test.js`.
- **GL — console MJ : choix mascotte d’équipe** : le champ Mascotte du formulaire équipe est un `<select>` (liste au clic, filtrée par type gnome/licorne) à la place d’un `<input>` + `<datalist>` ; test Vitest `tests-ui/gl/GLGameMasterConsole.test.jsx`.
- **GL — console MJ** : import manquant de `useCallback` dans `GLGameMasterConsole` (crash React / écran « Une erreur s’est produite » à l’ouverture de l’onglet MJ après connexion admin) ; test Vitest `tests-ui/gl/GLGameMasterConsole.test.jsx`.
- **RBAC / progression n3beur** : l’échelle automatique agrège **tous** les seuils `min_done_tasks` des profils n3beur (seed `eleve_*` + paliers perso. rang &lt; 400) ; un profil attribué manuellement peut à nouveau monter selon les tâches validées ; sync à chaque validation ; stats élève = profil RBAC réel + barre objectif tâches. Tests `tests/rbac-progression.test.js` ; `docs/API.md`.
- **Carte — zones** : la couleur d’une zone peut être modifiée après création (onglet **Modifier** du modal zone, professeur) ; `PUT /api/zones/:id` avec `color` déjà supporté côté API, test `tests/api.test.js`.
- **GL — auth staff** : connexion MJ lorsque l’email saisi correspond à l’entrée `gl_admins` mais diffère de `users.email` (ex. identifiant historique type `cdla@…`) ; recherche par `loginIdentifier` en complément du mail ForetMap.
- **GL — auth staff** : connexion admin ForetMap par pseudo sans email (`lib/glStaffAuth.js`, email synthétique, lien `foretmap_user_id`, repli si colonnes migration absentes) ; test `tests/gl-staff-auth.test.js`.
- **GL — auth** : journalisation `logRouteError` sur les erreurs 500 (`GET /config`, login joueur/staff, OAuth callback, `PATCH /me/profile`).
- **GL — client** : message explicite dans `apiGL` lors d’une réponse 5xx non-JSON (serveur/API indisponible).
- **Tests GL** : fixtures `createGlPlayer` (chapitres) ; import CSV avec colonne **Email** vide alignée sur le modèle `Prénom;Nom;Email;Pseudo;…`.
- **Tests groupes** : token admin via `signAuthToken` et seed `groups.read` / `groups.manage` (stabilité sans double login PIN).
- **Doc GL** : `docs/GL_ARCHITECTURE.md` — auth joueur OAuth (`mode=player`), lien email / ForetMap, variable `GL_GOOGLE_OAUTH_REDIRECT_URI`.

### Ajouté
- **GL — chapitres : upload visuel d’image de carte** : l’admin peut désormais importer une image locale (galerie ou caméra) pour `map_image_url` via `POST /api/gl/chapters/admin/:id/map-image`, en plus de la saisie URL manuelle.
- **Bibliothèque média globale (images/audio/vidéo)** : nouveaux endpoints admin ForetMap (`GET/POST/DELETE /api/settings/admin/media-library`) et GL (`GET/POST/DELETE /api/gl/admin/media-library`) avec stockage local sous `uploads/media-library/`, plus menu d’upload/sélection réutilisable côté UI (`MediaLibraryMenu`) branché sur l’admin cartes ForetMap et les chapitres GL.
- **GL — mascottes d’équipe interactives (sélection + déplacement libre)** : migration `090_gl_team_free_positions.sql` (`gl_teams.position_x_pct` / `position_y_pct`) et évolution `POST /api/gl/games/:id/events` (`eventType=move`) pour accepter soit `{ markerId }`, soit `{ xp, yp }` (0..100). Le plateau GL permet maintenant la **sélection d’équipe au clic** puis le déplacement libre au clic sur la carte (MJ), tout en conservant le snap sur repère ; `GLMapView` transmet désormais `mascotStateMachine` au board. Replay enrichi (`positionsByTeamId`) et tests `tests/gl-games.test.js`, `tests/gl-game-events-replay.test.js`.
- **GL — mascottes ForetMap utilisables en partie** : `GET/POST /api/gl/mascots*` reposent sur un catalogue unifié (`lib/glUnifiedMascotCatalog.js`) fusionnant mascottes G&L (`source: "gl"`) et mascottes ForetMap visite (`source: "foretmap"`). UI admin mise à jour : filtres de source dans `GLMascotsAdminView` et suggestions de mascottes dans `GLGameMasterConsole`. Test API ajouté (`tests/gl-mascots.test.js`) pour l’assignation d’une mascotte visite (`renard2-cut-spritesheet`).
- **GL — édition visuelle carte & repères (contenus éditoriaux)** : l’admin **Chapitres** affiche la carte avec repères interactifs (ajout au clic, sélection, glisser-déposer avec persistance `PUT /api/gl/chapters/admin/markers/:markerId`) via `GLChapterMapEditor`. La **Carte du royaume** passe à un éditeur polygonal visuel (`GLKingdomZoneEditor`) avec dessin des zones à la souris, édition des sommets et sélection de chapitre dédiée dans `GLKingdomMapView`. Socle partagé GL ajouté : `useGlPctMapGestures`, `GLPctMapCanvas`, `GLBoardMarkers`.
- **Gnomes & Licornes — interface Mon profil (parité ForetMap)** : nouvelle modale profil accessible depuis la topbar (`GLProfileModal`, `GLProfileEditor`) pour joueurs et staff, avec avatar upload (compression client), pseudo/email/description (joueur), nom affiché/description (staff), changement de mot de passe dédié (`/api/gl/auth/change-password`, `/api/gl/auth/staff/change-password`) et gate `passwordMustReset` côté joueur.
- **GL — API profil self-service** : `PATCH /api/gl/auth/me/profile` (validation `currentPassword`, avatar base64, réémission `authToken`), enrichissement `GET /api/gl/auth/me` (avatar, description, liaison ForetMap), nouveaux endpoints de liaison joueur `POST/DELETE /api/gl/auth/link-foretmap`, et flag public `allowPlayerLinkForetmap` sur `GET /api/gl/auth/config`.
- **GL — schéma profil** : migration `089_gl_profile_fields.sql` ajoutant `avatar_path`/`description` sur `gl_players` et `gl_admins`, plus `foretmap_user_id` sur `gl_admins` pour sécuriser les vérifications staff.

- **Gnomes & Licornes — connexion Google joueurs** : bouton « Continuer avec Google » sur l’onglet **Joueur** ; flux OAuth `GET /api/gl/auth/google/start?mode=player|staff` (cookie `gl_oauth_mode`) ; callback `type: gl_player` ou `gl_staff`. Résolution joueur par `gl_players.email` ou lien `linked_foretmap_user_id` → élève ForetMap (`lib/glPlayerAuth.js`). Migration **`088_gl_players_oauth.sql`** (`email`, `google_sub`). Admin/import : champ **Email** optionnel sur les joueurs. `GET /api/gl/auth/config` expose `allowGooglePlayer`. Tests `tests/gl-player-google-auth.test.js`.

- **GL — joueurs : passage du PIN au mot de passe (aligné ForetMap)** :
  - Migration **`083_gl_players_password.sql`** : renommage `gl_players.pin_hash` → `password_hash`, ajout des colonnes `first_name`, `last_name`, `password_must_reset` ; flag de réinitialisation forcée appliqué une seule fois aux comptes existants (idempotente, ré-exécutable sans effet de bord).
  - Auth joueur : `POST /api/gl/auth/login` accepte désormais `pseudo + password` (compat `pin` conservée pour migration douce) et rejette la connexion avec `mustResetPassword: true` quand un reset est demandé ; `GET /api/gl/auth/me` expose `first_name`, `last_name` et `password_must_reset`.
  - Admin GL : `GET /api/gl/admin/players` renvoie les nouvelles colonnes ; `POST /api/gl/admin/players` exige `firstName/lastName/pseudo/classId` (sans password → `password_must_reset=1`) ; nouveau `PUT /api/gl/admin/players/:id` (prénom/nom/pseudo/classId/teamId/isActive) ; `POST /api/gl/admin/players/:id/reset-password` (alias `reset-pin` conservé). Auto-inscription joueur non autorisée : création uniquement par MJ/admin.
  - Import groupé : nouveaux endpoints `GET /api/gl/admin/players/import/template?format=csv|xlsx` (modèles) et `POST /api/gl/admin/players/import` (mode `dryRun` ou création réelle, rapport ligne par ligne), parsing CSV/XLSX mutualisé dans **`lib/glPlayersImport.js`**.
  - UI : `GLAuthView` remplace le champ PIN par un mot de passe avec message dédié quand `mustResetPassword` ; nouvelle vue `GLUsersAdminView` (classes + joueurs : création, édition, reset password, badge « mot de passe à réinitialiser », import CSV/XLSX avec dry-run et téléchargement de modèle).
  - Tests : nouveaux `tests/gl-players-admin.test.js` et `tests/gl-players-import.test.js`, enrichissement de `tests/gl-auth.test.js` (login password, compat `pin`, must_reset, exposition `first_name`/`last_name`), helper mutualisé `tests/helpers/glFixtures.js` aligné sur la nouvelle colonne, et mise à jour des fixtures/inserts dans les autres suites GL (chapter-detail, chapters-admin, settings, game-actions, mascots) ainsi que dans les fixtures e2e (`e2e/fixtures/gl.fixture.js`, `e2e/gl-content.spec.js`, `e2e/gl-game-flow.spec.js`).
  - Doc : `docs/API.md` (sections auth GL et admin joueurs/import) et `docs/GL_ARCHITECTURE.md`.

- **Couverture tests GL exhaustive** : helper mutualisé `tests/helpers/glFixtures.js`, nouvelles suites backend GL (`gl-auth-config-me`, `gl-staff-login`, `gl-game-lifecycle`, `gl-chapters-admin-mutations`, `gl-mascots-errors`, `gl-admin-classes-players`, `gl-settings-cache`, `gl-staff-auth-unit`), stack Vitest/RTL (`vitest.config.js`, `tests-ui/**`, scripts `test:ui*`, `test:all`), nouveaux e2e GL (`gl-player-full-cycle`, `gl-mj-console`, `gl-socket-reconnect`, `gl-responsive-accessibility`), charge/snapshot GL (`load/artillery-gl.yml`, `test:load:gl`, `tests/snapshot-gl.test.js`, `test:snapshot:gl`), et documentation QA/coverage (`docs/GL_TESTS.md`, `docs/QA_GL_PERSONAE_PROMPT.md`, skill `.cursor/skills/foretmap-gl-qa-personae`).
- **Gnomes & Licornes — connexion alignée ForetMap** : écran d’auth à deux onglets (Joueur : pseudo+PIN ; MJ/Admin : identifiant+mot de passe ForetMap ou bouton Google). Routes `POST /api/gl/auth/staff/login`, `GET /api/gl/auth/google/start`, `GET /api/gl/auth/google/callback`, `GET /api/gl/auth/config`. Les **administrateurs ForetMap** (rôle RBAC `admin`) sont synchronisés automatiquement dans `gl_admins` ; les MJ déjà enregistrés dans `gl_admins` restent acceptés. Modules `lib/glStaffAuth.js`, `lib/googleOAuthShared.js`. Tests `tests/gl-staff-auth.test.js`.
- **Gnomes & Licornes — mascottes & équipes (Lot 2C)** : nouveau catalogue dédié `src/utils/glMascotCatalog.js` (≥ 6 gnomes et ≥ 6 licornes, identifiants `gl-*`, couleur primaire/secondaire, fallback SVG `GLMascotFallbackSvg`) consommé via le composant réutilisable `GLMascotAvatar`. Routeur backend `routes/gl/mascots.js` : `GET /api/gl/mascots[?gameId]` (catalogue + assignations courantes, auth GL) et `POST /api/gl/mascots/assign` (assignation transactionnelle `gl_mascot_assignments` + `gl_teams.mascot_id`, refus `409` si collision intra-partie, refus `404` si mascotte inconnue, permission `gl.team.manage`). Pont CJS→ESM `lib/glMascotCatalog.js`. UI : `GLMascotsAdminView` refondue (grille filtres gnome/licorne, sélecteur d'équipe, état « assignée », blocage des mascottes prises) ; `GLGameMasterConsole` affiche la mascotte par équipe ; `GLGameBoard` et `GLTopBar` rendent l'avatar G&L (fallback SVG) tout en gardant `VisitMapMascotRenderer` pour les anciens id non préfixés. Tests `tests/gl-mascot-catalog.test.js`, `tests/gl-mascots.test.js`, e2e `e2e/gl-mascots.spec.js` (2 équipes, collision refusée, assignations finales). Doc : `docs/MASCOT_PACK.md` note la divergence catalogue ForetMap visite vs catalogue GL.
- **Gnomes & Licornes — contenus & chapitres (Lot 2B)** : nouveau routeur dédié `routes/gl/chapters.js` exposant lecture publique (`GET /api/gl/chapters`, `GET /api/gl/chapters/:slug`) et CRUD admin protégé par `gl.content.manage` : chapitres (`POST/PUT/DELETE /api/gl/chapters/admin[/{id}]`) et repères (`POST /admin/:id/markers`, `PUT/DELETE /admin/markers/:markerId`). Refus `409` à la suppression d'un chapitre lié à une partie. Importeur WordPress étendu (`scripts/gl-import-wp.js --target=chapters`) avec `chapterMap` dans `scripts/gl-import-wp.config.json` (slug WP → `slug/biome/mapImageUrl/orderIndex` GL). UI admin enrichie : `GLContentsAdminView` avec sous-onglets `Pages` / `Chapitres`, nouveau composant `GLChaptersAdminView` (formulaire chapitre + gestion des repères). Tests `tests/gl-chapter-detail.test.js`, `tests/gl-chapters-admin.test.js`, e2e `e2e/gl-content.spec.js`, et extensions `tests/gl-import-wp.test.js` (target, chapterMap, transform chapitre).
- **Gnomes & Licornes — gameplay MJ paramétrable (Lot 2A)** : nouveaux toggles `gl_settings` (`gameplay.turns_enabled`, `narration_enabled`, `player_actions_enabled`, `scoring_enabled`) lus côté joueur via `GET /api/gl/gameplay-settings`. Tours cycliques (`POST /api/gl/games/:id/turn/next`), narration MJ (`eventType=narration`), demandes d'action joueur (`POST /api/gl/games/:id/actions`) résolues par le MJ (`POST /actions/:id/resolve`) avec bonus score optionnel (`eventType=score`, table `gl_team_scores`). Permission RBAC `gl.action.request` côté joueur. Migration `082_gl_gameplay_settings.sql` (toggles, `gl_games.current_team_id`, `gl_team_scores`, `gl_action_requests`). Console MJ enrichie (sélecteur d'équipe active, contrôle de tour, narration, modération, tableau des scores). UI joueur : bandeau narration, toast changement de tour, modale de demande d'action. Tests `tests/gl-settings.test.js`, `tests/gl-game-turns.test.js`, `tests/gl-game-actions.test.js`, replay enrichi `tests/gl-game-events-replay.test.js`, e2e `e2e/gl-game-flow.spec.js` étendu (MJ active tours+narration → joueur reçoit `turn_change` puis `narration`).
- **Gnomes & Licornes (GL) — fondation bi-produit** : routage host (`gl.*`), entrée build `gl.html`, shell React `src/gl/`, routes backend `/api/gl/*` (auth, contenus, gameplay, admin), migrations `080_gl_foundations.sql` et `081_gl_gameplay.sql`, rooms Socket.IO `gl:game:{id}`, tests backend/e2e GL initiaux, et documentation `docs/GL_ARCHITECTURE.md`.
- **QA GL (personae)** : checklist dédiée MJ/joueur ajoutée dans `docs/QA_AUDIT_PERSONAE_PROMPT.md` pour standardiser la recette `gl.olution.info` (onglets, console MJ, temps réel).
- **Import WordPress GL** : script `scripts/gl-import-wp.js` + config `scripts/gl-import-wp.config.json` (API WP REST, mapping de slugs, `--dry-run` vers `tmp/gl-wp-import`, `--apply` en UPSERT `gl_content_pages`), commande `npm run gl:import:wp`, et tests `tests/gl-import-wp.test.js`.
- **Visite sans compte — hors ligne** : libellé d’entrée **« Visiter sans compte »** ; file d’attente locale des actions « vu / non vu » (**`src/utils/visitProgressClient.js`**) avec synchronisation au retour réseau ; badge d’état réseau / sync dans **`visit-views.jsx`** ; Service Worker **`public/sw.js`** (cache stale-while-revalidate pour **`/api/maps`**, **`/api/visit/content`**, **`/api/visit/progress`**). Tests **`tests/visit-progress-client.test.js`**, e2e **`e2e/visit-mode.spec.js`**.
- **UI — Markdown léger sur les champs longs** : barre d’outils de saisie (**gras**, *italique*, listes, liens) et rendu HTML sanitizé (`marked`, `isomorphic-dompurify`) pour forum, commentaires contextuels, descriptions tâches/projets, fiches biodiversité, observations, textes carte/visite, profils et résumés tutoriels. Composants **`MarkdownTextarea`**, **`MarkdownContent`**, utilitaire **`src/utils/markdown.js`** ; tests **`tests/markdown.test.js`** ; **`docs/API.md`** (section *Texte enrichi*).
- **Projets de tâches — statut terminé** : passage automatique du projet en **`completed`** en base lorsque **toutes** les tâches liées sont **`done`** ou **`validated`** (retour **`active`** dès qu’une tâche redevient « en cours » ou si le projet n’a plus aucune tâche). Synchro **`lib/syncTaskProjectCompletion.js`** (appels depuis les mutations tâches, récurrence, suppression élève) ; blocage des inscriptions si projet **`completed`** ; UI et pastilles (**`tasks-views.jsx`**, **`map-views.jsx`**, **`badges.jsx`**). Test **`tests/new-features.test.js`** ; **`docs/API.md`** (statut réservé serveur).
- **Cartes — troisième plan (et suivants)** : **`POST /api/settings/admin/maps`** pour créer une entrée dans **`maps`** depuis la console admin ; normalisation d’URL d’image générique (**`lib/mapImageUrl.js`**). Affiliation élève : identifiant de carte existante en plus de **`n3` / `foret` / `both`** (**`lib/studentAffiliation.js`**, migration **`076_users_affiliation_map_slug.sql`**, colonne **`users.affiliation` VARCHAR(32)**). UI : formulaire « Cartes & plans », sélecteurs d’espace (inscription, profil, admin profils). Voir **`docs/API.md`**.
- **Routine QA / personae** : prompt **`docs/QA_AUDIT_PERSONAE_PROMPT.md`**, dossier **`docs/reports/`** (README, template, rapport d’initialisation), skill **`.cursor/skills/foretmap-qa-personae`**, rule **`.cursor/rules/foretmap-qa-routine.mdc`** ; mention dans **`docs/LOCAL_DEV.md`**.
- **E2e — modales responsive** : fichier **`e2e/modals-responsive.spec.js`**.
- **Tâches — ordre manuel par projet** : colonne **`tasks.sort_order`** (**`migrations/075_tasks_sort_order.sql`**, **`sql/schema_foretmap.sql`**), **`POST /api/tasks/reorder-project`**, tri **`GET /api/tasks`** (**`routes/tasks.js`**, **`docs/API.md`**), UI dans **`tasks-views.jsx`** ; tests **`tests/tasks-project-reorder.test.js`**.
- **UI — coque modale** : composant **`DialogShell.jsx`** et branchements (tutoriels, confirmations biodiversité, aide).

### Modifié
- **Visite — mise en page éditoriale (photos)** : les photos déjà liées à la zone/repère ou au lieu (carte) et le choix des images d’un bloc s’affichent en **miniatures cliquables** (aperçu plein écran, sélection par vignettes) au lieu d’URLs ou d’une liste `<select>` ; composant partagé **`VisitEditorialPhotoUi.jsx`**, styles **`index.css`**, édition carte (**`map-views.jsx`**) et visite (**`visit-views.jsx`**).
- **Visite — mise en page éditoriale** : les photos déjà présentes dans `visit_media` (sans bloc image enregistré) apparaissent désormais comme blocs image configurables dans l’éditeur visite et dans `GET /api/visit/content`, au même titre que les blocs ajoutés manuellement (`lib/visitEditorialBlocks.js`, `src/utils/visitEditorialBlocks.js`, panneau visite et édition zone/repère sur la carte). Tests **`tests/visit-editorial-blocks.test.js`**.
- **Gnomes & Licornes — admin joueurs** : vue admin découpée en panneaux (classes, joueurs, import/export CSV-XLSX, effectif par partie), console MJ enrichie (effectif, invitations), API roster partie et tests associés (**`src/gl/components/admin/*`**, **`routes/gl/games.js`**, **`lib/glRoster.js`**, e2e **`e2e/gl-users-admin.spec.js`**).
- **Carte forêt — mascotte animée (comme la visite)** : sur l’onglet Carte (et la vue carte intégrée tâches/tutoriels), la mascotte n’est plus figée en bas du plan : déplacement au clic fond, marche vers zone/repère avec bulles et états transitoires (`useMapViewMascot`, persistance de position par carte). CSS `map-view-forest-mascot` (remplace `map-view-static-mascot`).
- **Gnomes & Licornes — navigation et boutons** : la barre GL n’utilise plus `<header>` (styles globaux ForetMap imposaient 56px de hauteur et `overflow:hidden`, masquant les onglets). Console MJ : retours d’erreur visibles et mascottes `gl-*` à la création d’équipe.
- **Gnomes & Licornes — parcours admin après connexion** : les MJ/Admin arrivent sur l’onglet **Console MJ** (plus sur « Le monde » avec l’éditeur markdown bloquant). Édition des pages éditoriales en mode lecture par défaut (bouton « Modifier »), message de succès visible, lien vers la console MJ ; erreurs de sauvegarde affichées sans masquer la page.
- **Post-déploiement bi-produit** : `scripts/post-deploy-check.js` ajoute `--gl-health-only` (`DEPLOY_GL_HEALTH_ONLY`) et des contrôles GL dédiés (`/api/gl/chapters`, `/api/gl/content/world` avec `200/401` acceptés), avec couverture unitaire dans `tests/post-deploy-check-script.test.js`.
- **Déploiement/check prod** : `deploy:check:prod` prend en charge la vérification du sous-domaine GL (option `--gl-base-url` / variable `GL_PROD_BASE_URL`) et la doc d’exploitation inclut `FRONTEND_ORIGINS`.
- **E2E GL** : `e2e/gl-game-flow.spec.js` couvre désormais un flux MJ → joueur via Socket.IO (`gl:game:event`) avec seed DB contrôlé pour éviter les faux négatifs.
- **Administration éditoriale GL** : nouvel endpoint `GET /api/gl/admin/content`, onglet admin `Contenus`, et `GLContentPage` enrichi avec éditeur markdown + aperçu en direct pour les rôles `gl.content.manage`.
- **Tests / lint** : suppression de directives `eslint-disable` devenues inutiles dans les tests de commentaires contextuels et de persistance de position mascotte, pour garder une base `npm run lint` sans avertissement.
- **Tests — sécurité observations et uploads** : refus IDOR liste/suppression observations (`tests/observations-images.test.js`), jeton élève requis sur routes photo zone et 401 sans auth (`tests/security-admin-images.test.js`, `tests/uploads-public-urls.test.js`), auth sur PATCH profil élève orphelin (`tests/student-affiliation.test.js`).
- **Réglages publics** : libellés admin et défaut **`content.auth.guest_visit_cta`** alignés sur « Visiter sans compte » (**`lib/settings.js`**, **`settings-admin-views.jsx`**).
- **E2e (Playwright)** : le `webServer` local lance **`server.js`** avec **`--max-old-space-size`** explicite (défaut 12288 Mo, surcharge **`E2E_NODE_MAX_OLD_SPACE_SIZE`**) pour réduire les crash mémoire V8 pendant la suite ; commande alignée sur **`npm run start:e2e`**. **`playwright.config.js`**.
- **Tâches — affichage** : sections liste, filtres par statut et raccourcis prof affichent **En cours** avant **À faire**. **`tasks-views.jsx`**.
- **Studio packs mascotte — bibliothèque sprites** : vignettes visuelles des PNG (grille comme la médiathèque pack) + colonne d’aperçu dans la table « assets du site » pour les images. **`VisitMascotPackManager.jsx`**.
- **Vues / styles** : ajustements **`profiles-views.jsx`**, **`map-views.jsx`**, **`foretmap-views.jsx`**, **`tutorials-views.jsx`**, **`auth-views.jsx`**, **`AutoProfilePromotionModal.jsx`**, **`App.jsx`**, **`index.css`**, **`badges.jsx`** (cohérence modale et responsive).
- **Build** : régénération locale des artefacts **`dist/`** (bundle Vite production, chunks `main` et studio mascotte).
- **Documentation / agent Cursor** : alignement **`docs/API.md`** (version, OAuth debug, assets mascotte), **`docs/VERSIONING.md`** / présent fichier (politique SemVer continue vs release), **`docs/EVOLUTION.md`**, **`docs/MASCOT_PACK.md`**, règles **`.cursor/rules`** et skills **`.cursor/skills`** sur le périmètre réel du code.
- **Visite — présentation du lieu** : le premier tutoriel embarquable s’ouvre via un **bouton** « Présentation du lieu » (bandeau au-dessus du plan) pour **tous** les utilisateurs en **navigation** ; **animation d’incitation** (léger pulse / halo) tant qu’**aucune zone ni repère** de la carte courante n’a été marqué·e comme vu·e, désactivée si **réduction des animations** système. **`visit-views.jsx`**, **`index.css`** ; e2e **`visit-mode.spec.js`**.
- **Biodiversité — UI pré-saisie** : affichage explicite de la source par champ avec badge dédié **🧠 OpenAI** (et confiance associée) pour distinguer visuellement les propositions LLM des autres sources avant application. **`foretmap-views.jsx`**.
- **Biodiversité — Pl@ntNet** : « Utiliser pour le formulaire » importe les images d’identification sur le serveur : la **1re** alimente la **photo principale** (`photo`, vignette fiche) ; les suivantes remplissent les autres champs photo dans l’ordre. **Pré-saisie — photos** : suggestions listées sans case cochée par défaut ; à l’application, fusion avec les photos déjà présentes (pas d’écrasement tant que l’option d’écrasement global n’est pas activée). **`foretmap-views.jsx`**.

### Corrigé
- **GL — création de partie « Classe introuvable »** : la console MJ n’envoyait plus un `classId` codé en dur (`1`) ; sélecteur de classes actives chargé depuis `GET /api/gl/admin/classes`, message si aucune classe. **`GLGameMasterConsole.jsx`**, **`AppGL.jsx`**.
- **npm install — ERESOLVE OpenTelemetry (Artillery vs Vitest 4)** : ajout de `legacy-peer-deps=true` dans **`.npmrc`** pour lever le conflit de peer `@opentelemetry/api` (1.4.x via Artillery, ^1.9.0 optionnel via Vitest) sans impact sur l’install prod (`--omit=dev`).
- **GL — `POST /api/gl/games` retournait 500 sur `classId`/`chapterId` orphelin** : la route insérait sans valider les FK et l’erreur MySQL `ER_NO_REFERENCED_ROW_2` (fk_gl_games_class / fk_gl_games_chapter) remontait en HTTP 500 (6 occurrences observées en prod v1.52.3 via `/api/admin/diagnostics` → `metrics.recentHttp5xx`). Désormais : vérification préalable des FK (404 « Classe introuvable » / « Chapitre introuvable »), `try/catch` autour de l’INSERT mappant la violation FK résiduelle en 409, log via `logRouteError` en cas d’erreur SQL inattendue. Même filet de sécurité ajouté à `POST /api/gl/games/:id/teams` (404 si partie inexistante). Tests `tests/gl-games.test.js` (régression 404 classId/chapterId, 400 payload incomplet, 404 partie inexistante). **`routes/gl/games.js`**, **`docs/API.md`**.
- **Exploitation — `sharp` (vignettes images)** : procédure de réinstallation runtime en prod documentée dans **`docs/EXPLOITATION.md`** (section 8) après diagnostic du warning Pino *« Module sharp indisponible : vignettes zones/repères non générées »* sur l’instance v1.52.3.
- **Audit sécurité / robustesse** : ordre `useState` / `affiliation` dans l’éditeur de profil (**`stats-views.jsx`**), messages de connexion unifiés (**`routes/auth.js`**), **`trust proxy`** et corps JSON par défaut 25 Mo (**`server.js`**), secrets JWT / visite obligatoires en production (**`lib/env.js`**), jeton Socket.IO hors query en prod (**`lib/realtime.js`**), erreurs API 500 génériques (**`lib/routeLog.js`**, routes), assignation tâche prof avec **`studentId`** obligatoire (**`routes/tasks.js`**), transaction RBAC permissions (**`routes/rbac.js`**), élévation PIN requise pour les profs sur routes sensibles (**`middleware/requireTeacher.js`**), onglet Audit masqué sans **`audit.read`** (**`App.jsx`**), déconnexion session ciblée sur expiration JWT (**`api.js`**). Tests **`tests/security-hardening.test.js`**, e2e **`e2e/forum-settings-smoke.spec.js`** ; doc **`docs/API.md`**, **`docs/LOCAL_DEV.md`**, **`README.md`** ; lint minimal (**`eslint.config.cjs`**, CI).
- **Projets de tâches — pause manuelle** : la synchronisation automatique `completed` ne remplace plus un statut **`on_hold`** explicitement posé par un n3boss lors d’une édition ultérieure de tâche. **`lib/syncTaskProjectCompletion.js`**, **`tests/new-features.test.js`**, **`tests/sync-task-project-completion.test.js`**.
- **Profils élèves — affiliation** : les mises à jour de profil qui ne modifient pas explicitement l’affiliation ne réécrivent plus une valeur stockée non résolue en **`both`**, évitant un élargissement silencieux du périmètre carte. **`routes/auth.js`**, **`routes/students.js`**, tests.
- **Cartes — affiliation mono-plan** : un élève limité à un plan personnalisé ne retombe plus sur toutes les cartes actives lorsque ce plan est temporairement désactivé ; le filtrage client conserve le périmètre d’affiliation. **`App.jsx`**, **`src/utils/mapAffiliation.js`**, **`tests/map-affiliation.test.js`**.
- **Suppression élève / statuts de tâches** : le recalcul après suppression d’un compte utilise la même logique que **`recalculateTaskStatus`** (**`completion_mode`**, **`done_at`**) via **`lib/taskStatusRecalc.js`** ; évite un statut incorrect sur les tâches collectives. Cookie visite anonyme : **`append('Set-Cookie', …)`** pour ne pas écraser d’autres cookies (**`routes/visit.js`**). **Observations** : si l’enregistrement fichier image échoue après insertion, la ligne est supprimée (**`routes/observations.js`**).
- **UI** : garde-fous anti-réponses obsolètes (forum, carnet d’observations, journaux de tâche) ; pré-saisie biodiversité — sélection des champs basée sur le formulaire à jour ; clés React plus stables (badges fiche, liste activité stats, historique cultures carte) ; champs **nombre** admin resynchronisés après chargement serveur (**`settings-admin-views.jsx`**).
- **Visite — sélecteur mascotte** : liste déroulante **Mascotte** rétablie dans la barre au-dessus du plan (catalogue + packs publiés), en complément de l’onglet **Aperçu mascotte** du studio. **`visit-views.jsx`**.
- **Biodiversité mobile — prise de photo** : l’ouverture caméra/galerie dans l’éditeur d’espèce et dans le bloc Pl@ntNet arme désormais la garde `popstate` des overlays ; au retour appareil photo, la fenêtre d’édition ne se ferme plus avant le `change` de l’input. **`foretmap-views.jsx`**.
- **Studio packs mascotte — assets globaux** : ajout d’un inventaire complet des assets mascotte du site (catalogue public + assets packs + bibliothèques carte) utilisable quel que soit le pack en édition, avec filtres, copie d’URL et insertion directe dans un état d’animation. **`/api/visit/mascot-assets`**, **`VisitMascotPackManager.jsx`**, **`tests/api.test.js`**, **`docs/API.md`**.
- **Studio packs mascotte** : création « Nouveau depuis modèle » étendue à toutes les mascottes du catalogue (plus seulement Renard 2), avec validation serveur de `clone_from_catalog_id` et retour `allowed_catalog_ids` en cas d’ID invalide. **`VisitMascotPackManager.jsx`**, **`routes/visit.js`**, **`tests/api.test.js`**, **`docs/API.md`**.
- **Packs mascotte (prod/studio)** : fiabilisation de la validation serveur des packs (`zod` en dépendance runtime, diagnostic 503 enrichi avec `details.reason`), et meilleure stabilité d’affichage côté studio (préférence de carte locale non écrasée par les réglages par défaut). **`package.json`**, **`routes/visit.js`**, **`lib/mascotPackValidatorResolve.js`**, **`App.jsx`**, **`VisitMascotPackManager.jsx`**, tests.
- **Modales (mobile)** : sur petit écran, les dialogues **`.modal` / `.log-modal`** (création ou édition de **tâche**, **projet**, fiches **carte**, etc.) **défilent sur l’overlay** plutôt qu’avec une hauteur max + scroll interne, afin d’atteindre le bas des formulaires longs (surtout **iOS / Android**). **PIN** : overlay défilant + zones sûres ; listes **tutoriels liés** / **réordonnancement** : défilement tactile renforcé. **`index.css`**.
- **Visite — Renard 2 (course)** : les frames **`cell-r1-c*.png`** recalées dans la tuile 153×160 (bas du personnage aligné, encre centrée horizontalement) pour supprimer l’effet de **« bandeau »** lors du cycle marche sur la carte ; script **`npm run mascot:renard2-cut-align-walk`** (`scripts/renard2-cut-align-walk.cjs`), rappel après **`mascot:renard2-cut`** ; doc **`docs/VISIT_MAP_GEOMETRY.md`**.
- **Pré-saisie biodiversité — OpenAI** : fallback automatique vers **`POST /v1/responses`** quand **`/v1/chat/completions`** n’est pas compatible avec le modèle configuré ; parsing JSON robuste sur les deux formats de réponse (appel principal + gap-fill). **`lib/speciesAutofillOpenAi.js`**, **`tests/species-autofill-extensions.test.js`**.
- **Pré-saisie biodiversité — OpenAI (couverture de champs)** : extension contrôlée vers **`name`**, **`scientific_name`** et **`group_1..group_4`** avec validation/sanitation stricte (filtre des valeurs « inconnu », formats non plausibles, pH/température non structurés), pour augmenter le taux de remplissage tout en limitant les erreurs. **`lib/speciesAutofillOpenAi.js`**, tests.
- **Pré-saisie biodiversité — OpenAI (complément)** : OpenAI est utilisé pour toutes espèces quel que soit le nombre de sources sélectionnées ; il s’appuie sur le contexte déjà agrégé (GBIF/Wikidata/Wikipedia, etc.) et complète prioritairement les champs manquants sans écraser les valeurs robustes déjà présentes. En mode source unique OpenAI, les réponses vides ne restent plus en cache. **`lib/speciesAutofill.js`**, **`lib/speciesAutofillOpenAi.js`**, **`routes/plants.js`**, **`tests/species-autofill.test.js`**.
- **Visite / mascotte (prof)** : retrait des anciens blocs legacy dans l’onglet **Visite** (boîte à outils pack en modale + aperçu/édition local), pour éviter les conflits d’état avec le studio unifié ; l’édition passe désormais uniquement par l’onglet **Packs mascotte** (bouton de redirection conservé). **`visit-views.jsx`**.
- **Tests API** : **`POST /api/auth/elevate`** — le JWT élevé doit contenir **`teacher.access`** (alignement UI / e2e). **`tests/auth.test.js`**.
- **Élévation PIN (n3beur)** : une fin tardive de **`POST /api/students/register`** (`updateStudentSession`) ou un **`refreshedToken`** de **`GET /api/auth/me`** ne doit pas remplacer le JWT **élevé** par le jeton élève de base encore présent dans **`foretmap_student.authToken`** (course avec la validation de session au chargement). Garde-fou via **`isElevatedJwt`** : pas de « downgrade » de jeton. Écoute **`foretmap_session_changed`** pour réaligner **`authClaims` / `isTeacher`** sur le JWT après **`saveStoredSession`** (PIN). **`App.jsx`**, **`src/services/api.js`**.
- **E2e tâches / PIN** : **`enableTeacherMode`** attend dans le stockage un JWT **`elevated`** avec **`teacher.access`** (y compris via **`foretmap_student.authToken`**), puis le **bon** bouton cadenas (**`aria-label` contenant « droits étendus »**, pas le premier **`lock-btn`** du bandeau) ; **`disableTeacherMode`** : clic natif **`evaluate`** ; filtres liste tâches : **`fill`** avec **`force`** et court délai. **`tasks-full-cycle`** : modale **Rapport de tâche** ciblée avant le commentaire ; **recherche par titre** en vue prof quand la liste est volumineuse. **`tasks-unassign-flow`** : **Confirmer** dans le dialogue **Confirmation d’action**. **`e2e/fixtures/auth.fixture.js`**, **`e2e/tasks-full-cycle.spec.js`**, **`e2e/tasks-unassign-flow.spec.js`**, **`e2e/realtime-multi-session.spec.js`**, **`e2e/student-login-identifier.spec.js`**.
- **Élévation PIN (stockage navigateur)** : dans **`PinModal`**, appeler **`saveStoredSession`** avec le jeton élevé **avant** d’écrire **`foretmap_auth_token`** / **`foretmap_teacher_token`**, car **`getAuthToken()`** lit **`foretmap_session`** en priorité — évite une course avec **`POST /api/students/register`** qui lisait encore l’ancien jeton. **`userType`** de la session aligné sur **`data.auth.userType`** (élève vs enseignant). **`src/components/auth-views.jsx`**.

### Ajouté
- **Packs mascotte (studio unifié)** : format pack **v2** avec `interactionProfile` (réactions sur la carte par pack), **bibliothèque sprites** par carte (`/api/visit/mascot-sprite-library/...`), **clonage** (`clone_from_pack_id`, `clone_from_catalog_id`), onglets fiche / bibliothèque / comportements / aperçu dans **`VisitMascotPackManager.jsx`** ; runtime visite branché sur **`visitMascotInteractionApply.js`**. Migration **`074_visit_mascot_sprite_library.sql`**, sync **`lib/visit-pack/visitMascotInteractionEvents.js`**.

### Modifié
- **Visite — tutoriels / présentation sous la carte** : le bloc **Tutoriels de la visite** (liste + sélection prof) et le lien **Présentation** du bandeau ne sont affichés que pour le **professeur** en mode édition ; masqués pour **invité sans connexion**, **élève** et **aperçu comme élève**. **`visit-views.jsx`** (`data-testid="visit-map-tutorials-section"` côté prof).
- **Tâches — vue condensée** : cartes un peu moins hautes (padding vertical, espacement entre cartes, ligne de titre et pastille de statut ; zone cliquable **40px** au pointeur fin, **44px** au tactile). **`index.css`**.
- **Visite — en-tête** : suppression du bloc dépliant « Présentation » (texte `content.visit.subtitle`) ; sous le titre, lien **Présentation** ouvrant en modale le **premier tutoriel** sélectionné pour la carte lorsqu’un aperçu embarqué est possible (même flux que « Lire »). **`visit-views.jsx`**, **`index.css`**.
- **Visite — bandeau carte** : l’anneau de **progression %** est sur la **même ligne** que le titre (à droite), **juste à gauche** du bouton d’aide ; **Plein plan** / **Aperçu prof** restent avant ce bloc ; changement de **carte** sur une ligne séparée lorsque plusieurs cartes. **`visit-views.jsx`**, **`index.css`**.
- **À propos** : retrait du bloc **dépôt GitHub** (lien et URL) ; crédit contributeur **Olivier Arnould-Laurent** ; suppression de la clé **`content.about.repo_title`** (registre + admin). **`about-views.jsx`**, **`lib/settings.js`**, **`settings-admin-views.jsx`**.
- **Visite — mascotte par défaut** : **Renard 2** (`renard2-cut-spritesheet`) pour la première ouverture et les valeurs `localStorage` inconnues ; les choix déjà enregistrés restent inchangés. **`visitMascotCatalog.js`** ; e2e **`visit-mascot.spec.js`** (attente de rendu multi-moteur) ; test **`visit-mascot-catalog.test.js`**.
- **Visite — panneau lieu (zone/repère)** : le dialogue s’affiche en **plein écran** (tout le viewport, encoches `safe-area`), au lieu du panneau à droite ou de la feuille bas mobile ; suppression du **backdrop** séparé (fermeture **Fermer** / **Échap**). **`visit-views.jsx`**, **`index.css`**.
- **Visite — panneau lieu (timing)** : ouverture du détail **après** la fin du déplacement mascotte (aligné sur `VISIT_MAP_MASCOT_MOVE_MS`) ; sur **Marquer comme vu**, le panneau se **ferme d’abord**, puis la mascotte joue la **célébration** et le dialogue associé (le plein écran ne masque plus l’animation). **`visit-views.jsx`** ; e2e **`visit-mascot.spec.js`**.
- **Visite — progression carte** : suppression du compteur « vus / total » et de la barre horizontale ; indicateur **discret** en **anneau** (diagramme circulaire) ~52px avec le **pourcentage au centre** ; détail (fraction vus) en **infobulle** et **aria-label** pour l’accessibilité. **`visit-views.jsx`**, **`index.css`**.
- **Visite — clic sur le plan (mode vue)** : le fond de carte déplace à nouveau la mascotte pour **élève et prof** (`onMapClick` ne court-circuitait plus que les outils d’édition). **`visit-views.jsx`**.
- **Studio packs — sélection après création** : `POST` mascotte-packs puis **`setSelectedId` avant `onRefresh`**, pour que le `loadList` conserve le pack courant. **`VisitMascotPackManager.jsx`**.
- **E2e Playwright (local)** : `webServer.env.NODE_ENV=production` pour servir **`dist/`** ; ajustements **`visit-mascot.spec.js`**, **`visit-mode.spec.js`** (suffixe seed, studio après changement d’onglet, `evaluate` sur le toggle aperçu élève) ; bouton **`data-testid="visit-teacher-preview-toggle"`**. Skill **`foretmap-e2e`**.
- **Visite — emojis du plan** : les repères (HTML) appliquent une **contre-échelle** par rapport au zoom du calque (`scale(1/s)` via `--visit-map-scale`) pour composer les glyphes en pixels écran et limiter le flou ; les emojis des **zones** (SVG) utilisent la pile **`ForetMapColorEmoji`** / `text-rendering: geometricPrecision`. **`visit-views.jsx`**, **`index.css`**.
- **Carte — édition des sommets de zone** : poignées moins opaques (anneau léger + croix + point au sommet exact), zone de saisie élargie pour le tactile ; même principe visuel pour les points du tracé **nouvelle zone**. **`map-views.jsx`**.
- **Carte — édition des sommets** : la croix (viseur) n’apparaît qu’au **survol** souris ou pendant le **glisser** (tactile). **`map-views.jsx`**, **`index.css`**.
- **Visite — mise en page centrée carte** : barre d’en-tête fusionnée dans le bandeau au-dessus du plan (titre, lien **Présentation** vers le premier tuto en modale si disponible, cartes, progression compacte, aide, retour invité, **Plein plan** persistant, prof : **Aperçu comme élève**) ; carte pleine largeur avec hauteur renforcée ; détails lieu en **plein écran** avec **Échap** et bouton **Fermer** ; outils prof (plan, sync, mascotte) regroupés sous les tutoriels dans un **`<details>`** ; en mode **Plein plan**, tutoriels dans un **`<details>`**. **`visit-views.jsx`**, **`index.css`**, e2e **`visit-mode.spec.js`**.
- **Visite — validation packs mascotte (prod)** : résolution des chemins **`mascotPack.js`** sur plusieurs racines (**`lib/mascotPackValidatorResolve.js`**, utilisé par **`routes/visit.js`**) pour les hébergeurs où **`process.cwd()`** diffère de la racine du dépôt ; **`GET /api/admin/diagnostics`** expose **`mascotPackLibProbe`** (`libMirrorOk`, `roots`, `candidatesCount`) ; **`deploy:prepare:runtime`** exige **`lib/visit-pack/mascotPack.js`** et **`visitMascotState.js`** dans le staging ; doc **`docs/EXPLOITATION.md`** (503 `mascot_pack_module_unavailable`), **`docs/API.md`** ; tests **`tests/mascot-pack-validator-resolve.test.js`**, **`tests/api.test.js`**.

### Ajouté
- **Visite — panneau lieu** : après le bloc **Détails**, cadres repliables **Biodiversité** et **Tuto** (même logique que la fiche Info zone/repère en mode carte : espèces sur le lieu, espèces des missions, tutoriels liés au lieu ou aux tâches, aperçu **Consulter**). Données carte / tâches / catalogue passées depuis **`App.jsx`** ; utilitaires partagés **`src/utils/mapLocationContext.js`** (importés par **`map-views.jsx`**) ; tests **`tests/map-location-context.test.js`**.

### Modifié
- **Visite — bloc Détails** : les photos supplémentaires (**`visit_media`** restants + **`map_extra_photos`**) s’affichent **en tête** du corps déplié, **avant** le texte `visit_details_text` (puis le paragraphe). **`visit-views.jsx`**, **`index.css`**, **`docs/API.md`**.
- **Photos carte / visite (perf)** : URLs **`/uploads/zones/...`** et **`/uploads/markers/...`** dans les listes API et **`GET /api/visit/content`** ; **`GET .../photos/:pid/data`** renvoie **`302`** vers le statique quand le chemin est public ; vignettes **`*.thumb.jpg`** (génération **`sharp`** à l’upload, champ **`thumb_url`**) ; en-têtes **`Cache-Control`** sur **`/uploads`** et `sendFile` de secours ; UI (**`map-views`**, **`visit-views`**, **`tasks-views`**, héro biodiversité) : **`loading` / `decoding` / `fetchPriority`** ; dépendance **`sharp`** ; script **`post-deploy-check`** suit les redirections image.
- **Rules Cursor** : obligation explicite d’**ajouter ou adapter les tests dans le même lot** que toute nouvelle fonctionnalité (**`foretmap-conventions`** : API / `src.utils` / e2e selon le cas ; rappels **`foretmap-backend`** et **`foretmap-frontend`**).
- **Outillage agent / documentation** : skills (**`foretmap-species-autofill`**, **`foretmap-tests`**, **`foretmap-mascot-catalog`**, **`foretmap-docs-rules-skills`**) et rules (**`foretmap-biodiversite-autofill`**, **`foretmap-conventions`**) alignés sur l’identification Pl@ntNet hors autofill, l’inventaire des tests, les packs mascotte (`lib/visit-pack/`, sync build) et la sonde transport prod ; **`docs/EVOLUTION.md`** (§1.1, état avril 2026).
- **Build** : régénération des artefacts **`dist/`** (bundle Vite production, sync **`lib/visit-pack/`**).
- **Carte — fiche zone / repère (Info)** : sous le texte visite, panneaux dépliables **Biodiversité** (espèces sur le lieu + missions, liens vers le catalogue comme avant) et **Tuto** (même cartes qu’à l’onglet Tutoriels, avec **Consulter** si l’aperçu est disponible). **`map-views.jsx`**.

### Ajouté
- **Tests API** : couverture de **`PUT /api/map/markers/:id/photos/reorder`** dans **`tests/new-features.test.js`** (symétrique zone / médias visite).
- **Exploitation / diagnostic transport** : script **`scripts/prod-transport-probe.mjs`** et commande **`npm run prod:transport-probe`** (HTTP/1.1 vs HTTP/2, multiplex, handshake **`/socket.io`** ; JWT optionnel **`FORETMAP_TRANSPORT_PROBE_JWT`** / **`FORETMAP_SOCKETIO_LOAD_JWT`**) ; section **`docs/EXPLOITATION.md`** (*Chrome ERR_HTTP2_PROTOCOL_ERROR / Tiger Protect*) ; entrée **`R9`** dans **`docs/SITE_ISSUES.md`** / **`docs/SITE_ISSUES.json`** ; mentions **`docs/LOCAL_DEV.md`** et **`README.md`**.

### Modifié
- **Compression Express** : exclusion des chemins **`/socket.io`** du middleware **`compression`** (garde-fou proxy / Engine.IO). **`server.js`**.
- **Biodiversité — identification Pl@ntNet (UI)** : par emplacement d’image, boutons **Galerie / fichier** et **Appareil photo** (entrée `capture="environment"`) pour ouvrir directement la caméra sur smartphone, en plus du choix depuis la galerie. **`foretmap-views.jsx`**.
- **Navigation (n3beur / aperçu)** : lorsqu’une **zone** ou un **repère** est affiché sur la carte, les entrées **Tâches** et **Tuto** de la barre du bas sont fusionnées en un seul libellé **Tâches&tuto** (vers la vue Tâches, tutoriels du lieu inclus) ; idem pour les onglets prof en tête d’écran. Synchronisation du **focus lieu** avec la carte hors mode split (et effacement quand on ferme la fiche lieu). **`App.jsx`**, **`map-views.jsx`**.
- **Photos (galerie)** : sélection **multiple** depuis l’explorateur de fichiers pour l’upload prof sur **zone/repère** (carte), les **médias visite** (zone/repère), et le **formulaire biodiversité** (plusieurs fichiers répartis sur les champs photo dans l’ordre à partir du bouton utilisé). **`map-views.jsx`**, **`visit-views.jsx`**, **`foretmap-views.jsx`**.

### Ajouté
- **Photos — ordre par glisser-déposer** : colonne **`sort_order`** sur **`zone_photos`** et **`marker_photos`** (migration **`073_zone_marker_photos_sort_order.sql`**) ; **`PUT /api/zones/:id/photos/reorder`** et **`PUT /api/map/markers/:id/photos/reorder`** ; **`PUT /api/visit/media/reorder`** pour les médias visite ; UI prof (galerie carte zone/repère, liste médias éditeur visite) et **forum** (aperçu des pièces jointes images). **`routes/zones.js`**, **`routes/map.js`**, **`routes/visit.js`**, **`map-views.jsx`**, **`visit-views.jsx`**, **`attachment-images-picker.jsx`**, **`sql/schema_foretmap.sql`**, **`docs/API.md`**, tests.
- **Biodiversité — identification Pl@ntNet** : route **`POST /api/plants/plantnet-identify`** (proxy multipart vers l’API v2 **identify**, clé serveur uniquement) ; dans le formulaire plante (onglet biodiversité), section repliable pour 1 à 5 photos + organes, liste de propositions puis **« Utiliser pour le formulaire »** avant la pré-saisie multi-sources. **`lib/speciesAutofillPlantnet.js`**, **`routes/plants.js`**, **`foretmap-views.jsx`**, **`docs/API.md`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**, tests.
- **Tâches — vue condensée** : troisième mode d’affichage (à côté des tuiles et de la liste) : une ligne par tâche (pastille de statut + titre), détails complets au clic sur la ligne ; préférence persistée dans `localStorage` (`foretmap:tasks:viewMode` = `condensed`). **`tasks-views.jsx`**, **`index.css`**.

### Modifié
- **Pré-saisie biodiversité** : la source agrégée **`plantnet`** est retirée de **`GET /api/plants/autofill`** (liste `sources`, pipeline et gap-fill) ; **`shouldRunSource`** ignore tout id absent de la liste canonique. Pl@ntNet reste activable via **`SPECIES_AUTOFILL_PLANTNET=1`** + **`PLANTNET_API_KEY`** pour l’identification par image. **`lib/speciesAutofill.js`**, **`.env.example`**, tests, documentation.
- **Paramètres admin — test fournisseurs** : Pl@ntNet testé par **`GET /v2/quota`** (connectivité + clé) au lieu de **`species/align`** ; libellés **« Test connectivité (Pl@ntNet / OpenAI) »**. **`lib/speciesAutofillProviderSelfTest.js`**, **`settings-admin-views.jsx`**, **`docs/API.md`**.
- **Exploitation — auto-deploy cron** : garde-fou avant `git pull` si **`src/utils/mascotPack.js`** ou **`src/utils/visitMascotState.js`** change sans le fichier miroir sous **`lib/visit-pack/`** ; après pull, exécution de **`scripts/sync-visit-pack-server-lib.js`** par défaut (désactivable avec **`DEPLOY_SKIP_SYNC_VISIT_PACK_LIB=1`**). **`scripts/auto-deploy-cron.sh`**, **`docs/EXPLOITATION.md`**.

### Corrigé
- **Visite — validation packs mascotte en prod** : l’API ne dépend plus uniquement de **`src/utils/mascotPack.js`** (absent des déploiements sans sources) ; copie sous **`lib/visit-pack/`** synchronisée à chaque **`npm run build`** (`scripts/sync-visit-pack-server-lib.js`, script **`npm run sync:visit-pack-lib`**), résolution **`src`** puis **`lib`**. **`routes/visit.js`**, **`scripts/build-safe.js`**, **`package.json`**, **`docs/MASCOT_PACK.md`**.

### Ajouté
- **Visite — éditeur WYSIWYG packs mascotte** : édition visuelle (métadonnées, états, vignettes, médiathèque avec **`GET /api/visit/mascot-packs/:id/assets`**, upload/suppression PNG), onglet **JSON / export** ; onglet prof **« Packs mascotte »** ; bouton **« Ouvrir dans l’onglet Packs mascotte »** depuis la Visite. **`MascotPackWysiwygEditor.jsx`**, **`MascotPackPreviewPanel.jsx`**, **`mascotPackEditorModel.js`**, **`VisitMascotPackManager.jsx`**, **`MascotPackToolView.jsx`**, **`App.jsx`**, **`visit-views.jsx`**, **`routes/visit.js`**, **`index.css`**, **`docs/API.md`**, **`docs/MASCOT_PACK.md`**, **`docs/LOCAL_DEV.md`**, tests.
- **Tests — pré-saisie biodiversité** : fichier **`tests/species-autofill-common-species.test.js`** (suite `describe`) : cinq espèces vernaculaires courantes avec **HTTP mocké** (Wikipedia, Wikidata, GBIF, CoL, iNaturalist), désactivation temporaire des extensions **Pl@ntNet / OpenAI / Trefle** pour ne pas dépendre du `.env` ; cas **sources** restreintes (`wikipedia` + `gbif`) ; test **`pickScientificSeed`** avec indices formulaire.
- **Tests API** : **`GET /api/plants/autofill?q=aubergine&sources=gbif,openai`** avec **fetch mocké** (GBIF + OpenAI), activation temporaire **`SPECIES_AUTOFILL_OPENAI`**, contrôle des champs attribués à OpenAI vs **`OPENAI_ALLOWED_FIELD_KEYS`**. **`tests/api.test.js`**.

### Modifié
- **Visite — packs mascotte** : **`VisitMascotPackManager`** chargé à la demande (`React.lazy` + **`Suspense`**) dans l’onglet **Packs mascotte** et la modale Visite, pour alléger le chunk **`main`**. **`App.jsx`**, **`visit-views.jsx`**, build **`dist/`**.
- **Configuration** : `.env.example` précise que Wikipedia / GBIF / Wikidata (pré-saisie) ne requièrent pas de variables d’environnement.

### Corrigé
- **Biodiversité — pré-saisie OpenAI** : lorsque le **contexte agrégé** est très court (ex. extension seule sans Wikipedia/GBIF), consignes **mode indicatif pédagogique** pour éviter un JSON vide sur des requêtes vernaculaires courantes (aubergine, etc.) ; température légèrement relevée dans ce cas ; avertissement dédié. **`lib/speciesAutofillOpenAi.js`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**.

### Ajouté
- **Paramètres admin — pré-saisie espèces** : route **`GET /api/settings/admin/system/species-autofill-providers-test`** (auto-test HTTP minimal Pl@ntNet + OpenAI, sans exposer les clés) et bouton **Test pré-saisie (Pl@ntNet / OpenAI)** dans Actions système. **`lib/speciesAutofillProviderSelfTest.js`**, **`routes/settings.js`**, **`settings-admin-views.jsx`**, tests, **`docs/API.md`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**.

### Modifié
- **Visite — outil pack mascotte** : le bouton et la modale ne sont plus réservés au mode dev Vite ; libellé **« Boîte à outils pack mascotte »** ; **`visit-views.jsx`**, **`MascotPackToolView.jsx`**, **`docs/MASCOT_PACK.md`**, **`docs/LOCAL_DEV.md`**.

### Corrigé
- **Visite — API packs mascotte** : les **POST/DELETE** d’assets et **GET /api/visit/content** appliquent le même mappage d’erreurs SQL (table absente, contrainte) et incluent **`requestId`** dans les réponses 500 pour corréler avec les logs serveur. **`routes/visit.js`**.
- **Biodiversité — pré-saisie (`sources` restreint)** : avec seulement **OpenAI** (sans GBIF/Wikidata), le contexte LLM utilise désormais **`hint_name`** et le texte **`q`** en repli, et la requête OpenAI inclut les **indices formulaire** — évite l’absence totale de proposition pour un nom courant type « tomate ». **`lib/speciesAutofill.js`**, **`lib/speciesAutofillOpenAi.js`**, tests, **`docs/API.md`**.

### Ajouté
- **Visite — mascotte pack v1 (`sprite_cut`)** : schéma JSON (`docs/MASCOT_PACK.md`, `docs/mascot-pack.example.json`), Zod **`src/utils/mascotPack.js`** (dont **`allowedFramesBasePrefixes`** pour assets `/api/visit/mascot-packs/...`), CLI **`npm run mascot:pack:validate`**, page **`/mascot-pack-tool.html`**, runtime **`VisitMapMascotSpriteCut`** ; **persist serveur** : table **`visit_mascot_packs`**, migration **`072_visit_mascot_packs.sql`**, **`GET /api/visit/content`** (`mascot_packs`), CRUD + assets **`routes/visit.js`**, export **`hasPermission`**, **`VisitMascotPackManager.jsx`**, **`visitMascotPackExtras.js`**, fusion catalogue (**`visitMascotCatalog.js`**, **`useVisitMascotStateMachine`**, **`VisitMapMascotRenderer.jsx`**, **`visit-views.jsx`**, **`MascotPackToolView`** mode contrôlé), **`docs/API.md`** ; tests API / **`mascot-pack`** / e2e **`visit-mascot.spec.js`** ; bouton prof **« Boîte à outils pack mascotte »** (`index.css`).
- **Biodiversité — pré-saisie** : paramètre **`GET /api/plants/autofill?sources=`** (liste CSV d’identifiants blanc-listés) et cases à cocher **Sources à interroger** dans le formulaire plante pour n’appeler que les sources choisies ; la clé de cache inclut le filtre normalisé. **`routes/plants.js`**, **`lib/speciesAutofill.js`**, **`foretmap-views.jsx`**, tests, **`docs/API.md`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**.

### Corrigé
- **Visite — Renard 2 (`sprite_cut`)** : le fallback SVG **`backpackFox2`** n’est plus rendu sous les PNG découpés (il ne s’affiche que si aucune image de l’état n’est utilisable), pour éviter qu’il ne transparaisse aux bords des cellules.

### Ajouté
- **Visite — mascotte « Renard 2 » (sprites découpés)** : entrée catalogue **`renard2-cut-spritesheet`** (`renderer: sprite_cut`, pas d’atlas), images **`/assets/mascots/renard2-cut/frames/cell-r*-c*.png`**, manifeste **`src/data/renard2-cut-manifest.js`**, script **`npm run mascot:renard2-cut`**, composant **`VisitMapMascotSpriteCut.jsx`**, routage dans **`VisitMapMascotRenderer.jsx`**, états preview via **`getVisitMascotSupportedStates`** et **`useVisitMascotStateMachine`**, fallback SVG **`backpackFox2`**, styles **`index.css`**, tests catalogue et e2e sélecteur prof, doc **`docs/VISIT_MAP_GEOMETRY.md`**.

### Modifié
- **Skill `foretmap-mascot-catalog`** : documenter le renderer **`sprite_cut`** et le composant **`VisitMapMascotSpriteCut.jsx`** (checklist des états).
- **Biodiversité — pré-saisie (`GET /api/plants/autofill`)** : **`hint_scientific`** / **`hint_name`**, cache par empreinte **`q`+hints**, graine scientifique et alignement **Pl@ntNet** renforcés, passe **« trous »** (overlay PlantNet puis **OpenAI** `openai_gap` si activé). **`routes/plants.js`**, **`lib/speciesAutofill.js`**, **`lib/speciesAutofillOpenAi.js`**, **`foretmap-views.jsx`**, tests, **`docs/API.md`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**.
- **Visite — mascotte renard sac (assets)** : le script `fox-backpack-extract-and-compose.cjs` accepte **`--import`** (chemin PNG optionnel, sinon `FORETMAP_FOX_SOURCE` ou planche Gemini « ai-brush » du workspace Cursor) pour remplacer l’atlas par la **dernière planche** avant découpe ; rappel : le navigateur ne charge que **`fox-backpack-spritesheet.png`**, pas les fichiers `cells/`. Rebuild **`dist/`** après mise à jour si le serveur sert la prod locale.
- **Biodiversité — pré-saisie OpenAI** : **contexte enrichi** (Wikipedia FR, Wikidata, GBIF, traits GBIF, iNaturalist / Wikipedia EN, vernaculaires GBIF) pour de meilleures propositions ; champ autorisé **`second_name`** (consigne anti-invention) ; limite de contexte élargie. **`lib/speciesAutofill.js`**, **`lib/speciesAutofillOpenAi.js`**, tests, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**, **`docs/API.md`**.
- **Visite — photos média** : vignettes en **`object-fit: contain`** (image entière dans le cadre, bandes neutres si besoin) ; **clic** → **`Lightbox`** plein écran (composant partagé avec la carte) ; le **retour navigateur** ferme l’aperçu. **`visit-views.jsx`**, **`index.css`**.
- **Biodiversité — pré-saisie Pl@ntNet** : alignement avec **synonymes**, **langue** (`PLANTNET_LANG`, défaut `fr`), **authorship** (heuristique ou `PLANTNET_ALIGN_AUTHORSHIP`) ; second appel **`/species`** (`prefix` + `images=true`) pour **noms vernaculaires**, **UICN**, **photos** par organe (avec repli si plan pro / ambiguïtés) ; variables **`SPECIES_AUTOFILL_PLANTNET_NO_IMAGES`**, champs **`group_3` / `group_4` / `scientific_name`**. **`lib/speciesAutofillPlantnet.js`**, tests, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**, **`docs/API.md`**, **`.env.example`**.

### Ajouté
- **Visite — mascotte « Renard sac » (implémentation)** : entrée catalogue `fox-backpack-spritesheet` (grille **6×4**, **153×160** px, états visite complets), fallback SVG **`BackpackFoxVisitMascotSvg`**, script **`npm run mascot:fox-backpack`** (`scripts/fox-backpack-extract-and-compose.cjs` : extraction des cellules sous `public/assets/mascots/fox-backpack/cells/`, bulles **(2,4)(2,5)** remplacées par du transparent puis atlas recomposé), tests catalogue et e2e, doc **`docs/VISIT_MAP_GEOMETRY.md`**.

### Corrigé
- **Aide contextuelle (?)** : le panneau s’affiche via **`createPortal` sur `document.body`** avec **`z-index: 380`** (même cause que l’aperçu tutoriel : ancêtres `overflow` / vue scindée / carte). **`HelpPanel.jsx`**, **`index.css`**, build **`dist/`**.
- **Visite — panneau latéral** : la description « carte » des zones et la note « carte » des repères ne s’affichent plus dans l’onglet Visite ; seuls les textes et médias **dédiés visite** restent visibles (les notes carte restent éditables depuis l’onglet Carte). **`visit-views.jsx`**.
- **Visite — panneau latéral (régression)** : réaffichage de **`map_lead_photo`** dans l’UI (photo la plus récente des galeries carte, déjà fournie par l’API) dans l’ordre documenté ; suppression des encarts **description zone** / **note repère** réservés au prof dans cet onglet (contenu carte uniquement). **`visit-views.jsx`**.
- **Biodiversité — pré-saisie prod (HTTP 503 non JSON)** : la route attendait trop longtemps (Wikidata jusqu’à **5** requêtes entité **séquentielles** × timeout) ; désormais **budget wall-clock** (~12 s), timeouts HTTP **dégressifs**, plafond par requête, et chargements entité Wikidata en **parallèle** pour rester sous les délais des reverse proxies. **`lib/speciesAutofill.js`**, **`routes/plants.js`**, **`docs/API.md`**.

- **Visite — aperçu mascotte (prof/admin)** : les boutons de comportement déclenchent désormais la bonne animation **Rive** (fusion des noms d’animation par défaut pour tous les états avec le catalogue, ex. `running` → clip de marche/course) ; les **spritesheets** remontent le nœud animé au changement d’état pour relancer la CSS `steps()` ; le cadre d’aperçu applique les mêmes **mouvements de coque** (respiration / marche / rebond) que sur la carte selon l’état choisi.

### Ajouté
- **Biodiversité — pré-saisie photos** : sélection **multiple** parmi les propositions, avec menu **« Associer au champ »** (photo espèce, feuille, fleur, etc.) par image ; plusieurs URL peuvent être fusionnées sur un même champ. **`foretmap-views.jsx`**, **`index.css`**, build **`dist/`**.
- **UI — emojis** : police **Noto Color Emoji** auto-hébergée (`public/fonts/noto-color-emoji.woff2`) avec **`@font-face` ForetMapColorEmoji** et variables **`--font-emoji-stack` / `--font-sans-with-emoji`** dans **`index.css`** (repères et zones carte, visite, sélecteurs, biodiversité, puces tâches, texte mixte profils RBAC) pour limiter les rectangles sur OS sans glyphes colorés. Script **`npm run fonts:sync-noto-emoji`**, **`src/constants/emojiFontCoverage.js`**, **`tests/emoji-font-coverage.test.js`**, **`docs/LOCAL_DEV.md`**, libellé réglage **`ui.map.location_emojis`**.
- **Biodiversité — pré-saisie** : traits Wikidata **P366** / **P183** (`human_utility`, `geographic_origin`) ; heuristiques sur l’extrait Wikipedia FR (`wikipedia_heuristic`) ; socles optionnels **Trefle** et **OpenAI** (désactivés par défaut, doc `docs/SPECIES_AUTOFILL_EXTENSIONS.md`, variables `.env.example`). **`lib/speciesAutofill*.js`**, tests, **`docs/API.md`**.
- **Biodiversité — pré-saisie (enrichissement)** : source **`gbif_traits`** (descriptions GBIF + statut taxon) ; Wikidata **P9714** (aire d’occurrence) ; heuristiques Wikipedia étendues (récolte, plantation, agrosystème) ; iNaturalist (taxon éteint / statut conservation) ; fusion **`description`** par rang de source ; graine nom scientifique **GBIF avant Wikidata** ; **Trefle** HTTP réel si activé ; **Pl@ntNet** (align, `second_name`) ; UI liste des champs sans proposition auto. **`lib/speciesAutofillGbifDescriptions.js`**, **`lib/speciesAutofillPlantnet.js`**, **`foretmap-views.jsx`**, tests, **`docs/API.md`**, **`docs/SPECIES_AUTOFILL_EXTENSIONS.md`**, **`.env.example`**.
- **Visite — mascotte oiseau tan (spritesheet 2 frames)** : atlas horizontal `public/assets/mascots/tan-bird/tan-bird-spritesheet.png`, entrée catalogue `tan-bird-spritesheet` (`idle` = 1ère image, `walking`/`running` = alternance des 2 images), fallback SVG **`TanBirdVisitMascotSvg`** dans **`VisitMascotFallbackSvg.jsx`**, tests catalogue et e2e sélecteur prof.
- **Stats** : `GET /api/stats/me/:studentId` et chaque entrée de `GET /api/stats/all` exposent **`stats.plant_species_observed`**, **`stats.plant_observation_events`**, **`stats.tutorials_read`** (biodiversité catalogue + tutoriels lus). **`GET /api/stats/all`** renvoie **`{ students, site }`** avec agrégats tout le site. **Export CSV** (`GET /api/stats/export`) : trois colonnes supplémentaires. Vues **`StudentStats`** / **`TeacherStats`** ; consommation **`tasks-views`** / **`profiles-views`** avec repli si l’API renvoie encore un tableau nu.
- **Biodiversité — groupe (taxon) 4** : colonne **`plants.group_4`** (migrations **`069_plants_group_4.sql`** et rattrapage **`071_plants_group_4_rattrapage.sql`** : végétaux = famille FR alignée sur **`group_3`**, animaux = genre depuis le nom scientifique), API/import (`groupe_4`), dérivation à l’enregistrement **`lib/plantGroup4.js`**, formulaire (**`foretmap-views.jsx`**), recherche catalogue **`plantFilters.js`**, template CSV et **`docs/IMPORT_BIODIVERSITE.md`**, tests **`tests/plant-group4.test.js`**, **`tests/plants-import.test.js`**.
- **Visite — mascottes SPR0UT et SCR4P** : entrées catalogue Rive (`sprout-rive`, `scrap-rive`), fallbacks SVG **`VisitMascotSproutSvg`** / **`VisitMascotScrapSvg`**, hook **`useVisitMascotStateMachine`**, états et dialogues étendus (**`visitMascotState.js`**, **`visitMascotCatalog.js`**), rendu **Rive** (**`VisitMapMascotRive.jsx`**, **`VisitMascotFallbackSvg.jsx`**), intégration carte et visite (**`map-views.jsx`**, **`visit-views.jsx`**), styles **`index.css`**, tests unitaires et e2e (**`visit-mascot-*.test.js`**, **`e2e/visit-mascot.spec.js`**), build **`dist/`**.

### Modifié
- **Visite — panneau latéral** : après le sous-titre visite, l’ordre est désormais **photo carte** (`map_lead_photo`), puis **description courte visite**, puis la **première image média visite** (les autres médias visite restent dans le bloc dépliable). **`visit-views.jsx`**.

- **Biodiversité — pré-saisie (formulaire plante)** : les propositions de **photos** affichent une **vignette d’aperçu** (grille par champ), lien « Ouvrir l’image », lien **page source** si fourni, crédit/licence ; repli texte si l’image ne charge pas (hotlink). **`foretmap-views.jsx`**, **`index.css`**.
- **Build** : régénération des artefacts **`dist/`** (Vite production en local, chemins hashés CSS/JS et assets mascottes à jour).
- **Biodiversité — après observation d’espèce** : une fois la découverte ou une nouvelle observation validée, proposition d’**enrichir** l’observation par un **commentaire** et/ou jusqu’à **trois photos** sur la fiche (`POST /api/context-comments`, contexte `plant`), avec **« Plus tard »** pour ignorer. Activé si le module commentaires de contexte est actif **et** que le profil peut publier. **`PlantSpeciesDiscoveryAcknowledge.jsx`**, **`foretmap-views.jsx`**, **`tasks-views.jsx`**.
- **Tutoriels — aperçu** : dans la modale d’aperçu (carte zone/repère, missions, visite, bouton « Ouvrir » de l’onglet Tutoriels), pied avec **« Marquer comme lu »** et **même confirmation** (case + modale) que sur les fiches liste ; chargement des IDs lus sur **carte** et **tâches**. **`TutorialPreviewModal.jsx`**, **`map-views.jsx`**, **`tasks-views.jsx`**, **`tutorials-views.jsx`**, **`visit-views.jsx`**, **`App.jsx`**, **`index.css`**.
- **Tutoriels — aperçu (affichage)** : rendu **`createPortal` → `document.body`** pour éviter rognage / iframe invisible (ancêtres `overflow:hidden`, défilement, vue scindée) ; **`z-index`** aperçu **400** et confirmation lecture **460**. **`TutorialPreviewModal.jsx`**, **`TutorialReadAcknowledge.jsx`**, **`index.css`**, build **`dist/`**.
- **Biodiversité — aperçu depuis carte et missions** : un clic sur une espèce (zone, repère, puce sur une tâche) ouvre une **fenêtre d’aperçu** (portal sous `body`, même principe que les **tutoriels**) avec la **même fiche catalogue** que l’onglet Biodiversité ; toast si aucune fiche pour le nom (tâches). **`App.jsx`**, **`PlantCatalogPreviewModal`** / **`PlantBiodiversityCatalogPreviewCard`** dans **`foretmap-views.jsx`**, **`map-views.jsx`**, **`tasks-views.jsx`**, **`index.css`** (défilement corps modale).
- **Build** : régénération **`dist/`** (bundles hashés après évolution UI).

- **Client — charge serveur et fluidité** : polling données espacé à **60 s** par défaut ; sur les onglets secondaires (à propos, réglages, audit, profils, tuto, stats, forum, carnet) l’intervalle est **doublé** lorsque le temps réel Socket.IO n’est pas actif ; le minuteur ignore les ticks si l’onglet est masqué ; un **rafraîchissement immédiat** part à la sortie de ces onglets vers carte / tâches / visite / biodiversité. Le **resize** fenêtre est **cadencé par `requestAnimationFrame`** pour limiter les re-rendus. Keyframes UI courantes (`fadeIn`, `popIn`, `toastIn`, stats, pastille temps réel) passent en **`translate3d` / `scale3d`** pour un compositeur plus stable. **`App.jsx`**, **`src/index.css`**.

- **Biodiversité — pré-saisie espèces (`/api/plants/autofill`)** : repli Wikipedia via **opensearch** ; Wikidata (**5** candidats) ; après GBIF, requêtes **iNaturalist** (`buildSearchQueries`, nom vulgaire + nom scientifique), **noms vernaculaires GBIF** (`fra`/`fre` → `second_name`, avertissement si vide), **résumé Wikipedia EN** si le texte FR est trop court ; `usageKey` GBIF pour les appels vernaculaires. **`lib/speciesAutofill.js`**, **`docs/API.md`**, **`tests/species-autofill.test.js`**, **`tests/api.test.js`**.
- **UI — mobile (passe 3)** : amélioration du confort sur petits écrans (densité et lisibilité des sections, filtres tâches en pleine largeur, boutons de switch plus faciles au toucher, cartes visite/tâches légèrement compactées, bascules visite ajustées) pour un rendu plus fluide sans impact métier. **`src/index.css`**.
- **UI — polish visuel (passe 2)** : barre de navigation basse plus moderne (fond translucide, blur, hover), micro-interactions renforcées sur les onglets haut/bas, sections tâches légèrement animées à l’apparition et conteneurs de bascule visite stylés pour un rendu plus fluide et cohérent. **`src/index.css`**.
- **Biodiversité — observations par espèce** : remplacement de **`user_plant_discoveries`** par **`user_plant_observation_events`** (plusieurs confirmations par utilisateur et par fiche) ; migration **`070_user_plant_observation_events.sql`** et schéma **`sql/schema_foretmap.sql`** ; **`GET /api/plants/me/discovered-ids`** inchangé côté usage (IDs avec au moins une observation) ; nouveau **`GET /api/plants/me/observation-counts`** (`plant_ids`, max 200) ; **`POST /api/plants/:id/acknowledge-discovery`** renvoie **`observed_at`**, **`my_observation_count`**, **`site_observation_count`** ; bouton **« Espèce observée »** avec compteurs perso / tout le site et possibilité d’enregistrer une observation supplémentaire. **`routes/plants.js`**, **`PlantSpeciesDiscoveryAcknowledge.jsx`**, **`foretmap-views.jsx`**, **`index.css`**, **`docs/API.md`**, **`tests/plants-discovery.test.js`**.
- **Biodiversité — remarques catalogue** : affichage aligné sur la fiche espèce des missions (titre **Remarques**, trois paragraphes, mêmes styles que **`LivingBeingsCatalogPanel`**) via **`CatalogRemarksSection`** ; les champs **`remark_1`…3** ne sont plus dans le panneau repliable **Identité**. **`map-views.jsx`**, **`foretmap-views.jsx`**.
- **Biodiversité — libellés groupes taxonomiques** : l’interface affiche **Groupe (taxon) 1**, **2** et **3** (formulaire prof, section identité des fiches, filtres catalogue : anciennement « Groupe 1…3 », « Grand groupe », « Sous-groupe 1/2 »). **`foretmap-views.jsx`**.

### Ajouté
- **Visite — cinq silhouettes mascotte distinctes** : Spore (champignon), Liane, Mousse (blob), Graine (feuille), Essaim (lucioles) — SVG de fallback dédiés dans `src/components/VisitMascotFallbackSvg.jsx`, entrées catalogue Rive associées, attribut `data-mascot-shape` sur les shells, animations CSS spécifiques marche/joie par forme ; e2e sélecteur étendu (`data-mascot-shape` après choix Spore).
- **Visite — position mascotte persistante** : mémorisation locale (`localStorage`, par identifiant de plan) de la position % de la mascotte entre sessions, y compris en visite publique sans compte ; utilitaire `src/utils/visitMascotPositionPersistence.js` et tests `tests/visit-mascot-position-persistence.test.js`.
- **Visite — mascotte gnome punk** : nouvelle variante `Gnome punk (Rive)` (look décalé : mohawk coloré, palette contrastée, détails punk) disponible dans le sélecteur de mascotte.
- **Visite — deuxième mascotte gnome** : ajout d’une variante `Gnome ambre (Rive)` dans le catalogue, avec fallback visuel dédié (`fallbackVariant`) pour proposer dès maintenant un vrai second choix de mascotte dans le sélecteur.
- **Visite — mascottes extensibles (catalogue)** : nouveau registre `src/utils/visitMascotCatalog.js` pour déclarer facilement plusieurs mascottes (Rive ou spritesheet), persistance locale du choix (`localStorage`) et renderer unifié `VisitMapMascotRenderer` pour préparer la sélection de mascotte par utilisateur.
- **Visite — renderer spritesheet prêt à l’usage** : composant `VisitMapMascotSpritesheet.jsx` (états `idle/walking/happy`, config frames/fps/row), fallback statique automatique si sprite manquant et sélecteur “Mascotte active” dans l’aperçu visite prof/admin.

- **Visite — mascotte V1 (états + dialogue)** : machine d’état front (`idle`/`walking`/`happy`) reliée aux événements visite (déplacement et marquage « vu »), bulle de dialogue contextuelle près de la mascotte, et nouveaux tests unitaires (`tests/visit-mascot-state.test.js`) + e2e (`e2e/visit-mascot.spec.js`) pour couvrir ces comportements.

### Modifié
- **Tests e2e — sélecteur mascotte prof** : ajout d’un scénario Playwright qui vérifie explicitement que changer la valeur du sélecteur met à jour la mascotte active (attribut `data-mascot-id`) dans l’aperçu et sur la carte visite.
- **Visite — gnome de profil en mouvement** : le fallback mascotte adopte une silhouette de gnome en profil avec membres distincts ; en marche, bras et jambes alternent selon la direction de déplacement (gauche/droite via orientation existante) et, à l’état `happy` après marquage “vu”, le gnome lève les bras.
- **Visite — style mascotte “gnome ForetMap”** : fallback SVG repensé en gnome (chapeau, barbe, tenue nature), animations CSS enrichies (`idle` respirant, `walking`, `happy`) et dialogues thématiques gnome pour mieux coller à l’identité visuelle du projet.
- **Visite — migration renderer mascotte vers Rive** : remplacement du composant Lottie par `VisitMapMascotRive`, ajout du runtime `@rive-app/react-canvas`, suppression des scripts/assets Lottie (`VisitMapMascotLottie.jsx`, `src/assets/lottie/visit-mascot.json`, `scripts/build-visit-mascot-lottie.mjs`) et adaptation du diagnostic (`data-renderer`, `data-rive-status`, `data-mascot-state`) + docs associées (`docs/VISIT_MAP_GEOMETRY.md`).

### Corrigé
- **Tutoriels — aperçu** : modale centrée dans le viewport, hauteur bornée pour que l’iframe remplisse l’espace sans défilement parasite sur le conteneur parent ; titre centré dans un en-tête dédié. **`TutorialPreviewModal.jsx`**, **`src/index.css`**.
- **Client — erreur réseau** : en build de production, le message « impossible de contacter le serveur » n’affiche plus les consignes de développement local (Vite, port 3000) ; un texte adapté aux utilisateurs du site distant est utilisé à la place. **`src/services/api.js`**.

- **Biodiversité — build après remarques catalogue** : le commit **`CatalogRemarksSection`** référençait **`fetchPlantObservationCounts`** sans livrer les fichiers associés ; correctif en lot (**`PlantSpeciesDiscoveryAcknowledge.jsx`**, **`routes/plants.js`**, migration **`070_user_plant_observation_events.sql`**, schéma, **`docs/API.md`**, **`tests/plants-discovery.test.js`**, **`index.css`**).

- **Biodiversité — accusé « espèce découverte »** : branchement manquant du bouton **`PlantSpeciesDiscoveryAcknowledgeButton`** dans **`PlantViewer`** et **`PlantManager`** (`foretmap-views.jsx`), passage de **`onForceLogout`** depuis **`App.jsx`**, rechargement des IDs après **`foretmap_session_changed`** (comme les tutoriels).
- **Visite — mascotte toujours perceptible** : ajout d’une silhouette mascotte statique affichée en permanence sous la couche Lottie, afin de garantir une présence visuelle même si le renderer navigateur produit un rendu transparent malgré un état “painted”. Le fallback d’erreur reste actif et les tests e2e mascotte restent verts. **`VisitMapMascotLottie.jsx`**, **`index.css`**, **`e2e/visit-mascot.spec.js`**.
- **Visite — mascotte toujours visible en cas d’échec Lottie** : quand les renderers SVG/canvas ne produisent pas de rendu exploitable, la carte affiche désormais une mascotte **SVG statique** (fallback visuel) au lieu d’un simple cadre/placeholder ambigu. Le diagnostic runtime (`data-renderer`, `data-painted-*`) reste disponible pour l’analyse locale/prod. **`VisitMapMascotLottie.jsx`**, **`index.css`**, **`e2e/visit-mascot.spec.js`**.
- **Visite — mascotte invisible (analyse forensic)** : instrumentation runtime du composant Lottie (`data-renderer`, `data-painted-status`, `data-painted-checks`, `data-painted-reason`), durcissement de la détection visuelle (SVG: visibilité/opacité effectives ; canvas: échantillonnage de pixels alpha), retries bornés avant fallback et garde-fou anti-clipping sur la position affichée de la mascotte dans la scène. Tests e2e renforcés contre les faux positifs « boîte non vide mais rendu transparent ». **`VisitMapMascotLottie.jsx`**, **`visit-views.jsx`**, **`e2e/visit-mascot.spec.js`**, **`docs/VISIT_MAP_GEOMETRY.md`**.
- **Visite — mascotte invisible (SVG vide en prod)** : quand Lottie monte un SVG présent mais non peint (cadre visible, contenu vide selon moteur/plateforme), le rendu bascule automatiquement en **canvas** ; en cas d’échec des deux rendus, le placeholder reste affiché. Styles alignés pour `svg` et `canvas`, et tests e2e mis à jour pour accepter les deux renderers. **`VisitMapMascotLottie.jsx`**, **`index.css`**, **`e2e/visit-mascot.spec.js`**.
- **Visite — plan absent** : l’URL normalisée côté API peut être **`/map.png`** (fichier inexistant) pour la carte **foret**, alors que l’onglet **Carte** essayait déjà des repli (`/maps/map-foret.svg`, etc.) via **`onError`**. La visite réutilise la même liste de candidats et le même basculement sur erreur que **`map-views.jsx`**. **`visit-views.jsx`**.
- **Visite — mascotte invisible (correctif durable)** : durcissement de **`VisitMapMascotLottie`** (détection SVG exploitable + bascule automatique vers placeholder si rendu vide), calque mascotte remonté au-dessus des repères (**`z-index` 16), raison explicite de visibilité/non-visibilité exposée sur **`.visit-map-stage`** (`data-visit-mascot-visibility`, `data-visit-mascot-reason`) via **`visitMascotVisibility`**, tests renforcés (**unitaires** + **e2e** `visit-mascot.spec.js`) et checklist diagnostic mise à jour. **`src/components/VisitMapMascotLottie.jsx`**, **`src/utils/visitMascotVisibility.js`**, **`src/components/visit-views.jsx`**, **`src/index.css`**, **`tests/visit-mascot-visibility.test.js`**, **`e2e/visit-mascot.spec.js`**, **`docs/VISIT_MAP_GEOMETRY.md`**.
- **Visite — plan** : la molette et le tactile appelaient `preventDefault` sur des écouteurs **passifs** (comportement React), d’où l’avertissement console *« unable to preventDefault inside passive event listener »* après rechargement forcé. Les gestes **wheel**, **touch** et **pointer** (pan / pincement) sont branchés sur le nœud carte avec **`addEventListener(..., { passive: false })`**, comme sur la carte principale (`map-views.jsx`). **`visit-views.jsx`**.
- **Visite — mascotte Lottie « invisible »** : après `loadAnimation`, application de la frame idle sur l’événement **`DOMLoaded`** et repli **double `requestAnimationFrame`** pour éviter des chemins SVG vides si `goToAndStop(0)` partait trop tôt. Calque carte : **`z-index`** explicites (**zones 1**, mascotte **10**, repères **14**). **`VisitMapMascotLottie.jsx`**, **`index.css`**, **`docs/VISIT_MAP_GEOMETRY.md`**.

### Ajouté
- **Visite — réalignement carte** : **`POST /api/visit/rebuild-from-map`** (prof, droits visite) recrée en une transaction toutes les **`visit_zones`** / **`visit_markers`** du plan à partir de la carte, en **conservant** pour chaque id encore sur la carte sous-titres, textes de détails, ordre, actif et **`visit_media`** ; nettoyage médias + progression pour les cibles visite sans équivalent carte. UI : bouton dans l’onglet visite (carte d’import). **`routes/visit.js`**, **`visit-views.jsx`**, **`index.css`**, **`docs/API.md`**, test **`tests/new-features.test.js`**.
- **Visite — diagnostic prod (mascotte)** : agrégats **`visitMascotHint`** sur **`GET /api/admin/diagnostics`** (par carte : volumes visite publics / tutoriels et **`mascotWouldRenderHint`**, sans PII) via **`lib/visitMascotDiagnostics.js`** ; tests **`tests/visit-mascot-diagnostics.test.js`** et assertions **`tests/api.test.js`** ; checklist opérateur dans **`docs/VISIT_MAP_GEOMETRY.md`** ; mentions **`docs/API.md`**, **`docs/EXPLOITATION.md`**, **`docs/EVOLUTION.md`**.
- **Biodiversité — découvertes utilisateur** : bouton **« Espèce découverte »** (JWT) et engagement explicite (observation sur le terrain + lecture de fiche), sur le modèle tutoriel « marquer comme lu » ; table **`user_plant_discoveries`** (migration **`068_user_plant_discoveries.sql`**, schéma **`sql/schema_foretmap.sql`**), **`GET /api/plants/me/discovered-ids`** et **`POST /api/plants/:id/acknowledge-discovery`** (`confirm: true`) dans **`routes/plants.js`** ; composant **`PlantSpeciesDiscoveryAcknowledge.jsx`**, intégration **`PlantViewer`** / **`PlantManager`** et **`App.jsx`** (`onForceLogout`) ; tests **`tests/plants-discovery.test.js`** ; **`docs/API.md`**.
- **Tests — mascotte visite** : extraction **`src/utils/visitMascotPlacement.js`** (repère entrée N3, position initiale) et **`src/utils/visitMascotVisibility.js`** ; tests Node **`tests/visit-mascot-placement.test.js`**, **`tests/visit-mascot-visibility.test.js`** ; e2e Playwright **`e2e/visit-mascot.spec.js`** avec fixture **`e2e/fixtures/visit-api.fixture.js`** (seed API prof sur carte **n3**, nettoyage après chaque test). Couverture : visibilité, position initiale entrée N3, déplacement au clic (repère / zone), classe **walking**, **`prefers-reduced-motion`**. **`e2e/visit-mode.spec.js`** : assertion mascotte sur **`.visit-map-mascot-inner`** (le conteneur **`.visit-map-mascot`** est en **0×0** et est vu « hidden » par Playwright).
- **Tâches** : les pastilles **biodiversité** (`living_beings_list`) sur chaque **carte de mission** (affichage tuiles ou liste) sont **cliquables** ; une fenêtre affiche la **fiche catalogue** (description, rôle dans l’écosystème, utilité pour l’humain), sur le même principe que les modales **zone** et **repère**. Le panneau `LivingBeingsCatalogPanel` est **exporté** depuis `map-views.jsx` pour réutilisation dans `tasks-views.jsx`.

### Modifié
- **Build** : régénération de **`dist/`** (`npm run build` local — bundles Vite hashés à jour pour prod / e2e sur **`dist/`**).
- **Client API** (`src/services/api.js`) : si le navigateur signale une panne de transport (**« Failed to fetch »**, **NetworkError**, etc.), le message affiché rappelle explicitement de lancer **`npm run dev`** (port **3000**) en parallèle de **`npm run dev:client`** (Vite), cause habituelle en local quand seul le front est ouvert.
- **Carte / extrait catalogue** (`LivingBeingsCatalogPanel`) : sous **Utilité pour l’être humain**, ajout du bloc **Remarques** avec les trois champs d’identité (**remarque 1**, **2**, **3**), **une ligne chacune** (tiret côté client si vide), affiché dès qu’au moins une remarque est renseignée sur la fiche. Modales zone et repère, cartes mission (tâches). **`map-views.jsx`**.
- **Build** : régénération de **`dist/`** (`npm run build` en local — bundles Vite production à jour pour déploiement).
- **Biodiversité (catalogue / base prof)** : pastille en tête de fiche = **groupe 2** ; **photo principale** (`photo` puis `photo_species`, y compris résolution catégorie Commons) affichée **sous la description brève** et **au-dessus** du bloc rôle écosystème / utilité humaine, avec lightbox au clic. **`foretmap-views.jsx`**, **`index.css`**.
- **Build** : régénération de **`dist/`** (`npm run build` en local — bouton **réalignement visite** sur la carte).
- **Build** : régénération de **`dist/`** (`npm run build` en local — bundles Vite : mascotte visite Lottie **DOMLoaded** / z-index calque).
- **Serveur / cache HTML** : en prod, **`express.static`** sur **`dist/`** envoie **`Cache-Control: no-store`** pour **`index.vite.html`**, **`index.html`** et **`deploy-help.html`** afin de limiter les incohérences entre l’index mis en cache et les assets Vite hashés. **`server.js`**.
- **Commentaires contextuels / forum — photos** : suppression du plafond **1,5 Mo par image** (appli + client) ; borne = **corps JSON** HTTP (**100mb** par défaut, variable **`FORETMAP_JSON_BODY_LIMIT`**). **`server.js`**, **`lib/userContentImages.js`**, **`attachment-images-picker.jsx`**, **`docs/API.md`**, **`.env.example`**, **`docs/AUDIT_PHOTOS_BIODIVERSITE.md`**.
- **Tutoriels** : ouverture **uniquement en modale** (iframe) depuis la carte (fiches zone/repère), les missions et projets (pastilles et liste « pour ce lieu »), la **visite** et le bouton **« Ouvrir »** de l’onglet Tutoriels — aligné sur **« Aperçu »** ; plus d’onglet navigateur pour les contenus servis par **`/api/tutorials/:id/view`** ni pour les anciens chemins fichier. Composant partagé **`src/components/TutorialPreviewModal.jsx`**. Côté serveur, **GET /api/tutorials/:id/view** injecte un script qui redirige les liens **target="_blank"** / **_top** vers la **même frame** (HTML legacy importé). Styles **`button.task-chip.task-tutorial-chip`**.
- **Déploiement auto (cron)** : `scripts/auto-deploy-cron.sh` — variable **`DEPLOY_SKIP_RESTART_IF_SOFT_ONLY=1`** (opt-in) pour **ne pas** appeler **`/api/admin/restart`** lorsque le diff entre commits ne touche qu’à des chemins « doc / méta » (regex **`DEPLOY_SOFT_CHANGE_REGEX`**, surchargeable) ; **`DEPLOY_SECRET`** n’est exigé que si un redémarrage est effectivement prévu (aucune erreur inutile quand le cron constate « déjà à jour » sans secret). Documentation **`docs/EXPLOITATION.md`** (comportement sans nouveau commit ; migrate uniquement si `migrations/` dans le diff).
- **Tutoriels (contenu en base)** : **`lib/inlineLegacyTutorialHtml.js`** — au **démarrage** (`initDatabase`) et après **`initSchema`**, les lignes HTML encore sans `html_content` mais avec `source_file_path` sous **`/tutos/`** sont mises à jour (fichier lu, HTML stocké, chemin effacé). **`POST`/`PUT` `/api/tutorials`** : si seul un chemin fichier est fourni pour un tuto HTML, **même intégration** immédiate. Chemins résolus / sécurisés comme avant (`routes/tutorials.js` s’appuie sur le module commun). Tests **`tests/tutorials.test.js`** ; **`docs/API.md`**.
- **Tutoriels — aperçu** : la modale **plein cadre** (marges minimales, zones sûres) ; l’**iframe** occupe le **reste de la hauteur** en **flex** au lieu d’un plafond **980px** / **90vh** fixe.
- **Visite (panneau zone/repère)** : la **première photo** (`visit_media`, ordre `sort_order`) s’affiche sous le **sous-titre** de visite ; les **photos suivantes** sont regroupées dans le bloc **Détails** (avec le texte de détails le cas échéant). Le bloc Détails reste ouvrable s’il n’y a que des photos supplémentaires (sans texte).
- **Visite** : la **description catalogue** des zones et la **note** des repères ne s’affichent plus pour les élèves et visiteurs (réservées au **mode professeur**) ; les champs **spécifiques à la visite** (sous-titre, court texte, détails, médias) restent inchangés côté affichage.
- **Client API** (`src/services/api.js`) : en cas d’échec HTTP, message plus explicite lorsque la réponse **n’est pas du JSON** (souvent mauvaise URL d’API ou passerelle) ; libellé avec **code HTTP** quand le JSON ne contient pas `error` ; ajout de **`X-Request-Id`** dans le texte du toast et sur l’exception (`requestId`) pour corréler avec les logs serveur.
- **Documentation / Cursor** : skills **foretmap-tests**, **foretmap-e2e**, **foretmap-project** ; règles **foretmap-conventions**, **foretmap-frontend** ; **`docs/LOCAL_DEV.md`** (tableau récap commandes de test, lien mascotte ; section Artillery renommée **5quinquies** ; lien du tableau **test:load** vers cette section), **`docs/EVOLUTION.md`**, **`docs/VISIT_MAP_GEOMETRY.md`** (section tests automatisés visite / mascotte).
- **Tâches (cartes mission)** : les accès **biodiversité** (fiches catalogue) et **tutoriels** liés à la mission sont affichés **sous le texte de description** de la tâche (et sous la photo si elle existe), au lieu d’être mélangés aux pastilles lieu / dates en tête de carte.
- **Commentaires de contexte / forum** : photos en **Galerie** ou **Appareil photo** (`capture="environment"`), comme pour les zones et repères ; **`armNativeFilePickerGuard`** à l’ouverture du sélecteur (évite la fermeture des modales au retour caméra sur mobile) ; captures avec **type MIME vide** ou **`application/octet-stream`** acceptées si le **data URL** est bien JPEG/PNG/WebP.
- **Tâches collectives (n3boss)** : marquer la part d’un assigné comme terminée se fait par **un seul clic** sur le nom (plus de boîte de confirmation navigateur).
- **Build** : régénération de **`dist/`** (`npm run build`, Vite production en local — intégration HTML tutoriels + bundles à jour).

### Corrigé
- **Visite — mascotte (prod)** : **`VisitMapMascotLottie`** + **`lottie-web`** importés **sans** `React.lazy` (chunk dynamique susceptible d’échouer sous **`import.meta.env.BASE_URL`** / CDN). Visibilité : **tutoriels** du plan pris en compte (`shouldShowVisitMapMascot`, 5ᵉ argument). **`GET /api/visit/content`** : filtre **`is_active`** assoupli via **`lib/visitContentPublicActive.js`** (exclusion seulement si désactivation explicite `0` / `false` / `'0'`). Calque **`.visit-map-mascot`** : **`z-index`** relevé pour rester au-dessus du SVG. Tests **`tests/visit-content-public-active.test.js`** ; **`docs/API.md`**.
- **Visite** : un échec de **`GET /api/visit/progress`** (réseau, 503, etc.) ne bloque plus tout le chargement de l’onglet — cartes, contenu **`/api/visit/content`** et **mascotte** s’affichent avec une progression vide le cas échéant. Utilitaire **`src/utils/visitProgressClient.js`** (`safeVisitProgressPayload`), tests **`tests/visit-progress-client.test.js`**.
- **Visite — mascotte** : le fallback **Suspense** et une erreur **`lottie.loadAnimation`** affichent un **placeholder visible** (🧭, style **`.visit-map-mascot-lottie--placeholder`**) au lieu d’un calque **`visibility: hidden`** invisible.
- **Tests e2e (Playwright)** : **`enableTeacherMode`** — fermeture de la **modale promo profil** avant le cadenas, attente de la réponse **POST /api/auth/elevate** puis du bouton **Désactiver les droits étendus** (délais **25 s / 60 s**). **`tasks-full-cycle`** — fermeture du dialogue **Rapport de tâche** après soumission ; **GET /api/tasks** enregistré **après** la 2e élévation et **avant** l’onglet Tâches (évite un timeout **25 s** pendant une élévation > **25 s**) ; timeout de test **300 s** ; clic **✔️ Validée** en **`force: true`** si l’action reste instable. **`tasks-flow`** : timeout **120 s**. **`realtime-multi-session`** : timeout **180 s** (double session). **`dist/`** régénéré (`npm run build`).
- **Build** : **`npm run build`** échouait sur **`tutorials-views.jsx`** (esbuild : fin de fichier avant fermeture du fragment racine). Le `return` principal utilise un conteneur **`div.tutorials-root`** en **`display: contents`** à la place du fragment court, sans changer la mise en page.
- **Onglet Tutoriels** : l’**aperçu** (et les autres surcouches modales de la vue) était rendu **à l’intérieur** du conteneur **`fade-in`** racine, dont l’animation applique un **`transform`** — cela créait un **bloc d’ancrage** pour **`position: fixed`** : fond sombre visible mais panneau blanc hors champ ou invisible. Les modales sont rendues **en dehors** de ce wrapper ; suppression du **`fade-in`** redondant sur les **`log-modal`** d’aperçu / tâches liées / réordonnancement ; **`aria-modal`** / **`tabIndex`** / **`stopPropagation`** sur le panneau pour l’aperçu.
- **Tests e2e (`tasks-unassign-flow`)** : fermeture de la **modale promotion de profil** après « Je m’en occupe » (comme `tasks-full-cycle`) ; timeout du test porté à **120 s** et attente explicite du bouton **retirer** (**45 s**) pour limiter les timeouts en fin de suite Playwright.
- **Modales (tutoriels, biodiversité, zones, repères, tâches, aide)** : le calque **`.modal-overlay`** centre désormais systématiquement le contenu dans la **fenêtre visible** (plus de feuille collée en bas ou en haut) ; défilement éventuel **dans le calque** si la fenêtre est petite ; panneau d’aide mobile harmonisé ; l’**aperçu tutoriel** (`.modal-overlay--tuto-preview`) a un comportement **plein écran dédié** (voir entrée **Tutoriels — aperçu** ci-dessus).
- **Tâches collectives (`all_assignees_done`)** : le clic n3boss pour **marquer la part d’un assigné** (`POST /api/tasks/:id/done` avec `studentId` ou noms) échouait avec un profil n’ayant que **`tasks.validate`** (sans `tasks.manage`) — la résolution d’identité côté serveur exigeait `tasks.manage`. Désormais **`tasks.validate`** suffit pour ces actions « au nom du n3beur », comme pour la lecture des assignations sur `GET /api/tasks`. Côté client : **clé de chargement** alignée entre la tuile et `withLoad`, et corps JSON avec **`student_id` ou `studentId`** sur l’assignation.
- **Stats (`GET /api/stats/export`, `GET /api/stats/all`)** : agrégation par élève avec **concurrence bornée** (défaut 8, `FORETMAP_STATS_STUDENT_AGG_CONCURRENCY`) pour éviter les erreurs MySQL « Too many connections » tout en restant plus rapide qu’un traitement strictement séquentiel.
- **Élévation élève → droits étendus** : mémorisation du **JWT élève non élevé** avant `POST /api/auth/elevate` (`elevationStudentToken` dans `foretmap_student`) et **restauration nettoyée** au clic « Désactiver les droits étendus » — corrige un cas où le jeton courant restait élevé et bloquait la suite (e2e « retirer de la tâche »).
- **Tests e2e** : sélecteur d’onglet **Tâches** (nav basse / onglets prof uniquement), attente **visible** de l’en-tête Tâches côté élève (scroll si besoin), désactivation des droits étendus en **`force: true`**, timeout du scénario **retirer d’une tâche** ; assertion photo zone sans **strict mode** sur plusieurs boutons « Envoi… » ; cycle tâche complet : timeout 120 s et fermeture promo profil avant validation.
- **Carte / tâches** : les **tutoriels** rattachés uniquement aux **missions** (sans lien direct zone/repère) et la **biodiversité** portée par les tâches (`living_beings_list`) apparaissent désormais sur la **carte** (pastilles tutoriels), dans les **modales zone et repère** (Info + Tutoriels), dans la section **« Tutoriels pour ce lieu »** de l’onglet Tâches (avec indication « via mission » côté prof pour le déliage lieu), et les comparaisons zone/repère utilisent des **IDs normalisés** (chaîne) pour éviter les ratés de correspondance.
- **Dépôt** : suppression des fichiers temporaires **`tmp-debug-ctx.js`** et **`tmp-test-ctx-one.js`** (ajoutés par erreur).
- **Déploiement (prepare runtime / dist)** : pendant `npm ci`, `npm run build` et `npm prune`, définition de **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** pour ignorer le postinstall **@playwright/browser-chromium** (Wasm / mémoire), source d’**OOM** sur hébergement mutualisé alors que le bundle prod n’exécute pas les e2e. **`scripts/prepare-runtime-deploy.js`**, **`scripts/prepare-dist-deploy.js`**, **`prepare-runtime-deploy.ps1`** ; note **`docs/EXPLOITATION.md`**.
- **Déploiement runtime** : `npm run deploy:prepare:runtime` (et `:fast`) s’appuient sur **`node scripts/prepare-runtime-deploy.js`** au lieu d’invoquer **PowerShell** depuis `sh` (évite l’erreur `powershell: commande introuvable` sous Linux / CI). Archivage : **`zip`**, sinon **`tar -a`**, sinon **Compress-Archive** sous Windows. Scripts optionnels **`deploy:prepare:runtime:ps`** / **`:fast:ps`** pour l’ancien `prepare-runtime-deploy.ps1` (robocopy). Documentation **`docs/LOCAL_DEV.md`**, **`docs/EXPLOITATION.md`**.
- **Tests** : le hook **`before`** de **`tests/map-wheel-zoom.test.js`** est placé **dans** le **`describe('mapWheelZoom')`** afin que l’import ESM de **`mapWheelZoom.js`** soit résolu avant les assertions (évite des échecs intermittents avec la suite **`node --test`**).
- **Visite — carte** : pas de dessin de zone ni de placement de repère tant que les dimensions naturelles du plan ne sont pas connues (évite des % erronés si clic avant `onLoad`) ; prise en charge des **images en cache** via `useLayoutEffect` ; changement de **carte** (`map_id`) réinitialise mode navigation et points en cours. Utilitaire **`computeMapImageContainRect`** ([`src/utils/mapImageFit.js`](src/utils/mapImageFit.js)). Doc interne [`docs/VISIT_MAP_GEOMETRY.md`](docs/VISIT_MAP_GEOMETRY.md). Tests e2e : scène `.visit-map-stage`, `img.visit-map-img`, contrôles zoom (`exact: true` pour éviter la collision « Zoomer » / « Dézoomer »).
- **Modales + caméra (mobile)** : au retour de l’APN ou du sélecteur fichier, un **`popstate`** pouvait être traité comme « retour » par **`overlayHistory`** et fermer la modale (**formulaire tâche**, **rapport terminée**) avant l’événement **`change`** de l’input — la tâche ne s’enregistrait pas. Garde **`armNativeFilePickerGuard`** / **`disarmNativeFilePickerGuard`** dans **`src/utils/overlayHistory.js`** ; appels depuis **`tasks-views.jsx`** (photo illustrative + rapport) et **`map-views.jsx`** (upload photos zone/repère).
- **Modales tâche + caméra (suite)** : désactivation de **`useOverlayHistoryBack`** sur le **formulaire tâche** et le **rapport « terminée »** — le couple **`pushState` + retour caméra** laissait l’historique et la pile désynchronisés (fermeture, perte du brouillon, parfois rechargement perçu). Garde fichier inchangée pour les autres surcouches ; timeout de garde fichier porté à **10 s**, budget **12** `popstate` sans désarmement prématuré au **`focus`** fenêtre.
- **Commentaires / forum / rapports de tâche** : horodatage toujours **date + heure** (fr-FR, jour/mois/année et minutes) via utilitaire commun **`formatDateTimeFr`** ; les **rapports** (modal) utilisaient **`toLocaleDateString`** avec options d’heure souvent ignorées par le moteur.

### Modifié
- **Visite (repères)** : **`aria-label`** sur les boutons repère du plan visite (libellé du repère), pour l’accessibilité et des sélecteurs e2e plus stables lorsque le bundle sert une build à jour.
- **Tâches** : les pastilles **tutoriels** (`tutorials_linked`) sur les **cartes mission** et les **fiches projet** ouvrent le contenu au **clic** (nouvel onglet, même URL que le bouton « 📖 Consulter » des tutoriels liés aux zones/repères). Style **`task-tutorial-chip`**.
- **Documentation déploiement** : précision que le **ZIP runtime est optionnel** ; le dossier `deploy/runtime/foretmap-runtime-*` peut être **uploadé décompressé** (`rsync`, SFTP, etc.). **`docs/LOCAL_DEV.md`**, **`docs/EXPLOITATION.md`**, **`README.md`** ; règle **`.cursor/rules/foretmap-conventions.mdc`** ; messages de fin **`scripts/prepare-runtime-deploy.js`** et **`prepare-runtime-deploy.ps1`**.
- **Visite — mascotte** : affichage dès qu’il existe au moins une **zone** ou un **repère** dans le contenu chargé, pas uniquement lorsque le décompte « parcourable » (polygones valides à ≥ 3 points) est &gt; 0 — évite une mascotte absente si des zones sont mal géométrisées. Chargement visite : ignore les réponses **obsolètes** après changement de carte ; payload visite rejeté s’il s’agit d’un **tableau** (spread JSON invalide).

### Modifié
- **Build** : régénération de **`dist/`** (bundles Vite production, correctif affichage mascotte visite).
- **Visite — mascotte (plan N3)** : position **initiale** sous le repère **entrée N3** (même abscisse, ordonnée légèrement plus basse) lorsque le libellé du repère correspond ; les autres cartes restent centrées (50 % / 50 %). Garde **`content.map_id`** pour ne pas appliquer la position avec des données d’une autre carte ; **`map_id`** est fusionné dans le payload visite au chargement.
- **Visite — mascotte** : personnage **rétro-moderne** (gros yeux blancs + pupilles + reflet type jeu vidéo, bouche simple, casquette pixel-sage, corps arrondi) ; **pas alternés** sur un segment Lottie dédié (frames 1–30) ; **idle** sur la frame 0 (jambes neutres) ; orientation vers la cible inchangée côté carte (`scaleX`). Fichier généré par **`scripts/build-visit-mascot-lottie.mjs`** (`npm run lottie:visit-mascot`). Lecteur : **`playSegments`** en marche, **`goToAndStop(0)`** à l’arrêt.
- **Visite — mascotte Lottie** : chargement **paresseux** (`React.lazy` + `Suspense`) du composant et de **`lottie-web`** ; chunk dédié chargé seulement lorsque la mascotte est affichée (carte avec contenu, mode navigation), allégeant le bundle principal.

### Ajouté
- **Commentaires contextuels & forum** : pièces jointes **photos** (JPEG / PNG / WebP, jusqu’à **3** images, **1,5 Mo** chacune après décodage), champ JSON `images` (data URLs) sur `POST /api/context-comments` et sur `POST /api/forum/threads` / `POST /api/forum/threads/:id/posts` ; réponses avec `image_urls` (`/uploads/…`) ; texte seul `(Photo)` si message uniquement visuel ; suppression des fichiers disque à la suppression du message. Migration **`067_context_comments_forum_posts_images.sql`**, module **`lib/userContentImages.js`**, UI **`attachment-images-picker.jsx`**. Tests **`tests/context-comments.test.js`**, **`tests/forum.test.js`** ; **`docs/API.md`**.
- **Visite — mascotte sur le plan** : personnage **Lottie** (JSON **`src/assets/lottie/visit-mascot.json`**, couleurs alignées sur le thème forêt / crème / sage / sol) rendu avec **`lottie-web`** et **`VisitMapMascotLottie.jsx`** ; vitesse d’animation plus élevée pendant le déplacement ; au clic sur une **zone** ou un **repère**, translation vers le centroïde ou le repère ; `prefers-reduced-motion` fige la première image ; masquée si la carte est vide ou en modes dessin prof. Utilitaire **`src/utils/visitMapGeometry.js`** ; tests **`tests/visit-map-geometry.test.js`** ; e2e **`e2e/visit-mode.spec.js`**.
- **Biodiversité (prof)** : sur une **nouvelle** fiche, l’import **galerie / appareil photo** crée d’abord la fiche (si le **nom** est renseigné) puis enchaîne l’upload, comme pour les autres modules qui enchaînent création + fichier.
- **Tutoriels** : image de **couverture** (`cover_image_url`) — saisie d’URL (HTTPS ou `/uploads/…`), import **galerie / appareil** après première sauvegarde (`POST /api/tutorials/:id/cover-photo-upload`), vignette dans la liste **Tutoriels** et en **visite** (`GET /api/visit/content`). Migration **`066_tutorials_cover_image_url.sql`**, schéma **`sql/schema_foretmap.sql`**.
- **Commentaires contextuels** : mêmes types **`plant`** (fiche biodiversité) et **`tutorial`** que l’API existante ; panneau **Commentaires** sur chaque fiche du catalogue (prof / élève), sur chaque carte **Tutoriels** et sur les tutoriels **Visite** (session requise). Libellé réglage admin du module enrichi. **`src/components/foretmap-views.jsx`**, **`src/components/tutorials-views.jsx`**, **`src/components/visit-views.jsx`**, **`docs/API.md`**.

### Modifié
- **Carte & visite — zones** : **rétablissement** des **emojis de zone** (préfixe dans `zones.name`, affichage au centroïde sur la carte prof et la carte visite, champs création/édition carte, éditeur visite avec grille, en-tête de fiche zone avec pictogramme catalogue / 🌱 / 🪨 selon les êtres vivants). Duplication conserve le nom source. Listes **tâches / tutoriels** : libellé zone avec nom complet. **`map-views.jsx`**, **`visit-views.jsx`**, **`tasks-views.jsx`**, **`tutorials-views.jsx`**, **`docs/API.md`**.

- **Carte (vue solo / mobile)** : le conteneur `.map-view-canvas` occupe toute la zone utile sous la barre d’outils (largeur × hauteur disponibles) ; le cadrage « contain » du plan reste géré par le transform du monde. Limite l’espace vide sous les plans très larges (ex. N3) et maximise la surface pour pinch / boutons zoom. **`map-views.jsx`**, **`index.css`**.

- **Carte — êtres vivants** : suppression de la notion d’**être vivant principal**. La liste **`living_beings`** / **`living_beings_list`** est la source de vérité (ordre conservé) ; les colonnes **`current_plant`** (zones) et **`plant_name`** (repères) restent en base mais sont **vidées** dès qu’au moins un nom est dans la liste. **`zone_history`** : enregistrement lorsqu’un **`living_beings`** en `PUT` retire l’ancienne valeur de **`current_plant`** de la liste ; sinon comportement inchangé si seul **`current_plant`** est modifié. UI (textes d’aide, pastilles catalogue), **`livingBeings.js`**, **`routes/zones.js`**, **`routes/map.js`**, **`map-views.jsx`**, listes tâches/tutoriels, **`docs/API.md`**, **`tests/api.test.js`**.

- **Carte & visite — ordre des textes** : dans les fiches **Info** (zone et repère), la **description carte** (`zones.description` / note repère) s’affiche **avant** les textes spécifiques **mode visite** (sous-titre, accroche, détails). **`GET /api/visit/content`** expose désormais **`description`** et **`note`** (jointure carte) pour le panneau latéral visite. **`map-views.jsx`**, **`visit-views.jsx`**, **`routes/visit.js`**, **`docs/API.md`**.

### Ajouté
- **Carte — repères alignés sur les zones** : modale repère avec **onglets** (Tâches, Tutoriels, Info, Photos, Modifier), **commentaires de contexte** (`contextType=marker`), **photos carte** (`marker_photos`, API miroir des zones), **duplication** et bouton **Ajuster la position** (déverrouillage déplacement). Migration **`065_marker_photos.sql`**, **`routes/map.js`**, **`routes/context-comments.js`**, **`map-views.jsx`**, **`docs/API.md`**, **`tests/api.test.js`**, **`tests/context-comments.test.js`**.

- **Visite — photos** : upload **JPEG** (base64 / data URL, compression côté client comme les zones) via **`POST /api/visit/media`** (`image_data`) pour zones et repères de visite ; fichier sous **`uploads/visit_media/{id}.jpg`** ; lecture publique **`GET /api/visit/media/:id/data`** ; suppression des fichiers à la **suppression** du média ou de la zone/repère visite. Colonne **`image_path`**, migration **`064_visit_media_image_path.sql`**. Éditeur visite : bouton **Ajouter une photo (fichier)** + miniatures avec **`withAppBase`**. **`routes/visit.js`**, **`visit-views.jsx`**, **`sql/schema_foretmap.sql`**, **`docs/API.md`**, **`tests/new-features.test.js`**.

- **Tâches collectives (n3boss)** : sur une tâche en validation collective (`all_assignees_done`), chaque **nom d’assigné en cours** est un bouton cliquable : un clic déclenche **`POST /api/tasks/:id/done`** avec `studentId` (ou prénom/nom) pour marquer **manuellement** la part de cet élève comme terminée (équivalent à son « Marquer terminée »). **`tasks-views.jsx`**, **`index.css`**, **`docs/API.md`**.

- **Tâches — importance** : degré d’importance optionnel (`importance_level` : `not_important` → `absolute`), défaut **`null`** ; tri **`GET /api/tasks`** (importance explicite d’abord, puis date limite ; tâches sans degré ensuite) ; formulaire, pastilles **`badges.jsx`**, bandeau urgent aligné ; import CSV/XLSX (colonne modèle) ; clones récurrents. Migration **`063_tasks_importance_level.sql`**, **`sql/schema_foretmap.sql`**, **`routes/tasks.js`**, **`lib/recurringTasks.js`**, **`tasks-views.jsx`**, **`docs/API.md`**, **`tests/tasks-importance.test.js`**, **`tests/tasks-image.test.js`**.

- **Visite** : indicateur de **progression sur la carte** (X / Y zones et repères marqués « vus », barre et pourcentage) — calcul limité à la **carte affichée** et aux polygones réellement visibles ; message discret si la carte est vide. **`visit-views.jsx`**, **`index.css`**, build **`dist/`**.

- **Commentaires de contexte** : indicateur discret des **messages non lus** (pastille verte + léger fond sur l’en-tête replié, infobulle et libellé accessible) — basé sur le dernier commentaire consulté (stockage local par utilisateur) et le temps réel. **`context-comments.jsx`**, **`index.css`**, build **`dist/`**.

- **Tâches — biodiversité** : association d’**êtres vivants** (noms du catalogue), comme pour les zones et repères — colonne **`living_beings`**, migration **`061_tasks_living_beings.sql`**, API **`living_beings`** / réponse **`living_beings_list`** (`POST/PUT` tâche, propositions, clones récurrents). Formulaire tâche (multi-sélection) et pastilles sur les cartes tâche ; utilitaire partagé **`src/utils/livingBeings.js`**. **`routes/tasks.js`**, **`lib/recurringTasks.js`**, **`tasks-views.jsx`**, **`App.jsx`**, **`map-views.jsx`**, **`sql/schema_foretmap.sql`**, **`docs/API.md`**, **`tests/api.test.js`**, build **`dist/`**.

- **Biodiversité** : bloc **Sur la carte** — mini-plan (par carte concernée) avec surcouche **violette** des zones et repères liés à l’espèce (même logique visuelle que les tutoriels sur la carte) ; affiché **uniquement** si la fiche est liée à au moins une zone ou un repère. Catalogue élève et base prof. **`foretmap-views.jsx`**, **`App.jsx`**, **`index.css`**, build **`dist/`**.

- **Biodiversité — photos** : miniatures pour liens Commons **catégorie** (API Wikimedia) et pages **File:** via **`Special:FilePath`** ; migration **`062_plants_nonvegetal_photo_filepath.sql`** remplit **`photo`** / **`photo_species`** pour les fiches animales et bactériennes du catalogue (fichiers Commons validés). **`foretmap-views.jsx`**, **`docs/AUDIT_PHOTOS_BIODIVERSITE.md`**.

- **Carte — textes visite (zones & repères)** : sous-titre, description courte et bloc dépliable (comme en mode visite) affichés dans les fiches **Info** / modale repère ; éditables par le prof dans **Modifier** (zone) ou le formulaire repère. API : **`GET /api/zones`**, **`GET /api/zones/:id`**, **`GET /api/map/markers`** enrichis (`visit_*`) ; **`PUT /api/zones/:id`** et **`POST`/`PUT` repères** acceptent ces champs et upsert **`visit_zones`** / **`visit_markers`**. **`routes/zones.js`**, **`routes/map.js`**, **`map-views.jsx`**, **`docs/API.md`**.

- **Tâches & tutoriels par lieu** : en vue **Cartes & tâches** (split), un clic sur une **zone** ou un **repère** met à jour le filtre lieu du panneau Tâches ; en **carte seule**, la **modale** reste ouverte et un bouton **Ouvrir l’onglet Tâches filtré** y propose d’aller sur la liste filtrée. L’onglet s’intitule **Tâches et tuto** lorsque le module tutoriels est actif ; bloc **Tutoriels pour ce lieu** (liste, **Consulter** côté élève ; **Lier** / **Délier** côté prof). Le sélecteur de lieu inclut aussi les zones/repères qui n’ont que des tutoriels. **`App.jsx`**, **`map-views.jsx`**, **`tasks-views.jsx`**.

- **Tutoriels & carte** : liaison optionnelle aux **zones** et **repères** de la carte principale (`tutorial_zones`, `tutorial_markers`, migration **`059_tutorial_zones_markers.sql`**, schéma **`sql/schema_foretmap.sql`**). L’API liste et détail exposent `zone_ids`, `marker_ids`, `zones_linked`, `markers_linked` ; **`POST/PUT /api/tutorials`** acceptent ces tableaux (même contrainte qu’une tâche : une seule carte pour tous les lieux). Pastille **violette** sur la carte (zones et repères), onglet **Tutoriels** dans la fiche zone et liste tutoriels côté repère (prof : lier/délier ; élève : détail des autres lieux + lien **Consulter**). Éditeur onglet **Tuto** : filtres par carte et cases à cocher. Temps réel : **`mapIdsLinkedToTutorial`** inclut les cartes des lieux directs. **`routes/tutorials.js`**, **`map-views.jsx`**, **`tutorials-views.jsx`**, **`App.jsx`**, **`index.css`**, **`docs/API.md`**.

- **Tutoriels** : pastille **« N tâche(s) liée(s) »** cliquable lorsque **N > 0** — modale listant les tâches (titre, statut, carte, indice de lieu) via **`GET /api/tutorials/:id/linked-tasks`** (`?include_inactive=1` pour un tutoriel archivé côté prof). **`tutorials-views.jsx`**, **`index.css`**, **`routes/tutorials.js`**, **`tests/tutorials.test.js`**.

- **Tutoriels** : pour tout utilisateur connecté, bouton **Marquer comme lu** avec modal d’engagement (« lu et compris ») et case à cocher obligatoire ; table **`user_tutorial_reads`**, API **`GET /api/tutorials/me/read-ids`** et **`POST /api/tutorials/:id/acknowledge-read`** (`confirm: true`), migration **`058_user_tutorial_reads.sql`**, composant **`TutorialReadAcknowledge.jsx`**, styles **`index.css`**, doc **`docs/API.md`**, tests **`tests/tutorials.test.js`**.

- **Tutoriels (prof/admin)** : bouton **⇅ Ordre** — liste réordonnancable (glisser-déposer, flèches ↑↓) et **`PUT /api/tutorials/reorder`** (`tutorial_ids` = tous les tutoriels, une fois chacun). Affichage de la grille trié par **`sort_order`**. **`tutorials-views.jsx`**, **`routes/tutorials.js`**, **`index.css`**, **`docs/API.md`**, **`tests/tutorials.test.js`**.

- **Biodiversité** : filtres avancés (sous-groupes 1 et 2, habitat, catégorie d’agrosystème), recherche texte élargie (habitat, origine géographique, partie à récolter) ; côté élève, filtre **présence sur la carte** et compteur **X / Y** ; module **`src/utils/plantFilters.js`**, **`foretmap-views.jsx`**, build **`dist/`** ; e2e navigation élève ouvre **Filtres avancés**.

### Modifié
- **Build** : régénération des artefacts **`dist/`** (`npm run build`, nouveau hash bundle JS Vite).

- **Mobile (tactile)** : ajout de photos avec **choix explicite galerie / appareil photo** (`capture="environment"` sur l’entrée caméra) — formulaire tâche (photo illustrative), rapport « Marquer terminée », carnet d’observations, upload photos fiche biodiversité, galerie zone (prof), image de plan (admin). **`tasks-views.jsx`**, **`foretmap-views.jsx`**, **`map-views.jsx`**, **`settings-admin-views.jsx`**, **`index.css`**.

- **Visite — carte** : libellés et emojis des **zones** ne sont plus **tassés verticalement** : le SVG utilise un viewBox carré avec `preserveAspectRatio="none"` sur un rectangle carte, ce qui écrasait le texte ; **compensation d’échelle Y** sur les `<text>`, image du plan en **`object-fit: contain`** (aligné sur le commentaire / MapView), repères : emoji moins contraint par le flex. **`visit-views.jsx`**, **`index.css`**, build **`dist/`**.

- **Carte — fiches zone & repère** : les **êtres vivants** associés sont des **pastilles cliquables** qui affichent la fiche catalogue (**description**, **rôle dans l’écosystème**, **utilité pour l’être humain**) ; rappel tactile sous le libellé du champ. Même panneau **aperçu catalogue** sous les listes multi en **édition prof** (zone et repère). **`map-views.jsx`**, **`index.css`**, build **`dist/`**.

- **Session / tâches** : après validation du **PIN** (droits étendus), incrément d’un compteur dédié qui déclenche **`fetchAll`** (évite un `useEffect` sur `authClaims` qui pouvait sur-réagir) — liste tâches alignée avec le JWT élevé. **`App.jsx`**, build **`dist/`**.

- **E2E** : fixture onglet Tâches — cible **`.top-tab` avec « ✅ Tâches »** ou **`.nav-btn` avec icône ✅** (évite de cliquer « Cartes, tâches et tuto » quand un regex trop large matchait) ; réinitialisation **carte + zone + projet + statut + recherche** ; scénario **cycle complet tâche** attend un **GET /api/tasks** après ré-élévation et **30 s** pour la carte « à valider ». **`e2e/fixtures/auth.fixture.js`**, **`e2e/tasks-full-cycle.spec.js`**.

- **Migrations** : fichier photos faune/bactéries Commons renommé **`060_plants_nonvegetal_photo_filepath.sql`** → **`062_plants_nonvegetal_photo_filepath.sql`** (convention discutée côté audit photos ; **`061_tasks_living_beings.sql`** reste le numéro suivant **`059_tutorial_zones_markers.sql`**, ordre d’application : 061 puis 062).

- **Biodiversité** : les pastilles **🏡** / **🌍** avec le seul libellé **Potager** (insensible à la casse) sont masquées — information redondante souvent identique sur toutes les fiches. Le filtre **présence sur la carte** inclut désormais les **repères** (libellés : lieu sur la carte / zone ou repère). **`plantFilters.js`**, **`foretmap-views.jsx`**.

- **Build** : régénération des artefacts **`dist/`** (bundle Vite production aligné sur les sources courantes).

- **Tutoriels (liste)** : chaque carte affiche les **zones** et **repères** liés en puces individuelles (`task-chip`), comme les lieux sur les tuiles tâches, au lieu d’un seul compteur agrégé. **`tutorials-views.jsx`**.

- **Biodiversité (élève)** : pastilles **Zones et repères** (📍 zone, 📌 repère) quand l’être vivant est lié sur la carte ; le filtre **présent dans au moins une zone** utilise toute la liste **`living_beings_list`**, pas seulement l’être vivant principal. **`plantFilters.js`**, **`foretmap-views.jsx`**, **`App.jsx`**, build **`dist/`**.

- **Carte (zones & repères)** : fusion des champs **être vivant principal** et **autres associés** en un seul sélecteur multiple **Êtres vivants**, avec ordre stable (le premier reste l’être vivant « principal » côté API : **`current_plant`** / **`plant_name`**, historique des cultures). Aide contextuelle Ctrl/Cmd + clic. **`map-views.jsx`**, build **`dist/`**.

- **UI — Carte (split Cartes & tâches)** : la barre d’outils reprend la **même largeur que le canvas** via **`--fm-map-canvas-w`** (suppression de la surcharge `width: 100%` sur **`.map-view-toolbar`**). Défilement horizontal des boutons inchangé en mode compact (**`main--map-visible`**). **`index.css`**, **`dist/`**.

### Corrigé
- **Tâches — photos (smartphone)** : la **photo illustrative** refusait les fichiers sans type MIME ou en **`application/octet-stream`** (fréquent après capture caméra) ; le modal **Marquer terminée** ne gérait pas l’échec de décodage (**`Image`** sans **`onerror`**), d’où envoi sans image. Détection **`isLikelyImageFile`**, même pipeline **`compressImage`** que le formulaire tâche, **`FileReader.onerror`**. **`src/utils/image.js`**, **`tasks-views.jsx`**.

- **Migration 062** : URL Commons de la **Piéride du chou** — le nom de fichier contenait **`--`**, interprété comme **commentaire SQL** par MariaDB (requête tronquée, `ER_PARSE_ERROR`). Remplacement par **`%2D%2D`** dans le chemin **`Special:FilePath`** (même fichier côté Wikimedia). **`migrations/062_plants_nonvegetal_photo_filepath.sql`**.

- **Carte — fiche zone / repère** : un clic sur une zone ou un repère ne bascule plus vers l’onglet Tâches en vue carte seule (la modale s’affichait masquée). La synchro du filtre lieu du panneau Tâches reste active uniquement en **vue scindée** ; sur carte seule, un bouton dans la modale ouvre l’onglet Tâches filtré. **`App.jsx`**, **`map-views.jsx`**.

- **Visite & carte — libellés zones** : l’emoji et le titre au centroïde se chevauchaient souvent (écart entre centres trop faible par rapport aux tailles de police). **`resolveMapOverlayTypography`** impose désormais un **écart minimal entre centres** (demi-hauteurs + marge) et un **défaut d’espacement** un peu plus généreux ; même logique sur la **carte principale** et l’**onglet Visite**. Repères visite : zone tactile **44×44 px**, emoji légèrement plus lisible ; barre de bascule cartes / modes un peu plus aérée. **`mapOverlayTypography.js`**, **`index.css`**, build **`dist/`**.

- **Carte — fiche zone / repère (Info)** : les puces **Êtres vivants** affichaient toujours 🌱 ; chaque nom est désormais associé à l’emoji du catalogue plantes (repli 🌱 si inconnu). **`map-views.jsx`**, build **`dist/`**.

- **Navigation « retour » (navigateur / Android)** : avec une modale ou un panneau ouvert, le premier retour ferme la surcouche au lieu de quitter l’écran (ex. **visite sans connexion** qui renvoyait à la connexion). Historique **`history.pushState`** / pile centralisée (**`src/utils/overlayHistory.js`**, hook **`useOverlayHistoryBack`**), entrée dédiée à l’ouverture de la visite invité (**`App.jsx`**), désélection zone/repère en visite publique (**`visit-views.jsx`**), modales aide / notifications / tâches / carte / tutoriels / profil, etc.

- **Tutoriels — aperçu modal (mobile)** : l’overlay **`modal-overlay--tuto-preview`** aligne la feuille en **haut** du viewport (au lieu du bas) avec marges sûres, coins arrondis complets et animation **`popIn`** ; l’iframe garde une hauteur minimale raisonnable (**`min(55vh, 380px)`**). **`tutorials-views.jsx`**, **`index.css`**.

- **Tutoriels** : **`GET /api/tutorials/:id/linked-tasks`** — un seul handler (suppression du doublon de route). **`routes/tutorials.js`**.

- **Tutoriels (type lien)** : l’aperçu modal et l’iframe utilisent désormais **`source_url`** (les liens n’ont pas de **`source_file_path`**). En **visite**, le bouton **Lire** ouvre l’URL externe au lieu de **`/api/tutorials/:id/view`** (inadapté sans contenu HTML). **`tutorials-views.jsx`**, **`visit-views.jsx`**.

- **Tutoriels — aperçu modal** : l’iframe d’aperçu autorise désormais **`allow-scripts`** dans le `sandbox`, pour que les fiches HTML qui révèlent le contenu au scroll (classes **`.reveal`** + **IntersectionObserver**, ex. fiches *punk* sous **`tutos/`**) s’affichent comme dans un onglet ; sans script, seuls l’en-tête et le pied de page restaient visibles. **`tutorials-views.jsx`**.

- **Tâches (élève)** : libellé du sous-titre missions — « commences la **mission** » (et non « question »). **`tasks-views.jsx`**.

- **UI — Cartes & tâches** : **`#app`** n’était pas borné en hauteur, la grille prenait la hauteur des tâches et tout défilait sur **`body`** (carte qui disparaît). Avec le split actif, **`#app:has(.main--maptasks-split)`** est calé au viewport (**`100dvh`**) et **`overflow: hidden`** ; **`main`/`teacher-main`** en split **`flex: 1 1 0%`** + **`min-height: 0`** ; **`header`** / **`app-footer`** en **`flex-shrink: 0`**. Le scroll reste dans **`.desktop-split-scroll`**. **`index.css`**, **`dist/`**.

- **Biodiversité (élève)** : les fiches s’affichent comme en mode prof — contenu complet visible sans clic sur un chevron (pills habitat / agroécosystème, badges, sections métadonnées, zones associées). **`foretmap-views.jsx`**, build **`dist/`**.

- **Mobile — import photo** : retrait de **`capture="environment"`** sur les champs **`input type="file"`** image (photos de zone sur la carte, observation plante, photo illustrative de tâche, photo du journal « marquer terminée ») afin que le smartphone propose **galerie / fichiers** et pas seulement l’APN. L’avatar sur l’écran statistiques garde deux actions séparées (galerie / appareil photo). **`map-views.jsx`**, **`foretmap-views.jsx`**, **`tasks-views.jsx`**.
- **Tâches — affichage des photos** : **`image_url`** utilise désormais **`/uploads/tasks/…`** (fichiers statiques) au lieu de **`/api/tasks/:id/image`**, pour éviter les vignettes cassées (limiteur **`/api/*`**, réponse JSON d’erreur au lieu d’image). Dev : proxy Vite **`/uploads`** vers le serveur Node. Alias SQL **`task_cover_image_path`**, **clé** sur **`TaskFormModal`**, message si le navigateur ne décode pas l’image (ex. HEIC). **`routes/tasks.js`**, **`vite.config.js`**, **`tasks-views.jsx`**, **`src/utils/image.js`**, **`docs/API.md`**, **`tests/tasks-image.test.js`**.
- **Tests** : scénario statistiques visite — enregistrement progression élève avec **`Authorization: Bearer`** (`authToken` à l’inscription), cohérent avec **`POST /api/visit/seen`** sans `student_id` anonyme pour un compte élève. **`tests/new-features.test.js`**.

### Modifié
- **Biodiversité** : sur la pastille 🍽️ des fiches **végétales** (grand groupe contenant « Végétal »), affichage des **nutriments préférés** plutôt que le libellé **Nutrition** (souvent identique, ex. autotrophe). Les animaux et autres groupes conservent la pastille **Nutrition**. **`foretmap-views.jsx`**, build **`dist/`**.

- **Build** : régénération locale **`dist/`** (empreinte bundle JS Vite). **`dist/`**.

- **Tâches (élève)** : sous-titre de la section missions — formulation raccourcie et précision sur l’inscription (au moment où l’élève commence « pour de vrai »). **`tasks-views.jsx`**.

- **Biodiversité** : après la brève description, affichage direct des champs **Rôle dans l'écosystème** et **Utilité pour l'être humain** (catalogue élève replié ou déplié, gestion prof) ; ces champs ne sont plus dupliqués dans le bloc repliable **Écologie et usages**. **`foretmap-views.jsx`**, **`index.css`**, build **`dist/`**.

- **Build** : régénération **`dist/`** (empreintes Vite) et synchronisation **`package-lock.json`** après installation locale.
- **Carte & Zones** : la barre **`.map-view-toolbar`** prend la même largeur que **`.map-view-canvas`** (variable **`--fm-map-canvas-w`** mise à jour avec le dimensionnement contain). **`src/components/map-views.jsx`**, **`src/index.css`**, build **`dist/`**.
- **Carte & Zones** : le cadre de la carte épouse la taille du plan (contain dans la largeur du contenu et la hauteur visible jusqu’au bas de la zone principale / viewport), sans bande grise autour ; la vue solo ne force plus une colonne flex vide sous la carte, ce qui évite le défilement vertical sur laptop lorsque le plan tient dans l’écran. **`src/components/map-views.jsx`**, **`src/index.css`**, build **`dist/`**.

### Ajouté
- **Tâches — photo illustrative** : image optionnelle à la création/modification (smartphone / galerie), champ **`imageData`** et retrait **`remove_task_image`** ; **`GET /api/tasks/:id/image`** ; colonne **`tasks.image_path`** (migration **`057_tasks_image_path.sql`**) ; formulaire et tuiles dans **`tasks-views.jsx`**, styles **`index.css`**, build **`dist/`** ; tests **`tests/tasks-image.test.js`**. **`docs/API.md`**.
- **Tâches — danger** : niveau intermédiaire **`potential_danger`** (« Danger potentiel ») entre sans danger et dangereux — validation API, formulaire prof/proposition, pastilles (`badges.jsx`), clones récurrents. **`docs/API.md`**.

### Corrigé
- **UI — Cartes & tâches (split bureau)** : la toolbar embedded n’est plus limitée à **`--fm-map-canvas-w`** (pleine largeur colonne) ; **`overflow-y: auto`** sur **`.map-view-root--embedded`** si le contenu dépasse le **`max-height`** du volet ; **`min-height`** sur **`.map-view-canvas-outer`** pour stabiliser la mesure ; en embedded, **`measureAndFit`** retombe sur le calcul « bas de **`.main`** / viewport » si **`clientHeight`** du conteneur reste trop petit. Suppression des règles **`@media (max-width:1023px)`** ciblant **`main--maptasks-split`** (incompatibles avec l’activation JS du split). **`src/index.css`**, **`src/components/map-views.jsx`**, **`dist/`**.

- **Visite — icônes / titres de zones** : la carte visite n’affichait que les polygones, sans l’émoji ni le libellé dérivés du nom (comme sur la carte tâches). Affichage au **centroïde** via SVG (`detectLeadingMarkerEmoji` / `stripLeadingMarkerEmoji`, liste `location_emojis`), tailles pilotées par **`resolveMapOverlayTypography`** et largeur du calque carte ; groupe **`.visit-zone-hit`** pour clic et pour ne pas démarrer le pan sur le libellé. **`src/components/visit-views.jsx`**, **`src/index.css`**, **`dist/`**.
- **Visite — alignement carte** : zones et repères en pourcentages étaient calés sur toute la scène (ratio 16:10 + `object-fit: contain`) alors que le fond ne remplissait pas ce rectangle — décalage et étirement visibles par rapport à la carte tâches. Un calque **`.visit-map-fit-layer`** reprend le rectangle « contain » (comme la logique de la carte principale) ; image en `object-fit: fill` dans ce cadre, SVG et repères ancrés dessus ; clics dessin zone / repère convertis avec le même repère. **`src/components/visit-views.jsx`**, **`src/index.css`**, **`dist/`**.

### Modifié
- **Inscriptions tâches (plafond)** : pour une tâche en validation collective (`completion_mode` `all_assignees_done`), dès qu’un n3beur a marqué sa part (`POST …/done`, `task_assignments.done_at`), cette inscription ne compte plus dans `currentActiveAssignments` / limite `tasks.student_max_active_assignments` (et `roles.max_concurrent_tasks`), ce qui permet de s’inscrire à une autre tâche sans attendre les autres inscrits ni la validation n3boss. **`lib/studentTaskEnrollment.js`**, **`docs/API.md`**, test **`tests/api.test.js`**.

### Corrigé
- **Migration `056_visit_tutorials_per_map.sql`** : échec **`DROP PRIMARY KEY`** sur MySQL/MariaDB (errno 150 / 1025) lorsque la FK **`fk_visit_tutorials_tutorial`** est encore présente — la migration retire désormais les FK (**`fk_visit_tutorials_tutorial`**, puis **`fk_visit_tutorials_map`** si elle existe), recrée la clé primaire **`(map_id, tutorial_id)`**, puis réapplique les deux contraintes. La ligne **`DROP FOREIGN KEY fk_visit_tutorials_map`** peut être ignorée (1091) sur les bases sans cette FK. **`docs/EXPLOITATION.md`** (dépannage déploiement).

### Sécurité
- **Visite** : progression « compte élève » pour **`GET /api/visit/progress`** et **`POST /api/visit/seen`** liée au **jeton JWT élève** (fermeture IDOR sur `student_id` arbitraire). **`routes/visit.js`**, **`src/components/visit-views.jsx`**, tests **`tests/new-features.test.js`**, **`docs/API.md`**.

### Modifié
- **Visite — tutoriels** : table **`visit_tutorials`** indexée par **`map_id`** (migration **`056_visit_tutorials_per_map.sql`**, schéma **`sql/schema_foretmap.sql`**) ; **`PUT /api/visit/tutorials`** avec **`map_id`** (défaut `foret`) remplace la sélection pour ce plan uniquement ; **`GET /api/visit/content`** filtre tutoriels et **médias** par plan. **`routes/visit.js`**, **`src/components/visit-views.jsx`**.
- **Visite (client)** : plus de rechargement complet à chaque changement de sélection ; rollback optimiste vu / non vu fiable. **`visit-views.jsx`**.
- **UI** : onglet desktop **Visite** (aligné sur la navigation mobile). **`App.jsx`**.
- **Build** : régénération **`dist/`** après évolutions visite.

### Ajouté
- **Charge** : rapport synthétique d’essai de charge (10 VU) — **`load/reports/10vu-summary.md`**.
- **Tests e2e** : visite sans compte et onglet visite connecté. **`e2e/visit-mode.spec.js`**.
- **Exploitation** : variable **`VISIT_COOKIE_SECRET`** documentée dans **`.env.example`** ; précisions cookie anonyme et prévisualisation prof dans **`docs/API.md`**.

### Modifié
- **Tâches — danger / difficulté** : niveaux **optionnels** (`null` en API/BDD si non renseignés) — plus de défaut implicite « facile / sans danger ». Pastilles sur les cartes et sur la carte **uniquement** si un niveau a été choisi ; formulaire : option « Non renseigné » ; consigne référents « avant de commencer » inchangée lorsque niveaux explicites l’exigent. Migration **`055_task_danger_difficulty_optional.sql`** (colonnes nullable, **réinitialisation** des niveaux déjà stockés — à re-saisir si besoin). Import et clones récurrents alignés (`routes/tasks.js`, `lib/recurringTasks.js`, `tasks-views.jsx`, `badges.jsx`, `map-views.jsx`). **`docs/API.md`**.
- **Build** : régénération des artefacts **`dist/`** (Vite production) pour alignement avec les sources courantes.
- **Vue Tâches** : les puces **zone** sur les cartes (liste élève/prof, cartes projet) et les libellés de zone dans le formulaire / le filtre n’affichent plus le préfixe 🌿 — le nom de zone porte déjà son émoji (`tasks-views.jsx`).
- **UI (textes)** : ton plus chaleureux et coopératif (tutoiement, toasts, sous-titres, aide intégrée) ; vocabulaire **n3beur / n3boss** conservé, formulations type **élève / professeur** retirées de l’interface (hors regex de compatibilité pour d’anciennes propositions). Fichiers principaux : `tasks-views.jsx`, `auth-views.jsx`, `App.jsx`, `constants/help.js`, `AutoProfilePromotionModal.jsx`, `stats-views.jsx`, `foretmap-views.jsx`, `profiles-views.jsx`, `settings-admin-views.jsx` ; e2e `tasks-unassign-flow`, `tasks-full-cycle` alignés sur les nouveaux toasts.

### Ajouté
- **Tâches** : champ **`difficulty_level`** (`easy` | `medium` | `hard` | `very_hard`) en BDD, API et menu création/édition (y compris proposition n3beur) ; recopié sur les clones récurrents. Migration **`054_task_difficulty_level.sql`**.
- **Tâches** : champ **`danger_level`** (`safe` | `dangerous` | `very_dangerous`) en BDD, API et formulaire création/édition (y compris proposition n3beur) ; recopié sur les clones récurrents. Migration **`053_task_danger_level.sql`**.

### Modifié
- **Réglages admin (UI)** : entrée **`KEY_META`** pour **`tasks.recurring_automation_enabled`** (libellé explicite vacances / job quotidien / rattrapage `tasks:spawn-recurring`) dans l’écran réglages prof (`settings-admin-views.jsx`).
- **Dépôt** : `.gitignore` — `.profillocal`, `tmp-*.txt`, nouveaux rapports Artillery horodatés sous `load/reports/` (fichiers déjà suivis inchangés).

### Ajouté
- **Stabilité serveur** : `GET /api/ready` (readiness : init BDD réussie + ping MySQL) ; arrêt gracieux sur `SIGTERM` / `SIGINT` et sur `POST /api/admin/restart` (fermeture Socket.IO, `server.close()`, `pool.end()`, timeout `FORETMAP_SHUTDOWN_TIMEOUT_MS`) ; `shutdownRealtime()` (`lib/realtime.js`), `endPool` / `isApplicationDatabaseReady` (`database.js`). `deploy:check` inclut `/api/ready`.
- **Documentation** : rapport d’audit de stabilité serveur ([docs/SERVER_STABILITY_AUDIT.md](docs/SERVER_STABILITY_AUDIT.md)) — synthèse des contrôles prod (`deploy:check:prod`, `prod:admin-tail`), tests de charge locaux (10vu, smoke Socket.IO), comportements critiques au boot / exceptions / rate limit / multi-instance.

### Modifié
- **Temps réel — tutoriels** : création / mise à jour / désactivation d’un tutoriel émet **`tasks:changed` par `mapId`** des tâches liées (`task_tutorials`) ; sinon repli domaine (`routes/tutorials.js`).
- **Temps réel — jardin (client)** : sur **`garden:changed`**, refetch **zones + repères** seuls (sans **`GET /api/plants`**) pour les raisons **zone / repère** documentées ; debounce cumulatif : un événement « plantes » dans la fenêtre déclenche le refetch complet (`useForetmapRealtime.js`). Doc **`docs/API.md`**.
- **Temps réel (sans WebSocket)** : **`tasks:changed`** ciblé par **`mapId`** après **suppression d’élève** (cartes des tâches impactées) et après **import CSV projets/tâches** (une émission par carte touchée) — moins de refetch REST sur les cartes non concernées. Refetch client **débouncé** : **~220 ms** tâches, **~400 ms** jardin (`useForetmapRealtime.js`). **`lib/studentDeletion.js`** expose **`affectedMapIds`** ; doc **`docs/API.md`**.
- **Vue Tâches (prof) — création** : l’attribution initiale peut cibler **plusieurs** n3beurs (cases à cocher, filtre par nom) ; le champ **places requis** est relevé au minimum au nombre d’inscrits choisis pour éviter l’erreur « plus de place » (`src/components/tasks-views.jsx`).

### Ajouté
- **Temps réel / exploitation** : champ **`runtimeProcess`** dans **`GET /api/admin/diagnostics`** (`pid`, cluster Node, indices `NODE_APP_INSTANCE` / `PASSENGER_APP_ENV`) ; guide **Passenger / instances** dans **`docs/EXPLOITATION.md`** ; smoke charge Socket.IO polling **`npm run test:load:socketio-smoke`** (`scripts/load-socketio-polling-smoke.js`) ; critères de décision hébergement en **`docs/EVOLUTION.md`** (§ 1.4). Module **`lib/runtimeDiagnostics.js`** ; doc **`docs/API.md`**, **`docs/LOCAL_DEV.md`**.
- **Tâches — référents** : liaison N-N `task_referents` ; champs API `referent_user_ids` / `referents_linked` ; `GET /api/tasks/referent-candidates` (profil avec `tasks.manage`) ; formulaire et affichage carte tâche (« En cas de questions… ») ; copie sur duplication récurrente (`lib/recurringTasks.js`). Migration **`052_task_referents.sql`**, schéma **`sql/schema_foretmap.sql`**.

### Modifié
- **En-tête (mobile / tactile)** : le bouton d’installation PWA n’affiche plus le libellé **Installer** (icône seule) pour éviter le débordement et alléger la barre ; **`aria-label`** et **`title`** conservés pour l’accessibilité (`src/index.css`).

### Modifié
- **Build / déploiement** : régénération des artefacts **`dist/`** (Vite production) après validation locale des tests.

### Corrigé
- **Vue Tâches** : `TaskCard` et la section **Projets** étaient définis **à l’intérieur** de `TasksView`, ce qui recréait un **nouveau type de composant** à chaque rendu après `onRefresh` / mise à jour des tâches — React **démontait et remontait** toutes les cartes et chaque `ContextComments` relançait ses effets (**`GET` commentaires**, **`GET /api/settings/public`**, etc.), d’où une **rafale de requêtes** après un simple clic. Extraction en **`TaskTileCard`** et **`TaskProjectsBlock`** au niveau module + objet **`taskTileProps`** (`src/components/tasks-views.jsx`).

### Modifié
- **UI — Visite sans connexion** : sur grand écran (≥ 1024 px), la zone principale n’est plus plafonnée à 900 px, marges latérales fluides, grille carte / panneau latéral plus large à gauche, étage carte en hauteur flexible (min. ~70 dvh) au lieu du seul ratio 16/10 — meilleure utilisation de l’espace. Classes **`main--guest-visit`**, **`visit-view--guest-public`** (`src/App.jsx`, `src/components/visit-views.jsx`, `src/index.css`).

### Corrigé
- **Vue Tâches** : correction d’un **commit erroné** qui dupliquait une grande portion de `tasks-views.jsx` ; rétablissement du fichier unique avec **hooks** regroupés en tête du composant et helpers **`isStudentAlreadyAssignedToTask` / `toQuickAssignStudentId`** en module pour l’**affectation rapide** (pré-cochage fiable).
- **Résilience prod (503 / Socket.IO)** : les **`GET`** via **`api()`** réessayent jusqu’à 4 fois (502/503/504 ou échec réseau `TypeError`) avec backoff — limite les rafales d’erreurs quand l’hébergeur ou le proxy est fugacement indisponible. **Socket.IO client** : option Engine.IO **`upgrade: false`** en complément du transport **polling** seul (`useForetmapRealtime.js`) pour éviter toute tentative WebSocket résiduelle (**reserved bits**). Doc **`docs/API.md`**.

### Modifié
- **Vue Tâches (prof) — affectation rapide** : à l’ouverture, les n3beurs **déjà inscrits** sont **pré-cochés** ; décocher puis **Appliquer** envoie des **`POST /api/tasks/:id/unassign`** puis les inscriptions ; bouton **Appliquer** ; places pour les ajouts après retraits prévus ; **IDs normalisés en chaînes** (évite cases jamais cochées si nombre vs chaîne) ; **pré-cochage différé** si la liste `/api/stats/all` ou la tâche arrive après l’ouverture ; l’édition manuelle n’est pas écrasée. Fichier **`src/components/tasks-views.jsx`**.
- **Socket.IO (serveur)** : **`allowUpgrades: false`** ; ordre des transports **`polling`** puis **`websocket`** ; **`pingInterval` 20 s** (légèrement plus réactif pour détecter une ligne morte) et **`pingTimeout` 60 s** conservé (stabilité mobile / proxy). Fichier **`lib/realtime.js`** ; doc **`docs/API.md`**.
- **Auth JWT** : défauts registre **`security.jwt_ttl_base_seconds`** et **`security.jwt_ttl_elevated_seconds`** à **5 400 s (1 h 30)** (modifiables dans **Réglages > Sécurité**) ; émission toujours pilotée par ces clés avec cache réglages 15 s et **`signAuthToken`** async. Les entrées déjà présentes dans **`app_settings`** conservent leur valeur jusqu’à modification manuelle. Doc **`docs/API.md`** ; test **`settings.test.js`**.
- **UI — Cartes & tâches** (split desktop) : carte visuellement **sous** la barre d’outils (Nav / Repère / etc., sans centrage vertical du plan dans la colonne) ; **moins d’espace** entre onglets n3boss et zone split ; colonne carte en **`position: sticky`** avec hauteur max. utile pour rester visible lors d’un défilement de la page ; **défilement des tâches** confiné à la colonne droite (`overscroll-behavior`). Classes **`main--maptasks-split`** (`src/App.jsx`, `src/index.css`).
- **Documentation** : déploiement o2switch — versions Node **18 / 20 / 22** documentées (prod **22**).

### Ajouté
- **Réglages admin / tâches récurrentes** : nouvelle clé `tasks.recurring_automation_enabled` (défaut `true`) pour activer/désactiver globalement la duplication automatique du job quotidien (pratique pendant les vacances) sans supprimer la récurrence des tâches. Le mode manuel `npm run tasks:spawn-recurring` (`force`) reste disponible pour le rattrapage.

### Corrigé
- **Socket.IO (prod / proxy)** : le client ne tente plus le WebSocket en premier — transport **`polling` uniquement** pour éviter l’échec de connexion **`reserved bits` (RSV2/RSV3)** observé derrière certains reverse-proxy (trames WS invalides). Le flux reste « événement → refetch REST » (`useForetmapRealtime.js`, **`docs/API.md`**).
- **Tâches récurrentes** : à la validation prof, les liaisons zones/repères étaient supprimées avant la duplication automatique ; les clones se retrouvaient sans localisation sur la carte. Enregistrement d’un **snapshot** JSON (`recurrence_template_zone_ids`, `recurrence_template_marker_ids`) au passage à `validated` (POST validate ou PUT) pour les récurrences `weekly` / `biweekly` / `monthly`, utilisé par le job (`lib/recurringTasks.js`). Migration **`051_task_recurrence_template_locations.sql`** ; tests **`recurring-tasks-spawn.test.js`**, **`recurring-tasks-utils.test.js`** ; doc **`docs/API.md`**.
- **Tâches (élève)** : « Mes tâches » et le bouton **Me retirer** s’appuient sur la même règle que l’API et l’affichage des assignés (**`student_id`** + prénom/nom normalisés). Avant, une comparaison stricte des noms pouvait laisser une tâche encore assignée hors de « mes tâches », avec **Je m’en occupe** proposé à la place du retrait. Affichage du retrait aussi pour les statuts **`on_hold`** / **`proposed`** tant que l’API l’autorise (hors **done** / **validated**). Fichiers **`src/utils/task-assignments.js`**, **`tasks-views.jsx`**, **`map-views.jsx`**.
- **Dépendances / hébergement** : la production tourne sous **Node 22** — l’hypothèse « incompatibilité avec un Node strictement inférieur à 18 » pour Passenger ne tenait pas. Rétablissement de **`google-auth-library` ^10** et **`express-rate-limit` ^8** avec l’option **`limit`** dans **`server.js`** ; champ **`engines.node`** aligné sur **≥ 18**. Pour un échec Passenger, vérifier plutôt les journaux d’application, **`startup-diag.log`** / **`startup.log`**, les variables **`DB_*`**, un **`npm install`** complet et le redémarrage après déploiement.
- **Vue Tâches** : après un changement de statut (ou envoi du rapport « terminée »), le rafraîchissement n’était parfois pas exécuté si un chargement global était déjà en cours (`fetchAll` ignorait les appels suivants) — liste vide jusqu’au rechargement manuel. Les demandes sont maintenant **mises en file** : même promesse pour les appels concurrents et **nouvelle passe** si une action a demandé un sync pendant la précédente. Garde sur **`GET /api/tasks`** (temps réel et chargement global) si la réponse n’est pas un tableau. **`LogModal`** attend la fin de **`onRefresh`** avant fermeture (`src/App.jsx`, `src/hooks/useForetmapRealtime.js`, `src/components/tasks-views.jsx`).

### Modifié
- **Charge / observabilité** : métriques admin **`http429`** et tampon **`recentHttp429`** (`lib/logMetrics.js`) pour distinguer rate limit et erreurs serveur ; **`GET /api/tasks`** (liste) exécute en parallèle les requêtes SQL indépendantes (zones, repères, tutoriels, proposeurs, assignations, agrégats) ; pool MySQL configurable via **`FORETMAP_DB_CONNECTION_LIMIT`** (`database.js`, **`.env.example`**) ; rafraîchissement automatique client par défaut **45 s** au lieu de 30 s (`src/App.jsx`) ; réponses **429** marquées **`rateLimited`** sur l’erreur `api()` (`src/services/api.js`). Doc **`docs/API.md`**, **`docs/EXPLOITATION.md`**, skill **foretmap-observability** ; test **`api.test.js`**.
- **Quick wins charge** : arrêt du polling périodique quand le temps réel est **`live`** et garde anti-chevauchement sur `fetchAll` (`src/App.jsx`) ; compression HTTP Express (`server.js`, dépendance `compression`) ; cache TTL mémoire 20 s pour `GET /api/maps` et `GET /api/plants` + invalidation sur mutations (`lib/memoryTtlCache.js`, `routes/maps.js`, `routes/plants.js`, `routes/settings.js`) ; lecture du proposeur limitée aux tâches `proposed` + index SQL `audit_log(action, target_type, target_id)` (`routes/tasks.js`, `migrations/050_audit_log_propose_task_index.sql`) ; plafond rate limit par défaut porté à **1200/min/IP** (`server.js`, `.env.example`, `docs/API.md`).

### Ajouté
- **Carte (mode prof)** : **dupliquer** une zone depuis la modale (**📋 Copie**) — même carte, contour décalé (~2,5 %), nom suffixé **« (copie) »**, plantes / état / description / couleur repris ; pas de photos ni tâches liées. **`POST /api/zones`** accepte **`description`** à la création ; doc **`docs/API.md`** ; test **`api.test.js`**.
- **Prise de contrôle admin** : permission RBAC **`admin.impersonate`** (profil **admin** par défaut) ; **`POST /api/auth/admin/impersonate`** et **`POST /api/auth/admin/impersonate/stop`** ; JWT avec identité cible + acteur ; UI **Profils & utilisateurs** (« Voir comme cet utilisateur ») et bandeau **Revenir à mon compte admin**. Doc **`docs/API.md`** ; test **`api.test.js`**.

### Modifié
- **Documentation & aide** : **`docs/EVOLUTION.md`** (prise de contrôle admin) ; infobulles et panneau **?** sur **Profils & utilisateurs** (`HELP_TOOLTIPS` / `HELP_PANELS`).
- **Build** : **`dist/`** régénéré (Vite) pour livrer l’UI prise de contrôle admin en production.
- **Validation des tâches** : `POST /api/tasks/:id/validate` accepte une validation **directe** pour les profils avec `tasks.validate` (tous statuts sauf déjà `validated`), sans exiger le passage par `done` ; les liaisons zones/repères sont retirées comme pour un passage à `validated` via `PUT`. Doc **`docs/API.md`** ; test **`api.test.js`**.
- **Carte (mode prof)** : en **édition des points** d’une zone, **glisser l’intérieur du polygone** translate tout le contour (en plus du déplacement point par point) ; indication d’aide mise à jour ; **coordonnées bornées 0–100 %** ; **annuler** la dernière modification (**Ctrl+Z** / **Cmd+Z** ou bouton **↩ Annuler**).
- **Formulaire tâche (édition / duplication)** : le sélecteur **Projet** inclut **toujours** le projet déjà lié à la tâche (y compris **en attente**), même s’il était absent de la liste filtrée par carte ou non chargé dans **`taskProjects`** — évite d’envoyer par erreur **`project_id: null`** au **PUT** (cause d’incohérences / erreurs côté API).
- **Build / déploiement** : **`npm run build`** relancé (Vite production) ; contenu de **`dist/`** identique au dépôt **v1.27.6**. Côté hébergeur, **`NODE_ENV=development`** n’affecte que le process Node (logs, comportement Express) ; les fichiers **`dist/`** restent une build frontend optimisée.
- **Socket.IO** : les erreurs moteur **« Session ID unknown »** (session obsolète / reconnexion) sont loguées en **`debug`** au lieu de **`warn`**, pour garder le tampon admin et les alertes exploitables.
- **PUT /api/tasks/:id** : conservation de **`FORETMAP_DEBUG_TASK_PUT_CLIENT=1`** (JSON 500 **`debugDetail`** / **`debugCode`** pour les profs **`tasks.manage`**) ; retrait de l’instrumentation **`agentDebugTaskPut`**, du tampon forcé associé et du **`console.warn`** côté formulaire (diagnostic formulaire stabilisé en v1.27.8).

### Retiré
- **`FORETMAP_DEBUG_INGEST_URL`** et l’envoi HTTP local d’événements agent depuis **`routes/tasks.js`** (plus utilisés).

### Modifié
- **Chargement des données (carte, tâches, etc.)** : `fetchAll` lit un instantané via ref (plus de recréation à chaque rendu) ; le rafraîchissement automatique est **debouncé** (250 ms) quand carte, réglages publics, rôle ou affiliation changent — moins d’appels API en rafale au démarrage ou après sync des réglages.
- **MCP Cursor (`foretmap-diagnostics`)** : chargement de **`.env`** à la racine dans **`scripts/mcp-foretmap-diagnostics.mjs`** (sans écraser l’OS) ; **`.cursor/mcp.json`** ne fixe plus **`FORETMAP_DEPLOY_SECRET`** via `${env:…}` (évitait un secret vide qui bloquait `dotenv`). Doc **`docs/MCP_FORETMAP_CURSOR.md`**, **`README.md`**, **`docs/EXPLOITATION.md`**.

### Ajouté
- **Nettoyage dev** : module **`lib/studentDeletion.js`** (suppression élève en transaction : assignations, logs de tâche, recalcul statuts, forum, commentaires contextuels, **`user_roles`**, tokens reset, **`elevation_audit`**, fichier avatar) ; **`DELETE /api/students/:id`** s’appuie dessus. Script **`scripts/cleanup-dev-data.js`** avec **`npm run db:cleanup:dev:dry`** / **`npm run db:cleanup:dev`** (élèves e2e par défaut, option **`--no-recurring-spawns`**, **`--include-node-test-students`**) ; doc **`docs/LOCAL_DEV.md`**.
- **Debug prod à distance** : résolution unifiée du secret (**`DEPLOY_SECRET`**, **`FORETMAP_DEPLOY_CHECK_SECRET`**, **`FORETMAP_DEPLOY_SECRET`**) via **`scripts/lib/deploy-secret-from-env.js`** ; **`npm run prod:admin-diagnostics`** (JSON complet **`/api/admin/diagnostics`**) ; **`npm run prod:remote-debug`** (post-deploy-check puis admin-tail). MCP **`foretmap-diagnostics`** : fallback sur **`DEPLOY_SECRET`** / **`FORETMAP_DEPLOY_CHECK_SECRET`**. Doc **`docs/EXPLOITATION.md`**, **`docs/API.md`**, **`docs/MCP_FORETMAP_CURSOR.md`**, **`.env.example`**, skill **foretmap-observability**.
- **Projets de tâches** : édition complète côté prof (titre, description, carte, statut, zones, repères, tutoriels) ; tables **`project_zones`**, **`project_markers`**, **`project_tutorials`** ; API **`GET/POST/PUT /api/task-projects`** enrichie (`zone_ids`, `marker_ids`, `tutorial_ids`, `zones_linked`, `markers_linked`, `tutorials_linked`) ; migration **`049_project_zones_markers_tutorials.sql`** ; doc **`docs/API.md`** ; tests **`new-features.test.js`**.
- **Exploitation** : script **`scripts/prod-admin-tail.js`** + **`npm run prod:admin-tail`** — diagnostics + tampon logs prod avec **User-Agent** dédié et pause anti-**429** ; doc **`docs/EXPLOITATION.md`**, skill **foretmap-observability**.

### Modifié
- **Documentation & skills** : nouveau skill **`.cursor/skills/foretmap-observability/SKILL.md`** ; mises à jour **foretmap-project**, **foretmap-evolution**, **foretmap-tests** ; **`docs/EXPLOITATION.md`** (bloc diagnostic à distance).

### Ajouté
- **Observabilité** : middleware **`X-Request-Id`** (`lib/requestId.js`) ; fin de requête HTTP **`on-finished`** + env **`FORETMAP_HTTP_LOG`** / **`FORETMAP_HTTP_SLOW_MS`** (`lib/httpRequestLog.js`) ; métriques mémoire + **`recentHttp5xx`** dans **`GET /api/admin/diagnostics`** (`lib/logMetrics.js`) ; échantillon **429** + IP tronquée (**`FORETMAP_RATE_LIMIT_LOG_SAMPLE`**) ; Pino **`redact`** (`lib/logger.js`) ; **`logRouteError`** enrichi ; logs auth (échecs login, PIN, JWT legacy) ; Socket.IO (auth manquante/invalide, **`connection_error`**, déconnexions anormales) ; job tâches récurrentes (durée, volumes) ; pool MySQL (**`msg`** structuré) ; **`on-finished`** en dépendance explicite. Documentation **`docs/API.md`**, **`.env.example`**, **`docs/MCP_FORETMAP_CURSOR.md`**, **`docs/EVOLUTION.md`** ; règle **`.cursor/rules/foretmap-backend.mdc`** ; tests **`api.test.js`** ; correctifs **`routes/rbac.js`**, **`routes/students.js`** (500 sans trace).
- **Diagnostic prod / Cursor MCP** : `GET /api/admin/diagnostics` ; serveur **`scripts/mcp-foretmap-diagnostics.mjs`** (`foretmap_public_health`, `foretmap_diagnostics`, `foretmap_tail_logs`) ; **`.cursor/mcp.json`** (secret **`${env:FORETMAP_DEPLOY_SECRET}`**) ; **`npm run mcp:diag`** ; devDependencies **`@modelcontextprotocol/sdk`**, **`zod`** ; guides **`docs/MCP_FORETMAP_CURSOR.md`**, **`README.md`**, **`docs/API.md`**, **`docs/EXPLOITATION.md`**, **`.env.example`**.
- **post-deploy-check** : si l’un des secrets deploy locaux est défini (**`DEPLOY_SECRET`**, **`FORETMAP_DEPLOY_CHECK_SECRET`**, **`FORETMAP_DEPLOY_SECRET`**), contrôle optionnel **`/api/admin/diagnostics`** ; tests **`api.test.js`**, **`post-deploy-check-script.test.js`**, **`deploy-secret-from-env.test.js`**.

### Corrigé
- **Tâches proposées / commentaires contextuels** : `POST /api/tasks/proposals` aligné sur le schéma courant (`project_id`, `completion_mode` explicite) pour éviter des échecs SQL sur certaines bases ; lecture du proposeur via `audit_log` encapsulée — en cas d’erreur, la liste des tâches reste servie sans bloquer tout l’onglet ; middleware commentaires : en cas d’échec des réglages/BDD, réponse JSON explicite (`503`, code `CONTEXT_COMMENTS_UNAVAILABLE`) au lieu du handler global « Erreur serveur » sans détail.
- **Auth / élévation PIN** : la modale PIN utilise **`getAuthToken()`** (alignée sur **`foretmap_session`**) au lieu de lire uniquement les clés **`foretmap_auth_token`** / **`foretmap_teacher_token`**, ce qui supprime le faux message **« Connectez-vous d’abord avant d’entrer un PIN »** lorsque le jeton provient surtout de la session ou d’un **`refreshedToken`** ; **`mergeAuthMeResponse`** met à jour **`foretmap_auth_token`** quand l’API renvoie **`refreshedToken`**. Documentation **`docs/LOCAL_DEV.md`** (e2e + **`dist/`** si prod). Artefacts **`dist/`** régénérés.
- **Modales (création / édition de tâches, etc.)** : pendant la saisie, le panneau ne remonte plus tout seul en haut — `useDialogA11y` ne réappliquait le focus sur le premier élément qu’à l’ouverture ; auparavant, une fonction `onClose` inline recréée à chaque rendu parent relançait l’effet (rafraîchissement liste, temps réel, etc.).
- **Vue Tâches (mobile)** : le clavier virtuel ne se referme plus à cause des micro-rafraîchissements — pendant l’ouverture des modales (tâche, projet, rapport, confirmation, etc.), le **polling** et les mises à jour **tâches / jardin** via Socket.IO sont suspendus ; un `fetchAll` explicite (ex. après sauvegarde) continue de s’exécuter.

### Modifié
- **API / rate limiting** : plafond global **`/api/*`** porté à **900 requêtes / minute / IP** par défaut (au lieu de 300) pour limiter les **429** lorsque plusieurs utilisateurs ou onglets partagent la même adresse publique (Wi‑Fi) ; réglage **`FORETMAP_API_RATE_LIMIT_PER_MIN`** (60–20000) ; limiteurs **express-rate-limit v8** avec l’option **`limit`** ; log de la valeur effective en **`debug`** au démarrage. Documentation **`docs/API.md`**, **`.env.example`**.
- **Dev local & CI** : remplacement de MySQL 8 par **MariaDB 11.4.10** (`docker-compose.yml`, volume `foretmap_mariadb_data`, service `mariadb`, healthcheck `healthcheck.sh`) ; port publié paramétrable **`FORETMAP_DB_PUBLISH_PORT`** (défaut 3306, lu depuis `.env` à la racine) ; GitHub Actions (`.github/workflows/ci.yml`) aligné sur la même image ; documentation `docs/LOCAL_DEV.md`, `README.md`, `env.local.example`. Passage depuis l’ancien conteneur MySQL : `docker compose down -v` puis `up -d` (données binaires non réutilisables).
- **Migrations / `database.js`** : ignorer **errno 1005** avec message **121** / *Duplicate key* sur `ALTER TABLE … ADD CONSTRAINT` lorsque le schéma initial inclut déjà la contrainte — déblocage d’un **`db:init`** sur base vierge (ex. Docker MariaDB).
- **Tests e2e (Playwright)** : fermeture systématique de la modale **promotion de profil** (`dismissProfilePromotionModalIfPresent`) pour ne pas bloquer la carte et les actions ; onglet tâches élève — réinitialisation des filtres (carte, zone, projet, statut) et de la recherche via `.task-filters` ; ouverture carte zone — clic `polygon` ou événement sur le hit ; `clickTeacherNewTask` — clic via `evaluate` et évitement d’une double élévation prof ; timeouts ajustés sur scénarios temps réel et cycle complet tâches.
- **UI / modales Profils & utilisateurs** : édition compte et confirmation suppression — **`modal-overlay--centered`** + **`log-modal--dialog`** (`index.css`) : panneau centré, coins arrondis, ombre, animation **`popIn`** (plus de feuille collée en bas à gauche sur grand écran).
- **Carte interactive** : le cadre du plan peut disparaître (barre d’outils / fond visibles seuls) lorsque **`100cqh`** vaut **0** sur le slot en flex/grid — retrait de **`container-type:size`** et des largeurs **`cqw`/`cqh`** au profit de **`width:100%`**, **`max-height:100%`** et **`aspect-ratio`** dans l’espace utile du parent ; **`--fm-map-w` / `--fm-map-h`** passées en chaînes pour l’interprétation CSS.
- **Profils & utilisateurs / édition compte** : erreurs (ex. **élévation PIN**, 403) visibles **dans la modale** (auparavant masquées sous le calque `z-index: 200`) ; `<form noValidate>` + bouton **submit** ; repli **`user_type`** depuis la ligne liste ; **`load()`** après succès isolé. Préremplissage : fusion liste + GET détail, clés insensibles à la casse, `encodeURIComponent`, `jsonTextField` côté API.
- **Notifications (UI)** : le panneau du centre de notifications se ferme au **clic à l’extérieur** (hors panneau et hors bouton cloche) et via un bouton **×** en haut à droite du panneau.
- **Profils & utilisateurs / édition compte** : ouverture avec **`GET /api/rbac/users/:userType/:userId`** ; champs préremplis avec les valeurs serveur ; si `first_name`/`last_name` sont absents, complément à partir de `display_name` ou de la partie locale de l’email. Prénom et nom obligatoires à l’enregistrement ; indicateur de chargement dans la modale. Documentation **`docs/API.md`** ; test **`rbac.test.js`**.

### Ajouté
- **Tests temps réel (Socket.IO)** : extension de **`tests/realtime.test.js`** — JWT **invalide** / **expiré** (`connect_error`), **`subscribe:map`** (sortie de l’ancienne salle `map:`), **`emitTasksChanged` sans `mapId`** (diffusion **`domain:tasks`** pour deux clients sur des cartes différentes). Documentation **Robustesse** dans **`docs/API.md`** (section Temps réel) ; **`docs/EVOLUTION.md`**.
- **Tâches / projet en attente (prof)** : sur chaque carte projet, bouton **+ Tâche** ouvre la création avec le projet déjà choisi (y compris si le projet est **en attente** — l’API le permet déjà ; les inscriptions élèves restent bloquées jusqu’à réactivation). Libellé **(en attente)** dans le sélecteur de projet du formulaire et dans le filtre par projet ; message explicite côté prof sous le bandeau projet gelé.
- **Tests de charge** : profil Artillery **`10vu`** (`load/artillery-10vu.yml`) — jusqu’à **10 utilisateurs virtuels** concurrents, **sans** en-tête `X-ForetMap-Load-Test` (rate limit **`/api/*`** actif, une IP source) ; script **`npm run test:load:10vu`** ; `scripts/run-load-test.js` accepte le profil `10vu`. Documentation **`docs/LOCAL_DEV.md`**, **`docs/API.md`**, **`docs/EVOLUTION.md`**, **`docs/EXPLOITATION.md`**.
- **Progression auto (profil n3beur)** : lors d’une montée de palier par tâches validées, l’API enregistre un avis ponctuel ; **`GET /api/auth/me`** renvoie **`autoProfilePromotion`** (nom du profil, emoji, nombre de tâches validées, liste courte de droits RBAC sans PIN, forum / commentaires contextuels, plafond d’inscriptions actives le cas échéant) et **`refreshedToken`** si le JWT doit être aligné sur le rôle en base. L’app affiche une **modale** de félicitations (`AutoProfilePromotionModal`, styles `profile-promo-*`). L’avis n’est pas enregistré lors d’un simple **`GET /api/stats/all`** (consultation n3boss). Documentation **`docs/API.md`**.
- **Profils & utilisateurs** : modification d’un **compte quelconque** (n3beur ou enseignant) depuis la section « Attribution des profils » — bouton **Modifier** (prénom, nom, pseudo, email, description, affiliation n3beur, mot de passe optionnel). API **`PATCH /api/rbac/users/:userType/:userId`** (permission `admin.users.assign_roles`, même élévation PIN que l’attribution de profils) ; un compte au profil principal **admin** n’est modifiable que par un acteur **admin**. **`GET /api/rbac/users`** enrichi (`first_name`, `last_name`, `pseudo`, `description`, `affiliation`). Renommage n3beur : synchronisation des noms dans **`task_assignments`** et **`task_logs`**. Documentation **`docs/API.md`** ; test **`rbac.test.js`**.
- **RBAC / inscriptions tâches** : plafond d’inscriptions **simultanées** configurable par **profil n3beur** (`roles.max_concurrent_tasks`, migration **`047_roles_max_concurrent_tasks.sql`**) — seules les tâches **non validées** comptent ; `NULL` = utiliser le réglage global `tasks.student_max_active_assignments` ; `0` = pas de limite pour ce profil ; `POST /api/tasks/:id/assign` et `GET /api/auth/me` utilisent le plafond effectif. Édition dans **Profils & utilisateurs** (même périmètre que forum / seuils paliers). Documentation **`docs/API.md`** ; tests **`api.test.js`**.
- **Tâches récurrentes** : job quotidien (`lib/recurringTasks.js`) après init BDD — duplication automatique des tâches **validées** avec `recurrence` (weekly / biweekly / monthly) lorsque `due_date` est passée (fuseau `FORETMAP_RECURRENCE_TZ`, défaut Europe/Paris) ; clone en `available` sans assignations, copie zones / repères / tutoriels, nouvelles dates décalées (`start_date` absent → repli sur la date de `created_at`) ; idempotence `tasks.recurrence_spawned_for_due_date` ; `parent_task_id` vers la source ; audit `recurring_task_spawn` ; temps réel. Désactivation : `FORETMAP_DISABLE_RECURRING_TASK_JOB=1` ou `NODE_ENV=test`. Script `npm run tasks:spawn-recurring`. Migration **`046_task_recurrence_spawn_marker.sql`**.

- **RBAC** : duplication d’un profil — `POST /api/rbac/profiles/:id/duplicate` (slug et nom affiché distincts ; copie des permissions, seuils, ordre et flags forum / commentaires contextuels ; **PIN non copié**) ; bouton **Dupliquer** dans **Profils & utilisateurs** (permission `admin.roles.manage`).
- **Carte** : création/édition de **zones** et **repères** — champ pour coller ou taper un emoji personnalisé (la grille de suggestions reste disponible) ; **API repères** : troncature de l’emoji à 16 caractères (alignement `map_markers.emoji`).

### Modifié
- **RBAC** : création et duplication de profil refusent les **slugs réservés** (`admin`, `prof`, `visiteur`, `eleve_novice`, `eleve_avance`, `eleve_chevronne`) avec message explicite — le slug technique doit rester distinct du profil système ; le **nom affiché** peut toujours être libre (ex. « Admin » avec le slug `admin_delegue`). Prompts **Profils & utilisateurs** et `docs/API.md` alignés ; test **`rbac.test.js`**.
- **Build / déploiement** : régénération des artefacts `dist/` (bundles Vite) et synchronisation de `package-lock.json`.
- **Carte / zones** : détection et retrait du préfixe emoji en tête de nom étendus aux emojis hors liste prédéfinie (affichage, édition, nom enregistré).
- **Visite (édition)** : titres de zone — même logique de détection de préfixe emoji que sur la carte.
- **Documentation API** : `docs/API.md` — zones (`name` avec préfixe emoji) et repères (`emoji` tronqué à 16 caractères).
- **RBAC / forum / commentaires contextuels** : la participation au forum et aux commentaires de contexte (tâches, projets, zones) est réglée par **profil** (`roles.forum_participate`, `roles.context_comment_participate`, défaut activé) et non plus par compte utilisateur. `GET /api/auth/me`, les gardes API et `GET /api/rbac/users` suivent le **profil principal** du n3beur ; `PATCH /api/rbac/profiles/:id` accepte `forum_participate` et `context_comment_participate` (booléens) pour les profils dont le slug commence par `eleve_` ; suppression de `PATCH /api/rbac/users/student/:id/forum-participate` et `.../context-comment-participate`. UI **Profils & utilisateurs** : cases dans la section Permissions du profil n3beur sélectionné (permission `admin.roles.manage` + PIN). Migration **`045_participation_forum_comments_on_roles.sql`** : agrégation par rôle (MIN des anciennes valeurs utilisateur), puis suppression des colonnes sur `users`.
- **Documentation API** : `docs/API.md` — sections forum, commentaires contextuels et tableau RBAC alignés sur le modèle par profil ; retrait des routes `PATCH` par utilisateur.
- **RBAC / PATCH profil** : lecture des flags avec `COALESCE(..., 1)` ; **Profils (UI)** : cases forum / commentaires contextuels désactivées sans la permission `admin.roles.manage`.
- **Documentation & outillage dev** : mise à jour de `docs/LOCAL_DEV.md`, `docs/API.md`, `README.md`, skills **foretmap-e2e** et **foretmap-project** (pointeur e2e), règles **foretmap-conventions** / **foretmap-backend** (démarrage e2e `start:e2e`, flag `--foretmap-e2e-no-rate-limit`, `E2E_REUSE_SERVER`, `TEACHER_PIN` via dotenv Playwright) ; **`test:e2e:headed`** aligné sur la libération du port comme **`test:e2e`**.

### Ajouté
- **Paramètres admin** : réglages publics `ui.map.emoji_label_center_gap` (6–32, défaut 14), `ui.map.overlay_emoji_size_percent` et `ui.map.overlay_label_size_percent` (70–150 %, défaut 100) pour l’espacement emoji/libellé et l’échelle du texte sur la carte (zones SVG + repères) ; section « Modules UI » de la page Réglages ; utilitaire `resolveMapOverlayTypography` côté client.
- **Tests de charge** : ajout d’un scénario Artillery `load/artillery.yml` (phases warmup/ramp-up/plateau/cool-down, mix de lectures `/api/health`, `/api/health/db`, `/api/version`, `/api/zones`, `/api/plants`) et des scripts `npm run test:load` / `npm run test:load:report`.
- **Tests de charge (automatisation)** : 3 profils prêts à l’emploi (`light`, `normal`, `stress`) avec lanceurs npm dédiés (`test:load:*`), exécution enchaînée `test:load:all`, archivage horodaté des rapports JSON dans `load/reports/` et génération de résumés Markdown par profil.
- **Tests de charge (réalisme utilisateur)** : profils `light`, `normal` et `stress` renforcés avec davantage d’utilisateurs simultanés, phases plus longues et sessions plus réalistes (enchaînements multi-pages + pauses `think`).

### Corrigé
- **Migrations / participation paliers n3beur** : migration **`048_eleve_participation_defaults.sql`** — rétablit `forum_participate` et `context_comment_participate` à `1` pour les profils système `eleve_novice`, `eleve_avance` et `eleve_chevronne` lorsque la migration **045** les avait passés à `0` via le MIN des anciennes valeurs par compte (cas fréquent en base locale de test). Sans cela, les n3beurs « novice » héritaient d’une **lecture seule** sur le forum et les **commentaires de contexte** (`403`), ce qui faisait échouer `tests/context-comments.test.js` et `tests/forum.test.js`.
- **RBAC** : un enseignant dont le **profil principal** est un **duplicata du n3boss** (slug ≠ `prof`, rang ≥ 400, permission `teacher.access`) n’était plus traité comme profil staff : les permissions marquées « PIN » disparaissaient du JWT et l’UI **Profils & utilisateurs** exigeait un PIN inopérant si aucun secret PIN n’existait pour ce rôle. Alignement sur le comportement du slug `prof` via **`nativePrivileged`** (`lib/rbac.js`, JWT, `GET /api/auth/me`, garde `requirePermission`) et prise en compte côté client (export / import / création utilisateur, onglet Tuto).
- **Commentaires de contexte (tâches / projets / zones)** : le nombre affiché sur le bouton (section repliée) restait à **0** tant qu’on n’avait pas ouvert le panneau ; chargement du total à l’affichage du composant (requête légère) et mise à jour du compteur via temps réel même lorsque la section est fermée.
- **Notifications (n3boss)** : propositions de tâches — en plus du ref **cumulatif** (évite les faux positifs quand la liste des tâches est vide entre deux rafraîchissements) : **réhydratation** du suivi depuis les notifications déjà enregistrées (localStorage) au chargement, **dédoublonnage durable** pour les clés `teacher-proposed-*` (indépendant du cooldown 10 min, qui refaisait une entrée pour une proposition toujours en attente), remise à zéro du suivi si le n3boss **supprime** la notif, clé de tâche **stabilisée** (`String(id)`).
- **RBAC / PATCH profil** : éviter « Aucun champ de profil fourni » sur des requêtes valides — corps normalisé (objet plat), champs reconnus via liste autorisée ; alias **`forumParticipate`** / **`contextCommentParticipate`** acceptés. **`api()` (client)** : envoi du corps JSON dès que l’argument n’est pas `undefined`/`null` (ne plus s’appuyer sur la vérité de la valeur, qui omettait à tort `0` ou `false`). Cases forum / commentaires : envoi en **0/1**. Réordonnancement des profils : ignore les entrées sans `id` ou sans `display_order`.
- **RBAC (UI + API)** : les blocs « seuil de tâches validées », « proposition de tâches » et « forum / commentaires contextuels » ne s’affichaient que pour les slugs `eleve_*`, donc pas pour les **nouveaux** paliers dupliqués ou créés avec un autre slug (ex. copie d’un `prof`). Ils s’appliquent désormais à tout **palier n3beur** : slug `eleve_*`, ou profil avec `rank` strictement inférieur à **400** (rang du n3boss), hors `admin`, `prof`, `visiteur`. `PATCH /api/rbac/profiles/:id` accepte `forum_participate` / `context_comment_participate` dans les mêmes conditions ; validation « aucun champ » corrigée si seuls ces booléens sont envoyés sur un profil interdit. Sélection automatique du profil après **Créer un profil**. `docs/API.md` et test **`rbac.test.js`** alignés.
- **RBAC (UI — Profils & utilisateurs)** : les cases « participation forum » et « commentaires contextuels » sur un profil n3beur n’étaient plus cliquables sans session « élevée » (`authElevated`), alors que le serveur autorise déjà `PATCH /api/rbac/profiles/:id` pour les comptes **prof** / **admin** natifs sans PIN ; les cases suivent désormais la même règle que le reste de l’édition de profil (`admin.roles.manage`, requête refusée avec message serveur si élévation requise).
- **n3boss — barre d’onglets du haut (parchemin)** : hauteur **uniforme** quel que soit l’onglet ou le format d’écran, via variables `clamp()` (`--top-tabs-row-inner-h`, etc.) ; suppression des surcharges mobile/desktop contradictoires sur `.top-tab` ; marge sous la barre également en `clamp()` pour tous les viewports.
- **Carte** : la carte ne s’affichait plus — le conteneur en `width`/`height: auto` se repliait à 0×0 (contenu uniquement en `position: absolute`, sans taille intrinsèque en flux) ; retour à `width: 100%`, `max-height: 100%` et `aspect-ratio` ; retrait des règles `html`/`body`/`#root`/`#app` avec `:has(.map-view-root--solo)` qui pouvaient perturber la chaîne flex.
- **RBAC / progression** : `syncStudentPrimaryRoleFromProgress` ne rétrograde plus un n3beur vers un profil de rang inférieur (ex. `eleve_avance` → `eleve_novice` avec 0 tâche validée), ce qui retirait `tasks.propose` et provoquait des **403** sur les propositions de tâches ; seules les promotions (rang cible ≥ rang actuel) sont appliquées automatiquement.
- **RBAC** : `getPrimaryRoleForUser` sélectionne le profil primaire par `rank` décroissant puis `assigned_at` ; `repairDuplicatePrimaryRoles` pour les n3beurs préfère un profil non **visiteur** en cas de plusieurs `is_primary=1`.
- **RBAC (API)** : `PUT /api/rbac/users/.../role` s’appuie sur `getPrimaryRoleForUser` pour le profil courant ; le garde « dernier administrateur » ne compte que les rôles admin **enseignant**. Test **settings** : admin identifié par `TEACHER_ADMIN_EMAIL` ; **200** accepté s’il existe plusieurs admins enseignants (base de test).
- **Schéma** : table **`observation_logs`** dans `sql/schema_foretmap.sql` (`CREATE IF NOT EXISTS`) pour aligner `initSchema` sur les routes observations lorsque la table manque malgré une `schema_version` élevée.
- **Tests backend** : flux enseignant pour assign / done / unassign (`tasks-status`, `api.test.js`, `new-features`, `students-delete`) ; plafond d’inscription — email + **login** après changement de rôle ; `students-duplicate` — URL `POST .../:id/duplicate` sans token ; `tasks-status` — `ensureRbacBootstrap` après `initSchema`.
- **Mobile (carte, portrait)** : la barre d’outils sous l’en-tête (plans, modes, zoom) paraissait plus haute que sur les autres onglets, car le bouton d’aide « ? » restait en 48×48px alors que les autres contrôles étaient compacts ; alignement sur ~36px dans cette barre uniquement, et compaction CSS aussi ciblée sur `.map-view-root--solo` pour éviter un retour à la ligne si la classe `main--map-visible` manque.
- **Commentaires contextuels (UI)** : ouverture du panneau « Commentaires » (tâches / zones / projets) — la variable `canUseCommentActions` n’était plus définie, ce qui provoquait une erreur au rendu ; rétabli en l’alignant sur `canParticipateContextComments`.
- **Tests e2e (Playwright)** : bypass du rate limiting fiable en local Windows via le script **`npm run start:e2e`** (`node server.js --foretmap-e2e-no-rate-limit`) — la variable d’environnement seule ne parvenait pas toujours au process Node ; config Playwright enchaîne `db:init` puis `start:e2e` ; CI alignée (`nohup npm run start:e2e`).
- **Tests e2e** : `playwright.config.js` charge `.env` pour aligner **`TEACHER_PIN`** avec le serveur ; fixture **`enableTeacherMode`** utilise `E2E_ELEVATION_PIN` puis `TEACHER_PIN`.
- **Tests e2e** : `tasks-full-cycle.spec.js` — clic sur le bouton prof **`✔️ Validée`** et assertion sur le toast **`Statut mis à jour : Validée`** (libellés UI actuels).
- **Accessibilité / e2e** : modale « Rapport de tâche » — liaison **`label` / `textarea`** (`useId`) pour le champ commentaire.
- **Commentaires contextuels** : le profil **visiteur** n’a plus accès aux routes `/api/context-comments` (**403**, y compris lecture), aligné sur le forum.
- **Tests e2e (Playwright)** : fixture d’inscription (labels en mode strict, sélection **Mon espace**, champs mot de passe) ; déconnexion via le bouton **Déconnexion** ; assertions de navigation alignées sur les libellés d’onglets actuels (ex. **🗺️ Carte** en `exact`, Biodiversité / Tuto / À propos).
- **Tests backend** : le script `npm test` passe **`--test-force-exit`** à Node pour éviter que le processus reste actif après la fin de la suite.
- **Mobile** : interface figée ou très lente sur la carte — le `ResizeObserver` recalculait le cadrage à chaque variation de hauteur de vue (barre d’adresse, clavier) et déclenchait des re-renders React en rafale via `setCommitted` ; recalcul du fit **différé (120 ms)** et mise à jour d’état **uniquement si la pose change** réellement.
- **Réseau** : les appels `fetch` de l’API client passent par un **délai d’attente 40 s** (`AbortController`) pour qu’un chargement bloqué ne reste pas indéfiniment sur l’écran « Chargement… ».

### Modifié
- **Carte** : espacement emoji ↔ libellé des **repères** aligné sur celui des **zones** (même écart entre centres, `14×inv`, et mêmes tailles de police partagées) ; mise en page en colonne et zone tactile min. 48×48 conservée sur mobile.
- **Rate limiting API** : bypass optionnel et ciblé pour les campagnes de charge via header `X-ForetMap-Load-Test` quand `LOAD_TEST_SECRET` est défini côté serveur ; comportement inchangé par défaut.
- **Carte** : emojis des zones et des repères, pastilles de statut des tâches et libellés légèrement agrandis pour une meilleure lisibilité.
- **Build** : régénération des bundles `dist/` (Vite production).
- **Mobile (écran carte)** : barre d’outils (plans, modes, zoom) plus compacte pour réduire la hauteur perdue par rapport aux autres onglets ; le bouton d’aide « ? » conserve une taille tactile adaptée.
- **Mobile (en-tête + carte n3boss)** : hauteur de l’en-tête vert plafonnée et une seule ligne (logo + actions) ; actions un peu plus compactes ; onglets du haut (`.top-tabs`) réduits seulement quand la vue carte est affichée (`:has(.map-view-root)`) ; barre d’outils carte encore plus basse — la zone du haut sur « Carte » se rapproche des autres pages.
- **Mobile (navigation n3boss)** : suppression du saut visuel de hauteur des onglets supérieurs en changeant d’onglet (Carte ↔ autres vues) ; onglets compacts désormais stables en mode prof/admin, et compaction de la barre d’outils carte appliquée uniquement quand la carte est réellement affichée.
- **Cartes & tâches (vue split)** : le plan est aligné en haut de la colonne carte (plus de centrage vertical) pour rester sous la barre d’outils lorsque la liste des tâches impose une grande hauteur.
- **PWA / mobile** : icônes d’application (`pwa-icon-192.png`, `pwa-icon-512.png`, `pwa-maskable-512.png`, `apple-touch-icon`) et `favicon-n3.png` régénérées avec le logo **n³ en blanc** sur fond `#1a4731` ; script `npm run icons:pwa` (`scripts/generate-pwa-icons-n3-white.js`, dépendance dev `sharp`) ; cache service worker `foretmap-offline-v6`.

### Ajouté
- **Paramètres admin** : réglage `tasks.student_max_active_assignments` (0–99, défaut 0 = illimité) — nombre maximal de tâches **actives** (non validées, toutes cartes) auxquelles un n3beur peut **s’auto-inscrire** ; section « Tâches & inscriptions n3beurs » dans l’UI admin.
- **API** : garde sur `POST /api/tasks/:id/assign` pour l’auto-inscription (`code: TASK_ENROLLMENT_LIMIT` si dépassement) ; `GET /api/auth/me` enrichi avec `taskEnrollment` pour les n3beurs (`maxActiveAssignments`, `currentActiveAssignments`, `atLimit`).
- **UI n3beur** : désactivation des seuls contrôles d’**inscription** à la limite ; **proposition de tâche** et **retrait** restent disponibles ; bandeaux explicites (liste tâches, modales zone/repère) ; sur la carte, les pastilles « places disponibles » restent fidèles à la tâche (la limite personnelle est portée par `canEnrollOnTasks`, pas par `canStudentAssignTask`).
- **Forum** : participation paramétrable par compte n3beur (`users.forum_participate`, défaut activé) — désactivé = lecture seule sur le forum ; case dans Profils & utilisateurs (PIN élevé), `PATCH /api/rbac/users/student/:userId/forum-participate`, `forumParticipate` sur `GET /api/auth/me`, code `FORUM_READ_ONLY` sur les mutations refusées. Migration `043_users_forum_participate.sql`.
- **Commentaires contextuels** : participation paramétrable par compte n3beur (`users.context_comment_participate`, défaut activé) — désactivé = lecture seule sur les commentaires des tâches / projets / zones (pas le forum) ; case « Commentaires (tâches, zones…) » dans Profils & utilisateurs, `PATCH /api/rbac/users/student/:userId/context-comment-participate`, `contextCommentParticipate` sur `GET /api/auth/me`, code `CONTEXT_COMMENT_READ_ONLY` sur les mutations refusées. Migration `044_users_context_comment_participate.sql`.

### Modifié
- **Sélecteur de carte** : le bandeau de choix de plan (carte principale et visite) n’apparaît que lorsqu’au moins deux cartes sont disponibles ; masqué quand une seule carte reste visible (cartes désactivées en admin ou restriction de profil / affiliation).
- **Carte & visite** : les repères s’affichent comme les zones (emoji seul, sans disque blanc bordé de vert) sur la carte principale et sur la carte de visite ; zone de touche minimale conservée pour le mobile.
- **Build frontend** : régénération des bundles dans `dist/` (Vite production).

### Ajouté
- **Profils & utilisateurs (colonne Permissions)** : bloc « Progression par tâches validées » — case à cocher pour activer ou désactiver la montée de niveau automatique des profils élèves (réglage `rbac.progression_by_validated_tasks`, aussi éditable dans Paramètres admin) ; pour chaque profil `eleve_*`, champ numérique + bouton pour fixer le nombre de tâches validées requises (`min_done_tasks`) sans repasser par « Modifier ».
- **API** : `GET /api/rbac/profiles` renvoie `{ roles, progressionByValidatedTasksEnabled }` ; `PATCH /api/rbac/progression-by-validated-tasks` avec `{ enabled: boolean }` ; les réponses stats exposent `progression.autoProgressionEnabled`.
- **Vue statistiques élève** : bandeau explicite lorsque la progression automatique est désactivée (paliers affichés à titre indicatif).

### Modifié
- **Profils & utilisateurs** : pour chaque profil `eleve_*`, bloc « Proposition de tâches » (activation de `tasks.propose` + option PIN) ; la ligne dupliquée est retirée de la grille des permissions pour ce type de profil.
- **Terminologie interface** : libellés visibles « élève(s) / prof(esseur)(s) / enseignant » remplacés par **n3beur(s)** et **n3boss** partout dans l’UI, les messages d’erreur API affichés côté client, le RBAC par défaut (`lib/rbac.js`), les modèles d’import (tâches : colonne « n3beurs requis » ; utilisateurs : fichiers `foretmap-modele-n3beurs.*`), le préfixe de description des propositions (`Proposition n3beur:`), la doc `docs/API.md`, et la migration `042_ui_terminology_n3beur_n3boss.sql` (rôles, permissions, rétro-migration des descriptions de tâches). `getRoleTerms()` renvoie désormais toujours cette terminologie (plus de variante selon l’affiliation). Compatibilité : parsing `Proposition élève:` ou `Proposition n3beur:` ; import utilisateurs accepte toujours `eleve` / `prof` dans les CSV.
- **Profils & utilisateurs** : boutons Monter / Descendre (↑ ↓) à côté de chaque profil pour réordonner la liste sans repasser par la boîte « Modifier » ; les `display_order` sont recalculés (0, 1, 2, …) pour refléter le nouvel ordre ; les listes d’attribution suivent le même ordre ; édition directe de l’emoji (champ + aperçu + « Enregistrer l’emoji ») pour le profil sélectionné.
- **Vue élève / vue prof (aperçu)** : bandeau explicite sous l’en-tête lorsque l’enseignant ou l’admin bascule en mode aperçu, pour que le changement de navigation (onglets du haut ↔ barre du bas) et la nature « simulation d’interface » soient visibles immédiatement.

### Corrigé
- **Paramètres admin (champs texte sans `maxLength`)** : `maxLength` HTML n’est plus dérivé de `null` via `Number(null) === 0` (le navigateur appliquait `maxLength={0}` et bloquait saisie et collage, ex. `ui.map.location_emojis`) ; l’aide sous le champ n’affiche plus de faux « min 0 / max 0 / max 0 caractères » pour les contraintes absentes.
- **Mobile (vue carte)** : barre de navigation du bas en défilement horizontal (plus de colonnes ultra-étroites + texte sur plusieurs lignes qui faisait exploser la hauteur) ; hauteur plafonnée ; barre d’outils de la carte en une ligne défilante sur petit écran ; recalage de la carte au redimensionnement (`ResizeObserver`) et garde sur les dimensions du conteneur pour éviter un zoom à 0.
- **Paramètres admin (texte / emojis)** : les champs texte et zones multilignes (dont `ui.map.location_emojis` et `ui.reactions.allowed_emojis`) sont désormais **contrôlés** par React avec resynchronisation après chargement serveur, pour un collage depuis le presse-papiers fiable ; `touch-action: auto` sur les champs sous `.settings-admin` évite l’interférence du `pan-y` du conteneur (mobile / certains navigateurs) ; `setSavingKey` est libéré dans un `finally` après enregistrement.
- **Vue scindée (desktop) / ascenseur** : la grille carte+tâches utilise une ligne `minmax(0, 1fr)` pour ne plus étirer la page à la hauteur totale des tâches ; `overflow: hidden` sur `.main` et `.teacher-main` pour confiner le défilement aux zones prévues (liste des tâches, vues longues).
- **Tests (RBAC)** : assertions sur `GET /api/rbac/profiles` alignées sur la réponse `{ roles, progressionByValidatedTasksEnabled }`.
- **Tests backend (tâches / forum)** : promotion explicite en `eleve_novice` pour les scénarios d’affectation, de capacité et de suppression d’élève ; jeton admin des tests enrichi de `tasks.validate` ; le test « forum visiteur » force `ui.modules.forum_enabled` pour éviter les courses avec les autres fichiers de suite.
- **Carte (layout laptop / desktop)** : la hauteur du bloc carte ne repose plus sur des calculs en `100dvh` déconnectés des onglets professeur et des marges ; chaîne flex (`#app` → `teacher-main` / `main` → contenu) avec `min-height: 0` ; vue scindée carte/tâches en colonnes étirées et liste des tâches en flex avec défilement interne ; zone de gestes carte avec `min-height: 0` pour un cadrage correct de l'image.
- **Modales mobile (feuilles)** : `modal-overlay` + panneaux `.modal` / `.log-modal` / prévisualisation tutoriel alignés sur le viewport dynamique (`100dvh`) et les encoches (`safe-area`), pour éviter que le haut ou le bas soit masqué par les barres système.
- **Formulaire tâche (zones / repères / tutoriels)** : les cases à cocher des listes à sélection multiple ne héritent plus des styles `.field input` (`width: 100%`, padding) — la case redevient compacte à gauche et le libellé s’affiche correctement à sa droite (y compris la liste des tutoriels associés).
- **Tâches (commentaires)** : le texte en cours de saisie dans les commentaires de tâche (et le volet qui se refermait) n’est plus perdu lorsque la liste des tâches se rafraîchit (polling ou temps réel) et que la carte est recréée ; le brouillon est conservé dans `sessionStorage` jusqu’à publication. Même principe pour le commentaire optionnel de la fenêtre « Rapport de tâche ».

### Supprimé
- **Outil collectif retiré (frontend + backend)** : suppression complète de la vue `Collectif`, des endpoints `/api/collective/*`, de la diffusion temps réel `collective:changed`, des tables SQL associées (`collective_sessions*`), des migrations dédiées et des tests backend liés.

### Modifié
- **Identité visuelle (logo n³)** : ajout de la source officielle `public/app-logo-n3.png`, régénération des icônes PWA (`pwa-icon-*`, `pwa-maskable-*`) et du `favicon-n3.png`, affichage du logo dans l'en-tête (version claire par filtre sur fond vert) et sur l'écran d'authentification ; raccourcis du manifeste alignés sur `pwa-icon-192.png` ; cache service worker passé en `v5`.
- **Build frontend** : régénération des bundles dans `dist/` (build Vite production) pour le déploiement avec les sources courantes.
- **Profil visiteur (observateur)** : pas de progression RBAC automatique depuis les tâches validées ; blocage API des actions et contenus exposant les données d’autres utilisateurs (commentaires de contexte, carnet d’observations en écriture, propositions de tâches) ; filtrage des affectations sur le détail d’une tâche.
- **Auth élève** : `POST /api/auth/register` respecte le réglage `ui.auth.allow_register` (403 si désactivé, aligné sur l’UI admin).
- **RBAC** : amorçage sans second rôle primaire pour les élèves déjà profilés (ex. visiteur après inscription) ; réparation des doublons `is_primary` au bootstrap ; PIN des profils en bcrypt (compatibilité lecture des anciens hash SHA-256).
- **RBAC (`lib/rbac.js`)** : le visiteur ne passe plus par la resynchronisation de progression ; réparation explicite des `is_primary` dupliqués au bootstrap ; attribution « élève novice » seulement sans rôle primaire existant ; vérification des PIN acceptant bcrypt et anciens hash SHA-256.
- **Tâches** : le contexte JWT est réhydraté depuis la BDD sur les routes concernées (`parseOptionalAuth`) pour que le rôle effectif suive les changements en base sans exiger une reconnexion.
- **Formulaire tâche (emplacement)** : les sélections multiples **zones** et **repères** sont regroupées dans une seule liste défilante, avec séparateurs visuels lorsque les deux types sont présents.
- **Tâches (libellés mode de validation)** : l’ancien libellé « classique » est remplacé par **individuel** / **Validation individuelle** (chip et liste déroulante), en parallèle de **collectif** / **Validation collective**.
- **Avatar en-tête après changement de photo** : URL des fichiers `/uploads/` préfixée avec `withAppBase` (déploiement sous-dossier) ; `StudentAvatar` réagit à `avatar_path` et remonte l’`<img>` si le chemin change ; session élève / `getStoredSession` conservent et propagent `avatar_path` (y compris fusion avec l’état précédent et champ `user`).
- **Modale profil / statistiques perso** : en-tête fixe avec bouton ✕ (comme les autres feuilles modales) et corps défilant — la croix reste visible en haut à droite pendant le scroll.
- **Mobile (débordement horizontal)** : chaîne flex avec `min-width: 0` sur `#root`, `#app`, en-tête, zones principales et pied de page ; `overflow-x: clip` + `overscroll-behavior-x: none` sous 1024px ; grille forum en une colonne sur petit écran ; champ réponse forum avec `min-width: 0` pour respecter la largeur utile.
- **Profils & utilisateurs (mobile)** : suppression des `gridTemplateColumns` inline qui surchargeaient le CSS — la page repasse bien en une colonne sur viewport ≤ 1023px (grilles profils/permissions, attribution, création, suppression).
- **Profils élèves (RBAC progression)** : la création/édition des profils supporte désormais `emoji`, `min_done_tasks` (niveau requis) et `display_order` (ordre d’affichage), avec synchronisation de la progression élève basée sur les attributs des rôles plutôt que sur `app_settings`.
- **Paramètres admin (progression)** : suppression des anciens réglages `progression.student_role_min_done_*` et de leur affichage UI, désormais remplacés par la configuration directe des profils.
- **Validation locale backend** : le script `test:local` exécute maintenant les suites de tests fichier par fichier avec réinitialisation BDD entre chaque fichier, pour éliminer les flakiness dues à l’état partagé (RBAC/permissions/sessions) et fiabiliser la passe complète.
- **Pipeline local unifié** : ajout d’une passe `smoke:local` qui enchaîne contrôle d’environnement, build et tests backend isolés pour valider rapidement l’état du projet avant livraison.
- **Smoke local paramétrable** : le script `local-smoke.js` accepte désormais `--fast` pour ignorer l’étape build tout en conservant les contrôles d’environnement et les tests backend isolés.
- **Rate-limit en environnement de test** : les limiteurs Express (`general` et `auth`) sont désormais ignorés lorsque `NODE_ENV=test` pour supprimer les faux positifs `429` sur les suites backend intensives.
- **Pool MySQL en test** : `queueLimit` passe en illimité (`0`) pendant les tests pour éviter les échecs intermittents `Queue limit reached` sur les scénarios volumineux.
- **Tâches (mode de validation)** : ajout du mode `completion_mode` (`single_done`/`all_assignees_done`) dans l’API et l’UI, avec recalcul de statut selon la progression réelle des assignés (`assignees_done_count` / `assignees_total_count`) et garde-fou sur `POST /api/tasks/:id/validate` (validation uniquement si la tâche est déjà `done`).
- **Affectation rapide professeur** : la vue tâches permet désormais une sélection multiple d’élèves pour l’affectation rapide sur une tâche, avec feedback sur le nombre de places disponibles et les affectations partielles.
- **Contenus texte éditables** : extension des réglages `content.*` pour personnaliser les textes Accueil/Auth, Visite, À propos et messages globaux (loader, indisponibilité serveur, préfixe version), avec fallback frontend local.
- **Tuiles tâches (titres de catégories)** : ajout d’un emoji préfixe sur tous les titres de sections (`Projets`, `Mes tâches`, `Propositions`, `En attente`, `Validées`, `Résultats filtrés`, etc.) pour harmoniser la lecture visuelle avec les statuts.
- **Build frontend (rafraîchissement local)** : régénération des bundles versionnés dans `dist/` via les workflows `build` et `deploy:prepare:fast` pour forcer la prise en compte des derniers assets côté déploiement.
- **Paramètres admin + profils (UX)** : l’API settings admin renvoie désormais la liste des profils de progression (hors `prof/admin`) affichée dans la section progression, et la vue `Profils & utilisateurs` adopte une mise en page responsive dédiée pour éviter les débordements sur écrans moyens/petits.
- **Statuts des tâches (icônes UI)** : remplacement des pastilles de statut `À faire` / `En cours` par les emojis `🔥` et `⚙️` dans les boutons d’action des tuiles, avec le même préfixe emoji ajouté aux titres de sections correspondants.
- **Carte (verrou repères UX)** : ajout d’un toast utilisateur lors de l’activation/désactivation du verrou de déplacement des repères pour confirmer immédiatement l’état courant.
- **Carte (labels repères)** : la taille des libellés de repères suit désormais le même calcul dynamique que les zones pour conserver un affichage homogène.
- **Barre de réactions compacte** : dans le forum et les commentaires contextuels, la barre de réactions affiche désormais uniquement le premier emoji en mode compact, puis se déplie au clic pour proposer toute la palette configurée.
- **Hygiène dépôt** : ajout d’une règle `.gitignore` pour exclure les archives locales de logs CI `ci-job-*-logs.zip`.
- **Maintenance BDD collectif** : ajout d’un script `db:collective:cleanup:audit` pour supprimer les tables `collective_*` et auditer la structure complète de la base à partir de `sql/schema_foretmap.sql`.
- **Sélecteur d’emojis zone/repère** : suppression du plafond de 400 emojis dans `parseEmojiListSetting`, afin d’afficher la liste complète configurée dans les fenêtres de création/édition.
- **Sélecteur d’emojis zones/repères (création + édition)** : la liste personnalisée `ui.map.location_emojis` est désormais fusionnée avec la base existante (au lieu de l’écraser), et la contrainte de longueur côté réglages a été retirée pour ne plus limiter la quantité affichable.
- **Scroll mobile des sélecteurs d’emojis** : ajout d’un conteneur à défilement vertical tactile dans les modales zone/repère pour éviter le blocage du scroll quand la liste d’emojis est longue.
- **Scroll mobile global + console Paramètres** : sécurisation du verrouillage de scroll `body` (lightbox) pour éviter les blocages persistants, et forçage de la vue `Paramètres admin` en colonne unique sur mobile/tablette avec débordements horizontaux neutralisés.

### Ajouté
- **PWA mobile installable (Android + iOS)** : finalisation du manifeste avec icônes PNG (`192/512` + `maskable`) et captures d'écran, ajout d'un bouton d'installation contextuel (événement `beforeinstallprompt`) dans l'en-tête, aide iOS "Ajouter à l'écran d'accueil", et synchronisation du cache service worker avec les nouveaux assets.
- **Réglages modules** : interrupteurs publics `ui.modules.forum_enabled` et `ui.modules.context_comments_enabled` (page Paramètres admin), refus API `503` quand désactivés, masquage onglet forum et blocs commentaires contexte côté UI.
- **Réglages publics (frontend)** : fusion après `GET /api/settings/public` des branches `ui.modules`, `ui.map` et `ui.auth` vers les objets `modules`, `map` et `auth` déjà consommés par l’app, pour appliquer les valeurs serveur après chargement.
- **Runner de tests isolés** : ajout de `scripts/test-local-isolated.js` pour orchestrer `db:init` + `node --test` sur chaque fichier `tests/*.test.js`, avec arrêt immédiat au premier échec.
- **Script smoke local** : ajout de `scripts/local-smoke.js` et de la commande `npm run smoke:local` pour exécuter un contrôle CI local reproductible en une seule commande.
- **Commande smoke rapide** : ajout de `npm run smoke:local:fast` pour les itérations locales fréquentes sans build frontend.
- **Migration rôles progression** : ajout de `migrations/041_roles_progression_fields.sql` pour introduire `roles.emoji`, `roles.min_done_tasks` et `roles.display_order` avec initialisation des rôles système.
- **Migration SQL tâches (mode collectif)** : nouvelle migration `040_task_completion_mode_and_assignment_done.sql` pour ajouter `tasks.completion_mode` et `task_assignments.done_at`, alignée avec le schéma principal.
- **Utilitaire frontend `content`** : ajout de `src/utils/content.js` pour lire de façon robuste les clés `content.*` et appliquer un fallback texte propre.
- **Carte (verrou repères)** : ajout d’un bouton `🔒/🔓 Repères` pour les profils autorisés afin de verrouiller/déverrouiller explicitement le déplacement des repères sur la carte.
- **Projets de tâches + mise en pause** : ajout des routes et du schéma associés à la gestion des projets de tâches et au statut `on_hold`, avec migration SQL dédiée et tests backend mis à jour.
- **Date de départ facultative des tâches** : ajout du champ `start_date` (UI + API + SQL) ; avant cette date, la tâche reste en attente et l’inscription élève est bloquée.
- **Commentaires contextuels multi-espaces** : ajout d’un module complet de commentaires (`/api/context-comments`) pour les contextes tâche/projet/zone avec pagination, suppression modérée, signalement anti-doublon, audit et diffusion temps réel Socket.IO.
- **Tables SQL de commentaires contextuels** : nouvelles tables `context_comments` et `context_comment_reports` avec index dédiés, suppression logique et contrainte FK de nettoyage des signalements.
- **Contrôle de concurrence sessions collectives** : ajout d’un versionnement optimiste (`collective_sessions.version`) avec `expectedVersion` sur les écritures, plus opérations bulk tâches/élèves pour les animations de séance.
- **RBAC rafraîchi + rôle visiteur système** : migration du catalogue de permissions/profils système (idempotente) et ajout du rôle `visiteur` par défaut pour durcir les parcours lecture seule.
- **Aide contextuelle UI (collégiens + prof/admin)** : ajout d’un socle d’aide produit côté frontend avec tooltips enrichis (`Tooltip`), panneau contextuel `?` par section (`HelpPanel`) et registre centralisé des messages (`src/constants/help.js`) différenciés selon le rôle.
- **Synchronisation sélective carte/visite** : ajout des endpoints `GET /api/visit/sync/options` et `POST /api/visit/sync` (prof, session élevée) avec import bidirectionnel ciblé des zones/repères entre carte principale et module visite.
- **Progression de profil élève configurable** : nouveaux réglages `progression.student_role_min_done_eleve_avance` et `progression.student_role_min_done_eleve_chevronne` avec synchronisation automatique du rôle principal élève selon le nombre de tâches validées.
- **Import visuel sélectif dans l’UI visite** : nouveau panneau enseignant dans la vue visite pour choisir les éléments à importer (zones/repères), direction du flux et exécuter la synchronisation sans quitter l’interface.
- **Forum global natif** : ajout d’un module forum complet (BDD `forum_threads/forum_posts/forum_reports`, routeur `routes/forum.js`, vue `src/components/forum-views.jsx`, onglet `Forum` élève/prof, événement temps réel `forum:changed`, tests backend `tests/forum.test.js` et documentation API associée).
- **Édition du profil connecté (API unifiée)** : ajout de `PATCH /api/auth/me/profile` avec vérification du mot de passe actuel, validation/normalisation des champs (`pseudo`, `email`, `description`, `affiliation`), contrôles d’unicité et journalisation d’audit.
- **Diagnostics problèmes site (MD + JSON)** : ajout des endpoints `GET /api/site-issues` et `GET /api/site-issues.json` pour exposer un inventaire centralisé des risques techniques potentiels (`docs/SITE_ISSUES.md`, `docs/SITE_ISSUES.json`).
- **Sélection de session “Collectif”** : ajout d’une sélection persistée des tâches et des élèves par session (`collective_session_tasks`, `collective_session_students`), avec API dédiée pour inclure/exclure les éléments sans perdre le contexte.
- **Vue “Collectif” (prof/admin)** : ajout d’une nouvelle vue `👥 Collectif` (desktop) pour piloter une session collective (présents/absents) et assigner/retirer des élèves sur les tâches par contexte (carte/projet), avec API `/api/collective/*` et migration `031_collective_sessions.sql`.
- **Audit admin + intégrité BDD** : nouveau script `scripts/ensure-admin-and-audit-db.js` (commandes `db:admin:audit` et `db:admin:audit:dry`) pour garantir que l’utilisateur critique (`oliviera9` par défaut) reste admin RBAC et pour contrôler la cohérence globale de la base (tables clés, rôles primaires, liens orphelins).
- **Réparation ciblée des assignations orphelines** : ajout de l’option `--fix-orphans` et de la commande `db:admin:audit:fix-orphans` pour neutraliser automatiquement les `task_assignments.student_id` sans élève existant (compatible `--dry-run`).
- **Mode de vue par rôle (prof/admin)** : ajout d’une bascule d’interface `vue élève` (prof + admin) et `vue prof` (admin), avec retour immédiat au rôle normal en un clic pour prévisualiser les parcours sans se déconnecter.
- **Bootstrap local en une commande** : ajout du script `npm run local:setup` (Docker MySQL + install deps + init BDD + check local).
- **Unification progressive des identités** : ajout d’une table canonique `users`, d’un script de backfill (`npm run db:backfill:users`) et de migrations dédiées (`027_users_unification_and_history.sql`, `028_admin_oliviera9_guard.sql`) pour converger sans rupture depuis `students`/`teachers`.
- **Historique structuré des actions utilisateur** : nouvelle table `security_events`, enrichissement de `audit_log` (acteur/résultat/payload), et journalisation étendue (auth succès/échec, élévation PIN, opérations RBAC, actions tâches).
- **Plan de validation migration users** : nouveau document `docs/USERS_MIGRATION.md` avec matrice de tests, contrôles SQL et critères de bascule.
- **RBAC complet configurable** : ajout d’un gestionnaire de profils (Admin, Prof, Élève chevronné, Élève avancé, Élève novice) avec permissions par profil, attribution utilisateur et élévation des droits via PIN de profil.
- **Schéma RBAC** : nouvelles tables `roles`, `permissions`, `role_permissions`, `role_pin_secrets`, `user_roles`, `elevation_audit` + migration `025_rbac_profiles.sql` et seed initial des profils.
- **API admin RBAC** : nouvelles routes `/api/rbac/*` pour gérer profils, permissions, PIN et affectation des rôles.
- **Page dédiée admin** : nouvelle vue frontend `Gestionnaire de profils` (onglet prof/admin) pour administrer noms de profil, droits, PIN et attributions.
- **Console “Paramètres admin”** : nouvelle interface GUI centralisée (onglet prof/admin) pour piloter l’accueil/auth, les modules UI, les cartes/plans (URL + upload image), et les actions d’exploitation (logs, debug OAuth, redémarrage).
- **Auth enrichie** : endpoint `/api/auth/elevate`, endpoint `/api/auth/me`, tokens JWT avec permissions effectives et statut `elevated`.
- **Auth élève par identifiant** : la connexion accepte désormais un champ unique `identifier` (pseudo ou email) avec compatibilité maintenue sur l’ancien format `firstName + lastName`.
- **Mot de passe oublié (élève + prof)** : nouveaux endpoints de reset (`forgot-password` / `reset-password`) avec email de réinitialisation, token fort hashé, expiration et usage unique.
- **Comptes prof email/mot de passe** : ajout de la table `teachers`, de l’auth prof par email (`POST /api/auth/teacher/login`) et conservation complète du mode PIN existant.
- **Service email SMTP** : nouveau module `lib/mailer.js`, variables `.env` associées, script `npm run db:seed:teacher`, et documentation API/README mise à jour.
- **UI authentification refondue** : écran de connexion en `identifiant + mot de passe`, lien `Mot de passe oublié`, et coexistence PIN / email côté modal prof.
- **Couverture de tests auth** : extension des tests backend auth et ajout d’un scénario e2e de connexion par pseudo/email.
- **Import élèves en masse (prof)** : ajout de `POST /api/students/import` pour importer des comptes élèves depuis un fichier CSV/XLSX, avec validation par ligne, mode simulation (`dryRun`) et rapport détaillé des erreurs.
- **Template élèves téléchargeable** : ajout de `GET /api/students/import/template` (CSV/XLSX) avec colonnes prêtes à l’emploi et une ligne d’exemple à remplacer/supprimer avant import.
- **UI prof — Gestion des élèves** : import/export/création/suppression déplacés dans l’onglet `Profils & utilisateurs` (`src/components/profiles-views.jsx`) pour centraliser l’administration.
- **Vue “Collectif” (prof/admin)** : nouvel onglet `Collectif` (tablette/desktop) pour activer une session par carte/projet, marquer des absences, et assigner/retirer des élèves sur les tâches (drag & drop ou boutons).
- **Tests import élèves** : nouveau fichier `tests/students-import.test.js` couvrant le template CSV, la simulation et la création réelle d’élèves.
- **Page Visite publique** : nouvelle expérience `Visite` accessible sans connexion depuis l’écran d’accueil, et via un onglet dédié placé avant « À propos » pour les utilisateurs connectés.
- **API visite dédiée** : nouveau routeur `routes/visit.js` (`/api/visit/content`, `/api/visit/progress`, `/api/visit/seen`) avec endpoints prof pour éditer les contenus zone/repère, gérer les médias de visite et sélectionner les tutoriels affichés.
- **Persistance vu/non-vu** : support connecté (BDD) et non connecté (cookie signé `anon_visit_token` + stockage serveur TTL 1 jour) pour conserver l’état même après fermeture de l’app.
- **Schéma visite** : nouvelles tables SQL (`visit_zone_content`, `visit_marker_content`, `visit_media`, `visit_tutorials`, `visit_seen_students`, `visit_seen_anonymous`) + migration `021_visit_public_flow.sql`.
- **Nouvelle vue frontend** : composant `src/components/visit-views.jsx` avec carte interactive, indicateurs rouge/vert, panneau de détails (sous-titre, description, bloc dépliable, galerie photo) et section tutoriels choisis par le professeur.
- **Tests visite** : nouveaux scénarios backend sur le contenu visite, la persistance anonyme via cookie signé et la persistance élève en base.

### Modifié
- **Propositions de tâches (édition auteur)** : un élève peut désormais modifier sa propre proposition (`status = proposed`) depuis l’UI, avec contrôle API strict pour empêcher la modification des propositions d’autrui et des champs réservés au mode professeur.
- **Visibilité des tâches côté élève** : la vue par défaut affiche désormais aussi les sections `En cours (déjà prises)` et `En attente de validation`, en plus des tâches disponibles et récemment validées.
- **Filtrage des tâches élève** : l’état “Résultats filtrés” s’active maintenant dès qu’un filtre est appliqué (texte, zone/repère, projet, statut, carte), pour éviter les listes incomplètes.
- **Filtres de tâches (zones + repères)** : la liste de filtrage des localisations inclut désormais aussi les repères de carte (`📍`) en plus des zones, avec un filtrage robuste par type (`zone`/`marker`) pour éviter les collisions d’identifiants.
- **Vue tâches (prof)** : ajout d’un bouton `⚡ Affectation rapide` sur chaque carte de tâche, avec état de chargement et messages contextuels pour expliquer pourquoi l’affectation est possible ou bloquée.
- **Attribution directe des tâches (prof/admin)** : ajout d’une affectation rapide d’élève depuis les tuiles de tâches (sélection d’un élève cible puis clic sur la tuile) et d’une attribution optionnelle dès la création de tâche.
- **Vue tâches (élève/prof)** : remplacement du libellé `Disponible` par `À faire`, exclusion des tâches `en cours` de la section `À faire` dès la première inscription, ajout d’une vue en tuiles animées (style tutoriels) et d’une bascule persistante `Tuiles/Liste`.
- **Emojis zones/repères configurables** : ajout du réglage public `ui.map.location_emojis` dans la console « Paramètres admin » ; les listes d’emojis utilisées en carte/visite (zones, repères et tâches liées au contexte) sont désormais pilotables dynamiquement, avec fallback robuste sur la liste par défaut.
- **Réactions emoji configurables** : le set de réactions forum/commentaires contextuels est désormais piloté par le réglage public `ui.reactions.allowed_emojis` (console paramètres admin), avec fallback robuste sur le set par défaut.
- **Accessibilité et compréhension des icônes** : harmonisation des boutons icône-only (header, carte, tâches, biodiversité, visite) avec `aria-label` explicites, infobulles cohérentes et activation pilotable via le nouveau réglage public `ui.modules.help_enabled`.
- **Console paramètres admin** : réorganisation des paramètres par sections (auth, modules, progression, sécurité, exploitation), ajout d’une recherche multi-critères et affichage des contraintes/valeurs par champ pour accélérer l’administration.
- **Temps réel Socket.IO** : retour au mode `websocket + polling` avec reprise de connexion renforcée (recovery serveur/client, fallback hors-ligne temporisé, réabonnement map) pour mieux tolérer les micro-coupures.
- **Statistiques élève** : affichage des paliers de progression dynamiques (labels/seuils issus de la config) et exposition API de la progression (`thresholds`, `steps`, rôle courant).
- **Profil utilisateur (prof/admin)** : la modale `Mon profil` passe par l’API unifiée `/api/auth/me/profile` et prend en charge les comptes prof/admin (nom affiché robuste, mise à jour immédiate de la session locale).
- **Badge utilisateur (en-tête)** : ouverture des modales stats/profil alignée sur l’utilisateur connecté (élève, prof ou admin) au lieu d’être limitée au parcours élève.
- **Accessibilité des modales et formulaires** : ajout d’un hook partagé `useDialogA11y` (focus initial, piège de focus, fermeture `Escape`, retour focus) et application sur les modales clés (profil/stats, carte, tâches, lightbox), avec labels/`htmlFor`/`aria-*` renforcés.
- **Navigation adaptative carte+tâches** : en grand écran, fusion des onglets carte/tâches en une entrée unifiée côté prof et élève, avec compteur de tâches contextualisé (à valider / assignées actives).
- **Formulaires tâches multi-liens** : normalisation des identifiants `zone_ids`/`marker_ids` (trim, dédoublonnage, comparaisons robustes) pour éviter les incohérences de sélection selon les cartes/projets.
- **Terminologie UI conditionnelle N3** : pour les comptes avec `affiliation = n3`, les libellés visibles `élève(s)` et `prof(esseur)(s)` sont remplacés en interface par `n3beur(s)` et `n3boss` (auth, profils, stats, tâches, collectif, audit, visite, paramètres, à propos), sans modifier les clés techniques backend/API.
- **Layout grand écran (prof + élèves)** : ajout d’un mode adaptatif qui fusionne `Carte` et `Tâches` sur une seule page quand la largeur disponible le permet (fallback automatique en onglets si l’espace devient insuffisant), extension de la zone utile en desktop et agrandissement de la carte en vue `Collectif`.
- **Inscription élève (UI)** : le formulaire demande désormais explicitement l’espace d’activité (`N3`, `Forêt comestible` ou `les deux`) via un sélecteur obligatoire, puis transmet ce choix (`affiliation`) à l’API d’inscription.
- **Connexion unifiée multi-rôles** : `POST /api/auth/login` devient l’unique endpoint de connexion (élève/prof/admin) via `identifier` + mot de passe, sans fallback legacy.
- **Mode professeur frontend** : la connexion email passe désormais par `/api/auth/login`, avec activation du mode prof selon la permission `teacher.access`.
- **Compat legacy supprimée** : les anciens endpoints de connexion prof (`/api/auth/teacher/login` et PIN global hors session) sont désactivés côté backend.
- **Bascule users-only** : suppression des accès backend aux tables `students`/`teachers` au profit de `users` (auth, RBAC, routes métier, scripts SQL/ops), ajout de la migration de coupure `029_users_only_cutover.sql` (repointage des FK + drop legacy).
- **Authentification élève** : suppression du login `firstName+lastName`, maintien du seul mode `identifier` (`email`/`pseudo`) + mot de passe.
- **Couverture de tests migration users** : adaptation des tests backend critiques (`auth`, `api`, `students-delete`, `students-import`, `new-features`, `observations-images`) aux requêtes et payloads `users`.
- **Compatibilité applicative migration users** : double lecture/écriture côté backend et frontend (session unifiée `foretmap_session`, JWT enrichi avec `canonicalUserId`, fallback legacy maintenu).
- **Traçabilité des tâches/stats** : ajout de `student_id` sur `task_assignments`/`task_logs` avec fallback nominal maintenu pour rétrocompatibilité.
- **Durcissement admin prod** : garde-fou explicite pour conserver les droits admin de l’identité canonique `oliviera9` lors des migrations.
- **Protection des routes sensibles** : remplacement de la logique binaire `requireTeacher` par des permissions RBAC explicites sur zones, tâches, plantes, stats, audit, visite, observations, tutoriels et gestion élèves.
- **Flux professeur** : la saisie du PIN devient une élévation de session post-connexion (compatibilité PIN historique conservée en secours).
- **Gating UI** : affichage/activation conditionnelle de plusieurs actions prof selon permissions réelles et statut d’élévation.
- **Configuration dynamique** : ajout d’une couche `app_settings` persistée en BDD (`/api/settings/public`, `/api/settings/admin/*`) pour remplacer des options front hardcodées.
- **Cartes multi-paramètres** : enrichissement `maps` avec `is_active` et `frame_padding_px`, exposés via API et consommés par l’UI.
- **Visite/tâches complètement dissociées** : la visite utilise désormais ses propres entités (`visit_zones`, `visit_markers`) avec outils professeur dédiés pour créer/éditer/supprimer zones et repères directement sur la carte de visite, sans dépendre des zones/repères du système de tâches.
- **Panel emojis centralisé et enrichi** : création de `src/constants/emojis.js`, remplacement des listes locales, ajout d’emojis biodiversité, techno et école pour les repères (tâches/visite) et formulaires liés.
- **Navigation/auth** : ajout d’un CTA « Visiter sans connexion » dans l’écran d’authentification et intégration de l’onglet `Visite` dans les navigations élève/prof.

### Corrigé
- **Carte (cohérence labels zones/repères)** : le texte des repères adopte maintenant le même style visuel que les zones (typographie, contraste et lisibilité), en supprimant le badge sombre qui créait un rendu différent.
- **Paramètres cartes réellement appliqués** : la carte par défaut est maintenant réappliquée lors du chargement des réglages publics et lors des changements de contexte (élève/prof/visite), et les cartes inactives (`is_active = false`) sont exclues des sélecteurs utilisateur (visite + tâches) pour respecter la configuration admin.
- **Chargement initial résilient (prod)** : l’écran n’est plus vidé si un endpoint API échoue (ex. `map_id` invalide) ; chaque ressource retombe sur une valeur de secours et la carte active est automatiquement reroutée vers une carte valide.
- **Inscrits visibles pour les élèves** : `GET /api/tasks` renvoie de nouveau les participants d’une tâche pour les élèves non visiteurs (noms/prénoms), tout en conservant la restriction lecture seule pour le rôle visiteur.
- **Statuts tâches (API + notifications prof)** : normalisation robuste des statuts invalides/vides en `available` côté lecture/édition, et notifications “propositions élèves” enrichies pour n’alerter que lors de vrais changements de liste.
- **Paramètres admin (mobile)** : rétablissement du scroll vertical et refonte responsive des blocs en colonne unique sur smartphone (sections paramètres, cartes/plans et actions système) pour éviter les blocages de navigation tactile.
- **Durcissement anti-bugs full stack (tâches/auth/realtime)** : sécurisation des actions élève sur les tâches (`assign`/`done`/`unassign`) avec contrôle d’identité/session, uniformisation des erreurs 500 pour éviter les fuites de messages internes, rafraîchissement réactif des claims de session côté commentaires contextuels, robustesse accrue du client API sur réponses vides/non-JSON, et stabilisation des effets asynchrones carte/temps réel (photo gallery + subscriptions map).
- **Ordre de navigation principal (prof)** : réorganisation des onglets en `Cartes & tâches`, `Carte`, `Tâches`, `Biodiversité`, `Tuto`, `Forum`, `Stats`, `Visites` pour aligner le parcours demandé.
- **Onglets Carte/Tâches (desktop)** : suppression de la fusion automatique grand écran ; `Carte & Zones` affiche uniquement la carte et `Tâches` affiche uniquement les tâches, aligné sur le comportement smartphone.
- **Persistance de l’onglet actif** : après un rafraîchissement de page, l’application conserve désormais l’onglet en cours via stockage local (`foretmap_active_tab`) au lieu de revenir systématiquement sur `Cartes`.
- **Carte mobile (déplacement)** : les gestes carte sont de nouveau actifs par défaut en mode vue sur mobile, sans réverrouillage automatique après inactivité.
- **Centre de notifications (clic)** : le panneau de notifications est désormais affiché en couche fixe sous l’en-tête, ce qui restaure l’ouverture/clic sur mobile et desktop quand le badge est visible.
- **Catalogue biodiversité (photos)** : affichage des vignettes en bande horizontale avec défilement latéral pour éviter l’empilement vertical sur écran étroit.
- **Crash frontend (React #310)** : stabilisation de l’ordre des hooks dans `App` en rendant `useDialogA11y` inconditionnel, ce qui supprime l’écran “Une erreur s’est produite / Recharger la page” au changement d’état de chargement/session.
- **Service worker (schémas non HTTP)** : les requêtes `chrome-extension://` (et autres schémas non supportés) sont désormais ignorées dans le cache runtime pour éviter l’exception `Failed to execute 'put' on 'Cache'`.
- **Service worker (mise à jour forcée)** : passage du cache offline en `foretmap-offline-v2`, stratégie `network-first` pour les bundles JS/CSS et `Cache-Control: no-store` sur `/sw.js` pour réduire les cas de frontend bloqué sur des assets obsolètes après déploiement.
- **Résilience API Express (async)** : les erreurs des handlers asynchrones sont désormais redirigées vers le middleware d’erreur centralisé, évitant un `unhandledRejection` fatal et une indisponibilité complète du site en cas d’erreur BDD.
- **Carte (repères interactifs)** : conversion des pastilles de repère en boutons clavier/accessibles, avec libellés contextuels et styles `focus-visible` pour améliorer la navigation non tactile.
- **Modales zone/repère (ordre des actions)** : réorganisation de sections dans les vues prof pour privilégier la lecture des liaisons existantes avant l’action de liaison, sans changer la logique métier.
- **Affichage grand écran** : stabilisation de la barre de navigation élève (hauteur maîtrisée et non-expansive), alignement de l’espace réservé (`main`/`toast`) sur la hauteur réelle de menu, et densification légère desktop des champs/boutons/onglets pour réduire l’effet visuel trop “gros” sans régression mobile.
- **Navigation carte mobile (refonte gestes)** : extraction de la logique tactile dans un hook dédié avec stratégie mobile explicite (carte passive par défaut, bouton d’activation des gestes, réverrouillage auto après inactivité), pour supprimer les blocages de scroll tout en conservant le zoom/pan volontaire.
- **Carte mobile (gestes tactiles)** : en mode vue non zoomé, le glissement à un doigt privilégie désormais le scroll de page (et conserve le zoom/pan carte à deux doigts), pour éviter les blocages de navigation sur smartphone.
- **Carte mobile (repères)** : augmentation légère de la taille des icônes de repère sur smartphone pour restaurer la lisibilité, tout en conservant un rendu plus compact que la taille historique initiale.
- **Carte mobile (repères lisibilité)** : agrandissement supplémentaire des repères tactiles (pastille, emoji, zone de touche) et du badge d'état pour améliorer la lecture et le ciblage sur portable.
- **Carte mobile (repères lisibilité ++)** : augmentation additionnelle de la taille des repères sur petit écran et alignement visuel des titres de repères avec la taille des labels de zones.
- **Vue “Collectif” (prof/admin)** : blocage préventif des actions refusées côté API (inscription sur tâche pleine/terminée/validée/proposée, retrait sur tâche terminée/validée), avec feedback explicite pour éviter les erreurs inutiles en séance.
- **Accès stats (admin/prof)** : l’icône de profil (badge utilisateur en haut à droite) ouvre désormais la page `📊 Stats` en vue professeur/admin, au lieu de rester inactive.
- **En-tête prof/admin (mobile)** : suppression du débordement horizontal en petite largeur (conteneur d’actions contraint et scroll interne) et réaffichage de l’avatar/logo utilisateur dans le badge stats, avec libellé nom fiable (plus de fallback intempestif sur « Utilisateur »).
- **Connexion Google (UI)** : simplification du libellé du bouton de connexion pour n’afficher que `Continuer avec Google` (sans parenthèses de domaines) en mode élève et professeur.
- **Badge de version (en-tête)** : le badge de version en haut de page n'est plus affiché pour les élèves (visible uniquement en mode professeur).
- **Profil utilisateur explicite** : la vue `Mon profil` affiche désormais clairement le type de profil (`admin`, `prof` ou `eleve`) pour éviter l’ambiguïté sur les droits actifs.
- **Modales stats/profil** : amélioration de la fermeture des fenêtres (bouton accessible + arrêt de propagation du clic) pour éviter les fermetures involontaires.
- **Navigation mobile** : meilleure lisibilité des libellés d’onglets avec retour à la ligne contrôlé sur petits écrans.
- **Session prof et vues stats** : correction du décodage JWT base64url (padding inclus), revalidation `/api/auth/me` au démarrage pour resynchroniser les permissions, et suppression des loaders infinis sur les vues statistiques en cas d’erreur API.
- **Build serveur sans Vite** : `npm run build` devient tolérant en production sans dépendances dev ; si `vite` est absent mais `dist/` est déjà présent, la commande ne casse plus (`scripts/build-safe.js`).
- **Bootstrap local MySQL** : `local:setup` attend désormais explicitement la disponibilité du serveur MySQL (`scripts/wait-mysql-ready.js`) avant `db:init`, évitant les échecs aléatoires de type `PROTOCOL_CONNECTION_LOST`.
- **Environnement local** : suppression de la configuration npm qui omettait les dépendances dev par défaut, ce qui bloquait `supertest` et `@playwright/test` après un `npm install` standard.
- **E2E local** : Playwright démarre automatiquement l’application hors CI (`db:init` + `npm start`) et bloque les service workers pour éviter les caches obsolètes.
- **Helpers e2e auth** : attente explicite du champ `Prénom` après bascule “Créer un compte” pour réduire les faux timeouts.
- **Sécurité stats élève** : `GET /api/stats/me/:studentId` exige désormais une session authentifiée et limite l’accès au propriétaire (élève) ou aux rôles autorisés (`stats.read.all`).
- **Sécurité carnet d’observations** : suppression de la confiance dans `studentId` envoyé par le client ; lecture/création/suppression et accès image reposent maintenant sur l’identité JWT (propriétaire ou professeur autorisé).
- **Fuite d’affectations sur les tâches** : `GET /api/tasks` ne charge plus toutes les assignations globales ; filtrage SQL par `task_id` et exposition réduite selon le rôle.
- **Migrations SQL** : arrêt explicite sur erreur non idempotente au lieu d’avancer silencieusement la version de schéma.
- **Résilience process** : en cas de `uncaughtException` / `unhandledRejection`, le serveur journalise en fatal puis s’arrête proprement (`exit 1`) pour éviter un état incohérent.
- **Endpoints admin** : retrait du secret en query string pour `/api/admin/logs` et `/api/admin/oauth-debug` (header `x-deploy-secret` uniquement).
- **Frontend carte** : correction d’un `ReferenceError` (`isMine`) dans les modales d’inscription aux tâches liées zone/repère.
- **Outillage tests** : script `npm test` rendu portable (`node --test \"tests/*.test.js\"`) et ajout de `@playwright/test` dans les dépendances de développement.
- **Connexion multi-profils** : suppression du blocage `Type de compte non pris en charge` sur `/api/auth/login`; la session est désormais résolue via le rôle RBAC principal pour accepter les comptes élève/prof/admin.
- **PIN et droits natifs** : les rôles `admin` et `prof` accèdent désormais à leurs droits natifs sans code PIN ; le PIN ne sert plus qu’à l’élévation temporaire des droits.
- **Accès admin profils/utilisateurs** : l’onglet professeur affiche désormais `Profils & utilisateurs` dès qu’un rôle possède les permissions RBAC concernées (`admin.roles.manage` ou `admin.users.assign_roles`), même avant élévation PIN.
- **Statut des tâches à l'inscription** : une tâche passe désormais en `en cours` dès la première prise en charge élève (même si `required_students > 1`) ; le recalcul `unassign` reste cohérent (`available` seulement quand il ne reste aucune assignation).
- **Retrait de tâche (élève)** : `POST /api/tasks/:id/unassign` n’exige plus le JWT professeur, comme `assign` et comme l’UI « Me retirer » ; corrige le `401 Unauthorized` en production.
- **Garde-fou anti-lockout admin** : `PUT /api/rbac/users/:userType/:userId/role` bloque la rétrogradation du dernier administrateur actif.

### Modifié
- **Navigation Tuto (élève/prof)** : l’onglet `Tuto` affiche désormais une vraie liste consultable (cartes animées), avec aperçu intégré et actions de téléchargement HTML/PDF.
- **Tâches** : ajout du champ `tutorial_ids` sur création/édition de tâche, affichage des tutoriels liés dans les cartes de tâches et sélection multi-tutoriels dans le formulaire prof.
- **Liste des tâches** : pastille de statut discrète (rouge/orange en fondu pulsé pour à faire / en cours, vert fixe pour terminée ou validée), avec libellé accessible au survol et pour les lecteurs d’écran.
- **Carte (zones/repères)** : ajout des pastilles de statut des tâches directement sur la carte (rouge/orange en fondu, vert fixe), avec agrégation par priorité quand plusieurs tâches sont liées au même élément.
- **Contraste des statuts** : teinte orange “en cours” renforcée (`#f59e0b`) pour mieux se distinguer du rouge “à faire”, en vue tâches et sur la carte.
- **Préparation de déploiement** : exécution du workflow build local `npm run deploy:prepare` pour générer `dist/` et l’archive de livraison.

### Ajouté
- **Catalogue tutoriels enrichi** : intégration de 6 nouveaux tutoriels HTML du dossier `tutos/` (`associations`, `compost`, `eau`, `semences`, `sol`, `sol-vivant`) via seed SQL et migration `021_add_new_tutorials_seed.sql`.
- **Module Tutoriels complet** : nouveau routeur `routes/tutorials.js` (`GET/POST/PUT/DELETE`, rendu HTML, téléchargement HTML et PDF généré à la volée), nouveau composant frontend `src/components/tutorials-views.jsx`, et exposition statique du dossier `tutos/`.
- **Schéma tutoriels + lien avec tâches** : ajout des tables `tutorials` et `task_tutorials` (migration `020_tutorials_and_task_links.sql`), avec seed initial des 4 tutoriels HTML du dossier `tutos/`.
- **Tests tutoriels** : nouveau fichier `tests/tutorials.test.js` couvrant la lecture, les droits prof, les téléchargements HTML/PDF et l’association `tutorial_ids` lors de la création d’une tâche.
- **Tâches multi-zones / multi-repères** : tables `task_zones` et `task_markers`, API `zone_ids` / `marker_ids`, formulaire prof avec cases à cocher (plusieurs zones et repères sur la même carte), liens/déliens depuis la carte sans écraser les autres associations ; migration `019_task_zones_markers_multi.sql`.
- **Réconciliation des uploads orphelins** : nouveau script `scripts/reconcile-orphan-uploads.js` + commandes `db:uploads:reconcile:dry` et `db:uploads:reconcile` pour détecter/supprimer les fichiers orphelins sous `uploads/` (mode dry-run par défaut, scope géré sécurisé) ; tests dans `tests/uploads-reconcile-script.test.js`.
- **Audit consolidé bugs/incohérences** : ajout de `docs/AUDIT_BUGS_INCOHERENCES.md` avec une matrice unique des constats (sécurité, médias, temps réel, documentation) et priorisation d'actions.
- **Affectation des tâches depuis la carte** : ajout du lien direct tâche↔zone et tâche↔repère depuis les modales carte (onglets/actions dédiés en mode prof), avec support backend `marker_id` sur les tâches.
- **Associations multiples d’êtres vivants** : les zones et repères acceptent désormais plusieurs êtres vivants associés (`living_beings`), avec conservation d’un être vivant principal pour compatibilité UI/API.
- **Multi-cartes (Forêt + N3)** : ajout du support de cartes multiples avec entité `maps`, `map_id` sur zones/repères/tâches, switch de carte dans l’UI, création de zones/repères contextualisée, filtrage des tâches par carte (avec option toutes cartes) et route `GET /api/maps`.
- **Carte N3 réelle** : intégration du plan image `public/maps/plan n3.jpg` comme fond de la carte `N3`.
- **Import biodiversité (UI prof)** : ajout d’un bouton `Télécharger template complet` (toutes les colonnes `plants`) en complément du template vierge.
- **Template vierge téléchargeable (import biodiversité)** : ajout d’un bouton mode prof pour télécharger un CSV vierge prêt à remplir, plus le fichier `docs/templates/plants-import-template-vierge.csv`.
- **Import biodiversité (prof)** : ajout de la route `POST /api/plants/import` (CSV/XLSX/Google Sheet), stratégies `upsert_name|insert_only|replace_all`, mode prévisualisation (`dryRun`) et rapport d’erreurs ligne/champ.
- **Guide + templates d’import biodiversité** : ajout de `docs/IMPORT_BIODIVERSITE.md` et des fichiers `docs/templates/plants-import-template.csv` + `docs/templates/plants-import-template-minimal.csv`.
- **Migration 014 photos biodiversité (curation manuelle)** : ajout de `migrations/014_plants_manual_photo_links_curated.sql` avec un jeu de liens directs `Special:FilePath` sélectionnés manuellement pour `Menthe` et les espèces récemment corrigées, sans auto-résolution heuristique.
- **Corrections scientifiques ciblées `plants`** : ajout de `migrations/013_plants_scientific_fixes.sql` (températures invalides corrigées, noms scientifiques normalisés pour certaines espèces, fiche `Menthe` complétée).
- **Consolidation des sources biodiversité** : ajout du script `scripts/consolidate-plants-sources.js` (+ commandes `db:plants:sources:consolidate:dry` et `db:plants:sources:consolidate`) pour vérifier les liens `sources`, retirer les URLs injoignables et enrichir avec des références fiables (Wikipedia/Wikidata) cohérentes avec l’espèce.
- **Migration photo* direct-only** : ajout de `migrations/012_plants_photo_links_direct_only.sql` pour ne conserver en base que des URLs photo directes (`.jpg/.png/...` ou `Special:FilePath`) et neutraliser les liens non compatibles.
- **Résolution auto des photos biodiversité** : ajout du script `scripts/resolve-plants-photo-direct-links.js` (+ commandes `db:plants:photos:direct:dry` et `db:plants:photos:direct`) pour rechercher automatiquement des images Wikimedia cohérentes et remplacer les liens `photo*` non directs dans la table `plants`.
- **Migration plantes depuis Excel (data-only)** : ajout de `migrations/010_plants_excel_data_only.sql` pour synchroniser le référentiel biodiversité (mise à jour des plantes existantes par `name`, insertion des nouvelles entrées) sans modifier le schéma.
- **Déploiement serveur 100% automatisé (cron)** : ajout du script `scripts/auto-deploy-cron.sh` (fetch/pull conditionnel, redémarrage sécurisé via `DEPLOY_SECRET`, check post-déploiement, lock anti-concurrence) et documentation d’activation dans `docs/EXPLOITATION.md` avec exemple cron robuste (`mkdir -p logs` + chemin `scripts/` explicite).
- **Filtre Biodiversité par grand groupe** : ajout d’un sélecteur “Grand groupe” (champ `group_1`) dans les vues élève/prof, combinable avec la recherche texte.
- **Profil utilisateur enrichi** : ajout des champs `pseudo`, `email`, `description` avec édition côté élève, validations backend/frontend et visibilité publique limitée (`pseudo` + `description`).
- **Avatar élève** : avatar par défaut généré via DiceBear (seed pseudo/nom) et possibilité de photo de profil personnalisée (upload image `png/jpg/webp`, stockage disque sous `uploads/students`, option de retour au défaut DiceBear).
- **Scénario e2e retrait de tâche** : ajout de `e2e/tasks-unassign-flow.spec.js` pour couvrir le parcours élève “Je m’en occupe” -> “Me retirer”.
- **Scénarios e2e complets** : ajout de `e2e/tasks-full-cycle.spec.js` (création prof -> prise élève -> soumission -> validation prof) et `e2e/photos-upload-delete.spec.js` (upload/suppression photo de zone).
- **Couverture e2e renforcée** : ajout d’un scénario Playwright `teacher-auth-invalid-pin.spec.js` pour sécuriser le cas d’erreur PIN prof.
- **Tests UI smoke Playwright** : ajout de l’infrastructure e2e (`playwright.config.js`, `e2e/fixtures/auth.fixture.js`) et de 3 specs critiques (auth/navigation élève, carte prof, parcours tâches).
- **Modularisation frontend (stats/audit/about)** : nouveaux modules `src/components/stats-views.jsx`, `src/components/audit-views.jsx`, `src/components/about-views.jsx` avec imports dédiés dans `src/App.jsx`.
- **Modularisation frontend (carte complète)** : `src/components/map-views.jsx` devient le module réel du domaine carte (`MapView`, `ZoneInfoModal`, `ZoneDrawModal`, `MarkerModal`, `PhotoGallery`, `Lightbox`) avec imports mis à jour côté app.
- **Checklist UI post-modularisation** : ajout d’une section dédiée dans `docs/EXPLOITATION.md` pour valider rapidement les parcours prof/élève après découpage frontend.
- **Tests images observations** : nouveau fichier `tests/observations-images.test.js` couvrant la lecture d’image observation sur disque et le cas fichier manquant (`404`).
- **Migration SQL de retrait legacy** : nouvelle migration `migrations/006_drop_legacy_image_data.sql` pour supprimer `image_data` de `zone_photos` et `task_logs` après bascule complète.
- **Compatibilité outils post-bascule** : les scripts `image-migration-report` et `migrate-images-to-disk` détectent désormais l’absence des colonnes legacy et passent en mode no-op explicite.
- **Documentation d'exploitation production** : nouveau guide `docs/EXPLOITATION.md` avec checklist post-déploiement (`deploy:check:prod`), procédure lock o2switch et séquence complète de bascule images.
- **Modularisation frontend (tâches)** : nouveau module `src/components/tasks-views.jsx` pour isoler `TasksView`, `TaskFormModal`, `LogModal`, `TaskLogsViewer`, en conservant une façade de compatibilité via `src/components/foretmap-views.jsx`.
- **Façade carte dédiée** : ajout de `src/components/map-views.jsx` et adoption dans `src/App.jsx` pour préparer l'extraction progressive du domaine carte.
- **Déploiement prod sans arguments** : nouvelle commande `npm run deploy:check:prod` (base URL hardcodée sur `https://foretmap.olution.info`) pour les environnements qui ne permettent pas de passer `--base-url`.
- **Reporting migration images** : nouveau script `scripts/image-migration-report.js` + commande `db:migrate:images:report` pour mesurer les reliquats `image_data` avant la bascule finale.
- **Vérification post-déploiement** : script `scripts/post-deploy-check.js` + commande `npm run deploy:check` pour contrôler `/api/health`, `/api/health/db` et `/api/version` après publication.
- **Migration images progressive** : nouveau script `scripts/migrate-images-to-disk.js` + commandes `db:migrate:images:dry`, `db:migrate:images`, `db:migrate:images:clear` pour convertir `image_data` vers `image_path` sur `zone_photos` et `task_logs` sans rupture immédiate.
- **Tests script migration images** : `tests/images-migration-script.test.js` (parse des flags et génération des chemins cible).
- **Tests sécurité/admin/images** : nouveau fichier `tests/security-admin-images.test.js` couvrant les accès prof sans token/avec token invalide, la protection de `POST /api/admin/restart` et la rétrocompatibilité `image_data` pour les images legacy.
- **Préparation de déploiement** : script PowerShell `scripts/prepare-dist-deploy.ps1` pour automatiser install dépendances, build Vite et génération d’une archive ZIP prête à uploader (`deploy/`). Scripts npm associés : `deploy:prepare` et `deploy:prepare:fast`.
- **Frontend Vite** : application React dans `src/` (`App.jsx`, `components/foretmap-views.jsx`, `services/api.js`, `hooks/useForetmapRealtime.js`, `constants/`, `utils/`), entrée `index.vite.html` / `src/main.jsx`, styles `src/index.css` ; client Socket.IO via `socket.io-client` (devDependency npm, bundlé par Vite). Script `npm run dev:client` (Vite) ; proxy dev `/api` et `/socket.io` dans `vite.config.js`.
- **CI** : étape `npm run build` après les tests pour valider le bundle.
- **GET /api/admin/logs** : dernières lignes Pino via tampon mémoire (secret `DEPLOY_SECRET`, header `X-Deploy-Secret`) ; option `LOG_BUFFER_MAX_LINES` ; module [`lib/logBuffer.js`](lib/logBuffer.js). Doc [docs/API.md](docs/API.md), [README](README.md), [.env.example](.env.example). Tests dans `tests/api.test.js`.
- **Mode prof** : indicateur discret du temps réel (point coloré dans l’en-tête + infobulle : connecté, connexion, hors ligne, client absent).
- **Dependabot** : [`.github/dependabot.yml`](.github/dependabot.yml) (npm, hebdomadaire, regroupement patch/mineures, PR séparées pour les majeures) ; section *Dépendances npm* dans le [README](README.md).
- **Temps réel (Socket.IO)** : serveur HTTP + `socket.io` sur `/socket.io` ; événements `tasks:changed`, `students:changed`, `garden:changed` émis après les mutations concernées (tâches, auth inscription, élèves, zones/photos, plantes, marqueurs).
- **Frontend (comportement inchangé)** : après connexion élève, rafraîchissement ciblé des tâches / jardin (debounce) ; événement DOM `foretmap_realtime` pour recharger les stats prof ; reconnexion → `fetchAll()`. Polling ~30 s conservé en secours.
- **Tests** : `tests/realtime.test.js`.
- **Documentation** : section *Temps réel* dans [docs/API.md](docs/API.md).
- **Page À propos** : nouvel onglet (élève/prof) avec description de l'application, version affichée, mention de l'auteur, liens de documentation locaux (`/README.md`, `/CHANGELOG.md`, `/docs/*`) et lien global vers le dépôt GitHub.

### Modifié
- **Sécurité observations** : restriction de `GET /api/observations/student/:studentId` (prof ou élève concerné) et de `DELETE /api/observations/:id` (prof ou propriétaire) pour limiter l'IDOR et les suppressions non autorisées.
- **Suppression de zone** : purge explicite des fichiers photos associés avant suppression SQL afin d'éviter les fichiers orphelins sur disque.
- **Règle Cursor frontend** : `.cursor/rules/foretmap-frontend.mdc` alignée sur la stack réelle React + Vite (`src/`, `dist/`) pour éviter les corrections erronées de type legacy UMD.
- **Affichage carte responsive** : ajout d’un padding configurable par carte (`frame_padding_px` si fourni, sinon défaut par carte) pour mieux adapter le cadre d’affichage aux dimensions des plans, notamment N3.
- **Cartes multi-zones (correctif compatibilité)** : fallback robuste des fonds de carte côté frontend (ordre de secours N3/Forêt), normalisation des URLs `/api/maps` et migration `016_maps_image_urls_backfill.sql` pour éviter la disparition visuelle des zones en cas de déploiement partiel ou d’URL historique.
- **Mode prof biodiversité** : ajout d’un panneau d’import dans `PlantManager` pour charger un CSV/XLSX ou une URL Google Sheet avec choix de stratégie, prévisualisation et rapport détaillé.
- **Script résolution photos biodiversité** : remplacement des appels `fetch` (undici/Wasm) par `http/https` natif Node dans `scripts/resolve-plants-photo-direct-links.js` pour éviter les erreurs mémoire sur hébergement contraint (CloudLinux/LVE).
- **Biodiversité (liens photos stricts)** : validation backend renforcée sur `POST/PUT /api/plants` pour accepter uniquement des URLs d'image directes (et rejeter les pages/catégories), avec consigne explicite dans le formulaire prof.
- **Check post-déploiement (`deploy:check:prod`)** : ajout d’un `User-Agent` explicite et d’un retry léger sur HTTP `429` (respect de `Retry-After`) pour fiabiliser les vérifications derrière proxy/CDN.
- **Photos biodiversité (Wikimedia Category)** : résolution automatique côté frontend d’une image représentative pour les liens `commons.wikimedia.org/wiki/Category:...` (API Wikimedia), afin de réafficher des miniatures au lieu de simples liens.
- **Photos biodiversité (liens cassés)** : rendu frontend durci pour afficher en vignette uniquement les URLs d’images directes ; les pages (ex. Wikimedia `Category`) restent des liens cliquables pour éviter les miniatures cassées.
- **Nettoyage BDD photo*** : ajout de `migrations/011_plants_photo_links_cleanup.sql` (normalisation des champs photo, placeholders vides -> `NULL`, upgrade `http` -> `https`, conversion des liens Wikimedia `/wiki/File:` vers `/wiki/Special:FilePath/`).
- **Mise à jour automatique frontend** : service worker amélioré pour activer immédiatement une nouvelle version (`SKIP_WAITING`), vérifier les updates au retour onglet actif et recharger automatiquement quand le nouveau worker prend le contrôle.
- **Stratégie de cache HTML** : `/` et `/index.html` passent en `network-first` pour éviter de rester bloqué sur une ancienne interface quand le réseau est disponible.
- **Version affichée fiable** : route `GET /api/version` lit désormais `package.json` à chaque requête (fallback sécurisé sur la version de démarrage) pour refléter la version réellement déployée.
- **Retour utilisateur MAJ** : ajout d’un toast « Nouvelle version installée. » et d’un badge persistant `vX.Y.Z` dans l’en-tête.
- **Script auto-deploy cron** : ajout d’un garde-fou qui bloque le déploiement si des fichiers frontend (`src/`, Vite/public) changent sans mise à jour de `dist/` (build local obligatoire avant push).
- **Terminologie UI/docs** : renommage de l’onglet « Plantes » en « Biodiversité » et harmonisation des libellés vers « biodiversité » / « êtres vivants » selon le contexte (frontend, docs API/README, tests e2e).
- **Déploiement runtime local** : ajout d'un script `deploy:prepare:runtime` pour préparer un bundle complet (`dist` + `node_modules` prod) afin d'éviter les erreurs de build/install sur serveur (`vite` introuvable, locks panel).
- **Sécurité photos plantes** : validation backend des champs photo* avec rejet des URLs invalides et obligation HTTPS sur POST/PUT /api/plants.
- **Sécurité HTTP** : ajout d'une politique Content-Security-Policy côté serveur pour restreindre img-src aux sources sûres ('self', https:, data:, blob:).
- **Catalogue plantes (sources)** : le champ sources affiche désormais des noms de domaine cliquables (labels lisibles) au lieu des URLs brutes.
- **Catalogue plantes (photos)** : les champs URL photo (photo*) sont maintenant rendus en miniatures élégantes avec ouverture en lightbox au clic, au lieu de simples liens texte.
- **Durcissement Playwright** : configuration e2e stabilisée en CI (`workers=1`, `globalTimeout`, `forbidOnly`) et helpers de navigation/auth renforcés.
- **Diagnostic CI e2e** : dump explicite des logs serveur en cas d’échec dans `.github/workflows/ci.yml`.
- **CI** : le workflow `.github/workflows/ci.yml` exécute désormais les tests Playwright smoke après build, avec démarrage applicatif, attente santé et upload d’artefacts en cas d’échec.
- **Documentation d’exploitation/dev** : ajout des consignes d’exécution Playwright (`README.md`, `docs/LOCAL_DEV.md`, `docs/EXPLOITATION.md`) et mise à jour de l’état réel dans `docs/EVOLUTION.md`.
- **Script deploy check** : ajout de `--image-check-path` optionnel (200/404 acceptés, non bloquant) + test associé.
- **Allègement façade historique** : `src/components/foretmap-views.jsx` recentré sur les composants restants après extraction des vues stats/audit/about.
- **Skill évolution Cursor** : mise à jour de `.cursor/skills/foretmap-evolution/SKILL.md` pour refléter l’état actuel du projet.
- **Modularisation frontend** : `src/components/foretmap-views.jsx` est allégé en retirant les composants carte vers `src/components/map-views.jsx` tout en conservant le comportement existant.
- **Tests deploy check** : `tests/post-deploy-check-script.test.js` étendu avec scénarios HTTP réels (`requestJsonWithTimeout`, `checkEndpoint`).
- **Script deploy check** : `scripts/post-deploy-check.js` exporte désormais `requestJsonWithTimeout` et `checkEndpoint` pour améliorer la testabilité.
- **API/Frontend en mode disk-only** : suppression du fallback de lecture `image_data` pour les images zones et logs de tâches ; les endpoints image servent uniquement les fichiers `image_path` (ou 404).
- **Schéma de référence** : `sql/schema_foretmap.sql` aligné sur le mode disk-only (colonnes `image_data` retirées de `zone_photos`/`task_logs`).
- **Migration SQLite -> MySQL** : conversion des anciennes images base64 en fichiers disque lors de l’import, avec écriture de `image_path`.
- **Tests images** : fin des scénarios fallback legacy, remplacement par des scénarios disk-only (lecture fichier, fichier manquant, scripts post-retrait).
- **Flux image tâches** : `POST /api/tasks/:id/done` persiste désormais directement en mode disk-only (écriture fichier puis `image_path`), sans dépendance legacy `image_data`.
- **Couverture de tests migration images** : ajout de scénarios intégration pour fallback legacy `task_logs.image_data`, fichier manquant (`404`) et lecture disque après clear; extension des tests scripts `migrate-images-to-disk` et `image-migration-report` au-delà du simple parse des flags.
- **Documentation** : `README.md`, `docs/EVOLUTION.md` et `public/deploy-help.html` alignés avec la nouvelle doc d'exploitation et l'usage de `deploy:check:prod`.
- **Hotfix deploy check** : `scripts/post-deploy-check.js` n’utilise plus `fetch`/undici (Wasm) et passe en `http/https` natif pour éviter les erreurs mémoire sur certains environnements Node 22 contraints.
- **Checklist de bascule images** : ajout d’un flux recommandé (report -> dry-run -> migration -> clear) dans `README.md` et `docs/LOCAL_DEV.md`; avancement mis à jour dans `docs/EVOLUTION.md`.
- **Documentation déploiement** : ajout de l’étape de validation post-déploiement dans `README.md` et mise à jour de l’avancement dans `docs/EVOLUTION.md`.
- **Documentation migration images** : ajout des étapes de migration progressive dans `README.md`, `docs/LOCAL_DEV.md` et mise à jour de l’état d’avancement dans `docs/EVOLUTION.md`.
- **Plan d’évolution** : `docs/EVOLUTION.md` mis à jour selon l’état réel du code (réalisé / partiel / restant), avec backlog priorisé (quick wins, moyen terme, long terme) et nouvel ordre d’exécution.
- **Configuration production (hardening)** : mode professeur explicitement désactivé si `JWT_SECRET` est absent en production (`middleware/requireTeacher.js`, `routes/auth.js`) ; warnings additionnels sur `JWT_SECRET` et `DEPLOY_SECRET` au démarrage (`lib/env.js`).
- **Frontend** : extraction de `PinModal` et `AuthScreen` vers `src/components/auth-views.jsx` pour poursuivre la modularisation sans changement de comportement.
- **Outillage dev** : ajout du script `npm run dev:client` dans `package.json` pour aligner scripts et documentation.
- **Documentation config** : clarification des variables prod (`TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `DEPLOY_SECRET`) dans `README.md` et `.env.example`.
- **Bundle production (`dist/`)** : hotfix appliqué directement sur l’asset Vite versionné pour forcer le transport Socket.IO en `polling` côté client, afin d’éviter les erreurs WebSocket en hébergement sans build serveur (`npm` indisponible).
- **Temps réel (hotfix prod)** : transport Socket.IO client temporairement forcé en `polling` (au lieu de `websocket + polling`) pour contourner les erreurs WebSocket `reserved bits are on` observées derrière proxy/CDN. Ajout d'une checklist diagnostic et d'une procédure de retour arrière dans le [README](README.md).
- **Entrée SPA en production** : suppression du conflit `dist/index.html` (copie de `public/index.html`) vs entrée Vite. Le fallback Express sert désormais l’entrée Vite (`dist/index.vite.html`), et la page d’aide est déplacée dans `public/deploy-help.html`.
- **Déploiement Git (Option A)** : le dossier `dist/` est désormais versionné sur `main` (plus ignoré), afin que le cron serveur basé sur `git pull` puisse publier l’UI sans build côté hébergement.
- **Déploiement serveur (`deploy:prepare:fast`)** : si Vite est absent (devDependencies non installées), le script installe automatiquement les dépendances dev avant build pour éviter l’erreur `vite: commande introuvable` (code 127).
- **Script de déploiement** : remplacement de l’appel npm via PowerShell par un script Node.js portable (`scripts/prepare-dist-deploy.js`) compatible Linux (`sh`) et Windows.
- **Build frontend** : correction d’un doublon `compressImage` dans `src/components/foretmap-views.jsx` qui bloquait `vite build`.
- **Express** : en production (`NODE_ENV=production`) avec `dist/index.html` présent, fichiers statiques et fallback SPA depuis **`dist/`** ; sinon `public/` (page d’information si build absent).
- **`public/index.html`** : remplacé par une page courte expliquant la nécessité du build Vite (l’ancienne app monolithique + Babel a été migrée vers `src/`).
- **Modales (mode prof / tâches / stats)** : fond d’overlay opaque immédiat (plus d’animation transparent→noir ni `backdrop-filter` sur l’overlay) pour éviter un voile bloquant les clics ; `prefers-reduced-motion` force l’affichage des feuilles modales ; confirmations tâches/élève : clic réservé au fond + `stopPropagation` sur le panneau ; lightbox photo sans animation de fond. Carte prof : hauteur `100dvh - 56px` (sans réserver la barre élève).
- `lib/logger.js` : sortie Pino dupliquée vers stdout et tampon [`lib/logBuffer.js`](lib/logBuffer.js).
- `server.js` : création du serveur via `http.createServer(app)` pour attacher Socket.IO.
- **Page À propos** : correction des crédits avec l'auteur principal `Mohammed El Farrai` (majuscules respectées) et `oliviera999` mentionné comme contributeur.

### Le conditionnement par QCM obéit enfin à ses réglages (v1.101.0)

Suite de l'audit [docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md](docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md),
après arbitrage : **brancher** les réglages plutôt que les retirer.

- **Le mode agit.** « Une réussite suffit », « toutes les questions » et « un nombre minimum »
  pilotent réellement la validation — jusqu'ici l'accusé exigeait **toutes** les questions liées,
  quoi qu'affiche l'écran. Un professeur qui choisit « une réussite suffit » obtient une question,
  pas cinq. Le seuil du mode « minimum » est borné au nombre de questions liées (un seuil de 25 sur
  3 questions ne rend plus la ressource impossible à valider).
- **La politique par ressource agit aussi** : une ressource peut être dispensée de conditionnement,
  ou assouplie en « une réussite suffit » alors que la plateforme est en « toutes les questions ».
  L'interrupteur global reste **maître** : éteint, aucune surcharge ne le rallume.
- **Granularité « par équipe »** : la bonne réponse d'un coéquipier compte pour ses camarades —
  y compris celle saisie par le MJ quand « QCM réservés au MJ » est actif. Dans ce mode
  d'animation, les élèves ne capitalisaient jusqu'ici **aucune** bonne réponse.
- **On ne pose plus que les questions nécessaires.** Le challenge renvoie `mode`,
  `required_correct`, `granularity`, `satisfied` et un `pending_count` qui vaut désormais
  « combien de bonnes réponses il reste à donner » ; l'élève ne voit que ce nombre de questions.
- **Les liens créés automatiquement ne bloquent plus.** Les rapprochements question ↔ terme de
  glossaire générés par les imports (et par la migration 145) étaient **approuvés et bloquants** :
  allumer l'interrupteur global aurait conditionné d'un coup des dizaines de termes que personne
  n'avait choisis. Ils restent en base pour leur valeur documentaire, mais non bloquants
  (migration `194`, plus les six points de code qui les génèrent). Un conditionnement ne s'applique
  désormais que là où quelqu'un a coché « bloquant ».
- **Réglage retiré** : « marquer automatiquement appris après une bonne réponse » disparaît de
  l'écran. Il était déjà déprécié et ignoré ; le rebrancher aurait changé le comportement sans que
  personne le demande. Même chose pour la granularité « par ressource », sans effet distinct
  désormais — elle reste affichée, étiquetée « ancien réglage », sur les bases qui la portent.
- **Tests** : `tests/gl-learning-gating-modes.test.js` (trois modes, bornage du seuil, dispense et
  assouplissement par ressource, primauté de l'interrupteur global, deux granularités) et
  couverture UI du nombre de questions posées.

### Conditionnement par QCM : activation rétroactive, message honnête, contenus retirés non marquables (v1.100.3)

Suites immédiates de l'audit ci-dessous — les constats qui ne demandaient aucun arbitrage.

- **Activer le conditionnement devient rétroactif.** Les tentatives QCM n'étaient enregistrées
  que si l'interrupteur global était déjà allumé : le jour de l'activation, chaque élève repartait
  de zéro et se voyait reposer des questions déjà réussies sur le plateau. L'écriture est
  désormais inconditionnelle (une ligne par réponse, sans effet visible tant que le
  conditionnement dort) ; seule la **lecture** reste conditionnée.
- **Le contrôle de compréhension ne promet plus ce qu'il ne tient pas.** L'écran annonçait
  « Tu pourras réessayer en cas d'erreur » alors que la première mauvaise réponse verrouille la
  ressource 3 jours par défaut. Le message suit maintenant le délai réglé : « une erreur bloquera
  la validation pendant N jours » quand un délai existe, promesse de réessai immédiat seulement
  quand le délai est à 0.
- **Un contenu retiré du jeu n'est plus marquable.** Un feuillet ou un terme du lexique lore au
  statut « inactif » — donc absent de toutes les listes, y compris côté MJ — restait marquable
  « étudié » et importable dans le carnet personnel. Il est désormais introuvable pour ces deux
  actions, comme les espèces et le glossaire scientifique l'étaient déjà.
- **Tests** : nouveau `tests/gl-lore-feuillet-gating.test.js` (parcours complet feuillet × QCM
  lore : challenge, présentation, bonne réponse, marquage — plus les deux gardes ci-dessus), et
  cas de message ajoutés côté UI.
- **Documentation** : `docs/API.md` (réglages non appliqués, tentatives inconditionnelles, filtre
  de statut, convention de préfixe `LQCM…`, déclencheur réel de l'acquisition ③) et
  [docs/reference/gl/qcm-et-pedagogie.md](docs/reference/gl/qcm-et-pedagogie.md) — dont un point
  d'attention nommant les quatre réglages sans effet, en attendant l'arbitrage.

### Audit — conditionnement par QCM des feuillets de lore (documentation)

Audit de cohérence de la chaîne « questions ↔ feuillets de lore », de l'écran MJ qui crée le
lien jusqu'à la modale de l'élève dans le Carnet de Sélène :
[docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md](docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md).
Aucun changement de comportement — document seul. Points saillants : quatre des six réglages de
« Conditionnement par QCM » sont sans effet sur le code (mode, seuil, granularité, marquage
automatique — l'accusé est figé en mode `all`), et les liens bloquants hérités de la migration
145 / des imports de QCM se réveilleraient tous à l'allumage de l'interrupteur global. Les
requêtes de contrôle à passer avant activation figurent en fin de document.

---

## [1.2.0] - 2026-03-20

### Ajouté
- **Filtres/recherche tâches :** barre de filtres dans la vue tâches (recherche texte, filtre par zone, filtre par statut côté prof).
- **Échéances proches :** bannière d'urgence pour les élèves montrant les tâches dues dans les 3 prochains jours.
- **Progression visuelle élève :** barre de rang (Nouveau → Débutant → Actif → Expert) avec indicateur du prochain palier dans les statistiques élève.
- **Export CSV stats :** endpoint `GET /api/stats/export` (prof, JWT) ; bouton de téléchargement dans la vue stats prof.
- **Catalogue plantes élève :** composant `PlantViewer` (recherche, zones associées) + onglet « Plantes » dans la navigation élève.
- **Modération des logs :** endpoint `DELETE /api/tasks/:id/logs/:logId` (prof) ; bouton de suppression dans le visualiseur de rapports.
- **Carnet d'observation :** table `observation_logs`, route CRUD `routes/observations.js`, composant `ObservationNotebook` + onglet « Carnet » dans la navigation élève.
- **Tâches récurrentes :** champ `recurrence` sur la table `tasks` (migration 005), sélecteur dans le formulaire de tâche, chip dans les cartes de tâches.
- **Historique audit prof :** table `audit_log` (migration 004), route `routes/audit.js` avec `logAudit()`, enregistrement automatique des actions critiques (validation, suppression), onglet « Audit » dans la vue prof.
- **Tests nouvelles fonctionnalités :** `tests/new-features.test.js` (export CSV, modération logs, audit, observations).
- **Mode hors-ligne basique :** Service Worker (`public/sw.js`) avec cache network-first pour l'API et cache-first pour les assets statiques.
- Migrations versionnées : `003_observation_logs.sql`, `004_audit_log.sql`, `005_task_recurrence.sql`.
- Débogage : journalisation des erreurs 500 sur toutes les routes API (`lib/routeLog.js`), journalisation des étapes de migration SQL (`database.js`), scripts `npm run debug` / `debug:dev` (Node `--inspect`), configuration [`.vscode/launch.json`](.vscode/launch.json) (lancer le serveur, attacher, tests `node --test`), source maps sur le build Vite (`vite.config.js`). Documentation : `LOG_LEVEL` dans `.env.example`, sections débogage dans [README](README.md) et [docs/EVOLUTION.md](docs/EVOLUTION.md).
- Environnement local : `docker-compose.yml` (MySQL 8), `docker/mysql-init/` (bases `foretmap_local` + `foretmap_test`), `env.local.example`, scripts `docker:up` / `docker:down`, `test:local` (tests sur `foretmap_test`), doc [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md). Dépendance dev `cross-env`.
- Route `GET /api/health/db` (ping MySQL, 200 ou 503) pour le diagnostic en prod.
- Front : après 3 échecs serveur consécutifs (5xx / réseau), rafraîchissement espacé (2 min) + bandeau « Serveur indisponible » et bouton « Réessayer ».

### Modifié
- Navigation élève élargie : 4 onglets (Carte, Tâches, Plantes, Carnet) au lieu de 2.
- Navigation prof élargie : 5 onglets (Carte & Zones, Tâches, Plantes, Stats, Audit) au lieu de 4.
- Avertissements `lib/env.js`, `lib/uploads.js` et échec validation `.env` au démarrage : messages via Pino (`lib/logger.js`) au lieu de `console.*` ; frontend : erreurs API auparavant ignorées journalisées avec `console.error('[ForetMap] …')` ou toast (stats prof).
- Fallback SPA : chemin absolu `path.resolve`, logs enrichis (`resolvedPath`, `code`) si `index.html` introuvable.
- Version API : lecture de `package.json` via `path.join(__dirname, …)`.
- README : section *Débogage* (logs, inspect Node, bonnes pratiques front) ; procédure « Can't acquire lock » o2switch, racine d’app + variables BDD, section diagnostic `/api/health` vs `/api/health/db`.

### Déploiement
- **Requis avant redémarrage :** `npm run db:migrate` pour appliquer les migrations 003-005.

---

## [1.1.1] - 2026-03-18

### Ajouté
- Version de l’app en pied de page : `GET /api/version`, affichage sur l’écran de connexion et en bas de l’interface une fois connecté.
- Redémarrage déclenché après déploiement : `POST /api/admin/restart` (secret `DEPLOY_SECRET`, header `X-Deploy-Secret` ou body `secret`). Documentation dans README et `.env.example`.

---

## [1.1.0] - 2026-03-18

### Ajouté
- Auth professeur côté serveur : `POST /api/auth/teacher` (vérification PIN via `TEACHER_PIN`), JWT, middleware `requireTeacher` sur les routes sensibles (zones, plants, tasks, stats, students, map).
- CORS restreint en production via `FRONTEND_ORIGIN`.
- Découpage backend en routeurs : `routes/` (auth, zones, map, plants, tasks, stats, students), `middleware/requireTeacher.js`, `lib/helpers.js`.
- Images sur disque : `uploads/` (zones, task-logs), colonnes `image_path` en BDD, rétrocompat base64 ; `lib/uploads.js`.
- Migrations de schéma versionnées : table `schema_version`, dossier `migrations/` (001_schema_version, 002_image_path).
- Tests backend (Node `node:test` + supertest) : auth, statuts tâches (assign/unassign), suppression élève (cascade). Script `npm test`.
- Base Vite + React : `vite.config.js`, `index.html`, `src/main.jsx`, scripts `build` / `preview`.
- Validation des variables d’environnement au démarrage (`lib/env.js`), logging Pino (`lib/logger.js`), middleware d’erreur centralisé.
- CI GitHub Actions : `.github/workflows/ci.yml` (Node 20, MySQL 8, `npm ci` + `npm test`).
- Documentation API : `docs/API.md` (routes, codes d’erreur, note a11y).
- Script `npm run dev` avec nodemon.

### Modifié
- Frontend : plus de PIN en clair ; appel à `POST /api/auth/teacher`, token en `localStorage`, header `Authorization` sur les requêtes prof ; prise en charge `image_url` pour photos et logs.
- `.env.example` : `TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`.
- `.gitignore` : dossier `uploads/`.

---

## [1.0.1] - 2026-03-18

### Ajouté
- Routine de versionnage : CHANGELOG.md, docs/VERSIONING.md, scripts `bump:*` / `release:*`, règle Cursor.

---

## [1.0.0] - 2026-03-18

### Ajouté
- Version initiale documentée : application forêt comestible (zones, tâches, plantes, élèves, mode prof).
