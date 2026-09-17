#!/usr/bin/env node
'use strict';

/**
 * Chargement du fixture anonymisé versionné dans une base **locale**.
 *
 *   npm run db:fixture:load                  # → foretmap_local (DB_NAME par défaut)
 *   npm run db:fixture:load -- --db autre    # → autre base locale
 *
 * Décompresse l'archive puis délègue à `scripts/import-foretmap-dump.js`, qui rejoue le SQL
 * instruction par instruction (même découpage que le runner de migrations). On évite ainsi de
 * dépendre d'un client `mysql` en ligne de commande, absent de beaucoup de postes de dev.
 *
 * Refuse de viser `foretmap_test` : la suite backend attend une base construite par
 * `db:init`, pas une copie de production. Un fixture chargé là ferait échouer des tests pour
 * une raison qui n'aurait rien à voir avec le code.
 */

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { spawnSync } = require('child_process');

const { FIXTURE_PATH } = require('./export-anonymized-fixture');

function parseArgs(argv) {
  const out = { database: process.env.DB_NAME || 'foretmap_local', fixture: FIXTURE_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--db' && argv[i + 1]) {
      out.database = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--db=')) out.database = arg.slice('--db='.length);
    else if (arg.startsWith('--file=')) out.fixture = arg.slice('--file='.length);
  }
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.database === 'foretmap_test') {
    console.error(
      'Refus : `foretmap_test` est la base des suites automatisées, construite par `npm run db:init`.',
    );
    console.error('Charger le fixture ailleurs (par défaut `foretmap_local`).');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(options.fixture)) {
    console.error(`Refus : fixture introuvable (${options.fixture}).`);
    console.error('Le produire depuis une base anonymisée avec `npm run db:fixture:export`.');
    process.exitCode = 1;
    return;
  }

  const temporaire = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-fixture-')),
    'fixture.sql',
  );
  try {
    await pipeline(
      fs.createReadStream(options.fixture),
      zlib.createGunzip(),
      fs.createWriteStream(temporaire),
    );
    const taille = fs.statSync(temporaire).size;
    console.log(
      `Fixture décompressé (${(taille / 1048576).toFixed(1)} Mo) → import dans « ${options.database} »…`,
    );

    const resultat = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'import-foretmap-dump.js'),
        '--file',
        temporaire,
        '--db',
        options.database,
      ],
      { stdio: 'inherit', env: process.env },
    );
    if (resultat.status !== 0) {
      process.exitCode = resultat.status || 1;
      return;
    }
    console.log('\nPensez à `npm run db:seed:teacher` pour disposer d’un compte prof.');
  } finally {
    fs.rmSync(path.dirname(temporaire), { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
