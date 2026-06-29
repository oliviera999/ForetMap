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
   point d'itération + assouplir un `.strict()`. On l'a fait pour les états & déclencheurs
   personnalisés ; les **dialogues** restent figés (`dialogProfileSchema` en `.strict()`).

3. **Le pont `glMascotPackToVisit` est lossy et redondant.** Historiquement, un état GL
   inconnu retombait silencieusement sur `idle` (corrigé : clés non canoniques désormais
   préservées en `customStates`). Le pont reduplique aussi de la logique (clamp `displayScale`,
   defaults `frameWidth/Height`, fallback) déjà présente dans `expandMascotPackToSpriteCut`.

4. **Runtimes non mutualisés.** `useVisitMascotStateMachine` (mono-mascotte) et
   `useGLBoardMascotMotion` (multi-équipes) réimplémentent les mêmes idées (état transitoire
   avec timeout, garde anti-`idle`, normalisation) avec des différences subtiles. C'est la
   dette la plus coûteuse : elle a empêché de câbler proprement le **playback ambiant
   per-équipe** côté GL (le board n'a pas d'accès structuré aux `customTriggers` par équipe).

5. **Déclencheurs câblés en dur = points de couplage.** Chaque émission d'événement
   (`markerMarkedSeen`, `mapReadOpen`, mouvement…) est codée dans les vues
   (`visit-views.jsx`, `useMapViewMascot.js`, board GL). Ajouter un déclencheur « réel »
   suppose toujours d'éditer le runtime, jamais seulement la donnée.

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

### Étape 1 — Registre central (S, faible risque)

Introduire un module unique qui **dérive** les options d'états/déclencheurs depuis
`(palette canonique ⊕ pack actif)` au lieu d'importer des constantes figées. Brancher les
éditeurs et les dropdowns dessus. Les enums restent comme **valeurs par défaut**, pas comme
frontière de validation. Bénéfice immédiat : plus de double-maintenance à chaque ajout.

### Étape 2 — Dialogues data-driven (S)

Aligner `dialogProfile` sur le modèle déjà retenu pour `customTriggers` : retirer le
`.strict()`, autoriser des clés d'événements personnalisées, valider au niveau pack. Cohérent
avec ce qui existe désormais pour états/déclencheurs.

### Étape 3 — Moteur de comportement unifié (M)

Extraire un `resolveBehavior(trigger, ctx) → action` partagé, consommé par FM **et** GL.
`useAmbientMascotBehavior` (déjà data-driven) en est le premier client ; étendre aux
déclencheurs `tap` et, à terme, aux événements de gameplay.

### Étape 4 — Émetteurs déclaratifs (M)

Remplacer les appels en dur (`triggerMascotTransientState(STATE, ms)` disséminés) par des
**émissions d'événements nommés** (`emit('markerMarkedSeen')`) que le moteur (étape 3) résout
via le profil du pack. Découple le runtime de la donnée : un nouveau déclencheur devient une
entrée de pack, plus une édition de vue.

### Étape 5 — Schéma de pack unifié (L, risque élevé)

`states` en `Array<{key,label?,frames,fps?,frameDwellMs?}>` côté FM aussi. Migration douce :
accepter **les deux** formes en lecture (`stateFrames` objet _ou_ `states` tableau),
normaliser à l'entrée, n'émettre que la nouvelle forme à l'écriture. Les packs `pack_json`
existants restent valides. `customStates` devient un alias rétro-compatible.

### Étape 6 — Retrait du pont (M)

Une fois le schéma unifié, `glMascotPackToVisit` n'a plus qu'à résoudre `assets[idx] → src`
(spécificité GL) puis déléguer à `expandMascotPackToSpriteCut`. La logique dupliquée
(clamp/defaults) disparaît.

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
