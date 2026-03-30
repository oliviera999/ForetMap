#!/usr/bin/env node
/**
 * Régénère pwa-icon-*.png et pwa-maskable-512.png à partir de public/app-logo-n3.png :
 * glyphe en blanc (#fff) avec canal alpha conservé, sur fond #1a4731 (theme_color).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');
const SRC = path.join(pub, 'app-logo-n3.png');
const BG = { r: 26, g: 71, b: 49, alpha: 1 }; // #1a4731

async function logoWhitePng(maxSide) {
  const { data, info } = await sharp(SRC)
    .resize(maxSide, maxSide, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = data[i + 3];
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function iconSquare(size, logoRel) {
  const maxLogo = Math.max(8, Math.round(size * logoRel));
  const logoPng = await logoWhitePng(maxLogo);
  const base = await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: logoPng, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[icons] Fichier source introuvable:', SRC);
    process.exit(1);
  }

  const out192 = await iconSquare(192, 0.72);
  const out512 = await iconSquare(512, 0.72);
  const mask512 = await iconSquare(512, 0.52);
  const fav32 = await iconSquare(32, 0.72);

  await fs.promises.writeFile(path.join(pub, 'pwa-icon-192.png'), out192);
  await fs.promises.writeFile(path.join(pub, 'pwa-icon-512.png'), out512);
  await fs.promises.writeFile(path.join(pub, 'pwa-maskable-512.png'), mask512);
  await fs.promises.writeFile(path.join(pub, 'favicon-n3.png'), fav32);

  console.log(
    '[icons] Écrit pwa-icon-192/512, pwa-maskable-512, favicon-n3.png (n³ blanc / fond #1a4731)',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
