# ForêtMap — État des lieux, pistes et refactorisation (phase 1)

> **Audit en lecture seule** du 25 septembre 2026 — dépôt `main` @ `6e24191` (v1.176.3).
> Module Gnomes & Licornes (GL) **exclu** : ses tables `gl_*` et son code ne sont ni lus ni
> analysés ; le code partagé qui le touche est seulement signalé.
> Livrables : ce rapport et la matrice
> [`2026-09-matrice-tables-code.csv`](2026-09-matrice-tables-code.csv).
> **Phase 2 non commencée** : elle attend le choix d'une piste par Oliv (§ 2).

## Sommaire

- [0. Cadre, sources et limites](#0-cadre-sources-et-limites)
- [Résumé (une page)](#résumé-une-page)
- [Partie 1 — État des lieux](#partie-1--état-des-lieux)
  - [1.1 Cartographie technique](#11-cartographie-technique)
  - [1.2 Correspondance entre base et code](#12-correspondance-entre-base-et-code)
  - [1.3 Points chauds de la base confrontés au code](#13-points-chauds-de-la-base-confrontés-au-code)
  - [1.4 Qualité et risques](#14-qualité-et-risques)
  - [1.5 Préparation du code aux lots B, C, D, E, G](#15-préparation-du-code-aux-lots-b-c-d-e-g)
- [Partie 2 — Pistes](#partie-2--pistes)
- [Partie 3 — Refactorisation](#partie-3--refactorisation)
- [Top 10 des actions](#top-10-des-actions)
- [Questions pour Oliv](#questions-pour-oliv)

---

## 0. Cadre, sources et limites

**Légende.** **[V]** = vérifié (code lu à la ligne citée, commande ou requête exécutée).
**[H]** = hypothèse (déduction non rejouée, ou état de la production non observable ici).
« **audit** » = mesure sur la base `foretmap_audit` ; « **prod** » = chiffre donné par le prompt
(dump v291, **non fourni**).

### 0.1 Bases utilisées (toutes locales et jetables, jamais la production)

| Base             | Construction                                                                                                                  | Contenu hors `gl_`                                                                                                                                                   | Usage                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `foretmap_audit` | fixture anonymisé versionné `sql/fixtures/foretmap-anonymise.sql.gz` (v259), chargé puis migré en **v291** par `initSchema()` | **113 tables + 2 vues = 115 objets** (comme le dump prod) ; 534 `plants`, 650 questions, 324 termes, 327 interactions, 43 clades, 32 groupes, 482 comptes anonymisés | mesures « comme la prod »     |
| `foretmap_empty` | base vide + `initSchema()` sans seed                                                                                          | 113 tables + 3 vues                                                                                                                                                  | reproductibilité de la chaîne |
| `foretmap_test`  | `npm run db:init` au démarrage de la session                                                                                  | 113 tables + 3 vues + seed                                                                                                                                           | suites de tests               |

Moteurs : MariaDB **10.11.14** dans ce bac à sable, **11.4.10** en CI et en docker-compose
(`.github/workflows/ci.yml:69,113`, `docker-compose.yml:6`), **11.4** en production.

### 0.2 Chiffres du prompt re-mesurés

Le fixture est plus ancien que la production (v259 ; 32 groupes contre 55). Chaque chiffre
« prod » a été re-mesuré sur `foretmap_audit` quand c'était possible.

| Chiffre du prompt (prod v291)                             | audit                                                                                                                   | Verdict                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 115 tables hors `gl_`                                     | 113 tables + 2 vues                                                                                                     | confirmé (si la prod compte aussi les vues)               |
| 537 `plants` / 499 interactions / 55 groupes              | 534 / 327 / 32                                                                                                          | différent (fixture antérieur)                             |
| 650 questions / 324 termes / 43 clades                    | 650 / 324 / 43                                                                                                          | confirmé                                                  |
| `groups.curriculum_niveau` vide                           | 32/32 NULL                                                                                                              | confirmé                                                  |
| `resource_question_links` 1 580 / `qqs` 708 / `qqt` 250   | 1 580 / 709 / 250                                                                                                       | confirmé (+1 sur `qqs`)                                   |
| 8 écarts côté espèces                                     | 7 (tous `qqs` → absents de RQL)                                                                                         | différent                                                 |
| 48 / 37 / 4 espèces localisées hors registre              | 48 / 37 / 4                                                                                                             | confirmé                                                  |
| `zones.current_plant` vide ; `zone_history` 1 ligne       | 0/118 ; 1                                                                                                               | confirmé                                                  |
| `observation_logs` 1 ; `user_plant_observation_events` 89 | 1 ; 38                                                                                                                  | confirmé ; différent (fixture antérieur)                  |
| 0 `confirme_site` ; 499 interactions bibliographiques     | 0/452 ; 327/327 `bibliographie`, **0 `source_ref`**                                                                     | confirmé (et aucune source renseignée)                    |
| 71 questions de lycée pour un cycle 3                     | 71 **avec la logique d'avant #547** ; 0 avec le code actuel sous filtre de notion ; **214 en un clic « Tous niveaux »** | chiffre reproduit, exposition réelle différente (§ 1.3.1) |
| 53 termes « avancé » pour un cycle 3                      | logique jamais appliquée par le code ; en réalité **63 termes « avancé » visibles par tous par défaut**                 | infirmé, situation réelle pire (§ 1.3.1)                  |
| 47 questions `glossaire_definitions` sans notion          | 47                                                                                                                      | confirmé                                                  |
| 112 images secondaires sans auteur ni licence             | 117 valeurs (106 URL distinctes, 46 fiches)                                                                             | différent                                                 |
| 13 détritivores classés « décomposeur »                   | 14 animaux                                                                                                              | différent                                                 |
| 145 fiches `hazard_reviewed = 1` sans relecteur           | 0 fiche validée dans le fixture ; **mécanisme qui les produit identifié**                                               | non mesurable, cause établie (§ 1.3.6)                    |
| 7 zones « … (copie) » sur la carte de Beaulieu            | noms anonymisés                                                                                                         | non mesurable, mécanisme identifié (§ 1.3.8)              |
| 5 tables à 0 ligne ; 8 clés non publiées                  | 0 ligne (tables créées après v259) ; `id_key_runs` **n'existe pas**                                                     | non mesurable en prod (§ 1.3.7)                           |

### 0.3 Limites

- **`docs/db/claude_code_lots_BCDEG.md` est absent** du dépôt et de la session. La préparation
  du code aux lots est donc évaluée pour le seul lot B décrit dans le prompt (§ 1.5).
- **Pas de dump de production** : les écarts de schéma propres à la prod sont déduits du fixture
  v259 migré. Trois vérifications en lecture seule sur la prod lèveraient les hypothèses
  majeures (§ Top 10, action 1).
- **PR ouverte #546** (brouillon, non fusionnée) : elle corrige une partie du résolveur de niveau
  (§ 1.3.1). Toutes les mesures portent sur `main`.
- Historique Git approfondi localement depuis le 2026-06-01 (2 747 commits) pour mesurer le
  churn ; l'historique antérieur n'est pas analysé.
- Exécuté : `npm test`, `npm run test:content`, `npm run test:ui`, `npm run test:coverage`,
  `npm run lint`, `npm run format:check`, `npm audit` et `npm outdated` (sur une copie du
  lockfile), jscpd, madge, ESLint (complexité, a11y) et `EXPLAIN`, tous depuis un dossier
  temporaire. **Aucune installation dans le dépôt, aucune migration, aucun commit.** Les
  sorties brutes (scripts, TSV, JSON) sont restées dans le dossier temporaire de la session ;
  les méthodes sont décrites pour pouvoir les rejouer.

---

## Résumé (une page)

**Un code bien tenu sur la forme.** La suite backend passe entièrement (4 137 tests, 0 échec),
le lint n'a aucune erreur, le formatage est conforme, il n'y a **aucun `TODO`/`FIXME`**, la
duplication est faible (≈ 1,1 %), **tout le SQL est paramétré** (0 valeur utilisateur
interpolée sur 619 expressions), **aucune des 232 routes d'écriture n'est anonyme par oubli**
(les 19 routes publiques le sont par conception), et aucun N+1 n'existe sur les écrans élèves. Plusieurs campagnes de
refactorisation (O5 à O10) ont déjà posé de bons patrons.

**Mais le contenu montré aux élèves n'est pas encore fiable.**

1. **Niveau** — une classe ne peut pas être relevée au-dessus du défaut « collège » du site :
   `resolveBiodivPedagoLevel` prend le minimum entre groupe, carte **et** défaut
   (`lib/biodivPedagoLevel.js:99-100`) [V]. Une classe de seconde reçoit les notions de collège,
   et une séance « lycée » ne sert aucune question de lycée (389 questions, 0 de lycée). La PR
   #546 corrige le premier point.
2. **Aucun filtre de niveau côté serveur** : `/api/quiz/draw` est public et applique ce que le
   client envoie ; un clic sur « Tous niveaux » sert 214 questions de lycée ; le glossaire
   montre ses 63 termes « avancé » à tous ; le verrouillage ignore le niveau :
   **84 fiches et 67 termes ne sont gardés que par des questions de lycée** [V].
3. **Trois pertes de données silencieuses** [V] :
   - chaque enregistrement d'une fiche espèce **efface le registre** de ses cartes
     (phénologie, fréquence, validation), soit 373 espèces concernées
     (`lib/speciesJunction.js:385-392`) ;
   - le prochain import QCM **détruira 289 liens glossaire relus à la main** et bloquants
     (`lib/fmQuizImport.js:420-423`) ;
   - le drapeau « danger relu et validé » s'écrit sans la permission dédiée, ce qui explique les
     145 fiches validées sans relecteur en prod (`lib/plantsRouteHelpers.js:58-63`).
4. **Risques de production** : `isomorphic-dompurify`, requis à l'exécution par la vue des
   tutoriels, est déclaré en dépendance de développement alors que le déploiement installe
   `--omit=dev` (500 probable, [H] forte) ; la vue `v_zone_inventory` manque sur la chaîne
   « comme la prod » (réseau trophique par zone en 500, [H] forte) ; un fichier `.html` déposé
   dans un pack de mascotte est servi tel quel sous `/uploads` (**XSS stocké**, vol du jeton
   d'un administrateur) [V] ; le dump de production reste dans l'historique Git (§ 12 de
   l'audit du 22/09, toujours ouvert).
5. **Le schéma et le code divergent** : trois tables de liens question ↔ ressource (la fiche lit
   l'une, le verrouillage l'autre, 7 écarts), **quatre définitions** de « espèce présente sur ce
   site » (27, 61 ou 75 espèces pour la même forêt selon l'écran), aucun chemin entre une
   observation d'élève et la validation d'une présence, 17 colonnes jamais lues, des listes
   d'ENUM recopiées jusqu'à 26 fois.
6. **La dette de structure revient** : `App.jsx` est repassé de 1 466 à 2 276 lignes depuis la
   refactorisation d'août (+55 %), `map-views.jsx` a doublé ; 52 % des appels SQL sont écrits
   dans les routes ; 76 % des appels API du front sont dispersés dans les composants ; 49
   fichiers non-GL dépendent de GL.

**Recommandation** (§ 2.6) : corriger d'abord les **urgences P0** (≈ 4 jours), puis suivre la
**piste A « Stabiliser »** (≈ 10 jours), dont les tests de caractérisation et les deux services
« niveau » et « éligibilité » sont aussi la première marche de la **piste B « Refactoriser par
domaine »**. La **piste C « Consolider le schéma »** avance ensuite par tranches, portée par les
services de B. Des éléments de la **piste D « Terrain d'abord »** (textes visiteurs, cibles
tactiles) peuvent être glissés en parallèle, car ils sont peu coûteux.

---

## Partie 1 — État des lieux

### 1.1 Cartographie technique

#### 1.1.1 Stack et versions

Versions résolues dans `package-lock.json` (lockfile v3, 1 109 paquets) [V].

| Élément                            | Version résolue     | Remarque                                                           |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Node                               | `engines >=20.19`   | 22.22 en local, Node 22 en CI ; **version de prod non documentée** |
| npm                                | 10.9.7              | seul gestionnaire de paquets                                       |
| Express                            | 5.2.1               | propage les rejets de promesse                                     |
| mysql2                             | 3.24.4              | `pool.execute` : requêtes préparées côté serveur                   |
| socket.io                          | 4.8.3               | `ws` forcé en ^8.21 par `overrides` ; polling seul en prod         |
| pino / zod                         | 10.3.1 / 4.6.5      | zod via `lib/validate.js`, dans 19 fichiers de routes sur 54       |
| jsonwebtoken / jose                | 9.0.3 / 6.2.12      | HS256 pour la session ; `jose` réservé au LTI (RS256 + JWKS)       |
| multer, helmet, express-rate-limit | 2.4.0, 8.3.0, 8.7.0 |                                                                    |
| sharp                              | 0.35.4              | **optionnel** : son absence désactive le retrait EXIF en silence   |
| React / Vite                       | 19.3.0 / 8.3.0      | build servi depuis `dist/`                                         |
| Vitest / Playwright                | 5.0.1 / 1.63.0      |                                                                    |
| ESLint / Prettier                  | 10.10.0 / 3.9.8     | pas de TypeScript ni de `checkJs`                                  |

**Build** : `npm run build` → `scripts/build-safe.js:94-105` (manifestes GL, `vite build`,
`build-pwa.js`, puis quatre miroirs CJS : `sync-visit-pack-server-lib`,
`sync-gl-pack-server-lib`, `sync-term-autolink-lib`, `sync-shared-cores`). **Lancement** :
`server.js` exporte `{ app, boot }` ; `app.js` (34 lignes) est l'entrée Passenger.

#### 1.1.2 Arborescence commentée

| Zone                     | Contenu (hors GL, sauf mention)                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js` (926 l.)     | pipeline : cors → Permissions-Policy → helmet sans CSP → compression → requestId → limiteurs → verrou 503 → parseurs JSON → CSP → log HTTP → statiques (`dist`, `/uploads` avec garde privée, `/tutos`) → health/version/sync-state → 24 routeurs `/api/gl/*` → garde anti-JWT GL (l. 510-534) → **43 préfixes ForetMap** (l. 536-590) → SPA fallback → gestionnaire d'erreurs (l. 647) |
| `database.js` (1 187 l.) | pool, `queryAll/queryOne/execute/withTransaction`, carte `SYNC_DOMAIN_TABLES` (l. 245-302), runner de migrations (l. 875), seed                                                                                                                                                                                                                                                         |
| `middleware/`            | `requireTeacher.js` (JWT, `requirePermission`) + 2 fichiers GL                                                                                                                                                                                                                                                                                                                          |
| `routes/`                | 54 fichiers, 25 915 lignes, ≈ 402 handlers ; sous-routeurs `routes/tasks/*`, `routes/visit/*` (GL : 32 fichiers)                                                                                                                                                                                                                                                                        |
| `lib/`                   | 289 fichiers, ≈ 59 000 lignes ; `auth/`, `tasks/`, `moodle/` (22), `lti/` (10), `shared/` (37 cœurs partagés ForetMap/GL), miroirs `visit-pack/`, `term-autolink/` (GL : 116 fichiers)                                                                                                                                                                                                  |
| `src/`                   | 767 fichiers, ≈ 128 900 lignes ; `components/` (278 fichiers dont 61 vues `*.jsx` à plat), `shared/` (246), `utils/` (154), `hooks/` (67), `contexts/` (5), `services/` (6), `plan/`, `staff/` (GL : 340)                                                                                                                                                                               |
| Entrées HTML             | `index.vite.html` (foret), `gl.html`, `plan.html`, `staff.html`, `mascot-pack-tool.html` (`vite.config.js:154-160`) ; registre des produits `lib/products.js:55-165`                                                                                                                                                                                                                    |
| `scripts/`               | 109 fichiers dont 6 `.sh` (auto-deploy-cron, db-backup, uptime-check, moodle-sync-cron…)                                                                                                                                                                                                                                                                                                |
| `migrations/`            | 280 fichiers `NNN_*.sql` de 001 à 291 (81 GL)                                                                                                                                                                                                                                                                                                                                           |
| `dist/`                  | **versionné** : 359 fichiers, 33 Mo ; 35 583 modifications de fichiers sous `dist/` depuis juin                                                                                                                                                                                                                                                                                         |

**Tâches planifiées** [V] :

| Mécanisme                           | Cadence                                         | Rôle                                                                                   | Preuve                            |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| timer interne du process Node       | 45-165 s après le boot, puis `setInterval` 24 h | tâches récurrentes, archivage automatique, purge des notifications, rappels d'échéance | `server.js:782-810`               |
| cron `auto-deploy-cron.sh`          | toutes les 2 min                                | pull, migrations optionnelles, redémarrage, contrôle, rollback                         | `docs/CRONTAB.md`                 |
| cron sauvegarde / sonde / keepalive | 03:00 ; `*/5` ; `*/3` de 7 h à 22 h             | `mysqldump` (rétention 14 j), `/api/ready`, réveil Passenger                           | idem                              |
| cron purge RGPD                     | mensuel                                         | `audit_log`, `security_events` ; « pas optionnelle »                                   | installation **non vérifiée** [H] |
| cron Moodle                         | 06:30, jours ouvrés                             | simulation seulement                                                                   | optionnel                         |

Le process Passenger s'arrête après 300 s d'inactivité et redémarre à chaque déploiement : le
`setInterval` de 24 h tourne en pratique « à chaque boot ». `docs/EXPLOITATION.md:175` annonce
deux traitements, le code en lance quatre (`server.js:794-800`).

#### 1.1.3 Déploiement vers cPanel (o2switch)

- **Mode 1, cron** (`scripts/auto-deploy-cron.sh`) : verrou, arbre propre exigé, `git fetch`,
  accalmie de 180 s, `git pull --ff-only`, `npm ci --omit=dev` si `package*.json` change
  (l. 283-285), `db:migrate` **seulement si** `DEPLOY_AUTO_MIGRATE=1` (défaut 0) **et** si un
  fichier de `migrations/` change (l. 288), redémarrage, `post-deploy-check`, rollback et
  e-mail en cas d'échec. Le rollback redéploie le code, **pas la base** (l. 295-300).
- **Mode 2, bundle ZIP** : `prepare-runtime-deploy.js` (`npm prune --omit=dev`, l. 178).
- **Bascule `dist/` → branche `dist-artifact/main`** (`docs/DEPLOY_DIST_ARTIFACT.md`) : livrée
  mais l'étape 3 n'est pas faite (`DEPLOY_DIST_SOURCE=repo` par défaut, `dist/` encore
  versionné).
- **Les migrations ne tournent pas au démarrage** : `initDatabase()` fait un ping et intègre les
  tutoriels (`database.js:1143-1151`). Elles passent par `npm run db:migrate`.
- **Variables d'environnement** : 98 noms lus par le backend hors GL (BDD 9, secrets et auth 17,
  LTI et Moodle 13, SMTP 8, API biodiversité 10, HTTP et limites 21, observabilité 14, marque et
  jobs 8). `.env.example` en documente 77 ; **31 noms utilisés n'y figurent pas** (dont les 9
  `LTI_*`), mais ils sont décrits dans `docs/EXPLOITATION.md` § 2.
- **Secrets** : `.env` serveur (non versionné, `.gitignore:19`) ou variables de « Setup Node.js
  App » ; chargés implicitement par `require('dotenv').config()` en tête de `database.js` ;
  `validateEnv` (`lib/env.js`, appelé en `server.js:857`) n'exige que `DB_*` et une longueur
  ≥ 16 pour `JWT_SECRET` et `VISIT_COOKIE_SECRET` en production. Hors production, un secret
  JWT de repli est codé en dur (`middleware/requireTeacher.js:15-17`).

#### 1.1.4 Tests, lint, formatage, CI

| Suite             | Outil                            | Fichiers (dont GL) | Cas     | Résultat local [V]                           |
| ----------------- | -------------------------------- | ------------------ | ------- | -------------------------------------------- |
| `tests/*.test.js` | node:test + supertest            | 580 (199)          | ≈ 4 139 | **4 137 réussis, 0 échec**, 2 ignorés, 854 s |
| `tests/content/`  | node:test (job CI `contenu`)     | 13 (1)             | 64      | 64/64                                        |
| `tests-ui/`       | Vitest + jsdom + Testing Library | 643 (173)          | ≈ 4 875 | **4 874 réussis, 1 échec**, 556 s            |
| `e2e/`            | Playwright (4 projets, 1 worker) | 57 specs (21)      | ≈ 155   | non exécuté                                  |

- **Échec UI** : `tests-ui/plan/AppPlanMount.test.jsx`, « lien profond `?lieu=` ouvre
  directement la fiche » ; il échoue aussi lancé seul. Statut en CI non vérifié.
- **Couverture backend** (`npm run test:coverage`) : node annonce 92,5 % des lignes, mais ce
  total **inclut les fichiers de test**. Recalcul hors GL et hors tests : **88,5 % des lignes,
  72,7 % des branches, 85,8 % des fonctions** ; branches de `routes/` à **64,7 %** ;
  `server.js` + `database.js` à 72,9 % des lignes ; `lib/env.js` à **9,6 %**. **Aucun seuil**
  n'est imposé.
- **Fichiers ≥ 300 lignes les moins couverts** : `lib/groupImport.js` (60,5 %),
  `lib/visit-pack/mascotPack.js` (63,6 %), `lib/contentLibraryBulk.js` (67,9 %),
  `server.js` (70,4 %), `routes/plants.js` (72,2 %), `routes/clades.js`, `routes/individuals.js`
  (72,9 %), `routes/user-journal.js` (**29,1 % des branches**).
- **Couverture UI** : impossible sans installation (`@vitest/coverage-v8` absent alors que le
  script `test:ui:coverage` existe).
- **ESLint** (flat config, **sans `eslint:recommended`**) : côté backend, seules `no-undef` et
  `no-debugger` sont en erreur ; côté front, `react-hooks/rules-of-hooks`, ≈ 20 règles jsx-a11y
  et `no-use-before-define` sont en erreur. Résultat : **0 erreur, 161 avertissements**
  (≈ 75 hors GL). `e2e/` n'est pas linté. **Prettier** : tout est conforme.
- **CI** (`.github/workflows/ci.yml`) : jobs `quality` (unicité des migrations, lint, format,
  Vitest), `contenu` (MariaDB 11.4.10, `db:init`, `test:content`) et `test` (`test:coverage`,
  build, Playwright `plan-mobile` + `mobile-webkit`) bloquants ; **la suite e2e complète n'est
  pas bloquante** (`continue-on-error`, l. 205-211). `frontend-dist.yml` recommite `dist/` sur
  les PR ; `dist-publish.yml` pousse `dist-artifact/main` toutes les heures ;
  `version-bump.yml` bumpe après fusion.

#### 1.1.5 Migrations et `schema_version`

**Mécanique** (`database.js`) [V] :

- `initSchema()` (l. 742-842) exécute d'abord **tout** `sql/schema_foretmap.sql` (81
  `CREATE TABLE IF NOT EXISTS`), puis `runMigrations()`, puis `dropLegacyScaffolding()`
  (`lib/legacySchemaCleanup.js` : supprime 2 tables et 15 colonnes que le fichier de schéma
  doit encore déclarer pour que les vieilles migrations se rejouent), puis des semis.
- `schema_version` est **un curseur unique** : tout fichier de numéro inférieur à la version
  courante est sauté (l. 908). Une migration ajoutée avec un numéro plus petit n'est **jamais**
  appliquée ; c'est déjà arrivé (217/218, d'où la rustine `replayMissedTeamCompositionMigrations`).
  Le filtre `/^\d{3}_/` ignorera toute migration ≥ 1000.
- Doublons historiques tolérés : 021 et 037 (`LEGACY_DUPLICATE_MIGRATION_NUMBERS`, l. 848).
  Numéros manquants : 31, 32, 35, 60, 125, 127, 171, 179-182, 249, 250.
- **Pas de transaction** : une instruction à la fois, en autocommit. Les errno 1050, 1060, 1061,
  1022, 1091 et 1826 sont ignorés et journalisés en `debug` (l. 16-23, 70-94). Conséquences
  vérifiées : une colonne déjà présente avec une **autre définition** passe inaperçue ; un
  `ALTER` à plusieurs clauses dont la première tombe en 1060 est **sauté en entier** (cas des
  migrations 146 et 167) ; un fichier interrompu est rejoué depuis le début, y compris ses
  `UPDATE` non gardés (ex. `055:4` remet à NULL des niveaux de tâches).
- **Idempotence globale vérifiée** : un second `initSchema()` sur `foretmap_empty` redonne une
  structure strictement identique. Les migrations 286 et 287 reposent seulement sur les errno
  ignorés (`ADD COLUMN`/`ADD INDEX` nus).
- Chaque `initSchema()` ré-insère par `INSERT IGNORE` les cartes `foret`/`n3` et la catégorie
  `cat-infrastructure` (`schema_foretmap.sql:23,947`) : une suppression faite par un
  administrateur est annulée au migrate suivant.

**La chaîne complète reproduit-elle la v291 ?** **Non, pas exactement** [V sur le fixture] :

| #     | Objet                                                                 | base vide + migrations                 | fixture v259 migré (« comme la prod »)   | Origine                                                            |
| ----- | --------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| 1     | vue `v_zone_inventory`                                                | présente                               | **absente**                              | créée par 124 et 183 seulement ; le fixture ne contient aucune vue |
| 2     | collation de `schema_version`                                         | `utf8mb4_general_ci`                   | `utf8mb4_unicode_ci`                     | `001:5` sans `COLLATE`                                             |
| 3     | `audit_log.details`                                                   | `text`                                 | `mediumtext`                             | aucune source dans le dépôt (modification manuelle en prod, [H])   |
| 4     | `map_markers.note`, `zones.description`                               | `DEFAULT NULL`                         | `DEFAULT ''`                             | héritage prod                                                      |
| 5     | `visit_tutorials.map_id`                                              | sans défaut                            | `DEFAULT 'foret'`                        | le fichier de schéma diffère de `056:5`                            |
| 6     | index `idx_visit_tutorials_active_sort`                               | `(map_id, is_active, sort_order)`      | `(is_active, sort_order)`                | même nom, définitions différentes                                  |
| 7-8   | FK et index de `glossary_term_relations` et `glossary_term_tutorials` | `fk_glossary_rel_*`, `fk_gtt_tutorial` | `fk_gtr_*`, `fk_gtt_tuto`                | noms venus d'un ancien dump                                        |
| 9     | `group_members`                                                       | —                                      | `idx_group_members_group_role(group_id)` | index dégénéré après suppression de `role_in_group`                |
| 10    | `map_species`                                                         | —                                      | `idx_map_species_status`                 | création manuelle en prod ([H])                                    |
| 11-12 | ordre des colonnes (19 tables), commentaires (80 contre 112)          | —                                      | —                                        | cosmétique                                                         |

`foretmap_test` diffère encore des deux autres : **la structure dépend du chemin suivi**, parce
que le fichier de schéma évolue et que les erreurs 1060/1061/1091 masquent les différences.

**Conformité cPanel** [V] :

| Point                                          | Constat                                                                                                                                                                    | Verdict          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Vues des migrations                            | 8 `CREATE SQL SECURITY INVOKER VIEW`, sans `DEFINER` (124, 143, 183, 269, 272)                                                                                             | conforme         |
| TRIGGER, EVENT, PROCEDURE, `SET GLOBAL`, SUPER | aucun                                                                                                                                                                      | conforme         |
| `DEFINER` implicite                            | MariaDB enregistre `DEFINER=foretmap@localhost` sur les vues ; `scripts/db-backup.sh` ne le retire pas : une restauration sous un autre compte sans SUPER échouerait ([H]) | **à corriger**   |
| `scripts/db-backup.sh:74-77`                   | pas de `--default-character-set=utf8mb4` ; ne cherche que `mysqldump` et sort en code 0 s'il manque (l. 58-60)                                                             | **non conforme** |
| `docs/EXPLOITATION.md:511`                     | commande de restauration sans `--default-character-set`                                                                                                                    | **non conforme** |
| `--databases`                                  | absent partout ; `export-anonymized-fixture.js` est conforme                                                                                                               | conforme         |
| `CREATE TABLE` sans `COLLATE`                  | 001 (`schema_version`) et 241 (`rbac_seeded_permissions`) → `general_ci` en 10.11, `uca1400_ai_ci` probable en 11.4 ([H])                                                  | **à corriger**   |
| Privilèges locaux                              | `foretmap@localhost` a `ALL PRIVILEGES … WITH GRANT OPTION` : les tests ne peuvent pas détecter un besoin de SUPER                                                         | à savoir         |

**Contraintes pour écrire la migration 292 et les suivantes** : numéro unique > 291 ;
`COLLATE=utf8mb4_unicode_ci` explicite sur chaque table et chaque comparaison calculée (le piège
`CAST(id AS CHAR) = resource_ref` lève l'erreur 1267) ; ne jamais viser **par leur nom** les
FK et index des lignes 6 à 8 (noms différents en prod, l'erreur 1091 serait ignorée en
silence) ; `UPDATE` toujours gardés par un `WHERE` ; pas d'`ALTER` à plusieurs clauses avec des
`ADD` nus.

### 1.2 Correspondance entre base et code

#### 1.2.1 Matrice table → modules

Fichier : [`2026-09-matrice-tables-code.csv`](2026-09-matrice-tables-code.csv), colonnes
`table,module,chemin,acces,nb_references,domaine_module` ; `acces` ∈ {R, W, RW}.

- **Méthode** [V] : les fichiers non-GL (`server.js`, `app.js`, `database.js`, `routes/**`,
  `lib/**`, `middleware/**`, `scripts/**`, `src/**`) sont analysés par l'arbre syntaxique de
  `@babel/parser` ; toutes les chaînes (littéraux, templates, concaténations) passent dans un
  scanner SQL (FROM, JOIN, INTO, UPDATE, DELETE, REPLACE, TRUNCATE, DDL). R = lecture, W =
  écriture. Les **127 noms de tables dynamiques** (`${table}`) ont été résolus à la main à
  partir de leur liste blanche.
- **Résultat** : 765 lignes, 171 fichiers, 115 objets sur 116 touchés (la vue
  `v_visit_coverage` n'est lue par aucun code). La ligne `v_zone_inventory` a été ajoutée à la
  main : la vue est lue par `routes/food-web.js:103` mais absente de la base « comme la prod ».
  Le front ne contient aucune requête SQL.
- **Qualité** : sondage de 20 couples, table et fichier justes 20/20, type d'accès juste 18/20
  (deux faux R dans `scripts/migrate-sqlite-to-mysql.js`, qui lit SQLite). Faux positifs
  structurels ≈ 4 % : SQL généré comme texte (`lib/sqliteGardenSqlExport.js`, exports).
  Contre-contrôle des faux négatifs : ≈ 0. Limite : les lectures faites à travers une vue ne
  sont pas reportées sur ses tables sous-jacentes.
- La colonne `domaine_module` est un **premier classement heuristique** par chemin ; la
  cible proposée en § 3.1 le corrige par endroits.

**Tables les plus partagées** (modules applicatifs ; entre parenthèses : fichiers qui écrivent) :
`users` 51 (16), `zones` 28 (6), `tasks` 24 (12), `map_markers` 21 (4), `roles` 21 (2),
`groups` 21 (8), `maps` 19 (2), `tutorials` 18 (4), `group_members` 18 (8), `user_roles` 17
(3), `plants` 13 (3), `task_assignments` 13 (6), `quiz_questions` 12 (1),
`resource_question_links` 12 (6), `glossary_terms` 11 (0). **16 tables sont touchées par au
moins 4 domaines.**

**Accès croisés GL (signalés, non analysés)** : 19 fichiers non-GL lisent ou écrivent des
tables `gl_*` (`lib/accountMerge`, `auditLog`, `auth/tokenEpoch`, `groupScope`, `identity`,
`learningGating{Acknowledge,Admin,Cooldown,LockMode}`, `lti/session`,
`moodle/{apply,localState,teamsMirror,undo}`, `qcmPresentationUse`, `quizQuestionStats`,
`realtime`, `shared/forumCore`, `studentDeletion`, `routes/admin-ops`, `routes/admin/moodle`,
`routes/groups`) ; 9 modules GL touchent `users`, `groups`, `group_members`, `user_roles`…

#### 1.2.2 Tables jamais utilisées ou mal alimentées

| Objet                                                                                                                                                        | Constat [V]                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v_visit_coverage` (vue, migration 269)                                                                                                                      | **morte** : seuls un test et la migration la citent                                                                                                                                                                                   |
| `v_zone_inventory` (vue, migrations 124, 183)                                                                                                                | **lue** par `routes/food-web.js:102-104` mais **absente** de la chaîne « comme la prod » → `GET /api/food-web?zoneId=` en 500 si la prod est dans ce cas ([H] forte) ; le test ne couvre que le 404 (`tests/food-web-api.test.js:61`) |
| `glossary_terms`, `glossary_term_{species,relations,interactions}`, `plant_name_aliases`, `curriculum_notions`, `quiz_question_species`, `school_calendar_*` | **lues sans jamais être écrites** par l'application : contenu apporté par les migrations et `scripts/import-biodiv-pedago.js`. Toute correction éditoriale passe par une migration                                                    |
| `lti_nonces`                                                                                                                                                 | écrite sans être lue (anti-rejeu par clé unique) : normal                                                                                                                                                                             |
| Tables absentes citées par le code                                                                                                                           | `students`, `teachers`, `projects`, `elevation_audit`, `collective_*` : seulement dans des scripts historiques ou derrière une garde `tableExists`                                                                                    |

**25 tables sont vides** dans `foretmap_audit` : 4 purgées par l'anonymisation, 12 créées après
v259 (dont `id_keys*`, `tracked_individuals`, `individual_measurements`, `user_rewards`,
`pedago_session_runs`, `quiz_question_notions`, `glossary_term_notions`, `notifications`) et 9
déjà vides en v259 (`context_comment_reports`, `forum_reports`, `group_scopes`,
`project_markers`, `sync_conflicts`, `sync_pending_matches`, `task_markers`,
`user_journal_article_assets`, `visit_mascot_sprite_library`).

#### 1.2.3 Colonnes jamais utilisées

**17 colonnes sur 929 n'apparaissent nulle part** dans le code applicatif ni dans les scripts
(recherche du nom en snake_case et en camelCase, commentaires retirés) [V] :

| Colonne                                                                          | Remplissage (audit)                | Remarque                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `map_species.months_present`, `detection_mode`, `frequency`, `validation_status` | 451/452, 451/452, 330/452, 452/452 | **données réelles jamais lues, et effacées** à chaque enregistrement d'une fiche (§ 1.3.4)   |
| `map_species.presence_status`                                                    | 390/452                            | « utilisée » seulement par un homonyme (`lib/shared/presenceCore.js:126`, présence en ligne) |
| `map_species.first_record_at`, `first_record_by`                                 | 0/452                              | prévues pour la validation, jamais écrites                                                   |
| `external_groups.course_external_id`, `external_groups.gl_team_id`               | 0/4                                | `gl_team_id` touche GL : à signaler                                                          |
| `group_members.joined_at`                                                        | 520/520                            | lue **seulement par du code GL** (`glRoster`, `glPlayerMembership`)                          |
| `rbac_seeded_permissions.seeded_at`                                              | 142/142                            | trace technique                                                                              |
| 7 colonnes de la vue `v_visit_coverage`                                          | —                                  | vue morte                                                                                    |

**Colonnes ciblées, vérifiées à la main** :

| Colonne                                                   | Usage réel                                                                                                                                                    | Remplissage (audit)                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `zones.current_plant`                                     | encore écrite (`routes/zones.js:556,722`, `routes/visit/sync.js:241`, seed) et lue en repli (`routes/visit.js:251,511`, 7 fichiers front)                     | **0/118**                                        |
| `map_markers.plant_name`                                  | même rôle que `current_plant`                                                                                                                                 | 3/95                                             |
| `zones.stage`                                             | **écrite seulement** (seed, `visit/sync.js:241`, export SQLite, conversion legacy) ; jamais relue par l'API                                                   | 118/118 (71 `empty`, 27 `special` = `special=1`) |
| `zone_history`                                            | écrite seulement si l'ancien `current_plant` est non vide, donc plus jamais ; encore lue et affichée (`routes/zones.js:276-297`, `ZoneInfoModal.jsx:478-503`) | 1 ligne                                          |
| `quiz_questions.difficulte_label`                         | écrite par le CRUD et l'import, non affichée par `QuizView` ; **entièrement déterminée par `difficulte`** (1 ↔ « ⭐ Facile »…)                                | 528/650                                          |
| `plants.lookalike_species`                                | dans `PLANT_COLUMNS`, formulaire, import                                                                                                                      | **1/534**                                        |
| `plants.identification_criteria`, `identification_period` | idem                                                                                                                                                          | **0/534**                                        |
| `plants.remark_1..3`                                      | formulaire (3 champs d'une ligne), `CatalogRemarksSection`                                                                                                    | 326 / 130 / 89                                   |
| `groups.curriculum_niveau`                                | lue et éditable                                                                                                                                               | **0/32**                                         |

#### 1.2.4 Colonnes utilisées par le code mais absentes du schéma

**Code applicatif : 0 écart** [V] (2 009 références `alias.colonne`, 193 INSERT, 220 UPDATE
contrôlés ; auto-test à 6 erreurs plantées, toutes détectées). Écarts réels **dans des scripts**
seulement :

- `users.affiliation` (supprimée par la migration 267) : `scripts/backfill-users-unification.js:16,34`,
  `scripts/migrate-sqlite-to-mysql.js:126`, `scripts/profile-memory-scenarios.js:227` →
  **scripts cassés** (`ER_BAD_FIELD_ERROR`) ;
- `zones.living_beings`, `map_markers.living_beings` : `scripts/migrate-sqlite-to-mysql.js:76,232`
  (script historique, cassé) ;
- `zone_photos.image_data`, `task_logs.image_data` : protégés par `hasImageDataColumn()`.

#### 1.2.5 Mode d'accès, requêtes dupliquées, concaténations

- **SQL brut, sans ORM ni constructeur de requêtes** [V]. Appels hors scripts : 409
  `queryAll`, 518 `queryOne`, 506 `execute`, 49 `withTransaction` (31 fichiers). Une transaction
  manuelle hors helper (`routes/plants.js:401-454`). **`SELECT *` : 116 fois**, et `alias.*` 18
  fois, dans 45 fichiers.
- **SQL dans les routes : 52 %** des appels (740 contre 687 dans `lib/`) ; terrain 75 %,
  biodiversité 69 %, tâches 66 %, pédagogie 59 %, identité 34 %, vie sociale 26 % (§ 3.1).
- **Requêtes dupliquées** : 90 groupes identiques présents dans au moins 2 fichiers, 97 quasi
  identiques. Exemples : `SELECT id FROM maps WHERE id=?` (8 fichiers) ; `SELECT id FROM plants
WHERE id=?` (6) ; lecture et écriture directes de `app_settings` qui **contournent
  `lib/settings.js`** (`helpContent.js:163,211`, `helpNarrator.js:148,160`, `tourContent.js:26,36`,
  `visitMascotBuiltinSeed.js:384`, `visitMascotVisibility.js:54`) ; le même bloc Moodle
  répété dans `apply.js`, `conflicts.js`, `undo.js` ; l'enrichissement `task_zones`/`task_markers`
  recopié de `lib/tasks/taskQueries.js:182,201` dans `routes/tutorials.js:275,294`.
- **Concaténations et interpolations** : 619 expressions `${…}` ou `+` dans du SQL, sur 490 sites
  et 100 fichiers : 405 identifiants sûrs (constantes, listes blanches), 143 listes de `?`
  générées, **0 valeur contrôlable par l'utilisateur** [V]. Seul défaut, dans un script :
  `scripts/export-anonymized-dump.js:37` interpole `users.id` (varchar) sans guillemets, ce qui
  rend le dump invalide si l'identifiant n'est pas numérique (pas d'entrée utilisateur).

#### 1.2.6 Valeurs d'ENUM et de SET recopiées en dur

Le schéma compte **46 colonnes ENUM ou SET** hors `gl_` (liste complète en annexe A) et **55
colonnes `varchar` utilisées comme énumérations** (statuts, niveaux de tâches…). Modules de
constantes existants : `lib/pedagoScales.js` (« référentiel unique », miroir ESM testé),
`lib/shared/foodWebCore.js` ↔ `src/shared/foodWebTypes.js` (miroir **manuel**),
`src/constants/plantMetaSections.js`. `sync:shared-cores` ne couvre **aucun** domaine d'ENUM.
Un seul test compare un ENUM SQL au code (`tests/plants-hazard-review.test.js:46-58`).

| Valeurs (colonnes)                                                                                              | Copies [V]                                                                                                                                                                                                                                           | Divergences                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `college/lycee/universite` (`users.biodiv_pedago_level`, `groups`/`maps.pedago_level`, `pedago_sessions.level`) | **26 copies** hors tests : `pedagoScales.js:62`, `biodivPedagoLevel.js:15-23` (lib et src), `pedagoSessions.js:42`, `settings.js:228`, `SessionsView.jsx:19`, `<select>` de `groups-views.jsx:174`, `MapsAdminPanel.jsx:326`, `stats-views.jsx:596`… | aucune aujourd'hui                                                                                      |
| `college/lycee` (`quiz_questions.niveau`, `id_keys.niveau`)                                                     | `fmQuizCrud.js:34`, `fmQuizImport.js:43`, `routes/id-keys.js:41`, `IdKeysView.jsx:271`, `QuizView.jsx:33`, `FMQuizQuestionEditorPanel.jsx:62`, `FMLearningLinksPanel.jsx:34`                                                                         | aucune                                                                                                  |
| `cycle3…es_terminale` (`curriculum_notions.niveau`, `groups.curriculum_niveau`)                                 | `lib/curriculumNotions.js:39`, `src/utils/curriculumNotions.js:15`, `pedagoScales.js:36,51,70`                                                                                                                                                       | sous-ensembles volontaires                                                                              |
| `base/approfondissement/avance` (`glossary_terms.niveau`)                                                       | `pedagoScales.js:86`, `GlossaryView.jsx:22`, `glossaryCardCore.js:18`                                                                                                                                                                                | aucune                                                                                                  |
| `plants.health_risk`, `hazard_exposure`, `toxicity_level`                                                       | `lib/plantHealthRisk.js:17,28,38`, `lib/plantHazard.js:12-79`, `plantMetaSections.js:134-157`                                                                                                                                                        | aucune                                                                                                  |
| `plants.trophic_role`                                                                                           | `plantPayloadSync.js:118`, `PlantEditForm.jsx:521`, `PlantSummaryBlocks.jsx:25`, `foodWebGraphModel.js:19`                                                                                                                                           | aucune                                                                                                  |
| `species_interactions.interaction_type` (19 valeurs)                                                            | `foodWebCore.js:21,39,48,148` ↔ `foodWebTypes.js:10,28,37,96` ; partitions dans `pedagoContentAudit.js`, `foodWebGraphModel.js`, `foodWebEdgeStyle.js` ; sous-ensemble de 8 dans `biodivPedagoLevel.js:32`                                           | sous-ensemble collège (caractère volontaire à confirmer)                                                |
| `quiz_questions.difficulte` (tinyint, données 1 à 3 ou NULL)                                                    | `QuizView.jsx:41` propose **1 à 5**                                                                                                                                                                                                                  | **les filtres 4 et 5 ne trouvent jamais rien** ; ★ (U+2605) dans le code, ⭐ (U+2B50) en base           |
| `quiz_questions.statut` (varchar, 650/650 `actif`)                                                              | aucune liste ; « actif » et « inactif » implicites (`questionCrudCore.js:119-127`)                                                                                                                                                                   | **aucune contrainte en base** : une faute de frappe passerait                                           |
| `tasks.danger_level`, `difficulty_level`, `importance_level` (varchar(32))                                      | **7 endroits** : `lib/taskRouteHelpers.js:22-35` et `CASE` SQL l. 108-116, `lib/tasks/taskImport.js:31`, `lib/recurringTasks.js:328-344`, `src/utils/badges.jsx:96-98`, `src/utils/taskListHelpers.js:12-17`, `TaskFormLevelsField.jsx`              | valeurs en base toutes conformes ; une valeur ajoutée à un seul endroit serait rendue à NULL en silence |
| `tasks.status` (varchar)                                                                                        | 3 `Set` identiques en back (`taskRouteHelpers.js:14`, `taskStatusRecalc.js:10`, `taskImport.js:22`), 5 fichiers front                                                                                                                                | le front ajoute des statuts dérivés (`overdue`, `project_*`)                                            |
| `map_species.validation_status`, `presence_status`, `frequency`, `detection_mode`                               | **aucune copie, aucun code**                                                                                                                                                                                                                         | `confirme_site` jamais utilisé                                                                          |
| `sync_conflicts.kind`                                                                                           | `src/utils/moodleAdminReport.js:19`                                                                                                                                                                                                                  | `both_changed` jamais écrit ni libellé : **valeur morte**                                               |

---

### 1.3 Points chauds de la base confrontés au code

#### 1.3.1 Niveaux pédagogiques : onze échelles, aucune autorité serveur

**Les échelles** (mesures audit) [V] :

| #   | Échelle                               | Valeurs (audit)                                                      | Rôle réel dans le code                                                                                                                                 |
| --- | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `users.biodiv_pedago_level`           | 482/482 NULL                                                         | préférence de l'élève (`routes/auth.js:465-499`), ne peut que baisser le niveau                                                                        |
| 2   | `groups.pedago_level`                 | 32/32 NULL                                                           | entre dans le calcul du front (`lib/biodivPedagoLevel.js:171-187`)                                                                                     |
| 3   | `groups.curriculum_niveau` (mig. 290) | 32/32 NULL (19 groupes ont un parent)                                | étape déduite ; remonte `parent_group_id`, **sans filtre `is_active`** sur les parents (`:214-216`)                                                    |
| 4   | `maps.pedago_level`                   | 7/7 NULL                                                             | entre dans le calcul du front                                                                                                                          |
| 5   | `pedago_sessions.level`               | college 2, lycee 2                                                   | **libellé et récompenses seulement** (`SessionsView.jsx:296`, `routes/pedago-sessions.js:208`) ; jamais une entrée du calcul                           |
| 6   | `config_json.notionNiveau`            | `cycle4` 1, `college` 1, `lycee` 2                                   | **mélange confirmé** ; aucune validation à l'écriture (`lib/pedagoSessions.js:141`) ; une valeur invalide est ignorée par le front → tirage non filtré |
| 7a  | `quiz_questions.niveau`               | college 436, lycee 214                                               | filtre `niveau=` de `/api/quiz/draw` (`routes/quiz.js:242-245`)                                                                                        |
| 7b  | `quiz_questions.difficulte`           | 1 : 128, 2 : 322, 3 : 78 (que du lycée), NULL : 122 (que du collège) | filtre optionnel                                                                                                                                       |
| 7c  | `difficulte_label`                    | correspondance 1:1 avec `difficulte`                                 | **redondant**, écrit à part par l'import (`lib/fmQuizImport.js:251,378`)                                                                               |
| 8   | `glossary_terms.niveau`               | base 153, approfondissement 108, avance 63                           | filtre optionnel (`routes/glossary.js:79-82`) ; **aucun défaut lié au niveau**                                                                         |
| 9   | `id_keys.niveau`                      | 0 ligne                                                              | stocké, affiché, **jamais filtré**                                                                                                                     |
| 10  | `curriculum_notions.niveau`           | 12 notions (c3 2, c4 2, 2de 3, 1spé 1, Tspé 1, ES1 1, EST 2)         | pivot des notions (`lib/curriculumNotions.js:98-119`)                                                                                                  |
| 11  | rôles `eleve_novice` → `eleve_expert` | rangs 100, 200, 300 et **150** ; seuils de 2, 5, 15 et **40** tâches | progression par tâches (`lib/rbac.js:453-470`), **aucun lien** avec quiz, glossaire ou verrouillage ; rang d'`eleve_expert` incohérent avec son seuil  |

La seule table de correspondance est du **JavaScript** : `lib/pedagoScales.js` (miroir
`src/utils/pedagoScales.js`) relie étape → paliers, niveau de question → palier d'entrée,
profondeur de terme → palier d'entrée. `difficulte` en est volontairement exclue (`:29-30`) ;
`id_keys.niveau` y est déclaré (`:12`) mais appliqué nulle part. `quiz_question_notions` et
`glossary_term_notions` sont **vides** : toutes les notions sont héritées de la catégorie.

**Comment le niveau d'un élève est résolu** [V] :

- **Le serveur ne résout jamais le niveau pour filtrer.** Il expose seulement le profil des
  groupes dans `/api/auth/me` (`routes/auth.js:378-379`, `lib/biodivPedagoLevel.js:195-230`).
- La résolution se fait **dans le navigateur** (`src/contexts/BiodivPedagoContext.jsx:73-103`
  → `resolveBiodivPedagoLevel`) : invité → collège ; professeur → université ; aperçu →
  valeur choisie ; sinon **socle = minimum(groupes, carte, défaut du site)**
  (`lib/biodivPedagoLevel.js:99-100`) ; enfin la préférence de l'élève, qui ne peut que baisser
  (`pedago_pref_can_raise = false` en base).
- **Il n'y a pas de priorité « séance »** : une séance n'injecte que `notionNiveau`, `notionId`
  ou `questionCode` dans le quiz (`src/App.jsx:1090-1099`).
- **Défaut vérifié** (exécution de la fonction) : `resolveBiodivPedagoLevel({ siteDefault:
'college', groupLevels: ['lycee'] })` renvoie `'college'`, et
  `curriculumNiveauxForPedagoLevel('college', ['seconde'])` renvoie `['cycle3', 'cycle4']`.
  **Une classe de seconde est traitée en collège.** La documentation de référence se contredit :
  elle décrit ce minimum (`docs/reference/foretmap/niveaux-pedagogiques-biodiversite.md:107-109`)
  puis conseille de « relever le niveau sur la carte ou le groupe » (`:114-115`), ce qui est
  impossible. **La PR #546** (brouillon) corrige ce point : le défaut du site ne sert plus que
  s'il n'existe aucun niveau explicite.
- Avec les données actuelles, **100 % des élèves se résolvent en « collège, cycles 3 et 4 »** :
  aucun élève de cycle 3 n'est distinguable tant que `curriculum_niveau` reste vide.

**Comment quiz, glossaire et verrouillage sont filtrés** [V] :

- **Quiz** (`GET /api/quiz/draw`, route **publique**, `routes/quiz.js:225-290`) : le serveur
  applique ce que le client envoie. Côté client, `niveau='college'` par défaut si toutes les
  notions visibles sont du collège (`QuizView.jsx:54-57`), calculé une seule fois au montage
  (`:88`) ; le menu propose toujours « Lycée » et « Tous niveaux » (`:33-37`) ; hors séance,
  `notionNiveau` est vide et **le resserrement à la classe n'agit pas sur le tirage libre**
  (`src/utils/curriculumNotions.js:71-73`). Le filtre par notion porte une **garde de palier**
  depuis #547 : une question de lycée n'hérite plus des notions c3/c4
  (`lib/curriculumNotions.js:148-191`).
- **Glossaire** : aucun défaut lié au niveau (`GlossaryView.jsx:38,42`).
- **Verrouillage** : **aucun filtre de niveau** (`loadApprovedGatingLinks`,
  `lib/learningGatingAcknowledge.js:106-113`) — constat C6 de `docs/AUDIT_GATING_2026-08.md`
  toujours ouvert.

**Mesures** (logique réelle reproduite en SQL sur audit) :

| Scénario                                                             | Questions servies | dont lycée                               |
| -------------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| défaut du quiz pour un élève collège (`niveau=college`, sans notion) | 436               | 0                                        |
| l'élève choisit « Tous niveaux » (1 clic)                            | 650               | **214**                                  |
| `notionNiveau=cycle3`, code actuel                                   | 221               | 0                                        |
| `notionNiveau=cycle3`, logique d'avant #547                          | 292               | **71**                                   |
| séance « lycée » ouverte par un élève en affichage collège           | 389               | **0**                                    |
| questions sans aucune notion effective (`glossaire_definitions`)     | 47                | 0                                        |
| questions « collège » ne portant que des notions de lycée            | 60                | —                                        |
| glossaire par défaut                                                 | 324 termes        | 63 « avancé », 108 « approfondissement » |

Les 47 questions `glossaire_definitions` ne sortent jamais sous un filtre de notion (donc dans
aucune séance), sortent dans le quiz libre, sont exclues dès qu'une difficulté est choisie
(`difficulte` NULL), **et verrouillent 47 termes de glossaire et 2 tutoriels**.

**Ce qui casse ou cassera** :

| Constat                                                                                                                                                                                                        | Risque        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Renseigner `curriculum_niveau='seconde'` ou `pedago_level='lycee'` sur une classe ne relève rien (corrigé par #546 si fusionnée) ; les lots qui rempliraient les niveaux échoueraient en silence pour le lycée | **élevé**     |
| Le verrouillage ignore le niveau : **84 fiches et 67 termes** (dont 14 de profondeur « base ») ne sont gardés que par des questions de lycée                                                                   | **élevé**     |
| Le niveau n'est imposé que côté client, sur une route publique ; glossaire sans défaut                                                                                                                         | moyen à élevé |
| Rattachements incohérents (47 sans notion, 60 « collège » à notions de lycée, 122 sans difficulté, menu 4-5 vide)                                                                                              | moyen         |
| `notionNiveau` de séance non validé ; défaut `cycle4` dans `SessionsView.jsx:450`, `college` dans `lib/pedagoSessions.js:385`                                                                                  | faible        |

#### 1.3.2 Verrouillage des fiches (gating)

**Ce qui est verrouillé** : jamais le contenu de la fiche. Le quiz conditionne l'accusé
« Marquer comme observé » (`POST /api/plants/:id/acknowledge-discovery`,
`routes/plants.js:234-270`), la première fois seulement. La table utilisée est
**`resource_question_links`** (`approved`, `is_gating=1`, question `actif`).

**Filtre `statut = 'actif'`** — en base, 650/650 questions sont `actif`. Toutes les lectures de
`quiz_questions` ont été passées en revue [V] :

| Lecture                                                                                                                                                                                                                                                                               | Filtre `actif`                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| quiz élève (`routes/quiz.js:81,200-202,237,309`), liens bloquants (`learningGatingAcknowledge.js:78-80`), comptes par notion (`curriculumNotions.js:285`), fiche glossaire, fiche plante, tutoriel (`glossary.js:161`, `plants.js:563`, `tutorials.js:1017`, `learning-links.js:638`) | ✔                                                                          |
| **écran de couverture `GET /api/learning-links/resources` → `gating_count`** (`routes/learning-links.js:471-474`)                                                                                                                                                                     | **✘ surestimera le blocage après le lot B**                                |
| **reprise éditoriale** (`routes/learning-links.js:566-568`)                                                                                                                                                                                                                           | **✘ recrée des liens vers des questions inactives**                        |
| `questionExists` (`routes/learning-links.js:45`), `fmQuizCrud.js:96,142`, `curriculum.js:245`                                                                                                                                                                                         | ✘ (accepte un lien vers une question inactive — volet A5 encore ouvert)    |
| **`scripts/generate-linked-questions.js:262-265, 297-303`**                                                                                                                                                                                                                           | **✘ une fiche qui n'a plus que des liens inactifs est jugée « couverte »** |
| stats admin `glossaryLinks` (`routes/quiz.js:714`), `lib/quizQuestionStats.js:52-73`, lock-mode et cooldown                                                                                                                                                                           | ✘ (sans effet élève)                                                       |

**`default_required_correct = 3`** : défini dans `lib/shared/gatingSettingsCore.js:74-81`
(défaut du code : 1 ; **3** stocké dans `app_settings`). **Il est bien plafonné** au nombre de
questions éligibles (`Math.min`, `learningGatingAcknowledge.js:263-270`,
`resourceQuestionGatingCore.js:251-257`). Mais la cascade ressource > type > site fait que
**le seuil de 3 ne s'applique aujourd'hui à aucune ressource** : les préréglages de type sont
`plant/*` et `glossary/*` en mode `any` (1 bonne réponse), `tutorial/*` en seuil 2.

**Aucune question éligible** [V] : le serveur renvoie `notRequired` (`satisfied: true`,
`learningGatingAcknowledge.js:356-359`) et le front passe à la confirmation
(`LearningAcknowledgeButton.jsx:165-170`) : **la fiche s'ouvre**. Distribution des fiches par
nombre de questions bloquantes éligibles : 0 → 169, 1 → 172, 2 → 126, ≥ 3 → 67. **125
questions sont la seule gardienne d'au moins une fiche** (172 fiches), jusqu'à 9 fiches pour
une même question.

**Risques** : lot B → toute fiche qui passe à 0 devient validable librement (échec ouvert,
conforme au comportement testé pour les tutoriels) ; une bonne réponse sur une question
désactivée cesse de compter (régression de progression) ; une réimportation où `statut` est
vide **réactive** les questions (`lib/fmQuizImport.js:258` : `|| 'actif'`, `:378` :
`statut = VALUES(statut)`). Tests existants : bonne couverture des mécanismes
(`learning-gating-*.test.js`, `curriculum-notions.test.js`, `QuizLevelScales.test.jsx`), mais
**rien** sur le niveau final d'une classe de lycée, sur l'absence de garde serveur, sur le
gating face au niveau, ni sur une fiche plante qui tombe à 0.

#### 1.3.3 Liens question ↔ ressource stockés trois fois

| Table                           | Lignes (audit) | Structure                                                                                                                                                                                |
| ------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resource_question_links` (RQL) | 1 580          | polymorphe : `resource_type` (glossary 628, plant 702, tutorial 250) + `resource_ref` varchar **sans FK** ; FK sur `question_code` seulement ; `is_gating`, `origin`, `status`, `weight` |
| `quiz_question_species` (qqs)   | 709            | `(question_code, plant_id)`, FK CASCADE                                                                                                                                                  |
| `quiz_question_tutorials` (qqt) | 250            | `(question_code, tutorial_id)`, FK CASCADE                                                                                                                                               |

- **Orphelins RQL : 0** sur les trois types [V]. **Écarts** : 0 lien RQL absent de qqs, **7 liens
  qqs absents de RQL** (questions créées les 14-15/09, rattachées à une autre espèce dans RQL) ;
  aucun code du dépôt n'écrit ces lignes (SQL manuel en prod, [H]). Tutoriels : 0 écart.
- **Quelle table fait foi ?** Le **verrouillage lit RQL** (`learningGatingAcknowledge.js:106-113`),
  comme les stats, le glossaire et l'administration des liens ; **la fiche plante lit qqs**
  (`routes/plants.js:549-570` ← `PlantSummaryBlocks.jsx:218`) ; `GET /api/tutorials/:id/quiz-questions`
  lit qqt (`routes/tutorials.js:1003-1024`) mais **n'a aucun consommateur front**. **Aucune
  synchronisation** : ni double écriture, ni trigger, ni transaction commune ; seule la
  migration 144 a fait une copie unique (« convergence des lectures prévue dans un lot
  ultérieur », `144:59-60`). Aucun code applicatif n'écrit qqs ni qqt.

**Ce qui casse** :

1. **L'import QCM et l'édition d'une question détruisent les liens glossaire relus à la main
   (risque élevé)** [V]. L'import vide globalement `resource_type='glossary' AND origin='import'`
   (`lib/fmQuizImport.js:420-423`) puis réinsère des correspondances par mots-clés en
   `is_gating=0` ; l'édition fait de même question par question (`lib/fmQuizCrud.js:76-86`),
   **hors transaction** (`lib/shared/questionCrudCore.js:185-186`). Or la migration 227 a inséré
   la curation manuelle **sous `origin='import'`** (`227:502-503`) puis l'a rendue bloquante
   (`227:586-589`) : **289 liens, tous bloquants**, seraient effacés sans message.
2. **La fiche plante et le verrouillage divergent (moyen)** : un lien créé dans l'écran des liens
   n'apparaît jamais sur la fiche ; 7 questions affichées sur une fiche ne comptent pas pour son
   verrouillage.
3. **`origin` surchargé et deux règles contraires sur `is_gating`** (moyen) : la migration 194
   et `sanitizeLinkInput` posent qu'un lien n'est bloquant que sur décision humaine ; la 227 a
   rendu bloquant tout le catalogue approuvé (100 %, y compris 52 liens `auto`).
4. **Aucun contrôle d'existence de la ressource** à l'écriture d'un lien (faible à moyen).

#### 1.3.4 Présence des espèces sur trois canaux

| Carte     | Registre `map_species` | Localisées (zones ∪ repères) | **Localisées hors registre** | Registre sans lieu | Union des 3 canaux |
| --------- | ---------------------- | ---------------------------- | ---------------------------- | ------------------ | ------------------ |
| foret     | 27                     | 61                           | **48**                       | 14                 | 75                 |
| n3        | 24                     | 54                           | **37**                       | 7                  | 61                 |
| lyautey   | 30                     | 4                            | **4**                        | 30                 | 34                 |
| melah     | 58                     | 46                           | 0                            | 12                 | 58                 |
| dayat     | 249                    | 249                          | 0                            | 0                  | 249                |
| sablettes | 64                     | 64                           | 0                            | 0                  | 64                 |

**Quatre définitions de « présente sur ce site »** [V] : l'activité clades lit le registre seul
(`routes/clades.js:93`, 27 espèces pour la forêt) ; la visite publique lit zones + repères
(`routes/visit.js:347-356`, 61) ; le réseau trophique lit l'union des trois
(`lib/speciesJunction.js:268-282`, 75) ; le filtre élève du catalogue fait l'union côté client
avec en plus les noms legacy `current_plant`/`plant_name` (`src/utils/plantFilters.js:27-104`).
Il n'existe **aucune vue unifiée** côté serveur ; `loadMapSpeciesMap`
(`speciesJunction.js:285`) est exporté sans appelant.

**Le registre est effacé à chaque sauvegarde d'une fiche (risque élevé)** [V] :
`syncPlantMaps` (`lib/speciesJunction.js:362-397`) fait `DELETE FROM map_species WHERE
plant_id = ?` (l. 385) puis réinsère `(map_id, plant_id, site_notes)` (l. 388). Seul
`site_notes` survit ; `presence_status`, `months_present`, `detection_mode`, `frequency`,
`first_record_*` repassent à NULL et `validation_status` à `attendu`. La fonction est appelée
dès que le corps de `PUT /api/plants/:id` contient `map_ids` (`routes/plants.js:815-816`), et
le formulaire l'envoie **toujours**, y compris pendant l'enregistrement automatique
(`src/utils/plantFormValues.js:102,117`, `src/components/foretmap-views.jsx:149-151`). **373
espèces** portent aujourd'hui des données de registre. `tests/plants-map-species.test.js` ne
couvre pas ce cas. Ces colonnes, ajoutées à la main en prod puis rattrapées par la migration
253, ne sont **ni affichées ni éditables**.

**Restes legacy** : `zones.current_plant` (vide, encore écrit et lu en repli),
`map_markers.plant_name` (3/95), `zones.stage` (écrit seulement), `zone_history` (1 ligne, plus
jamais écrite, encore affichée) — détail en § 1.2.3, plan de retrait en § 3.5.

#### 1.3.5 Observations dispersées

| Table                                             | Lignes (audit)                      | Lieu                       | Espèce             | Photo              | Validation                   |
| ------------------------------------------------- | ----------------------------------- | -------------------------- | ------------------ | ------------------ | ---------------------------- |
| `observation_logs`                                | 1                                   | `zone_id` (0/1)            | non                | `image_path` (0/1) | non                          |
| `user_journal_articles` (carnet)                  | 2                                   | `zone_id` (0/2)            | dans le texte      | fichiers           | non                          |
| `user_plant_observation_events`                   | 38                                  | **non**                    | `plant_id`         | **non**            | **non**                      |
| `tracked_individuals` + `individual_measurements` | 0 / 0                               | carte + zone/repère        | oui                | non                | non (`observer_user_id`)     |
| `task_logs`                                       | 6                                   | via la tâche               | via `task_species` | `image_path`       | tâche `validated`            |
| `species_interactions.evidence_level`             | 327 `bibliographie`, 0 `source_ref` | **aucune colonne de site** | —                  | —                  | —                            |
| `map_species.validation_status`                   | 0 `confirme_site`                   | carte                      | oui                | —                  | **jamais écrit par le code** |

- `observation_logs` : écrit par `POST /api/observations` (`routes/observations.js:111-177`),
  mais le composant qui l'utilisait (`ObservationNotebook`, `foretmap-views.jsx:377-600`) **n'est
  plus monté** : l'onglet `notebook` charge le carnet (`src/App.jsx:49-51`).
  `ObservationCard.jsx`, `ObservationNotebookStatus.jsx`, `ObservationPhotoField.jsx` sont du
  **code front mort**.
- `user_plant_observation_events` est un **acquis d'apprentissage** (« J'ai découvert »,
  `routes/plants.js:234-305`, après contrôle du verrouillage), pas une observation écologique.
- **Il n'existe aucun chemin** entre une observation validée et le registre ou le réseau
  trophique [V] : aucun code n'écrit `validation_status`, `first_record_at`, `first_record_by` ;
  `observe_site` n'est qu'une étiquette saisie à la main (`FoodWebView.jsx:482,637`) ; la
  validation d'une tâche ne touche ni `map_species` ni `species_interactions`. Côté écologie,
  « bibliographie » sans source signifie « non renseigné », pas « documenté ».
- Photos : sous `uploads/` (chemin relatif en base), famille `observations/` privée.

#### 1.3.6 Table `plants` (64 colonnes)

**Remplissage par thème** (audit, 534 fiches) : identité (`scientific_name` 99 %,
`second_name` 28 %) ; taxonomie (13 colonnes, 92 à 99 % sauf `gbif_key` 42 %) ; photos
(`photo` 42 %, secondaires 2 à 32 %) ; écologie (21 colonnes, de 1 % pour `iucn_status` à 100 %
pour `habitat_type`) ; dangers (`toxicity_level` 20 %, `health_risk` 3 %) ; détermination
(`identification_criteria` 0 %, `lookalike_species` 1 fiche, `identification_period` 0 %) ;
remarques (61 %, 24 %, 17 %).

- **Taxonomie en double.** `taxon_group` ↔ `clade_id` : **0 incohérence aujourd'hui** (la
  migration 274 a dérivé l'un de l'autre), mais le formulaire édite les deux séparément
  (`PlantEditForm.jsx:644,664`) sans synchronisation. Aggravant (lecture de code, [H] non
  rejouée) : le préremplissage GBIF propose l'**ordre** latin comme grand groupe et la
  **famille** comme genre (`lib/speciesAutofill.js:634-642`), recopiés dans `taxon_group` et
  `taxon_genus` par `lib/plantPayloadSync.js:81-84`. Les élèves ne voient que `taxon_group` : la
  classification emboîtée (`clade_id`) est **masquée au niveau collège**
  (`lib/biodivPedagoLevel.js:120-124`). `taxon_family` (français) et `taxon_family_latin` : **7
  couples désignent des taxons différents** (ex. Boraginacées / Heliotropiaceae, Vespidés /
  Eumenidae, Adoxacées / Viburnaceae) ; le latin n'est qu'affiché.
- **Photos** : 6 colonnes d'image, un seul couple crédit + licence. **117 valeurs secondaires**
  (106 URL, 46 fiches) sans attribution ; la galerie des photos secondaires n'affiche ni
  auteur, ni licence, ni lien (`PlantMetaSections.jsx:173-188`) ; le préremplissage récupère
  bien auteur et licence mais `applyPrefillToForm` **les jette** (`src/utils/plantPrefillApply.js:55`).
  ≈ 90 % des licences stockées sont CC BY ou BY-SA : l'attribution est obligatoire. **Risque
  juridique modéré à élevé** pour l'établissement éditeur.
- **Noms** : 144 alias pour 113 fiches ; 108 `second_name` absents des alias, 25 contiennent
  plusieurs noms. `plant_name_aliases` ne sert qu'à résoudre des noms legacy ; **la recherche du
  catalogue n'utilise ni l'un ni l'autre** (`plantFilters.js:156-171`) : un élève qui tape un nom
  vernaculaire secondaire ne trouve pas la fiche.
- **Textes libres** : 19 fiches parlent de confusion (« ressembl… », « distingue ») et 16 de
  danger dans leurs **remarques**, alors que `lookalike_species` n'est rempli qu'une fois.
- **Rôle trophique** : producteur 282, consommateur 219, décomposeur 24, NULL 9. **14 animaux
  détritivores** (annélides 3, crustacés 4, gastéropodes 2, insectes 2, oribates, collembole,
  myriapode) sont classés « décomposeur ». En écologue : le **détritivore** ingère et fragmente
  la matière organique morte (c'est un consommateur, et une proie) ; le **décomposeur** au sens
  strict (bactéries, champignons) la **minéralise** et rend les ions aux producteurs. Le cycle
  de la matière n'est compréhensible que si l'élève voit qui fragmente et qui minéralise. Deux
  autres cas à arbitrer par l'équipe de SVT : les nitrifiants (Nitrosomonas, Nitrobacter,
  Nitrospira) classés « décomposeur » alors qu'ils sont chimiolithoautotrophes ; Rhizobium et
  les mycorhizes à NULL. **Effet dans le code** : `computeTrophicLevels` ne donne aucun niveau
  aux décomposeurs (`foodWebGraphModel.js:491`), donc un prédateur dont les proies sont
  « décomposeurs » s'affiche comme consommateur primaire (Étourneau unicolore, Pseudoscorpion,
  Géophile) [V requête, rendu par lecture].
- **Dangers** : la voie légitime `POST /api/plants/:id/validate-hazard` (permission
  `plants.hazards.validate`) écrit drapeau, relecteur et date (`routes/plants.js:732-760`).
  **Contournement** [V] : `hazard_reviewed` fait partie de `PLANT_HAZARD_FIELDS`
  (`lib/plantsRouteHelpers.js:58-63`), donc de `PLANT_COLUMNS`, écrites par `POST`/`PUT
/api/plants` avec la seule permission `plants.manage` et par l'import (alias `danger_valide`) ;
  la case du formulaire n'est pas conditionnée à la permission (`PlantEditForm.jsx:411-417`).
  Résultat : `hazard_reviewed = 1` sans relecteur ni date — **c'est la cause des 145 fiches de
  la prod**. La migration 271 a aggravé le cas (date posée sans relecteur, `271:102`). Dans le
  fixture, un rôle personnalisé de rang élève détient `plants.manage`. `docs/API.md:1562` est
  inexact sur ce point. **Enjeu** : la mention « validé » rassure l'enseignant qui prépare une
  sortie. 42 fiches « toxique » ou « mortel » ne sont pas validées dans le fixture.

#### 1.3.7 Fonctionnalités peut-être inachevées

Toutes ces tables ont été créées après le fixture v259 : 0 ligne est attendu ici ; l'état en
prod n'est pas mesurable.

| Table(s)                                                    | Code                                                                                | Atteignable ?                                                                                                                                                                                               | Tests                                   | Dernier commit | Verdict                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------- | ----------------------------------------------- |
| `id_keys`, `id_key_couplets`, `id_key_leads` (mig. 275)     | `routes/id-keys.js` (449 l.), `lib/idKeys.js`, `IdKeysView.jsx`                     | routeur monté (`server.js:557`) ; onglet « Clés » **toujours affiché aux élèves** mais vide tant qu'aucune clé n'est publiée ; publication refusée si le graphe est incomplet (`routes/id-keys.js:251-255`) | `tests/id-keys.test.js` (4)             | 22-23/09       | actif, contenu inachevé                         |
| `id_key_runs`                                               | aucun                                                                               | —                                                                                                                                                                                                           | —                                       | —              | **la table n'existe pas** : aucun suivi d'usage |
| `tracked_individuals`, `individual_measurements` (mig. 276) | `routes/individuals.js` (340 l.), `lib/individualBiomass.js`, `IndividualsView.jsx` | routeur monté ; onglet **masqué au niveau collège** (`StudentBottomNav.jsx:182`) donc invisible pour tous les élèves aujourd'hui                                                                            | `tests/individuals.test.js` (4)         | 22-24/09       | récent, inatteignable côté élève                |
| `pedago_session_runs` (mig. 283)                            | `lib/pedagoSessionRuns.js`, `runs/start`, `runs/complete`                           | oui (onglet « Séances ») ; `runs/complete` est **déclaratif** (`pedagoSessionRuns.js:86`)                                                                                                                   | `tests/pedago-sessions*.test.js`        | 24/09          | actif, récent                                   |
| `user_rewards` (mig. 285)                                   | `lib/rewards.js`, `routes/rewards.js`                                               | oui, en fin de séance ; `session_three` et `session_lycee` **inatteignables** avec 2 séances publiées de niveau collège (`lib/rewards.js:56-63`)                                                            | `tests/pedago-sessions.test.js:136-153` | 24/09          | actif                                           |

#### 1.3.8 Divers

- **`tasks.*_level` en `varchar(32)`** : valeurs en base toutes conformes (danger : safe 30,
  potential_danger 14, dangerous 4, very_dangerous 2, NULL 44…), mais vocabulaire recopié à 7
  endroits (§ 1.2.6). L'import de tâches **force `danger_level` et `difficulty_level` à NULL**
  (`lib/tasks/taskImport.js:537-538`) : impossible d'importer une tâche dangereuse. Une tâche
  « safe » est liée à une espèce « toxique » : aucune règle ne relie les deux.
- **`datetime` et `datetime(3)`** : 101 colonnes à la seconde, 28 à la milliseconde ; 6 tables
  mélangent les deux. Le code dépend réellement de la milliseconde pour les tris
  `created_at DESC, id DESC` à identifiant UUID (`context_comments`, mig. 278 ; `forum_posts`,
  mig. 291), avec tests. **Reste instable** : la liste paginée des fils du forum trie par
  `last_post_at DESC, created_at DESC` sans départage par `id` (`routes/forum.js:193-194`).
  179 appels SQL utilisent `NOW()` (heure du serveur de base) alors que le JS écrit en UTC
  (`database.js:181`) : fuseau de la base prod inconnu ([H]).
- **`rbac_seeded_permissions` en `utf8mb4_general_ci`** : aucune jointure aujourd'hui (la
  comparaison se fait en JS, `lib/rbac.js:852-857`), mais toute jointure future avec
  `role_permissions` ou `permissions` lève `ERROR 1267 Illegal mix of collations` [V].
- **Zones « … (copie) »** : non mesurable (noms anonymisés). Origine : `duplicateZone`
  (`src/hooks/useMapCrudActions.js:126-155`) décale le contour de 2,5 %, recopie espèces et
  catégories, et **n'enlève pas** un « (copie) » existant (contrairement aux repères,
  `:168-170`) ; aucune unicité sur `(map_id, name)`. Effet élève : doublons presque superposés,
  inventaires par zone gonflés.

---

### 1.4 Qualité et risques

#### 1.4.1 Taille et duplication

**Seuils** : fichier > 800 lignes = gros, > 1 500 = très gros ; fonction ou composant > 150
lignes = long, > 400 = très long. Mesures sur 1 098 fichiers JS/JSX non-GL (213 296 lignes)
[V].

- **4 fichiers très gros, 36 gros** : `src/App.jsx` 2 276, `src/components/map-views.jsx`
  1 891, `routes/auth.js` 1 712, `routes/tasks.js` 1 558, `routes/visit/mascot.js` 1 437,
  `FoodWebGraph.jsx` 1 422, `routes/rbac.js` 1 379, `lib/speciesAutofill.js` 1 351,
  `visit-views.jsx` 1 289, `tasks-views.jsx` 1 220, `src/plan/AppPlan.jsx` 1 211,
  `settings-admin-views.jsx` 1 204, `database.js` 1 187… `src/index.css` fait **10 876
  lignes**.
- **201 fonctions dépassent 150 lignes, 44 dépassent 400** (AST sur 13 580 fonctions). Pires
  cas : `App` 2 106 lignes (`src/App.jsx:169`), `MapViewImpl` 1 693, `FoodWebGraph` 1 304,
  `VisitViewImpl` 1 174, `AppPlan` 1 137, `TasksViewImpl` 1 129, `VisitMascotPackManager` 1 099 ;
  côté serveur, `POST /api/students/import` 523 lignes (`routes/students.js:119`) et
  `PUT /api/tasks/:id` 460 lignes (`routes/tasks.js:939`).
- **Les composants racines ont regrossi depuis la refactorisation d'août** : `App.jsx` 1 466 →
  2 276 (+55 %), `map-views.jsx` 910 → 1 891 (+108 %), `groups-views.jsx` 613 → 1 153,
  `profiles-views.jsx` 705 → 1 011. Les états de séance pédagogique (`App.jsx:996-1283`) et
  l'ouverture ciblée des notifications (`:1394-1474`) y sont retombés.
- **Duplication** (jscpd, 50 tokens / 10 lignes, miroirs exclus) : **≈ 1,1 %** une fois retiré
  le double comptage des `.jsx` (136 clones, ≈ 2 290 lignes). Clones notables : modales
  `MarkerModal` ↔ `ZoneInfoModal` (222 lignes) ; handlers `routes/map.js` ↔ `routes/zones.js`
  (132 lignes, **toujours là** malgré le « traité » de l'audit du 13/09) ; `routes/visit/zones.js`
  ↔ `routes/visit/markers.js` (103) ; `QuizView` ↔ `GlossaryView` (109) ; trois multi-sélections
  recopiées (90) ; `lib/visitEditorialBlocks.js` ↔ `src/utils/visitEditorialBlocks.js` (32,
  **sans script de synchronisation**).

#### 1.4.2 Complexité

- **Cycles d'import** (madge) : **0 côté front** (775 modules) ; **19 côté serveur**
  (`effectiveRole ↔ rbac`, `settings → learningGatingLockMode → learningGatingRuntime →
settings`, `database.js → lib/glGroupBridge → …`), tous coupés par un `require` paresseux
  placé dans une fonction (`database.js:789,822,837`, `effectiveRole.js:169,263`,
  `rbac.js:649`, `settings.js:957`…). Remonter un de ces `require` en tête de fichier donnerait
  un export à moitié initialisé au démarrage.
- **Complexité cyclomatique** (ESLint `complexity`) : 315 fonctions au-dessus de 20. Top :
  `App` 247, `buildPlan` (`lib/moodle/plan.js:57`) 145, `TaskTileCardImpl` 135, `MapViewImpl`
  132, `MapViewToolbar` 128, `POST /api/students/import` 121, `PUT /api/tasks/:id` 114,
  `VisitViewImpl` 112, `SharedMapStage` 108, `PATCH /api/rbac/users/…` 102.
- **Code mort** : front ≈ 800 lignes réellement mortes (`VisitMarkersLayer`,
  `VisitMapMarkerButton`, `VisitZonesSvgLayer`, `VisitMapZoomControls`, `useMascotGpsFollow`,
  `profilesRolePrompts`, `emojiFontCoverage`) plus les 4 composants d'observation legacy
  (§ 1.3.5) ; 241 exports front jamais importés en production (borne haute) ; `termAutolink.walkAndLink`
  sans appelant ; vue `v_visit_coverage`. Serveur : 0 fichier mort.
- **`TODO`, `FIXME`, `XXX`, `HACK` : 0** (excellent) ; 17 `eslint-disable` (15 sur
  `exhaustive-deps`).

#### 1.4.3 Dépendances

`npm audit` sur une copie du lockfile, sans correction [V] :

| Périmètre          | Critical | High | Moderate | Total |
| ------------------ | -------- | ---- | -------- | ----- |
| toutes dépendances | 0        | 7    | 7        | 14    |
| production seule   | 0        | 0    | 2        | 2     |

- Production : `exceljs` via `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq) ; le correctif proposé par
  npm est une rétrogradation majeure, non pertinente.
- Développement : `xlsx` 0.18.5 (pollution de prototype, ReDoS, **sans correctif npm**), utilisé
  par 7 fichiers de test (dont 5 GL) ; transitifs correctibles (`brace-expansion`,
  `browserslist`, `fast-uri`, `hono`, `js-yaml`, `picomatch`).
- `npm outdated` : 14 paquets en retard de patch ou mineure, **aucun de version majeure**.
- **Dépendance de développement chargée en production** [V code, H prod] :
  `lib/tutorialViewSanitize.js:27` fait `require('isomorphic-dompurify')`, déclaré dans
  `devDependencies` (`package.json:227`) avec `dompurify` et `jsdom`. Or le cron installe
  `npm ci --omit=dev` (`auto-deploy-cron.sh:285`) et le bundle prune les dépendances de
  développement (`prepare-runtime-deploy.js:178`). **`GET /api/tutorials/:id/view` renvoie
  probablement une erreur 500 `MODULE_NOT_FOUND` en production**, sauf si le serveur a gardé
  ses dépendances de développement. Le `require` a été introduit le 01/09 (c02b1b2c) ; l'audit
  de juillet avait déplacé ce paquet en développement (`AUDIT_CODE_2026-07.md:483`).

#### 1.4.4 Sécurité

L'audit du 22/09 (`docs/AUDIT_SECURITE_2026-09-22.md`) a été relu ; ce qui suit vérifie l'état
actuel et le complète.

| ID     | Sévérité     | Statut / 22-09     | Constat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §12    | **critique** | confirmé ouvert    | Le dump de production (`sql/foretmap_bdd_complete.sql`, ajouté par `6b11e9fe` le 17/06, retiré de la tête par `7167ac0e` le 15/08) **reste lisible dans l'historique** : 4,3 Mo, 41 hachages bcrypt, 36 adresses e-mail. L'historique n'a pas été réécrit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| N1     | **élevée**   | nouveau            | **XSS stocké par un pack de mascotte** [V]. `sanitizeMascotPackAssetFilename` n'accepte que `[a-zA-Z0-9._-]` mais **n'impose aucune extension** (`lib/visitMascotPackHelpers.js:17-21`) ; `saveBase64ToDisk` écrit le contenu sans contrôle de type (`lib/uploads.js:65-75`). Un fichier `x.html` atterrit sous `uploads/visit_mascot_packs/<uuid>/`, famille publique, servie par `express.static` en `text/html` (seuls les `.svg` reçoivent CSP sandbox et `attachment`, `server.js:391-413`). Chemins : `POST /api/visit/mascot-packs/:id/assets` (`routes/visit/mascot.js:1077-1092`), renommage (`:1138`), bibliothèque de sprites (`:1306`), import ZIP (`:295`). La permission `visit.manage` est dans le profil `prof` par défaut (`lib/rbac.js:315`). Scénario : un compte prof dépose une page, un administrateur l'ouvre, le jeton de session part de `localStorage`. |
| N2     | moyenne      | confirmé ouvert    | La CSP **imposée** se limite à `img-src` (`lib/csp.js:59-60`) ; `script-src 'self'` n'existe qu'en mode rapport. Le jeton est en `localStorage` (`src/services/api.js:173`). La sanitisation est donc la seule barrière (elle est solide : `marked` + DOMPurify, liste blanche de balises et de protocoles, `src/shared/platform/markdown.js`). C'est ce qui rend N1 exploitable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| N3     | moyenne      | nouveau (écart S7) | La médiathèque (`lib/mediaLibrary.js:255,314`) et l'import ZIP de mascotte écrivent **sans retirer l'EXIF** ; le script de rattrapage ignore `media-library` (`scripts/strip-uploads-exif.js:34`) ; `sharp` est optionnel et son absence ne produit qu'un avertissement (`lib/imageMetadata.js:42-55`). Présence de `sharp` en prod à vérifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| N4     | moyenne      | nouveau            | L'adresse e-mail se modifie **sans le mot de passe actuel** (`routes/auth.js:452`, `routes/students.js:821`), sans avertir l'ancienne adresse ni incrémenter `token_epoch` : session volée → changement d'e-mail → « mot de passe oublié » → prise de compte durable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| N5     | moyenne      | nouveau ([H] prod) | `validateEnv` ne vérifie que la longueur : le texte d'exemple de `.env.example:71` passe tel quel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| N6     | moyenne      | nouveau            | Longueur minimale des mots de passe élèves : **4** par défaut (`lib/settings.js:622`), ce qui rend les hachages fuités (§12) cassables hors ligne.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| N7-N17 | faible       | nouveaux           | `POST /api/auth/me/password` hors limiteur ; `POST /api/usage` anonyme sans borne ; `POST /api/observations` autorisé à un porteur de permission de **lecture** (`routes/observations.js:20-23`) ; `DELETE /api/forum/posts/:id` sans contrôle de périmètre de groupe (`routes/forum.js:575-590`) ; `runs/complete` déclaratif donne les récompenses ; bombe ZIP possible (décompression avant contrôle de taille, utilisateurs privilégiés) ; ticket LTI rejouable 120 s ; socket.io reflète toute origine si `FRONTEND_ORIGINS` est absent ; `.env.production` non ignoré ; photos de zones et de repères lisibles sans authentification (`lib/entityPhotoRoutes.js:84-93`) ; inscription qui distingue « nom / pseudo / e-mail déjà utilisé ».                                                                                                                                 |

**Ce qui est sain** [V] :

- **RBAC** : **232 routes d'écriture** hors GL ; 157 protégées par une permission en
  middleware, 14 par une permission vérifiée dans le handler, 38 bornées à « soi » après
  authentification, 19 publiques par conception (connexion, inscription, LTI, réponse de quiz
  signée, calculs purs), 3 en 410, 1 par secret de déploiement. **Aucune route d'écriture
  anonyme par oubli.** Mais **aucun test d'inventaire** : `tests/security-surfaces.test.js` ne
  couvre que les GET.
- **Injection SQL** : pas de `multipleStatements`, `pool.execute` partout, 0 valeur utilisateur
  interpolée (§ 1.2.5).
- **XSS hors N1** : tous les `dangerouslySetInnerHTML` passent par `renderMarkdownToSafeHtml` /
  `sanitizeRichHtml` ; `tutorials.html_content` est assaini **à la lecture** côté serveur
  (`lib/tutorialViewSanitize.js`) et l'aperçu est dans un iframe sans scripts ; `/tutos/*.html`
  redirige vers la vue assainie. Réserve faible : l'attribut `style` est conservé sur une
  classe de figure.
- **Téléversements** : `assertInsideUploads` contre la traversée, octets magiques pour forum,
  commentaires, tâches et carnet ; ZIP sans zip slip.
- **JWT** : HS256 épinglé, 90 min glissantes plafonnées à 12 h, **relecture en base à chaque
  requête** (`is_active`, `token_epoch`, permissions), `401 deleted:true` pour un compte
  supprimé, isolement produit vérifié. `jose` ne sert qu'au LTI (usage justifié).
- **Secrets** : aucun secret réel dans l'arbre de travail ; fixture anonymisé (un seul hachage
  distinct, adresses `@exemple.invalid`). Le scan de l'historique ne couvre que les commits
  depuis le 01/06 (clone partiel).

#### 1.4.5 Performance

- **N+1** : 97 boucles contenant un `await` SQL dans 45 fichiers, **aucune sur une route GET
  d'écran élève** [V]. Les plus lourdes sont des imports et des traitements d'administration
  (`POST /api/students/import`, `POST /api/plants/import`, `POST /api/visit/rebuild-from-map`,
  copie de projet, tâches récurrentes).
- **Index** : `EXPLAIN` sur 20 requêtes d'écrans élèves → **aucun index manquant** à la
  volumétrie actuelle ; les `ALL` sont des choix de l'optimiseur sur des tables de 50 à 660
  lignes. Seul défaut structurel : les stats élève
  `ta.student_id = ? OR (first_name = ? AND last_name = ?)` (`routes/stats.js:193-199`) ne
  peuvent pas utiliser d'index et balaient `task_assignments`, qui grossit chaque année.
- **Chargements complets** : `GET /api/plants` renvoie les 534 fiches × 64 colonnes
  (`SELECT *`) ; mesuré le 17/09 à 912 Ko bruts, 126 Ko compressés, avec cache serveur
  (arbitrage déjà fait).
- **Polling** : différentiel via `GET /api/sync-state`, 60 s (plancher de 90 s avec Socket.IO,
  120 s en arrière-plan, suspendu si l'onglet est masqué) : ≈ 1 requête par minute et par élève
  [V]. Chargement initial de l'app élève : **≈ 12 appels API**, dont `/api/auth/me` **deux fois**
  [H, à confirmer par un enregistrement HAR].

#### 1.4.6 Robustesse et terrain

- **Erreurs** : Express 5 propage les rejets ; `asyncHandler` enveloppe 352 des 402 routes
  (exceptions : les 26 endpoints de `routes/visit/mascot.js`, `/google/callback`) ;
  gestionnaire global qui masque les 5xx (`server.js:647`) ; 0 `console.*` côté serveur ;
  45 `catch` vides côté serveur dont 44 commentés ; 61 côté front, dont 9 sans commentaire.
- **Journalisation** : Pino avec `redact` (`authorization`, `cookie`, `*.password`,
  `*.token`, `*.secret`), mais pas `newPassword`, `currentPassword`, `authToken` ; aucun log de
  `req.body` trouvé (risque théorique).
- **Hors ligne sur le terrain** [V] : le service worker sert zones, fiches, repères et tâches en
  _network-first_ **sans délai** (`src/shared/pwa/swTemplate.js:129-133`) et la visite en
  _stale-while-revalidate_ ; les écritures ne sont jamais mises en file. **Aucune écriture
  élève ne survit à une coupure réseau** : tâche validée, espèce observée et article de carnet
  sont perdus ; seul le brouillon de commentaire reste en `sessionStorage`. Les mutations sont
  rejouées **sans clé d'idempotence** : `POST /api/plants/:id/observe` insère un événement à
  chaque appel (`routes/plants.js:276`), donc une réponse perdue compte l'observation deux fois.
  Le message d'erreur réseau fait 37 mots et parle de « passerelle réseau » et
  d'« administrateur de la plateforme » (`src/services/api.js:302-306`). Le cache du service
  worker contient des réponses d'API authentifiées sans purge à la déconnexion (tablette
  partagée, [H]). `public/offline.html` écrit la marque en dur.

#### 1.4.7 Accessibilité et lisibilité pour des élèves de 11 ans

- **Cibles tactiles** [V statique] : la règle `pointer:coarse` à 44 px (`src/index.css:2626-2633`)
  est **écrasée** dans la barre d'outils de la carte, écran principal de l'élève sur le terrain
  (`min-height: 30px` de spécificité supérieure, `:2787-2792`, et `!important`, `:2807-2820`) ;
  `.map-toolbar-pill` 36 px, bouton « ? » 36 px, puces Quiz/Glossaire/fiche 36 px
  (`.pedago-chip-btn`, `:9372`), puces du réseau trophique 32 px. `tests/tap-target-guard.test.js`
  ne contrôle que les agrandissements `::after`.
- **Contrastes** (calcul WCAG) : thème principal AAA (`--forest` / `--cream` 10,0) ; **quatre
  paires sous 3:1** : `--sage` / blanc 2,47 (libellés de filtre en 11 px), blanc / `--sage`
  (bouton secondaire actif) 2,47, `--ink-faint` / crème 2,93 (**nom scientifique des fiches**),
  `--alert` / crème 2,94 (**message d'erreur de connexion**).
- **Polices** : `--text-xs` descend à 10,9 px (211 usages, dont les libellés de la barre de
  navigation élève) ; la barre élève compte jusqu'à 17 onglets.
- **Formulaires** : `label-has-associated-control` est désactivée ; réactivée en mode souple,
  elle trouve **149 champs sans libellé associé** dans 27 fichiers (146 le 16/09 : le lot B de
  l'audit UI reste ouvert).
- **Lisibilité** (indice de Kandel-Moles approximatif) : aide 89 (facile), quiz collège 79,
  glossaire 77, descriptions de fiches 79 ; **`plants.ecosystem_role` 49 (difficile)**, affiché
  sur les vignettes de visite ; textes de visite longs (**23-24 % des phrases dépassent 20
  mots**). Registre incohérent : tutoiement en visite, vouvoiement dans les erreurs.

#### 1.4.8 Règle des textes visiteurs

Une vérification automatique a été conçue et exécutée [V] : extraction AST des chaînes de 88
fichiers de code (visite, plan, mascottes, fiche espèce ouverte en visite, aide) et lecture des
contenus de `foretmap_audit` (`visit_zones`, `visit_markers`, `visit_media`, packs de mascotte
publiés, 15 colonnes de `plants` affichées en visite, `map_species.site_notes`, tutoriels de
visite, glossaire, plan public). Motifs : impératifs et infinitifs d'incitation (cueillir,
goûter, manger, toucher, ramasser, arracher, croquer, froisser, écraser, prélever…), tournures
modales (« tu peux », « essaie de », « il faut »), « à goûter », « se mange », manipulations
implicites (« quand on les froisse »). Exceptions : négations, gestes d'écran (« touche une
zone pour ouvrir… »), troisième personne.

**34 correspondances** : 6 gestes d'écran, 5 négations, 10 faux positifs à la relecture, et :

- **1 incitation directe** : zone de visite `zone-0d6…`, « À observer : **prélevez une carotte
  de sol** à la tarière et décrivez-la ».
- **5 manipulations décrites**, dont deux **à réécrire en priorité** : le **laurier-sauce**
  (`plants.hazard_notes`), dont le « test » proposé pour ne pas le confondre avec le
  **laurier-rose, mortel**, consiste à froisser la feuille ; le **faux-poivrier**
  (`plants.remark_2`) « très aromatique quand on le froisse », alors que la même fiche signale
  une dermite de contact.
- **6 informations de consommation** en zone grise : le libellé de code « **Partie à
  récolter** » (`src/constants/plantMetaSections.js:65`, affiché en visite pour 70 fiches), le
  badge « Comestible 🍴 » (`PlantSummaryBlocks.jsx:105-106`, 69 fiches), « les pétales se
  mangent… cuits à la vapeur », « fruits se mangent blets »…
- Rien à signaler dans les dialogues des 4 packs de mascotte publiés, l'aide, ni le code du
  plan.
- **Seule garde existante** : `MANIPULATION_HINT_RE` pour les clés d'identification
  (`lib/idKeys.js:10-11`). Rien ne contrôle les contenus de visite à l'écriture.

**Test proposé** : un module `lib/visitorTextGuard.js` (motifs et exceptions ci-dessus, qui
absorbe `MANIPULATION_HINT_RE`) ; un test de contenu `tests/content/visitor-texts.test.js` (job
`contenu`) qui échoue sur toute incitation et gère la zone grise par une liste d'exceptions
nominative versionnée ; un test statique sur les fichiers de visite ; un avertissement non
bloquant à l'écriture de `PUT /api/visit/zones|markers` et un script `npm run
audit:visitor-texts` pour la base de production.

---

### 1.5 Préparation du code aux lots B, C, D, E, G

Le document `claude_code_lots_BCDEG.md` n'étant pas disponible, **seul le lot B peut être
évalué**, à partir de sa description dans le prompt (72 questions passées en `inactif`).

| Condition pour recevoir le lot B                                 | État [V]                                                                                           | Correctif                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Le quiz élève ignore les questions inactives                     | ✔ partout (`routes/quiz.js:81,237,309`)                                                            | —                                                 |
| Le verrouillage ignore les questions inactives                   | ✔ (`learningGatingAcknowledge.js:78-80`)                                                           | —                                                 |
| Une fiche qui perd toutes ses questions s'ouvre                  | ✔ (échec ouvert, `:356-359`) — **jusqu'à 172 fiches** gardées par une seule question sont exposées | décider si c'est voulu (question n° 3)            |
| L'écran de couverture des liens reste juste                      | ✘ `gating_count` compte les inactives (`routes/learning-links.js:471-474`)                         | ajouter le filtre                                 |
| La reprise éditoriale ne recrée pas de liens inactifs            | ✘ (`routes/learning-links.js:566-568`)                                                             | ajouter le filtre                                 |
| Le générateur de questions voit les fiches découvertes           | ✘ (`scripts/generate-linked-questions.js:262-265,297-303`)                                         | ajouter le filtre                                 |
| Un nouveau lien vers une question inactive est refusé ou signalé | ✘ (`questionExists`, `routes/learning-links.js:45`)                                                | refuser ou avertir                                |
| Un réimport QCM ne réactive pas les 72 questions                 | ✘ `statut` vide → `actif` (`lib/fmQuizImport.js:258,378`)                                          | ne pas écraser un `inactif` sans valeur explicite |
| Une faute de frappe sur `statut` est refusée                     | ✘ `varchar(32)` libre                                                                              | contrainte `CHECK` ou ENUM (migration 293+)       |
| Les bonnes réponses déjà données sur ces questions               | cessent de compter (régression de progression)                                                     | règle à décider (question n° 9)                   |

**Pour la migration 292 et les lots C à G** : les contraintes d'écriture du § 1.1.5 s'appliquent
(collation explicite, noms de FK divergents en prod, `UPDATE` gardés, pas de transaction). Si
les lots **remplissent des niveaux** (`groups.curriculum_niveau`, `pedago_level`…), ils
**n'auront aucun effet visible pour le lycée** tant que le résolveur prend le minimum avec le
défaut du site (PR #546). S'ils **modifient `map_species`**, leurs données seront **effacées à
la première sauvegarde** de la fiche concernée (§ 1.3.4). S'ils **ajoutent des liens glossaire
sous `origin='import'`**, le prochain import QCM les supprimera (§ 1.3.3). S'ils touchent
`plants.trophic_role` ou `hazard_reviewed`, voir § 1.3.6.

---

## Partie 2 — Pistes

Quatre pistes réellement différentes, précédées d'un socle d'urgences à traiter quelle que soit
la piste retenue. Les efforts sont des **estimations** (une personne, en jours ouvrés, tests et
documentation compris) ; les numéros de migration partent de **292, réservé au contenu des lots
B à G** tel que spécifié dans `claude_code_lots_BCDEG.md`. Au moment de l'audit, la seule PR
ouverte (#546) n'ajoute pas de migration.
**Les numéros ci-dessous sont indicatifs** : ils doivent être attribués dans l'ordre réel
d'application, car le runner saute définitivement tout fichier de numéro inférieur à la
version courante (§ 1.1.5).

### 2.0 Socle P0 — urgences indépendantes de la piste (≈ 4 jours)

Ce sont des corrections de défauts, pas des évolutions de comportement métier. Chacune est
livrable seule, avec son test. Plusieurs demandent une **vérification préalable en production,
en lecture seule**.

| #    | Urgence                                                                                 | Correctif proposé                                                                                                                                                            | Taille | Migration                                    |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| P0-1 | `isomorphic-dompurify` absent en production (vue des tutoriels en 500, [H] forte)       | vérifier `GET /api/tutorials/:id/view` en prod ; déplacer le paquet dans `dependencies` ; test CI « aucun `require` de dépendance de développement par du code d'exécution » | S      | —                                            |
| P0-2 | XSS stocké par pack de mascotte (N1)                                                    | liste blanche d'extensions image et contrôle des octets magiques sur les 4 chemins ; `Content-Disposition: attachment` pour tout ce qui n'est pas une image sous `/uploads`  | S      | —                                            |
| P0-3 | Registre `map_species` effacé à chaque sauvegarde                                       | synchronisation différentielle dans `syncPlantMaps` (supprimer seulement les cartes retirées, insérer seulement les nouvelles) ; test de caractérisation d'abord             | S      | —                                            |
| P0-4 | 289 liens glossaire relus détruits par le prochain import QCM                           | donner une origine propre aux correspondances automatiques et ne purger qu'elle ; transaction autour de l'upsert de question                                                 | S      | 293 (requalification des origines)           |
| P0-5 | « Danger relu et validé » sans la permission dédiée                                     | retirer `hazard_reviewed` de `PLANT_COLUMNS`, de l'alias d'import et de la case du formulaire ; test 403                                                                     | S      | décision sur les 145 fiches (question n° 13) |
| P0-6 | Vue `v_zone_inventory` absente de la chaîne « comme la prod » ([H] forte)               | vérifier en prod (`SHOW FULL TABLES WHERE Table_type = 'VIEW'`) ; si absente, `DROP VIEW IF EXISTS` + `CREATE SQL SECURITY INVOKER VIEW`                                     | S      | 294                                          |
| P0-7 | Trois textes visiteurs non conformes (laurier-sauce, faux-poivrier, prélèvement de sol) | réécriture éditoriale ; libellé « Partie à récolter » et badge « Comestible » à trancher (question n° 8)                                                                     | S      | 295 si le contenu vient d'une migration      |
| P0-8 | Dump de production dans l'historique Git (§ 12 du 22/09)                                | **décision d'Oliv** : réécriture de l'historique et réinitialisation des mots de passe ; longueur minimale à relever                                                         | —      | —                                            |

### 2.1 Piste A — Stabiliser : le bon contenu pour chaque élève

**Objectif.** Qu'un élève de 6e voie des questions, des termes et des verrous à son niveau ;
qu'un professeur puisse régler le niveau d'une classe et que ce réglage produise un effet ; que
les lots B à G s'appliquent sans effet de bord.

**Gains.** Élèves : plus de questions de lycée dans le quiz libre ni de fiches verrouillées par
une question de lycée (84 fiches, 67 termes aujourd'hui) ; glossaire à leur profondeur.
Enseignants : niveau de classe effectif, séance « lycée » qui sert du lycée, écran de
couverture juste après le lot B.

**Périmètre.** `lib/biodivPedagoLevel.js` (+ miroir), `src/contexts/BiodivPedagoContext.jsx`,
`routes/auth.js` (`/me`), `routes/quiz.js`, `routes/glossary.js`, `lib/curriculumNotions.js`,
`lib/learningGatingAcknowledge.js`, `lib/shared/resourceQuestionGatingCore.js`,
`routes/learning-links.js`, `lib/fmQuizImport.js`, `scripts/generate-linked-questions.js`,
`QuizView.jsx`, `GlossaryView.jsx`, `SessionsView.jsx` ; tables `quiz_questions`,
`glossary_terms`, `groups`, `pedago_sessions`, `resource_question_links` (lecture) ;
documentation `docs/reference/foretmap/niveaux-pedagogiques-biodiversite.md` et `docs/API.md`.

**Étapes** (chacune livrable seule) :

| Étape | Contenu                                                                                                                                                                                                                                            | Taille |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A0    | Tests de caractérisation (liste en § 3.3) : niveau final d'une classe de seconde, paramètres envoyés à `/draw`, glossaire par défaut, fiche gardée par une seule question de lycée, fiche qui passe à 0, seuil plafonné, `gating_count`            | 1,5 j  |
| A1    | Revue et fusion de la PR #546 (défaut du site = repli, pas plafond), avec mise à jour du doc de référence                                                                                                                                          | 0,5 j  |
| A2    | Préparation du lot B (§ 1.5) : filtres `statut` manquants, import qui ne réactive pas, lien vers question inactive refusé                                                                                                                          | 1,5 j  |
| A3    | Migration **292** (lots B à G, telle que spécifiée) et contrainte sur `quiz_questions.statut` (**296**)                                                                                                                                            | 1 j    |
| A4    | Résolveur de niveau **côté serveur** (contrat § 3.2.1) : `/api/auth/me` renvoie le niveau résolu ; les routes le recalculent depuis le jeton ; la séance entre dans la priorité ; `notionNiveau` validé à l'écriture                               | 2 j    |
| A5    | Service d'éligibilité minimal (contrat § 3.2.2) appliqué à `/api/quiz/draw`, au glossaire par défaut et au verrouillage, avec une politique de repli **décidée** (question n° 1) et un réglage pour l'activer progressivement                      | 3 j    |
| A6    | Contenu : rattacher ou écarter les 47 questions `glossaire_definitions`, revoir les 60 questions « collège » à notions de lycée, retirer les difficultés 4-5 du menu ; tests de contenu (distributions, « 0 fiche gardée seulement par du lycée ») | 1,5 j  |

**Effort** : **M, ≈ 11 jours**. **Risque** : faible à moyen — A4 et A5 changent ce que voient
les élèves ; filet : tests A0, réglage d'activation, doc de référence dans le même lot.
**Réversibilité** : haute (code et réglage ; 296 réversible par `ALTER`). **Impact sur la
production mutualisée** : 2 migrations légères, aucune réécriture de grosse table.
**Prérequis** : P0-3 et P0-4 (sinon les lots peuvent être effacés), document BCDEG.
**Laissé de côté** : fusion des tables de liens, observations, photos, découpage d'`App.jsx`.

### 2.2 Piste B — Refactoriser par domaine, sans changer le comportement

**Objectif.** Faire émerger, domaine par domaine, des routes minces → des services → une couche
d'accès aux données, en reprenant les patrons qui marchent déjà dans le dépôt
(`lib/tasks/taskQueries.js` avec son exécuteur `dbx`, les cœurs `lib/shared/*Core.js`, le
patron O6 « extrait X + test UI »). Aucun changement visible.

**Gains.** Enseignants et élèves : moins de régressions (ratio de commits `fix` de 0,46 en
terrain, 0,44 en tâches, 0,54 pour Moodle/LTI) et des corrections plus rapides. Mainteneur :
moins de conflits entre PR, des règles métier écrites une seule fois (niveau, éligibilité,
présence), et un terrain prêt pour la piste C.

**Périmètre et ordre** (détail en § 3.1 et § 3.3) :

| Étape | Domaine et contenu                                                                                                                                                                                                                                     | Taille |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| B0    | Outillage : seuils de couverture, `@vitest/coverage-v8` (dépendance de développement, **à autoriser**), `madge --circular` avec liste d'exceptions figée, test d'inventaire des routes d'écriture                                                      | 1,5 j  |
| B1    | Référentiel partagé des ENUM (§ 3.2.5) : un module par domaine, miroir ESM par `sync:shared-cores`, test contre `information_schema`                                                                                                                   | 2 j    |
| B2    | Pédagogie : services niveau, éligibilité et liens (s'ils ne sont pas déjà faits par A) ; `routes/quiz.js` → `quizService` ; séances extraites d'`App.jsx` (l. 996-1283) vers `usePedagoSession` / `PedagoSessionContext`, **après** un test de montage | 6 j    |
| B3    | Biodiversité : `routes/plants.js` → `speciesService` + dépôt ; service de présence en lecture (mêmes résultats par écran qu'aujourd'hui) ; client `src/services/biodivApi.js`                                                                          | 5 j    |
| B4    | Terrain : handlers jumeaux `routes/map.js` ↔ `routes/zones.js` et modales jumelles ; CRUD des cartes sorti de `routes/settings.js` ; `MapViewImpl` découpé                                                                                             | 7 j    |
| B5    | Tâches : `PUT /api/tasks/:id` (460 lignes) décomposé sur `taskQueries` ; stats en modèle de lecture                                                                                                                                                    | 4 j    |
| B6    | Identité : `/google/callback`, `POST /api/students/import`, registre de « nettoyeurs » déclarés par domaine pour la suppression et la fusion de comptes ; réglages déclarés par domaine                                                                | 6 j    |
| B7    | Vie sociale et mascotte : `routes/visit/mascot.js` aligné sur `asyncHandler` et `validate()` ; clients API de domaine pour `profiles-views` et `groups-views`                                                                                          | 4 j    |

**Effort** : **L, ≈ 35 jours**, en une vingtaine de livraisons de 1 à 3 jours. **Risque** :
moyen (régressions silencieuses) ; filet : tests de caractérisation écrits avant chaque étape,
mesures avant/après (§ 3.4). **Réversibilité** : haute, étape par étape (`git revert`).
**Impact sur la production** : aucune migration ; déploiements fréquents. **Prérequis** :
terminer la bascule `dist-artifact` (étape 3) pour éviter les conflits sur `dist/`,
versionné aujourd'hui (35 583 modifications de fichiers depuis juin). **Laissé de côté** :
changements de schéma, corrections de contenu, internes de GL (une frontière par adaptateur est
posée là où le code non-GL appelle GL).

### 2.3 Piste C — Consolider le schéma et le code ensemble

**Objectif.** Une source de vérité par concept : niveaux, liens question ↔ ressource, présence,
observations, photos, noms, sosies ; puis retrait des colonnes héritées.

**Gains.** Élèves : une seule liste « espèces de ce site », des photos toutes créditées, des
sosies et dangers structurés, une recherche qui trouve les noms secondaires. Enseignants : des
observations d'élèves qui confirment une présence (`confirme_site`) et documentent une
interaction (`observe_site`). Établissement : conformité des licences d'images.

**Migrations** (chacune suit le plan en trois temps du § 3.5) :

| N°  | Contenu                                                                                                                                                   | Taille |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 297 | Liens : reprise des 7 écarts qqs → RQL, puis (après bascule des lectures) `DROP` de `quiz_question_species` et `quiz_question_tutorials`                  | M      |
| 298 | Photos : table `plant_photos` (fiche, type, url, crédit, licence, source, ordre) remplie depuis les 8 colonnes                                            | M      |
| 299 | Noms : `plant_name_aliases.kind` ; éclatement des 149 `second_name`                                                                                       | S      |
| 300 | Sosies : table `plant_lookalikes` (N-N) et ventilation éditoriale des remarques                                                                           | M      |
| 301 | Observations : table `species_observations` (observateur, carte, lieu, espèce, date, photo, statut) et `interaction_evidence`                             | M      |
| 302 | Niveaux : référentiel unique (table ou ENUM + pivot, question n° 4) et colonnes de niveau alignées                                                        | M      |
| 303 | Retraits : `zones.current_plant`, `map_markers.plant_name`, `zones.stage`, `zone_history`, `observation_logs`, `difficulte_label`, vue `v_visit_coverage` | M      |
| 304 | Collations explicites (`schema_version`, `rbac_seeded_permissions`) ; contraintes sur `tasks.*_level` et `tasks.status`                                   | S      |

**Effort** : **L, ≈ 40 jours**. **Risque** : élevé (migrations de données, décisions
éditoriales, trois temps étalés sur plusieurs déploiements, runner sans transaction).
**Réversibilité** : faible au troisième temps (`DROP`) → sauvegarde vérifiée avant chaque
migration ; corriger d'abord `db-backup.sh` (charset, `mariadb-dump`). **Impact sur la
production mutualisée** : plusieurs déploiements avec `db:migrate` ; tables petites (534 fiches,
1 580 liens), donc pas de verrou long. **Prérequis** : les services de la piste B pour le
domaine concerné (sinon chaque changement touche jusqu'à 11 modules, comme `glossary_terms`),
et la piste A pour les niveaux. **Laissé de côté** : tables `gl_*`, refonte visuelle.

### 2.4 Piste D — Terrain d'abord : l'élève dehors avec un téléphone

**Objectif.** Que l'application tienne sur le terrain : réseau faible, petits écrans, élèves de
11 ans.

**Périmètre** : file d'attente locale (IndexedDB) pour « tâche faite », « espèce observée » et
carnet, sur le modèle de `useVisitSeenSync` ; clé d'idempotence côté serveur (migration **297**
si D passe avant C : colonne `client_uuid` unique sur `user_plant_observation_events`) ;
_network-first_ avec délai de 3 à 5 s dans le service worker ; purge du cache à la
déconnexion ; message d'erreur réseau court et tutoyé ; cibles de 44 px dans la barre d'outils
de la carte ; quatre contrastes corrigés ; `label-has-associated-control` réactivée en mode
cliquet ; test automatique des textes visiteurs (§ 1.4.8) ; marque dans `offline.html`.

**Effort** : **M, ≈ 9 jours**. **Risque** : moyen (file d'attente et synchronisation).
**Réversibilité** : haute. **Impact sur la production** : une petite migration.
**Laissé de côté** : niveaux, schéma, refactorisation.

### 2.5 Comparaison

| Critère              | P0              | A — Stabiliser        | B — Refactoriser    | C — Consolider    | D — Terrain        |
| -------------------- | --------------- | --------------------- | ------------------- | ----------------- | ------------------ |
| Effort               | ≈ 4 j           | M, ≈ 11 j             | L, ≈ 35 j           | L, ≈ 40 j         | M, ≈ 9 j           |
| Gain élèves visible  | indirect        | **fort** (contenu)    | indirect            | fort, à terme     | **fort** (terrain) |
| Risque de régression | faible          | faible à moyen        | moyen               | élevé             | moyen              |
| Réversibilité        | haute           | haute                 | haute               | faible au temps 3 | haute              |
| Migrations           | 293, 294, (295) | 292, 296              | aucune              | 297 à 304         | (297)              |
| Dépend de            | vérifs prod     | P0-3, P0-4, doc BCDEG | `dist-artifact`, B0 | A et B            | —                  |

### 2.6 Recommandation

**P0 immédiatement, puis A, puis B par domaine en commençant par la pédagogie ; C en tranches
portées par B ; des éléments de D en parallèle.**

- **P0 d'abord** : quatre des huit urgences **détruisent des données ou exposent un compte
  administrateur** ; elles sont petites et indépendantes.
- **A ensuite**, parce que c'est ce que les élèves de 6e voient, que les lots B à G sont validés
  et attendent, et que A produit exactement ce que B demande en premier : des tests de
  caractérisation sur le niveau et le verrouillage, et les deux services « niveau » et
  « éligibilité ». Rien n'est jeté.
- **B ensuite**, dans l'ordre pédagogie → biodiversité → terrain → tâches → identité, là où
  l'impact pédagogique et le risque se cumulent (§ 3.3). Chaque étape est une petite PR.
- **C par tranches**, chacune ouverte seulement quand le service du domaine existe : liens
  (petit, mesuré, déjà prêt) ; photos (risque juridique) ; présence et observations ; niveaux ;
  retraits.
- **D en parallèle, par morceaux** : les textes visiteurs et les cibles tactiles coûtent moins
  d'une journée chacun.

**Ce qui ferait changer cette recommandation** :

- si le document BCDEG montre que la migration 292 **consolide déjà** niveaux ou liens, C
  remonte et A se réduit ;
- si les vérifications en production révèlent d'autres pannes (tutoriels, vue manquante,
  `sharp` absent), le socle P0 grossit avant tout le reste ;
- si les sorties de terrain du trimestre priment (réseau faible, perte de saisies), D passe
  avant A ;
- si Oliv préfère **ne pas changer ce que voient les élèves** avant la fin du trimestre, A se
  limite à A0-A3 et A4-A5 attendent ;
- si la bascule `dist-artifact` ne peut pas être terminée, B est ralenti par les conflits et il
  vaut mieux enchaîner A puis D.

---

## Partie 3 — Refactorisation

### 3.1 Découpage en domaines

**État mesuré** (hors GL ; affectation par fichier, churn du 01/06 au 24/09, 2 039 commits hors
fusion) [V] :

| Domaine       | Serveur (routes + lib) | Front     | SQL écrit dans les routes | Commits / ratio `fix`                | Ratio lignes de test / code | Tables principales                                                                                                                  |
| ------------- | ---------------------- | --------- | ------------------------- | ------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Biodiversité  | 7 115 l.               | 11 345 l. | **69 %**                  | 122 / **0,21**                       | **0,58**                    | `plants`, `clades`, `species_interactions`, `plant_name_aliases`, `map_species`, `v_food_web`                                       |
| Pédagogie     | 15 156 l.              | 9 398 l.  | 59 %                      | 131 / 0,33                           | 0,64 (e2e : 99 lignes)      | `quiz_*`, `glossary_*`, `resource_question_links`, `resource_gating_*`, `curriculum_*`, `pedago_sessions*`, `id_keys*`, `tutorials` |
| Terrain       | 16 846 l.              | 34 608 l. | **75 %**                  | **311 / 0,46**                       | 0,78                        | `maps`, `zones`, `map_markers`, `zone_species`, `marker_species`, `visit_*`, `map_routes*`, `location_*`, `tracked_individuals`     |
| Tâches        | 6 770 l.               | 10 162 l. | 66 %                      | 176 / **0,44**                       | 0,69                        | `tasks`, `task_*`, `task_projects`, `project_*`, `school_calendar_*`                                                                |
| Vie sociale   | 4 481 l.               | 3 304 l.  | 26 %                      | 71 / 0,35                            | 0,87                        | `forum_*`, `context_comment*`, `notifications`, `user_journal_*`                                                                    |
| Identité      | 23 650 l.              | 14 952 l. | 34 %                      | 253 / 0,39 (Moodle-LTI **0,54**)     | 0,71                        | `users`, `roles`, `user_roles`, `permissions`, `groups`, `group_members`, `external_*`, `sync_*`, `app_settings`, `audit_log`       |
| Shell (front) | —                      | 5 732 l.  | —                         | 140 (**24,4 par millier de lignes**) | **0,42**                    | —                                                                                                                                   |

**Constats transverses** [V] :

- **Le découpage réel ne suit pas les frontières proposées** : le réseau trophique vit dans
  `src/components/pedago/` ; `foretmap-views.jsx` porte le gestionnaire de fiches
  (biodiversité) ; le CRUD des cartes vit dans `routes/settings.js` (l. 406-551), qui regroupe
  26 endpoints hétérogènes ; `routes/stats.js` lit les tables de quatre domaines.
- **Écritures hors du domaine propriétaire** : `routes/groups.js:667-669` (met à NULL le
  groupe des tâches, fils de forum, observations), `routes/rbac.js:1221-1225` (noms dénormalisés
  des tâches), `lib/studentDeletion.js` (13 tables de 4 domaines + GL), 5 modules qui écrivent
  `app_settings` sans passer par `lib/settings.js`.
- **Front** : 76 % des appels API littéraux sont dans les composants (294 appels, 75
  fichiers) ; `src/services/api.js` n'offre qu'un transport générique ; un seul client de
  domaine existe (`moodleAdminApi.js`). `App.jsx` passe **327 attributs à 70 éléments** ;
  aucun contexte pour la pédagogie hors biodiversité (séances, quiz, glossaire), d'où le retour
  de ces états dans `App.jsx`.
- **Couplage GL** : 49 fichiers non-GL dépendent de GL (imports ou SQL sur `gl_*`), dont 7 du
  moteur de verrouillage (`lib/learningGating*` importent `glSettings`, `glQcmAttempts`…) et 19
  d'identité (Moodle, LTI, fusion de comptes, temps réel).
- **Carte `SYNC_DOMAIN_TABLES`** (`database.js:245-302`) : elle pilote `GET /api/sync-state` et
  le rechargement ciblé du front. **Toute redistribution de tables doit la tenir à jour.**

**Cible par domaine.** Arborescence proposée, qui prolonge les dossiers existants (`lib/tasks/`,
`lib/auth/`, `lib/moodle/`, `lib/lti/`) plutôt que d'en inventer une nouvelle :

```text
lib/<domaine>/
  <objet>Repository.js   accès aux données : SQL seulement, exécuteur `dbx` (base ou transaction),
                         sur le modèle de lib/tasks/taskQueries.js
  <objet>Service.js      règles métier, orchestration, transactions ; aucune dépendance à Express
  <objet>Policy.js       permissions et périmètres propres au domaine (au-dessus de requirePermission)
routes/<domaine>.js      HTTP seulement : validate() (zod) → service → JSON ; asyncHandler
src/services/<domaine>Api.js   client HTTP typé du domaine (remplace les api('/…') dispersés)
src/contexts/<Domaine>Context.jsx   état partagé du domaine (ex. PedagoSessionContext)
```

| Domaine      | Cible : modules et services                                                                                                                                                                                                                                      | Accès aux données (propriétaire)                                                                                                                                                                        | API                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biodiversité | `lib/biodiv/` : `speciesService` (validation, revue des dangers, préremplissage), `speciesRepository` (reprend `PLANT_COLUMNS`), **`presenceService`** (registre + localisations, avec provenance), `foodWebService` (sur `foodWebCore`), `cladeService`         | `plants`, `plant_name_aliases`, `clades`, `species_interactions`, `map_species`, `zone_species`, `marker_species` (les placements sont demandés par le terrain via `presenceService`)                   | `/api/plants`, `/api/food-web`, `/api/clades`, à terme `/api/maps/:id/species`                                                                           |
| Pédagogie    | `lib/pedago/` : **`levelResolver`**, **`eligibility`**, **`learningLinks`**, `quizService`, `glossaryService`, `sessionService`, `curriculumService`, `idKeyService` ; le moteur `learningGating*` derrière un **adaptateur de produit** qui isole les appels GL | `quiz_*`, `glossary_*`, `resource_question_links`, `resource_gating_*`, `curriculum_*`, `pedago_sessions*`, `id_keys*`, `tutorials*`, `user_quiz_attempts`, `learning_acknowledgements`, `user_rewards` | `/api/quiz`, `/api/glossary`, `/api/curriculum`, `/api/learning-links`, `/api/learning/gating`, `/api/pedago-sessions`, `/api/id-keys`, `/api/tutorials` |
| Terrain      | `lib/terrain/` : `mapService` (CRUD sorti de `settings.js`), **`locationService`** (zones et repères, handlers aujourd'hui jumeaux), `visitService`, `routeService`, `planService`, `individualService` ; **`observationService`** partagé avec la biodiversité  | `maps`, `zones`, `map_markers`, `visit_*`, `map_routes*`, `location_*`, `zone_photos`, `tracked_individuals`, `individual_measurements`, observations                                                   | `/api/maps`, `/api/zones`, `/api/map`, `/api/visit`, `/api/map-routes`, `/api/plan`, `/api/individuals`, `/api/observations`                             |
| Tâches       | `lib/tasks/` existant : `taskQueries` devient le dépôt de référence ; `taskService` (décompose `PUT /:id`) ; `statsReadModel`                                                                                                                                    | `tasks`, `task_*`, `task_projects`, `project_*`, `school_calendar_*`                                                                                                                                    | inchangée                                                                                                                                                |
| Vie sociale  | cœurs existants `forumCore`, `contextCommentsCore` (déjà services avec accès aux données) ; `notificationService` ; `journalService`                                                                                                                             | `forum_*`, `context_comment*`, `notifications`, `user_journal_*`                                                                                                                                        | inchangée                                                                                                                                                |
| Identité     | `lib/auth/`, `lib/lti/`, `lib/moodle/` existants ; `accountService` avec **registre de nettoyeurs** (chaque domaine déclare quoi purger ou fusionner) ; **registre de réglages par domaine** (au lieu des ≈ 120 clés de `lib/settings.js`)                       | `users`, `roles`, `user_roles`, `permissions`, `groups`, `group_members`, `external_*`, `sync_*`, `app_settings`, `audit_log`, `security_events`                                                        | inchangée                                                                                                                                                |

### 3.2 Services transverses à faire émerger

#### 3.2.1 Résolveur de niveau (pédagogie)

```text
resolveLearnerLevel({
  isGuest, isTeacherFullView, preview,
  session?: { level, notionNiveau },
  classNiveaux: string[],          // groups.curriculum_niveau, parents actifs remontés
  groupLevels: string[],           // groups.pedago_level, parents actifs remontés
  mapLevel?, userPreference?, prefCanRaise, siteDefault
}) → {
  etape: 'college'|'lycee'|'universite',
  curriculumNiveaux: string[] | null,
  maxPalier: number,
  questionNiveaux: string[],       // niveaux de question admis (palier d'entrée ≤ maxPalier)
  glossaryNiveaux: string[],       // profondeurs de terme admises
  sources: { etape: string, curriculum: string },
  enforce: boolean
}
```

**Invariants.** Invité → collège, sans échappatoire. Un professeur n'est jamais restreint par
ses propres groupes. **Le plus spécifique l'emporte** : aperçu > séance > classe
(`curriculum_niveau`, parents **actifs**, palier le plus haut) > groupe (`pedago_level`) > carte >
défaut du site ; le défaut du site est un **repli, jamais un plafond**. La préférence de
l'élève ne peut que baisser, sauf `prefCanRaise`. Le résultat n'est jamais vide. `sources`
trace l'origine de chaque valeur. **Le serveur fait autorité** : `/api/auth/me` renvoie le
résultat et les routes le recalculent à partir du jeton, sans se fier aux paramètres de la
requête. Cœur pur partagé serveur/front (miroir ESM à parité testée, comme `pedagoScales`) ;
chargeur séparé pour les lectures en base.

#### 3.2.2 Service d'éligibilité des contenus (pédagogie)

```text
listEligible({ learner, kind: 'question'|'glossary_term', purpose: 'free'|'session'|'gating',
               resource?: { type, ref }, filters? })
→ { codes: string[],
    excluded: { inactive, outOfLevel, strictReserved, noNotion },
    policy?: { mode, required, requiredCapped },
    levelFallback: 'none'|'all_levels'|'open' }
```

**Invariants.** (1) Un seul fragment SQL `statut = 'actif'`, utilisé partout (quiz, verrouillage,
écran de couverture, générateur). (2) **Le niveau propre du contenu fait barrière** :
`palierEntree(q.niveau) ≤ learner.maxPalier` ; **les notions ne servent qu'au ciblage
thématique**. (3) `required = min(politique, |codes|)` ; `|codes| = 0` → non requis, **et
signalé**. (4) Si le filtre de niveau vide le jeu de verrouillage, le repli est une décision de
politique explicite (question n° 1), jamais implicite. (5) Mêmes codes pour le défi, le résumé,
la progression, l'écran de couverture et le script de génération. (6) Codes `strict` exclus du
tirage libre. (7) Le sort des bonnes réponses sur des questions désactivées est une règle
écrite. (8) Produit passé en paramètre, tables GL séparées (isolement).

#### 3.2.3 Service unique des liens question ↔ ressource (pédagogie)

```text
listQuestionsForResource(type, ref, { audience: 'sheet'|'gating'|'admin' })
upsertLink(input, actor)            // vérifie l'existence de la ressource
replaceMachineLinks(scope, matches, { origin: 'keyword' })   // ne touche que ses liens
purgeResource(type, ref)
reviewLinks(ids, decision, actor) ; setGating(ids, isGating, actor)
```

**Invariants.** Une seule table (`resource_question_links`). Un lien `manual` ou « relu » n'est
**jamais** modifié par un traitement automatique. `is_gating = 1` ⇒ `status = 'approved'` et
type marquable. Toute écriture se fait dans la transaction de l'upsert de la question. Zéro
orphelin (contrôle de contenu). `sheet` renvoie le format actuel de
`GET /api/plants/:id/quiz-questions`, ce qui permet de basculer la fiche sans changer l'écran.

#### 3.2.4 Service d'observation et de validation (terrain × biodiversité)

```text
recordObservation({ observerId, mapId, zoneId? | markerId?, plantId?, observedAt,
                    detectionMode?, text?, photos?, journalArticleId? }) → { id, status: 'soumise' }
validateObservation(id, { teacherId, decision, plantId? })   // transaction
attachInteractionEvidence(interactionId, observationId)
```

**Invariants.** À la validation : `INSERT … ON DUPLICATE KEY UPDATE` sur `map_species` avec
`validation_status = 'confirme_site'`, `first_record_at = COALESCE(first_record_at,
observed_at)`, `first_record_by = COALESCE(…)` ; **jamais de rétrogradation** ; entrée
d'audit. `confirme_site` ⇔ au moins une observation validée sur la carte (ou une attestation
d'enseignant). `observe_site` ⇔ au moins une preuve validée. Photo = fichier + ligne, supprimés
ensemble, EXIF retiré. « J'ai découvert » (`user_plant_observation_events`) reste un acquis
d'apprentissage ; le carnet reste le récit. **Prérequis : P0-3** (sinon `syncPlantMaps` remet
le statut à zéro).

#### 3.2.5 Référentiel des valeurs d'ENUM partagé serveur/front (transverse)

```text
lib/shared/enums/<domaine>.js     // ex. biodivEnums.js : TROPHIC_ROLES, HEALTH_RISKS…
  export const X = Object.freeze({ values: [...], labels: { valeur: 'Libellé fr' } })
src/shared/enums/<domaine>.js     // miroir ESM produit par sync:shared-cores (--check en CI)
```

**Invariants.** Chaque ENUM ou SET SQL, et chaque `varchar` utilisé comme énumération
(`tasks.status`, `tasks.*_level`, `quiz_questions.statut`, `resource_question_links.status`),
a **une seule** définition. Un test compare chaque définition à `information_schema` sur la
base de test (le patron existe : `tests/plants-hazard-review.test.js:46-58`). Les
sous-ensembles volontaires (collège, lycée) sont **déclarés** comme tels (`subsetOf`), pas
recopiés. Les schémas zod des routes et les `<select>` du front importent le référentiel.
Chantier prioritaire : les 26 copies de `college/lycee/universite` et les 7 copies des niveaux
de tâches.

#### 3.2.6 Service de présence des espèces (biodiversité) — ajout proposé

```text
listSpeciesForMap(mapId, { sources: ['registre','zones','reperes'] })
  → [{ plantId, provenance: { registre?, zones: [...], reperes: [...] }, validationStatus }]
syncPlantMaps(plantId, mapIds)       // différentiel : ne touche pas aux lignes conservées
```

**Invariant.** Une seule fonction pour les quatre écrans (clades, visite, réseau trophique,
catalogue) ; chaque écran choisit ses sources **explicitement** (comportement actuel conservé en
piste B, unification en piste C après décision, question n° 10).

### 3.3 Candidats à la refactorisation

**Classement** : score = fréquence de modification (F) × risque de régression (R) × impact
pédagogique (I), chacun noté de 1 à 3 à partir des mesures (F : commits depuis juin ; R : ratio
`fix`, complexité, faiblesse des tests ; I : effet sur le contenu montré aux élèves).

| #   | Zone de code                                                                                                               | Problème mesuré                                                                                                   | Avant → après                                                                       | Gain attendu                             | Risque                       | Tests à écrire **avant**                                                                                                             | Taille | F×R×I      |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- |
| 1   | Niveau : `lib/biodivPedagoLevel.js`, `BiodivPedagoContext.jsx`, défauts de `QuizView`/`GlossaryView`                       | minimum avec le défaut du site ; aucune autorité serveur ; 11 échelles                                            | calcul dans le navigateur → `levelResolver` serveur + cœur pur partagé              | niveau de classe effectif                | moyen                        | niveau final classe de seconde ; paramètres envoyés à `/draw` ; `notionNiveau` invalide                                              | M      | 2×3×3 = 18 |
| 2   | Verrouillage : `learningGatingAcknowledge.js`, `resourceQuestionGatingCore.js`, `learning-links.js /resources`, générateur | aucun filtre de niveau ; 4 lectures sans `statut`                                                                 | fragments dispersés → service `eligibility`                                         | fiches gardées à bon niveau ; lot B sûr  | moyen                        | fiche gardée par une seule question de lycée ; fiche qui passe à 0 ; seuil plafonné ; `gating_count` ; générateur                    | M      | 2×3×3 = 18 |
| 3   | Liens : `routes/plants.js:549-570` (qqs), `routes/tutorials.js:1003-1024` (qqt), `fmQuizImport.js:420`, `fmQuizCrud.js:76` | 3 tables ; 7 écarts ; purge de 289 liens relus                                                                    | 3 lecteurs + 2 purgeurs → `learningLinks`                                           | fin des pertes ; fiche = verrouillage    | moyen                        | instantané `GET /api/plants/:id/quiz-questions` ; import puis édition conservent les liens relus                                     | M      | 2×3×3 = 18 |
| 4   | `App.jsx` l. 996-1283 (séances pédagogiques)                                                                               | 2 276 lignes, CC 247, 115 commits dont 22 `fix` ; +54 % depuis le 28/08                                           | 14 états et 5 callbacks dans le shell → `usePedagoSession` + `PedagoSessionContext` | shell de nouveau « orchestration seule » | moyen                        | test de montage des séances (étendre `AppShellWiring.test.jsx`, qui ne les couvre pas)                                               | M      | 3×3×2 = 18 |
| 5   | `map-views.jsx` : `MapViewImpl`                                                                                            | 1 693 lignes, CC 132, 74 commits dont 17 `fix`, +108 % depuis août                                                | un composant → sous-composants + hooks (patron O6)                                  | écran élève principal plus sûr           | moyen                        | montage carte + barre d'outils + sélection de lieu ; cibles de 44 px                                                                 | L      | 3×3×2 = 18 |
| 6   | `routes/tasks.js` : `PUT /:id`                                                                                             | 460 lignes, CC 114, 14 `fix` / 12 `feat`                                                                          | handler monolithique → `taskService` sur `taskQueries`                              | moins de régressions sur les tâches      | faible (48 fichiers de test) | transitions de statut, permissions, effets de bord (assignations, projet)                                                            | M      | 3×3×2 = 18 |
| 7   | Présence : `speciesJunction.js`, `clades.js:93`, `visit.js:347`, `food-web.js:126`, `plantFilters.js`                      | 4 définitions ; registre effacé à chaque sauvegarde                                                               | 4 requêtes → `presenceService` (sources explicites)                                 | une vérité par site                      | moyen                        | une espèce seulement en zone / en repère / au registre → résultat des 4 écrans ; `PUT` avec `map_ids` inchangés conserve le registre | M      | 2×3×2 = 12 |
| 8   | `routes/quiz.js` + `QuizView.jsx`                                                                                          | 803 l., 18 SQL, 17 endpoints pour 0,47 fichier de test par endpoint ; `QuizView` 609 l., 19 `useState`            | route épaisse → `quizService` + `quizApi`                                           | cœur pédagogique testable                | moyen                        | tirage (niveau, notion, difficulté), réponse signée, stats                                                                           | M      | 2×2×3 = 12 |
| 9   | `routes/plants.js` + `PlantEditForm.jsx`                                                                                   | 863 l., 34 SQL, transaction manuelle ; contournement `hazard_reviewed` ; front biodiversité le moins testé (0,46) | → `speciesService` + `speciesRepository`                                            | revue des dangers fiable                 | faible (ratio `fix` 0,21)    | 403 sur `hazard_reviewed` ; préremplissage GBIF (grand groupe, genre) ; recherche par nom secondaire                                 | M      | 2×2×3 = 12 |
| 10  | Référentiel d'ENUM                                                                                                         | 26 copies des niveaux, 7 des niveaux de tâches, menu de difficulté 1-5 pour des données 1-3                       | copies → `lib/shared/enums` + miroir                                                | une valeur ajoutée partout à la fois     | faible                       | test « ENUM SQL = référentiel » pour chaque colonne                                                                                  | S-M    | 2×2×2 = 8  |
| 11  | `routes/auth.js` : `/google/callback`                                                                                      | 429 l., CC 78, sans `asyncHandler`, 15 `fix` / 17 `feat`                                                          | handler → `authService`                                                             | connexion stable                         | moyen                        | parcours OAuth nominal, domaine refusé, compte lié, e-mail non vérifié                                                               | M      | 3×3×1 = 9  |
| 12  | `routes/map.js` ↔ `routes/zones.js`, `MarkerModal` ↔ `ZoneInfoModal`                                                       | 132 + 222 lignes clonées                                                                                          | handlers et modales jumeaux → `locationService` + modale partagée                   | une correction au lieu de deux           | moyen                        | PUT zone et PUT repère (mêmes cas), montage des deux modales                                                                         | M      | 3×2×1 = 6  |
| 13  | `routes/settings.js` (26 endpoints) + `lib/settings.js` (≈ 120 clés)                                                       | fourre-tout, aimant à conflits (46 commits sur le registre)                                                       | → cartes au terrain, réglages déclarés par domaine                                  | moins de conflits                        | faible                       | instantané de `GET /api/settings/public` et des réglages admin                                                                       | M      | 3×2×1 = 6  |
| 14  | `routes/students.js` : `POST /import`                                                                                      | 523 l., CC 121                                                                                                    | → `studentImportService` sur `lib/importRows.js`                                    | import de rentrée fiable                 | moyen                        | fichiers d'import types (doublons, classes, erreurs)                                                                                 | M      | 2×3×1 = 6  |
| 15  | `routes/visit/mascot.js` + `VisitMascotPackManager.jsx`                                                                    | 1 437 l., 0 `asyncHandler`, N1 ; 1 180 l. et **0 test**                                                           | alignement O7/O8 + validation des fichiers                                          | faille N1 fermée durablement             | moyen                        | dépôt d'un fichier non image refusé ; montage du gestionnaire                                                                        | M      | 2×3×1 = 6  |
| 16  | Purges et fusions : `studentDeletion.js`, `accountMerge.js`, `groups.js:667`, `rbac.js:1221`                               | écritures directes dans 13 tables de 4 domaines + GL                                                              | → registre de nettoyeurs déclarés                                                   | aucune table oubliée à la suppression    | moyen                        | suppression d'un élève : chaque table vidée (instantané)                                                                             | S-M    | 1×3×1 = 3  |

### 3.4 Méthode

- **Sans changement de comportement.** Chaque étape de la piste B garde les réponses HTTP et les
  rendus identiques ; ce qui change le comportement (piste A, piste C) est livré à part, avec son
  doc de référence.
- **Tests de caractérisation d'abord.** Ils figent le comportement actuel, **y compris ses
  défauts** : un test qui échoue au moment du correctif est voulu, et le correctif le fait
  basculer explicitement. Pour un composant racine, test de montage d'abord (patron
  `tests-ui/AppShellWiring.test.jsx`, règle du post-mortem d'août).
- **Petites étapes livrables.** Une PR par extraction (patron O6 : « extrait X de Y + test ») ;
  l'ancien module délègue au nouveau (façade), puis disparaît quand il n'a plus d'appelant.
- **Drapeaux de fonctionnalité** si besoin, sous forme de réglage `app_settings` (le mécanisme
  existe) : par exemple l'application du filtre de niveau au verrouillage.
- **Pas de réécriture complète.**
- **Mesures avant/après à chaque étape.** Ligne de base mesurée pendant l'audit :

| Mesure                                                 | Outil                                  | Aujourd'hui                                      |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------ |
| Lignes de `App.jsx` / de `App()`                       | `wc -l`, AST                           | 2 276 / 2 106                                    |
| Complexité de `App` / `MapViewImpl` / `PUT /tasks/:id` | ESLint `complexity`                    | 247 / 132 / 114                                  |
| Fonctions > 150 lignes / > 400 lignes                  | AST                                    | 201 / 44                                         |
| Duplication                                            | jscpd (50 tokens, 10 lignes)           | ≈ 1,1 %                                          |
| Couverture serveur hors GL et hors tests               | `npm run test:coverage` (recalcul)     | 88,5 % lignes, 72,7 % branches, 85,8 % fonctions |
| Couverture branches de `routes/`                       | idem                                   | 64,7 %                                           |
| Couverture UI                                          | `npm run test:ui:coverage`             | non mesurable (outil absent)                     |
| Part du SQL écrit dans les routes                      | comptage `queryAll/queryOne/execute`   | 52 %                                             |
| Appels API dans les composants                         | comptage `api('/…')`                   | 294 (76 %)                                       |
| Requêtes au chargement de l'app élève                  | lecture statique (à confirmer par HAR) | ≈ 12                                             |
| Cycles serveur                                         | madge                                  | 19 (tous paresseux)                              |
| Copies d'ENUM                                          | script de l'audit                      | 26 (niveaux), 7 (niveaux de tâches)              |

### 3.5 Retraits de schéma : plans en trois temps

Chaque retrait suit : **T1** le code cesse de lire → **T2** le code cesse d'écrire → **T3** une
migration supprime. Le contrôle SQL indique quand passer au temps suivant. Avant tout T3 :
sauvegarde vérifiée (`db-backup.sh` corrigé).

| Candidat                                                                                                              | T1 — cesser de lire                                                                                     | T2 — cesser d'écrire                                                                                                             | T3 et contrôle de passage                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quiz_question_species`                                                                                               | `routes/plants.js:562` lit RQL (`audience: 'sheet'`), après reprise des 7 écarts dans RQL               | plus aucune migration ne l'alimente ; retrait de `database.js:326`                                                               | `DROP TABLE` si `SELECT COUNT(*) FROM quiz_question_species q WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r WHERE r.resource_type='plant' AND r.question_code=q.question_code AND CAST(r.resource_ref AS UNSIGNED)=q.plant_id)` = **0** |
| `quiz_question_tutorials`                                                                                             | `routes/tutorials.js:1016` et `routes/learning-links.js:556-590` lisent RQL                             | retrait de `lib/tutorialDedup.js:29`, `database.js:292`                                                                          | `DROP` si la requête symétrique sur les tutoriels = **0** (déjà le cas)                                                                                                                                                                             |
| `zones.current_plant`, `map_markers.plant_name`                                                                       | replis serveur (`routes/visit.js:251,511`, `zones.js:518`) et front (7 fichiers)                        | `zones.js:556,722`, `visit/sync.js:241`, seed `database.js:974`, `sqliteGardenSqlExport.js`                                      | `DROP COLUMN` si `SELECT COUNT(*) FROM zones WHERE current_plant <> ''` = 0 (déjà) **et** `SELECT COUNT(*) FROM map_markers WHERE plant_name <> ''` = 0 (**3 aujourd'hui** : rattacher d'abord ces espèces)                                         |
| `zones.stage`                                                                                                         | seul lecteur : `lib/legacyZoneShapeConvert.js`                                                          | `visit/sync.js:241`, seed, export SQLite, scripts                                                                                | archiver `SELECT stage, COUNT(*) FROM zones GROUP BY stage` ; vérifier `SELECT COUNT(*) FROM zones WHERE stage='special' AND special<>1` = 0 ; puis `DROP COLUMN`                                                                                   |
| `zone_history`                                                                                                        | `zones.js:276-297`, `ZoneInfoModal.jsx:478-503`                                                         | `zones.js:529-548,791`, seed `database.js:997-1012`                                                                              | exporter la ligne restante ; `DROP` si `SELECT COUNT(*) FROM zone_history` = nombre archivé                                                                                                                                                         |
| `observation_logs` (+ `user_journal_observation_map`)                                                                 | retirer `GET /api/observations/*` et les 4 composants legacy                                            | retirer `POST /api/observations`, `groups.js:669`                                                                                | `DROP` si « observations non recopiées dans le carnet » = 0 (déjà) et fichiers `observations/*` référencés par `user_journal_article_assets`                                                                                                        |
| `quiz_questions.difficulte_label`                                                                                     | l'éditeur et l'import dérivent le libellé de `difficulte` (référentiel § 3.2.5)                         | retrait de `fmQuizImport.js:251,378`, `routes/quiz.js:73,305,356`                                                                | `DROP COLUMN` si `SELECT COUNT(*) FROM quiz_questions WHERE difficulte_label IS NOT NULL AND difficulte_label <> CASE difficulte WHEN 1 THEN '⭐ Facile' WHEN 2 THEN '⭐⭐ Moyen' WHEN 3 THEN '⭐⭐⭐ Difficile' END` = 0                           |
| `plants.taxon_group`                                                                                                  | filtres, recherche et fiche lisent `clades.name` (ancêtre de profondeur choisie ; libellés à réaligner) | retrait de `PLANT_TAXON_FIELDS`, du formulaire (`:644`), des alias d'import, de l'autofill (`:642`), de `plantPayloadSync.js:81` | `DROP COLUMN` si `SELECT COUNT(*) FROM plants WHERE clade_id IS NULL AND taxon_group IS NOT NULL` = 0 et correspondance groupe ↔ clade = 0 écart                                                                                                    |
| `plants.second_name`                                                                                                  | recherche, `learning-links.js:527`, `fmUserJournal.js:662` lisent les alias                             | formulaire et import écrivent les alias                                                                                          | éclater les 149 valeurs (25 multiples) ; `DROP` si « `second_name` absent des alias » = 0 (108 aujourd'hui)                                                                                                                                         |
| `plants.remark_1..3`                                                                                                  | `CatalogRemarksSection` lit un champ unique, avec repli                                                 | une seule zone de texte ; ventilation éditoriale vers sosies et dangers                                                          | `UPDATE plants SET remarks = CONCAT_WS('\n\n', remark_1, remark_2, remark_3)` ; `DROP` si nombre de fiches à remarque non vide identique avant/après                                                                                                |
| 6 colonnes photo + `photo_credit`, `photo_licence`                                                                    | `enrichPlantRow` lit `plant_photos`, avec repli                                                         | formulaire, import et préremplissage écrivent la table, **crédit compris**                                                       | `DROP` des 8 colonnes si nombre d'URL éclatées = nombre de lignes et `SELECT COUNT(*) FROM plant_photos WHERE (credit IS NULL OR licence IS NULL) AND COALESCE(licence,'') NOT IN ('Public domain','CC0')` = 0                                      |
| vue `v_visit_coverage`                                                                                                | aucun lecteur                                                                                           | —                                                                                                                                | `DROP VIEW` ; adapter `tests/visit-coverage-view.test.js`                                                                                                                                                                                           |
| `sync_conflicts.kind = 'both_changed'`                                                                                | —                                                                                                       | jamais écrit                                                                                                                     | `MODIFY` de l'ENUM si `SELECT COUNT(*) FROM sync_conflicts WHERE kind='both_changed'` = 0                                                                                                                                                           |
| `hazard_reviewed` (pas un retrait)                                                                                    | —                                                                                                       | seule la route de validation l'écrit (P0-5)                                                                                      | après décision sur les 145 fiches : `CHECK (hazard_reviewed = 0 OR hazard_reviewed_at IS NOT NULL)` ; contrôles `… WHERE hazard_reviewed=1 AND hazard_reviewed_by IS NULL` et l'inverse                                                             |
| Tables récentes (`id_keys*`, `tracked_individuals`, `individual_measurements`, `user_rewards`, `pedago_session_runs`) | **ne pas retirer** (1 à 3 jours d'existence)                                                            | point d'étape à la fin du trimestre (`SELECT COUNT(*)`, `SUM(is_published)`)                                                     | en cas de retrait : drapeau pour masquer l'onglet, démonter le routeur (`server.js:557-560`), `DROP` dans l'ordre des FK                                                                                                                            |

---

## Top 10 des actions

Classées par urgence (perte de données et sécurité d'abord), puis par effet sur les élèves.
Chaque action est livrable seule, avec ses tests.

| #   | Action                                                                                                                                                                                                     | Pourquoi                                                                                           | Taille   | Piste      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- | ---------- |
| 1   | **Vérifier la production en lecture seule** (vue des tutoriels, présence de `v_zone_inventory`, présence de `sharp`), puis déplacer `isomorphic-dompurify` dans `dependencies` et recréer la vue si besoin | deux pannes probables en production ; un retrait EXIF peut-être inactif                            | S        | P0-1, P0-6 |
| 2   | **Fermer le XSS stocké des packs de mascotte** : extensions image seulement, octets magiques, `attachment` pour tout non-image sous `/uploads`                                                             | un compte professeur peut voler la session d'un administrateur                                     | S        | P0-2       |
| 3   | **Arrêter l'effacement du registre `map_species`** à chaque sauvegarde de fiche (synchronisation différentielle)                                                                                           | 373 espèces portent des données de registre effaçables à tout moment ; bloque la piste C           | S        | P0-3       |
| 4   | **Protéger les 289 liens glossaire relus** du prochain import QCM (origine dédiée, purge ciblée, transaction)                                                                                              | perte silencieuse d'un travail de curation bloquant                                                | S        | P0-4       |
| 5   | **Fermer le contournement « danger relu et validé »** et décider du sort des 145 fiches                                                                                                                    | une mention de sécurité posée sans personne d'habilité                                             | S        | P0-5       |
| 6   | **Purger le dump de production de l'historique Git** et réinitialiser les mots de passe (décision)                                                                                                         | données personnelles d'élèves et hachages lisibles ; longueur minimale de 4                        | décision | P0-8       |
| 7   | **Réécrire les trois textes visiteurs** (laurier-sauce, faux-poivrier, prélèvement de sol) et poser le test automatique                                                                                    | règle non négociable ; un « test » qui fait manipuler une plante proche d'une espèce mortelle      | S        | P0-7, D    |
| 8   | **Poser les tests de caractérisation du niveau, fusionner la PR #546**, puis faire du serveur l'autorité du niveau                                                                                         | une classe de seconde est aujourd'hui traitée en collège ; les lots de niveaux seraient sans effet | M        | A0, A1, A4 |
| 9   | **Préparer le lot B** (filtres `statut` manquants, import qui ne réactive pas) **et appliquer la migration 292**                                                                                           | lots validés en attente ; écran de couverture et générateur faux après le lot B                    | M        | A2, A3     |
| 10  | **Filtrer par niveau côté serveur** le quiz, le glossaire par défaut et le verrouillage, avec une politique de repli décidée                                                                               | 214 questions de lycée en un clic ; 84 fiches et 67 termes gardés seulement par du lycée           | M        | A5         |

---

## Questions pour Oliv

Décisions qui ne relèvent pas de l'audit.

**Pédagogie et contenu**

1. **Repli du filtre de niveau** : quand une fiche n'a aucune question au niveau de l'élève,
   faut-il l'ouvrir, garder les questions de tous niveaux, ou exiger quand même une réponse ?
2. **Quiz libre et glossaire** : un élève de collège doit-il pouvoir choisir « Lycée » ou « Tous
   niveaux » (214 questions de lycée), et voir les 63 termes « avancé » par défaut ?
3. **Lot B** : une fiche qui perd toutes ses questions actives devient validable librement
   (jusqu'à 172 fiches ne sont gardées que par une question). Est-ce voulu ?
4. **Échelle de niveau** : garder deux échelles (étape collège/lycée/université et classe
   `cycle3`…`es_terminale`) reliées par `pedagoScales`, ou n'en garder qu'une ? Une séance
   doit-elle imposer son niveau à l'élève ?
5. **`groups.curriculum_niveau`** est vide sur les 55 groupes : qui le renseigne, et quand ?
   Sans lui, aucun élève de cycle 3 n'est distinguable d'un élève de cycle 4.
6. **47 questions `glossaire_definitions`** sans notion : quelle notion leur rattacher, ou faut-il
   les écarter du tirage libre ? Même question pour les 60 questions « collège » qui ne portent
   que des notions de lycée.
7. **Rôle trophique** (avec l'équipe de SVT) : reclasser les 14 détritivores en
   « consommateur », ou ajouter une valeur `detritivore` ? Que faire des nitrifiants classés
   « décomposeur », et de Rhizobium et des mycorhizes à NULL ?
8. **Textes visiteurs** : masquer en visite, ou reformuler, le libellé « Partie à récolter » et
   le badge « Comestible 🍴 » ? Quel critère de distinction remplace « froisser la feuille »
   pour le laurier-sauce ?
9. **Question désactivée** : les bonnes réponses déjà données comptent-elles encore pour le
   verrouillage ?
10. **« Espèce présente sur ce site »** : registre seul, localisations seules, ou union avec
    provenance ? Aujourd'hui 27, 61 ou 75 espèces pour la forêt selon l'écran.
11. **Rôles `eleve_novice` → `eleve_expert`** : doivent-ils rester indépendants du niveau
    pédagogique ? Le rang d'`eleve_expert` (150, sous `eleve_avance` à 200, pour un seuil de
    40 tâches) est-il voulu ?

**Technique et exploitation**

12. Pouvez-vous fournir **`claude_code_lots_BCDEG.md`** (contenu de la migration 292) ? Les lots
    C, D, E et G n'ont pas pu être évalués.
13. **145 fiches « danger validé » sans relecteur** : les remettre « à valider » et les signaler
    aux professeurs habilités ?
14. **Vérifications en production** : pouvez-vous lancer (ou autoriser) trois contrôles en
    lecture seule, ou fournir un dump `--no-data` de la v291 ? Vue des tutoriels, présence de
    `v_zone_inventory`, présence de `sharp`.
15. **§ 12** : acceptez-vous la réécriture de l'historique Git (force-push, re-clonage des postes)
    et une réinitialisation forcée des mots de passe ? Faut-il relever la longueur minimale des
    mots de passe élèves (4 aujourd'hui) ?
16. **Bascule `dist-artifact`** (étape 3) : peut-on la terminer avant la refactorisation ?
17. **Phase 2** : autorisez-vous l'ajout de dépendances de développement
    (`@vitest/coverage-v8`, et `madge` ou `jscpd` en CI) ?
18. **GL** : poser un adaptateur de produit dans le moteur de verrouillage et dans Moodle modifie
    des appels vers GL sans toucher au code GL. Est-ce acceptable ?
19. **Fonctionnalités récentes** (clés d'identification, individus suivis, récompenses, exécutions
    de séance) : adoption confirmée, ou gel ? Les individus sont invisibles pour tous les élèves
    au niveau collège, et l'onglet « Clés » est affiché mais vide.
20. **Ce rapport** : le garder dans `docs/audit/` (comme demandé), ou le ranger selon la
    convention du dépôt (`docs/AUDIT_*.md` et index `docs/audits/README.md`) ? Il **n'est pas
    commité**, conformément à la consigne ; la session de travail est éphémère.

---

## Annexe A — Colonnes ENUM et SET hors `gl_` (`foretmap_audit`, identiques sur une base neuve)

- `app_settings.scope` : `public`, `teacher`, `admin`
- `curriculum_notions.niveau`, `groups.curriculum_niveau` : `cycle3`, `cycle4`, `seconde`,
  `premiere_spe`, `terminale_spe`, `es_premiere`, `es_terminale`
- `external_groups.kind` : `cohort`, `course_group` ; `external_groups.master` : `moodle`,
  `foretmap` ; `external_group_members.source` : `sync`, `manual` ;
  `external_identities.origin` : `created`, `linked`
- `glossary_terms.niveau` : `base`, `approfondissement`, `avance`
- `glossary_term_notions.mode`, `quiz_question_notions.mode` : `ajout`, `exclusion`
- `groups.pedago_level`, `maps.pedago_level`, `pedago_sessions.level`,
  `users.biodiv_pedago_level` : `college`, `lycee`, `universite`
- `id_keys.niveau`, `quiz_questions.niveau` : `college`, `lycee`
- `location_categories.applies_to` : `zone`, `marker`, `both` ; `location_links.location_kind`,
  `location_notes.location_kind`, `map_route_steps.target_type` : `zone`, `marker`
- SET `location_categories.surfaces`, `map_markers.hidden_surfaces`, `map_routes.surfaces`,
  `zones.hidden_surfaces` : `map`, `visit`, `plan`, `staff`
- `map_species.presence_status` : `resident`, `nicheur_migrateur`, `hivernant`, `passage`,
  `erratique`, `introduit`, `veille` ; SET `map_species.detection_mode` : `vue`, `chant`,
  `trace`, `indice`, `nocturne` ; `map_species.frequency` : `commun`, `regulier`,
  `occasionnel`, `rare` ; `map_species.validation_status` : `confirme_site`, `attendu`,
  `a_confirmer`, `documentaire`
- `plants.habitat_type` : `terrestre`, `aquatique`, `les_deux` ; `plants.trophic_role` :
  `producteur`, `consommateur`, `decomposeur` ; `plants.life_cycle` : `annuelle`,
  `bisannuelle`, `vivace`, `variable` ; `plants.origin_status` : `indigene`, `introduit`,
  `envahissant`, `endemique`, `domestique` ; `plants.iucn_status` : `EX`, `EW`, `CR`, `EN`,
  `VU`, `NT`, `LC`, `DD`, `NE` ; `plants.toxicity_level` : `aucune`, `irritation`, `toxique`,
  `mortel`
- SET `plants.hazard_exposure` : `ingestion`, `contact`, `inhalation`, `projection_oculaire`,
  `piqure_morsure`, `seve_latex` ; SET `plants.health_risk` : `rage`, `tetanos`,
  `salmonellose`, `leptospirose`, `toxoplasmose`, `vecteur`, `allergie`
- `quiz_categories.theme` : `sciences`, `jardinage` ; `quiz_questions.reponse_correcte` : `A` à
  `E`
- `species_interactions.interaction_type` : `pollinisation`, `herbivorie`, `predation`,
  `plante_hote`, `decomposition`, `nitrification`, `symbiose`, `competition`, `detritivorie`,
  `frugivorie`, `granivorie`, `parasitisme`, `excretion`, `assimilation`, `mutualisme`,
  `commensalisme`, `mycophagie`, `allelopathie`, `facilitation` ;
  `species_interactions.evidence_level` : `bibliographie`, `observe_site`, `hypothese` ;
  `species_interactions.pollination_efficacy` : `efficace`, `accessoire`, `visiteur`,
  `voleur_nectar`
- `sync_conflicts.kind` : `member_added_on_mirror`, `member_removed_on_mirror`,
  `both_changed`, `name_changed` ; `sync_conflicts.resolution` : `keep_master`, `apply_other`,
  `ignore` ; `sync_pending_matches.resolution` : `link`, `create`, `ignore` ;
  `sync_runs.mode` : `dry_run`, `apply` ; `sync_runs.status` : `running`, `succeeded`,
  `failed`, `aborted`, `undone`

## Annexe B — Méthodes, pour rejouer les mesures

| Mesure                                  | Méthode                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base « comme la prod »                  | `node scripts/load-anonymized-fixture.js --db foretmap_audit`, puis `initSchema()` avec `DB_NAME=foretmap_audit`                                                                                                                     |
| Reproductibilité                        | base vide + `initSchema()` ; export trié de `information_schema` (TABLES, COLUMNS, STATISTICS, KEY_COLUMN_USAGE, REFERENTIAL_CONSTRAINTS, CHECK_CONSTRAINTS, VIEWS, TRIGGERS) puis `diff` ; second `initSchema()` pour l'idempotence |
| Matrice table × module                  | extraction des chaînes par `@babel/parser`, scanner SQL par mots-clés, résolution manuelle des 127 noms de tables dynamiques ; sondage de 20 couples                                                                                 |
| Colonnes inutilisées ou absentes        | index des identifiants par catégorie de fichier (snake_case et camelCase) ; contrôle des `alias.colonne`, listes d'INSERT et `SET` d'UPDATE contre le schéma                                                                         |
| Routes d'écriture et RBAC               | analyse acorn des `router.(post\|put\|patch\|delete)` et des `router.use` précédents ; relecture manuelle des cas sans garde                                                                                                         |
| Interpolations SQL                      | classement de chaque `${…}` et `+` dans une chaîne SQL : identifiant sûr, placeholders générés, valeur utilisateur                                                                                                                   |
| Taille, complexité, duplication, cycles | AST (longueur des fonctions), ESLint `complexity` et `max-lines-per-function`, jscpd 4 (50 tokens, 10 lignes), madge                                                                                                                 |
| Performance                             | recherche AST des `await` SQL dans des boucles ; `EXPLAIN` de 20 requêtes d'écrans élèves sur `foretmap_audit`                                                                                                                       |
| Couverture                              | `npm run test:coverage`, recalcul pondéré hors GL et hors fichiers de test                                                                                                                                                           |
| Churn                                   | `git log origin/main --since=2026-06-01 --numstat`, préfixes conventionnels `fix`/`feat`                                                                                                                                             |
| Niveaux et verrouillage                 | logique du code reproduite en SQL (scénarios du § 1.3.1) ; exécution directe des fonctions pures de `lib/biodivPedagoLevel.js`                                                                                                       |
| Textes visiteurs                        | extraction AST des chaînes de 88 fichiers + lecture des contenus en base ; motifs et exceptions du § 1.4.8                                                                                                                           |
| Contrastes                              | ratio WCAG calculé sur les variables de `src/index.css`                                                                                                                                                                              |
