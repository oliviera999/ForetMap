# Zones feuillets (Gnomes & Licornes)

Calque de petits polygones sur la carte de jeu : à la **première traversée** par une équipe, un popover affiche le texte du feuillet (JSON) et applique les effets gemmes/cœurs.

> **La traversée de zone n'est qu'un canal d'obtention parmi d'autres.** L'accès aux feuillets
> (feuillets non lisibles par défaut, aperçu verrouillé) et les autres canaux d'acquisition
> (étude d'espèce, **consultation gatée d'un élément** en stratégie ③, attribution du découvreur)
> sont documentés dans [`AUDIT_FEUILLETS_ACCES.md`](AUDIT_FEUILLETS_ACCES.md).

## Fichier de données

- **Source :** [`src/gl/data/zones_feuillets.json`](../src/gl/data/zones_feuillets.json)
- **Coords :** normalisées **0–1**, origine haut-gauche (non modifiées à l’import).
- **Runtime :** conversion vers le référentiel GL **0–100 %** via [`src/gl/utils/glNormMapCoords.js`](../src/gl/utils/glNormMapCoords.js).

## Catalogue actuel : 21 zones sur 4 plateaux

Depuis la fusion des chapitres 4 et 5 (octobre 2026, migration `316`), l'année se joue en
**4 plateaux** et le plateau 5 n'a plus de zone.

| Plateau | Zones                   | Fond (`board_image`)                       | Feuillets                                                                                                          |
| ------- | ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1       | `zf-p1-01` → `zf-p1-04` | `watermarked_img_13496490473232250296.jpg` | 4 feuillets des tropiques africains                                                                                |
| 2       | `zf-p2-05` → `zf-p2-07` | `watermarked_img_16999739831612660178.jpg` | 3 feuillets d'aride chaud                                                                                          |
| 3       | `zf-p3-08` → `zf-p3-11` | `watermarked_img_6895487107210024833.jpg`  | 4 feuillets du tempéré atlantique                                                                                  |
| 4       | `zf-p4-01` → `zf-p4-10` | `GL_plateau-4_fond.png`                    | `ep-I-11`, `ep-I-12`, `ep-III-01`, `ep-I-14`, `ep-III-03`, `ep-I-15`, `ep-I-13`, `ep-III-06`, `ep-I-16`, `ep-I-17` |

Les 10 zones du plateau 4 sont posées sur les dalles 6, 13, 22 (le dernier arbre), 25, 29,
32 (la bascule vers la nuit polaire), 34, 35, 37 et 38 (l'étoile fixe) du plateau peint à
38 dalles. Polygone : l'octogone commun à toutes les zones (demi-largeur 0,0185, demi-hauteur
0,0333 en coordonnées 0–1), qui ne recouvre que sa dalle. Les anciennes zones `zf-p4-12` →
`zf-p4-16` et `zf-p5-17` → `zf-p5-24` ont été retirées ; leurs feuillets `ep-III-02`,
`ep-III-04` et `ep-III-07` sont passés inactifs (corpus raccourci).

## Associer un chapitre à un plateau

1. Admin **Contenus → Chapitres** : champ **Plateau narratif (1–5)** — les plateaux joués sont 1 à 4.
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
