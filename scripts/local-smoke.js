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
  const args = process.argv.slice(2);
  const isFast = args.includes('--fast');
  const baseEnv = { ...process.env };
  const testEnv = { ...baseEnv, DB_NAME: 'foretmap_test' };

  console.log(
    isFast
      ? 'Demarrage smoke local rapide (check + tests isoles)...'
      : 'Demarrage smoke local (check + build + tests isoles)...'
  );
  step('Check environnement local', ['scripts/check-local-env.js'], baseEnv);
  if (!isFast) {
    step('Build production local', ['scripts/build-safe.js'], baseEnv);
  }
  step('Tests backend locaux isoles', ['scripts/test-local-isolated.js'], testEnv);
  console.log(isFast ? '\nSmoke local rapide termine avec succes.' : '\nSmoke local termine avec succes.');
}

main();
