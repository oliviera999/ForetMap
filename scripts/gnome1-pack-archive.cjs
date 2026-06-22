/**
 * Assemble l'archive ZIP importable « mascot-pack-gnome1 » (format foretmap-mascot-pack-archive).
 *
 * Usage (racine dépôt) :
 *   npm run mascot:gnome1-pack
 *   npm run mascot:gnome1-pack -- --out "C:\chemin\mascot-pack-gnome1.zip"
 */

const path = require('path');
const fs = require('fs');
const {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  PORTABLE_FRAMES_BASE,
  buildMascotPackZipBuffer,
} = require('../lib/mascotPackArchive');

const ROOT = path.join(__dirname, '..');
const PACK_JSON = path.join(ROOT, 'docs/packs/gnome1-pack.json');
const FRAMES_DIR = path.join(ROOT, 'public/assets/mascots/gnome1/frames');
const DEFAULT_OUT = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'mascot-pack-gnome1.zip',
);

function resolveOut(argv) {
  const idx = argv.indexOf('--out');
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('-')) {
    return path.resolve(argv[idx + 1]);
  }
  return DEFAULT_OUT;
}

function collectReferencedFiles(pack) {
  const names = new Set();
  const stateFrames =
    pack?.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames : {};
  for (const spec of Object.values(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    for (const f of Array.isArray(spec.files) ? spec.files : []) {
      const base = path.basename(String(f || '').trim());
      if (base) names.add(base);
    }
  }
  return names;
}

function buildPortablePack(pack) {
  const next = JSON.parse(JSON.stringify(pack));
  next.framesBase = PORTABLE_FRAMES_BASE;
  const stateFrames =
    next.stateFrames && typeof next.stateFrames === 'object' ? next.stateFrames : {};
  for (const [stateKey, spec] of Object.entries(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    const fps = spec.fps != null ? Number(spec.fps) || 8 : 8;
    const files = (Array.isArray(spec.files) ? spec.files : []).map((f) =>
      path.basename(String(f || '').trim()),
    );
    const entry = { files, fps };
    if (Array.isArray(spec.frameDwellMs) && spec.frameDwellMs.length === files.length) {
      entry.frameDwellMs = spec.frameDwellMs;
    }
    stateFrames[stateKey] = entry;
  }
  next.stateFrames = stateFrames;
  return next;
}

async function main() {
  const argv = process.argv.slice(2);
  const outPath = resolveOut(argv);

  if (!fs.existsSync(PACK_JSON)) {
    console.error('Pack JSON introuvable:', PACK_JSON);
    process.exit(1);
  }
  if (!fs.existsSync(FRAMES_DIR)) {
    console.error('Frames introuvables — lancer npm run mascot:gnome1-cut');
    process.exit(1);
  }

  const pack = JSON.parse(fs.readFileSync(PACK_JSON, 'utf8'));
  const referenced = collectReferencedFiles(pack);
  const assetFiles = [];

  for (const name of referenced) {
    const abs = path.join(FRAMES_DIR, name);
    if (!fs.existsSync(abs)) {
      console.error('Frame manquante:', name);
      process.exit(1);
    }
    assetFiles.push({
      zipPath: `assets/${name}`,
      buffer: fs.readFileSync(abs),
    });
  }

  const portablePack = buildPortablePack(pack);
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    variant: 'visit',
    exportedAt: new Date().toISOString(),
    source: {
      catalog_id: portablePack.id,
      label: portablePack.label,
      generator: 'scripts/gnome1-pack-archive.cjs',
    },
    warnings: [],
  };

  const zipBuffer = buildMascotPackZipBuffer({ manifest, pack: portablePack, assetFiles });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zipBuffer);

  console.log('OK gnome1-pack:', outPath);
  console.log('  assets:', assetFiles.length, 'fichiers PNG');
  console.log('  états:', Object.keys(portablePack.stateFrames).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
