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
   _Levé_ : moteur partagé (étape 3) + ambiant GL câblé ; **mécanique transitoire désormais
   factorisée** dans `useMascotTransientState` (étape 7), consommée par les deux runtimes.

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

### Étape 7 — Runtime commun (L, risque élevé) ✅ réalisée

Hook partagé **`src/hooks/useMascotTransientState.js`** : factorise la mécanique « état transitoire

- timeout + garde anti-idle » en un primitif **paramétré par arité** via une _clé_ — le runtime
  **mono** (`useVisitMascotStateMachine`, `triggerMascotTransientState`) utilise une **clé fixe** ;
  le runtime **multi** (`useGLBoardMascotMotion`, `triggerTransient(teamId, …)`) utilise
  l'**identifiant d'équipe**. Le hook gère le registre de timers (un par clé), l'annulation du timer
  précédent, la résolution de durée (`Math.max(min, Number(durationMs ?? default) || fallback)`) et le
  nettoyage au démontage. Chaque produit ne fournit que ses spécificités : `resolveState`
  (visite résout via `resolveVisitMascotState({ extraStates })` ; GL trim brut), `idleState`,
  durées (visite `1500`, GL `900`), et les _applicateurs_ d'état (visite : `setState` ; GL :
  `patchMotion(teamId, { transientState })`).

**Comportement observable strictement préservé** : priorité `transient > happy > walking` de la
visite, localStorage de l'id mascotte, aperçu/reset ; côté GL `walking`/`happy`/`faceRight`/
`snapCenter`, timers de déplacement (`moveTeamTo`/`moveTeamAlongPath`), ambiant per-équipe
(`useGLBoardAmbientBehavior`) et états personnalisés (`GLBoardMascot`). La logique transitoire
dupliquée (refs de timeout, garde, clamp) disparaît des deux runtimes. Couvert par
`tests-ui/hooks/useMascotTransientState.test.js` + les suites existantes (mono/GL/ambiant) restées
vertes.

### Étape 8 — Registre unifié de **sélection** (S/M) ✅ réalisée

Les étapes 1 à 7 unifiaient le **format** et le **moteur**. Restait un troisième axe, jamais
inventorié : **« quelle mascotte, pour qui, où »** — la couche sélection/réglages, qui portait
l'essentiel de la confusion côté exploitation.

Constat avant ce lot : la liste des mascottes existait en **quatre exemplaires** (catalogue
`src/utils/visitMascotCatalog.js`, son miroir `lib/visit-pack/`, `KNOWN_VISIT_MASCOT_IDS` dans
`lib/settings.js`, `DEFAULT_VISIT_MASCOT_ALLOWED_IDS` dans `src/constants/app-runtime.js`), et
elles avaient **divergé** (`gnome1` présent au catalogue, absent des listes → mascotte
inatteignable par l'UI). Les packs publiés vivaient à côté du système : jamais filtrés par la
liste autorisée, jamais éligibles au rôle de mascotte par défaut, et chargés **par carte**.

Principes retenus :

- **Un registre, deux sources.** `lib/visitMascotRegistry.js` expose `catalogue livré ∪ packs
publiés` ; `GET /api/visit/mascots` le sert au panneau admin, au sélecteur de profil et au plan.
  Un pack (`srv-…`) est une mascotte de plein droit : autorisable, désignable par défaut.
- **Pas de liste blanche serveur.** `lib/settings.js` ne valide plus que la **forme** de l'id.
  La seule liste de mascottes qui subsiste est le catalogue front (+ son miroir de build) : plus
  aucune copie à synchroniser, donc plus de divergence possible.
- **Vide = tout.** `ui.visit.mascot.allowed_ids` vide signifie « aucune restriction » et
  `ui.visit.mascot.default_id` vide « mascotte livrée par défaut ». Une mascotte ajoutée plus tard
  est proposée sans intervention.
- **Registre global, pas par carte.** Les packs publiés sont dédoublonnés par `catalog_id` toutes
  cartes confondues : le choix du visiteur — et la mascotte par défaut — valent partout.
- **Le dernier choix gagne.** La préférence de profil ne s'applique plus qu'à son **changement**
  (`lastAppliedPreferredRef`), au lieu d'écraser en boucle le choix fait pendant la visite.
- **Un éditeur, pas deux.** Panneau admin dédié (vignettes animées, cases, radio) ; les deux clés
  sont retirées de la grille de réglages en texte libre (`KEYS_HANDLED_BY_PANEL`).

Reste ouvert (candidats au prochain lot) :

1. **Persistance du choix dans le compte.** `PATCH …/profile` exige le mot de passe actuel : le
   choix fait en visite reste local à l'appareil. Une route étroite (`PUT /api/visit/mascot-preference`)
   le rendrait portable d'un appareil à l'autre, et supprimerait le partage de choix sur tablette.
2. **`useMapViewMascot`** (carte de travail) : émetteurs encore câblés en dur (reliquat étape 4).
3. **Convergence GL de la sélection.** `glMascotCatalog` / `GLMascotsAdminView` gardent leur propre
   assignation (par équipe) : le registre `source: 'gl' | 'foretmap'` de `GET /api/gl/mascots` est
   l'analogue GL de `GET /api/visit/mascots` — les deux pourraient partager un même helper de
   fusion et un même panneau de sélection.
4. **Narrateur d'aide (OLU)** : troisième système de mascotte (`lib/helpNarrator.js`, portraits par
   expression) qui ne partage que la liste de silhouettes de repli. À rapprocher du registre si
   l'on veut « choisir OLU parmi les mascottes » plutôt que le configurer à part.

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
