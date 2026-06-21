/**
 * Réaligne les frames « course » du Renard 2 (ligne r1 du manifeste) dans leur tuile 153×160 :
 * même ligne de pieds (bas du bbox collé au bas de la tuile) et centrage horizontal du contenu.
 * Atténue l’effet « bandeau qui défile » lors du cycle walking/running sur la carte visite.
 *
 * Usage (racine dépôt) : node scripts/renard2-cut-align-walk.cjs
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const FRAMES_DIR = path.join(ROOT, 'public/assets/mascots/renard2-cut/frames');
const FRAME_W = 153;
const FRAME_H = 160;
const ALPHA_THRESH = 14;

async function bboxOfImage(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w * 4;
    for (let x = 0; x < w; x += 1) {
      const a = data[row + x * 4 + 3];
      if (a > ALPHA_THRESH) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function alignWalkFrame(filePath) {
  const buf = await fs.promises.readFile(filePath);
  const meta = await sharp(buf).metadata();
  if ((meta.width || 0) !== FRAME_W || (meta.height || 0) !== FRAME_H) {
    throw new Error(`Taille inattendue ${path.basename(filePath)}: ${meta.width}×${meta.height}`);
  }
  const bbox = await bboxOfImage(buf);
  if (!bbox) return { file: path.basename(filePath), skipped: true, reason: 'empty' };

  const cropped = await sharp(buf).extract(bbox).png().toBuffer();

  const metaC = await sharp(cropped).metadata();
  const cw = metaC.width || 0;
  const ch = metaC.height || 0;
  const pasteX = Math.max(0, Math.floor((FRAME_W - cw) / 2));
  const pasteY = Math.max(0, FRAME_H - ch);

  const out = await sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left: pasteX, top: pasteY }])
    .png()
    .toBuffer();

  await fs.promises.writeFile(filePath, out);
  return { file: path.basename(filePath), skipped: false, bbox, pasteX, pasteY };
}

async function main() {
  const files = [
    'cell-r1-c0.png',
    'cell-r1-c1.png',
    'cell-r1-c2.png',
    'cell-r1-c3.png',
    'cell-r1-c4.png',
    'cell-r1-c5.png',
  ];
  const results = [];
  for (const name of files) {
    const p = path.join(FRAMES_DIR, name);
    if (!fs.existsSync(p)) {
      results.push({ file: name, skipped: true, reason: 'missing' });
      continue;
    }
    results.push(await alignWalkFrame(p));
  }
  console.log('OK renard2-cut-align-walk:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
