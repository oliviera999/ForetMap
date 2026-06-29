# Mascotte visite — format « mascot pack » v1 / v2 (`sprite_cut`)

Ce document décrit le JSON **mascot pack** versions **1** et **2** : source de vérité pour une mascotte **`renderer: sprite_cut`** (images PNG par frame), alignée sur le catalogue [`src/utils/visitMascotCatalog.js`](../src/utils/visitMascotCatalog.js) et le moteur [`VisitMapMascotSpriteCut.jsx`](../src/components/VisitMapMascotSpriteCut.jsx).

**Prod / runtime sans `src/` :** la validation Zod côté API et les clés d’**`interactionProfile`** sont servies depuis le miroir **`lib/visit-pack/`** (`mascotPack.js`, `visitMascotState.js`, `visitMascotInteractionEvents.js` — synchronisés par **`npm run build`** ou **`npm run sync:visit-pack-lib`**). Les liens ci-dessous vers `src/utils/` restent la référence **développement** ; en exploitation, vérifier la présence des mêmes noms sous **`lib/visit-pack/`** (sonde **`mascotPackLibProbe`** dans **`GET /api/admin/diagnostics`**).

## Version 2 — champs supplémentaires

| Champ                | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mascotPackVersion`  | `2`               | Active le profil d’interaction ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `interactionProfile` | objet (optionnel) | Clés stables listées dans [`visitMascotInteractionEvents.js`](../src/utils/visitMascotInteractionEvents.js) (miroir prod : **`lib/visit-pack/visitMascotInteractionEvents.js`**) ; chaque valeur : `{ mode: 'none' \| 'happy' \| 'transient', state?: état canonique, durationMs?: nombre }` (pour `transient`, `state` requis). Absence d’entrée = **comportement par défaut** (équivalent historique ForetMap).                                                                                                                                                                                                                                          |
| `dialogProfile`      | objet (optionnel) | Clés = événements stables de [`visitMascotDialogEvents.js`](../src/utils/visitMascotDialogEvents.js) **ou** clés personnalisées (`a-z0-9_-`, ex. clé d’un `customTriggers`) ; chaque valeur : tableau de lignes de bulle (`string[]`, max 12 lignes × 160 car.). Une clé personnalisée prend le pas sur la bulle inline du déclencheur (`resolveTriggerDialogLines`). Priorité runtime : **pack** → surcharges catalogue (`content.visit.mascot_dialog.catalog_overrides`) → défauts globaux (`content.visit.mascot_dialog.defaults`) → textes code. Studio prof : onglet **Bulles de dialogue** (qui liste aussi les déclencheurs personnalisés du pack). |

**Bibliothèque sprites** : `framesBase` peut aussi être `/api/visit/mascot-sprite-library/{mapId}/assets/` (PNG partagés par carte, voir **`docs/API.md`**).

### Comportements extensibles (états & déclencheurs personnalisés)

Au-delà de la palette d'états **prédéfinis** (`VISIT_MASCOT_STATE`, élargie aux états `sleep`,
`wave`, `dance`, `eat`, `search`, `sad`, `love`, `point`), un pack peut **déclarer ses propres
comportements**. Édition au **studio prof** (visite : onglet _Comportements personnalisés_ de
l'éditeur WYSIWYG ; GL : champs JSON `states` / `triggers`).

| Champ            | Type                | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customStates`   | tableau (optionnel) | États d'animation personnalisés : `{ key, label }`. `key` en kebab/snake-case (`^[a-z0-9]+(?:[-_][a-z0-9]+)*$`, ≤ 40 car.), **unique** et **différente** des états canoniques. Donnez-leur des images via `stateFrames.<key>`. Utilisables comme cible d'alias, de règle d'interaction et de déclencheur. Max 24.                                                                                                                 |
| `customTriggers` | tableau (optionnel) | Déclencheurs pilotés par les données : `{ key, label, type, state, durationMs, everyMs?, dialog? }`. `type: 'periodic'` joue `state` pendant `durationMs` toutes les `everyMs` ms (≥ 1000) — comportement ambiant ; `type: 'tap'` joue `state` au clic/tap sur la mascotte. `state` = état canonique **ou** `customStates`. `dialog` = bulles optionnelles (≤ 12 × 160 car.). Clé non réservée (≠ événements prédéfinis). Max 16. |

**Forme unifiée `states[]` (entrée, aligné GL)** : au lieu de `stateFrames` (objet) + `customStates`,
un pack peut déclarer ses états en **tableau** : `states: [{ key, label?, files?|srcs?, fps?,
frameDwellMs? }]`. À la lecture, `normalizeUnifiedStates` désucre cette forme vers
`stateFrames`/`customStates` (une entrée à clé non canonique **déclare** l'état). Les deux formes
sont acceptées ; la persistance reste en forme canonique. Conversion inverse :
`mascotPackToUnifiedStates(pack)`.

Déclencheur d'interaction **général** ajouté à la palette v2 : **`mascotTap`** (tap/clic direct sur
la mascotte), configurable dans `interactionProfile` comme les autres événements.

Runtime : le **moteur de comportement partagé** (`src/utils/mascotBehaviorEngine.js`,
`resolveTriggerAction` / `runBehaviorAction`) est consommé par la visite
(**`useAmbientMascotBehavior`** + tap) **et** par le plateau GL
(**`useGLBoardAmbientBehavior`**, par équipe). Il lance les déclencheurs `periodic`
(respecte `prefers-reduced-motion`) ; `resolveVisitMascotState({ extraStates })` accepte les états
personnalisés du pack actif. Côté **GL**, le pack JSON accepte `states[].label` et un tableau
`triggers` (mêmes types) ; la conversion `glMascotPackToVisit` **préserve** les clés d'état non
canoniques (déclarées en `customStates`) et **porte** les `triggers` vers `customTriggers`.

## Champs racine (v1 et v2)

| Champ                | Type                | Description                                                                                                                                                                                     |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mascotPackVersion`  | `1` ou `2`          | Version du schéma.                                                                                                                                                                              |
| `id`                 | string              | Identifiant catalogue (`kebab-case`, lettres minuscules et chiffres).                                                                                                                           |
| `label`              | string              | Libellé affiché dans le sélecteur prof.                                                                                                                                                         |
| `renderer`           | `"sprite_cut"`      | Seule valeur supportée par ce format.                                                                                                                                                           |
| `framesBase`         | string              | URL-prefix des frames, ex. `/assets/mascots/mon-id/frames/` (slash final recommandé) **ou** `/api/visit/mascot-packs/{uuid}/assets/` **ou** `/api/visit/mascot-sprite-library/{mapId}/assets/`. |
| `frameWidth`         | entier              | Largeur logique d’une cellule (px).                                                                                                                                                             |
| `frameHeight`        | entier              | Hauteur logique (px).                                                                                                                                                                           |
| `pixelated`          | booléen (optionnel) | Défaut `true` : rendu pixelated.                                                                                                                                                                |
| `displayScale`       | nombre (optionnel)  | Facteur d’affichage `0.25`–`4` (défaut `1`).                                                                                                                                                    |
| `fallbackSilhouette` | string              | Silhouette SVG existante (ex. `gnome`, `backpackFox2`, …).                                                                                                                                      |
| `stateAliases`       | objet (optionnel)   | Map `état_alias → état_cible` (clés = états canoniques).                                                                                                                                        |
| `stateFrames`        | objet               | Clés = **états visite canoniques** uniquement (voir `VISIT_MASCOT_STATE` dans [`visitMascotState.js`](../src/utils/visitMascotState.js)).                                                       |

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

1. **Onglet prof « Packs mascotte »** (barre du haut) : studio — liste, brouillon, duplication (pack ou modèle catalogue), onglet **Édition guidée** (fiche comportements + éditeur visuel WYSIWYG + bibliothèque sprites + inventaire **`GET /api/visit/mascot-assets`**), onglet JSON, profil d’interaction (v2), aperçu global, publication (API **`visit.manage`** + élévation PIN). L’éditeur applique une **validation automatique** (retour inline) et la sauvegarde/publication effectue une **pré-validation stricte** alignée serveur (préfixes `framesBase`).
2. Les packs **publiés** sont renvoyés dans **`GET /api/visit/content`** (`mascot_packs`) et fusionnés au sélecteur mascotte pour cette carte (identifiant runtime = **`catalog_id`**, préfixe `srv-…`).
3. Médiathèque : **`GET /api/visit/mascot-packs/:id/assets`** (liste des PNG), **`POST …/assets`**, **`DELETE …/assets/:filename`** ; `framesBase` = **`/api/visit/mascot-packs/{id}/assets/`** — voir **`docs/API.md`**.

## Archive ZIP v1 (export / import portable)

Format **`foretmap-mascot-pack-archive`** (`formatVersion: 1`) :

```
mon-pack.zip
├── manifest.json   # variant visit | gl, source, warnings
├── pack.json       # charge utile complète (v2 visite : interaction + dialogue)
└── assets/         # PNG embarqués ; framesBase portable = ./assets/
```

- **Visite** : `GET /api/visit/mascot-packs/:id/export.zip` ; import `POST …/import` (`mode: create` ou `replace` + `target_pack_id`). Studio : boutons **Exporter ZIP** / **Importer ZIP** dans `VisitMascotPackManager`.
- **Forme `states[]` à l'export (opt-in)** : `GET …/export.zip?unified=1` (bouton **Exporter ZIP (states[])**) émet `pack.json` en **forme unifiée `states[]`** (aligné GL) au lieu de `stateFrames` ; `manifest.statesForm` vaut `unified` (sinon `stateFrames`). **L'import accepte les deux formes** : un `pack.json` en `states[]` est réécrit puis désucré par `normalizeUnifiedStates` (round-trip sans perte, `customStates` re-dérivés). La persistance serveur reste en forme canonique.
- **GL** : routes équivalentes sous `/api/gl/mascots/packs/…` ; studio `GLMascotPackManager`.
- **Limites** : mêmes bornes que la médiathèque (`FORETMAP_CONTENT_LIBRARY_MAX_*`, défaut 50 Mo archive / 100 Mo décompressé / 200 fichiers).
- **URLs externes** (`https://…`) : non téléchargées ; listées dans `manifest.warnings`.

## Outil graphique (dev)

- **Page autonome** : avec **`npm run dev:client`**, ouvrir **`/mascot-pack-tool.html`** (onglets **Éditeur visuel** / **JSON / export**, validation, prévisualisation). Les URLs **`blob:`** en **`srcs`** sont possibles avec l’assouplissement `relaxAssetPrefix`. Voir [`docs/LOCAL_DEV.md`](LOCAL_DEV.md).
- **Studio** : `VisitMascotPackManager.jsx` + **`MascotPackWysiwygEditor.jsx`** (`mascotPackEditorModel.js`, `MascotPackPreviewPanel.jsx`).

## Rive et spritesheet classique

Ce format ne couvre **pas** les fichiers `.riv` ni les atlases `spritesheet` : flux séparés (éditeur Rive / scripts d’extraction dédiés).

## Divergence ForetMap (visite) vs Gnomes & Licornes (Lot 2C)

Le catalogue **visite** (`src/utils/visitMascotCatalog.js`, mascottes forêt comme `renard2-cut-spritesheet`, `tan-bird-spritesheet`, …) reste la **source de vérité** pour le studio packs mascotte (`VisitMascotPackManager`) et pour le rendu sur la carte forêt (`VisitMapMascotRenderer`). Il continue de supporter les renderers `rive`, `spritesheet`, `sprite_cut`, plus les packs serveur publiés (`srv-*`).

Le catalogue **G&L** reste **séparé** pour la production des mascottes (`src/utils/glMascotCatalog.js` : gnomes/licornes `gl-*`, rendu `GLMascotFallbackSvg`). Toutefois, l’assignation en jeu (`GET/POST /api/gl/mascots*`) expose désormais un **catalogue unifié** : entrées G&L (`source: 'gl'`) + mascottes ForetMap visite (`source: 'foretmap'`, renderers `rive`/`spritesheet`/`sprite_cut`). Cela permet d’utiliser les mascottes ForetMap dans G&L sans casser la compatibilité des ids historiques déjà stockés dans `gl_teams.mascot_id`.

### Packs GL (`sprite_cut`) et mutualisation

- Schéma JSON GL distinct : [`src/utils/glMascotPack.js`](../src/utils/glMascotPack.js) (liste `assets` / `states`), miroir serveur **`lib/gl-pack/mascotPack.js`** (**`npm run sync:gl-pack-lib`**, enchaîné par **`npm run build`** comme pour la visite).
- Studio admin GL : `GLMascotPackWysiwygEditor` — validation Zod inline + prévisualisation via [`src/utils/glMascotPackToVisit.js`](../src/utils/glMascotPackToVisit.js) (conversion vers le format visite + `expandMascotPackToSpriteCut`).
- UI partagée : [`src/shared/mascot-pack/`](../src/shared/mascot-pack/) (`MascotPackValidationList`, `MascotPackSpriteCutPreview`, helpers Zod).
- Le catalogue **visite** et le catalogue **`gl-*`** restent séparés ; l’assignation jeu GL peut toutefois référencer les deux sources (`docs/GL_ARCHITECTURE.md`).
