# Retraits de schéma, temps 3 — quand et comment supprimer

Procédure des **suppressions différées** de l'audit du 25/09/2026 (§ 3.5, retrait en trois
temps) :

1. **T1** — le code cesse de **lire** l'ancienne structure (avec, au besoin, un repli) ;
2. **T2** — le code cesse de l'**écrire** (ou ne l'écrit plus qu'en **miroir**, pour qu'un retour
   arrière du code retrouve des données à jour) ;
3. **T3** — une migration la **supprime** (`DROP`).

T1 et T2 sont livrés (PR #552 et #555, migrations 300 à 308). Les deux retraits sans aucune
dépendance sont faits par la migration **302** (vue `v_visit_coverage`, valeur `both_changed` de
`sync_conflicts.kind`). Tous les autres attendent : ce document dit **quand** passer au T3 et
**ce que la PR du T3 doit contenir**. Aucune suppression n'est faite ici.

## Règles communes à tous les T3

- **Un cycle de production au moins** entre la mise en production de T1/T2 et le T3, **sans
  retour arrière** du code. Un T3 n'est jamais dans la même PR que son T1/T2.
- **Contrôles au vert** : `npm run db:t3-status` (lecture seule, détail ci-dessous) doit marquer
  le candidat « contrôles au vert ».
- **Sauvegarde vérifiée juste avant**, plus un export des seules tables ou colonnes supprimées
  (commandes plus bas). Serveur MariaDB 11.4 sans droits `SUPER` : dumps **sans** `--databases`,
  `--default-character-set=utf8mb4` sur chaque appel client, pas de `DEFINER`.
- **Retrait du code et suppression dans la même PR** : le miroir, le repli et chaque lecteur
  restant (liste par candidat ci-dessous ; `grep` de la colonne hors `migrations/` et `docs/`
  pour finir), puis une migration **idempotente** qui incrémente `schema_version` (garde
  `information_schema` + `PREPARE` pour un `DROP COLUMN`, `DROP TABLE IF EXISTS` pour une
  table), comme la migration 302.
- **Aucune table `gl_*`**, aucun code propre à Gnomes & Licornes. Le code partagé qui les
  touche est signalé plus bas ; il ne se modifie qu'avec l'accord du mainteneur G&L.

## Étape 1 — Contrôles : `npm run db:t3-status`

Lecture seule, à lancer **sur le serveur**, schéma à jour (sinon le script le dit et s'arrête) :

- avec un terminal : `npm run db:t3-status`, après activation de l'environnement Node
  (`docs/EXPLOITATION.md`, § 1 bis) ;
- **sans terminal** : cPanel → **Setup Node.js App** → **Run JS Script** → `db:t3-status`.

Il affiche, par candidat, chaque contrôle avec sa valeur et la valeur attendue (✓ / ✗), et les
numéros des fiches en écart. Code de sortie : `0` tous au vert, `3` au moins un candidat pas
prêt (ou schéma en retard), `1` erreur. Les contrôles sont définis dans
`lib/schemaRetirements.js` ; les replis y sont comptés **avec les résolveurs du code**, donc une
fiche « encore lue dans les anciennes colonnes » est exactement une fiche que l'application lit
encore là.

Sans Node du tout, les contrôles SQL de chaque section se collent dans phpMyAdmin (onglet SQL).

## Étape 2 — Sauvegarde et export ciblé

```bash
set -a; . ./.env; set +a
bash scripts/db-backup.sh --label avant-t3          # vérifie l'archive et la marque de fin
# Export des seules structures supprimées (exemple : photos des fiches) :
MYSQL_PWD="$DB_PASS" mariadb-dump --default-character-set=utf8mb4 --single-transaction \
  --no-tablespaces --skip-triggers -h "${DB_HOST:-localhost}" -u "$DB_USER" "$DB_NAME" \
  plants > ~/avant-t3-plants.sql
tail -n 1 ~/avant-t3-plants.sql                     # « -- Dump completed … »
```

Pour une table entière, la nommer à la place de `plants` (plusieurs tables possibles).

## Étape 3 — Candidats

| Candidat                                                      | T1 et T2 livrés par           | Contrôles de passage (tous à 0)                                                   | Mesure sur le fixture anonymisé                     |
| ------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `quiz_question_species`, `quiz_question_tutorials`            | migration 300                 | liens absents de `resource_question_links`                                        | 0 et 0                                              |
| 6 colonnes photo de `plants`, `photo_credit`, `photo_licence` | migration 303                 | fiches lues en repli ; photos sans auteur ou licence (hors domaine public et CC0) | 0 ; **119** photos sans attribution                 |
| `plants.second_name`                                          | migration 304                 | fiches dont les autres noms ne sont pas tous dans `plant_name_aliases`            | **1** (fiche 325)                                   |
| `plants.remark_1`, `remark_2`, `remark_3`                     | migration 305                 | fiches dont `remarks` ne reprend pas les trois anciens champs                     | 0                                                   |
| `zones.current_plant`, `map_markers.plant_name`               | migration 306                 | zones avec un ancien nom ; repères dont l'ancien nom n'est pas rattaché           | 0 ; 0                                               |
| `zones.stage`                                                 | lot terrain (sans migration)  | zones `special` sans le drapeau `special`                                         | 0 (47 zones à valeur autre que `empty`, à archiver) |
| `zone_history`                                                | lot terrain (sans migration)  | — (export de la table)                                                            | 1 ligne à exporter                                  |
| `observation_logs`, `user_journal_observation_map`            | migration 307 (routes en 410) | anciennes observations non recopiées dans le carnet                               | 0                                                   |
| `quiz_questions.difficulte_label`                             | lot quiz (sans migration)     | libellés qui ne se déduisent pas de la difficulté                                 | 0                                                   |

Les mesures viennent de la base de recette anonymisée migrée jusqu'à 305-307 (le 27/09/2026), pas
de la production : seul `db:t3-status` lancé sur le serveur fait foi.

### Liens question ↔ ressource (`quiz_question_species`, `quiz_question_tutorials`)

- **État** : plus lues ni écrites ; `resource_question_links` est la seule source.
- **T3** : `DROP TABLE IF EXISTS quiz_question_species; DROP TABLE IF EXISTS quiz_question_tutorials;`
- **À retirer dans la même PR** : leur mention dans `SYNC_IGNORED_TABLES_RE` (`database.js`) —
  **ligne partagée avec les tables `gl_*`**, à modifier avec l'accord du mainteneur G&L ; les
  contrôles d'alignement (`tests/content/pedago-tutorial-links.test.js`,
  `tests/content/learning-links-single-source.test.js`) et les tests qui simulent une base
  d'avant la bascule (`tests/learning-links-sheet.test.js`,
  `tests/learning-links-migration-300.test.js`).
- **Export** : `quiz_question_species quiz_question_tutorials` (étape 2).
- **Retour arrière** : recréer les tables (DDL de la migration 128) et recharger l'export ; à
  défaut, les reconstruire depuis `resource_question_links` (requête dans la migration 300).

### Photos des fiches (8 colonnes de `plants`)

- **État** : la fiche lit `plant_photos` ; formulaire, téléversement, import et préremplissage
  l'écrivent, crédit et licence compris ; les colonnes sont tenues **en miroir**.
- **Avant le T3** : compléter l'auteur et la licence des photos qui n'en ont pas, depuis le
  formulaire de la fiche (liste : `SELECT plant_id, kind, url FROM plant_photos WHERE (credit
IS NULL OR licence IS NULL) AND COALESCE(licence, '') NOT IN ('Public domain', 'CC0')`).
- **T3** : `ALTER TABLE plants DROP COLUMN photo, DROP COLUMN photo_species, DROP COLUMN
photo_leaf, DROP COLUMN photo_flower, DROP COLUMN photo_fruit, DROP COLUMN photo_harvest_part,
DROP COLUMN photo_credit, DROP COLUMN photo_licence;` (une garde par colonne).
- **À retirer dans la même PR** : miroir et repli de `lib/biodiv/plantPhotos.js`
  (`mirrorColumnsFromPhotoRows`, `photoColumnsMatchRows`, branche « colonnes » de
  `resolvePlantPhotos`) et de `lib/biodiv/speciesService.js` ; l'image du carnet
  (`lib/fmUserJournal.js`) ; `scripts/resolve-plants-photo-direct-links.js` ; le seed de
  démonstration de `database.js` ; `scripts/import-plants-enriched.js` et
  `scripts/extract-biodiv-pedago-seed.js` s'ils nomment encore ces colonnes.
- **Retour arrière** : recharger l'export des colonnes ; la table, elle, reste.

### Autres noms (`plants.second_name`)

- **État** : la fiche, la recherche du catalogue, la reprise éditoriale des liens et la
  recherche du carnet lisent `plant_name_aliases` (`kind = 'nom_secondaire'`) ; la colonne est
  tenue en miroir (noms séparés par « , »).
- **Avant le T3** : trancher la fiche **325** : son autre nom « Abeille charpentière » est le
  nom d'une **autre fiche** (557). Soit les deux fiches sont un doublon (fusionner), soit le nom
  est retiré des autres noms de la fiche 325. `db:t3-status` donne la liste à jour.
- **T3** : `ALTER TABLE plants DROP COLUMN second_name;`
- **À retirer dans la même PR** : miroir et repli (`lib/biodiv/plantNames.js`,
  `secondNameMirror`, branche « colonnes » de `resolvePlantNames`), `lib/plantsRouteHelpers.js`,
  le préremplissage (`lib/speciesAutofill*.js`, `src/utils/plantPrefillApply.js`), l'import
  (`src/components/biodiv/PlantImportPanel.jsx`, `scripts/import-biodiv-pedago.js`),
  `scripts/suggest-learning-links.js`, le seed de `database.js`.

### Remarques (`plants.remark_1..3`)

- **État** : la fiche lit `remarks` (une seule zone de texte) ; les trois anciens champs sont
  tenus en miroir (intacts si le texte est leur concaténation exacte, sinon tout en `remark_1`).
- **T3** : `ALTER TABLE plants DROP COLUMN remark_1, DROP COLUMN remark_2, DROP COLUMN remark_3;`
- **Contrôle complémentaire** (même nombre de fiches à remarque avant et après) :
  ```sql
  SELECT COUNT(*) FROM plants WHERE NULLIF(TRIM(remark_1),'') IS NOT NULL
      OR NULLIF(TRIM(remark_2),'') IS NOT NULL OR NULLIF(TRIM(remark_3),'') IS NOT NULL;
  SELECT COUNT(*) FROM plants WHERE NULLIF(TRIM(remarks),'') IS NOT NULL;
  ```
  (330 et 330 sur le fixture).
- **À retirer dans la même PR** : miroir et repli (`lib/biodiv/plantRemarks.js`,
  `lib/biodiv/speciesReadModel.js`), `lib/plantsRouteHelpers.js`, l'entrée `remark_1..3` du
  contrôle des textes visiteurs (`lib/visitorTextCorpus.js` — entrée séparée exprès, elle
  serait sinon sautée sans bruit), `src/components/biodiv/PlantImportPanel.jsx`,
  `src/components/map/LivingBeingsCatalogPanel.jsx`, `src/utils/plantFormValues.js`, le seed
  de `database.js`.

### Anciens noms mono-espèce des lieux (`zones.current_plant`, `map_markers.plant_name`)

- **État** : plus lus ni écrits, plus renvoyés par l'API ; la migration 306 a rattaché les noms
  identifiables aux jonctions `zone_species` / `marker_species`.
- **T3** : `ALTER TABLE zones DROP COLUMN current_plant; ALTER TABLE map_markers DROP COLUMN plant_name;`
- **À retirer dans la même PR** : `lib/legacyZoneShapeConvert.js`,
  `lib/sqliteGardenSqlExport.js`, `scripts/migrate-sqlite-to-mysql.js`,
  `scripts/gen-zones-lyautey-batiments.js`, le seed de `database.js`.

### État de culture des zones (`zones.stage`) et historique (`zone_history`)

- **État** : plus lus ni écrits par l'application (le caractère « infrastructure » vit dans les
  catégories).
- **Archiver avant** : `SELECT stage, COUNT(*) FROM zones GROUP BY stage;` (résultat à coller
  dans la PR) et l'export de `zone_history`.
- **T3** : `ALTER TABLE zones DROP COLUMN stage; DROP TABLE IF EXISTS zone_history;`
- **À retirer dans la même PR** : `lib/legacyZoneShapeConvert.js`,
  `lib/sqliteGardenSqlExport.js`, `scripts/migrate-sqlite-to-mysql.js`,
  `scripts/gen-zones-lyautey-batiments.js`, `scripts/purge-audit-logs.js` (`zone_history`), le
  seed de `database.js`.

### Ancien carnet (`observation_logs`, `user_journal_observation_map`)

- **État** : routes `/api/observations/*` en **410 Gone** ; plus aucune écriture (la clé
  étrangère détache le groupe supprimé, les lignes partent avec le compte).
- **Avant le T3** : vérifier que les fichiers `uploads/observations/` hors
  `observations/species/` sont soit référencés par `user_journal_article_assets` (recopiés dans
  le carnet), soit orphelins (`npm run db:uploads:reconcile:dry`, simulation, les liste).
- **T3** : `DROP TABLE IF EXISTS user_journal_observation_map; DROP TABLE IF EXISTS observation_logs;`
- **À retirer dans la même PR** : `routes/observations.js` et son montage (`server.js`), le
  nettoyeur de compte (`lib/observations/accountCleaners.js`, déjà réduit aux photos
  d'observations d'espèces), la reprise dans le carnet (`lib/fmUserJournal.js`,
  `routes/user-journal.js`), `lib/sqliteGardenSqlExport.js`, `scripts/anonymize-local-db.js`,
  la source `observation_logs` de `scripts/reconcile-orphan-uploads.js`.

### Libellé de difficulté des questions (`quiz_questions.difficulte_label`)

- **État** : plus lu ; le libellé se déduit de `difficulte` (`quizDifficulteLabel`,
  `lib/shared/pedagoEnums.js`) et n'est plus écrit que dérivé, en miroir.
- **T3** : `ALTER TABLE quiz_questions DROP COLUMN difficulte_label;`
- **À retirer dans la même PR** : l'écriture dérivée côté ForêtMap (`lib/fmQuizCrud.js`,
  `lib/fmQuizImport.js`), `src/utils/fmQuizEditorForm.js`.
- **Code partagé avec G&L — à signaler, pas à modifier seul** :
  `lib/shared/questionCrudCore.js` normalise `difficulte_label` pour les deux produits, et les
  questions G&L ont leur propre colonne du même nom. Le T3 ForêtMap ne doit pas changer ce
  cœur partagé ; s'il le fallait, accord du mainteneur G&L d'abord.

## Hors de ce runbook

- `groups.pedago_level`, `maps.pedago_level` : plan en trois temps écrit dans la migration 301,
  **T1 pas encore commencé**.
- `plants.taxon_group` (remplacé par `clades`), contrainte `CHECK` sur `hazard_reviewed` : voir
  l'audit, § 3.5 ; pas encore engagés.
- Tables récentes (`id_keys*`, `tracked_individuals`, `individual_measurements`, `user_rewards`,
  `pedago_session_runs`) : **ne pas retirer** (décision 19 : adoptées, activables par
  interrupteur).
