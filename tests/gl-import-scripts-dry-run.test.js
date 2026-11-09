'use strict';

/**
 * Importeurs xlsx en ligne de commande (`scripts/gl-import-{qcm,species,glossary,lore-glossary,
 * qcm-lore,spells}.js`) : ils appelaient des parseurs devenus `async` sans `await`, d'où
 * « Cannot read properties of undefined (reading 'length') » (simulation du 7 novembre 2026).
 * Chaque script est exécuté en `--dry-run` sur son fichier par défaut : il doit sortir en 0 et
 * afficher son rapport, sans rien écrire.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initSchema } = require('../database');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['qcm', 'species', 'glossary', 'lore-glossary', 'qcm-lore', 'spells'];

before(async () => {
  await initSchema();
});

for (const name of SCRIPTS) {
  test(`scripts/gl-import-${name}.js --dry-run sur le fichier par défaut : sortie 0, rapport affiché`, () => {
    const run = spawnSync(process.execPath, [`scripts/gl-import-${name}.js`, '--dry-run'], {
      cwd: ROOT,
      env: { ...process.env, GL_TENIR_SYNC: '0' },
      encoding: 'utf8',
      timeout: 120000,
    });
    const out = `${run.stdout || ''}\n${run.stderr || ''}`;
    assert.equal(run.status, 0, out.slice(-2000));
    assert.ok(!/reading 'length'/.test(out), `parseur non attendu (await manquant) : ${name}`);
    assert.match(run.stdout || '', new RegExp(`\\[gl-import-${name}\\] dry-run OK`));
  });
}
