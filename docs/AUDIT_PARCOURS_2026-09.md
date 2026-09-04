# Audit — Parcours de carte (ForetMap / Plan Lyautey)

> Portée : la fonctionnalité **parcours** livrée au lot 8 du plan de convergence
> (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6) — de la table `map_routes` à la feuille basse du
> plan, en passant par l'éditeur prof et l'affiche PDF. Audit **de lecture** : aucun
> comportement n'a été modifié. Rédigé le 2026-09-04, sur `main` à `84dd95a` (v1.145.0).
>
> Fichiers lus : `migrations/210_map_routes.sql`, `routes/map-routes.js`, `lib/mapRoutes.js`,
> `lib/locationSurfaces.js`, `routes/plan.js`, `src/utils/mapRoutesEditor.js`,
> `src/components/settings/MapRoutesPanel.jsx`, `src/plan/AppPlan.jsx`,
> `src/plan/utils/planRoutes.js`, `src/plan/components/PlanRoutePicker.jsx`,
> `src/plan/components/PlanRouteSheet.jsx`, `scripts/build-pwa.js`, `lib/usage.js`,
> `tests/map-routes.test.js`, `tests-ui/**`, `docs/API.md`, `docs/reference/**`.
>
> **Note d'exécution** : `npm run test:ui` a été rejoué sur les trois fichiers concernés
> (39 tests, tous verts). Les tests backend (`tests/map-routes.test.js`) n'ont **pas** pu être
> exécutés ici : ni MySQL ni Docker ne sont disponibles dans l'environnement d'audit. Les
> constats backend ci-dessous sont donc **statiques** (lecture de code), avec la ligne exacte
> en référence.

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

**Correctif** : filtrer sur `is_published = 1` dans la clause SQL de cette route, et laisser la
vue de gestion (`/manage`, déjà protégée) seule capable de lire un brouillon. Le test
`tests/map-routes.test.js:159-161` ne couvre que le 404 d'un slug inconnu : ajouter le cas
« brouillon → 404 en public, 200 en gestion ».

### 2.2 P2 — La garde d'accès du plan ne couvre pas les parcours

Quand `ui.plan.access_mode = 'code'`, `GET /api/plan/content` répond **401**
`{ access_required: true }` sans laissez-passer (`routes/plan.js:66-72, 373-376`). Mais
`/api/map-routes` est monté à part (`server.js:503`), **sans aucune garde** : un visiteur sans
le code obtient par `GET /api/map-routes?surface=plan` la liste des parcours publiés — titres,
publics visés, descriptions, et l'intégralité des textes d'étapes.

La fuite est partielle (ni les lieux, ni les photos, ni le fond de plan) mais la garde est
présentée comme celle du plan, pas comme celle d'une partie du plan.

**Correctif** : appliquer `checkPlanAccess` aux lectures publiques de `/api/map-routes`, ou —
plus simple et cohérent avec l'usage réel (cf. §2.7) — retirer le catalogue public, que plus
aucun client n'appelle.

### 2.3 P2 — Les surfaces « Carte » et « Visite » ne mènent nulle part

L'éditeur affiche « Proposé sur » avec les trois surfaces (`SurfaceVisibilityField`,
`MapRoutesPanel.jsx:285-291`), le schéma les porte
(`surfaces SET('map','visit','plan')`), l'API sait les filtrer (`?surface=`), la doc de
référence dit « Les cases "proposé sur" décident des surfaces, comme pour les lieux ».

Or **seul le plan consomme les parcours**. Aucun code de `src/` ni de `src/components/visit/`
ne lit `/api/map-routes` en dehors de l'éditeur ; la Visite et la carte de travail ne
connaissent pas la notion. Un prof qui coche « Visite » et publie obtient un parcours qui
n'apparaît **nulle part**, sans le moindre message.

**Correctif** : au choix — (a) restreindre le champ à `plan` dans l'éditeur tant que les deux
autres surfaces n'ont pas de rendu, en le disant dans la doc de référence ; (b) afficher un
avertissement explicite (« la Visite n'affiche pas encore les parcours ») ; (c) implémenter la
lecture côté Visite. (a) est le geste honnête à coût nul.

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

**Correctif** : faire compter la puce sur les étapes résolues (le plan a déjà `places` sous la
main) ; et, dans l'éditeur, marquer les étapes dont le lieu est masqué sur une surface où le
parcours est publié.

### 2.5 P3 — Le texte d'une étape survit au masquage de son lieu

Corollaire du précédent, côté charge publique : `routes/plan.js:314-318` publie les `steps`
**sans** les confronter aux zones et repères filtrés juste au-dessus. Le lieu est retiré du
plan, mais son `step_title` et son `step_text` restent dans `GET /api/plan/content`. C'est peu
de chose (du texte éditorial rédigé pour être lu sur place), mais le mécanisme de surfaces est
censé être la réponse unique à « ne pas montrer ce lieu ici ».

### 2.6 P3 — Trois angles morts de l'expérience visiteur

1. **QR code périmé, silence total.** `AppPlan.jsx:344-358` : un `?parcours=<slug>` introuvable
   (parcours dépublié, supprimé, ou slug changé après impression de l'affiche) est ignoré sans
   un mot. Le visiteur scanne, arrive sur le plan nu, et n'apprend jamais que le parcours qu'on
   lui promettait n'existe plus. Un `role="status"` (« Ce parcours n'est plus disponible ») coûte
   trois lignes.
2. **Toucher un lieu pendant un parcours ne fait rien.** `AppPlan.jsx:515` :
   `place={activeRoute ? null : selectedPlace}` — décision juste (ne pas empiler deux feuilles
   basses), mais l'utilisateur qui touche un repère ou un résultat de recherche pendant un
   parcours n'obtient **aucun retour**. Il faudrait soit désactiver visiblement la sélection en
   mode parcours, soit proposer « quitter le parcours pour ouvrir ce lieu ».
3. **`routeIndex` n'est pas reborné quand les étapes rétrécissent.** Si la charge est
   rafraîchie et qu'une étape disparaît, `routeSteps[routeIndex]` peut devenir `undefined` et la
   feuille bascule sur le message « pas encore d'étape affichable » (`AppPlan.jsx:274`).
   `goToRouteIndex` borne, mais l'effet de rechargement ne repasse pas par lui.

### 2.7 P3 — Le serveur ne vérifie jamais qu'une étape vise un lieu réel

`normalizeRouteSteps` (`lib/mapRoutes.js:46-73`) valide le `target_type` et la présence d'un
`target_id`, **jamais son existence ni son appartenance à la carte du parcours**. On peut donc
créer par l'API un parcours de 60 étapes pointant vers des identifiants inventés, ou vers les
lieux d'une autre carte : la réponse est 201, et le parcours sera vide sur le plan. L'éditeur
s'en garde (il ne propose que les lieux de la carte), mais l'éditeur n'est pas la seule porte.

**Correctif** : une requête de contrôle par lot (`SELECT id FROM zones WHERE map_id = ? AND id
IN (…)`, idem repères) et un **400** nommant l'étape fautive — même forme d'erreur que les
autres validations de la route.

### 2.8 P3 — Deux champs texte non bornés

`title` (180), `audience` (120) et `step_title` (180) sont bornés. `description`
(`routes/map-routes.js:180, 233`) et `step_text` (`lib/mapRoutes.js:69`) ne le sont pas : ils
sont passés tels quels à des colonnes `TEXT` (65 535 octets). Vérifié en local :
`normalizeRouteSteps` conserve 70 000 caractères sans broncher. En SQL strict, l'insertion
lève `ER_DATA_TOO_LONG` (1406) — soit une **500** là où un **400** est attendu ; hors mode
strict, c'est une troncature silencieuse au milieu d'une phrase.

**Correctif** : borner les deux (par exemple 2 000 et 4 000 caractères) et refuser en 400,
comme le reste de la route.

### 2.9 P4 — Détails à ramasser

| #   | Constat                                                                                                                                                                           | Référence                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| a   | `sort_order` vidé dans l'éditeur devient **0** (`Number(...) \|\| 0`) et non 100 : le parcours remonte en tête de liste sans que le prof l'ait demandé                            | `src/utils/mapRoutesEditor.js:60-79`           |
| b   | `GET /:idOrSlug` cherche `id = ? OR slug = ?` **sans filtre de carte**, alors que le slug n'est unique que par carte : deux cartes portant `portes-ouvertes` ⇒ réponse arbitraire | `routes/map-routes.js:131`                     |
| c   | Changer le slug d'un parcours publié invalide toutes les affiches déjà imprimées ; l'éditeur ne prévient pas (la doc de référence, elle, explique le piège)                       | `MapRoutesPanel.jsx:255-262`                   |
| d   | `map_id` est ignoré en silence au `PUT` : un parcours ne change jamais de carte. Choix défendable, mais ni documenté ni signalé                                                   | `routes/map-routes.js:200-259`                 |
| e   | `/api/map-routes` figure dans l'allowlist _stale-while-revalidate_ du service worker du plan, alors qu'aucun client ne l'appelle (les parcours arrivent par `/api/plan/content`)  | `scripts/build-pwa.js:95`                      |
| f   | `emitGardenChanged` est émis à chaque écriture de parcours : les clients ForetMap sont réveillés pour une donnée que ForetMap n'affiche pas                                       | `routes/map-routes.js:194, 258, 278`           |
| g   | `ROUTE_STEPS_MAX = 60` est dupliqué serveur/client sans test de miroir — la divergence ne se verrait qu'à l'usage                                                                 | `lib/mapRoutes.js:25`, `mapRoutesEditor.js:18` |
| h   | L'éditeur charge **toutes** les zones et repères de **toutes** les cartes puis filtre côté client, alors que les deux routes acceptent `?map_id=`                                 | `MapRoutesPanel.jsx:95-102`                    |
| i   | `slugifyRouteTitle` tronque à 120 **après** avoir retiré les tirets de bord : un titre très long peut produire un slug se terminant par `-`                                       | `lib/mapRoutes.js:31-40`                       |
| j   | L'export PDF n'est pas journalisé (`logAudit`), à la différence des trois écritures                                                                                               | `routes/map-routes.js:314-369`                 |

---

## 3. Couverture de tests

**Ce qui est couvert.** `tests/map-routes.test.js` (7 cas) : helpers purs, création + étapes +
publication + filtre de surface, remplacement en bloc, slug unique, refus sans permission,
cascade de suppression, export PDF (en-têtes et magie `%PDF`), publication dans
`/api/plan/content`. Côté UI, 39 tests verts : `mapRoutesEditor` (logique pure, exhaustive),
`MapRoutesPanel` (9 cas de montage), `planRoutes` (lien profond, résolution, bornes) et un cas
de bout en bout du mode parcours dans `AppPlanMount.test.jsx:252`.

**Les trous, dans l'ordre où ils comptent.**

1. **Aucun test n'affirme qu'un brouillon reste privé** par `/:idOrSlug` — c'est exactement le
   trou du §2.1. Le seul cas voisin teste un slug inconnu.
2. **Aucun test de la garde d'accès sur `/api/map-routes`** (§2.2).
3. **Aucun scénario e2e du mode parcours du plan**, alors que `CLAUDE.md` demande un scénario
   `e2e/` pour tout flux UI critique et que le plan a déjà `plan-mobile-shell.spec.js` et
   `plan-mobile-position.spec.js` pour l'accueillir. Le parcours est le flux qu'on imprime sur
   une affiche à l'entrée d'un établissement : c'est le premier à mériter un e2e.
4. **Pas de test du lien profond `?parcours=`** au montage d'`AppPlan` (la logique pure est
   testée, le câblage non), ni du cas « slug introuvable ».
5. Pas de test sur la cohérence des deux comptages d'étapes (§2.4), ni sur une étape dont le
   lieu est masqué par surface.

---

## 4. Plan de remise en état proposé

| Lot   | Contenu                                                                                                                           | Effort    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A** | §2.1 brouillon privé + §2.2 garde d'accès, avec les deux tests backend correspondants                                             | court     |
| **B** | §2.4 comptage cohérent + §2.6.1 message « parcours indisponible » + §2.6.3 rebornage de l'index, avec un e2e du mode parcours     | moyen     |
| **C** | §2.7 validation des cibles d'étape + §2.8 bornes de texte (400 au lieu de 500)                                                    | court     |
| **D** | §2.3 : trancher sur les surfaces `map` / `visit` — restreindre l'éditeur, ou les implémenter ; mettre `docs/reference/` en accord | à décider |
| **E** | §2.9 a→j : le lot de finitions, dont le nettoyage de l'allowlist du service worker et le test de miroir de `ROUTE_STEPS_MAX`      | court     |

Le lot **A** est le seul dont l'absence se paie tout de suite : il ferme un écart entre ce que
la documentation promet aux professeurs et ce que le serveur fait.

---

## 5. Ce que l'audit n'a pas pu vérifier

- **Exécution des tests backend** : ni MySQL ni Docker dans l'environnement — les six cas de
  `tests/map-routes.test.js` n'ont pas été rejoués. À relancer (`npm test`) sur un poste équipé
  avant toute correction.
- **Rendu réel du PDF** (mise en page, débordement d'un parcours de 60 étapes sur une seule page
  A4 : `PDFDocument` ajoute des pages, mais le QR code final peut se retrouver seul sur la
  dernière — non vérifié).
- **Comportement hors ligne** du mode parcours (service worker), qui demande un navigateur.
