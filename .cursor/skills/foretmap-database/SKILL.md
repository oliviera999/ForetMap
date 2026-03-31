---
name: foretmap-database
description: Centralise les conventions BDD ForetMap (schéma MySQL, migrations, helpers SQL). À utiliser quand on modifie le schéma, ajoute une migration, touche database.js, initDatabase(), ou les fichiers sql/.
---

# Base de données ForetMap

## Quand utiliser ce skill

- Modification du schéma MySQL (ajout de table, colonne, index).
- Ajout ou correction d'une migration.
- Travail sur `database.js` ou `sql/schema_foretmap.sql`.
- Écriture de requêtes SQL complexes ou de helpers dans `lib/helpers.js`.

## Quand ne pas l'utiliser

- Routes API sans changement de schéma : préférer **foretmap-project** ou **foretmap-backend** (rule).
- Évolutions globales (sécurité, architecture) : préférer **foretmap-evolution**.

## Architecture BDD

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Pool MySQL | `database.js` | `mysql2/promise`, pool configuré via `.env` |
| Fonctions d'accès | `database.js` | `queryAll(sql, params)`, `queryOne(sql, params)`, `execute(sql, params)` |
| Helpers métier | `lib/helpers.js` | `getTaskWithAssignments(taskId)`, `studentStats(studentId)` |
| Schéma DDL | `sql/schema_foretmap.sql` | Tables, index, contraintes |
| Init | `database.js` → `initDatabase()` | Applique le schéma + seed si tables vides |

## Conventions SQL

- **Toujours** utiliser des paramètres `?` (requêtes paramétrées). Jamais d'interpolation de chaînes.
- Après un `execute` (INSERT), utiliser `result.insertId` pour récupérer l'ID généré.
- Les fonctions d'accès à la BDD sont **async** ; toujours `await`.
- UUIDs générés via `uuid.v4()` côté Node pour les identifiants métier.

## Migrations

### Situation actuelle

- Le schéma est appliqué au démarrage via `initDatabase()`.
- Les migrations sont idempotentes : `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` avec catch des errnos MySQL attendus (1050, 1060, 1061 = table/colonne/index déjà existants).
- Les erreurs inattendues sont loguées en `warn` via Pino ; les déjà-appliquées en `debug`.

### Règles pour les nouvelles migrations

1. Ajouter les nouveaux `ALTER TABLE` / `CREATE TABLE` dans `sql/schema_foretmap.sql` ou dans un fichier dédié `sql/migrations/NNN_description.sql`.
2. Rendre chaque instruction idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` ou catch errno 1060).
3. **Pas de migration destructive** (DROP TABLE/COLUMN) sans avertissement explicite et documentation dans `docs/EVOLUTION.md`.
4. Documenter la migration dans `CHANGELOG.md` (section `[Non publié]`).

### Évolution à terme (voir docs/EVOLUTION.md § 3.2)

- Table `schema_version` pour tracer les migrations appliquées.
- Scripts de migration versionnés (`sql/migrations/001_xxx.sql`, `002_yyy.sql`).

## Variables d'environnement BDD

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DB_HOST` | `localhost` | Hôte MySQL |
| `DB_PORT` | `3306` | Port MySQL |
| `DB_USER` | — | Utilisateur MySQL |
| `DB_PASS` | — | Mot de passe MySQL |
| `DB_NAME` | — | Nom de la base |
| `TEST_DB_NAME` | — | Nom BDD de test (surcharge `DB_NAME` dans les tests) |

## Import d'un dump SQL distant (copie prod -> local)

- Utiliser `npm run db:import:dump -- --file "<chemin dump.sql>"`.
- Le script reconstruit d'abord `DB_NAME` (`DROP DATABASE` + `CREATE DATABASE`) puis importe le SQL en multi-statements.
- Enchaîner avec `npm run db:migrate` pour rattraper les migrations éventuelles absentes du dump.
- **Ne jamais versionner** le dump (données réelles / PII).
- Après import, le PIN effectif est stocké dans `role_pin_secrets` : `TEACHER_PIN` seul ne suffit pas.
- Pour réaligner le local sur `.env`, utiliser `npm run db:reset:role-pins:local` (puis `npm run db:seed:teacher` si besoin d'un compte prof connu).

## Voir aussi

- Règle backend : `.cursor/rules/foretmap-backend.mdc`
- Feuille de route : [docs/EVOLUTION.md](docs/EVOLUTION.md) § 3.1, § 3.2
- Tests : `.cursor/skills/foretmap-tests/SKILL.md`
