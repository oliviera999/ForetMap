#!/usr/bin/env node
'use strict';

/**
 * Génère les vignettes manquantes des photos **déjà stockées** des familles publiques
 * affichées en tuiles : `plants/`, `tasks/`, `media-library/image/`
 * (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-M1). Les nouveaux envois en reçoivent une
 * à l'écriture (`lib/uploads.js`).
 *
 * Lecture seule par défaut : rapport des vignettes manquantes. `--apply` les génère.
 *
 * Usage :
 *   node scripts/generate-public-thumbs.js
 *   node scripts/generate-public-thumbs.js --apply
 */

const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../lib/uploads');
const { publicUploadThumbRelativePath, generatePublicUploadThumb } = require('../lib/imageThumb');

const ROOTS = ['plants', 'tasks', 'media-library/image'];

function* walk(absDir) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function run() {
  const apply = process.argv.includes('--apply');
  const stats = { candidates: 0, missing: 0, generated: 0, failed: 0 };
  for (const root of ROOTS) {
    for (const abs of walk(path.join(UPLOADS_DIR, root))) {
      const rel = path.relative(UPLOADS_DIR, abs).split(path.sep).join('/');
      const thumbRel = publicUploadThumbRelativePath(rel);
      if (!thumbRel) continue;
      stats.candidates += 1;
      if (fs.existsSync(path.join(UPLOADS_DIR, thumbRel))) continue;
      stats.missing += 1;
      if (!apply) continue;
      const out = await generatePublicUploadThumb(rel);
      if (out.ok) stats.generated += 1;
      else {
        stats.failed += 1;
        console.error(`  ✘ ${rel} — ${out.error || (out.skipped ? 'sharp indisponible' : '?')}`);
      }
    }
  }
  console.log(`── ${apply ? 'ÉCRITURE' : 'RAPPORT (aucun fichier écrit)'} ──`);
  console.log(`  photos éligibles     : ${stats.candidates}`);
  console.log(`  vignettes manquantes : ${stats.missing}`);
  if (apply) {
    console.log(`  générées             : ${stats.generated}`);
    if (stats.failed) console.log(`  en échec             : ${stats.failed}`);
  } else if (stats.missing > 0) {
    console.log('\n  Relancer avec --apply pour les générer.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
