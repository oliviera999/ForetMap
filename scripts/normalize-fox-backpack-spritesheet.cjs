/**
 * Normalise la planche renard (918×637) en atlas 918×640 pour une grille 6×4 à 153×160 px.
 * Usage : node scripts/normalize-fox-backpack-spritesheet.cjs <chemin-source.png>
 * Sortie : public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const input = process.argv[2];
const outDir = path.join(__dirname, '../public/assets/mascots/fox-backpack');
const output = path.join(outDir, 'fox-backpack-spritesheet.png');

if (!input || !fs.existsSync(input)) {
  console.error('Usage: node scripts/normalize-fox-backpack-spritesheet.cjs <source.png>');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const meta = await sharp(input).metadata();
  if (meta.width !== 918 || meta.height !== 637) {
    console.warn(`Attention: attendu 918×637, reçu ${meta.width}×${meta.height}`);
  }
  await sharp(input)
    .ensureAlpha()
    .extend({ bottom: 3, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(output);
  const m = await sharp(output).metadata();
  console.log('Écrit', output, `${m.width}×${m.height}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
