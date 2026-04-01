#!/usr/bin/env node
/**
 * Enchaîne les vérifications « distantes » utiles au debug : post-deploy-check puis tampon Pino.
 * Charge .env ; utilise la même résolution de secret que prod:admin-tail (3 noms possibles).
 *
 * Variables : FORETMAP_PROD_BASE_URL (défaut https://foretmap.olution.info), + secret dans .env.
 */
'use strict';

require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');
const { deploySecretFromEnv } = require('./lib/deploy-secret-from-env');

const root = path.join(__dirname, '..');
const base = String(process.env.FORETMAP_PROD_BASE_URL || 'https://foretmap.olution.info').replace(/\/$/, '');

function main() {
  if (!deploySecretFromEnv()) {
    console.error(
      'Secret deploy manquant : définissez dans .env (non versionné) au moins une de :\n' +
        '  DEPLOY_SECRET\n' +
        '  FORETMAP_DEPLOY_CHECK_SECRET\n' +
        '  FORETMAP_DEPLOY_SECRET\n' +
        '(même valeur que sur le serveur.)'
    );
    process.exit(1);
  }

  const node = process.execPath;
  const checkScript = path.join(root, 'scripts', 'post-deploy-check.js');
  const tailScript = path.join(root, 'scripts', 'prod-admin-tail.js');

  console.log(`[prod-remote-debug] baseUrl=${base}\n`);
  console.log('=== 1/2 post-deploy-check (health, version, diagnostics si secret) ===\n');
  execSync(`"${node}" "${checkScript}" --base-url "${base}"`, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, FORETMAP_PROD_BASE_URL: base },
  });

  console.log('\n=== 2/2 prod-admin-tail (diagnostics résumé + tampon logs) ===\n');
  execSync(`"${node}" "${tailScript}"`, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, FORETMAP_PROD_BASE_URL: base },
  });
}

try {
  main();
} catch (e) {
  if (e && e.status != null) process.exit(e.status);
  console.error(e);
  process.exit(1);
}
