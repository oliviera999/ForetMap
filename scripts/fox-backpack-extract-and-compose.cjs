/**
 * 1) Optionnel (--import) : copier une planche PNG vers l’atlas 918×640 (padding transparent si besoin).
 * 2) Extraire chaque cellule 153×160, remplacer les bulles (ligne 2, cols 4–5) par du transparent,
 *    réécrire l’atlas et les PNG sous cells/.
 *
 * Usage (racine dépôt) :
 *   npm run mascot:fox-backpack
 *   npm run mascot:fox-backpack -- --import
 *   npm run mascot:fox-backpack -- --import "C:\chemin\vers\planche.png"
 *
 * Avec `--import` seul : essaie FORETMAP_FOX_SOURCE puis la planche Gemini « ai-brush » du workspace Cursor si elle existe.
 * Le client ne charge que fox-backpack-spritesheet.png ; cells/ sert au pipeline / relecture.
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

const BUBBLE_KEYS = new Set(['2,4', '2,5']);

function cursorDefaultBrushPath() {
  const base = process.env.USERPROFILE || process.env.HOME || '';
  if (!base) return null;
  return path.join(
    base,
    'AppData/Roaming/Cursor/User/workspaceStorage/af0ff3949d6f54adf531a34c6b69d944/images/Gemini_Generated_Image_iv4dyhiv4dyhiv4d-ai-brush-removebg-w75w6koi-6567727b-8cd8-461b-a022-b835aa3cd48f.png',
  );
}

function resolveImportSource(argv) {
  const idx = argv.indexOf('--import');
  if (idx >= 0) {
    const next = argv[idx + 1];
    if (next && !next.startsWith('-')) return path.resolve(next);
    if (process.env.FORETMAP_FOX_SOURCE) return path.resolve(process.env.FORETMAP_FOX_SOURCE);
    const def = cursorDefaultBrushPath();
    if (def && fs.existsSync(def)) return def;
    console.error(
      'Aucune planche source : passez un chemin après --import ou définissez FORETMAP_FOX_SOURCE, ou placez la PNG Gemini ai-brush au chemin Cursor attendu.',
    );
    process.exit(1);
  }
  return null;
}

async function importSourceToAtlas(srcPath) {
  const tw = COLS * FRAME_W;
  const th = ROWS * FRAME_H;
  const buf = await fs.promises.readFile(srcPath);
  const meta = await sharp(buf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w > tw || h > th) {
    throw new Error(
      `Planche ${w}×${h} : dépasse le gabarit ${tw}×${th}. Recadrer à ${tw}×${th} max (grille 6×4 × 153×160).`,
    );
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
  fs.mkdirSync(path.dirname(ATLAS), { recursive: true });
  await pipeline.png().toFile(ATLAS);
  console.log('Import planche → atlas', path.relative(ROOT, srcPath), '→', ATLAS_REL, `(${tw}×${th})`);
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

async function extractAndCompose() {
  if (!fs.existsSync(ATLAS)) {
    console.error('Atlas introuvable:', ATLAS, '(utilisez --import avec une planche source)');
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

async function main() {
  const argv = process.argv.slice(2);
  const importSrc = resolveImportSource(argv);
  if (importSrc) await importSourceToAtlas(importSrc);
  await extractAndCompose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
