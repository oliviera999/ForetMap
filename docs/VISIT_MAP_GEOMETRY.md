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

- **Unitaires** : `tests/visit-map-geometry.test.js` (`parseVisitZonePoints`, `visitZoneCentroidPct`), `tests/visit-mascot-placement.test.js`, `tests/visit-mascot-visibility.test.js` (mascotte aussi si **tutoriels** seuls), `tests/visit-progress-client.test.js`, `tests/visit-content-public-active.test.js` (`lib/visitContentPublicActive.js`), `tests/visit-mascot-diagnostics.test.js` (`lib/visitMascotDiagnostics.js`).
- **E2e** : `e2e/visit-mascot.spec.js` — seed sur le plan **n3** (comportement réaliste pour les comptes « N3 + Forêt »), clics au **pourcentage** dans **`.visit-map-fit-layer`** ; visibilité mascotte via **`.visit-map-mascot-inner`** (le nœud **`.visit-map-mascot`** est volontairement en **0×0** pour l’ancrage en %).

## Diagnostic prod : mascotte invisible

La mascotte n’est rendue que si le client a du **contenu public** visite (zones/repères filtrés comme **`GET /api/visit/content`**, ou tutoriels actifs liés au plan). Un déploiement **sans** `dist/` à jour, un **cache** (navigateur / SW / CDN) ou une **CSP** amont bloquant Lottie peut donner l’impression d’un « bug mascotte » alors que la cause est ailleurs.

### Checklist (navigateur + réseau)

1. **Réseau** : ouvrir la réponse de **`GET /api/visit/content?map_id=`** (même `map_id` que le sélecteur de carte en visite). Vérifier les longueurs de **`zones`**, **`markers`**, **`tutorials`**. Si les trois sont vides, le composant mascotte **n’est pas monté** (comportement attendu).
2. **DOM** (onglet Visite, plan visible) : existe-t-il **`.visit-map-mascot-inner`** ?
   - **Non** → données / module visite / chargement (étape 1) ou onglet pas en mode navigation.
     Vérifier aussi les attributs de scène **`.visit-map-stage[data-visit-mascot-visibility][data-visit-mascot-reason]`** :
     `hidden + no-public-content` = pas de contenu public (comportement attendu), `hidden + mode-not-view` = mode édition prof.
   - **Oui** avec **`.visit-map-mascot-lottie--placeholder`** (🧭) → Lottie en erreur ou **CSP** (`script-src` sans `unsafe-eval` côté proxy) ; console navigateur.
   - **Oui** avec **SVG** mais **chemins sans `d` / sans remplissage visible** dans l’inspecteur → timing Lottie : la première frame peut être appliquée avant le DOM SVG (`DOMLoaded`) ; le client force désormais l’idle après `DOMLoaded` + double `requestAnimationFrame`, puis bascule en placeholder si aucun SVG exploitable n’est détecté. Sinon : **style** / calque (z-index explicite : zones **1**, mascotte **16**, repères **14**), zoom page.
3. **Version déployée** : **`GET /api/version`** ; comparer au dépôt. Vérifier que **`index.vite.html`** charge un **`/assets/index.vite-*.js`** cohérent (hash aligné avec le déploiement).
4. **Cache** : navigation privée ; **Application → Service Workers → Désinscrire** ; rechargement forcé (Ctrl+F5).
5. **Serveur** : le répertoire **`dist/`** servi par Node ([`server.js`](../server.js) en `NODE_ENV=production`) est bien celui mis à jour ; pas seulement un `git pull` sans **`dist/`** si le flux ne rebuild pas le front.

### Agrégats BDD (secret deploy)

Avec le header **`X-Deploy-Secret`**, **`GET /api/admin/diagnostics`** inclut **`visitMascotHint`** : pour chaque carte, compteurs **`visitZonesInPublicApi`**, **`visitMarkersInPublicApi`**, **`visitTutorialsForContentApi`** et booléen **`mascotWouldRenderHint`** (même logique que le client pour afficher la mascotte). Utile pour confirmer en prod qu’une carte n’a **aucune** cible publique sans ouvrir le navigateur élève.
