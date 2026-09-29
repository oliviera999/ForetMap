# Audit — positionnement des emojis et noms de zones (29 septembre 2026)

> Instantané. Périmètre : étiquettes des **zones** (emoji + nom) et pastilles d'état sur les
> plans ForetMap (carte de travail, visite, Plan) en **consultation** (`SharedMapStage`) et en
> **édition** (`ZonePolygonsLayer`). Les repères ne sont concernés que par l'estimation des
> boîtes de collision.
>
> **Statut : les 9 constats sont traités** dans le même lot (voir § Traitement) ; les
> constats 10 à 13 de la seconde passe aussi (voir § Seconde passe).

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

## Seconde passe (29 septembre 2026, après-midi) — plan Lyautey

Relevé sur `planlyautey.olution.info`, bâtiments **I, T, S, G**. Premier constat : le correctif
ci-dessus n'était **pas encore déployé** (ancien bundle servi). Il l'est depuis la v1.197.5 :
l'artefact `dist-artifact/main` et le bundle servi en production portent les mêmes empreintes.
Mais même avec le nouveau moteur, une simulation sur les données du plan (écran 390 × 463 px)
laissait quatre défauts.

| #   | Gravité | Constat                                                                                                                                                                                                    |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Moyenne | **Repères ignorés** : les épingles et pastilles de groupe ne sont pas des obstacles. La pastille « 🎬 2 » recouvrait l'emoji du Bât.I ; l'épingle du Fablab celui du Bât.T ; deux épingles celui du Bât.S. |
| 11  | Moyenne | **Une seule position par étiquette** : emoji au pôle, nom dessous, sinon masqué. Dans un bâtiment long (I) ou très occupé (T), aucune autre place n'était essayée.                                         |
| 12  | Faible  | **Emoji recopié dans le nom** (« 🧪 Bât.S… » avec l'emoji 🧪) : l'emoji apparaît deux fois en édition, et le nom est plus long que nécessaire.                                                             |
| 13  | Faible  | **Bât.G (forme en H)** : ancre hors de la forme avec l'ancien bundle ; conforme une fois le constat 6 déployé.                                                                                             |

Traitement :

10. **Traité** — `markerObstaclesFrom` : chaque épingle (emoji + 4 px) et chaque pastille de
    groupe (≥ 44 px) est un **obstacle souple**. Une étiquette l'évite si elle le peut, mais un
    repère ne la masque jamais.
11. **Traité** — `polygonLabelAnchorsPct` fournit le pôle puis jusqu'à 5 points de repli
    (quadrillage, profondeur ≥ 35 % de celle du pôle, espacés). `resolveLabelLayout` essaie
    ces points pour l'emoji, puis place le nom dessous, à droite, à gauche ou au-dessus (classes
    `name-right|left|above`, même géométrie en édition SVG). Si aucun côté ne convient, l'emoji
    et son nom essaient ensemble un autre point, mais jamais un point couvert par un repère.
    L'approche s'inspire des positions candidates `text-variable-anchor` de Mapbox GL
    (<https://docs.mapbox.com/style-spec/reference/layers/>), réimplémentées.
12. **Traité** — migration `311_strip_duplicate_emoji_from_names.sql` : elle retire l'emoji de
    tête identique au champ emoji, sur les zones comme sur les repères (comparaison binaire).
13. **Traité** — par le déploiement du constat 6.

Simulation sur les données du plan, avant puis après ce traitement :

- à l'échelle 1, 21 noms de zones sur 35 s'affichent, contre 16 auparavant ;
- les emojis des bâtiments I, T, S et G ne sont plus recouverts par un repère, à aucune échelle ;
- le nom du Bât.S n'apparaît qu'à partir d'un zoom ×1,5, pour que son emoji reste dégagé.

## Hors périmètre (ouvert)

- Les points de **focus caméra** (`WorkMapStage`, `VisitMapStage`, `utils/visitDiscoverHalo.js`)
  appellent encore le pôle d'inaccessibilité sans rapport d'aspect : sans effet sur les
  étiquettes, léger décalage possible du cadrage sur une zone en « L ».
- Retrait définitif du réglage `zone_label_min_side_factor` (clé, validation, UI admin).
