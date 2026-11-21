# Fiche de coordination — affichage collège simplifié (chantier « collège », novembre 2026)

> Session **S0**, établie le **21/11/2026** sur `origin/main` = `014fed4` (**v1.259.8**, schéma
> **377**). Branche d'intégration : **`integration/college`** (créée depuis `origin/main`, porte le
> socle). Pas de PR vers `main` avant SI.
>
> Chaque session de flux lit cette fiche **avant** d'agir. Là où elle contredit le prompt
> d'origine, **la fiche fait foi** : elle a été écrite après lecture du code réel. Seule une
> session S0 relancée la modifie. SI la **supprime** (avec `snapshot/`, `journal/`, le chargeur
> `scripts/college-2026-11/load-snapshot.js`) avant la PR vers `main`.
>
> **Mise à jour n° 1 (S0, 21/11 au soir)** : ajout du flux **R1** (élèves référents automatiques
> des tâches récurrentes), chantier indépendant mené dans la même orchestration. Section de
> session prête à coller : `sessions/R1-referents-eleves.md`. Voir E7, § 1, § 3, § 4 « R1 »,
> § 6 et § 7. Si R1 n'est pas encore fusionné quand SI supprime le dossier de coordination, SI
> recopie `sessions/R1-referents-eleves.md` dans la description de sa PR (la reprise de R1 en a
> besoin).

## 0. Écarts au prompt (à reporter dans la PR finale)

| N°  | Constat (vérifié)                                                                                                                                                                                                                                                                                                                                                        | Décision S0                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **Réserver `N+1`…`N+6` par branche est impossible** : `tests/migrations-numbering.test.js` exige une numérotation continue depuis 252. Une branche D2 qui porte `380` sans `379` fait échouer `npm test` ; deux branches qui portent chacune `379` font échouer le démarrage après fusion (`assertNoNewDuplicateMigrationNumbers`). Même constat que D1 du chantier CPT. | Chaque flux D travaille avec **`379_<suffixe>.sql`** (premier libre de `integration/college`). Le **numéro définitif** est celui de la réservation (§ 1), posé par **SI** au moment de l'intégration (renommage du fichier). Le numéro n'apparaît **que** dans le nom de fichier.              |
| E2  | `sql/schema_foretmap.sql` **n'est pas** mis à jour à chaque migration (`entity_kind`, `clades` y sont absents).                                                                                                                                                                                                                                                          | Pas touché. La base fraîche reçoit les colonnes par la migration de socle.                                                                                                                                                                                                                     |
| E3  | Le prompt place le remplacement du `switch` de `biodivFeatureVisibility` dans C1.                                                                                                                                                                                                                                                                                        | **Fait par S0** (valeurs identiques, test de caractérisation) : la table est la seule source dès le socle ; C1 n'a plus qu'à **remplir les valeurs** et à retirer les tests de niveau en dur des composants.                                                                                   |
| E4  | La règle `foodweb_types_cycle4_only` a besoin de la liste « symbiose, compétition », qui relève de l'énumération (C3).                                                                                                                                                                                                                                                   | S0 a créé le sous-ensemble **`CYCLE4_ONLY_INTERACTION_TYPE_ENUM`** (`src/shared/enums/biodivEnums.js`), défini et non appliqué. C1 l'utilise pour remplir la règle ; C3 ne le redéfinit pas.                                                                                                   |
| E5  | `usage_group` : le prompt dit « première boîte `visible_college` de la chaîne ».                                                                                                                                                                                                                                                                                         | Lu comme **la plus proche de la fiche** en remontant (la plus précise), incluse. Forme : `{ id, label }` ou `null`. Calculé dans `GET /api/plants` seulement (`listCatalog`) ; les réponses d'écriture (`POST`/`PUT`) ne le portent pas.                                                       |
| E6  | `zone_tiles_cap` et `iucn_code` ne sont pas des booléens.                                                                                                                                                                                                                                                                                                                | Clés à paramètre : `iucn_code` vaut `'code'` (actuel) ou `'mots'` ; `zone_tiles_cap` vaut `null` (pas de plafond, actuel) ou un entier. Hors contexte (pas de fournisseur), `visibility()` rend `'show'` : un consommateur traite toute valeur non entière comme « pas de plafond ».           |
| E7  | Le prompt « Élèves référents automatiques » (R1) est un chantier **tâches**, sans lien fonctionnel avec le collège, avec ses propres points d'arrêt et une PR vers `main`. Périmètre de fichiers **disjoint** des douze flux collège (vérifié). Seul contact : la numérotation des migrations.                                                                           | R1 tourne **en parallèle** des vagues A et B, depuis `origin/main`, et livre par **sa propre PR vers `main`** (pas par SI). Règle de numérotation « premier arrivé sur `main` » (§ 1). Points d'arrêt du prompt remplacés par le tronc commun § 1.6 ; les gestes en production restent à Oliv. |

## 1. Migrations

### État relevé (21/11, 17 h 50 UTC)

- `main` et **toutes** les branches distantes (140) : dernière migration **377**
  (`377_plants_entity_kind.sql`). Prod : schéma **377**, rien en attente (`foretmap_db_status`).
- PR ouvertes : **aucune**. Les chantiers `ui-ux` (Visite lots 1 à 4, poids de connexion,
  repère touchable, vignettes mascotte, stabilisation des tests) et CPT (F1 à F6,
  `integration/cpt`) sont **fusionnés** sur `main`.
- Aucune branche ni PR ne correspond aux prompts `quiz_reponse_choisie` et
  `exploitation_novembre` ; `prompt_claude_code_ui_ux_visite` est livré (lots fusionnés). Voir § 6.

### Comportement du runner

`runMigrations` (`database.js`) suit un curseur unique, `schema_version`. Un fichier de numéro
**inférieur** au curseur est **sauté sans erreur** et seulement signalé (`late` de
`lib/migrationStatus.js`, `skipped` de `deploy_status`, code 4 de `db:status`). D'où E1 : les
migrations du chantier arrivent sur `main` **dans la seule PR de SI**, numérotées sans trou
au-dessus du dernier numéro de `main` à ce moment-là. Si une autre PR prend `379` avant SI,
**SI décale toute la série**.

### Numéros

| Flux  | Fichier de travail (sur sa branche)                                                                                                                                                  | Numéro définitif (si `main` est encore à 377) |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| S0    | `378_college_socle.sql` (**déjà sur `integration/college`**)                                                                                                                         | 378                                           |
| D1    | `379_college_corrections_immediates.sql`                                                                                                                                             | 379                                           |
| D2    | `379_college_groupes_usage.sql`                                                                                                                                                      | 380                                           |
| D3    | `379_college_quiz_paliers.sql`                                                                                                                                                       | 381                                           |
| D4    | `379_college_cles_courtes.sql`                                                                                                                                                       | 382                                           |
| D5    | `379_college_etiquettes_simples.sql`                                                                                                                                                 | 383                                           |
| D6    | `379_college_especes_phares.sql`                                                                                                                                                     | 384                                           |
| C1…C6 | **aucune migration** (les colonnes existent grâce au socle) ; un besoin imprévu prend `379_college_<flux>_<objet>.sql`, numéro définitif **385** et suivants, dans l'ordre de fusion | 385+                                          |

**Numéros relatifs.** Les numéros définitifs ci-dessus supposent `main` encore à 377 quand SI
ouvre sa PR. Règle générale : la série collège prend, dans l'ordre S0, D1 … D6, puis les
éventuels C, les numéros qui suivent **immédiatement** la dernière migration de `main` au moment
de l'intégration. En particulier, si **R1** (§ 4) fusionne sur `main` avant SI avec
`378_task_referents_auto`, SI rebase `integration/college` sur `main` et décale **toute** la
série d'un cran (`378_college_socle` → `379`, D1 → `380`, …). Inversement, si SI fusionne avant
R1, R1 renumérote son unique fichier au-dessus de la série. **Premier arrivé sur `main`, premier
servi** ; aucune réservation entre les deux chantiers (une réservation créerait un trou, refusé
par `tests/migrations-numbering.test.js`).

| Flux | Fichier de travail                                           | Numéro définitif                    |
| ---- | ------------------------------------------------------------ | ----------------------------------- |
| R1   | `378_task_referents_auto.sql` (branche depuis `origin/main`) | premier libre de `main` à sa fusion |

**Rendre la renumérotation gratuite** (obligatoire) :

- le numéro n'apparaît **que** dans le nom du fichier ; le code, la doc, `changelog.d/` et les
  fichiers de revue écrivent « migration `college_groupes_usage` » ;
- les tests retrouvent le fichier par son **suffixe**
  (`/_college_groupes_usage\.sql$/`) et leur nom ne porte pas de numéro ;
- le script générateur (`scripts/college-2026-11/build-<flux>-migration.js`) écrit dans le
  fichier existant qui porte son suffixe, quel que soit son numéro.

**Indépendance** : aucune migration de flux ne dépend d'une autre. Points de contact connus,
sans dépendance d'ordre :

- D2 crée des clades d'insectes et déplace des fiches ; D5 écrit des étiquettes « cohérentes avec
  le clade » à partir de l'**instantané** (avant D2) : une étiquette d'insecte reste juste quel
  que soit l'ordre. D5 signale dans sa revue les fiches que D2 déplace (liste au § 4 de D2).
- D1 retouche des séances (`highlightPlantId`, forme actuelle) ; C3 ajoute l'option `plantIds`
  sans changer la forme existante : D1 n'utilise **pas** `plantIds`.
- D1 peut créer une question (QF0020 remplacée dans la séance) ; D3 ne la connaît pas : D1 lui
  pose directement des notions d'un seul cycle.
- D6 écrit `map_species.is_featured` et `plants.description_college` ; D5 écrit
  `plants.usage_label` : colonnes disjointes.

### Gardes existantes à respecter

- `scripts/check-sensitive-files.js` (pre-commit et CI) : aucun `INSERT … VALUES` sur une table
  de données personnelles, aucun e-mail, aucun hachage dans une migration.
- `tests/migrations-unique-numbers.test.js`, `tests/migrations-guard.test.js`,
  `tests/migrations-numbering.test.js` : verts sur chaque branche avec le fichier `379_…`.

## 2. Ce que le socle livre (sur `integration/college`)

| Élément                                                                                                                                                                                                                                                    | Où                                                                                                      | Pour qui        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| Migration `378_college_socle` (DDL seule) : `clades.label_simple`, `attribute_simple`, `visible_college` ; `map_species.is_featured` + index `(map_id, is_featured)` ; `plants.usage_label`, `description_college` ; `quiz_categories.description_college` | `migrations/378_college_socle.sql`                                                                      | tous            |
| `GET /api/plants` : `usage_label`, `description_college`, `usage_group` (`{ id, label }` ou `null`)                                                                                                                                                        | `lib/biodiv/speciesService.js` (`listCatalog`), `usageGroupFor` / `cladeSimpleLabel` de `lib/clades.js` | C1, C4, C5      |
| `GET /api/clades`, `/:id/path`, `POST`/`PUT` : `label_simple`, `attribute_simple`, `visible_college`                                                                                                                                                       | `routes/clades.js` (`CLADE_READ_COLUMNS`)                                                               | C4              |
| `is_featured` dans `/api/maps/:id/species` et `site_species` de `GET /api/visit/content`                                                                                                                                                                   | `lib/biodiv/presenceService.js` (`serializePresenceEntry`)                                              | C3, C4, C5      |
| `description_college` dans `GET /api/quiz/categories`                                                                                                                                                                                                      | `lib/pedago/quizRepository.js`                                                                          | C6              |
| Connecteur : `foretmap_get_species` (`usage_label`, `description_college`, `presence.maps[].is_featured`), `foretmap_species list` (`usage_label`, `usage_group`), `get` (tout le catalogue)                                                               | `lib/mcp/tools/content.js`, `lib/mcp/tools/domains/species.js`                                          | C5, D           |
| Table de visibilité : 22 briques, 3 règles de palier, `visibilityFor`, `canShowFor`, `palierRuleFor`, `visibilityProfileFor`, `palierProfileFor`                                                                                                           | `src/shared/pedagoVisibilityCore.js` (miroir généré `lib/shared/`)                                      | tous les flux C |
| `biodivFeatureVisibility` (front et serveur) = la table ; accepte une étape ou l'objet `learner`                                                                                                                                                           | `src/utils/biodivPedagoLevel.js`, `lib/biodivPedagoLevel.js`                                            | C1              |
| Contexte : `canShow` / `visibility` lisent l'apprenant complet ; nouveau `palierRule(rule)` ; `learner` déjà exposé (`niveau`, `etape`, `maxPalier`, `curriculumNiveaux`, `sources`)                                                                       | `src/contexts/BiodivPedagoContext.jsx`                                                                  | tous les flux C |
| Sous-ensemble `CYCLE4_ONLY_INTERACTION_TYPE_ENUM` (symbiose, compétition)                                                                                                                                                                                  | `src/shared/enums/biodivEnums.js` (miroir)                                                              | C1, C3          |
| Instantané de contenu (19 tables, prod, 21/11) + chargeur pour base de test                                                                                                                                                                                | `docs/coordination/college-2026-11/snapshot/`, `scripts/college-2026-11/load-snapshot.js`               | D, C4           |

**Clés de visibilité** (toutes à leur comportement actuel ; C1 remplit le profil collège) :

- historiques : `accepted_name_gbif_latin`, `clade_breadcrumb`, `nested_groups_tab`,
  `foodweb_advanced`, `pollination_efficacy`, `individuals_tab`, `biomass_estimates`,
  `curriculum_notions_lycee_plus` ;
- chantier : `taxonomy_line`, `meta_sections`, `range_gauges`, `nutrition_badge`, `iucn_code`
  (`'code'`|`'mots'`), `visit_tile_scientific_name`, `usage_label`, `description_college`,
  `foodweb_offmap_species`, `foodweb_full_by_default`, `nested_groups_full_tree`,
  `catalog_grouped`, `featured_first`, `zone_tiles_cap` (`null`|entier) ;
- règles de palier (profils `cycle3`, `cycle4`, `lycee`, `universite` ; collège sans classe =
  `cycle3`) : `glossary_depth_max` (`null` = pas de filtre), `quiz_entry_palier_max` (`null`),
  `foodweb_types_cycle4_only` (`[]`).

Consigne pour les flux C2 à C6 : **appeler** `canShow('<clé>')`, `visibility('<clé>')` ou
`palierRule('<règle>')` du contexte (front), `visibilityFor` / `palierRuleFor` (serveur), et
coder le comportement collège **derrière** la clé. Tant que C1 n'a pas fusionné, la clé rend le
comportement actuel : les tests du flux simulent le profil collège en **mockant** le contexte
(patron : `tests-ui/contexts/BiodivPedagoContext.test.jsx`) ou en passant un apprenant explicite
à une fonction pure — jamais en modifiant `pedagoVisibilityCore.js`.

## 3. Recette des tests en parallèle

### Sessions cloud (Claude Code sur le web) — cas de ce chantier

Chaque session a son conteneur, son MariaDB et sa base `foretmap_test` (le démarrage lance
`npm ci`, MariaDB, `db:init`, le jeu anonymisé dans `foretmap_local`, les navigateurs
Playwright). **L'isolation est acquise** : pas de port ni de base à partager. Après
`git checkout` de la branche de flux, lancer `npm run db:migrate` (la migration de socle n'est
pas dans la base créée au démarrage depuis `main`).

Base « instantané » (flux D, fixtures C4), une fois par session :

```bash
mariadb -e "CREATE DATABASE IF NOT EXISTS foretmap_test_<flux>_snap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
DB_NAME=foretmap_test_<flux>_snap TEST_DB_NAME=foretmap_test_<flux>_snap npm run db:init
DB_NAME=foretmap_test_<flux>_snap node scripts/college-2026-11/load-snapshot.js
```

(Dans le conteneur cloud, `mariadb` se connecte en root par la socket ; le compte applicatif
`foretmap` du `.env` y a tous les droits.) Le chargeur refuse toute base
dont le nom ne contient ni `test` ni `sim`, vide puis recharge les 19 tables de contenu, et
**signale la dérive de schéma** prod ↔ dépôt (essai S0 : 7 valeurs de `plants.health_risk`
inconnues du dépôt, retirées). Ne jamais lancer `npm test` sur une base « instantané » : les tests
attendent les données de démonstration.

Rejouer une migration deux fois « sur base fraîche » : `DROP DATABASE` puis recréer **sa** base
(`foretmap_test_<flux>_fresh`), `db:init` (qui applique déjà la migration une fois), puis
rejouer le fichier par `mariadb <base> < migrations/379_….sql` une seconde fois (ou par
`splitSqlStatements`, patron `tests/college-socle-exposition.test.js`) : zéro erreur, mêmes
comptes. Même chose sur la base « instantané ».

**Pousser** : une session cloud ne pousse en principe que sur la branche que la plateforme lui
attribue. Ce chantier demande explicitement `feat/college-<flux>` ; si la poussée est refusée,
pousser sur la branche attribuée, ouvrir la PR brouillon **de cette branche vers
`integration/college`** et le noter en tête de PR et du journal.

### Poste local (worktrees, Cursor)

```bash
git fetch origin
git worktree add ../ForetMap-<flux> -b feat/college-<flux> origin/integration/college
cd ../ForetMap-<flux> && npm ci && cp ../ForetMap/.env .env
```

Puis, dans le `.env` **du worktree** : `DB_NAME=foretmap_test_<flux>`,
`TEST_DB_NAME=foretmap_test_<flux>`, `PORT=32<nn>`, `E2E_BASE_URL=http://127.0.0.1:32<nn>`.

| Flux | Base               | Port | Flux | Base               | Port |
| ---- | ------------------ | ---- | ---- | ------------------ | ---- |
| C1   | `foretmap_test_c1` | 3201 | D1   | `foretmap_test_d1` | 3211 |
| C2   | `foretmap_test_c2` | 3202 | D2   | `foretmap_test_d2` | 3212 |
| C3   | `foretmap_test_c3` | 3203 | D3   | `foretmap_test_d3` | 3213 |
| C4   | `foretmap_test_c4` | 3204 | D4   | `foretmap_test_d4` | 3214 |
| C5   | `foretmap_test_c5` | 3205 | D5   | `foretmap_test_d5` | 3215 |
| C6   | `foretmap_test_c6` | 3206 | D6   | `foretmap_test_d6` | 3216 |
| SI   | `foretmap_test_si` | 3209 | R1   | `foretmap_test_r1` | 3221 |

Créer la base (`CREATE DATABASE … utf8mb4_unicode_ci`) puis `npm run db:init`. Ce qui isole déjà,
sans correctif (vérifié, comme au chantier CPT) : `tests/helpers/setup.js` remplace `DB_NAME`
par `TEST_DB_NAME` et refuse toute base sans `test` dans le nom ; la sentinelle de schéma est
indexée par le nom de la base ; les serveurs de test écoutent sur un port éphémère ; `uploads/` et
`dist/` sont propres au worktree. **Sans `PORT` propre, `npm run test:e2e` tue le serveur de la
session voisine sur 3000** (`scripts/e2e-kill-listen-port.js`).

### Suites à lancer

- Tout flux : `npm run lint`, `npm run format:check`, `npm test` (ou les fichiers de son domaine
  pendant le travail, la suite complète avant « Ready for review »), `npm run test:ui`.
- Flux D et C6 : `npm run test:content`.
- Flux qui touche un module partagé avec G&L (C2 : `termAutolinkCore` ; C6 : modules quiz ; C3 :
  `biodivEnums`) — **avant et après** :
  `node --test --test-concurrency=1 --test-force-exit tests/gl-*.test.js tests/qcm-*.test.js tests/shared-cores-*.test.js tests/term-autolink-*.test.js`.
- Miroirs : `npm run sync:shared-cores` après toute modification d'une source `src/shared/…`
  appariée ; `npm run sync:shared-cores:check` doit être vert.

## 4. Carte de propriété des fichiers

Règles communes :

- un flux ne modifie **que** les fichiers de sa liste ; un fichier absent de toutes les listes est
  à **SI** (le noter dans la PR, rubrique « À faire par SI ») ;
- **nouveaux tests dans de nouveaux fichiers**, préfixés `college-<flux>-` ou par le domaine ; un
  test existant n'appartient qu'au flux qui possède le module testé ;
- miroirs `lib/shared/*.js` : jamais à la main ; source `src/shared/…` puis
  `npm run sync:shared-cores` (le miroir appartient au flux de la source) ;
- **styles** : jamais `src/index.css` (11 286 lignes, fichier chaud) ; une feuille par domaine,
  importée par son composant (patron `src/components/observations/speciesObservations.css`), par
  tokens (pas de hex ni de rem) ;
- `docs/API.md`, `docs/MCP.md`, `docs/reference/**` : la **section de son domaine** seulement, sans
  reformater le reste ; `CHANGELOG.md` jamais (écrire `changelog.d/<flux>.md`) ;
- fichiers d'inventaire partagés — **au plus les lignes de ses propres fichiers**, sans
  reformater : `tests/fixtures/inline-style-baseline.json`,
  `tests/fixtures/a11y-static-baseline.json`, `tests/write-routes-inventory.test.js` (une ligne par
  route ajoutée, en fin de liste). Mieux : ne pas créer de style en ligne ni de contrôle hors
  normes, pour ne pas y toucher ;
- les lectures de l'instantané et les écritures de journal / revue sont libres dans son propre
  fichier.

### C1 — Table de visibilité, fiche espèce et Visite allégées

- `src/shared/pedagoVisibilityCore.js` + miroir ; `tests/pedago-visibility-core.test.js`
  (mettre à jour les attentes « état S0 » au profil collège)
- `src/utils/biodivPedagoLevel.js`, `lib/biodivPedagoLevel.js`, `tests/biodiv-pedago-level.test.js`
  (dont `foodWebTypesForPedagoLevel` : appliquer `palierRule('foodweb_types_cycle4_only')` en
  passant l'apprenant)
- `src/contexts/BiodivPedagoContext.jsx`, `tests-ui/contexts/BiodivPedagoContext.test.jsx`
- `src/utils/learnerLevel.js`, `lib/pedago/learnerLevel.js`, `tests/pedago-learner-level.test.js`,
  `tests/pedago-session-learner-level.test.js` (point 5 : `notionNiveau` `cycle3`/`cycle4`, carte
  `lycee` sans effet sur un collégien)
- fiche : `src/components/biodiv/PlantCatalogPreview.jsx` (dont la chip `group_2`),
  `PlantSummaryBlocks.jsx`, `PlantMetaSections.jsx`, `src/constants/plantMetaSections.js` et leurs
  tests-ui
- Visite : `src/components/visit/VisitBiodiversityPanel.jsx` (rendu de `VisitSpeciesTile` :
  nom scientifique, `usage_label`, extrait) et son test-ui
- Aperçu prof : `src/components/app/AppPreviewMenu.jsx`, `RolePreviewBanners.jsx`,
  `src/utils/appPreview.js` et leurs tests-ui
- séances : `src/components/pedago/SessionsView.jsx` (sélecteur `notionNiveau` seulement)
- tests nouveaux : `tests/college-c1-*.test.js`, `tests-ui/**/college-c1-*.test.jsx`,
  `e2e/college-c1-*.spec.js`
- docs : `docs/reference/foretmap/niveaux-pedagogiques-biodiversite.md` (« Qui règle le niveau »,
  « Le menu Aperçu », « Tableau récapitulatif »), `plantes-et-biodiversite.md` § « La fiche
  espèce », `visite-et-mascottes.md` § « Ce que vit le visiteur » (partie vignettes) ;
  `docs/API.md` paragraphe `biodiv_pedago_level`
- `changelog.d/C1.md`

Hors périmètre C1 : `lib/pedagoSessions.js`, `src/hooks/usePedagoSession.js` (C3) — si le point
5 exige d'y toucher, le **décrire** dans la PR pour SI ; `src/components/visit-views.jsx` (chaud).

### C2 — Barrière de vocabulaire

- `src/components/pedago/GlossaryView.jsx`, `GlossaryPopover.jsx`,
  `GlossaryTermLearnedAcknowledge.jsx`, `src/components/GlossaryMarkdown.jsx` et leurs tests-ui
- `src/utils/foretmapGlossaryAutolink.js`, `src/hooks/useGlossaryLinkIndex.js`,
  `lib/foretmapGlossaryAutolink.js`, `src/utils/termAutolink.js`, `lib/term-autolink/termAutolink.js`
- `src/shared/glossary/termAutolinkCore.js` + miroir : **un seul paramètre facultatif** de filtrage,
  rétrocompatible (G&L inchangé)
- `src/shared/glossary/glossaryCardCore.js`, `src/shared/hooks/useGlossaryLinkedHtml.js`,
  `src/shared/utils/glossaryLinkClick.js`
- `routes/glossary.js`, `lib/glossaryMatch.js`, `lib/glossarySearch.js`,
  `lib/mcp/tools/domains/glossary.js`
- tests : `tests/glossary-*.test.js`, `tests/foretmap-glossary-inject.test.js`,
  `tests/term-autolink-*.test.js`, `tests-ui/GlossaryPopover*`, `GlossaryMarkdown*`,
  `useGlossaryLinkIndex*`, `tests-ui/shared/glossary*`, nouveaux `college-c2-*`
- docs : `docs/API.md` § « ForetMap — glossaire validable » et lignes glossaire de « Pédagogie
  biodiversité », ligne `foretmap_glossary` de `docs/MCP.md`,
  `pedagogie-quiz-glossaire-reseau.md` § « Le Glossaire »
- `changelog.d/C2.md`

**Lecture seule pour C2** : `lib/pedagoScales.js` et `src/utils/pedagoScales.js`
(`GLOSSARY_NIVEAU_ENTRY` est à C6 ; s'il faut l'exporter ou le compléter, le noter pour SI).

### C3 — Réseau trophique borné

- `src/components/pedago/FoodWebView.jsx`, `FoodWebGraph.jsx` (1 624 lignes : **pas chaud**, C3
  est le seul à y toucher et doit le découper), `foodWebGraphModel.js`, `FoodWebEdgeLegend.jsx`,
  nouveaux hooks `src/hooks/useFoodWeb*.js`
- `src/shared/foodWebTypes.js`, `src/shared/foodWebEdgeStyle.js`,
  `src/shared/styles/food-web-graph.css`
- `src/shared/enums/biodivEnums.js` + miroir (`COLLEGE_INTERACTION_TYPE_ENUM` + `frugivorie`,
  `granivorie` ; `labelsSimple` ; `CYCLE4_ONLY_INTERACTION_TYPE_ENUM` existe déjà, ne pas le
  redéfinir)
- `routes/food-web.js`, `lib/shared/foodWebCore.js` (manuel), `lib/mcp/tools/domains/foodWeb.js`
- séance : `src/shared/enums/pedagoStepActions.js` + miroir, `lib/pedagoSessions.js`,
  `routes/pedago-sessions.js`, `src/hooks/usePedagoSession.js`,
  `src/components/pedago/SessionStepEditor.jsx`, `PedagoSessionDoneDialog.jsx`,
  `lib/mcp/tools/domains/pedagoSessions.js`
- tests : `tests/food-web-*.test.js`, `tests/enums-referential.test.js`,
  `tests/enums-copies-characterization.test.js`, `tests/pedago-step-actions-literals.test.js`,
  `tests/pedago-sessions*.test.js`, `tests/pedago-session-*.test.js` (sauf
  `pedago-session-learner-level`, à C1), `tests/mcp-pedago-sessions-*.test.js`,
  `tests-ui/components/pedago/FoodWeb*`, `foodWebGraphModel*`, `PedagoSessionDoneDialog*`,
  `Sessions*` (sauf ce qui monte `SessionsView` pour `notionNiveau`), `tests-ui/hooks/usePedagoSession*`,
  `tests-ui/shared/foodWebEdgeStyle*`, `tests-ui/shared/enumCopiesCharacterization*`,
  `e2e/pedago-food-web.spec.js`, `e2e/pedago-session-phone.spec.js`, nouveaux `college-c3-*`
- docs : bloc « Types d'interaction » et lignes réseau de « Pédagogie biodiversité », § « Séances
  pédagogiques » de `docs/API.md` ; lignes `foretmap_food_web` et `foretmap_pedago_sessions` de
  `docs/MCP.md` ; `pedagogie-quiz-glossaire-reseau.md` § « Le Réseau trophique »
- `changelog.d/C3.md`

C3 filtre les types par `foodWebTypes(...)` du contexte (C1 y applique la règle de palier) et ne
touche pas à `biodivPedagoLevel`.

### C4 — Groupes d'usage et catalogue groupé

- `lib/clades.js` (`collapseForProfile` ; `usageGroupFor` et `cladeSimpleLabel` existent déjà),
  `routes/clades.js`, `tests/clades.test.js`
- `src/components/pedago/NestedGroupsView.jsx`, `src/components/biodiv/PlantCladeBreadcrumb.jsx`
- catalogue : `src/components/biodiv/PlantCatalogFilterPanel.jsx`, `PlantCatalogTile.jsx`,
  `src/components/foretmap-views.jsx`, `src/utils/plantFilters.js`,
  `src/hooks/usePlantCatalogFilters.js`, `useBiodivCatalogPage.js`, `usePlantCatalogPreview.js`,
  `src/utils/plantCatalogHelpers.js`, `src/hooks/useMapSpeciesPresence.js`,
  `src/utils/speciesPresence.js`
- tests : `tests/plant-filters-*.test.js`, `tests/audit-fm-lot10-pedago.test.js`,
  `tests-ui/components/biodiv/PlantCatalogFilterPanel*`, `tests-ui/components/PlantCatalogTiles*`,
  `PlantCatalogEntityKind*`, `tests-ui/hooks/usePlantCatalog*`, `tests-ui/utils/plantCatalogHelpers*`,
  `e2e/plants-biodiversity.spec.js`, nouveaux `college-c4-*` (fixture d'arbre tirée de
  `snapshot/clades.json`, **avec des marques `visible_college` posées par le test** : l'instantané
  n'en a pas)
- docs : § « Classification — groupes emboîtés » de `docs/API.md`, § « Groupes emboîtés » de
  `plantes-et-biodiversite.md` (+ partie « catalogue »)
- `changelog.d/C4.md`

Hors périmètre C4 : `PlantCatalogPreview.jsx` et `PlantSummaryBlocks.jsx` (C1). Le fil des groupes
rendu dans la fiche est `PlantCladeBreadcrumb` (à C4), que la fiche importe sans changement.

### C5 — Espèces phares dans les zones et la Visite

- carte : `src/components/map/ZoneInfoModal.jsx`, `LivingBeingsCatalogPanel.jsx`,
  `mapModalShared.jsx`, `MarkerModal.jsx`, `useLocationModalData.js`, `src/utils/livingBeings.js`
- Visite : `src/components/visit/VisitDetailPanel.jsx` (ordre, plafond, « Voir les N autres »),
  `src/utils/visitLocationAside.js` ; `routes/visit.js` (si les espèces d'une zone doivent porter
  `is_featured`)
- registre : `routes/plants.js` (`/:id/map-species/:mapId`), `lib/biodiv/speciesService.js`,
  `lib/speciesJunction.js`, `lib/biodiv/presenceService.js`, `routes/maps.js`,
  `lib/mcp/tools/domains/species.js` (`registry_status` + `is_featured`)
- tests : `tests/plants-map-species*.test.js`, `tests/mcp-domain-species.test.js`,
  `tests/presence-service.test.js`, `tests/species-junction-read.test.js`,
  `tests/species-presence-screens.test.js`, `tests/visit-content-biodiversity.test.js`,
  `tests-ui/components/map/ZoneInfoModal*`, `LocationVisitAside*`, `LocationModals*`,
  `useLocationModalData*`, `tests-ui/utils/visitLocationAside*`, `tests-ui/components/visit/VisitDetailPanel*`,
  `e2e/visit-mode.spec.js`, nouveaux `college-c5-*`
- docs : § « Présence des espèces sur une carte », § « Zones », § « Visite guidée » et lignes
  registre de « Biodiversité » de `docs/API.md` ; ligne `foretmap_species` de `docs/MCP.md` ;
  `carte-et-zones.md` § « Les zones », `visite-et-mascottes.md` (partie fiche de zone)
- `changelog.d/C5.md`

C5 reçoit les vignettes de `VisitBiodiversityPanel` (C1) telles quelles et ne fait que l'**ordre**
et le **plafond** de la liste qu'il leur passe.

### C6 — Quiz par palier

- `lib/pedagoScales.js`, `src/utils/pedagoScales.js`, `tests/pedago-scales.test.js`
- `lib/curriculumNotions.js`, `tests/curriculum-notions.test.js`
- `lib/pedago/eligibility.js`, `gatingProducts.js`, `gatingProductCatalog.js`,
  `lib/pedago/quizService.js`, `quizRepository.js`, `routes/quiz.js`,
  `lib/mcp/tools/domains/quiz.js`
- `src/components/pedago/QuizView.jsx`, `src/hooks/useQuizSession.js`, `src/services/quizApi.js`
- tests : `tests/gating-products*.test.js`, `tests/learning-gating-*.test.js`,
  `tests/quiz-*.test.js`, `tests-ui/components/pedago/QuizView*`, `QuizLevelScales*`,
  `tests-ui/services/quizApi*`, `e2e/pedago-quiz.spec.js`, nouveaux `college-c6-*`,
  `tests/content/college-c6-*.test.js`
- docs : lignes quiz de « Pédagogie biodiversité », § « Présentation et réponse du quiz
  ForetMap », filtre de niveau de « Liens ressources ↔ questions » de `docs/API.md` ; ligne
  `foretmap_quiz` de `docs/MCP.md` ; `pedagogie-quiz-glossaire-reseau.md` § « Le Quiz » et
  § « Les notions des programmes » ; `niveaux-pedagogiques-biodiversite.md` § « Les échelles de
  niveau »
- `changelog.d/C6.md`

**Lecture seule pour C6** : `src/shared/qcm/*`, `lib/qcmChoices.js`, `lib/qcmPresentationUse.js`,
`lib/shared/question*.js` ; instantané G&L `tests/qcm-shared-payload-snapshot.test.js` à lancer
avant et après, sans le modifier.

### Flux de contenu (D1 à D6)

Chacun, et rien d'autre :

- `migrations/379_<suffixe>.sql` (§ 1), **généré** par `scripts/college-2026-11/build-<flux>-migration.js`
- `data/college-2026-11/<flux>/*.json` (hors Prettier : `data/` est ignoré) et ses scripts de
  contrôle `scripts/college-2026-11/check-<flux>-*.js`
- `tests/content/college-<flux>-*.test.js` (assertions sur les données, job « Contenu
  pédagogique ») et, si besoin, `tests/college-<flux>-rejeu.test.js` (mécanique de rejeu,
  patron `tests/learning-links-migration-300.test.js`)
- `docs/coordination/college-2026-11/revue/<flux>.md`, `journal/<flux>.md`
- `changelog.d/<flux>.md`

Aucun code applicatif. Les espèces se désignent **par nom ou par clé naturelle** (les `id`
auto-incrémentés diffèrent entre la prod et une base fraîche : une ligne dont le parent manque
est sautée sans erreur, comme au chantier CPT). Le no-op éventuel en prod se prouve en lecture
seule (requête jumelle `SELECT COUNT(*)`), résultats joints à la PR.

Précisions par flux :

- **D1** : séances par `slug` ; emoji comparés en `CAST(… AS BINARY)` ; la carte Daya est
  `maps.id = 'dayat'` (instantané : `pedago_level = 'lycee'`).
- **D2** : écrit `clades.visible_college`, `label_simple`, `attribute_simple`, crée 4 clades
  d'insectes (non visibles au collège) et déplace des fiches (garde sur l'ancien `clade_id`) ;
  liste les fiches déplacées dans sa revue (pour D5).
- **D3** : `quiz_question_notions` (`mode` `ajout` / `exclusion`), `quiz_questions.niveau` (garde
  `<=>` sur l'ancienne valeur), `quiz_categories.description_college`.
- **D4** : `id_keys` (par `slug`), `id_key_couplets`, `id_key_leads`, `id_key_lead_plants` ;
  contrainte `chk_idkey_lead_outcome` ; `created_by` à `NULL` (ou au compte système existant, s'il y
  en a un dans le code : ne jamais écrire d'e-mail).
- **D5** : `plants.usage_label`, hors `entity_kind = 'ressource'`.
- **D6** : `map_species.is_featured`, `plants.description_college`.

### R1 — Élèves référents automatiques des tâches récurrentes (hors chantier collège)

Branche `feat/referents-eleves-auto` depuis **`origin/main`**, PR brouillon **vers `main`**,
journal `docs/coordination/referents-2026-11/journal.md` (supprimé avant « Ready for review »).
Section de session : `sessions/R1-referents-eleves.md` (adaptations § A, prompt d'origine § B).

- migration `<n>_task_referents_auto.sql` (§ 1) ; `tests/task-referents-auto-migration.test.js`
- tâches : `lib/tasks/taskService.js`, `lib/tasks/taskQueries.js`, nouveau
  `lib/tasks/studentReferents.js`, nouvelle requête partagée de progression dans `lib/tasks/`,
  `lib/recurringTasks.js`, `lib/taskRouteHelpers.js`, `lib/tasks/assignmentVisibility.js`,
  `routes/tasks.js`
- règle de progression : `lib/rbac.js` (**seulement** `countValidatedAssignmentsForStudent` et
  l'appel de la requête extraite)
- récompenses : `lib/rewards/creditedTasks.js` (commentaire d'écart), `lib/rewards/hooks.js`
  (modèle du déclencheur ; crochet nouveau de préférence dans un module à part)
- réglages et jobs : `lib/settings/tasks.js`, `src/constants/settingsAdminMeta.js` (entrées
  `tasks.student_referent_*`), panneau des réglages de tâches (à identifier en reconnaissance),
  `lib/dailyJobs.js`
- notifications : `lib/notificationEvents.js`, `lib/notifications.js` (évènements
  `task_referent_granted`, `task_referent_granted_manager` ; partagés avec G&L)
- données personnelles : `lib/accountMerge.js`, `lib/accounts/exportRegistry.js`,
  `lib/retention/` (catégorie des vetos), nettoyages de comptes concernés
- exploitation et connecteur : `scripts/student-referents-sync.js`,
  `lib/mcp/domains/opsScripts.js`, `lib/mcp/tools/domains/tasks.js`
- interface : `src/components/tasks/TaskFormModal.jsx`, `TaskTileCard.jsx` (et la fiche de tâche
  si elle affiche les référents), feuille de styles de domaine
- tests : `tests/task-referents*.test.js`, `tests/tasks-put-characterization.test.js`,
  `tests/task-service.test.js`, `tests/rewards-engine.test.js`,
  `tests/notifications-events.test.js`, tests de fusion / export / purge concernés, nouveaux
  `tests/student-referents-*.test.js`, `tests-ui/components/TaskFormModal*`,
  `tests-ui/components/TaskTileCard*`
- docs : `docs/API.md` sections « Tâches » / référents et réglages, ligne `foretmap_tasks` de
  `docs/MCP.md`, `docs/CRONTAB.md`, `docs/MCP_REGISTRE_TRAITEMENT.md` (vetos),
  `docs/reference/foretmap/taches-tutoriels-et-validation.md`
- `CHANGELOG.md` sous `[Non publié]` (livraison directe vers `main`, workflow normal)

Aucun de ces fichiers n'appartient à un flux collège. Fichiers communs aux deux chantiers et
règle : `docs/API.md`, `docs/MCP.md` (sections disjointes) ; `src/index.css` (jamais) ;
`scripts/sync-shared-cores.js` (pas de nouvelle paire sauf nécessité démontrée, alors une ligne en
fin de liste) ; `tests/fixtures/inline-style-baseline.json` et `a11y-static-baseline.json` (ses
seules entrées). Le conflit éventuel sur `CHANGELOG.md` se règle au rebase du second arrivé sur
`main` (SI ou R1).

## 5. Fichiers chauds (réservés à SI)

- `src/App.jsx` (650 lignes) et le shell `src/components/app/` **sauf** `AppPreviewMenu.jsx` et
  `RolePreviewBanners.jsx` (à C1) ; `src/components/app/PedagoTabs.jsx` (monte Glossaire, Quiz,
  Groupes) ; `src/hooks/useAppPedago.js`
- fichiers de plus de 1 500 lignes du périmètre : **`src/components/visit-views.jsx`** (1 529,
  convoité par C1, C2, C5) ; hors périmètre et non touchés : `lib/glSpellCast.js`, `lib/glTour.js`,
  `lib/glTenirImport.js`, `routes/gl/*.js`, `routes/visit/mascot.js`, `src/gl/AppGL.jsx`,
  `lib/glChasse.js`, `routes/rbac.js`. `FoodWebGraph.jsx` n'est pas chaud (C3 seul).
- `src/index.css`, `package.json`, `package-lock.json`, `CHANGELOG.md`,
  `scripts/sync-shared-cores.js`, `tests/shared-cores-sync.test.js` (aucun flux n'ajoute de paire),
  le registre des outils MCP (chaque flux modifie le module de son outil seulement),
  `sql/schema_foretmap.sql`
- tests partagés entre domaines : `tests/mcp-domain-pedago.test.js` (C2, C3, C6),
  `tests-ui/components/pedago/pedagoLoadRace.test.jsx` (C2, C6), `tests-ui/AppShell*.test.jsx`,
  `tests-ui/components/visit/VisitViewMount.test.jsx` — un flux qui a besoin d'y toucher écrit
  plutôt un **nouveau** test et note le reste pour SI
- `tests/college-socle-exposition.test.js`, `tests/pedago-visibility-core.test.js` (ce dernier
  passe à C1)

## 6. Chantiers concurrents

| Chantier                                                                                                                                      | État au 21/11                                                                                                          | Flux exposé                                                           | Consigne                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt_claude_code_ui_ux_visite`                                                                                                             | Lots fusionnés (`claude/ui-ux-visite-lot1-3`, `lot4`, `ui-ux-*` : 0 commit d'avance sur `main`)                        | C1, C5 (Visite)                                                       | Rien à rebaser. Une session de ce prompt relancée **après** cette fiche touchera `src/components/visit/` : C1 / C5 rebasent avant « Ready for review » et SI arbitre. |
| `quiz_reponse_choisie`                                                                                                                        | Aucune branche, aucune PR                                                                                              | C6, D3                                                                | Si une PR apparaît, elle touchera `routes/quiz.js`, `lib/pedago/quizService.js`, `QuizView.jsx` : C6 rebase dessus ; une migration de sa part décale la série (§ 1).  |
| `exploitation_novembre`                                                                                                                       | Aucune branche, aucune PR                                                                                              | aucun connu                                                           | Si une PR apparaît avec une migration, SI décale la série.                                                                                                            |
| CPT F7 (fin des écritures directes en prod, reprise de la dérive de schéma)                                                                   | Non commencé (fiche `docs/coordination/cpt-2026-11.md`)                                                                | D (dérive `plants.health_risk`, `domestication`, ancêtre sauvage)     | Les flux D n'écrivent **pas** les colonnes en dérive ; le chargeur d'instantané les retire en les signalant.                                                          |
| **R1** — élèves référents automatiques (`sessions/R1-referents-eleves.md`)                                                                    | Prompt validé par Oliv le 21/11, à lancer en parallèle des vagues A et B                                               | aucun flux collège (périmètre disjoint) ; numérotation des migrations | « Premier arrivé sur `main` » (§ 1). SI vérifie l'état de `main` avant sa PR et décale la série si R1 est passé.                                                      |
| Branches sans PR du 19/11 (`claude/affectionate-hawking-ra83tc` journal, `claude/dazzling-hawking-pqfrio` tâches, `claude/gl-audit-lot*` G&L) | Restes de branches fusionnées par squash (`dazzling-hawking` = #681, déjà sur `main`) ou en attente ; aucune migration | aucun (journal, tâches, G&L)                                          | Rien.                                                                                                                                                                 |

## 7. Ordre de fusion pour SI

1. `integration/college` porte déjà S0 (migration `378_college_socle`).
2. **C1** d'abord (valeurs de la table : les autres flux codent derrière les clés).
3. **C4**, puis **C2**, **C3**, **C5**, **C6** (périmètres disjoints ; C3 après C1 pour
   `foodWebTypes`, C5 après C1 pour les vignettes de la Visite).
4. **D1 → D6**, chacun renommé `379_…` → numéro définitif du § 1 (`git mv`), dans cet ordre ;
   rejouer toute la série deux fois sur base fraîche puis sur base « instantané ».
5. **Avant d'ouvrir la PR vers `main`** : `git fetch` ; si `main` a reçu des migrations depuis
   la création d'`integration/college` (R1 notamment), rebaser, renuméroter **toute** la série
   au-dessus (§ 1, « Numéros relatifs ») et rejouer les tests de migration. R1 n'est jamais
   fusionné dans `integration/college`.
6. Besoins hors périmètre notés dans les PR (« À faire par SI »), `changelog.d/*.md` →
   `CHANGELOG.md`, suppression de `docs/coordination/college-2026-11/` et du chargeur, PR vers
   `main` (Oliv fusionne).

## 8. Instantané de contenu

`docs/coordination/college-2026-11/snapshot/` (README : tables, filtres, colonnes exclues).
Exporté de la prod le **21/11/2026 vers 17 h 52 UTC**, en lecture seule (`foretmap_export`).
Connecteur présent dans la session S0 : les flux D qui l'ont aussi peuvent relire la prod
(`foretmap_sql_select`) pour vérifier un point ; la source de travail reste l'instantané (même
état pour tous).
