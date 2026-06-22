# Pack mascotte « gnome2 » (visite)

Pack mascotte **importable** au format `foretmap-mascot-pack-archive` (v1), variante **visit**,
renderer **`sprite_cut`**. Construit à partir de la planche de sprite « GNOME SPRITE STANDARD »
(`source/gnome-sprite-sheet.png`). Voir le format de référence dans
[`docs/MASCOT_PACK.md`](../../../docs/MASCOT_PACK.md).

## Livrable

- **`gnome2.zip`** : archive prête à importer (studio mascottes prof → **Importer un pack**).
- `pack.json` / `manifest.json` : contenu de l'archive (forme portable, `framesBase: ./assets/`).
- `assets/cell-rN-cM.png` : 18 cellules **uniformes 150×180** (alignées bas-centre).
- `all-sprites/rNcM.png` : découpe **brute** de **tous** les sprites de la planche (28, taille native).
- `preview-mapping.png` : aperçu visuel état → cellules.
- `build_gnome2_pack.py` : script de reconstruction déterministe (Pillow uniquement).

## Import

1. Mode prof → studio des mascottes de visite → **Importer un pack** (carte cible, ex. `foret`).
2. Choisir `gnome2.zip`. Le serveur réécrit `framesBase` vers
   `/api/visit/mascot-packs/{uuid}/assets/`, enregistre le pack et copie les images.
3. Publier le pack puis l'assigner à une mascotte.

> `id` (`gnome2`) et `label` (`Gnome 2`) sont indicatifs : à l'import, l'`id` devient
> `srv-{uuid}` ; le `label` reste affiché (modifiable au moment de l'import).

## Reconstruction

```bash
cd tools/mascot-packs/gnome2
python3 build_gnome2_pack.py        # nécessite Pillow
```

Le script découpe la planche (bounding boxes figées dans `BBOXES`), génère les cellules
uniformes, `pack.json`, `manifest.json`, `gnome2.zip` et `preview-mapping.png`.

## Choix de découpe

- Segmentation par **composantes connexes sur le canal alpha** (fond transparent), bounding
  boxes figées dans le script pour un rebuild reproductible.
- **Cellules uniformes 150×180** : le moteur affiche chaque image dans une boîte
  `frameWidth × frameHeight` (`object-fit: contain`, `transform-origin: center bottom`).
  Les poses au sol sont **alignées en bas** (pieds sur la ligne de base) et centrées
  horizontalement ; les accessoires flottants (boussole) sont centrés.
- Le moteur **ne retourne pas** les sprites → le cycle de marche/course utilise une seule
  direction (**vers la droite**, rangée 1). Les frames « vers la gauche » (rangée 2) restent
  donc inutilisées (redondantes pour une mascotte non directionnelle).

## Mapping état → cellules

États canoniques de `VISIT_MASCOT_STATE` (`src/utils/visitMascotState.js`).
Repère `rNcM` = rangée N, colonne M de la planche (voir `all-sprites/`).

| État         | Cellules (`rNcM`)      | fps | Intention                                 |
| ------------ | ---------------------- | --- | ----------------------------------------- |
| `idle`       | r1c0                   | 2   | Debout de face, calme                     |
| `walking`    | r1c2 → r1c7 (6 frames) | 8   | Cycle de marche vers la droite            |
| `running`    | r1c2, r1c4, r1c6       | 14  | Course (mêmes frames, plus rapide)        |
| `spin`       | r1c0, r1c2, r1c1, r2c0 | 10  | Tour 360° : face → droite → dos → gauche  |
| `talk`       | r3c0, r3c1             | 5   | Gestes de face (parle)                    |
| `happy`      | r3c3, r3c6             | 6   | Content, de face                          |
| `happy_jump` | r3c5, r3c8             | 11  | Saut de joie                              |
| `celebrate`  | r3c5, r3c8             | 9   | Célébration (saut, rythme différent)      |
| `inspect`    | r2c8                   | 2   | Gnome à la loupe                          |
| `map_read`   | r3c4                   | 1   | Boussole (orientation / lecture de carte) |
| `surprise`   | r3c2                   | 3   | Main levée « ! »                          |
| `alert`      | r3c2                   | 5   | Idem, plus rapide                         |
| `angry`      | r3c2                   | 7   | Idem, plus rapide (pas de pose colère)    |

## Inventaire des sprites de la planche (`all-sprites/`)

| `rNcM`      | Contenu                                                     | Usage dans le pack                            |
| ----------- | ----------------------------------------------------------- | --------------------------------------------- |
| r0c0        | Tête / buste de gnome (portrait)                            | — (non utilisé)                               |
| r0c1, r2c4  | Règle jaune (accessoire mesure)                             | — (non utilisé)                               |
| r1c0        | Idle de face                                                | `idle`, `spin`                                |
| r1c1        | Vue de dos                                                  | `spin`                                        |
| r1c2 → r1c7 | Cycle de marche **vers la droite** (poussière sur c5)       | `walking`, `running`, `spin` (c2)             |
| r2c0 → r2c7 | Cycle de marche **vers la gauche**                          | `spin` (c0) ; c1‑c7 non utilisés (redondants) |
| r2c8        | Gnome à la loupe                                            | `inspect`                                     |
| r3c0 → r3c3 | Poses d'émotion de face (salut, geste, main levée, content) | `talk`, `surprise`/`alert`/`angry`, `happy`   |
| r3c4        | Boussole                                                    | `map_read`                                    |
| r3c5, r3c8  | Sauts de joie                                               | `happy_jump`, `celebrate`                     |
| r3c6        | Pose de face (bras)                                         | `happy`                                       |
| r3c7        | Pose jambe levée (course/saut)                              | — (non utilisé)                               |

### Notes / décisions à valider

- **`map_read` = boussole seule** (r3c4) : aucun gnome « lit une carte » sur la planche ; la
  boussole est l'asset d'orientation le plus parlant. Facile à remplacer par une pose de gnome.
- **`angry`** réutilise la pose « main levée » (r3c2) à cadence rapide, faute de pose de colère
  dédiée (même logique que le pack modèle « renard », qui réutilisait une frame pour
  surprise/alert/angry).
- Sprites non utilisés : marche **vers la gauche** (r2c1‑c7), **règle** (r0c1/r2c4),
  **tête** (r0c0), **jambe levée** (r3c7). Disponibles dans `all-sprites/` si besoin.
