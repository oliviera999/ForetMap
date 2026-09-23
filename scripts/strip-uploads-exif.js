#!/usr/bin/env node
'use strict';

/**
 * Retire les métadonnées (EXIF / GPS, IPTC, XMP) des images **déjà stockées** sous `uploads/`.
 *
 * Lot F de `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S7**). Depuis ce lot, les nouveaux
 * téléversements sont nettoyés à l'écriture (`lib/uploads.js` → `lib/imageMetadata.js`). Ce
 * script est l'autre moitié : le stock accumulé avant le correctif, qui porte encore les
 * coordonnées GPS des appareils qui l'ont produit.
 *
 * **Lecture seule par défaut.** Le script rend un rapport et ne récrit rien tant qu'on ne
 * passe pas `--apply` : on regarde d'abord ce qu'on s'apprête à toucher.
 *
 * Usage :
 *   node scripts/strip-uploads-exif.js                 # rapport seul (par défaut)
 *   node scripts/strip-uploads-exif.js --apply         # récrit les fichiers concernés
 *   node scripts/strip-uploads-exif.js --dir=zones     # borne à une famille
 *   node scripts/strip-uploads-exif.js --verbose       # liste chaque fichier concerné
 *
 * Un fichier n'est récrit que si `sharp` sait le lire **et** qu'il porte effectivement des
 * métadonnées : une image déjà propre n'est pas touchée, donc pas ré-encodée inutilement.
 * L'écriture passe par un fichier temporaire puis un `rename` — un script interrompu ne
 * laisse pas une image à moitié écrite à la place d'une photo.
 */

const fs = require('fs');
const path = require('path');

const { UPLOADS_DIR } = require('../lib/uploads');
const { stripImageMetadata, describeImageMetadata } = require('../lib/imageMetadata');

/** Familles jamais parcourues : rien d'imageable, et beaucoup de fichiers. */
const SKIPPED_DIRS = new Set(['media-library']);

function parseArgs(argv) {
  const dirArg = argv.find((a) => a.startsWith('--dir='));
  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose'),
    dir: dirArg ? dirArg.split('=')[1].replace(/^\/+|\/+$/g, '') : '',
  };
}

/** Tous les fichiers sous `root`, en profondeur. */
function* walk(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name) && path.dirname(full) === UPLOADS_DIR) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/** Famille d'un fichier (premier segment sous `uploads/`), pour le rapport. */
function familyOf(absolutePath) {
  const rel = path.relative(UPLOADS_DIR, absolutePath);
  const [first] = rel.split(path.sep);
  return first || '(racine)';
}

async function run() {
  const { apply, verbose, dir } = parseArgs(process.argv.slice(2));
  const root = dir ? path.join(UPLOADS_DIR, dir) : UPLOADS_DIR;

  if (!fs.existsSync(root)) {
    console.error(`Dossier introuvable : ${root}`);
    process.exitCode = 1;
    return;
  }

  const stats = {
    scanned: 0,
    images: 0,
    withMetadata: 0,
    rewritten: 0,
    unchanged: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
  /** @type {Map<string, number>} famille → nombre d'images porteuses de métadonnées */
  const byFamily = new Map();

  for (const absolutePath of walk(root)) {
    stats.scanned += 1;
    let buffer;
    try {
      buffer = fs.readFileSync(absolutePath);
    } catch (err) {
      stats.failed += 1;
      console.error(
        `  ✘ lecture impossible : ${path.relative(UPLOADS_DIR, absolutePath)} — ${err.message}`,
      );
      continue;
    }

    const described = await describeImageMetadata(buffer);
    if (!described) continue; // pas une image lisible
    stats.images += 1;
    if (!described.hasExif && !described.hasIptc && !described.hasXmp) {
      stats.unchanged += 1;
      continue;
    }

    stats.withMetadata += 1;
    const family = familyOf(absolutePath);
    byFamily.set(family, (byFamily.get(family) || 0) + 1);
    const relative = path.relative(UPLOADS_DIR, absolutePath);
    if (verbose || !apply) {
      const tags = [
        described.hasExif ? 'EXIF' : null,
        described.hasIptc ? 'IPTC' : null,
        described.hasXmp ? 'XMP' : null,
      ]
        .filter(Boolean)
        .join('+');
      console.log(`  • ${relative} (${described.format}, ${tags})`);
    }
    if (!apply) continue;

    const cleaned = await stripImageMetadata(buffer, { relativePath: relative });
    if (cleaned === buffer) {
      // `stripImageMetadata` n'a pas su faire (format ignoré, encodeur manquant) : elle a
      // déjà journalisé le motif. On ne récrit rien plutôt que de récrire à l'identique.
      stats.failed += 1;
      continue;
    }
    const temp = `${absolutePath}.exif-tmp`;
    try {
      fs.writeFileSync(temp, cleaned);
      fs.renameSync(temp, absolutePath);
      stats.rewritten += 1;
      stats.bytesBefore += buffer.length;
      stats.bytesAfter += cleaned.length;
    } catch (err) {
      stats.failed += 1;
      try {
        fs.unlinkSync(temp);
      } catch (_) {
        /* le temporaire n'existait pas : rien à nettoyer */
      }
      console.error(`  ✘ écriture impossible : ${relative} — ${err.message}`);
    }
  }

  const mode = apply ? 'ÉCRITURE' : 'RAPPORT (aucun fichier modifié)';
  console.log(`\n── ${mode} ── racine : ${path.relative(process.cwd(), root) || '.'}`);
  console.log(`  fichiers parcourus        : ${stats.scanned}`);
  console.log(`  images lisibles           : ${stats.images}`);
  console.log(`  dont porteuses de données : ${stats.withMetadata}`);
  console.log(`  déjà propres              : ${stats.unchanged}`);
  if (apply) {
    const delta = stats.bytesBefore - stats.bytesAfter;
    const sign = delta >= 0 ? '-' : '+';
    console.log(`  récrites                  : ${stats.rewritten}`);
    console.log(`  poids                     : ${sign}${Math.abs(Math.round(delta / 1024))} Ko`);
  }
  if (stats.failed) console.log(`  en échec                  : ${stats.failed}`);

  if (byFamily.size) {
    console.log('\n  Par famille :');
    for (const [family, count] of [...byFamily].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(5)}  ${family}/`);
    }
  }
  if (!apply && stats.withMetadata > 0) {
    console.log('\n  Relancer avec --apply pour retirer ces métadonnées.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
