# Audit — Système de parcours (ForetMap / Visite / Plan Lyautey / proflyautey)

> Portée : la fonctionnalité **parcours** de bout en bout — table `map_routes`, API
> `/api/map-routes`, publication sur les quatre surfaces (`map`, `visit`, `plan`, `staff`),
> éditeur prof, mode parcours des trois fronts, affiche PDF. Rédigé le **2026-09-17** sur la
> branche `claude/audit-systeme-parcours-1b5e8b` (base `main`, v1.163.1).
>
> **Deuxième passe.** Le premier audit (`docs/AUDIT_PARCOURS_2026-09.md`, 4 sept. 2026) portait
> sur le lot 8 tel que livré : ses neuf constats ont été corrigés et **le sont restés** — §4 le
> vérifie un par un. Cet audit repart de l'état d'aujourd'hui, après deux évolutions que le
> premier ne pouvait pas connaître : la **quatrième surface** `staff` (migration `260`,
> plan des personnels) et l'**extraction du mode parcours** dans `src/shared/map-routes/` pour
> la Visite et la carte de travail.
>
> Fichiers lus : `migrations/210_map_routes.sql`, `migrations/260_location_surface_staff.sql`,
> `sql/schema_foretmap.sql`, `routes/map-routes.js`, `lib/mapRoutes.js`,
> `lib/locationSurfaces.js`, `lib/locationAudience.js`, `lib/planAccess.js`,
> `lib/staffPlanAccess.js`, `lib/mapAccess.js`, `lib/planContent.js`, `routes/plan.js`,
> `routes/staff-plan.js`, `routes/visit.js`, `src/utils/mapRoutesEditor.js`,
> `src/components/settings/MapRoutesPanel.jsx`, `src/shared/map-routes/**`,
> `src/components/map-views.jsx`, `src/components/visit-views.jsx`, `src/plan/AppPlan.jsx`,
> `src/plan/utils/planRoutes.js`, `tests/map-routes.test.js`, `tests-ui/**`,
> `e2e/plan-routes-mode.spec.js`, `docs/API.md`, `docs/reference/plan/presentation.md`.
>
> **État au 2026-09-17 (second passage, même jour)** : les six constats sont **traités**.
> §2.1 et §2.4 l'ont été dans le premier lot ; §2.2, §2.3, §2.5, §2.6 et le §2.7 ajouté par la
> passe d'affichage dans le second. Chaque section porte une ligne **« Corrigé »** qui dit où.
> Le document reste rédigé au présent de l'audit : c'est l'état constaté qui est décrit.
>
> **Note d'exécution** : contrairement au premier audit, la base était disponible ici. Les
> constats §2.1 et §2.4 ont été **reproduits par requête réelle** (supertest sur l'application
> montée), et §2.7 **mesuré dans un navigateur** (Playwright, 390 × 844) — les chiffres sont
> ceux relevés, pas des estimations. `npm test`, `npm run test:ui`, `npm run lint`,
> `npm run format:check` et le scénario e2e du plan sont verts après correction.

---

## 1. Ce que fait la fonctionnalité, aujourd'hui

Un **parcours** est une liste ordonnée de lieux existants — « le tour des nouveaux
professeurs », « les cinq endroits à voir ». Chaque étape pointe vers une zone ou un repère par
le couple `target_type` / `target_id` : rien n'est dupliqué, un renommage suit. Aucune
validation, aucune progression enregistrée côté serveur.

| Maillon                      | Où                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Schéma                       | `migrations/210_map_routes.sql` + `260_location_surface_staff.sql` (surface `staff`)                            |
| API                          | `routes/map-routes.js` (7 routes) + helpers purs `lib/mapRoutes.js`                                             |
| Publication plan / personnel | `lib/planContent.js` (`ROUTES_SQL`, `ROUTE_STEPS_SQL`, clé `routes`) → `routes/plan.js`, `routes/staff-plan.js` |
| Publication visite           | `routes/visit.js` (`routeRowsPromise`, `projectVisitContentForViewer`)                                          |
| Publication carte de travail | `GET /api/map-routes?surface=map` (`src/components/map-views.jsx`)                                              |
| Éditeur prof                 | `src/components/settings/MapRoutesPanel.jsx` + `src/utils/mapRoutesEditor.js`                                   |
| Mode parcours partagé        | `src/shared/map-routes/` (`useMapRouteMode`, `MapRouteBar`, `MapRoutePicker`, `mapRouteSteps`)                  |
| Mode parcours du plan        | `src/plan/AppPlan.jsx` (implémentation propre, cf. §2.5)                                                        |
| Affiche                      | `GET /api/map-routes/:id/pdf` (PDFKit + `qrcode`, généré localement)                                            |

**Ce qui est solide.** SQL intégralement paramétré ; remplacement des étapes en transaction ;
contrôle serveur que chaque étape vise un lieu réel **de la carte du parcours** ; journal
d'audit sur les quatre écritures, export PDF compris ; filtrage des étapes contre les lieux
réellement publiés, refait indépendamment sur les trois charges (`planContent`, `visit`,
catalogue) ; QR code généré sans service tiers ; logique pure séparée des composants et testée
sans montage ; accessibilité réelle de l'éditeur (boutons ↑/↓ en doublure du glisser-déposer,
`aria-live` sur le compteur d'étapes).

---

## 2. Constats, par gravité

Gravité : **P1** = à corriger avant la prochaine mise en production · **P2** = à planifier ·
**P3** = gêne réelle mais contournable · **P4** = dette, cohérence, confort.

### 2.1 P1 — Les surfaces internes (`staff`, `map`) se lisaient sans aucun compte

**Corrigé dans ce lot** (`routes/map-routes.js`, `guardSurfaceRead` + filtre de surface sur le
détail ; tests `tests/map-routes.test.js`).

La migration `260` a ajouté la surface `staff` (plan des personnels) à `map_routes.surfaces`,
et `SurfaceVisibilityField` propose de la cocher dans l'éditeur. `routes/map-routes.js`, lui,
n'a jamais été mis à jour : sa garde ne connaissait que deux cas — la garde du Plan Lyautey
pour `?surface=plan` ou sans surface, et rien du tout pour les autres.

Le commentaire du code disait pourquoi : « les surfaces `map` et `visit` ont leurs propres
écrans dans ForetMap, et ne doivent pas dépendre du code d'accès du Plan Lyautey ». Vrai pour
`visit`, qui est publique. Faux pour `map` (carte de travail, écran interne) et pour `staff`,
dont `lib/locationSurfaces.js` dit noir sur blanc l'inverse :

```js
/** Surfaces ouvertes sans authentification. La surface `staff` n'en fait pas partie : sa
 *  charge n'est servie qu'à un lecteur identifié (permission RBAC) ou porteur du
 *  laissez-passer de code […] */
const PUBLIC_SURFACES = Object.freeze(['visit', 'plan']);
```

`GET /api/staff-plan/content` applique cette règle (401 `auth_required` sans compte ni code).
Le catalogue des parcours de la même surface, non. Reproduit ici sur l'application montée,
**sans en-tête d'authentification** :

```
GET /api/map-routes?surface=staff&map_id=…    → 200
[{"title":"Tour des personnels SONDE",
  "description":"Réservé aux personnels : circuit de sécurité.",
  "audience":"Personnels seulement","surfaces":["staff"],
  "steps":[{"step_title":"Coffre à clés",
            "step_text":"Le code du coffre est affiché derrière la porte."}]}]
```

Trois portes, toutes ouvertes :

1. `?surface=staff` — le parcours entier, textes d'étape compris. Idem `?surface=map` pour la
   carte de travail (vérifié : 200 avec le `step_text`).
2. Sans `map_id` : la garde ne tenait pas davantage à la présence du paramètre.
3. `GET /api/map-routes/:idOrSlug` — ce détail passe la garde du plan, mais **ne regardait
   aucune surface**. Un parcours publié sur la seule surface personnels s'y lisait en entier
   dès lors que le plan public était ouvert (son mode par défaut). Vérifié : 200 sur le même
   parcours `staff`.

Ce qui sort n'est pas le contenu des lieux — `filterPublicRouteSteps` continue d'écarter les
étapes hors audience, et `GET /api/zones` est de toute façon ouvert par choix du projet. Ce qui
sort, c'est le **contenu propre du parcours** : son titre, sa description, son public visé, et
le texte que le rédacteur a écrit pour des personnels, dans le contexte où il ne serait lu que
par eux. « Le code du coffre est affiché derrière la porte » est exactement le genre de phrase
qu'on écrit dans un parcours `staff`.

**Correction.** Une garde par surface, `guardSurfaceRead`, qui aligne chaque catalogue sur la
charge de sa surface : `plan` → garde du plan (inchangé) ; `visit` → ouvert (inchangé) ; `map`
→ compte requis, sans permission particulière, comme l'écran qui l'affiche ; `staff` →
`resolveStaffPlanViewer`, exactement ce qu'exige `/api/staff-plan/content`. Et le détail
`/:idOrSlug` ne sert plus que les parcours publiés sur une surface de `PUBLIC_SURFACES` : un
parcours interne y répond **404**, comme une affiche périmée — la porte du lien profond
imprimé n'a pas à être celle des surfaces internes.

### 2.2 P3 — « Reprendre le parcours » ne reprend pas : il redémarre à l'étape 1

**Corrigé** (`src/shared/map-routes/useMapRouteMode.js` ; tests
`tests-ui/shared/useMapRouteMode.test.jsx`, `tests-ui/plan/AppPlanMount.test.jsx`,
`e2e/plan-routes-mode.spec.js`).

Les trois surfaces étaient touchées, par deux chemins de code différents.

Sur la Visite et la carte de travail (`src/shared/map-routes/useMapRouteMode.js`) :

```js
const startRoute = useCallback((route) => {
  setRoutePickerOpen(false);
  setResumableRouteSlug('');
  setRouteIndex(0); // ← la position est jetée
  setActiveRouteSlug(route.slug);
}, []);

const resumeRoute = useCallback(() => {
  const route = routes.find((r) => r.slug === resumableRouteSlug);
  if (route) startRoute(route); // ← reprendre = redémarrer
}, [routes, resumableRouteSlug, startRoute]);
```

`src/plan/AppPlan.jsx` fait la même chose, dans sa propre copie (§2.5). Le bouton s'appelle
pourtant **« Reprendre le parcours »** sur les trois écrans, et `PlanHelp` promet : « Après
"Quitter", reprenez via la puce ou "Reprendre". » Un visiteur qui quitte à l'étape 7 sur 9 pour
regarder autre chose retrouve l'étape 1 — et n'a aucun moyen de revenir à la 7 autrement qu'en
touchant « Suivant » six fois.

Le trou de couverture était visible dans `e2e/plan-routes-mode.spec.js` : le scénario quittait
le parcours **à l'étape 2 sur 2**, vérifiait que le bouton « Reprendre le parcours »
apparaissait… et s'arrêtait là, sans jamais cliquer dessus.

**Correction.** `exitRoute` mémorise le parcours **et l'étape** ; `resumeRoute` repart de là.
La reprise est en outre écrite sur l'appareil (`storageKey`, une clé par surface et par carte),
ce qui tient la promesse de la doc de référence — « l'avancement vit sur l'appareil » — alors
qu'il ne survivait même pas à un rafraîchissement de page, la situation exacte du visiteur qui
a scanné un QR code et verrouille son téléphone entre deux étapes. Une reprise qui ne désigne
plus aucun parcours publié s'efface d'elle-même, pour ne pas laisser un bouton sans effet.
Le scénario e2e clique désormais sur « Reprendre », vérifie l'étape, recharge la page et
recommence.

### 2.3 P3 — Effacer l'identifiant du lien refuse l'enregistrement, contre ce qu'annonce le champ

**Corrigé** (`routes/map-routes.js`, `PUT /:id` ; test dans `tests/map-routes.test.js`).

Le champ « Identifiant du lien » de l'éditeur porte le texte indicatif
« laissé vide : dérivé du titre » (`MapRoutesPanel.jsx`). C'est vrai à la création :

```js
const slug = slugifyRouteTitle(req.body?.slug || title); // POST
```

Ce ne l'est pas à la modification, où le repli porte sur l'**absence** du champ, pas sur sa
vacuité :

```js
const slug = req.body?.slug !== undefined ? slugifyRouteTitle(req.body.slug) : String(current.slug);
```

Or `routePayloadFromDraft` envoie toujours `slug`, y compris vide. Reproduit :

```
PUT /api/map-routes/:id   { "title": "…", "slug": "" }   → 400
{"error":"Slug invalide (lettres ou chiffres requis)"}
```

Un professeur qui efface le champ pour le faire regénérer depuis un titre corrigé recevait un
refus qui ne lui disait pas quoi faire.

**Correction.** Un `slug` fourni **vide** est re-dérivé du titre, comme à la création : le
contrat tient à l'API, pas au client. Le champ **absent** conserve toujours le slug existant —
ce n'est pas la même chose, et les deux cas sont testés. Un titre sans lettre ni chiffre reste
un refus explicite.

### 2.4 P3 — Un rang d'affichage extrême rendait une 500

**Corrigé dans ce lot** (`lib/mapRoutes.js`, `normalizeRouteSortOrder`).

Le champ « Ordre » de l'éditeur est un `<input type="number">` sans butée, et `sort_order` une
colonne `INT`. Tous les autres champs avaient reçu leurs bornes au premier audit (§2.8) ;
celui-là avait été oublié. Reproduit :

```
POST /api/map-routes   { "sort_order": 99999999999 }   → 500 {"error":"Erreur serveur"}
```

C'est `ER_WARN_DATA_OUT_OF_RANGE` remonté tel quel. Le refus est désormais un **400** lisible
(« Ordre hors bornes (-2147483648 à 2147483647) »), et un champ vide reste ce qu'il était : à
la création le rang vaut `100`, à la modification le rang existant est conservé.

### 2.5 P4 — Le mode parcours existe en deux exemplaires

**Corrigé** (`src/shared/map-routes/useMapRouteMode.js`, `src/plan/AppPlan.jsx` ; tests
`tests-ui/shared/useMapRouteMode.test.jsx`).

`src/shared/map-routes/useMapRouteMode.js` avait été extrait pour la Visite et la carte
de travail. Le Plan Lyautey — la surface d'origine, celle où les parcours servent le plus — ne
l'utilise pas : `AppPlan.jsx` porte sa propre copie de l'état (`activeRouteSlug`, `routeIndex`,
`routePickerOpen`, `resumableRouteSlug`, `startRoute`, `exitRoute`, `resumeRoute`,
`goToRouteIndex`, rebornage de l'index sur `routeSteps.length`), pour un comportement quasi
identique. Les composants d'affichage, eux, sont bien partagés (`PlanRouteBar` et
`PlanRoutePicker` ne sont que des façades).

Les deux copies ont déjà divergé, faiblement mais réellement :

|                                            | Plan (`AppPlan.jsx`)                            | Visite / carte (`useMapRouteMode`) |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------- |
| Message après « Quitter »                  | toast « Pour reprendre… »                       | aucun                              |
| Mesure d'usage                             | `reportPlanUsage('route_start' / 'route_step')` | aucune                             |
| Aperçu d'un autre lieu pendant le parcours | `routePeekPlace` + « Revenir à l'étape »        | absent                             |

Rien n'était cassé ; mais §2.2 était un bug **unique** qu'il aurait fallu corriger **deux
fois**, et c'est la définition de la dette.

**Correction.** `AppPlan` passe au hook partagé, et les trois lignes du tableau y montent en
**rappels optionnels** : `onExit` (le toast), `onUsage` (la mesure), `onStartExtra` (fermer la
liste de résultats), plus l'aperçu `peekPlace` désormais porté par le hook. Une surface qui ne
fournit pas ces rappels se comporte exactement comme avant — la Visite et la carte de travail
n'ont pas changé. Le noyau, qui ne portait aucun test direct alors qu'il servait déjà deux
surfaces, en a maintenant sept ; et l'aperçu « Revenir à l'étape », l'apport le plus fragile du
plan, a son test de montage.

### 2.6 P4 — Détails à ramasser

**Traités.** Chaque point porte ci-dessous ce qui a été décidé — y compris le seul qui se
règle par une décision plutôt que par du code.

a. **`GET /api/map-routes/:idOrSlug` n'a aucun appelant.** Aucun front ne l'utilise : le plan
lit ses parcours dans `/api/plan/content`, la visite dans `/api/visit/content`, la carte dans
le catalogue. C'était d'ailleurs la troisième fuite de §2.1. → **Conservée**, délibérément :
c'est un contrat public documenté (`docs/API.md`), la voie d'un lien profond résolu côté
serveur et d'une intégration tierce, et elle est désormais gardée comme les autres. La décision
est écrite en tête de la route, avec ce qu'elle coûte : une porte sans usage interne, que toute
évolution des parcours devra penser aussi.

b. **`GET /manage` ignorait le périmètre de cartes**, là où `GET /` applique
`resolveScopedMapFilter`. Sans conséquence pratique — `canBypassMapScope` laisse passer tout
compte portant `teacher.access`, donc tout détenteur de `zones.manage` en pratique. →
**Aligné** : le périmètre s'y applique comme au catalogue public. Une dissymétrie pareille finit
par se lire comme une garde.

c. **Le serveur acceptait deux étapes vers le même lieu, l'éditeur non** (`addStep`
dédoublonnait, sans message). → **Autorisé des deux côtés** : un parcours repasse
légitimement par l'accueil ou par la cour, et c'est au serveur que le contrat se décide. La
suggestion indique désormais « déjà à l'étape 2 » quand le lieu est repris, pour que le doublon
soit un choix et non une méprise.

d. **`addStep` était muet à la limite de 60 étapes** : le clic ne faisait rien, sans un mot. →
La borne atteinte **désactive** les suggestions, le compteur d'étapes l'annonce (« limite
atteinte ») et une tentative d'ajout le dit.

e. **L'éditeur ne bornait ni `description` (2 000) ni `step_text` (4 000) côté client.** On
pouvait saisir cinq mille caractères et ne l'apprendre qu'au refus. → `maxLength` sur les cinq
champs bornés par le serveur, compteur affiché près de la limite pour la description,
validation cliente alignée, et bornes `min`/`max` sur le champ « Ordre » (§2.4).

f. **`docs/API.md` ignorait la surface `staff`** (« `plan`/`map`/`visit` ») alors que la
migration `260` l'a ajoutée au `SET` et que l'éditeur la propose. → Corrigé avec la garde par
surface de §2.1 et les bornes de §2.4.

### 2.7 P3 — La barre d'étape mangeait l'écran, et la carte recadrait dessous

**Corrigé** (`src/index.css`, `src/plan/styles/plan.css`, `src/shared/map-routes/MapRouteBar.jsx`,
les trois surfaces). Constaté dans un navigateur, pas par lecture : Playwright sur un écran de
390 × 844, le format d'un téléphone — le seul usage réel du plan.

Trois mesures, trois défauts :

| Mesuré                        | Avant  | Après   |
| ----------------------------- | ------ | ------- |
| Barre repliée (texte d'étape) | 275 px | 237 px  |
| Barre dépliée                 | 420 px | 383 px  |
| Recadrage annoncé à la carte  | 148 px | mesurée |

1. **Le titre du parcours n'était pas borné.** Il s'affiche en rappel au-dessus de l'étape, en
   petit et en gris — mais sur trois lignes pour un titre de 75 caractères, et jusqu'à six pour
   les 180 que le serveur accepte. Il pousse d'autant le nom de l'étape, son texte et les
   commandes. → Une ligne, avec ellipse.

2. **Le texte d'étape déplié n'avait pas de plafond.** Quatre phrases suffisaient à donner à la
   barre la moitié de l'écran ; `step_text` en autorise 4 000 caractères. → `max-height: 28vh`
   et défilement : le texte long reste lisible sans chasser la carte.

3. **Le recadrage de la carte reposait sur une constante fausse.** `MAP_ROUTE_BAR_FOCUS_INSET_PX`
   annonçait 148 px de barre là où elle en occupait 275 : la carte centrait le lieu de l'étape
   courante dans la scène entière, donc **sous la barre** — le défaut B2 déjà corrigé pour les
   feuilles basses (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md`), jamais transposé ici. →
   La barre **mesure sa propre hauteur** (`ResizeObserver`) et la remonte ; la constante ne sert
   plus que le premier rendu. Vérifié dans le navigateur : l'étiquette du lieu de l'étape 2 se
   pose à 446 px, la barre commence à 675 px.

   La Visite et la carte de travail ne passaient **aucun** écart de recadrage — `focusOnPct`
   accepte pourtant `insets`. Elles le passent maintenant, avec la même hauteur mesurée.

4. Au passage : le compteur de la puce « Parcours » comptait les étapes **servies par l'API**,
   là où la barre compte celles qui sont **affichables**. Le filtrage serveur les aligne
   aujourd'hui, mais rien ne le garantissait côté client — c'est le §2.4 du premier audit, dont
   seul le versant serveur avait été traité. La puce compte désormais comme la barre.

---

## 3. Couverture de tests

| Niveau               | Fichier                                                    | État                                                            |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| API                  | `tests/map-routes.test.js`                                 | 19 cas verts (**+5** : §2.1 ×2, §2.3, §2.4, §2.6 c)             |
| Charge plan / staff  | `tests/plan-content.test.js`, `staff-plan-content.test.js` | verts                                                           |
| Noyau mode parcours  | `tests-ui/shared/useMapRouteMode.test.jsx`                 | **nouveau** — 7 cas (reprise, persistance, rebornage)           |
| Logique pure éditeur | `tests-ui/utils/mapRoutesEditor.test.js`                   | vert (**+1** : rangs d'un lieu répété)                          |
| Logique pure plan    | `tests-ui/plan/planRoutes.test.js`                         | vert                                                            |
| Plan (montage)       | `tests-ui/plan/AppPlanMount.test.jsx`                      | vert (**+1** : aperçu et « Revenir à l'étape » ; reprise)       |
| Éditeur (montage)    | `tests-ui/components/settings/MapRoutesPanel.test.jsx`     | vert                                                            |
| e2e                  | `e2e/plan-routes-mode.spec.js`                             | puce, lien profond, affiche périmée, **reprise + rechargement** |

Les trois manques relevés en début d'audit sont comblés :

1. **La reprise** (§2.2) : aucun test ne cliquait sur « Reprendre le parcours » — le scénario
   e2e s'arrêtait juste avant. Il clique, vérifie l'étape, recharge la page et recommence ; le
   test de montage du plan fait de même, et le hook a ses propres cas.
2. **Le mode parcours du plan** : son apport le plus fragile — l'aperçu d'un lieu et « Revenir
   à l'étape » — a désormais un test de montage, là où il n'était exercé qu'en e2e.
3. **`useMapRouteMode`** : le noyau, qui n'avait aucun test direct alors qu'il servait déjà deux
   surfaces et en sert trois maintenant, en a sept.

Ce qui reste sans filet automatique : la **hauteur** de la barre d'étape (§2.7) a été mesurée à
la main dans un navigateur, pas figée dans un test — un test de non-régression sur une hauteur
en pixels serait fragile, et le vrai garde-fou est le recadrage mesuré, qui n'a plus de
constante à démentir.

---

## 4. État des constats du premier audit (2026-09-04)

Vérifié un par un sur le code d'aujourd'hui. Aucune régression.

| §   | Constat                                            | État    | Où cela tient aujourd'hui                                               |
| --- | -------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| 2.1 | Brouillon lisible par son slug                     | ✅ tenu | `is_published = 1` dans `/:idOrSlug` (et `map_routes.test.js`)          |
| 2.2 | Garde du plan ne couvrait pas les parcours         | ✅ tenu | `lib/planAccess.js`, partagé — étendu par surface dans ce lot           |
| 2.3 | Surfaces « Carte » et « Visite » sans écran        | ✅ tenu | `src/shared/map-routes/`, câblé dans `map-views` et `visit-views`       |
| 2.4 | Compteur d'étapes divergent                        | ✅ tenu | `visiblePlaceKeys` (plan, visite) + `MapRoutePicker` écarte les vides   |
| 2.5 | Texte d'étape survivant au masquage du lieu        | ✅ tenu | même filtre, sur les trois charges                                      |
| 2.6 | Angles morts visiteur (affiche périmée, rebornage) | ✅ tenu | `routeLinkAppliedRef` + effet de rebornage dans `AppPlan`               |
| 2.7 | Étape visant un lieu inexistant                    | ✅ tenu | `checkStepTargets` (POST **et** PUT)                                    |
| 2.8 | Champs texte non bornés                            | ✅ tenu | `ROUTE_DESCRIPTION_MAX`, `STEP_TEXT_MAX` — `sort_order` manquait (§2.4) |
| 2.9 | Détails (rang par défaut, alerte de slug…)         | ✅ tenu | `ROUTE_SORT_ORDER_DEFAULT`, `slugWarning`                               |

---

## 5. Ce qui n'a pas pu être vérifié ici

- **Le rendu de l'affiche PDF** : la génération répond 200 `application/pdf` (vérifié), mais
  personne n'a regardé la page. Un titre de 180 caractères et soixante étapes tiennent-ils sur
  l'A4 unique, ou le contenu déborde-t-il ? `PDFDocument` pagine seul, sans que le code s'en
  soucie — ni test, ni relecture visuelle.
- **Le rendu des autres surfaces** : les mesures d'affichage du §2.7 ont été relevées sur le
  Plan Lyautey. La Visite et la carte de travail partagent la barre, son CSS et désormais son
  écart de recadrage, mais leur rendu n'a pas été photographié.
- **Le comportement hors ligne** (service worker) des parcours : la doc de référence annonce
  que le plan garde lieux et parcours sans réseau ; non vérifié.

**Trouvé en chemin, hors périmètre parcours.** `e2e/global-setup.js` force
`ui.auth.allow_register` à `false` — la configuration de production — et ne le restaurait
jamais. Tout `npm test` lancé après une suite e2e sur la même base échouait donc en masse :
**32 cas**, tous en 403 sur `POST /api/auth/register` ou sur le compte élève qu'ils créent au
préalable, sans que rien dans le code soit en cause. C'est ce qui est arrivé ici entre deux
vérifications. Un `e2e/global-teardown.js` repose désormais la valeur d'origine.
