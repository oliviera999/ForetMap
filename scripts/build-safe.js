#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const distIndexVite = path.join(distDir, 'index.vite.html');
const distIndexLegacy = path.join(distDir, 'index.html');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function hasUsableDist() {
  if (!fs.existsSync(distDir)) return false;
  if (fs.existsSync(distIndexVite) || fs.existsSync(distIndexLegacy)) return true;
  return false;
}

function runViteBuild() {
  const child = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  return child.status === 0;
}

function syncVisitPackServerLib() {
  const script = path.join(root, 'scripts', 'sync-visit-pack-server-lib.js');
  if (!fs.existsSync(script)) return true;
  const child = spawnSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  return child.status === 0;
}

function main() {
  if (fs.existsSync(viteBin)) {
    const ok = runViteBuild();
    if (!ok) process.exit(1);
    if (!syncVisitPackServerLib()) process.exit(1);
    process.exit(0);
  }

  if (hasUsableDist()) {
    console.warn('[build-safe] Vite indisponible (dépendances dev absentes).');
    console.warn('[build-safe] dist/ détecté : build ignoré (mode prébuild local).');
    if (!syncVisitPackServerLib()) process.exit(1);
    process.exit(0);
  }

  console.error('[build-safe] Impossible de builder : Vite absent et dist/ introuvable.');
  console.error('[build-safe] Installez les dépendances dev (npm ci --include=dev) ou poussez dist/.');
  process.exit(1);
}

main();
