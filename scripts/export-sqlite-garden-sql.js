#!/usr/bin/env node
/**
 * Exporte zones + repères depuis un fichier SQLite (fork foretmap.db) vers un script SQL MySQL.
 *
 * Usage :
 *   node scripts/export-sqlite-garden-sql.js --sqlite "C:\Users\...\foretmap.db"
 *   node scripts/export-sqlite-garden-sql.js --sqlite foretmap.db --out data/import/foret-comestible-garden.sql
 *   npm run export:sqlite-garden -- --sqlite "C:\Users\olivi\Downloads\foretmap.db"
 *
 * Options :
 *   --sqlite <path>   Fichier SQLite source (défaut : foretmap.db à la racine)
 *   --out <path>      Fichier SQL de sortie (défaut : data/import/foret-comestible-garden.sql)
 *   --map-id <id>     Carte cible (défaut : foret)
 *   --no-replace      N'ajoute pas les DELETE avant INSERT
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { buildGardenImportSql } = require('../lib/sqliteGardenSqlExport');

function parseArgs(argv) {
  const opts = {
    sqlite: path.resolve(process.cwd(), 'foretmap.db'),
    out: path.resolve(process.cwd(), 'data/import/foret-comestible-garden.sql'),
    mapId: 'foret',
    replaceMap: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sqlite' && argv[i + 1]) {
      opts.sqlite = path.resolve(argv[++i]);
    } else if (arg === '--out' && argv[i + 1]) {
      opts.out = path.resolve(argv[++i]);
    } else if (arg === '--map-id' && argv[i + 1]) {
      opts.mapId = String(argv[++i]).trim();
    } else if (arg === '--no-replace') {
      opts.replaceMap = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 16).join('\n'));
      process.exit(0);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.sqlite)) {
    console.error('Fichier SQLite introuvable:', opts.sqlite);
    process.exit(1);
  }
  const sqlite = new Database(opts.sqlite, { readonly: true });
  try {
    const result = buildGardenImportSql(sqlite, {
      mapId: opts.mapId,
      replaceMap: opts.replaceMap,
    });
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, result.sql, 'utf8');
    console.log(`Export SQL : ${opts.out}`);
    console.log(`  carte : ${result.mapId}`);
    console.log(`  zones : ${result.counts.zones}`);
    console.log(`  repères : ${result.counts.markers}`);
    if (result.skipped.zones.length || result.skipped.markers.length) {
      console.warn('  ignorés :', result.skipped.zones.length, 'zone(s),', result.skipped.markers.length, 'repère(s)');
    }
  } finally {
    sqlite.close();
  }
}

main();
