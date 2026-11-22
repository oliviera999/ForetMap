#!/usr/bin/env node
'use strict';

/**
 * Génère la migration `college_groupes_usage` (flux D2 du chantier collège) à partir des
 * données contrôlées de `data/college-2026-11/D2/`.
 *
 * Le numéro de la migration n'apparaît que dans le nom de fichier : le script écrit dans le
 * fichier existant `migrations/NNN_college_groupes_usage.sql`, quel que soit NNN (renumérotation
 * par SI), ou crée `379_college_groupes_usage.sql` s'il n'existe pas.
 *
 * Refuse d'écrire si le contrôle des données (`check-D2-donnees.js`) signale une erreur.
 *
 * Usage : node scripts/college-2026-11/build-D2-migration.js [--check]
 *   --check : n'écrit rien, sort en 1 si le fichier versionné diffère de la sortie générée.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadData, runChecks, snapshotAvailable } = require('./check-D2-donnees');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_groupes_usage.sql';
const DEFAULT_FILE = `379${SUFFIX}`;

/** Littéral SQL (chaîne entre apostrophes, apostrophes doublées, antislash échappé). */
function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`entier attendu : ${value}`);
  return String(n);
}

function findMigrationFile() {
  const hits = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(SUFFIX));
  if (hits.length > 1) throw new Error(`plusieurs fichiers ${SUFFIX} : ${hits.join(', ')}`);
  return path.join(MIGRATIONS_DIR, hits[0] || DEFAULT_FILE);
}

function buildSql(data = loadData()) {
  const out = [];
  out.push('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;');
  out.push('');
  out.push('-- =====================================================================');
  out.push("-- Groupes d'usage de l'arbre des clades et ordres d'insectes manquants");
  out.push('-- (chantier collège de novembre 2026, flux D2).');
  out.push('--');
  out.push('-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-D2-migration.js à partir de');
  out.push('-- data/college-2026-11/D2/*.json : ne pas modifier à la main.');
  out.push('--');
  out.push(
    '--   1. Arbre collège : `clades.visible_college = 1`, `label_simple` et `attribute_simple`',
  );
  out.push('--      (attribut observable en mots simples) sur les boîtes gardées au collège.');
  out.push(
    "--   2. Quatre ordres d'insectes (Orthoptères, Dermaptères, Mantes, Névroptères), créés",
  );
  out.push('--      sous `insectes`, non visibles au collège (vérifiés sur GBIF).');
  out.push('--   3. Rattachement des fiches concernées à ces ordres.');
  out.push('--');
  out.push(
    '-- Gardes : clé naturelle (`clades.id`, `plants.scientific_name`) ; une valeur posée dans',
  );
  out.push("-- l'application n'est jamais écrasée (colonne NULL / 0 attendue, ancien `clade_id`");
  out.push(
    '-- attendu via <=>) ; une ligne dont le parent manque est sautée sans erreur (base fraîche).',
  );
  out.push(
    '-- Idempotent (rejouable deux fois), aucun trigger, aucun DEFINER, aucune table `gl_*`,',
  );
  out.push('-- aucune donnée personnelle.');
  out.push('-- =====================================================================');
  out.push('');
  out.push('-- 1. Arbre collège');
  for (const b of data.arbre) {
    const id = sqlString(b.id);
    out.push('');
    out.push(`-- ${b.id} : ${b.label_simple}`);
    out.push(`UPDATE clades SET visible_college = 1 WHERE id = ${id} AND visible_college = 0;`);
    out.push(
      `UPDATE clades SET label_simple = ${sqlString(b.label_simple)} WHERE id = ${id} AND label_simple IS NULL;`,
    );
    out.push(
      `UPDATE clades SET attribute_simple = ${sqlString(b.attribute_simple)} WHERE id = ${id} AND attribute_simple IS NULL;`,
    );
  }
  out.push('');
  out.push("-- 2. Ordres d'insectes manquants (non visibles au collège)");
  for (const n of data.insectes) {
    out.push('');
    out.push(`-- ${n.id} : ${n.latin} (GBIF ${n.gbif_key})`);
    out.push(
      'INSERT INTO clades (id, parent_id, name, shared_attribute, description, sort_order, visible_college)',
    );
    out.push(
      `SELECT ${sqlString(n.id)}, p.id, ${sqlString(n.name)}, ${sqlString(n.shared_attribute)}, ${sqlString(n.description)}, ${sqlInt(n.sort_order)}, 0`,
    );
    out.push(`  FROM clades p`);
    out.push(` WHERE p.id = ${sqlString(n.parent_id)}`);
    out.push(`   AND NOT EXISTS (SELECT 1 FROM clades c WHERE c.id = ${sqlString(n.id)});`);
  }
  out.push('');
  out.push("-- 3. Rattachement des fiches (garde sur l'ancien clade)");
  for (const d of data.deplacements) {
    out.push('');
    out.push(`-- ${d.name} : ${d.avant} -> ${d.apres}`);
    out.push(`UPDATE plants SET clade_id = ${sqlString(d.apres)}`);
    out.push(` WHERE scientific_name = ${sqlString(d.scientific_name)}`);
    out.push(`   AND clade_id <=> ${sqlString(d.avant)}`);
    out.push(`   AND EXISTS (SELECT 1 FROM clades c WHERE c.id = ${sqlString(d.apres)});`);
  }
  out.push('');
  return out.join('\n');
}

module.exports = { buildSql, findMigrationFile, sqlString, SUFFIX };

if (require.main === module) {
  // Sans l'instantané (absent de `main`), seuls les contrôles croisés sont sautés.
  const { errors } = snapshotAvailable() ? runChecks() : { errors: [] };
  if (errors.length) {
    process.stderr.write(
      `Données D2 non conformes, migration non générée :\n- ${errors.join('\n- ')}\n`,
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
