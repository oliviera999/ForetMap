# Mascotte visite — format « mascot pack » v1 (`sprite_cut`)

Ce document décrit le JSON **mascot pack** version **1** : une source de vérité pour définir une mascotte **`renderer: sprite_cut`** (images PNG par frame, sans atlas obligatoire), validable en CI et alignée sur le catalogue [`src/utils/visitMascotCatalog.js`](../src/utils/visitMascotCatalog.js) et le moteur [`VisitMapMascotSpriteCut.jsx`](../src/components/VisitMapMascotSpriteCut.jsx).

## Champs racine

| Champ | Type | Description |
|--------|------|-------------|
| `mascotPackVersion` | `1` | Version du schéma. |
| `id` | string | Identifiant catalogue (`kebab-case`, lettres minuscules et chiffres). |
| `label` | string | Libellé affiché dans le sélecteur prof. |
| `renderer` | `"sprite_cut"` | Seule valeur supportée par ce format. |
| `framesBase` | string | URL-prefix des frames, ex. `/assets/mascots/mon-id/frames/` (slash final recommandé). |
| `frameWidth` | entier | Largeur logique d’une cellule (px). |
| `frameHeight` | entier | Hauteur logique (px). |
| `pixelated` | booléen (optionnel) | Défaut `true` : rendu pixelated. |
| `displayScale` | nombre (optionnel) | Facteur d’affichage `0.25`–`4` (défaut `1`). |
| `fallbackSilhouette` | string | Silhouette SVG existante (ex. `gnome`, `backpackFox2`, …). |
| `stateAliases` | objet (optionnel) | Map `état_alias → état_cible` (clés = états canoniques). |
| `stateFrames` | objet | Clés = **états visite canoniques** uniquement (voir `VISIT_MASCOT_STATE` dans [`visitMascotState.js`](../src/utils/visitMascotState.js)). |

## Entrée `stateFrames.<état>`

- **`files`** : tableau de noms de fichiers **relatifs** à `framesBase` (ex. `["idle-0.png","idle-1.png"]`). **OU**
- **`srcs`** : URLs absolues (réservé outil dev / tests avec `blob:` si validation assouplie).
- **`fps`** (optionnel) : cadence uniforme si `frameDwellMs` absent (défaut `8`).
- **`frameDwellMs`** (optionnel) : une durée en ms **par image**, même longueur que `files` / `srcs`. Remplace le rythme uniforme dérivé de `fps`.

Les états **absents** du pack retombent sur le comportement runtime existant (repli vers `idle` côté résolution d’état).

## Validation CLI

```bash
npm run mascot:pack:validate -- docs/mascot-pack.example.json
```

Génération d’un module manifeste (même idée que [`renard2-cut-manifest.js`](../src/data/renard2-cut-manifest.js)) :

```bash
node scripts/mascot-pack-validate.cjs mon-pack.json --generate-js src/data/mon-pack-manifest.js
```

Puis importer ce manifeste dans le catalogue et appeler `expandMascotPackToSpriteCut` **ou** recopier la structure `spriteCut` produite par validation côté code.

## API utilitaire (Zod)

- [`src/utils/mascotPack.js`](../src/utils/mascotPack.js) : `mascotPackSchemaV1`, `parseMascotPackV1`, `validateMascotPackV1`, `expandMascotPackToSpriteCut`.
- Option **`relaxAssetPrefix: true`** : utilisée par l’outil dev [`mascot-pack-tool.html`](../mascot-pack-tool.html) pour accepter `blob:` et des `framesBase` hors `/assets/`.

## Intégration dans ForetMap

1. Placer les PNG sous `public/assets/mascots/<id>/frames/`.
2. Valider le pack (`npm run mascot:pack:validate`).
3. Ajouter une entrée dans `visitMascotCatalog.js` avec `renderer: 'sprite_cut'`, `spriteCut: { ... }` (dimensions, `stateFrames` avec `srcs` et éventuellement `frameDwellMs`, `displayScale`).
4. `npm run build` si le serveur sert `dist/`, tests catalogue / e2e si nouvelle entrée exposée au sélecteur.

## Outil graphique (dev)

- **Page autonome** : avec **`npm run dev:client`**, ouvrir **`/mascot-pack-tool.html`** (édition JSON, validation, prévisualisation, export). Voir [`docs/LOCAL_DEV.md`](LOCAL_DEV.md).
- **Onglet Visite (prof)** : bouton **« Boîte à outils pack mascotte »** sous l’aperçu mascotte — ouvre la même interface en modale (`visit-views.jsx`), en local comme en production (aperçu client uniquement).

## Rive et spritesheet classique

Ce format ne couvre **pas** les fichiers `.riv` ni les atlases `spritesheet` : flux séparés (éditeur Rive / scripts d’extraction dédiés).
