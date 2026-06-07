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

copyManifestSnapshotsToSrcAssets(root);
console.log(`Manifestes GL synchronisés (${result.imageCount} images, ${result.warnings.length} avertissement(s)).`);
if (result.warnings.length) {
  for (const warning of result.warnings) console.warn('⚠', warning);
}
