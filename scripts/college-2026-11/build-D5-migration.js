#!/usr/bin/env node
'use strict';

/**
 * Génère la migration `college_etiquettes_simples` (flux D5 du chantier collège) à partir des
 * données contrôlées de `data/college-2026-11/D5/` (un fichier par groupe d'usage).
 *
 * Le numéro de la migration n'apparaît que dans le nom de fichier : le script écrit dans le
 * fichier existant `migrations/NNN_college_etiquettes_simples.sql`, quel que soit NNN
 * (renumérotation par SI), ou crée `379_college_etiquettes_simples.sql` s'il n'existe pas.
 *
 * Refuse d'écrire si le contrôle des données (`check-D5-etiquettes.js`) signale une erreur.
 *
 * Usage : node scripts/college-2026-11/build-D5-migration.js [--check]
 *   --check : n'écrit rien, sort en 1 si le fichier versionné diffère de la sortie générée.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadData, runChecks } = require('./check-D5-etiquettes');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_etiquettes_simples.sql';
const DEFAULT_FILE = `379${SUFFIX}`;

/** Littéral SQL (chaîne entre apostrophes, apostrophes doublées, antislash échappé). */
function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function findMigrationFile() {
  const hits = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(SUFFIX));
  if (hits.length > 1) throw new Error(`plusieurs fichiers ${SUFFIX} : ${hits.join(', ')}`);
  return path.join(MIGRATIONS_DIR, hits[0] || DEFAULT_FILE);
}

/** Commentaire SQL sur une ligne (pas de retour à la ligne ni de fin de commentaire). */
function sqlComment(text) {
  return String(text).replace(/[\r\n]+/g, ' ');
}

function buildSql(data = loadData()) {
  const out = [];
  out.push('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;');
  out.push('');
  out.push('-- =====================================================================');
  out.push('-- Étiquettes simples des fiches visibles des élèves (`plants.usage_label`)');
  out.push('-- (chantier collège de novembre 2026, flux D5).');
  out.push('--');
  out.push('-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-D5-migration.js à partir de');
  out.push('-- data/college-2026-11/D5/*.json : ne pas modifier à la main.');
  out.push('--');
  out.push('-- Une étiquette par fiche hors `entity_kind = ressource` : article indéfini + nom');
  out.push('-- commun courant + précision (« une araignée sauteuse »), 40 caractères au plus.');
  out.push('--');
  out.push('-- Gardes : clé naturelle (`plants.name` + `scientific_name` via <=>) ; une étiquette');
  out.push("-- posée dans l'application n'est jamais écrasée (`usage_label IS NULL` attendu) ;");
  out.push(
    '-- une fiche absente (base fraîche) est sautée sans erreur. Idempotent (rejouable deux',
  );
  out.push(
    '-- fois), aucun trigger, aucun DEFINER, aucune table `gl_*`, aucune donnée personnelle.',
  );
  out.push('-- =====================================================================');
  for (const d of data) {
    out.push('');
    out.push(`-- ${sqlComment(d.libelle)} (${d.fiches.length} fiches, ${d.file})`);
    for (const f of d.fiches) {
      out.push(
        `UPDATE plants SET usage_label = ${sqlString(f.usage_label)}` +
          ` WHERE name = ${sqlString(f.name)}` +
          ` AND scientific_name <=> ${sqlString(f.scientific_name ?? null)}` +
          " AND usage_label IS NULL AND NOT (entity_kind <=> 'ressource');",
      );
    }
  }
  out.push('');
  return out.join('\n');
}

module.exports = { buildSql, findMigrationFile, sqlString, SUFFIX };

if (require.main === module) {
  const { errors } = runChecks();
  if (errors.length) {
    process.stderr.write(
      `Données D5 non conformes, migration non générée :\n- ${errors.slice(0, 50).join('\n- ')}\n`,
    );
    process.exit(1);
  }
  const file = findMigrationFile();
  const sql = buildSql();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== sql) {
      process.stderr.write(
        `${path.basename(file)} diffère de la sortie générée : relancer le script.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`${path.basename(file)} à jour.\n`);
  } else {
    fs.writeFileSync(file, sql);
    process.stdout.write(`Écrit : ${path.relative(ROOT, file)}\n`);
  }
}
