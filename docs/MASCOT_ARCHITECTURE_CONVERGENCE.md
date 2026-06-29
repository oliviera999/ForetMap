# Mascotte FM / GL — note d'architecture & plan de convergence

> Note d'orientation (non normative). Décrit l'état actuel du système de mascotte
> partagé entre **ForetMap (visite)** et **Gnomes & Licornes (GL)**, ses points de
> friction, et un plan de convergence **incrémental et non cassant**. À lire avant
> toute évolution transverse du système mascotte. Voir aussi `docs/MASCOT_PACK.md`.

## 1. État actuel : deux systèmes parallèles + un pont

Le système n'est pas mutualisé au sens d'un noyau commun : ce sont **deux pipelines
parallèles** reliés par une **couche d'adaptation** au moment du rendu.

```
FM (visite)                              GL (Gnomes & Licornes)
─────────────                            ──────────────────────
visitMascotCatalog.js                    glMascotCatalog.js
mascotPack.js  (stateFrames: objet)      glMascotPack.js (states: tableau)
  états validés vs enum VISIT_MASCOT_STATE   clés d'état libres
useVisitMascotStateMachine (mono)        useGLBoardMascotMotion (multi-équipes)
        │                                          │
        │                glMascotPackToVisit.js    │
        └──────────────  (pont de conversion)  ────┘
                                │
                  expandMascotPackToSpriteCut  →  renderer sprite_cut commun
```

Le « partage » réel se limite à : le **format pivot `sprite_cut`**, le **renderer**
(`VisitMapMascotRenderer` réutilisé par GL), et l'**esprit** de la primitive
`triggerTransient(state, durationMs)`. Tout le reste est dédoublé.

## 2. Ce qui fonctionne bien (à préserver)

- **Découpage présentation / état / données.** La primitive générique « jouer un état
  pendant N ms » (`triggerMascotTransientState` côté FM, `triggerTransient` côté GL) est
  une bonne abstraction : elle a permis de brancher le moteur ambiant
  (`useAmbientMascotBehavior`) sans toucher au rendu.
- **`sprite_cut` comme format pivot.** GL produit ses frames autrement (indices dans
  `assets`) mais converge vers la même structure `stateFrames`. Un seul renderer animé à
  maintenir (`VisitMapMascotSpriteCut`).
- **Miroirs `lib/` synchronisés** (`sync:visit-pack-lib`, `sync:gl-pack-lib`) pour servir
  la validation Zod en prod sans `src/`, avec sonde de diagnostic. Contrainte
  d'exploitation bien gérée.

## 3. Points de friction (dette structurelle)

1. **Deux schémas Zod pour la même idée.** FM : `stateFrames` = `Record<état, spec>`,
   états validés contre l'enum `VISIT_MASCOT_STATE`. GL : `states` = `Array<{key, frames}>`,
   clés libres. Conséquence directe : l'extensibilité des états est _native_ côté GL mais a
   nécessité tout un dispositif (`customStates` + assouplissement de `refineMascotPackBody`)
   côté FM. La même notion vit deux fois, différemment.

2. **Conception « enum-first ».** Le frontend itère partout sur des constantes importées en
   dur (`STATE_OPTIONS`, `VISIT_MASCOT_INTERACTION_EVENT_KEYS`, `VISIT_MASCOT_DIALOG_EVENT_KEYS`).
   Chaque dose d'extensibilité oblige à « dériver dynamiquement depuis le pack » à chaque
   point d'itération + assouplir un `.strict()`. _Largement levé_ : registre central (étape 1)
   pour états/déclencheurs ; dialogues data-driven (étape 2).

3. **Le pont `glMascotPackToVisit` est lossy et redondant.** Historiquement, un état GL
   inconnu retombait silencieusement sur `idle` (corrigé : clés non canoniques désormais
   préservées en `customStates`). Le pont reduplique aussi de la logique (clamp `displayScale`,
   defaults `frameWidth/Height`, fallback) déjà présente dans `expandMascotPackToSpriteCut`.

4. **Runtimes non mutualisés.** `useVisitMascotStateMachine` (mono-mascotte) et
   `useGLBoardMascotMotion` (multi-équipes) réimplémentent les mêmes idées (état transitoire
   avec timeout, garde anti-`idle`, normalisation) avec des différences subtiles. C'est la
   dette la plus coûteuse : elle a empêché de câbler proprement le **playback ambiant
   per-équipe** côté GL (le board n'a pas d'accès structuré aux `customTriggers` par équipe).
   _Partiellement levé_ : moteur partagé (étape 3) + ambiant GL câblé ; reste à fusionner les
   deux machines à états (étape 7).

5. **Déclencheurs câblés en dur = points de couplage.** Chaque émission d'événement
   (`markerMarkedSeen`, `mapReadOpen`, mouvement…) est codée dans les vues
   (`visit-views.jsx`, `useMapViewMascot.js`, board GL). Ajouter un déclencheur « réel »
   suppose toujours d'éditer le runtime, jamais seulement la donnée. _Levé pour `visit-views`
   (étape 4 : `emitMascotEvent`) ; `useMapViewMascot` reste à aligner._

## 4. Architecture cible

Trois principes :

- **Un schéma de pack unique.** `states` comme liste d'objets `{ key, label?, frames, fps? }`
  (le modèle GL, plus extensible). Les « états canoniques » deviennent une **convention de
  clés + un mapping de déclenchement**, pas une contrainte de validation. `customStates`
  disparaît : _tout_ état est de premier ordre.
- **Un moteur de comportement commun, data-driven.** Modèle `{ trigger, action }` :
  `trigger ∈ { event, periodic, tap, movement, … }`, `action = jouer un état (durée, bulle)`.
  FM et GL ne fournissent que leurs **émetteurs d'événements spécifiques** ; le moteur
  (résolution règle → transient) est partagé.
- **Un cœur unique de packs.** `expandMascotPackToSpriteCut` comme chemin unique ; FM et GL
  ne sont que deux **sources** de packs alimentant le même cœur. Le pont disparaît.

## 5. Plan de migration incrémental (non cassant)

Ordonné par **ratio valeur / risque croissant**. Chaque étape est livrable seule, derrière
les schémas/tests existants, sans rupture de compatibilité des packs déjà stockés.

| Étape | Intitulé                                    | Effort | Risque | Valeur  | Pré-requis |
| ----- | ------------------------------------------- | ------ | ------ | ------- | ---------- |
| 0     | **Inventaire des itérations enum-first**    | XS     | nul    | socle   | —          |
| 1     | **Registre central états + déclencheurs**   | S      | faible | élevée  | 0          |
| 2     | **Dialogues data-driven (lever `.strict`)** | S      | faible | moyenne | 1          |
| 3     | **Moteur de comportement unifié**           | M      | moyen  | élevée  | 1          |
| 4     | **Émetteurs de déclencheurs déclaratifs**   | M      | moyen  | élevée  | 3          |
| 5     | **Schéma de pack unifié (states[])**        | L      | élevé  | élevée  | 1-4        |
| 6     | **Retrait du pont GL→visit**                | M      | moyen  | moyenne | 5          |
| 7     | **Runtime mascotte commun (mono+multi)**    | L      | élevé  | élevée  | 3-6        |

### Étape 0 — Inventaire (XS)

Lister tous les points d'itération sur les enums (`grep` `STATE_OPTIONS`,
`*_EVENT_KEYS`, `Object.values(VISIT_MASCOT_STATE)`). Sert de checklist pour 1/3. Aucun code.

### Étape 1 — Registre central (S, faible risque) ✅ réalisée

Module `src/utils/visitMascotBehaviorRegistry.js` : **dérive** les options d'états/déclencheurs
depuis `(palette canonique ⊕ pack actif)` au lieu d'importer des constantes figées. Branché sur
les éditeurs (profil d'interaction, alias, comportements personnalisés, WYSIWYG, lot
d'interaction, panneaux images/assets). Les enums restent **valeurs par défaut**, pas frontière
de validation. Effet de bord positif : les états personnalisés sont sélectionnables partout
(cibles d'alias, d'interaction, d'insertion d'images). Reste hors périmètre de l'étape : les
**dialogues** (cf. étape 2) et les **émetteurs** runtime (étape 4).

### Étape 2 — Dialogues data-driven (S) ✅ réalisée

`dialogProfile` aligné sur le modèle `customTriggers` : `.strict()` remplacé par un **record
validé par format** (événement connu **ou** clé personnalisée `a-z0-9_-`). `sanitizeDialogProfile`
conserve désormais les clés personnalisées. La bulle d'un **déclencheur personnalisé** se résout
via `dialogProfile[clé-du-déclencheur]` (`resolveTriggerDialogLines`, prioritaire sur l'inline) et
s'édite au **studio dialogue** (`VisitMascotDialogEditor` liste les `customTriggers` du pack). Une
clé mal formée (ex. camelCase) reste rejetée — rétrocompatibilité des tests préservée.

### Étape 3 — Moteur de comportement unifié (M) ✅ réalisée

Module partagé `src/utils/mascotBehaviorEngine.js` : `resolveTriggerAction(entry, trigger) → action`
(`{ state, durationMs, dialog, everyMs }`), `getAmbientActions` / `getTapActions`, et
`runBehaviorAction(action, { playState, showDialog })` exécuté via les primitives du produit.
Clients : visite (`useAmbientMascotBehavior` + tap) **et** GL (`useGLBoardAmbientBehavior`, par
équipe via `triggerTransient(teamId, …)`, câblé dans `GLGameBoard`). **Conséquence : le playback
ambiant per-équipe du plateau GL — limite connue des étapes précédentes — est désormais câblé.**

### Étape 4 — Émetteurs déclaratifs (M) ✅ réalisée (visite)

`emitMascotEvent(eventKey)` dans `visit-views.jsx` résout l'événement via
`resolveVisitMascotInteraction` (profil du pack, défaut = comportement historique) puis applique
l'action. Les appels en dur `triggerMascotTransientState(STATE, ms)` des sites d'émission
(déplacement long/très long, marquage « vu », ouverture zone/repère, tap) sont remplacés. **Effet
notable : le profil d'interaction (`interactionProfile`) d'un pack agit désormais sur le plan de
visite _live_ — il n'avait jusque-là d'effet qu'en aperçu studio.** Contrat des défauts verrouillé
par `tests/visit-mascot-interaction.test.js`. Reste : `useMapViewMascot` (carte des tâches forêt)
suit le même schéma câblé — à aligner si des packs serveur y sont exposés.

### Étape 5 — Schéma de pack unifié (L, risque élevé) ✅ lecture réalisée

Côté FM, un pack peut désormais être fourni en forme **tableau** `states: [{ key, label?,
files?|srcs?, fps?, frameDwellMs? }]` (alignée sur GL). `normalizeUnifiedStates` (dans
`mascotPack.js`) **désucre** cette forme vers la représentation interne (`stateFrames` +
`customStates`) **avant validation** — tout l'aval (validation/expansion/runtime) reste inchangé.
Une entrée à clé non canonique **déclare** l'état (plus besoin de `customStates` séparé :
« tout état est de premier ordre »). Helper inverse `mascotPackToUnifiedStates` pour l'export /
l'édition future. **Non cassant** : les packs `pack_json` historiques (forme `stateFrames`) restent
valides et la persistance reste en forme canonique.

**Write-side (studio JSON)** : l'onglet **JSON** du studio accepte la forme `states[]` à
l'application (désucrée via `normalizeUnifiedStates`) et propose un bouton **« Forme unifiée
states[] »** (`packToUnifiedForm` → `mascotPackToUnifiedStates`) pour réécrire le brouillon. Le
modèle de l'éditeur visuel et la persistance restent en forme canonique (transform à la frontière).

**Write-side WYSIWYG (follow-up livré)** ✅ : le follow-up « éditeur visuel + export archive en
forme `states[]` » est livré via l'**Option 1** (faible risque, modèle interne canonique inchangé) —
voir l'annotation de l'**étape 6** ci-dessous. L'**import d'archive accepte les deux formes**, un
**export `states[]`** opt-in est disponible (`?unified=1`), et l'éditeur WYSIWYG affiche un
**aperçu « forme unifiée `states[]` »** (lecture seule + copie).

### Étape 6 — Retrait du pont (M) ✅ réalisée

`glMascotPackSpriteCutToVisitValidation` est désormais un **adaptateur mince** : il ne fait que la
**spécificité GL** — résoudre `assets[idx] → src`, remapper les clés d'état
(`mapGlMascotStateKeyToVisit`), porter les `triggers` vers `customTriggers`, et fournir les defaults
de **cadrage** que le schéma GL ne porte pas (`frameWidth/Height`, `fallbackSilhouette`, `id`,
`framesBase`). Il produit la **forme unifiée `states[]`** et **délègue entièrement** à
`validateMascotPack` : le désucrage (`normalizeUnifiedStates` → `stateFrames`/`customStates`) **et**
les clamp/defaults d'animation (`fps`, `pixelated`, `displayScale` via
`expandMascotPackToSpriteCut`) ne vivent plus qu'à **un seul endroit** (le cœur visite). La logique
dupliquée (construction manuelle de `stateFrames`/`customStates`, defaults re-codés) a disparu.
**Non cassant** : prévisualisation GL, `expandGlMascotPackSpriteCut`, catalogue serveur et
`buildGlMascotExtraCatalogEntries` inchangés. Couvert par `tests/gl-mascot-pack-to-visit.test.js`.

### Étape 7 — Runtime commun (L, risque élevé)

Factoriser la mécanique transient (état + timeout + garde) en un hook paramétrable par
**arité** (1 mascotte FM / N équipes GL). Débloque le playback ambiant per-équipe côté GL
(limite connue actuelle) et supprime les divergences subtiles de normalisation.

## 6. Garde-fous

- **Compatibilité packs** : tout changement de schéma lit l'ancien format ; les `pack_json`
  stockés ne sont jamais invalidés (tests de non-régression sur des fixtures v1/v2/GL).
- **Miroirs `lib/`** : toute modif de schéma passe par `npm run build` (resync visit + gl).
- **Tests d'abord** : chaque étape ajoute ses tests backend (`tests/`) et UI (`tests-ui/`)
  dans le même lot, conformément à `CLAUDE.md`.
- **Isolement GL** : la convergence ne doit pas casser la frontière produit (JWT `product`,
  catalogues `gl-*` distincts) — on unifie le _format_ et le _moteur_, pas les _contenus_.

## 7. TL;DR

Bon système **par produit** (abstractions de rendu saines), mais le partage FM/GL est
**superficiel** : un adaptateur, pas un noyau. La conception **enum-first** rend chaque
extensibilité coûteuse. Le lot « comportements extensibles » (palette élargie, `customStates`,
`customTriggers`, moteur ambiant) pousse le curseur vers le data-driven là où ça comptait —
ce plan propose de **généraliser ce mouvement** par étapes sûres jusqu'à un cœur réellement
commun, sans big-bang.
