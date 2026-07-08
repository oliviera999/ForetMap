---
name: foretmap-database
description: Conventions base de données ForetMap (schéma MySQL, migrations idempotentes, helpers SQL). À utiliser pour modifier le schéma, ajouter une migration, toucher database.js / initDatabase() / migrations / sql, ou écrire des requêtes et helpers SQL.
---

# Base de données ForetMap

## Accès

- Pool `mysql2/promise` dans `database.js` (compatible MariaDB). Fonctions :
  `queryAll(sql, params)`, `queryOne(sql, params)`, `execute(sql, params)` — **toujours `await`**.
- **Paramètres `?` uniquement** (jamais d'interpolation de chaînes). `result.insertId` après INSERT.
- UUIDs métier via `uuid.v4()`. Helpers métier dans `lib/helpers.js`.

## Migrations

- Schéma appliqué au démarrage via `initDatabase()` ; DDL dans `sql/schema_foretmap.sql` et
  fichiers `migrations/NNN_description.sql` (numérotation continue).
- **Numéros uniques obligatoires** : `database.js` (`assertNoNewDuplicateMigrationNumbers`)
  fait échouer le démarrage si un numéro apparaît deux fois. Seuls **021** et **037** sont
  tolérés (doublons historiques, `LEGACY_DUPLICATE_MIGRATION_NUMBERS`) — ne jamais en créer
  de nouveaux, ne pas renuméroter les anciens. Garde couverte par `tests/migrations-guard.test.js`.
- **Idempotence obligatoire** : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, ou catch
  des errnos attendus (1050 table, 1060 colonne, 1061 index).
- **Pas de migration destructive** (DROP) sans avertissement explicite + note `docs/EVOLUTION.md`.
- Documenter toute migration dans `CHANGELOG.md` (`[Non publié]`).

## Variables d'environnement

`DB_HOST` (localhost), `DB_PORT` (3306), `DB_USER`, `DB_PASS`, `DB_NAME`, `TEST_DB_NAME`
(surcharge en test). Secrets dans `.env` (non versionné).

## Import dump distant (PII)

- `npm run db:import:dump -- --file "<dump.sql>"` (recrée la base puis importe), enchaîner
  `npm run db:migrate`. **Ne jamais versionner un dump.** L’élévation par PIN a été supprimée : un
  compte prof connecté a directement les droits de son rôle (`npm run db:seed:teacher` pour un compte local connu).

## Voir aussi

`.cursor/skills/foretmap-database/SKILL.md`, `docs/EVOLUTION.md` (§ migrations), skill `foretmap-testing`.
