#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config();

const { parseGlossaryWorkbook, applyGlossaryImport } = require('../lib/glGlossaryImport');
const { initSchema, queryAll, execute } = require('../database');

const DEFAULT_FILE = path.join(process.cwd(), 'data', 'gl', 'glossaire-gnomes-et-licornes.xlsx');

function parseArgs(argv) {
  const args = { dryRun: true, apply: false, file: DEFAULT_FILE };
  for (const raw of argv) {
    if (raw === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (raw === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
    } else if (raw.startsWith('--file=')) {
      args.file = path.resolve(raw.slice('--file='.length));
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const buffer = await fs.readFile(args.file);
  const { glossaryRows } = parseGlossaryWorkbook(buffer);

  await initSchema();

  const report = await applyGlossaryImport({ queryAll, execute }, glossaryRows, {
    dryRun: args.dryRun,
  });

  const mode = args.dryRun ? 'dry-run' : 'apply';
  console.log(`[gl-import-glossary] ${mode} OK — fichier: ${args.file}`);
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun) {
    console.log('[gl-import-glossary] Relancer avec --apply pour écrire en base.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-import-glossary] erreur:', err.message || err);
    process.exit(1);
  });
}

module.exports = { parseArgs };
