#!/usr/bin/env node
/**
 * Génère / synchronise les manifestes GL depuis _keys.json et public/gl/sprites/.
 * Usage : node scripts/build-asset-manifest.mjs [--dry-run] [--optimize]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const {
  syncAssetManifests,
  copyManifestSnapshotsToSrcAssets,
} = require('../lib/glAssetManifest.js');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const result = syncAssetManifests({ rootDir: root, dryRun });

if (dryRun) {
  console.log('[dry-run] images:', Object.keys(result.images).length);
  console.log('[dry-run] audio slots:', Object.keys(result.audio).length);
  if (result.warnings.length) {
    console.log('[dry-run] warnings:', result.warnings.length);
    for (const warning of result.warnings) console.log(' -', warning);
  }
  process.exit(0);
}

// Garde-fou : ne jamais RETRECIR le manifest committe `src/gl/assets/`. En CI / conteneur sans
// mediatheque GL importee (`npm run gl:import:media`), la generation ne voit que des placeholders
// (ex. `.gitkeep`) ; ecraser le manifest viderait les illustrations GL embarquees dans le bundle.
// On ne met a jour le manifest src que si la generation contient AU MOINS autant d'images que le committe.
function committedSrcImageCount() {
  try {
    const p = path.join(root, 'src', 'gl', 'assets', 'manifest.images.json');
    return Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).length;
  } catch (_) {
    return 0;
  }
}
const existingCount = committedSrcImageCount();
if (result.imageCount < existingCount) {
  console.warn(
    `⚠ Manifest GL genere (${result.imageCount} images) plus petit que le committe (${existingCount}) — `
    + 'manifest src/gl/assets PRESERVE (mediatheque GL non importee dans cet environnement). '
    + 'Lancez `npm run gl:import:media` pour (re)generer depuis la mediatheque.'
  );
} else {
  copyManifestSnapshotsToSrcAssets(root);
  console.log(`Manifestes GL synchronisés (${result.imageCount} images, ${result.warnings.length} avertissement(s)).`);
}
if (result.warnings.length) {
  for (const warning of result.warnings) console.warn('⚠', warning);
}
