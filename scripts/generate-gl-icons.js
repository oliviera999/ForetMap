#!/usr/bin/env node
/**
 * Régénère les icônes GL (favicon, apple-touch) à partir de public/gl/logo.png.
 * Logo gnome + licorne sur fond #013a40 (charte GL primary).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'gl');
const SRC = path.join(outDir, 'logo.png');

async function writePng(size, filename) {
  const buf = await sharp(SRC)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  await fs.promises.writeFile(path.join(outDir, filename), buf);
  return buf;
}

async function writeSvgFromPng(pngBuf) {
  const b64 = pngBuf.toString('base64');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<image href="data:image/png;base64,${b64}" width="32" height="32"/>`,
    '</svg>',
  ].join('');
  await fs.promises.writeFile(path.join(outDir, 'favicon.svg'), svg, 'utf8');
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[icons:gl] Fichier source introuvable:', SRC);
    process.exit(1);
  }

  await writePng(16, 'favicon-16.png');
  const fav32 = await writePng(32, 'favicon-32.png');
  await writePng(180, 'apple-touch-icon.png');
  await writeSvgFromPng(fav32);
  // Compat navigateurs qui requêtent /favicon.ico sur gl.*
  await fs.promises.writeFile(path.join(outDir, 'favicon.ico'), fav32);

  console.log('[icons:gl] Écrit favicon.svg, favicon-16/32.png, favicon.ico, apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
