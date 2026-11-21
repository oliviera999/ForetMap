#!/usr/bin/env node
'use strict';

/**
 * Allège les images de marque **déjà en base** de Gnomes & Licornes (`gl_settings`, clé
 * `platform.brand` : héros, trois vignettes de l'accueil, logo). Pour chacune, une variante
 * WebP est écrite sous `uploads/gl_brand/optim/` (1 600 px de large au plus, 200 Ko visés ;
 * 512 px et 60 Ko pour le logo) et son adresse remplace celle de l'original dans le réglage.
 * **L'original n'est ni modifié ni supprimé.** Les nouveaux envois depuis l'éditeur de
 * marque reçoivent leur variante à l'envoi (`lib/glBrandImages.js`).
 *
 * **À blanc par défaut** : le script dit ce qu'il ferait et n'écrit rien (ni fichier, ni
 * base) tant qu'on ne passe pas `--apply`. Idempotent : une image déjà allégée, déjà légère
 * ou introuvable n'est pas touchée, et le réglage n'est pas réécrit s'il n'y a rien à faire.
 *
 * Il lit les fichiers sous `uploads/` : il se lance **sur la machine qui porte ces
 * fichiers**, avec le `.env` de l'application.
 *
 * Usage :
 *   node scripts/gl-brand-optimiser.js            # à blanc (identique à --dry-run)
 *   node scripts/gl-brand-optimiser.js --apply    # écrit les variantes et le réglage
 *   node scripts/gl-brand-optimiser.js --json     # rapport en JSON
 */

require('dotenv').config({ quiet: true });

const BRAND_KEY = 'platform.brand';
const UPDATED_BY = 'gl-brand-optimiser';

const REASONS = Object.freeze({
  vide: 'aucune image',
  hors_uploads: 'adresse hors de /uploads, laissée telle quelle',
  deja_variante: 'déjà allégée',
  deja_legere: 'déjà légère, rien à gagner',
  format_non_pris_en_charge: 'format non pris en charge (JPEG, PNG ou WebP attendus)',
  fichier_introuvable: 'fichier introuvable sous uploads/',
  sharp_absent: 'module sharp indisponible',
  sans_gain: 'la variante ne serait pas plus légère',
  erreur: 'erreur',
});

function ko(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  return `${Math.round(bytes / 1024).toLocaleString('fr-FR')} Ko`;
}

function describeItem(item) {
  if (item.status === 'creee') {
    return `variante écrite : ${item.url} (${ko(item.bytesBefore)} → ${ko(item.bytesAfter)})`;
  }
  if (item.status === 'a_creer') {
    return `variante à écrire : ${item.url} (${ko(item.bytesBefore)} → ${ko(item.bytesAfter)})`;
  }
  if (item.status === 'existante') {
    return `variante déjà sur le disque : ${item.url} (${ko(item.bytesBefore)} → ${ko(item.bytesAfter)})`;
  }
  const reason = REASONS[item.reason] || item.reason || 'ignorée';
  return item.error ? `${reason} : ${item.error}` : reason;
}

/**
 * @param {{ apply?: boolean, queryOne?: Function, upsert?: Function, optimize?: Function }} [options]
 *   Les trois fonctions sont injectables pour les tests ; par défaut, la base de l'application.
 * @returns {Promise<{ apply: boolean, found: boolean, changed: boolean, written: boolean, items: object[] }>}
 */
async function run(options = {}) {
  const apply = options.apply === true;
  const queryOne = options.queryOne || require('../database').queryOne;
  const upsert = options.upsert || require('../lib/glSettings').upsertGlSetting;
  const optimize = options.optimize || require('../lib/glBrandImages').optimizeGlBrandImages;

  const row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
    BRAND_KEY,
  ]);
  if (!row?.value_json) {
    return { apply, found: false, changed: false, written: false, items: [] };
  }
  let rawBrand;
  try {
    rawBrand = JSON.parse(String(row.value_json));
  } catch (err) {
    throw new Error(`Réglage ${BRAND_KEY} illisible (JSON invalide) : ${err.message}`);
  }
  if (!rawBrand || typeof rawBrand !== 'object' || Array.isArray(rawBrand)) {
    throw new Error(`Réglage ${BRAND_KEY} inattendu (objet JSON attendu)`);
  }

  const { brand, changed, items } = await optimize(rawBrand, { dryRun: !apply });
  let written = false;
  if (apply && changed) {
    await upsert(BRAND_KEY, brand, UPDATED_BY);
    written = true;
  }
  return { apply, found: true, changed, written, items };
}

function printReport(report) {
  const out = (line) => process.stdout.write(`${line}\n`);
  out(report.apply ? 'Images de marque G&L — application' : 'Images de marque G&L — à blanc');
  if (!report.found) {
    out(`Aucun réglage ${BRAND_KEY} en base : rien à faire.`);
    return;
  }
  for (const item of report.items) {
    out(`- ${item.field} : ${item.sourceUrl || '(vide)'}`);
    out(`    ${describeItem(item)}`);
  }
  if (!report.changed) {
    out('Rien à changer : le réglage n’est pas réécrit.');
  } else if (report.written) {
    out(`Réglage ${BRAND_KEY} mis à jour (les originaux restent en place).`);
    out('Le serveur relit ses réglages en 30 s au plus ; rechargez la page de connexion.');
  } else {
    out('Rien n’a été écrit. Relancez avec --apply pour écrire les variantes et le réglage.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--apply', '--dry-run', '--json']);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    process.stderr.write(`Option inconnue : ${unknown.join(', ')}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.includes('--apply') && args.includes('--dry-run')) {
    process.stderr.write('Choisissez --apply ou --dry-run, pas les deux.\n');
    process.exitCode = 2;
    return;
  }
  const report = await run({ apply: args.includes('--apply') });
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printReport(report);
}

if (require.main === module) {
  main()
    .catch((err) => {
      process.stderr.write(`${err?.message || err}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        const db = require('../database');
        if (typeof db.endPool === 'function') await db.endPool();
      } catch (_) {
        /* la base n'a peut-être jamais été ouverte */
      }
    });
}

module.exports = { run, describeItem, BRAND_KEY };
