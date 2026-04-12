/**
 * Extrait uniquement des PNG découpés (grille 6×4 × 153×160) pour la mascotte « Renard 2 ».
 * Aucun atlas composite : sortie sous public/assets/mascots/renard2-cut/frames/.
 *
 * Usage (racine dépôt) :
 *   npm run mascot:renard2-cut
 *   npm run mascot:renard2-cut -- --source "C:\chemin\planche.png"
 *
 * Source par défaut : public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png (918×640),
 * ou FORETMAP_RENARD2_SOURCE, ou --source explicite.
 * Bulles (ligne 2, cols 4–5) : tuiles transparentes (même règle que le renard sac atlas).
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/assets/mascots/renard2-cut/frames');
const DEFAULT_SOURCE = path.join(
  ROOT,
  'public/assets/mascots/fox-backpack/fox-backpack-spritesheet.png',
);

const FRAME_W = 153;
const FRAME_H = 160;
const COLS = 6;
const ROWS = 4;
const BUBBLE_KEYS = new Set(['2,4', '2,5']);

function resolveSource(argv) {
  const idx = argv.indexOf('--source');
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('-')) {
    return path.resolve(argv[idx + 1]);
  }
  if (process.env.FORETMAP_RENARD2_SOURCE) return path.resolve(process.env.FORETMAP_RENARD2_SOURCE);
  return DEFAULT_SOURCE;
}

async function normalizeToGridBuffer(srcPath) {
  const tw = COLS * FRAME_W;
  const th = ROWS * FRAME_H;
  const buf = await fs.promises.readFile(srcPath);
  const meta = await sharp(buf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w > tw || h > th) {
    throw new Error(`Source ${w}×${h} : max ${tw}×${th}`);
  }
  const padR = tw - w;
  const padB = th - h;
  let pipeline = sharp(buf).ensureAlpha();
  if (padR > 0 || padB > 0) {
    pipeline = pipeline.extend({
      top: 0,
      left: 0,
      bottom: Math.max(0, padB),
      right: Math.max(0, padR),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return pipeline.png().toBuffer();
}

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
  const argv = process.argv.slice(2);
  const srcPath = resolveSource(argv);
  if (!fs.existsSync(srcPath)) {
    console.error('Source introuvable:', srcPath);
    console.error('Indiquez --source "chemin.png" ou placez fox-backpack-spritesheet.png.');
    process.exit(1);
  }

  const gridBuf = await normalizeToGridBuffer(srcPath);
  const meta = await sharp(gridBuf).metadata();
  if (meta.width !== COLS * FRAME_W || meta.height !== ROWS * FRAME_H) {
    console.error('Grille invalide après normalisation:', meta.width, meta.height);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
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
        tileBuf = await sharp(gridBuf)
          .extract({ left, top, width: FRAME_W, height: FRAME_H })
          .png()
          .toBuffer();
      }
      const name = `cell-r${r}-c${c}.png`;
      await fs.promises.writeFile(path.join(OUT_DIR, name), tileBuf);
    }
  }
  console.log('OK renard2-cut:', path.relative(ROOT, OUT_DIR), `(${COLS * ROWS} frames)`);
  console.log('  source:', path.relative(ROOT, srcPath));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
