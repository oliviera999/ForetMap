# Zones feuillets (Gnomes & Licornes)

Calque de petits polygones sur la carte de jeu : à la **première traversée** par une équipe, un popover affiche le texte du feuillet (JSON) et applique les effets gemmes/cœurs.

## Fichier de données

- **Source :** [`src/gl/data/zones_feuillets.json`](../src/gl/data/zones_feuillets.json)
- **Coords :** normalisées **0–1**, origine haut-gauche (non modifiées à l’import).
- **Runtime :** conversion vers le référentiel GL **0–100 %** via [`src/utils/glNormMapCoords.js`](../src/utils/glNormMapCoords.js).

## Associer un chapitre à un plateau

1. Admin **Contenus → Chapitres** : champ **Plateau narratif (1–5)**.
2. Image de carte (`map_image_url`) alignée sur le visuel du plateau (voir [`public/gl/boards/README.md`](../public/gl/boards/README.md)).
3. En partie, seules les zones dont `plateau` correspond au chapitre sont actives.

Import XLSX chapitres : colonne optionnelle `plateau_number` (ou `plateau`).

## Ajouter ou modifier une zone

1. Éditer `zones_feuillets.json` (schéma : `zone_id`, `plateau`, `feuillet_code`, `titre`, `centre`, `polygone`, `popover`, `cout_gemme`, `gain_coeur`, `declenchement: "traversee_unique"`).
2. Validation au chargement (Zod) : zone invalide ignorée avec avertissement console.
3. `zone_id` unique sur tout le fichier.

## Mode debug (repositionnement)

- URL : `?editPlateau=1` ou `?editFeuilletZones=1` (staff / MJ sur la carte en partie).
- Ou variable Vite : `VITE_GL_EDIT_FEUILLET_ZONES=1`.
- **Sélection + clic** : choisir une zone feuillet ou un repère dans le panneau (ou cliquer sur le repère), puis cliquer sur la carte pour le déplacer.
- **Glisser** : poignée au centre de chaque zone feuillet (comportement conservé).
- Panneau liste lue / non lue, export **Copier JSON** / **Télécharger JSON** (coords reconverties en 0–1).

## Admin chapitres

Dans **Contenus → Chapitres**, lorsque le **plateau narratif (1–5)** est renseigné, une section **Zones feuillets — plateau N** permet le même repositionnement au clic sur le visuel du plateau, avec export JSON vers `src/gl/data/zones_feuillets.json`.

Les repères se déplacent au clic dans le studio carte (sélectionner un repère, puis cliquer sur la carte).

## API

- `GET /api/gl/games/:id/feuillet-zones/presented?teamId=` — zones déjà lues.
- `POST /api/gl/games/:id/feuillet-zones/:zoneId/present` — première traversée (409 si déjà lu).

Voir [API.md](API.md).

## Tests

```bash
npm test -- tests/gl-norm-map-coords.test.js tests/gl-feuillet-zones-loader.test.js tests/gl-map-zone-detect.test.js tests/gl-feuillet-zone-present.test.js tests/pct-polygon.test.js
npm run test:ui -- tests-ui/gl/GLPlateauMapEditor.test.jsx tests-ui/gl/GLChapterMapStudio.test.jsx
```
