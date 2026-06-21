#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config();

const {
  parseChaptersWorkbook,
  applyChaptersImport,
  buildChaptersTemplateWorkbook,
} = require('../lib/glChaptersImport');
const { initSchema, queryAll, execute, withTransaction } = require('../database');

const DEFAULT_FILE = path.join(
  process.cwd(),
  'data',
  'gl',
  'chapitres-gnomes-et-licornes-exemple.xlsx',
);

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    file: DEFAULT_FILE,
    syncReperes: false,
    syncZones: false,
  };
  for (const raw of argv) {
    if (raw === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (raw === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
    } else if (raw === '--sync-reperes') {
      args.syncReperes = true;
    } else if (raw === '--sync-zones') {
      args.syncZones = true;
    } else if (raw.startsWith('--file=')) {
      args.file = path.resolve(raw.slice('--file='.length));
    } else if (raw === '--write-example') {
      args.writeExample = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.writeExample) {
    const buffer = buildChaptersTemplateWorkbook('full');
    await fs.mkdir(path.dirname(DEFAULT_FILE), { recursive: true });
    await fs.writeFile(DEFAULT_FILE, buffer);
    console.log(`[gl-import-chapters] Fichier exemple écrit : ${DEFAULT_FILE}`);
    return;
  }

  const buffer = await fs.readFile(args.file);
  const parsed = parseChaptersWorkbook(buffer);

  await initSchema();

  const report = await withTransaction(async (tx) =>
    applyChaptersImport({ queryAll: tx.queryAll, execute: tx.execute }, parsed, {
      dryRun: args.dryRun,
      syncReperes: args.syncReperes,
      syncZones: args.syncZones,
    }),
  );

  const mode = args.dryRun ? 'dry-run' : 'apply';
  console.log(`[gl-import-chapters] ${mode} OK — fichier: ${args.file}`);
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun) {
    console.log('[gl-import-chapters] Relancer avec --apply pour écrire en base.');
  }
}

main().catch((err) => {
  console.error('[gl-import-chapters] Erreur:', err.message || err);
  process.exit(1);
});
