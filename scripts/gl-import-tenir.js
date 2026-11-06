#!/usr/bin/env node
'use strict';

/**
 * Chargeur des fichiers de données « Tenir à deux » (`data/gl/tenir/*.json`).
 *
 *   npm run gl:import:tenir -- --fichier tous            # tout, dans l'ordre
 *   npm run gl:import:tenir -- --fichier chasse-zones    # un seul fichier
 *   npm run gl:import:tenir -- --fichier tous --dry-run  # valide, n'écrit rien
 *   npm run gl:import:tenir -- --fichier reglages-defaut --forcer   # écrase les réglages
 *   npm run gl:import:tenir -- --fichier tous --dossier data/gl/tenir/exemple
 *
 * Ordre : reglages-defaut → sorts → chasse-zones → questions-lecture → le reste.
 * Idempotent (voir lib/glTenirImport.js). Code de sortie 1 au premier fichier refusé.
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { IMPORTERS, IMPORT_ORDER } = require('../lib/glTenirImport');

function parseArgs(argv) {
  const args = {
    fichier: 'tous',
    dryRun: false,
    forcer: false,
    dossier: path.join(process.cwd(), 'data', 'gl', 'tenir'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw === '--forcer') args.forcer = true;
    else if (raw === '--fichier') args.fichier = String(argv[i + 1] || 'tous');
    else if (raw.startsWith('--fichier=')) args.fichier = raw.slice('--fichier='.length);
    else if (raw === '--dossier') args.dossier = path.resolve(String(argv[i + 1] || ''));
    else if (raw.startsWith('--dossier='))
      args.dossier = path.resolve(raw.slice('--dossier='.length));
  }
  return args;
}

function readJson(dossier, name) {
  const file = path.join(dossier, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Charge une liste de fichiers avec `db` (module database ou transaction).
 * @returns {Promise<Array<object>>} rapports
 */
async function runImports(db, { fichier = 'tous', dryRun = false, forcer = false, dossier }) {
  const names = fichier === 'tous' ? IMPORT_ORDER : [fichier];
  const reports = [];
  const titres = readJson(dossier, 'titres');
  const zones = readJson(dossier, 'chasse-zones');
  for (const name of names) {
    const importer = IMPORTERS[name];
    if (!importer) throw new Error(`Fichier inconnu : ${name}`);
    const json = readJson(dossier, name);
    if (!json) {
      reports.push({
        fichier: name,
        errors: [`fichier ${name}.json absent de ${dossier}`],
        count: 0,
      });
      continue;
    }
    const rep = await importer(db, json, { dryRun, forcer, titres, zones });
    reports.push(rep);
    if (rep.errors.length) break;
  }
  return reports;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const database = require('../database');
  await database.initSchema();
  const reports = await runImports(database, args);
  let failed = false;
  for (const rep of reports) {
    const status = rep.errors.length ? 'REFUSÉ' : args.dryRun ? 'dry-run OK' : 'OK';
    console.log(
      `[gl-import-tenir] ${rep.fichier}: ${status} — ${rep.count} lignes, ${rep.upserted || 0} écrites, ${rep.desactives || 0} désactivées`,
    );
    for (const w of rep.warnings || []) console.log(`  ⚠ ${w}`);
    for (const e of rep.errors) console.error(`  ✖ ${e}`);
    if (rep.errors.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { parseArgs, runImports, readJson };

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-import-tenir] erreur :', err.message || err);
    process.exit(1);
  });
}
