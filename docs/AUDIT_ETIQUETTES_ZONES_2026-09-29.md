# Audit — positionnement des emojis et noms de zones (29 septembre 2026)

> Instantané. Périmètre : étiquettes des **zones** (emoji + nom) et pastilles d'état sur les
> plans ForetMap (carte de travail, visite, Plan) en **consultation** (`SharedMapStage`) et en
> **édition** (`ZonePolygonsLayer`). Les repères ne sont concernés que par l'estimation des
> boîtes de collision.
>
> **Statut : les 9 constats sont traités** dans le même lot (voir § Traitement).

## Contexte

Les zones sont des polygones en **% de l'image** (SVG `viewBox 0 0 100 100`,
`preserveAspectRatio="none"`, donc étiré). Les étiquettes sont du HTML posé au-dessus,
contre-échelonné (`--pct-inv`) et contre-tourné (`--pct-orient`). Le placement anti-chevauchement
est glouton, par priorité (`resolveLabelCollisions`).

## Constats

| #   | Gravité | Constat                                                                                                                                                                                                                                                                               |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Moyenne | **L'emoji saute** de 7 à 14 px quand le nom apparaît ou disparaît (zoom, collision) : c'est la **colonne emoji + nom** qui était centrée sur l'ancre, pas l'emoji.                                                                                                                    |
| 2   | Moyenne | **Boîte de collision ≠ rendu** : la boîte du nom était centrée sur l'ancre alors que le nom est dessiné plus bas (sous l'emoji) ; la place de l'emoji n'était pas réservée.                                                                                                           |
| 3   | Moyenne | **Emojis hors anti-chevauchement** : toujours affichés, ils se superposaient sur les petites zones voisines.                                                                                                                                                                          |
| 4   | Faible  | **Pastilles d'état sur l'emoji** : leur boîte ne tenait pas compte de la taille réelle de l'emoji ni des zones sans emoji (nom seul).                                                                                                                                                 |
| 5   | Moyenne | **Deux moteurs** : l'édition masquait les noms par **seuil d'aire** (`zone_label_min_side_factor`), la consultation par **collisions** — même plan, étiquettes différentes. L'édition masquait aussi les emojis quand les noms étaient désactivés.                                    |
| 6   | Moyenne | **Pôle d'inaccessibilité anisotrope** : calculé en coordonnées % (x et y n'ont pas la même échelle sur une image non carrée). Mesure sur un « L » dans une image 200 × 100 : l'ancre tombait dans un bras de 30 px d'épaisseur (12,5 px de marge réelle, contre ≈ 30 px en isotrope). |
| 7   | Faible  | **Estimations divergentes** : largeur moyenne de caractère 0,55 (collisions) vs 0,6 (troncature) ; padding du bouton cliquable et largeur de la pastille active ignorés.                                                                                                              |
| 8   | Faible  | **Code mort** : `VisitZonesSvgLayer` (+ `visitZoneSvgTextUniformYTransform`, CSS `.visit-zone-*`) et la branche libellés SVG de `PctZonesLayer` (`<text>` jamais activée).                                                                                                            |
| 9   | Moyenne | **Tailles figées** : le moteur de collisions supposait 12 / 16 px, alors que la préférence **Aa** et les réglages admin changent les tailles réelles.                                                                                                                                 |

## Traitement (lot du 29 septembre 2026)

1. **Traité** — l'emoji est centré sur l'ancre (`transform-origin` au centre de l'emoji,
   classe `has-emoji`), le nom est posé dessous (`--map-overlay-label-margin-top`).
2. **Traité** — `estimateLabelBox({ anchorY: 'top' })` : le haut du nom est sous l'emoji ;
   `estimateGlyphBox` réserve la place de l'emoji ; un nom ne se heurte jamais à son propre
   emoji, même avec un écart nul.
3. **Traité** — l'emoji est un candidat (`zone-emoji:<id>`, `tier` 0 : placé avant tous les
   noms) ; un nom dont l'emoji est masqué est retiré (seconde passe).
4. **Traité** — ancre des pastilles = ancre de l'étiquette ; variante `name` (boîte plus haute)
   pour les zones sans emoji ; taille liée à `--map-overlay-emoji-font-size`.
5. **Traité** — l'édition utilise `resolveVisibleLabels` (même moteur, noms sur une ligne,
   zone sélectionnée épinglée) ; les emojis restent affichés sans les noms. Le réglage
   `zone_label_min_side_factor` est **sans effet** (conservé pour compatibilité, signalé dans
   `docs/API.md` et la doc de référence).
6. **Traité** — `polygonPoleOfInaccessibilityPct(points, precision, aspect)` étire x par le
   rapport largeur ÷ hauteur de l'image ; approche inspirée de
   [mapbox/polylabel](https://github.com/mapbox/polylabel) (ISC), réimplémentée.
7. **Traité** — ratio unique `AVG_CHAR_WIDTH_RATIO = 0,55` ; `extraWidthPx` pour la pastille
   active ; `min-width` du bouton cliquable = cible tactile.
8. **Traité** — composants, utilitaire, CSS et tests morts supprimés.
9. **Traité** — `resolveOverlayLabelSizesPx` lit les variables CSS effectives (préférence Aa
   incluse) et les passe au moteur.

Tests : `tests-ui/shared/pctMapLabels.test.js`, `mapOverlayLabelCollision.test.js`,
`pctPolylabel.test.js`, `PctLayers.test.jsx`, `pct-map/PctStatusDots.test.jsx`,
`tests-ui/components/map/ZonePolygonsLayer.test.jsx`, `tests/map-overlay-zone-labels.test.js`.

## Hors périmètre (ouvert)

- Les points de **focus caméra** (`WorkMapStage`, `VisitMapStage`, `utils/visitDiscoverHalo.js`)
  appellent encore le pôle d'inaccessibilité sans rapport d'aspect : sans effet sur les
  étiquettes, léger décalage possible du cadrage sur une zone en « L ».
- Retrait définitif du réglage `zone_label_min_side_factor` (clé, validation, UI admin).
