#!/usr/bin/env node
/**
 * Valide un fichier JSON « mascot pack » v1 et optionnellement génère un module manifeste.
 *
 * Usage:
 *   node scripts/mascot-pack-validate.cjs chemin/vers/pack.json
 *   node scripts/mascot-pack-validate.cjs pack.json --generate-js src/data/mon-pack-manifest.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const argv = process.argv.slice(2);
  const genIdx = argv.indexOf('--generate-js');
  const outJs = genIdx >= 0 ? argv[genIdx + 1] : null;
  const fileArg = argv.find((a) => !a.startsWith('--') && a !== outJs);

  if (!fileArg || argv.includes('--help')) {
    console.log(`Usage: node scripts/mascot-pack-validate.cjs <pack.json> [--generate-js <sortie.js>]`);
    process.exit(fileArg ? 0 : 1);
  }

  const abs = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(abs)) {
    console.error('Fichier introuvable:', abs);
    process.exit(1);
  }

  const { validateMascotPackV1 } = await import('../src/utils/mascotPack.js');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error('JSON invalide:', e.message);
    process.exit(1);
  }

  const result = validateMascotPackV1(raw, { relaxAssetPrefix: false });
  if (!result.ok) {
    console.error('Pack invalide:');
    console.error(result.error.format ? result.error.format() : result.error);
    process.exit(1);
  }

  console.log('OK mascot pack v1:', result.pack.id, '—', result.pack.label);
  console.log('  États:', Object.keys(result.pack.stateFrames).join(', '));

  if (outJs) {
    const outAbs = path.resolve(process.cwd(), outJs);
    const base = result.pack.framesBase.endsWith('/') ? result.pack.framesBase : `${result.pack.framesBase}/`;
    const manifest = {};
    for (const [st, spec] of Object.entries(result.pack.stateFrames)) {
      const entry = { files: spec.files || [], fps: spec.fps != null ? spec.fps : 8 };
      if (Array.isArray(spec.frameDwellMs) && spec.frameDwellMs.length) entry.frameDwellMs = spec.frameDwellMs;
      manifest[st] = entry;
    }
    const body = [
      '/**',
      ` * Manifeste généré depuis ${path.relative(process.cwd(), abs).replace(/\\/g, '/')}`,
      ' * Ne pas éditer à la main : régénérer avec mascot-pack-validate --generate-js',
      ' */',
      `export const MASCOT_PACK_FRAMES_BASE = ${JSON.stringify(base)};`,
      '',
      '/** @type {Record<string, { files: string[], fps: number, frameDwellMs?: number[] }>} */',
      `export const mascotPackManifest = ${JSON.stringify(manifest, null, 2)};`,
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, body, 'utf8');
    console.log('  Écrit:', path.relative(process.cwd(), outAbs));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
