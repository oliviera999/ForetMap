#!/usr/bin/env node
/**
 * Copie Noto Color Emoji (WOFF2 complet) depuis @fontsource vers public/fonts/.
 * À lancer après `npm install` ou mise à jour de @fontsource/noto-color-emoji.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(
  root,
  'node_modules',
  '@fontsource',
  'noto-color-emoji',
  'files',
  'noto-color-emoji-emoji-400-normal.woff2',
);
const destDir = path.join(root, 'public', 'fonts');
const dest = path.join(destDir, 'noto-color-emoji.woff2');

if (!fs.existsSync(src)) {
  console.error('[fonts] Fichier source introuvable :', src);
  console.error('[fonts] Installez la dépendance : npm install @fontsource/noto-color-emoji --save-dev');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
const stat = fs.statSync(dest);
console.log('[fonts] Copié →', dest, `(${Math.round(stat.size / 1024)} Ko)`);
