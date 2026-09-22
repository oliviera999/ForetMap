#!/usr/bin/env node
/**
 * Régénère les icônes Plan Lyautey / Plan des personnels à partir du favicon
 * officiel du site du lycée (`public/plan/lyautey-favicon.png`, extrait de
 * https://lyceelyautey.org/wp-content/uploads/2025/12/faveicon-lyaute.png).
 *
 * - favicon 16/32 / ICO / SVG : redimensionnements du PNG officiel (fond noir)
 * - apple-touch + PWA : même source, tailles d’installation
 * - `public/staff/favicon.svg` : copie du SVG plan (même établissement ; la distinction
 *   d’onglet reste le titre et la couleur de thème brune)
 *
 * Le logo d’interface `logo-lyautey.png` (bandeau / coin carte) n’est pas modifié ici.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'plan');
const staffDir = path.join(root, 'public', 'staff');
const SRC = path.join(outDir, 'lyautey-favicon.png');

async function resizePng(size, filename) {
  const out = await sharp(SRC)
    .ensureAlpha()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  await fs.promises.writeFile(path.join(outDir, filename), out);
  return out;
}

/** SVG favicon : PNG 64×64 embarqué (les navigateurs gèrent mal un <image href> externe). */
async function writeFaviconSvg() {
  const png64 = await sharp(SRC)
    .ensureAlpha()
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  const b64 = png64.toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" width="64" height="64">
  <image width="64" height="64" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>
</svg>
`;
  const svgPath = path.join(outDir, 'favicon.svg');
  await fs.promises.writeFile(svgPath, svg, 'utf8');
  await fs.promises.mkdir(staffDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(staffDir, 'favicon.svg'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Même favicon que le plan public (logo officiel Lycée Lyautey).
  La distinction d’onglet repose sur le titre et theme-color (#5a3a12).
-->
${svg.replace(/^<\?xml[^>]*>\r?\n/, '')}`,
    'utf8',
  );
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[icons:plan] Fichier source introuvable:', SRC);
    process.exit(1);
  }

  await writeFaviconSvg();

  await resizePng(16, 'favicon-16.png');
  const fav32 = await resizePng(32, 'favicon-32.png');
  // Compat navigateurs qui requêtent /favicon.ico sur planlyautey.* / proflyautey.*
  await fs.promises.writeFile(path.join(outDir, 'favicon.ico'), fav32);

  await resizePng(180, 'apple-touch-icon.png');
  await resizePng(192, 'pwa-icon-192.png');
  await resizePng(512, 'pwa-icon-512.png');
  await resizePng(512, 'pwa-maskable-512.png');

  console.log(
    '[icons:plan] Écrit favicon.svg (+ staff), favicon-16/32.png, favicon.ico, apple-touch + pwa depuis lyautey-favicon.png',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
