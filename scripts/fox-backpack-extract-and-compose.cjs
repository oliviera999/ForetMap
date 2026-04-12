/**
 * Extrait chaque cellule 153×160 de l’atlas renard sac, remplace les cases « bulles »
 * (ligne 2, colonnes 4–5) par du transparent, puis réécrit l’atlas composite.
 *
 * Usage (depuis la racine du dépôt) :
 *   node scripts/fox-backpack-extract-and-compose.cjs
 *   npm run mascot:fox-backpack
 *
 * Entrée / sortie : public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png
 * Extraits : public/assets/mascots/fox-backpack/cells/cell-r{R}-c{C}.png
 *
 * Grille : 6 × 4 cellules, 918 × 640 px. Aucun redessin : extract Sharp + cases vides.
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ATLAS_REL = 'public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png';
const ATLAS = path.join(ROOT, ATLAS_REL);
const CELLS_DIR = path.join(ROOT, 'public/assets/mascots/fox-backpack/cells');

const FRAME_W = 153;
const FRAME_H = 160;
const COLS = 6;
const ROWS = 4;

/** Cellules bulles (hors personnage) — tuiles transparentes + atlas recomposé. */
const BUBBLE_KEYS = new Set(['2,4', '2,5']);

async function transparentTilePng() {
  return sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();
}

async function main() {
  if (!fs.existsSync(ATLAS)) {
    console.error('Atlas introuvable:', ATLAS);
    process.exit(1);
  }
  const meta = await sharp(ATLAS).metadata();
  const expectedW = COLS * FRAME_W;
  const expectedH = ROWS * FRAME_H;
  if (meta.width !== expectedW || meta.height !== expectedH) {
    console.error(
      `Dimensions atlas inattendues: ${meta.width}×${meta.height}, attendu ${expectedW}×${expectedH}`,
    );
    process.exit(1);
  }

  fs.mkdirSync(CELLS_DIR, { recursive: true });
  const composites = [];
  const emptyPng = await transparentTilePng();

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const key = `${r},${c}`;
      const left = c * FRAME_W;
      const top = r * FRAME_H;
      let tileBuf;
      if (BUBBLE_KEYS.has(key)) {
        tileBuf = emptyPng;
      } else {
        tileBuf = await sharp(ATLAS)
          .extract({ left, top, width: FRAME_W, height: FRAME_H })
          .png()
          .toBuffer();
      }
      const cellPath = path.join(CELLS_DIR, `cell-r${r}-c${c}.png`);
      await fs.promises.writeFile(cellPath, tileBuf);
      composites.push({ input: tileBuf, left, top });
    }
  }

  const composed = await sharp({
    create: {
      width: expectedW,
      height: expectedH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  await fs.promises.writeFile(ATLAS, composed);
  console.log('OK fox-backpack:', ATLAS_REL);
  console.log('  cellules:', COLS * ROWS, '→', path.relative(ROOT, CELLS_DIR));
  console.log('  bulles neutralisées:', [...BUBBLE_KEYS].join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
