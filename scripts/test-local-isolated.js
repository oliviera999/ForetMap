#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

// `tests/content/` porte les assertions sur le corpus pédagogique (cf. `npm run test:content`).
// Elles sont hors du glob `tests/*.test.js` pour que leur dérive ne bloque plus la suite de
// code, mais l'exécution isolée locale doit rester exhaustive : on lit les deux dossiers.
const CONTENT_DIR = path.join(TESTS_DIR, 'content');

function listTestFilesIn(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.test.js'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(prefix, name));
}

function listTestFiles() {
  return [
    ...listTestFilesIn(TESTS_DIR, 'tests'),
    ...listTestFilesIn(CONTENT_DIR, path.join('tests', 'content')),
  ];
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env,
  });
  if (result.error) {
    console.error(result.error);
  }
  return typeof result.status === 'number' ? result.status : 1;
}

function main() {
  const env = { ...process.env };
  const files = listTestFiles();
  if (files.length === 0) {
    console.error('Aucun fichier *.test.js trouvé dans tests/.');
    process.exit(1);
  }

  console.log(`Execution isolee de ${files.length} fichier(s) de test...`);
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const prefix = `[${i + 1}/${files.length}]`;
    console.log(`\n${prefix} Reinitialisation BDD (${env.DB_NAME || 'DB_NAME non defini'})`);
    let code = runNode(
      [
        '-e',
        "require('dotenv').config(); const { initSchema, seedData } = require('./database'); (async () => { await initSchema(); await seedData(); console.log('DB init OK'); process.exit(0); })()",
      ],
      env,
    );
    if (code !== 0) {
      console.error(`${prefix} Echec db:init avant ${file}`);
      process.exit(code);
    }

    console.log(`${prefix} Test ${file}`);
    code = runNode(['--test', '--test-force-exit', file], env);
    if (code !== 0) {
      console.error(`${prefix} Echec tests: ${file}`);
      process.exit(code);
    }
  }

  console.log('\nTous les fichiers de test sont passes en mode isole.');
}

main();
