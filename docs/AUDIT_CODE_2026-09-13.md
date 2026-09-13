# Audit du code ForetMap — 13 septembre 2026

> **Statut : traité le jour même** (même PR, #457) pour tout ce qui est marqué « **Traité** »
> ci-dessous ; les constats restés ouverts sont récapitulés en §9. Les constats d'origine sont
> conservés tels quels (convention `docs/audits/README.md`), y compris celui de §3.5 qui s'est
> révélé partiellement faux. Audit transversal du monorepo (ForetMap + Gnomes & Licornes) sur
> `main` @ `0278a73`, version **1.155.3** : bugs, incohérences, doublons, performance et charge
> serveur. Mené **avec une base MariaDB réelle** (10.11, schéma initialisé par `npm run db:init`
> en 4 s) : les trois suites de tests, le lint, Prettier et `npm audit` ont été exécutés ; les
> constats de structure (index, tables sans clé) sont lus dans `information_schema` de cette
> base, pas déduits du SQL. Les doublons sont **mesurés** par un détecteur de fenêtres de 10
> lignes normalisées, et la couverture `docs/API.md` par un rapprochement automatique des
> `router.<verbe>()` montés dans `server.js`.
>
> Successeur de [`AUDIT_GENERAL_2026-08-26.md`](AUDIT_GENERAL_2026-08-26.md) pour le volet
> code ; ne réaudite pas ce que [`AUDIT_STABILITE_PERF_2026-09.md`](AUDIT_STABILITE_PERF_2026-09.md)
> (G1–G5, C1–C5) et [`AUDIT_CHARGE_BIODIVERSITE_2026-09.md`](AUDIT_CHARGE_BIODIVERSITE_2026-09.md)
> (B1–B9, P1–P8) ont déjà consigné — quand un constat y retombe, il est marqué « déjà connu ».

---

## 1. Résumé exécutif

L'état du dépôt est **sain**. Aucun bug bloquant, aucune faille d'autorisation, aucune injection
SQL : les seules interpolations dans des requêtes portent sur des listes de colonnes constantes
(`MARKER_SELECT`, `FEUILLET_SELECT`…), des clauses fixes choisies par `===`, des listes de `?`,
ou un nom de table issu d'une configuration de module (`lib/entityPhotoRoutes.js`). La chaîne
d'authentification coûte **une seule requête SQL** par appel (`users.is_active, token_epoch`),
tout le reste (RBAC, périmètre groupes, réglages) est servi par des caches invalidés par version
d'écriture. Le polling client est différentiel (`/api/sync-state`), plancher 90 s en temps réel
et 120 s onglet caché.

| Contrôle                                   | Résultat                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `npm test` (backend, MariaDB réelle)       | **3380 / 3382**, 0 échec, 2 ignorés (snapshots opt-in) — après correctifs : **3408 / 3410** |
| `npm run test:content`                     | **41 / 41**                                                                                 |
| `npm run test:ui` (Vitest)                 | **4024 / 4024**, 555 fichiers, 296 s                                                        |
| `npm run lint`                             | **0 erreur**, 179 avertissements (voir §6.3)                                                |
| `npm run format:check`                     | conforme                                                                                    |
| `npm run db:init` sur base vierge          | 155 tables, sans erreur remontée (mais voir §2.1)                                           |
| `npm audit --omit=dev`                     | **4 moderate**, 0 high (voir §5.4)                                                          |
| Miroirs `src/shared` ↔ `lib/shared`, packs | identiques, scripts de sync sans dérive                                                     |

Ce que l'audit apporte de neuf tient en quatre points :

1. **Une migration écrit dans une table qui n'existe pas, et personne ne le voit** (§2.1). La
   migration `237` insère deux réglages dans `settings` ; la table s'appelle `app_settings`. Le
   moteur de migrations classe `ER_NO_SUCH_TABLE` parmi les erreurs « déjà appliquée » et
   l'avale en `debug`. Sans conséquence fonctionnelle ici (les défauts du registre suppléent),
   mais le mécanisme masque toute faute de frappe de table dans une migration future.
2. **Le code d'import et les helpers de routes sont copiés plutôt que partagés** (§4). Trente
   fonctions homonymes déclarées dans 3 à 12 fichiers ; deux d'entre elles (`normalizeSlug`,
   `httpError`) portent **des sémantiques différentes sous le même nom** (§3.1, §3.2).
3. **`docs/API.md` a décroché sur un périmètre récent** (§3.5) : ~~les 16 routes
   d'administration Moodle et~~ quatorze routes d'administration du lore G&L (glossaire, QCM,
   réordonnancement des feuillets) n'y figurent pas, alors que la convention du dépôt l'exige
   dans le même lot. _Correction du 13/09 : les routes Moodle **sont** documentées, en chemins
   relatifs sous leur titre de section — le rapprochement initial ne les lisait pas (§3.5)._
4. **Les tables de journaux purgées par date n'ont pas d'index sur cette date** (§5.2) :
   `audit_log.created_at`, `gl_game_events.created_at`, `task_logs.created_at`. La purge
   (`scripts/purge-audit-logs.js`) balaie donc la table entière.

| Domaine                      | Critique | Majeur | Mineur | Info |
| ---------------------------- | :------: | :----: | :----: | :--: |
| Bugs                         |    0     |   1    |   4    |  1   |
| Incohérences                 |    0     |   1    |   4    |  1   |
| Doublons                     |    0     |   0    |   5    |  2   |
| Performance & charge serveur |    0     |   1    |   4    |  3   |

---

## 2. Bugs

### 2.1 — MAJEUR · Le moteur de migrations avale « table inexistante » comme « déjà appliquée »

`database.js:13-20` — `MYSQL_MIGRATION_EXPECTED_ERRNO` contient `1146 // ER_NO_SUCH_TABLE`.
`logMigrationStmtError` (`:27-35`) journalise alors en **debug** « Étape migration ignorée
(déjà appliquée) » et rend la main : la migration est comptée comme réussie.

Cas concret, reproduit sur base vierge (`npm run db:init`, journal debug) :

- **`migrations/237_user_journal.sql:56-62`** :
  `INSERT INTO settings (\`key\`, value, updated_at) VALUES ('observations.journal_max_chars', …)`puis`observations.journal_max_assets`. **La table s'appelle `app_settings`** (`lib/settings.js:527`).
Les deux `INSERT` échouent (`Table 'foretmap_test.settings' doesn't exist`) et sont classés
« déjà appliqués ». Effet visible : nul aujourd'hui, car `lib/fmUserJournal.js:100-101`lit ces
clés via`getSettingValue(key, 0)`et le registre`lib/settings.js:178-193`porte le même défaut.
Mais l'intention de la migration — semer la ligne pour qu'elle apparaisse comme réglage
explicite — n'est pas honorée, et la même faute sur un`INSERT` sans défaut applicatif serait
  invisible.
- **`migrations/227_pedago_fm_resource_question_curation.sql`** (deux blocs) — `DELETE … FROM
quiz_question_glossary` et `INSERT IGNORE INTO quiz_question_glossary` : la table a été
  **supprimée par la migration `186`** (`DROP TABLE IF EXISTS quiz_question_glossary`). Ces deux
  blocs sont du code mort sur toute base, neuve ou existante, et ne l'ont jamais signalé.

La raison d'être du `1146` dans la liste est légitime — des migrations anciennes touchent des
tables legacy qu'une base neuve n'a jamais eues (`DROP COLUMN` sur une table héritée). Mais le
filet attrape aussi les erreurs de rédaction.

**Remède.** Ne tolérer `1146` que pour les verbes qui suppriment (`DROP …`, `ALTER … DROP`)
et pour les fichiers antérieurs à un numéro plancher ; pour `INSERT`/`UPDATE`/`DELETE`/`CREATE
INDEX`, remonter en `warn` et faire échouer la migration. Ajouter un test dans
`tests/migrations-*.test.js` qui rejoue chaque migration sur base vierge et échoue sur tout
`ER_NO_SUCH_TABLE` d'un verbe d'écriture. Corriger `237` par une migration `242` qui insère dans
`app_settings` (les migrations appliquées ne sont pas rejouées : `schema_version`).
_Confiance : haute (reproduit)._

**Traité.** `database.js` : `1146` n'est plus dans la liste des errnos tolérés ;
`classifyMigrationStmtError` ne l'accepte que pour un énoncé de suppression (`DROP …`,
`ALTER … DROP …`), pour les tables de l'ancien modèle de comptes (`students`, `teachers`) que la
migration 029 a remplacées, ou — en `warn` — dans une migration antérieure à la 242. La
migration `237` écrit désormais dans `app_settings`, les deux blocs morts de la `227` sont
retirés, et la migration `242` rattrape les bases déjà en 237. Vérifié par `npm run db:init`
sur base vierge (zéro avertissement, `schema_version = 242`) et par
`tests/migrations-error-classifier.test.js`.

### 2.2 — MINEUR · Un octet nul littéral dans `lib/usage.js`

`lib/usage.js:87` — ``const id = `${ev.product}\0${ev.event}\0${ev.key}`;`` : le séparateur est
un **caractère U+0000 brut** dans le source, pas la séquence d'échappement `\0`. `file` classe le
fichier en « data », `grep`/`ripgrep` le traitent comme binaire (« binary file matches ») et
n'affichent plus ses lignes ; certains éditeurs le réécrivent. Le comportement à l'exécution
est correct. **Remède** : écrire `\u0000` ou, plus lisible, `'|'` (les trois champs sont déjà
normalisés sans ce caractère). _Confiance : haute._

**Traité** (`'\u0000'`).

### 2.3 — MINEUR · N+1 à la validation des lieux d'un tutoriel

`routes/tutorials.js:126-138` — `validateTutorialLocations` exécute **une requête par zone puis
une par repère** (`SELECT id FROM zones WHERE id = ?` en boucle). Appelé à la création et à la
mise à jour d'un tutoriel, volumes faibles (quelques lieux), donc coût réel modeste — mais c'est
le motif que les audits précédents ont traqué partout ailleurs. **Remède** : deux requêtes `WHERE
id IN (…)` et comparaison des ensembles. _Confiance : haute._

**Traité** (`allIdsExist`, deux requêtes groupées).

### 2.4 — MINEUR · Historique de zone sans borne

`routes/zones.js:346` et `:524` — `SELECT * FROM zone_history WHERE zone_id = ? ORDER BY
harvested_at DESC` sans `LIMIT`, renvoyé entier dans la fiche de zone. `zone_history` est
purgée à 730 jours par défaut (`scripts/purge-audit-logs.js`), ce qui borne la dérive, mais une
zone très récoltée renvoie des centaines de lignes à chaque ouverture de fiche. **Remède** :
`LIMIT 200` et pagination si besoin ; projection de colonnes. _Confiance : haute._

**Traité** : projection explicite (`id, zone_id, plant, harvested_at`) et `LIMIT 500`
(`ZONE_HISTORY_MAX_ROWS`), sur les deux lectures.

### 2.5 — MINEUR · Effets de chargement sans annulation (25 fichiers)

Motif `useEffect(() => { load(); }, [load])` où `load` est un `useCallback` qui `await api(…)`
puis `setState`, **sans drapeau d'annulation ni `AbortController`**. Exemples :
`src/components/settings/UsagePanel.jsx:67`, `src/components/map/PhotoGallery.jsx:51`,
`src/components/groups-views.jsx`, `src/components/profiles-views.jsx`,
`src/components/stats-views.jsx`, `src/components/tasks-views.jsx`… (liste complète : 25
fichiers, obtenue par `grep` des fichiers appelant `api(` dans un effet sans `cancelled`,
`AbortController` ni `signal`). Sur React 19 le `setState` après démontage est silencieux ;
le vrai risque est **l'ordre d'arrivée** : si les dépendances de `load` changent pendant un appel
en vol (changement de carte, de filtre), la réponse la plus ancienne peut écraser la plus
récente. `useApiResource` (`src/hooks/useApiResource.js`) règle déjà ce cas ; il n'est pas
utilisé par ces composants. **Remède** : passer ces chargements par `useApiResource`, ou poser
un compteur de génération dans `load`. _Confiance : moyenne (motif vérifié, course non
reproduite)._

**Traité pour les écrans dont les entrées changent** : `src/shared/hooks/useLatestRequest.js`
(compteur de génération, périmé au démontage — `tests-ui/shared/useLatestRequest.test.jsx`)
posé sur la galerie photos d'un lieu (changement de lieu), le panneau d'usage (période,
produit), les carnets des statistiques (groupe), les parcours et lieux du panneau cartes
(carte), et la synchronisation visite (carte). **Laissé** : les panneaux d'administration qui
chargent une fois au montage sans dépendance variable — la course y est théorique.

### 2.6 — INFO · Deux conventions d'erreur HTTP typée cohabitent

Voir §3.2 : ce n'est pas un bug aujourd'hui, chaque famille de routes lit la propriété que sa
famille de helpers écrit — mais un `httpError` de `lib/lti/*` remonté par un handler de
`routes/gl/*` tomberait en `400` quel que soit son statut.

---

## 3. Incohérences

### 3.1 — MAJEUR · `normalizeSlug` : sept copies, deux sémantiques

| Sémantique                                        | Fichiers                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `trim().toLowerCase()` seulement                  | `routes/gl/content.js:18`, `lib/gl/chaptersRouteHelpers.js:18`, `lib/glChaptersImport.js:314`, `lib/glChapterCharteImport.js:121` |
| slugification `[^a-z0-9_-]` → `-`, tirets rognés  | `routes/groups.js:38`, `lib/glGroupBridge.js:17`                                                                                  |
| slugification, mais `.` autorisé (`[^a-z0-9._-]`) | `routes/gl/tutorials.js:34`                                                                                                       |

Un même identifiant saisi `« Marché Noir »` devient `marché noir` dans un chapitre et
`march-noir` dans un groupe. Les slugs de chapitres/biomes ne transitent pas par les groupes,
donc pas de collision observée — mais rien ne l'empêche, et un relecteur ne peut pas savoir,
au nom de la fonction, laquelle il appelle. **Remède** : un `lib/shared/slug.js` avec deux
fonctions **nommées différemment** (`lowerTrim`, `slugify`) et suppression des sept copies.
_Confiance : haute._

**Traité** : `lib/shared/slug.js` (`lowerTrim`, `slugify(value, { allowDots })`), les sept
copies remplacées ; `lib/gl/chaptersRouteHelpers.js` garde l'export `normalizeSlug` comme
alias de `lowerTrim` pour ses appelants.

### 3.2 — MINEUR · `httpError` : neuf copies, deux formes

- `Object.assign(new Error(m), { statusCode, … })` — `lib/shared/questionCrudCore.js:18`, lu par
  `err.statusCode || 400` dans `routes/gl/{spells,qcm,glossary,species,lore}.js`.
- `err.status = status` — `lib/moodle/{teamsMirror,syncRun,undo,pendingMatches,conflicts}.js`,
  `lib/lti/{launch,identity}.js` (plus `makeHttpError` ×3 ailleurs), lus par `err.status`
  (89 occurrences).

**Remède** : un seul `lib/shared/httpError.js` posant **les deux** propriétés, et un helper
`sendError(res, err)` unique. _Confiance : haute._

**Traité** : `lib/shared/httpError.js` (`httpError` pose `status` **et** `statusCode`,
`httpErrorStatus(err)` lit l'un ou l'autre) ; neuf copies remplacées, et les trois
`makeHttpError(message, status)` du marché / des sorts redirigent vers lui.

### 3.3 — MINEUR · `mapExists` : sept copies, deux variantes

`routes/zones.js:64`, `routes/map.js:61`, `lib/tasks/taskQueries.js:46` (garde `!mapId`, sans
`LIMIT 1`) ; `routes/map-categories.js:35`, `routes/map-routes.js:52`, `lib/visitRouteShared.js:24`,
`lib/realtime.js:198` (sans garde, avec `LIMIT 1`). Sans garde, `mapExists(undefined)` envoie
`WHERE id = NULL` — faux, donc sans danger, mais une requête pour rien. **Remède** : exporter la
version de `lib/visitRouteShared.js` (avec garde) et importer partout. _Confiance : haute._

**Traité** : `lib/mapQueries.js` (garde sur identifiant vide + `LIMIT 1`), sept copies
remplacées.

### 3.4 — MINEUR · `normalizeEmail` : sept copies identiques

`lib/identity.js:4` est la version canonique ; `lib/rbacRouteHelpers.js:73`,
`lib/authRouteHelpers.js:32`, `lib/glProfile.js:11`, `lib/glPlayerAuth.js:11`,
`lib/teacherAdminSeed.js:13`, `lib/moodle/matching.js:39` la recopient (cette dernière sans
retour `null` sur vide : `''` au lieu de `null`, ce qui change une comparaison `=== null` en
aval). **Remède** : importer `lib/identity.js`. _Confiance : haute._

**Traité** pour cinq copies (import de `lib/identity.js`). `lib/moodle/matching.js` garde la
sienne : elle renvoie `''` et non `null`, et ses appelants comparent des chaînes — l'aligner
serait un changement de comportement à tester à part.

### 3.5 — MINEUR · `docs/API.md` : ~~au moins 28~~ quatorze routes montées sans documentation

> **Correction du 13/09.** Le rapprochement initial ne reconnaissait que les URL absolues
> (`/api/...`). Or `API.md` documente certaines familles en **chemins relatifs sous un titre
> qui porte le préfixe** — c'est le cas des 16 routes Moodle (`## Lien Moodle
(\`/api/admin/integrations/moodle\`)`puis`| GET | \`/status\` |`). Elles **sont**
documentées ; le constat qui suit les concernant est faux et reste ici barré. Restaient
réellement absentes : 8 routes `/api/gl/lore/admin/glossary/_`(résumées par une seule
ligne joker), 5 routes`/api/gl/lore/admin/qcm/questions_`et`PUT
> /api/gl/lore/admin/feuillets/reorder`.

Rapprochement automatique des 548 routes montées via `server.js` avec les 629 entrées de
`docs/API.md` ; après vérification manuelle (zéro occurrence du chemin dans le fichier) :

- ~~**16 routes `/api/admin/integrations/moodle/*`** (`routes/admin/moodle.js`) : `status`,
  `check`, `cohorts`, `courses`, `runs` (GET/POST), `runs/:id`, `runs/:id/undo`,
  `pending-matches` (GET, POST `:id`), `conflicts` (GET, POST `:id`), `exempt` (GET/POST),
  `merge`, `mirrors`. Elles ne sont décrites que dans
  [`AUDIT_MOODLE_IDENTITES_2026-09.md`](AUDIT_MOODLE_IDENTITES_2026-09.md) — un document de
  chantier, pas le contrat HTTP.~~ **Faux** : documentées en chemins relatifs (voir l'encadré).
- **12 routes `/api/gl/lore/admin/{glossary,qcm}/*`** (`routes/gl/lore.js`) : `glossary/meta`,
  `glossary/terms` (GET/POST), `glossary/terms/next-code`, `glossary/terms/:code` (PUT),
  `glossary/import/template`, `glossary/export`, `glossary/import`, `qcm/questions` (GET/POST),
  `qcm/questions/next-code`, `qcm/questions/:code`.

Le rapprochement signale d'autres candidats (`/api/gl/learning-links/{policy,locks,type-policy}`,
`PATCH /api/gl/learning-links/:id`, `/api/gl/learning/gating/challenge`,
`PUT /api/gl/lore/admin/feuillets/reorder`, `GET /api/auth/google/callback`) que la
normalisation des paramètres rend moins sûrs ; à contrôler à la main. Le script de rapprochement
est reproductible (voir §7) et pourrait rejoindre `tests/` comme garde-fou de la convention
« toute route publique → `API.md` ». _Confiance : haute sur les 28, moyenne sur le reste._

**Traité** : quatorze lignes ajoutées à `docs/API.md`, et le rapprochement devient un test
sans base, `tests/api-doc-coverage.test.js` (routeurs montés par `server.js` et sous-routeurs
`router.use(require(…))`, URL absolues, relatives sous titre préfixé, jokers `/*`). Il passe
sur les 548 routes ; toute exception future doit être justifiée dans sa liste blanche.

### 3.6 — INFO · Réglages orphelins des deux côtés

Conséquence de §2.1 : `observations.journal_max_chars` / `_max_assets` existent dans le registre
(`lib/settings.js`), dans le méta front (`src/constants/settingsAdminMeta.js:228-238`) et dans
le consommateur, mais **jamais en base** tant qu'un admin ne les a pas modifiés. Cohérent avec le
mode « défaut implicite » du registre ; la migration laissait croire le contraire.

---

## 4. Doublons (mesurés)

Détecteur : fenêtres glissantes de 10 lignes normalisées (sans blancs, commentaires, imports,
accolades seules), hachées ; un « cluster » compte les fenêtres communes à deux fichiers.
Les miroirs assumés et synchronisés par script (`src/shared` ↔ `lib/shared`, packs mascotte,
`termAutolink`) sont **vérifiés identiques** et exclus du tableau.

| Fenêtres | Fichiers                                                                                                 | Lecture                                                                 |
| :------: | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|    71    | `lib/glBiomesRegistry.js` ↔ `src/gl/data/biomes.registry.js`                                             | **Copie manuelle sans script de sync** (59 lignes divergent) — §4.1     |
|    58    | `routes/visit/markers.js` ↔ `routes/visit/zones.js`                                                      | `resolveAudienceForInsert/Update` identiques, 30 % de chaque fichier    |
|    37    | `src/components/journal/UserJournalArticleCard.jsx` ↔ `src/gl/components/GLPlayerJournalArticleCard.jsx` | Carnet FM / carnet joueur GL : même composant recopié                   |
|    35    | `routes/map.js` ↔ `routes/zones.js`                                                                      | `normalizeLivingBeings`, `serializeLocationRow`, `mapExists` identiques |
|    32    | `routes/gl/learning-links.js` ↔ `routes/learning-links.js`                                               | Même CRUD de liaisons, deux tables                                      |
|    31    | `routes/gl/lore.js` ↔ `routes/gl/qcm.js`                                                                 | Import/export QCM lore vs QCM                                           |
|    30    | `lib/glPlayersImport.js` ↔ `lib/studentRouteHelpers.js` ↔ `lib/tasks/taskImport.js`                      | Pipeline tableur → lignes                                               |
|    28    | `src/components/journal/UserJournalView.jsx` ↔ `src/gl/components/GLPlayerJournalView.jsx`               | idem carnet                                                             |
|    27    | `lib/fmQuizImport.js` ↔ `lib/glQcmImport.js` (+26 avec `lib/glQcmLoreImport.js`)                         | Trois importeurs de questions                                           |
|    27    | `src/gl/components/GLQcmModal.jsx` ↔ `src/gl/components/GLQcmPopover.jsx`                                | Même rendu de question, deux enveloppes                                 |
|    19    | `src/gl/hooks/useGLPlateauMusic.js` ↔ `src/gl/hooks/useGLZoneMusic.js`                                   | Lecteur audio recopié                                                   |
|    19    | `src/components/tasks/TaskFiltersBar.jsx` ↔ `TaskFiltersFields.jsx` ↔ `tasks-views.jsx`                  | Champs de filtre                                                        |

### 4.1 — MINEUR · Registre des biomes recopié sans synchronisation

`lib/glBiomesRegistry.js` (183 lignes) et `src/gl/data/biomes.registry.js` partagent 71 fenêtres
mais divergent sur 59 lignes, et **aucun script `sync:*` ne les relie** (contrairement à
`termAutolink`, `visit-pack`, `gl-pack`). Le contenu métier (liste des biomes, alias) est
identique à ce jour ; la prochaine évolution d'un seul côté créera une incohérence serveur /
client silencieuse. **Remède** : déplacer la source dans `src/shared/` (miroir `lib/shared/`
déjà couvert par le diff de CI) ou ajouter un `sync:biomes-lib`. _Confiance : haute sur le
doublon, moyenne sur la divergence sémantique (non testée)._

**Traité** : la source est `src/shared/glBiomesRegistryCore.js`, miroir CJS généré dans
`lib/shared/` par `scripts/sync-shared-cores.js` (contrôlé par `tests/shared-cores-sync.test.js`) ;
`src/gl/data/biomes.registry.js` et `lib/glBiomesRegistry.js` ne font plus que réexporter, ce
dernier gardant les alias propres au lore. La divergence textuelle (alias `foret_caducifoliee`
présent d'un seul côté) était sans effet : `normalizeBiomeSlugKey` replie `-` sur `_`.

### 4.2 — MINEUR · Helpers d'import tableur : 11 `resolveImportRows`, 8 `readSheetRows`

Fonctions homonymes déclarées dans plusieurs fichiers backend (extraction `^function nom(`) :

| Fonction                  | Fichiers | Fonction                      | Fichiers |
| ------------------------- | :------: | ----------------------------- | :------: |
| `resolveImportRows`       |    11    | `normalizeOptionalFilter`     |    5     |
| `httpError`               |    9     | `normalizeBiomeSlug`          |    5     |
| `readSheetRows`           |    8     | `isPlainObject`               |    5     |
| `normalizeOptionalString` |    8     | `asOptionalText`              |    5     |
| `normalizeSlug`           |    7     | `parseWorkbookRowsFromBuffer` |    4     |
| `normalizeEmail`          |    7     | `csvEscape`                   |    4     |
| `mapExists`               |    7     | `parseCsvLine`                |    3     |
| `buildImportReportBase`   |    7     | `parseJson` / `safeJsonParse` |  3 + 1   |

Les importeurs (`lib/*Import.js`, 9 fichiers, ~7 000 lignes) réimplémentent chacun la lecture
de classeur, le parsing CSV et le rapport d'import. Ce n'est pas un bug ; c'est le coût de
maintenance le plus visible du dépôt : une correction du parsing CSV doit être portée à trois
endroits. **Remède** : un `lib/import/spreadsheetRows.js` (lecture + CSV + rapport) importé par
les neuf. _Confiance : haute._

**Traité pour les copies strictement identiques** : `lib/importRows.js` porte désormais le
parseur CSV, l'échappement CSV, le décodage base64 et `resolveImportRows` (élèves, joueurs,
tâches, groupes, plantes), plus `resolveWorkbookImportRows(body, parseur)` pour les quatre
importeurs G&L par classeur ; `readSheetRows` vient de `lib/shared/xlsxImportCore.js`
(6 copies), `asOptionalText` de `lib/shared/stringHelpers.js` (5), `normalizeOptionalFilter` et
`normalizeBiomeSlug` sont des alias de `normalizeOptionalString` (10). **Laissé** :
`buildImportReportBase` (sept formes de rapport réellement différentes) et `isPlainObject`
(trois variantes équivalentes, dont deux dans des cœurs miroirs `src/shared` ↔ `lib/shared`).

### 4.3 — MINEUR · Front : `joinClassNames` ×12, `fileToDataUrl` ×8, `formatDateTime` ×6

- `joinClassNames` : 12 copies dont **5 dans `src/shared/ui/` lui-même** (`Button`, `DataList`,
  `MapActionButton`, `BottomSheet`, `DialogShell`) et 7 dans `src/gl/components/ui/`. Deux
  variantes (`String(v).trim()` ou `filter(Boolean)` seul).
- `fileToDataUrl` : **`src/shared/platform/fileToDataUrl.js` existe** (5 importateurs), mais
  sept panneaux d'import GL (`GLPlayersImportPanel`, `GLLoreFeuilletsImportPanel`,
  `GLChaptersImportExportPanel`, `GLGlossaryImportPanel`, `GLSpellsImportPanel`,
  `GLLoreGlossaryImportPanel`, `GLSpeciesImportPanel`) en gardent une copie locale identique.
- `formatDateTime` : 5 copies identiques (`toLocaleString('fr-FR')`) dans les cartes de carnet
  FM et GL, plus une variante (`dateStyle: 'short'`) dans `src/utils/moodleAdminReport.js`.

**Remède** : un `src/shared/utils/classNames.js` et un `src/shared/utils/formatDate.js`, et
remplacement des copies par des imports. _Confiance : haute._

**Traité** : `src/shared/utils/classNames.js`, `src/shared/utils/formatDateTime.js`, et les
sept panneaux d'import importent `src/shared/platform/fileToDataUrl.js` — 24 copies retirées.

### 4.4 — MINEUR · Deux routeurs « lieu » qui n'en font qu'un

`routes/map.js` (repères) et `routes/zones.js` (zones) partagent `normalizeLivingBeings`,
`serializeLocationRow` et `mapExists` à l'identique (35 fenêtres) ; `routes/visit/markers.js` et
`routes/visit/zones.js` partagent `resolveAudienceForInsert` / `resolveAudienceForUpdate`
(58 fenêtres sur ~200 lignes chacun). Un `lib/locationRouteHelpers.js` et un
`lib/visitAudienceHelpers.js` suffiraient. _Confiance : haute._

**Traité** : `lib/locationRowHelpers.js` et `lib/visitAudienceWrite.js`.

### 4.5 — MINEUR · Carnet FM et carnet joueur GL : trois composants recopiés

`UserJournalArticleCard` ↔ `GLPlayerJournalArticleCard` (37), `UserJournalView` ↔
`GLPlayerJournalView` (28), `UserJournalImportCard` ↔ `GLPlayerJournalImportCard` (18). Le
correctif récent du carnet (voir `CHANGELOG.md`, « Catalogue de biodiversité ») a dû être pensé
pour un seul côté ; un composant partagé dans `src/shared/journal/` paramétré par le service
d'API éviterait la prochaine divergence. _Confiance : haute._

**Ouvert** : les paires ont divergé au-delà du doublon mécanique (235 lignes sur 332 pour la
carte d'article : classes CSS, boutons, métadonnées propres à chaque produit). Les partager est
un travail de conception (composant paramétré par produit), pas un déplacement de code. Voir §9.

### 4.6 — INFO · Doublons assumés et sains

`src/shared` ↔ `lib/shared` : **identiques** (`diff -rq`, les fichiers présents d'un seul côté
sont propres à un runtime). `lib/visit-pack/`, `lib/gl-pack/`, `lib/term-autolink/` : la
réexécution des scripts `sync:*` ne produit **aucune dérive** (`git status` vide).

### 4.7 — INFO · Dépendances

Les 21 dépendances de production sont toutes importées. `jose` l'est par `import()` dynamique
(`lib/lti/jose.js:7`) — un `grep require('jose')` le rate, ce qui explique qu'on puisse la
croire orpheline. `jsonwebtoken` (sessions) et `jose` (LTI 1.3, JWKS) coexistent à raison :
la seconde est ESM-only et sert la vérification par jeu de clés distant, que la première ne
fait pas.

---

## 5. Performance et charge serveur

### 5.1 — Régime nominal : vérifié, sain

Coût d'un appel API authentifié (`middleware/requireTeacher.js:43-100`) :

| Étape                                       | SQL | Cache                                      |
| ------------------------------------------- | :-: | ------------------------------------------ |
| `jwt.verify` (une fois, mémorisé sur `req`) |  0  | —                                          |
| `users.is_active, token_epoch`              |  1  | aucun — voulu (révocation immédiate)       |
| `buildAuthzPayload` (RBAC)                  |  0  | `rbacLookupCache`, version d'écriture RBAC |
| `getUserAccessibleGroupIds`                 |  0  | `scopeCache`, version d'écriture groupes   |
| Réglages (`getSettingValue`)                |  0  | cache plat versionné                       |

Cycle de polling par poste (`src/hooks/useAppDataSync.js`) : une sonde `GET /api/sync-state`
(aucune requête SQL : compteurs en mémoire), puis **uniquement** les domaines dont le compteur a
bougé. Plancher 90 s en temps réel, 120 s onglet caché, coalescence des appels
(`fetchAllRunPromiseRef`). Pour 75 postes : **~0,8 sonde/s**, quasi sans SQL. Socket.IO en
polling seul par défaut (hébergement mutualisé), `pingInterval` 20 s / `pingTimeout` 60 s,
`connectionStateRecovery` avec ré-hydratation JWT. Limiteur général 1200/min par utilisateur,
`queueLimit` 200 sur le pool, `connectTimeout` borné, `withTransaction` avec garde-fou de durée.
Tous les caches mémoire module ont une borne (`*_CACHE_MAX` 500/1000 avec `clear()`,
`MAX_KEYS` 40 pour CSP, purge des nonces LTI à chaque écriture, `memoryTtlCache` avec TTL et
éviction). Écritures de ressources de jeu (or, vitalité, marché) sous `SELECT … FOR UPDATE`
(`lib/glMarket.js` ×6, `lib/glVitality.js` ×3, `lib/glSpellCast.js` ×2, `lib/glTeamComposition.js` ×3).

### 5.2 — MAJEUR · Les journaux purgés par date n'ont pas d'index sur la date

Lu dans `information_schema.STATISTICS` de la base initialisée :

| Table                      | Colonne filtrée par la purge / les lectures | Index existants                                  |
| -------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `audit_log`                | `created_at` (VARCHAR ISO) — purge          | `(action,id)`, `(actor…,id)`, `(action,target…)` |
| `gl_game_events`           | `created_at` — purge                        | `(game_id,id)`, `(team_id,id)`                   |
| `task_logs`                | `created_at`                                | `(student_id)`, `(student_name)`, `(task_id)`    |
| `gl_action_requests`       | `created_at`                                | `(game_id,status,id)`, `(team_id)`               |
| `gl_forum_posts/threads`   | `created_at`                                | —                                                |
| `gl_market_trade_messages` | `created_at`                                | —                                                |
| `password_reset_tokens`    | `created_at`                                | —                                                |

`scripts/purge-audit-logs.js:61-76` filtre `audit_log` et `gl_game_events` **sur `created_at`** :
chaque passage de purge est un balayage complet de la table la plus grosse du schéma, et pour
`audit_log` la comparaison porte sur un `VARCHAR(32)` formaté — l'index, s'il existait, serait
utilisable (comparaison de chaînes ISO), mais il n'existe pas. `security_events.occurred_at` et
`observation_logs.created_at`, eux, sont indexés : le motif est connu du dépôt, pas appliqué
partout. **Remède** : migration `242` — `CREATE INDEX idx_audit_log_created ON audit_log
(created_at)`, `idx_gl_game_events_created ON gl_game_events (created_at)`,
`idx_task_logs_created ON task_logs (created_at)`. _Confiance : haute (structure lue en base ;
volumétrie prod non mesurée)._

**Traité** : migration `242` (les trois index) et `sql/schema_foretmap.sql` pour `audit_log`.

### 5.3 — MINEUR · `SELECT *` sans projection sur des listes

Hors constats déjà connus (`GET /api/plants`, B5) : `routes/learning-links.js:61,130` et
`routes/gl/learning-links.js:58,131` (liaisons, table petite), `routes/visit.js:659`
(`visit_tutorials`), `lib/tasks/taskQueries.js:313` (`task_assignments` d'une tâche),
`lib/recurringTasks.js:307` (`tasks` récurrentes), `lib/identity.js:50,74` (`users` — renvoie
`password_hash` au code appelant, qui doit penser à le retirer). Aucun n'est chaud ; celui de
`lib/identity.js` mérite une projection par principe (ne pas faire circuler le hachage).
_Confiance : haute._

### 5.4 — MINEUR · `npm audit` : 4 vulnérabilités modérées

| Paquet    | Avis                                       | Exposition ForetMap                                                                                                                                  | Correctif                    |
| --------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `adm-zip` | extraction suit les liens symboliques      | **Non exploitable** : `lib/mascotPackArchive.js:85-99` et `lib/contentLibraryBulk.js:102` lisent `entry.getData()` en mémoire, jamais `extractAllTo` | `npm audit fix` (0.6.x)      |
| `qs` ×2   | contournement `arrayLimit`, DoS `isBuffer` | Parsing de query string d'Express 5 ; borné par le limiteur                                                                                          | `npm audit fix`              |
| `uuid`    | via `exceljs`                              | Génération d'identifiants internes au classeur                                                                                                       | pas de correctif non cassant |

Les deux premiers se ferment sans changement cassant. _Confiance : haute._

**Traité** : `npm audit fix` → `adm-zip 0.6.1`, `qs 6.16.0` ; restent les deux avis `uuid`
via `exceljs`, sans correctif non cassant. _Piège rencontré : `npm audit fix --omit=dev`
**désinstalle les dépendances de développement** du `node_modules` local (ESLint, Vitest…) ;
relancer `npm ci` après._

### 5.5 — MINEUR · Import « carte → visite » : une requête par élément

`routes/visit/sync.js:143-235` — quatre boucles `for … await execute(INSERT … ON DUPLICATE
KEY UPDATE)` par zone puis par repère, hors transaction (celle de `:331` couvre une autre
opération). Une carte de 60 zones + 80 repères coûte 140 requêtes séquentielles, et un échec au
milieu laisse un import partiel. Action d'administration rare : coût acceptable, atomicité
discutable. **Remède** : `INSERT … VALUES (…),(…)` par lots de 100 dans `withTransaction`.
_Confiance : haute._

**Traité** : `insertInBatches` (lots de 100 lignes) dans une seule transaction, pour les deux
sens ; payload de réponse inchangé.

### 5.6 — INFO · Écritures disque synchrones sur le chemin de requête

`fs.*Sync` sur des routes : `routes/visit/mascot.js` (11, listage/copie de sprites),
`lib/mediaLibrary.js` (8, `writeFileSync` des médias), `routes/tutorials.js` (6, lecture HTML
hérité), `routes/students.js:612-617` (`copyFileSync` avatar), `routes/tasks/logs.js:90`
(`unlinkSync`). Routes d'administration à faible fréquence ; aucune sur le chemin de polling.
Piste seulement si les médias grossissent (passage à `fs.promises`).

### 5.7 — INFO · Rendu front

17 composants sous `React.memo`, aucune virtualisation de liste (B2 déjà connu pour le catalogue).
34 avertissements `react-hooks/exhaustive-deps` (§6.3) sont autant de dépendances déclarées à la
main dont chacune est une décision à documenter en commentaire, sinon un bug de rafraîchissement
en attente.

---

## 6. Process et qualité

### 6.1 — `dist/` versionné

342 fichiers `dist/` toujours versionnés (constat 2026-08-26 §4, non tranché). Chaque PR qui
touche le front porte un build ; c'est la première source de conflits de fusion du dépôt.

### 6.2 — Tests

3 tests ignorés à dessein (snapshots opt-in, équivalence XLSX conditionnelle). Un seul routeur
n'est cité par aucun test : `routes/admin-ops.js` (redémarrage/diagnostics, secret `DEPLOY_SECRET`).
Vitest : 296 s dont 60 % en « environment » — le coût est dans le montage jsdom par fichier
(555 fichiers), pas dans les tests ; `isolate: false` ou un regroupement en ferait gagner la
moitié si la CI devient contrainte.

### 6.3 — Lint : 179 avertissements, aucun bloquant

| Règle                                              | Nb  | Lecture                                                    |
| -------------------------------------------------- | :-: | ---------------------------------------------------------- |
| `no-unused-vars`                                   | 57  | nettoyage mécanique                                        |
| `react-hooks/exhaustive-deps`                      | 34  | **à examiner un par un** (dépendance omise = donnée figée) |
| `jsx-a11y/*` (clic sans clavier, rôles, autofocus) | 88  | accessibilité : élèves au clavier / lecteurs d'écran       |

---

## 7. Vérifié et sain

- **SQL paramétré partout** : toutes les interpolations `${…}` relevées dans des requêtes sont des
  listes de colonnes constantes, des fragments choisis par égalité stricte, des listes de `?`
  ou un nom de table de configuration ; `LIMIT`/`OFFSET` proviennent de schémas Zod (P8 connu).
- **Autorisation** (échantillon : routeurs `admin/*`, `rbac`, `students`, `settings`, `gl/admin`) :
  gardes `requireTeacher` / permission présentes ; isolement produit GL ↔ ForetMap (`server.js:486-509`) ; jeton révocable
  (`token_epoch`) rechargé à chaque appel et à chaque reconnexion Socket.IO
  (`skipMiddlewares: false`).
- **Transactions** : une cinquantaine de sites `withTransaction`/`getConnection` ; le helper central rend la
  connexion en `finally`, diffère les bumps de version après `commit`, refuse toute requête
  après le garde-fou de durée.
- **Caches mémoire** : tous bornés et invalidés par version d'écriture (RBAC, scope groupes,
  accès cartes, réglages) ou par TTL ; un seul timer module (`runDailyJobs`), arrêté à
  `gracefulShutdown`.
- **Idempotence des migrations** : `schema_version` évite le rejeu ; les gardes `IF NOT EXISTS`
  et la liste d'errnos tolérés couvrent le rejeu manuel — trop largement, voir §2.1.
- **Front** : `setInterval` (5) et `addEventListener` (4 fichiers sans `remove`) vérifiés :
  soit nettoyés, soit portés par un singleton module ou un document d'iframe jeté avec elle.
- **Dépendances** : 21/21 utilisées ; `jose` chargée dynamiquement ; aucune `high`.

---

## 8. Ordre de traitement suggéré

| #   | Constat                                                                 | Effort | Gain                                               |
| --- | ----------------------------------------------------------------------- | :----: | -------------------------------------------------- |
| 1   | §2.1 durcir le moteur de migrations + migration `242` (`app_settings`)  |  ½ j   | plus aucune migration silencieusement inopérante   |
| 2   | §5.2 index `created_at` (`audit_log`, `gl_game_events`, `task_logs`)    |  ¼ j   | purge et lectures par date sans balayage           |
| 3   | §3.5 `API.md` : Moodle admin + lore admin ; test de rapprochement en CI |  ½ j   | convention du dépôt à nouveau tenue                |
| 4   | §5.4 `npm audit fix` (`adm-zip`, `qs`)                                  |  ¼ h   | 4 → 1 avis                                         |
| 5   | §3.1 / §3.2 `slug.js` + `httpError.js` partagés                         |  ½ j   | fin des homonymes à sémantique divergente          |
| 6   | §4.3 helpers front (`classNames`, `formatDate`, `fileToDataUrl`)        |  ½ j   | −25 copies                                         |
| 7   | §4.4 / §4.5 helpers de routes lieu + composants carnet partagés         |  1 j   | −200 lignes dupliquées, un seul correctif à porter |
| 8   | §4.2 pipeline d'import tableur commun                                   |  2 j   | le plus gros gisement de dette                     |
| 9   | §2.2, §2.3, §2.4, §5.5 (petits correctifs)                              |  ½ j   | —                                                  |

**Méthode reproductible.** Le rapprochement routes ↔ `API.md` est devenu
`tests/api-doc-coverage.test.js` (job CI `quality`, sans base). Le détecteur de doublons
(fenêtres de 10 lignes normalisées) reste un script jetable, à réécrire au besoin.

---

## 9. Suites du 13/09 : ce qui a été traité, ce qui reste, ce qui a été trouvé en chemin

| Lot | État                                                                                       |
| --- | ------------------------------------------------------------------------------------------ |
| 1   | **Traité** — moteur de migrations, `227`/`237` corrigées, migration `242`, test unitaire   |
| 2   | **Traité** — trois index (`242`)                                                           |
| 3   | **Traité** — 14 lignes `API.md`, test de couverture ; constat Moodle retiré (faux)         |
| 4   | **Traité** — `adm-zip`, `qs` ; `uuid`/`exceljs` reste                                      |
| 5   | **Traité** — `slug.js`, `httpError.js`, `mapQueries.js`, `normalizeEmail` (5/6)            |
| 6   | **Traité** — 24 copies front retirées                                                      |
| 7   | **Traité** pour les helpers de routes ; **ouvert** pour les composants carnet (conception) |
| 8   | **Traité** pour les copies identiques ; `buildImportReportBase` laissé (sept formes)       |
| 9   | **Traité** — NUL, N+1, `LIMIT`, import visite par lots                                     |

**Restent ouverts** : §2.5 pour les panneaux chargés une fois au montage (course théorique ;
cinq écrans à entrées variables traités dans un second temps), §4.5 (composants
carnet FM/GL), §5.3 (projections `SELECT *` — `lib/identity.js` alimente aussi le profil et
les visites guidées vues, une projection y demande une relecture des consommateurs), §5.6–5.7
et §6 (process). §4.1 (registre des biomes) a été traité dans un second temps.

### 9.1 — Trouvé en chemin : la CI de `main` était rouge depuis le 11 septembre

Le job `test` échouait à l'étape Playwright `plan-mobile` sur **tous** les runs de `main`
depuis le 11/09 (trente runs consultés), donc aussi sur la PR de cet audit, qui ne touche
que du Markdown. Reproduit en local sur la base laissée par `npm test`, comme en CI. Quatre
causes empilées, dont une régression produit :

1. **Pollution de la base par les tests** — `tests/plan-content.test.js` et
   `tests/map-routes.test.js` « restauraient » `ui.plan.map_id` à la valeur littérale
   `'lyautey'`, une carte qui n'existe pas en base de test ; `tests/tasks-queries-atomic.test.js`
   laissait sa carte `tq-atomic` (tri `0`, sans fond publié). Le plan retombait donc sur cette
   carte, affichait « Aucun fond de plan n'est encore publié » et ne montait jamais la scène
   carte. Corrigé : `tests/helpers/settingsSnapshot.js` (un test restaure ce qu'il a trouvé) et
   nettoyage en `after()`.
2. **Régression produit : le lien profond `?lieu=` était effacé** à l'ouverture d'une fiche
   depuis la feuille de résultats. Les feuilles basses empilent une entrée d'historique et
   reculent d'une entrée à la fermeture (`overlayHistory.js`) ; fermer les résultats après
   `replaceState(?lieu=…)` restaurait l'URL d'avant la recherche. Diagnostiqué ici et corrigé le
   même jour, en parallèle, par la PR #459 (réaffirmation du paramètre après `popstate`, avec
   un test de montage qui rejoue la restauration d'URL) — c'est cette implémentation qui est
   conservée ; la mienne, équivalente, a été retirée à la fusion.
3. **Scénario d'orientation** : il émettait `deviceorientation` alors que le produit écoute
   `deviceorientationabsolute` dès que le navigateur l'expose (Chromium) — le cap n'arrivait
   jamais. Le scénario émet sur les deux noms.
4. **Scénario de position** : il visait le premier lieu du plan, une zone héritée du semis sans
   polygone, donc sans point à viser — « Y aller » ne pouvait pas annoncer de distance. Le
   scénario choisit un lieu géolocalisable. _Reste à noter_ : les zones rectangulaires héritées
   (`x, y, width, height` sans `points`) ne sont pas « visables » par le plan — à convertir
   (`lib/legacyZoneShapeConvert.js`) si le plan Lyautey en contient.

Les quatre scénarios `plan-mobile` passent en local sur la base post-suite ; c'est la CI de la
PR qui tranche.
