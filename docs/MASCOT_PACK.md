# Mascotte visite — format « mascot pack » v1 / v2 (`sprite_cut`)

Ce document décrit le JSON **mascot pack** versions **1** et **2** : source de vérité pour une mascotte **`renderer: sprite_cut`** (images PNG par frame), alignée sur le catalogue [`src/utils/visitMascotCatalog.js`](../src/utils/visitMascotCatalog.js) et le moteur [`VisitMapMascotSpriteCut.jsx`](../src/components/VisitMapMascotSpriteCut.jsx).

## Version 2 — champs supplémentaires

| Champ | Type | Description |
|--------|------|-------------|
| `mascotPackVersion` | `2` | Active le profil d’interaction ci-dessous. |
| `interactionProfile` | objet (optionnel) | Clés stables listées dans [`visitMascotInteractionEvents.js`](../src/utils/visitMascotInteractionEvents.js) ; chaque valeur : `{ mode: 'none' \| 'happy' \| 'transient', state?: état canonique, durationMs?: nombre }` (pour `transient`, `state` requis). Absence d’entrée = **comportement par défaut** (équivalent historique ForetMap). |

**Bibliothèque sprites** : `framesBase` peut aussi être `/api/visit/mascot-sprite-library/{mapId}/assets/` (PNG partagés par carte, voir **`docs/API.md`**).

## Champs racine (v1 et v2)

| Champ | Type | Description |
|--------|------|-------------|
| `mascotPackVersion` | `1` ou `2` | Version du schéma. |
| `id` | string | Identifiant catalogue (`kebab-case`, lettres minuscules et chiffres). |
| `label` | string | Libellé affiché dans le sélecteur prof. |
| `renderer` | `"sprite_cut"` | Seule valeur supportée par ce format. |
| `framesBase` | string | URL-prefix des frames, ex. `/assets/mascots/mon-id/frames/` (slash final recommandé) **ou** `/api/visit/mascot-packs/{uuid}/assets/` **ou** `/api/visit/mascot-sprite-library/{mapId}/assets/`. |
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

- [`src/utils/mascotPack.js`](../src/utils/mascotPack.js) : `mascotPackSchemaV1`, `parseMascotPackV1`, `validateMascotPackV1`, `expandMascotPackToSpriteCut` (copie serveur synchronisée : **`lib/visit-pack/`** via `npm run build` ou **`npm run sync:visit-pack-lib`**).
- Option **`relaxAssetPrefix: true`** : utilisée par l’outil [`mascot-pack-tool.html`](../mascot-pack-tool.html) / modale visite pour accepter `blob:` et des `framesBase` hors `/assets/` côté prévisualisation.
- Option **`allowedFramesBasePrefixes`** : côté serveur (routes `/api/visit/mascot-packs`), autorise en plus `/assets/mascots/` une base **`/api/visit/mascot-packs/{id}/assets/`** alignée sur le pack enregistré.

## Intégration dans ForetMap

### Option A — catalogue versionné (dépôt)

1. Placer les PNG sous `public/assets/mascots/<id>/frames/`.
2. Valider le pack (`npm run mascot:pack:validate`).
3. Ajouter une entrée dans `visitMascotCatalog.js` avec `renderer: 'sprite_cut'`, `spriteCut: { ... }` (dimensions, `stateFrames` avec `srcs` et éventuellement `frameDwellMs`, `displayScale`).
4. `npm run build` si le serveur sert `dist/`, tests catalogue / e2e si nouvelle entrée exposée au sélecteur.

### Option B — stockage serveur (MySQL + GUI prof)

1. **Onglet prof « Packs mascotte »** (barre du haut) : studio — liste, brouillon, duplication (pack ou modèle Renard 2), fiche comportements, **éditeur visuel (WYSIWYG)**, JSON, **bibliothèque sprites** par carte, **profil d’interaction** (v2), **aperçu mascotte**, publication (API **`visit.manage`** + élévation PIN). L’onglet **Visite** propose un lien vers ce studio.
2. Les packs **publiés** sont renvoyés dans **`GET /api/visit/content`** (`mascot_packs`) et fusionnés au sélecteur mascotte pour cette carte (identifiant runtime = **`catalog_id`**, préfixe `srv-…`).
3. Médiathèque : **`GET /api/visit/mascot-packs/:id/assets`** (liste des PNG), **`POST …/assets`**, **`DELETE …/assets/:filename`** ; `framesBase` = **`/api/visit/mascot-packs/{id}/assets/`** — voir **`docs/API.md`**.

## Outil graphique (dev)

- **Page autonome** : avec **`npm run dev:client`**, ouvrir **`/mascot-pack-tool.html`** (onglets **Éditeur visuel** / **JSON / export**, validation, prévisualisation). Les URLs **`blob:`** en **`srcs`** sont possibles avec l’assouplissement `relaxAssetPrefix`. Voir [`docs/LOCAL_DEV.md`](LOCAL_DEV.md).
- **Studio** : `VisitMascotPackManager.jsx` + **`MascotPackWysiwygEditor.jsx`** (`mascotPackEditorModel.js`, `MascotPackPreviewPanel.jsx`).

## Rive et spritesheet classique

Ce format ne couvre **pas** les fichiers `.riv` ni les atlases `spritesheet` : flux séparés (éditeur Rive / scripts d’extraction dédiés).
