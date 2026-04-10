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
