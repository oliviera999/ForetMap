#!/usr/bin/env node
/**
 * Régénère les icônes Plan Lyautey à partir de public/plan/logo-lyautey.png
 * (charte graphique du lycée : bleu marine #183058).
 *
 * - favicon SVG : monogramme abstrait (traits croisés) lisible à 16–32 px
 * - PNG / ICO / PWA : logo complet centré sur fond marine
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'plan');
const SRC = path.join(outDir, 'logo-lyautey.png');
const NAVY = '#183058';
const NAVY_RGB = { r: 0x18, g: 0x30, b: 0x58, alpha: 1 };
const STEEL = '#98a8c8';
const MID = '#5a7aaa';

/** Favicon vectoriel inspiré du monogramme (traits croisés du logo officiel). */
function markSvg(size = 32) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${NAVY}"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(${size * 0.12} ${size * 0.1}) scale(${size / 32})">
    <path stroke="#ffffff" stroke-width="1.35" d="M4 22 L10 6 L16 22"/>
    <path stroke="${STEEL}" stroke-width="1.1" d="M6 22 L12 8 L18 22"/>
    <path stroke="${MID}" stroke-width="1" d="M8 22 L14 10 L20 22"/>
    <path stroke="#ffffff" stroke-width="1.35" d="M12 22 L18 6 L24 22"/>
    <path stroke="${STEEL}" stroke-width="1.1" d="M14 22 L20 8 L26 22"/>
    <path stroke="#ffffff" stroke-width="1.2" opacity="0.85" d="M3 18 L9 10 M23 10 L29 18"/>
  </g>
</svg>`;
}

async function makeRasterFromLogo(size, filename, { maskable = false } = {}) {
  const padRatio = maskable ? 0.2 : 0.12;
  const pad = Math.round(size * padRatio);
  const inner = Math.max(1, size - pad * 2);
  const logo = await sharp(SRC)
    .ensureAlpha()
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const out = await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY_RGB },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
  await fs.promises.writeFile(path.join(outDir, filename), out);
  return out;
}

async function makeRasterFromMark(size, filename) {
  const svg = Buffer.from(markSvg(size));
  const out = await sharp(svg).png().toBuffer();
  await fs.promises.writeFile(path.join(outDir, filename), out);
  return out;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[icons:plan] Fichier source introuvable:', SRC);
    process.exit(1);
  }

  await fs.promises.writeFile(path.join(outDir, 'favicon.svg'), markSvg(32), 'utf8');

  await makeRasterFromMark(16, 'favicon-16.png');
  const fav32 = await makeRasterFromMark(32, 'favicon-32.png');
  // Compat navigateurs qui requêtent /favicon.ico sur planlyautey.*
  await fs.promises.writeFile(path.join(outDir, 'favicon.ico'), fav32);

  await makeRasterFromLogo(180, 'apple-touch-icon.png');
  await makeRasterFromLogo(192, 'pwa-icon-192.png');
  await makeRasterFromLogo(512, 'pwa-icon-512.png');
  await makeRasterFromLogo(512, 'pwa-maskable-512.png', { maskable: true });

  console.log(
    '[icons:plan] Écrit favicon.svg (monogramme), favicon-16/32.png, favicon.ico, apple-touch + pwa (logo complet)',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
