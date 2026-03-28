#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

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

function step(label, args, env) {
  console.log(`\n=== ${label} ===`);
  const code = runNode(args, env);
  if (code !== 0) {
    console.error(`\nEchec smoke local a l'etape: ${label}`);
    process.exit(code);
  }
}

function main() {
  const baseEnv = { ...process.env };
  const testEnv = { ...baseEnv, DB_NAME: 'foretmap_test' };

  console.log('Demarrage smoke local (check + build + tests isoles)...');
  step('Check environnement local', ['scripts/check-local-env.js'], baseEnv);
  step('Build production local', ['scripts/build-safe.js'], baseEnv);
  step('Tests backend locaux isoles', ['scripts/test-local-isolated.js'], testEnv);
  console.log('\nSmoke local termine avec succes.');
}

main();
