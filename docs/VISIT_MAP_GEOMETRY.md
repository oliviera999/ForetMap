# Géométrie : carte visite vs carte tâches (MapView)

## Objectif

Documenter comment les **coordonnées en pourcentage** (zones polygone, repères) sont calées sur l’image du plan dans la **visite** et ce qui diffère de la **carte interactive** métier, pour interpréter correctement une synchronisation carte ↔ visite.

## Carte visite (`visit-views.jsx`)

- Conteneur : `.visit-map-stage` avec **ratio CSS 16/10**.
- Calque image + SVG + repères : rectangle calculé par **`computeMapImageContainRect`** ([`src/utils/mapImageFit.js`](../src/utils/mapImageFit.js)) à partir des dimensions **naturelles** de l’image et de la taille du stage (via `ResizeObserver`).
- Tant que les dimensions naturelles ne sont pas connues, le rectangle « fit » coïncide avec **tout le stage** : les % ne correspondent pas encore au plan réel. L’édition prof (zone / repère) est **bloquée** jusqu’au chargement effectif de l’image.

## Carte tâches (`map-views.jsx`)

- Pipeline **`measureAndFit`** : conteneur embarqué ou vue solo, **viewport** mobile (`visualViewport`), **paddings** du layout, plancher de hauteur en contexte flex/grid.
- Le facteur d’échelle et les offsets ne sont pas les mêmes fonctions que la visite, mais si la **même** `map_image_url` remplit visuellement le cadre de la même manière, les % stockés restent alignés.

## Vérification recommandée

Après **`POST /api/visit/sync`** (carte → visite ou l’inverse), ouvrir **la même carte** en mode visite et en mode carte tâches, comparer la position des zones / repères (zoom navigateur identique si besoin). En cas d’écart visible, inspecter le cadre réel de l’image (bandes, ratio du conteneur) plutôt que les données seules.

## Statistiques admin

`GET /api/visit/stats` agrège des objectifs actifs **sur toutes les cartes** ; l’UI visite affiche une progression **par `map_id`**. Ne pas confondre les deux périmètres lors de l’analyse des KPI.

## Tests automatisés (géométrie et mascotte)

- **Unitaires** : `tests/visit-map-geometry.test.js` (`parseVisitZonePoints`, `visitZoneCentroidPct`), `tests/visit-mascot-placement.test.js`, `tests/visit-mascot-visibility.test.js` (mascotte aussi si **tutoriels** seuls), `tests/visit-progress-client.test.js`, `tests/visit-content-public-active.test.js` (`lib/visitContentPublicActive.js`), `tests/visit-mascot-diagnostics.test.js` (`lib/visitMascotDiagnostics.js`), `tests/visit-mascot-state.test.js`, `tests/visit-mascot-catalog.test.js`.
- **E2e** : `e2e/visit-mascot.spec.js` — seed sur le plan **n3** (comportement réaliste pour les comptes « N3 + Forêt »), clics au **pourcentage** dans **`.visit-map-fit-layer`** ; visibilité mascotte via **`.visit-map-mascot-inner`** (le nœud **`.visit-map-mascot`** est volontairement en **0×0** pour l’ancrage en %).

## Mascottes extensibles (Rive / spritesheet)

- Le catalogue des mascottes est centralisé dans `src/utils/visitMascotCatalog.js`.
- Chaque entrée définit `renderer` (`rive` ou `spritesheet`) et ses assets/états.
- **`fallbackSilhouette`** : forme du SVG de secours (`gnome`, `spore`, `vine`, `moss`, `seed`, `swarm`, `sprout`, `scrap`, `olu`) — voir `src/components/VisitMascotFallbackSvg.jsx`.
- Pour ajouter une mascotte : déposer les assets dans `public/assets/mascots/...` puis déclarer une nouvelle entrée de catalogue.
- Le choix courant est persisté côté client (`localStorage`) et utilisé par `VisitMapMascotRenderer.jsx`.
- Le pilotage d’état passe par `src/hooks/useVisitMascotStateMachine.js` (boutons preview dynamiques selon la mascotte active).
- La palette d’états n’est plus limitée à `idle/walking/happy` : elle peut inclure `running`, `talk`, `alert`, `angry`, `surprise`, `inspect`, `map_read`, `spin`, `celebrate`, `happy_jump` selon la config du catalogue.

## Diagnostic prod : mascotte invisible

La mascotte n’est rendue que si le client a du **contenu public** visite (zones/repères filtrés comme **`GET /api/visit/content`**, ou tutoriels actifs liés au plan). Un déploiement **sans** `dist/` à jour, un **cache** (navigateur / SW / CDN) ou un asset Rive manquant (`/assets/rive/visit-mascot.riv`) peut donner l’impression d’un « bug mascotte » alors que la cause est ailleurs.

### Checklist (navigateur + réseau)

1. **Réseau** : ouvrir la réponse de **`GET /api/visit/content?map_id=`** (même `map_id` que le sélecteur de carte en visite). Vérifier les longueurs de **`zones`**, **`markers`**, **`tutorials`**. Si les trois sont vides, le composant mascotte **n’est pas monté** (comportement attendu).
2. **DOM** (onglet Visite, plan visible) : existe-t-il **`.visit-map-mascot-inner`** ?
   - **Non** → données / module visite / chargement (étape 1) ou onglet pas en mode navigation.
     Vérifier aussi les attributs de scène **`.visit-map-stage[data-visit-mascot-visibility][data-visit-mascot-reason]`** :
     `hidden + no-public-content` = pas de contenu public (comportement attendu), `hidden + mode-not-view` = mode édition prof.
  - **Oui** → inspecter aussi le shell actif :
    - `data-renderer` (`rive`, `spritesheet` ou `fallback-static`)
    - `data-rive-status` (`loading`, `loaded`, `playing:<animation>`, `fallback-no-animation`, `error`)
    - `data-spritesheet-status` (`ready`, `fallback`)
    - `data-mascot-state` (ex. `idle`, `walking`, `running`, `talk`, `inspect`, `map_read`, `celebrate`…)
    Ces attributs permettent d’identifier si Rive/spritesheet joue une animation ou si le fallback SVG statique est utilisé.
  - **Oui** avec `data-renderer="fallback-static"` → le shell est visible mais le fichier Rive n’a pas pu être chargé (asset absent, URL invalide, erreur réseau).
  - **Oui** mais bulle absente alors qu’une action a eu lieu → vérifier `mark_seen` côté UI (bouton « Marquer comme vu ») et la classe de conteneur (`visit-map-mascot--happy`/`--walking`). Sinon : **style** / calque (z-index explicite : zones **1**, mascotte **16**, repères **14**), zoom page.
3. **Version déployée** : **`GET /api/version`** ; comparer au dépôt. Vérifier que **`index.vite.html`** charge un **`/assets/index.vite-*.js`** cohérent (hash aligné avec le déploiement).
4. **Cache** : navigation privée ; **Application → Service Workers → Désinscrire** ; rechargement forcé (Ctrl+F5).
5. **Serveur** : le répertoire **`dist/`** servi par Node ([`server.js`](../server.js) en `NODE_ENV=production`) est bien celui mis à jour ; pas seulement un `git pull` sans **`dist/`** si le flux ne rebuild pas le front.
6. **Assets spritesheet** : pour OLU, `public/assets/mascots/olu/olu-spritesheet.png` (`/assets/mascots/olu/olu-spritesheet.png`) ; pour l’oiseau tan (2 frames), `public/assets/mascots/tan-bird/tan-bird-spritesheet.png` (`/assets/mascots/tan-bird/tan-bird-spritesheet.png`) ; pour le **renard sac** (grille 6×4, 153×160 px), seul l’atlas **`/assets/mascots/fox-backpack/fox-backpack-spritesheet.png`** est chargé par le client (pas les fichiers `cells/`). Pour mettre à jour depuis une nouvelle planche (ex. export Gemini) : `npm run mascot:fox-backpack -- --import "chemin.png"` ou `npm run mascot:fox-backpack -- --import` si la PNG « ai-brush » est au chemin Cursor attendu ; puis **`npm run build`** si le serveur sert **`dist/`**.

### Agrégats BDD (secret deploy)

Avec le header **`X-Deploy-Secret`**, **`GET /api/admin/diagnostics`** inclut **`visitMascotHint`** : pour chaque carte, compteurs **`visitZonesInPublicApi`**, **`visitMarkersInPublicApi`**, **`visitTutorialsForContentApi`** et booléen **`mascotWouldRenderHint`** (même logique que le client pour afficher la mascotte). Utile pour confirmer en prod qu’une carte n’a **aucune** cible publique sans ouvrir le navigateur élève.
