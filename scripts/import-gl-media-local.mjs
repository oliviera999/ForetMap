#!/usr/bin/env node
/**
 * Importe les médias GL depuis le dossier local `médias/` vers uploads/media-library/.
 * Usage: node scripts/import-gl-media-local.mjs [--dir=chemin] [--dry-run] [--images-only] [--audio-only]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const { extractZipEntries } = require('../lib/contentLibraryBulk.js');
const { saveMediaFromBuffer, syncAssetManifests } = require('../lib/mediaLibrary.js');
const { copyManifestSnapshotsToSrcAssets } = require('../lib/glAssetManifest.js');
const {
  auditGlMediaKeys,
  formatAuditReport,
  loadKeysIndexFromFile,
} = require('../lib/glMediaKeysAudit.js');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positionalDir = args.find((a) => !a.startsWith('--'));

const dryRun = flags.has('--dry-run');
const imagesOnly = flags.has('--images-only');
const audioOnly = flags.has('--audio-only');
const dirFlag = args.find((a) => a.startsWith('--dir='));
const sourceDir = path.resolve(
  dirFlag ? dirFlag.slice('--dir='.length) : positionalDir || path.join(root, 'médias'),
);

const audioPackDir = path.join(root, 'data', 'gl', 'audio-pack');
const keysPath = path.join(root, 'uploads', 'media-library', '_keys.json');

function log(msg) {
  console.log(msg);
}

function importGlImagesFromZip() {
  const zipPath = path.join(sourceDir, 'images.zip');
  if (!fs.existsSync(zipPath)) {
    log(`○ images.zip absent dans ${sourceDir}`);
    return { imported: 0, skipped: 0, collisions: [] };
  }

  const archiveBuffer = fs.readFileSync(zipPath);
  const extracted = extractZipEntries(archiveBuffer);
  const glFiles = extracted.filter((f) => /^GL_/i.test(f.fileName));

  const seen = new Map();
  const collisions = [];
  for (const file of glFiles) {
    if (seen.has(file.fileName)) {
      collisions.push(file.fileName);
    }
    seen.set(file.fileName, file);
  }

  if (collisions.length) {
    log(`⚠ Collisions basename dans le ZIP (${collisions.length}) — dernière entrée conservée`);
    for (const name of [...new Set(collisions)].slice(0, 10)) {
      log(`  - ${name}`);
    }
  }

  const uniqueFiles = [...seen.values()];
  log(`\nImages GL dans images.zip : ${uniqueFiles.length} fichier(s)`);

  if (dryRun) {
    for (const file of uniqueFiles.slice(0, 15)) {
      log(`  [dry-run] ${file.fileName} (${(file.buffer.length / 1024).toFixed(0)} Ko)`);
    }
    if (uniqueFiles.length > 15) log(`  … et ${uniqueFiles.length - 15} autre(s)`);
    return { imported: uniqueFiles.length, skipped: 0, collisions };
  }

  let imported = 0;
  let errors = 0;
  for (const file of uniqueFiles) {
    try {
      saveMediaFromBuffer(file.buffer, null, file.fileName, { skipManifestSync: true });
      imported += 1;
    } catch (err) {
      errors += 1;
      console.warn(`✗ ${file.fileName}: ${err.message || err}`);
    }
  }
  log(`✓ ${imported} image(s) importée(s)${errors ? `, ${errors} erreur(s)` : ''}`);
  return { imported, skipped: errors, collisions };
}

function prepareAudioPack() {
  const scriptPath = path.join(__dirname, 'prepare-gl-audio-pack.mjs');
  execFileSync(process.execPath, [scriptPath, sourceDir], { stdio: 'inherit' });
}

function importGlAudioFromPack() {
  if (!fs.existsSync(audioPackDir)) {
    log(`○ Dossier audio-pack absent : ${audioPackDir}`);
    return { imported: 0, skipped: 0 };
  }

  const mp3Files = fs.readdirSync(audioPackDir).filter((f) => /^GL_plateau-.*\.mp3$/i.test(f));
  if (mp3Files.length === 0) {
    log('○ Aucun GL_plateau-*.mp3 dans data/gl/audio-pack/');
    return { imported: 0, skipped: 0 };
  }

  log(`\nAudio GL : ${mp3Files.length} fichier(s) dans audio-pack/`);

  if (dryRun) {
    for (const name of mp3Files) {
      const size = fs.statSync(path.join(audioPackDir, name)).size;
      log(`  [dry-run] ${name} (${(size / (1024 * 1024)).toFixed(1)} Mo)`);
    }
    return { imported: mp3Files.length, skipped: 0 };
  }

  let imported = 0;
  let errors = 0;
  for (const name of mp3Files) {
    try {
      const buffer = fs.readFileSync(path.join(audioPackDir, name));
      saveMediaFromBuffer(buffer, 'audio/mpeg', name, { skipManifestSync: true });
      imported += 1;
    } catch (err) {
      errors += 1;
      console.warn(`✗ ${name}: ${err.message || err}`);
    }
  }
  log(`✓ ${imported} piste(s) audio importée(s)${errors ? `, ${errors} erreur(s)` : ''}`);
  return { imported, skipped: errors };
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error(`Dossier source introuvable: ${sourceDir}`);
    process.exit(1);
  }

  log(`\n=== Import médias GL ===`);
  log(`Source: ${sourceDir}`);
  if (dryRun) log('Mode: dry-run (aucune écriture)\n');

  let imageStats = { imported: 0 };
  let audioStats = { imported: 0 };

  if (!audioOnly) {
    imageStats = importGlImagesFromZip();
  }

  if (!imagesOnly) {
    if (!dryRun) {
      prepareAudioPack();
    } else {
      log('\n[dry-run] prepare-gl-audio-pack.mjs serait exécuté');
    }
    audioStats = importGlAudioFromPack();
  }

  if (dryRun) {
    log(`\nDry-run terminé (${imageStats.imported} images, ${audioStats.imported} audio simulés).`);
    return;
  }

  const manifest = syncAssetManifests();
  copyManifestSnapshotsToSrcAssets(root);

  log(
    `\nManifestes synchronisés (${manifest.imageCount} clés images, ${Object.keys(manifest.audio).length} slots audio).`,
  );
  if (manifest.warnings?.length) {
    log(`Avertissements manifeste (${manifest.warnings.length}) :`);
    for (const w of manifest.warnings.slice(0, 10)) {
      log(`  ⚠ ${w.type}: ${w.stableKey || w.message || ''}`);
    }
  }

  if (fs.existsSync(keysPath)) {
    const index = loadKeysIndexFromFile(keysPath);
    const report = auditGlMediaKeys(index, { keysPath });
    console.log(formatAuditReport(report));
    if (report.missing.length > 0) {
      process.exitCode = 1;
    }
  }

  log(`\nImport terminé : ${imageStats.imported} image(s), ${audioStats.imported} audio.`);
}

main();
