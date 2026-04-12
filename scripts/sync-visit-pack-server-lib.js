#!/usr/bin/env node
/**
 * Copie les modules ESM de validation pack mascotte vers lib/visit-pack/
 * pour que l’API Express (`routes/visit.js`) fonctionne sans le dossier `src/`
 * (déploiement runtime / prod sans sources frontend).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'lib', 'visit-pack');
const files = [
  ['src/utils/mascotPack.js', 'mascotPack.js'],
  ['src/utils/visitMascotState.js', 'visitMascotState.js'],
];

function main() {
  const hasSrc = files.every(([relSrc]) => fs.existsSync(path.join(root, relSrc)));
  if (!hasSrc) {
    const hasLib = files.every(([, name]) => fs.existsSync(path.join(outDir, name)));
    if (hasLib) {
      console.warn('[sync-visit-pack-server-lib] Sources `src/utils` absentes — lib/visit-pack/ conservé (bundle runtime).');
      return;
    }
    console.error('[sync-visit-pack-server-lib] Ni sources ni lib/visit-pack/ — impossible de continuer.');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const [relSrc, name] of files) {
    const from = path.join(root, relSrc);
    const to = path.join(outDir, name);
    fs.copyFileSync(from, to);
  }
  console.log('[sync-visit-pack-server-lib] OK → lib/visit-pack/');
}

main();
