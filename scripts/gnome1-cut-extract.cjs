/**
 * Extrait des PNG découpés (grille 9×3 × 113×173, offset Y=41) pour la mascotte « gnome1 ».
 * Sortie : public/assets/mascots/gnome1/frames/
 *
 * Usage (racine dépôt) :
 *   npm run mascot:gnome1-cut
 *   npm run mascot:gnome1-cut -- --source "C:\chemin\planche.png"
 *
 * Source par défaut : public/assets/mascots/gnome1/gnome1-spritesheet.png
 * ou FORETMAP_GNOME1_SOURCE, ou --source explicite.
 * Fond noir (JPEG) → alpha transparent (seuil RGB ≤ 20).
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/assets/mascots/gnome1/frames');
const DEFAULT_SOURCE = path.join(ROOT, 'public/assets/mascots/gnome1/gnome1-spritesheet.png');

const FRAME_W = 113;
const FRAME_H = 173;
const COLS = 9;
const ROWS = 3;
const OFFSET_Y = 41;
const BLACK_THRESHOLD = 20;

function resolveSource(argv) {
  const idx = argv.indexOf('--source');
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('-')) {
    return path.resolve(argv[idx + 1]);
  }
  if (process.env.FORETMAP_GNOME1_SOURCE) return path.resolve(process.env.FORETMAP_GNOME1_SOURCE);
  return DEFAULT_SOURCE;
}

async function blackToTransparentPng(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function main() {
  const argv = process.argv.slice(2);
  const srcPath = resolveSource(argv);
  if (!fs.existsSync(srcPath)) {
    console.error('Source introuvable:', srcPath);
    console.error('Indiquez --source "chemin.png" ou placez gnome1-spritesheet.png.');
    process.exit(1);
  }

  const minW = COLS * FRAME_W;
  const minH = OFFSET_Y + ROWS * FRAME_H;
  const buf = await fs.promises.readFile(srcPath);
  const meta = await sharp(buf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < minW || h < minH) {
    throw new Error(`Source ${w}×${h} : minimum ${minW}×${minH}`);
  }

  const gridBuf = await sharp(buf).ensureAlpha().png().toBuffer();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const left = c * FRAME_W;
      const top = OFFSET_Y + r * FRAME_H;
      const tileBuf = await sharp(gridBuf)
        .extract({ left, top, width: FRAME_W, height: FRAME_H })
        .png()
        .toBuffer();
      const transparent = await blackToTransparentPng(tileBuf);
      const name = `cell-r${r}-c${c}.png`;
      await fs.promises.writeFile(path.join(OUT_DIR, name), transparent);
    }
  }

  console.log('OK gnome1-cut:', path.relative(ROOT, OUT_DIR), `(${COLS * ROWS} frames)`);
  console.log('  source:', path.relative(ROOT, srcPath));
  console.log(`  grille ${COLS}×${ROWS}, cellule ${FRAME_W}×${FRAME_H}, offset Y=${OFFSET_Y}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
