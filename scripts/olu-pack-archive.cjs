/**
 * Assemble l'archive ZIP importable du pack mascotte OLU (format `foretmap-mascot-pack-archive`).
 *
 * L'archive est importable telle quelle dans le studio prof (« Packs mascotte » → Importer ZIP)
 * ou par `POST /api/visit/mascot-packs/import`. Elle embarque ses PNG : `framesBase` y est
 * réécrit en `./assets/`, la forme portable attendue à l'import.
 *
 * Usage (racine dépôt) :
 *   npm run mascot:olu-pack
 *   npm run mascot:olu-pack -- --out /chemin/mascot-pack-olu.zip
 *   npm run mascot:olu-pack -- --frames <dossier-trames>   # trames hors dépôt
 *
 * Les trames se produisent avec `scripts/olu-sheets-cut.cjs` (voir
 * docs/MASCOT_OLU_PLANCHES_SPRITES.md §5).
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
const DEFAULT_PACK_JSON = path.join(ROOT, 'docs/packs/olu-planches-pack.json');
const DEFAULT_FRAMES_DIR = path.join(ROOT, 'public/assets/mascots/olu-planches/frames');
const DEFAULT_OUT = path.join(ROOT, 'mascot-pack-olu.zip');

function readOption(argv, flag, fallback) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('-')) {
    return path.resolve(argv[idx + 1]);
  }
  return fallback;
}

/** Noms de fichiers cités par le pack, dédoublonnés : deux états partagent parfois des trames. */
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

/** Réécrit le pack en forme portable : `framesBase` relatif, noms de fichiers nus. */
function buildPortablePack(pack) {
  const next = JSON.parse(JSON.stringify(pack));
  next.framesBase = PORTABLE_FRAMES_BASE;
  const stateFrames =
    next.stateFrames && typeof next.stateFrames === 'object' ? next.stateFrames : {};
  for (const [stateKey, spec] of Object.entries(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    const files = (Array.isArray(spec.files) ? spec.files : []).map((f) =>
      path.basename(String(f || '').trim()),
    );
    const entry = { files, fps: spec.fps != null ? Number(spec.fps) || 8 : 8 };
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
  const packJsonPath = readOption(argv, '--pack', DEFAULT_PACK_JSON);
  const framesDir = readOption(argv, '--frames', DEFAULT_FRAMES_DIR);
  const outPath = readOption(argv, '--out', DEFAULT_OUT);

  if (!fs.existsSync(packJsonPath)) {
    console.error('Pack JSON introuvable:', packJsonPath);
    process.exit(1);
  }
  if (!fs.existsSync(framesDir)) {
    console.error('Trames introuvables:', framesDir);
    console.error(
      'Les produire avec: node scripts/olu-sheets-cut.cjs --in <planches> --out',
      framesDir,
    );
    process.exit(1);
  }

  const pack = JSON.parse(fs.readFileSync(packJsonPath, 'utf8'));
  const referenced = collectReferencedFiles(pack);
  const assetFiles = [];
  const missing = [];

  for (const name of referenced) {
    const abs = path.join(framesDir, name);
    if (!fs.existsSync(abs)) {
      missing.push(name);
      continue;
    }
    assetFiles.push({ zipPath: `assets/${name}`, buffer: fs.readFileSync(abs) });
  }
  if (missing.length) {
    console.error(`${missing.length} trame(s) citée(s) par le pack et absente(s) :`);
    missing.slice(0, 10).forEach((n) => console.error('  -', n));
    process.exit(1);
  }

  const portablePack = buildPortablePack(pack);
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    variant: 'visit',
    statesForm: 'stateFrames',
    exportedAt: new Date().toISOString(),
    source: {
      catalog_id: portablePack.id,
      label: portablePack.label,
      generator: 'scripts/olu-pack-archive.cjs',
    },
    warnings: [],
  };

  const zipBuffer = buildMascotPackZipBuffer({ manifest, pack: portablePack, assetFiles });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zipBuffer);

  const totalBytes = assetFiles.reduce((n, f) => n + f.buffer.length, 0);
  console.log('OK pack OLU :', outPath);
  console.log(`  ${assetFiles.length} trames PNG (${(totalBytes / 1024 / 1024).toFixed(2)} Mo)`);
  console.log(`  archive ${(zipBuffer.length / 1024 / 1024).toFixed(2)} Mo`);
  console.log(`  ${Object.keys(portablePack.stateFrames).length} états :`);
  console.log('   ', Object.keys(portablePack.stateFrames).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
