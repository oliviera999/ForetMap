# Plans d'établissement — architecture et runbook

Cette page documente les trois surfaces « plan » qui partagent le même écran et les mêmes
données de lieux :

- **Plan public** (`plan`) : repérage public, éventuellement ouvert par code ou mot de passe.
- **Plan des personnels** (`staff`) : mêmes cartes, mais lecteur identifié ou porteur d'un
  secret secondaire, avec lieux et compléments internes filtrés par rôle.
- **Plan e-nov** (`enov`) : variante publique dédiée aux lieux labellisés e-nov, avec mise en
  avant, texte e-nov et page d'impression.

Contrats HTTP détaillés : [`API.md`](API.md), sections `Plan Lyautey`, `Plan des personnels`
et `Plan e-nov`. Référence utilisateur : `docs/reference/plan/`.

## Intention

Les plans réutilisent les lieux administrés dans ForetMap au lieu de maintenir un second
catalogue. Une correction de géométrie, de photo, de catégorie ou de parcours se répercute donc
sur les produits de plan après invalidation de la version d'écriture globale.

Le code sépare trois décisions :

1. **Produit** : host et entrée Vite déclarés dans le registre des produits.
2. **Surface** : `plan`, `staff` ou `enov`, utilisée pour filtrer lieux, catégories et parcours.
3. **Lecteur** : anonyme, compte ForetMap, ou lecteur synthétique issu d'un code du plan des
   personnels.

## Cartographie des fichiers

| Besoin                                                                   | Emplacement                      |
| ------------------------------------------------------------------------ | -------------------------------- |
| Registre host, API, PWA, indexation                                      | `lib/products.js`                |
| Écran React partagé                                                      | `src/plan/AppPlan.jsx`           |
| Variantes front (`apiBase`, stockage local, logos, impression)           | `src/plan/utils/planVariants.js` |
| Charge agrégée commune (`map`, `settings`, `zones`, `markers`, `routes`) | `lib/planContent.js`             |
| Route plan public                                                        | `routes/plan.js`                 |
| Route plan des personnels                                                | `routes/staff-plan.js`           |
| Route plan e-nov                                                         | `routes/enov-plan.js`            |
| Garde des routes génériques de lieux selon la surface                    | `lib/surfaceAccess.js`           |
| Réglages `ui.plan.*`, `ui.staff_plan.*`, `ui.enov_plan.*`                | `lib/settings/plan.js`           |
| Règles e-nov pures                                                       | `lib/enovPlan.js`                |
| Page d'impression e-nov                                                  | `src/enov/print/`                |

## Flux serveur

1. `server.js` monte les routeurs dédiés sous `/api/plan`, `/api/staff-plan` et `/api/enov`.
2. `lib/products.js` résout le produit depuis le host :
   - `planlyautey.*` -> `plan`
   - `proflyautey.*` et `stafflyautey.*` -> `staff`
   - `enov.*` -> `enov`
3. Les routeurs chargent les réglages de surface, résolvent la carte autorisée, puis appellent
   `buildPlanContent()`.
4. Les routes génériques de lieux (`/api/zones`, `/api/map/markers`, `/api/map-categories`,
   `/api/maps`) passent aussi par `lib/surfaceAccess.js` : fermer une surface ferme donc la
   charge composite **et** les « fenêtres » de lecture détaillée.

Hors production et e2e, l'en-tête `X-Foretmap-Product` peut surcharger le produit pour tester
un host de plan sans DNS dédié. En production, cette surcharge est ignorée.

## Données exposées

Les plans lisent les mêmes tables que la carte de travail et la visite : `maps`, `zones`,
`map_markers`, catégories, photos de zones/repères et parcours publiés. Ils n'exposent pas les
tâches, élèves, progressions ni données pédagogiques nominatives.

Chaque surface applique ensuite ses propres règles :

- **Surface `plan`** : lecteur anonyme traité comme `visiteur`.
- **Surface `staff`** : lecteur réel d'un compte autorisé, ou rôle synthétique `personnel` /
  `visiteur` pour l'entrée par secret partagé.
- **Surface `enov`** : lecteur anonyme, mêmes masquages que le plan public, plus champs
  `is_enov`, `enov_description`, `enov_space_type` et `settings.enov`.

Les catégories-labels (`is_distinction`, par exemple `cat-enov`) sont transparentes hors de
leurs surfaces : elles ne doivent ni cacher un lieu ailleurs, ni sortir dans les réponses où le
label n'a pas d'objet.

## Accès et secrets

| Surface | Mode ouvert                         | Modes gardés                              | Cookie              | Durée par défaut |
| ------- | ----------------------------------- | ----------------------------------------- | ------------------- | ---------------- |
| `plan`  | `ui.plan.access_mode = public`      | `code`, `password`                        | `plan_access`       | 30 jours         |
| `enov`  | `ui.enov_plan.access_mode = public` | `code`, `password`                        | `enov_plan_access`  | 30 jours         |
| `staff` | aucun mode public                   | compte, ou `code` / `password` secondaire | `staff_plan_access` | 7 jours          |

Contraintes importantes :

- Les codes et mots de passe ont des empreintes bcrypt distinctes (`security.*_access_code_hash`
  et `security.*_access_password_hash`). Basculer de `code` à `password` invalide les
  laissez-passer issus du code.
- Un mot de passe ne s'ouvre jamais par lien : `?code=` et `via: "link"` ne sont acceptés que
  pour un code de diffusion.
- Un plan public ou e-nov gardé sans secret configuré reste ouvert, pour éviter de bloquer une
  diffusion par erreur. Le plan des personnels reste fermé si son entrée secondaire est activée
  sans secret.
- Les tentatives d'entrée par secret sont limitées par `authLimiter` et journalisées par
  `lib/codeAccessJournal.js`.

## Cartes et filtres

`ui.plan.map_id` désigne la carte de référence. `ui.<surface>.selectable_map_ids` déclare les
autres cartes que la surface peut servir. Cette liste sert à la fois :

- de liste blanche pour `?map_id=...` ;
- de liste proposée dans le sélecteur « Plan affiché ».

Une carte hors liste répond comme une carte inconnue (`400 { error: "Carte introuvable" }`) afin
de ne pas révéler les identifiants internes.

Les catégories `default_category_ids` et `hidden_category_ids` sont propres à chaque surface. Un
lieu dont toutes les catégories servies sont masquées est retiré de la charge ; un lieu sans
catégorie reste visible s'il n'est pas masqué par `hidden_surfaces`.

## Cache, indexation et PWA

- `plan` et `enov` mettent en cache la charge agrégée par carte via la version d'écriture
  globale. En-tête HTTP : `public, max-age=60` si la surface est ouverte, `private, max-age=60`
  si elle est gardée.
- `staff` n'a pas de cache serveur : la charge dépend du rôle et des permissions du lecteur.
  Copier le cache du plan public exposerait la vue d'un lecteur à un autre.
- Les trois surfaces de plan ne sont pas indexables : `robots.txt` répond `Disallow: /` selon
  le host, et les réponses portent `X-Robots-Tag: noindex, nofollow, noarchive`.
- Chaque produit a son service worker et son manifest (`sw-plan.js`, `sw-staff.js`,
  `sw-enov.js`, manifests associés), générés au build depuis le registre produit.

## Plan e-nov et impression

Le plan e-nov partage l'écran du plan public, avec la variante `ENOV_PLAN_VARIANT`.

Les lieux mis en avant portent au moins une catégorie listée dans
`ui.enov_plan.highlight_category_ids`. Le texte `enov_description` et le type
`enov_space_type` sont saisis depuis la console de gestion des lieux et ne sortent que sur la
surface e-nov (ou en édition gestionnaire).

La page `/impression` est une page front de l'entrée `enov.html` : elle relit
`GET /api/enov/content?map_id=...`, numérote les lieux innovants et produit une feuille A4 par
carte. Il n'existe pas de route serveur séparée pour l'impression.

## Ajouter ou modifier une surface de plan

Avant de coder :

1. Ajouter le produit au registre (`lib/products.js`) : host, entrée HTML, préfixe API,
   indexation, service worker et manifest.
2. Ajouter la surface **en fin** des `SET` SQL et des constantes de surface. Ne jamais insérer
   une valeur au milieu d'un `SET` MySQL : les lignes existantes changeraient de sens.
3. Déclarer les réglages de surface et leurs bornes dans `lib/settings/plan.js`.
4. Brancher la garde dans `lib/surfaceAccess.js` pour les routes génériques.
5. Documenter le contrat public dans `docs/API.md` et le comportement visible dans
   `docs/reference/plan/`.

## Dépannage rapide

| Symptôme                                      | Vérifier                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `401 access_required` sur `/content`          | mode d'accès, secret configuré, cookie de laissez-passer, limiteur                                       |
| Carte absente ou `Carte introuvable`          | `ui.plan.map_id`, `*.selectable_map_ids`, carte active, host/produit résolu                              |
| Un lieu manque sur un plan                    | `hidden_surfaces`, surfaces des catégories, audience par rôle, catégories masquées                       |
| Lieu e-nov non mis en avant                   | catégorie présente dans `highlight_category_ids`, surface `enov`, catégorie-label non masquée par erreur |
| Plan des personnels trop riche ou trop pauvre | rôle effectif/attribué, `allowed_role_slugs`, `code_role_slug`, absence de cache serveur                 |
| Page e-nov imprimée incomplète                | `GET /api/enov/content`, types d'espace, descriptions e-nov, `?map_id=` demandé                          |

## Vérifications utiles

| Changement                         | Tests ciblés                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Accès code/mot de passe des plans  | `node --test tests/plan-access-passwords.test.js`                                                                                       |
| Contenu et champs e-nov            | `node --test tests/enov-plan-content.test.js tests/enov-space-type.test.js`                                                             |
| Surface, carte ou garde de lecture | `node --test tests/security-surfaces.test.js tests/security-public-surface.test.js tests/zone-surface.test.js tests/map-routes.test.js` |
| Montage UI du plan                 | `npm run test:ui -- tests-ui/plan/AppPlanMount.test.jsx tests-ui/plan/EnovPlanMount.test.jsx`                                           |
| Impression e-nov                   | `npm run test:ui -- tests-ui/enov/EnovPrintPage.test.jsx tests-ui/enov/enovPrintModel.test.js`                                          |
| Inventaire des routes d'écriture   | `node --test tests/write-routes-inventory.test.js`                                                                                      |

Pour un lot UI critique, compléter par `npm run test:e2e` après `npm run build`.
