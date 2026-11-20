#!/usr/bin/env node
/**
 * Rattrapage des vignettes de packs de mascotte (audit UI/UX du 19/11/2026, U1, lot 2).
 *
 * Lit les packs de la table `visit_mascot_packs` (lecture seule) et écrit pour chacun
 * `uploads/visit_mascot_packs/<id>/_vignette.png` (`lib/visitMascotPackThumbnail.js`). N'écrit
 * RIEN en base. Idempotent : une vignette existante est régénérée (même résultat).
 *
 * Usage :
 *   node scripts/generate-visit-mascot-thumbnails.js            # tous les packs
 *   node scripts/generate-visit-mascot-thumbnails.js --published # packs publiés seulement
 *   node scripts/generate-visit-mascot-thumbnails.js --dry-run   # liste sans écrire
 */
'use strict';

require('dotenv').config();
const { queryAll } = require('../database');
const {
  generateVisitMascotPackThumbnail,
  pickVisitMascotThumbnailSource,
} = require('../lib/visitMascotPackThumbnail');

const TAG = '[mascot-thumbnails]';

function parsePackJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw || ''));
  } catch (_) {
    return null;
  }
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const publishedOnly = argv.includes('--published');
  const rows = await queryAll(
    `SELECT id, label, pack_json, is_published FROM visit_mascot_packs
      ${publishedOnly ? 'WHERE is_published = 1' : ''} ORDER BY label ASC`,
  );
  let written = 0;
  for (const row of rows) {
    const pack = parsePackJson(row.pack_json);
    if (dryRun) {
      const source = pickVisitMascotThumbnailSource(pack);
      console.log(
        `${TAG} ${row.id} « ${row.label} » → ${source ? source.src : 'aucune image (Rive ?)'}`,
      );
      continue;
    }
    const result = await generateVisitMascotPackThumbnail({ packId: row.id, pack });
    if (result.ok) written += 1;
    console.log(
      `${TAG} ${row.id} « ${row.label} » : ${result.ok ? `${result.bytes} o` : `ignoré (${result.skipped})`}`,
    );
  }
  console.log(
    `${TAG} ${rows.length} pack(s) lus, ${dryRun ? 'aucune écriture (--dry-run)' : `${written} vignette(s) écrite(s)`}.`,
  );
}

main()
  .catch((err) => {
    console.error(`${TAG} échec :`, err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));
