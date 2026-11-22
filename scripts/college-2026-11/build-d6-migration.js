#!/usr/bin/env node
'use strict';

/**
 * Génère la migration « college_especes_phares » (flux D6 du chantier collège) à partir des
 * fichiers de données `data/college-2026-11/d6/*.json`.
 *
 *   node scripts/college-2026-11/build-d6-migration.js          # écrit le fichier
 *   node scripts/college-2026-11/build-d6-migration.js --check  # vérifie qu'il est à jour
 *
 * Le numéro de la migration n'apparaît que dans le nom du fichier : le script écrit dans le
 * fichier existant qui porte le suffixe `_college_especes_phares.sql`, quel que soit son
 * numéro (renumérotation par SI) ; à défaut, il crée `379_college_especes_phares.sql`.
 *
 * Les espèces sont désignées par clé naturelle (nom + nom scientifique) : les `id` diffèrent
 * entre la production et une base fraîche. Une ligne dont la fiche ou la présence manque ne
 * fait rien. Gardes « ne jamais écraser une modification faite dans l'application » :
 *   - `map_species.is_featured` passe de 0 à 1 seulement (`AND ms.is_featured = 0`) ;
 *   - `plants.description_college` n'est posée que si elle est encore vide (`IS NULL`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { checkD6, loadData } = require('./check-d6-donnees');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_especes_phares.sql';
const SUFFIX_RE = /^\d+_college_especes_phares\.sql$/;

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function naturalKey(alias, e) {
  const p = alias ? `${alias}.` : '';
  return `${p}name = ${sqlString(e.name)} AND ${p}scientific_name <=> ${sqlString(e.scientific_name)}`;
}

function buildSql(data = loadData()) {
  const { phares, descriptions } = data;
  const lines = [];
  lines.push('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;');
  lines.push('');
  lines.push('-- =====================================================================');
  lines.push(
    '-- Chantier collège (novembre 2026), flux D6 : espèces phares et descriptions collège.',
  );
  lines.push('--');
  lines.push('-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d6-migration.js à partir de');
  lines.push('-- data/college-2026-11/d6/*.json : ne pas modifier à la main.');
  lines.push('--');
  lines.push('--   1. `map_species.is_featured` = 1 pour 12 à 20 espèces par carte (registre de');
  lines.push("--      présence) : visibles à l'œil nu ou à la boîte-loupe, communes, présence");
  lines.push('--      attendue de préférence, groupes variés, aucune espèce toxique ou mortelle.');
  lines.push('--   2. `plants.description_college` : deux phrases courtes (35 mots au plus) pour');
  lines.push(
    '--      chaque espèce phare, une seule par espèce même présente sur plusieurs cartes.',
  );
  lines.push('--');
  lines.push('-- Clé naturelle (nom + nom scientifique) : une fiche ou une présence absente est');
  lines.push('-- sautée sans erreur. Gardes : is_featured passe de 0 à 1 seulement ; la');
  lines.push("-- description n'est posée que si elle est vide (une saisie dans l'application est");
  lines.push('-- conservée). Idempotent, rejouable ; aucun trigger, aucun DEFINER, aucune donnée');
  lines.push('-- personnelle, aucune table `gl_*`.');
  lines.push('-- =====================================================================');
  lines.push('');
  lines.push('-- 1. Espèces phares par carte');

  for (const mapId of Object.keys(phares.cartes).sort()) {
    const liste = phares.cartes[mapId];
    lines.push('');
    lines.push(`-- ${mapId} : ${liste.length} espèce(s)`);
    lines.push('UPDATE map_species ms');
    lines.push('  JOIN plants p ON p.id = ms.plant_id');
    lines.push('   SET ms.is_featured = 1');
    lines.push(` WHERE ms.map_id = ${sqlString(mapId)}`);
    lines.push('   AND ms.is_featured = 0');
    lines.push('   AND (');
    liste.forEach((e, i) => {
      lines.push(`     ${i === 0 ? '   ' : 'OR '}(${naturalKey('p', e)})`);
    });
    lines.push('   );');
  }

  lines.push('');
  lines.push('-- 2. Descriptions collège (une par espèce phare)');
  const especes = [...descriptions.especes].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );
  for (const d of especes) {
    lines.push('');
    lines.push(`UPDATE plants SET description_college = ${sqlString(d.description_college)}`);
    lines.push(` WHERE ${naturalKey('', d)}`);
    lines.push('   AND description_college IS NULL;');
  }
  lines.push('');
  return lines.join('\n');
}

function migrationPath() {
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX_RE.test(f));
  if (existing.length > 1) {
    throw new Error(`Plusieurs fichiers *${SUFFIX} : ${existing.join(', ')}`);
  }
  return path.join(MIGRATIONS_DIR, existing[0] || `379${SUFFIX}`);
}

module.exports = { buildSql, migrationPath, sqlString, SUFFIX_RE };

if (require.main === module) {
  const errors = checkD6();
  if (errors.length) {
    console.error('Données D6 non conformes, migration non générée :');
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }
  const target = migrationPath();
  const sql = buildSql();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== sql) {
      console.error(`${path.basename(target)} n'est pas à jour : relancer le générateur.`);
      process.exit(1);
    }
    console.log(`${path.basename(target)} à jour.`);
  } else {
    fs.writeFileSync(target, sql);
    console.log(`Écrit : migrations/${path.basename(target)}`);
  }
}
