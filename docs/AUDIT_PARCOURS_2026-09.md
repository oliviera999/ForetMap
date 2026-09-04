# Audit — Parcours de carte (ForetMap / Plan Lyautey)

> Portée : la fonctionnalité **parcours** livrée au lot 8 du plan de convergence
> (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6) — de la table `map_routes` à la feuille basse du
> plan, en passant par l'éditeur prof et l'affiche PDF. Rédigé le 2026-09-04, sur `main` à
> `84dd95a` (v1.145.0).
>
> **État au 2026-09-04 (second passage)** : tous les constats ci-dessous ont été **corrigés**
> dans le même lot, à une exception documentée (§2.6.2, constat infirmé). Chaque section porte
> une ligne **« Corrigé »** qui dit où. Le document reste rédigé au présent de l'audit : c'est
> l'état constaté qui est décrit, la ligne de correction dit ce qui a changé.
>
> Fichiers lus : `migrations/210_map_routes.sql`, `routes/map-routes.js`, `lib/mapRoutes.js`,
> `lib/locationSurfaces.js`, `routes/plan.js`, `src/utils/mapRoutesEditor.js`,
> `src/components/settings/MapRoutesPanel.jsx`, `src/plan/AppPlan.jsx`,
> `src/plan/utils/planRoutes.js`, `src/plan/components/PlanRoutePicker.jsx`,
> `src/plan/components/PlanRouteSheet.jsx`, `scripts/build-pwa.js`, `lib/usage.js`,
> `tests/map-routes.test.js`, `tests-ui/**`, `docs/API.md`, `docs/reference/**`.
>
> **Note d'exécution** : `npm run test:ui` est vert sur la suite entière (3 702 cas après ce
> lot), comme `npm run lint` (0 erreur) et `npm run format:check`. Les tests backend
> (`tests/map-routes.test.js`) et le scénario e2e n'ont **pas** pu être exécutés ici : ni MySQL
> ni Docker dans l'environnement. Les constats backend ont donc été établis par lecture de
> code, avec la ligne exacte en référence, et leurs tests de non-régression sont écrits pour
> être joués par la CI.

---

## 1. Ce que fait la fonctionnalité

Un **parcours** est une liste ordonnée de lieux existants — « le tour des nouveaux
professeurs », « les cinq endroits à voir ». Rien n'y est dupliqué : chaque étape pointe vers
une zone ou un repère par le couple `target_type` / `target_id`, celui déjà employé par la
visite. Aucune validation, aucune progression enregistrée : l'avancement vit sur l'appareil.

| Maillon                 | Où                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Schéma                  | `migrations/210_map_routes.sql` (`map_routes`, `map_route_steps`)                                                                          |
| API                     | `routes/map-routes.js` (7 routes) + helpers purs `lib/mapRoutes.js`                                                                        |
| Publication sur le plan | `routes/plan.js` (`ROUTES_SQL`, `ROUTE_STEPS_SQL`, clé `routes`)                                                                           |
| Éditeur prof            | `src/components/settings/MapRoutesPanel.jsx` + `src/utils/mapRoutesEditor.js`                                                              |
| Lecture visiteur        | `src/plan/AppPlan.jsx`, `PlanRoutePicker`, `PlanRouteSheet`, `src/plan/utils/planRoutes.js`                                                |
| Affiche                 | `GET /api/map-routes/:id/pdf` (PDFKit + `qrcode`, généré localement)                                                                       |
| Doc                     | `docs/API.md` §« Parcours de carte », `docs/reference/foretmap/carte-et-zones.md` §« Les parcours », `docs/reference/plan/presentation.md` |

**Ce qui est solide, et mérite d'être dit** : SQL intégralement paramétré ; remplacement des
étapes en **transaction** (`replaceSteps`, jamais de parcours à moitié réécrit) ; permission
`zones.manage` alignée sur celle des lieux qu'ils enchaînent ; journal d'audit sur les trois
écritures ; invalidation du cache du plan par la version d'écriture globale (aucun hook par
route à maintenir) ; QR code généré **localement**, sans service tiers ; logique pure séparée du
composant et testée sans montage ; accessibilité réelle de l'éditeur (boutons ↑/↓ en doublure
du glisser-déposer, cibles ≥ 44 px, `aria-live` sur le compteur d'étapes).

---

## 2. Constats, par gravité

Gravité : **P1** = à corriger avant la prochaine mise en production · **P2** = à planifier ·
**P3** = gêne réelle mais contournable · **P4** = dette, cohérence, confort.

### 2.1 P1 — Un brouillon est lisible publiquement par son slug ou son id

`routes/map-routes.js:127-137` :

```js
const routes = await loadRoutes('id = ? OR slug = ?', [key, key]);
const route = routes.find((r) => r.is_published) || routes[0];
if (!route) return res.status(404).json({ error: 'Parcours introuvable' });
res.json(route);
```

`GET /api/map-routes/:idOrSlug` est **public** et ne filtre jamais sur `is_published`. Quand
aucun parcours publié ne correspond, le repli `|| routes[0]` sert **le brouillon**, avec sa
description, son public visé et le texte de toutes ses étapes.

Cela contredit trois promesses écrites :

- l'écran de réglages : « Publié (un brouillon reste visible ici seulement) » ;
- `docs/reference/foretmap/carte-et-zones.md:224` : « Un parcours naît **brouillon** : il
  n'apparaît nulle part tant que la case "Publié" n'est pas cochée » ;
- l'intention du catalogue public `GET /api/map-routes`, lui, correctement filtré
  (`routes/map-routes.js:99`).

Un slug est devinable (il dérive du titre : `portes-ouvertes`, `tour-du-lycee`). Le préjudice
reste modéré — du contenu éditorial d'établissement, jamais de donnée nominative — mais la
règle « brouillon » ne tient pas.

**Corrigé** : la route filtre `is_published = 1` (`routes/map-routes.js`) ; seule `/manage` lit
un brouillon. Test : « un brouillon n'est lisible que dans la vue de gestion, jamais par son
slug ni son id » (`tests/map-routes.test.js`).

### 2.2 P2 — La garde d'accès du plan ne couvre pas les parcours

Quand `ui.plan.access_mode = 'code'`, `GET /api/plan/content` répond **401**
`{ access_required: true }` sans laissez-passer (`routes/plan.js:66-72, 373-376`). Mais
`/api/map-routes` est monté à part (`server.js:503`), **sans aucune garde** : un visiteur sans
le code obtient par `GET /api/map-routes?surface=plan` la liste des parcours publiés — titres,
publics visés, descriptions, et l'intégralité des textes d'étapes.

La fuite est partielle (ni les lieux, ni les photos, ni le fond de plan) mais la garde est
présentée comme celle du plan, pas comme celle d'une partie du plan.

**Corrigé** : la garde est extraite dans `lib/planAccess.js` (`isPlanAccessGranted`,
`requirePlanAccess`) et posée sur les deux lectures publiques de `/api/map-routes` ;
`routes/plan.js` consomme le même module. Test : « garde d'accès du plan : le catalogue des
parcours se ferme avec le plan ».

### 2.3 P2 — Les surfaces « Carte » et « Visite » ne mènent nulle part

L'éditeur affiche « Proposé sur » avec les trois surfaces (`SurfaceVisibilityField`,
`MapRoutesPanel.jsx:285-291`), le schéma les porte
(`surfaces SET('map','visit','plan')`), l'API sait les filtrer (`?surface=`), la doc de
référence dit « Les cases "proposé sur" décident des surfaces, comme pour les lieux ».

Or **seul le plan consomme les parcours**. Aucun code de `src/` ni de `src/components/visit/`
ne lit `/api/map-routes` en dehors de l'éditeur ; la Visite et la carte de travail ne
connaissent pas la notion. Un prof qui coche « Visite » et publie obtient un parcours qui
n'apparaît **nulle part**, sans le moindre message.

**Corrigé** (option b) : `SurfaceVisibilityField` accepte `unavailable` — les cases « Carte » et
« Visite » restent lisibles et décochables mais ne se cochent plus, sous la mention « n'affiche
pas encore les parcours », avec un repère sous le champ. `docs/reference/foretmap/carte-et-zones.md`
le dit aussi. La constante `ROUTE_SURFACES_WITHOUT_SCREEN` (`MapRoutesPanel.jsx`) est à vider le
jour où ces écrans existent.

### 2.4 P2 — Le nombre d'étapes annoncé ne correspond pas à celui affiché

Deux comptages coexistent :

- la puce du plan affiche le nombre **brut** : `{route.steps.length} étape(s)`
  (`PlanRoutePicker.jsx:36`) ;
- la feuille affiche le nombre **résolu** : « Étape i sur N » où `N = steps.length` après
  `resolveRouteSteps` (`PlanRouteSheet.jsx:42`).

Or `resolveRouteSteps` écarte silencieusement toute étape dont le lieu n'est pas dans la charge
du plan (`src/plan/utils/planRoutes.js:42`). Un lieu en sort dès qu'il est :

- supprimé (aucune contrainte de clé étrangère ne relie `map_route_steps.target_id` aux zones
  ou aux repères — le couple est polymorphe, c'est un choix de conception assumé) ;
- **masqué sur la surface `plan`** via `hidden_surfaces`, ou porteur de catégories qui
  n'apparaissent pas sur le plan (`routes/plan.js:267, 279` → `isVisibleOnSurface`).

Résultat visible par un visiteur : « 5 étapes » sur la puce, « Étape 1 sur 3 » dans la feuille.
Cas limite : toutes les étapes masquées ⇒ la puce annonce un parcours, la feuille affiche
« Aucune étape » et la description.

Côté prof, **rien ne signale** qu'une étape ajoutée pointe vers un lieu invisible sur le plan :
l'éditeur ne connaît que l'existence du lieu, pas sa visibilité par surface.

**Corrigé**, à la source plutôt qu'à l'affichage : `buildPlanContent` confronte les étapes aux
lieux réellement publiés et n'envoie que celles qui résolvent (`routes/plan.js`). Les deux
comptages deviennent le même nombre, et §2.5 tombe avec. `PlanRoutePicker` ne propose plus un
parcours sans étape affichable. Tests : « un lieu masqué emporte son étape »
(`tests/map-routes.test.js`) et « un parcours sans étape affichable n'est pas proposé »
(`tests-ui/plan/AppPlanMount.test.jsx`).

### 2.5 P3 — Le texte d'une étape survit au masquage de son lieu

Corollaire du précédent, côté charge publique : `routes/plan.js:314-318` publie les `steps`
**sans** les confronter aux zones et repères filtrés juste au-dessus. Le lieu est retiré du
plan, mais son `step_title` et son `step_text` restent dans `GET /api/plan/content`. C'est peu
de chose (du texte éditorial rédigé pour être lu sur place), mais le mécanisme de surfaces est
censé être la réponse unique à « ne pas montrer ce lieu ici ».

**Corrigé** avec §2.4 : le filtre `visiblePlaceKeys` s'applique aux étapes avant sérialisation,
donc ni l'identifiant ni le texte d'une étape masquée ne sortent.

### 2.6 P3 — Trois angles morts de l'expérience visiteur

1. **QR code périmé, silence total.** `AppPlan.jsx:344-358` : un `?parcours=<slug>` introuvable
   (parcours dépublié, supprimé, ou slug changé après impression de l'affiche) est ignoré sans
   un mot. Le visiteur scanne, arrive sur le plan nu, et n'apprend jamais que le parcours qu'on
   lui promettait n'existe plus.

   **Corrigé** : message « Ce parcours n'est plus disponible. » dans le bandeau de statut, et la
   garde de l'effet porte désormais sur le contenu chargé et non sur `routes.length` — un plan
   sans aucun parcours publié restait muet même pour un lien profond. Tests : deux cas de
   montage (`tests-ui/plan/AppPlanMount.test.jsx`) et le scénario e2e.

2. **Toucher un lieu pendant un parcours ne fait rien** — **constat infirmé, rien à corriger.**
   La lecture du seul `AppPlan.jsx:515` (`place={activeRoute ? null : selectedPlace}`) laissait
   croire à un geste sans effet. Vérification au montage : `BottomSheet` pose `inert` sur tous
   les frères de sa surcouche tant qu'elle est ouverte (`useInertSiblings`), donc pendant un
   parcours la carte, la recherche et la feuille de résultats ne sont **pas atteignables** — il
   n'y a pas de geste à expliquer. La ligne 515 est une ceinture, pas la seule barrière. Un
   correctif avait été écrit puis retiré : il aurait été du code mort.

   Reste une question de conception, hors périmètre de cet audit : `inert` est posé quel que soit
   le cran de la feuille, y compris au cran bas où la carte est visible. C'est le comportement de
   toutes les feuilles du plan, pas une particularité des parcours.

3. **`routeIndex` n'est pas reborné quand les étapes rétrécissent.** Si la charge est
   rafraîchie et qu'une étape disparaît, `routeSteps[routeIndex]` peut devenir `undefined` et la
   feuille bascule sur le message « pas encore d'étape affichable » (`AppPlan.jsx:274`).
   `goToRouteIndex` borne, mais l'effet de rechargement ne repasse pas par lui.

   **Corrigé** : un effet reborne l'index sur `routeSteps.length` (`nextRouteIndex`).

### 2.7 P3 — Le serveur ne vérifie jamais qu'une étape vise un lieu réel

`normalizeRouteSteps` (`lib/mapRoutes.js:46-73`) valide le `target_type` et la présence d'un
`target_id`, **jamais son existence ni son appartenance à la carte du parcours**. On peut donc
créer par l'API un parcours de 60 étapes pointant vers des identifiants inventés, ou vers les
lieux d'une autre carte : la réponse est 201, et le parcours sera vide sur le plan. L'éditeur
s'en garde (il ne propose que les lieux de la carte), mais l'éditeur n'est pas la seule porte.

**Corrigé** : `checkStepTargets` (`routes/map-routes.js`) contrôle les cibles par lot, à la
création comme à la modification, et répond **400** en nommant l'étape fautive. Test : « une
étape doit viser un lieu réel de la carte du parcours ».

### 2.8 P3 — Deux champs texte non bornés

`title` (180), `audience` (120) et `step_title` (180) sont bornés. `description`
(`routes/map-routes.js:180, 233`) et `step_text` (`lib/mapRoutes.js:69`) ne le sont pas : ils
sont passés tels quels à des colonnes `TEXT` (65 535 octets). Vérifié en local :
`normalizeRouteSteps` conserve 70 000 caractères sans broncher. En SQL strict, l'insertion
lève `ER_DATA_TOO_LONG` (1406) — soit une **500** là où un **400** est attendu ; hors mode
strict, c'est une troncature silencieuse au milieu d'une phrase.

**Corrigé** : `ROUTE_DESCRIPTION_MAX = 2000` et `STEP_TEXT_MAX = 4000` (`lib/mapRoutes.js`),
refus en **400** par `normalizeRouteDescription` et `normalizeRouteSteps`. Test : « description
et texte d'étape bornés : 400, jamais une erreur SQL ».

### 2.9 P4 — Détails à ramasser

| #   | Constat                                                                                                             | Corrigé par                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a   | `sort_order` vidé dans l'éditeur devenait **0** et non 100 : le parcours remontait en tête sans qu'on l'ait demandé | `ROUTE_SORT_ORDER_DEFAULT` + `sortOrderOr` (`mapRoutesEditor.js`), avec deux tests               |
| b   | `GET /:idOrSlug` cherchait `id = ? OR slug = ?` sans filtre de carte, alors que le slug n'est unique que par carte  | `?map_id=` accepté et documenté (`routes/map-routes.js`, `docs/API.md`)                          |
| c   | Changer le slug d'un parcours publié invalidait les affiches imprimées, sans un mot dans l'éditeur                  | Avertissement sous le champ dès que le slug change sur un parcours publié (`MapRoutesPanel.jsx`) |
| d   | `map_id` ignoré en silence au `PUT`, ni documenté ni signalé                                                        | Comportement documenté (en-tête de la route et `docs/API.md`)                                    |
| e   | `/api/map-routes` dans l'allowlist du service worker du plan, alors qu'aucun client ne l'appelle                    | Entrée retirée (`scripts/build-pwa.js`)                                                          |
| f   | `emitGardenChanged` réveillait les clients ForetMap pour une donnée que ForetMap n'affiche pas                      | Les trois émissions retirées (`routes/map-routes.js`)                                            |
| g   | `ROUTE_STEPS_MAX` dupliqué serveur/client sans test de miroir                                                       | Test de miroir par `createRequire` (`tests-ui/utils/mapRoutesEditor.test.js`)                    |
| h   | L'éditeur chargeait toutes les zones et repères de toutes les cartes puis filtrait côté client                      | `?map_id=` passé aux deux routes (`MapRoutesPanel.jsx`)                                          |
| i   | `slugifyRouteTitle` tronquait à 120 **après** avoir retiré les tirets de bord : slug terminé par `-` possible       | Troncature puis nettoyage des bords (`lib/mapRoutes.js`), avec assertion                         |
| j   | L'export PDF n'était pas journalisé, à la différence des trois écritures                                            | `logAudit('map_route_pdf_export', …)` avec le lien imprimé (`routes/map-routes.js`)              |

---

## 3. Couverture de tests

**Ce qui est couvert.** `tests/map-routes.test.js` (7 cas) : helpers purs, création + étapes +
publication + filtre de surface, remplacement en bloc, slug unique, refus sans permission,
cascade de suppression, export PDF (en-têtes et magie `%PDF`), publication dans
`/api/plan/content`. Côté UI, 39 tests verts : `mapRoutesEditor` (logique pure, exhaustive),
`MapRoutesPanel` (9 cas de montage), `planRoutes` (lien profond, résolution, bornes) et un cas
de bout en bout du mode parcours dans `AppPlanMount.test.jsx:252`.

**Les trous relevés, et comment ils sont bouchés.**

| Trou                                                                     | Comblé par                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Rien n'affirmait qu'un brouillon reste privé par `/:idOrSlug`            | `tests/map-routes.test.js` — brouillon 404 en public, 200 en gestion, puis publié 200    |
| Aucun test de la garde d'accès sur `/api/map-routes`                     | `tests/map-routes.test.js` — 401 sans laissez-passer, 200 avec, gestion intacte          |
| Aucun scénario e2e du mode parcours du plan                              | `e2e/plan-routes-mode.spec.js` — puce, lien profond, affiche périmée, sortie             |
| Pas de test du lien profond `?parcours=` au montage                      | `tests-ui/plan/AppPlanMount.test.jsx` — slug connu, puis slug disparu                    |
| Rien sur la cohérence des comptages ni sur une étape masquée par surface | `tests/map-routes.test.js` (charge du plan) et le cas « parcours sans étape affichable » |
| Pas de test de miroir de `ROUTE_STEPS_MAX`                               | `tests-ui/utils/mapRoutesEditor.test.js`                                                 |

Le compte après ce lot : **12 cas** backend (`tests/map-routes.test.js`), **31** dans
`tests-ui/utils/mapRoutesEditor.test.js`, **17** dans `tests-ui/plan/AppPlanMount.test.jsx`, plus
le scénario e2e.

---

## 4. État de la remise en état

| Lot   | Contenu                                                                                         | État                                  |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| **A** | §2.1 brouillon privé + §2.2 garde d'accès, avec les deux tests backend                          | fait                                  |
| **B** | §2.4 / §2.5 étapes filtrées à la source, §2.6.1 message, §2.6.3 rebornage, e2e du mode parcours | fait (§2.6.2 infirmé, sans objet)     |
| **C** | §2.7 validation des cibles d'étape + §2.8 bornes de texte (400 au lieu de 500)                  | fait                                  |
| **D** | §2.3 surfaces sans écran : cases fermées et dites comme telles, doc de référence en accord      | fait (l'implémentation reste ouverte) |
| **E** | §2.9 a→j                                                                                        | fait                                  |

Reste ouvert, hors périmètre d'un audit de la fonctionnalité : **implémenter** les parcours sur
la carte de travail et sur la Visite (§2.3, option c), et la question de conception du `inert`
posé par les feuilles basses quel que soit leur cran (§2.6.2).

---

## 5. Ce qui n'a pas pu être vérifié ici

- **Exécution des tests backend** : ni MySQL ni Docker dans l'environnement — les cas de
  `tests/map-routes.test.js`, y compris ceux ajoutés par ce lot, n'ont pas été rejoués. À lancer
  (`npm test`) sur un poste équipé ; la CI du dépôt les exécute.
- **Rendu réel du PDF** (mise en page, débordement d'un parcours de 60 étapes sur plusieurs
  pages A4).
- **Comportement hors ligne** du mode parcours (service worker), qui demande un navigateur.
- **Le scénario e2e** (`e2e/plan-routes-mode.spec.js`) n'a pas été exécuté ici : il demande une
  base et un serveur. Il est écrit pour se **sauter** proprement si la base locale n'a pas deux
  lieux publiés ou pas de compte professeur e2e.
