#!/usr/bin/env node
'use strict';

/**
 * Rattrapage initial des badges (lot E).
 *
 * Usage :
 *   node scripts/rewards-backfill.js            # dry-run, élèves actifs sur 30 jours
 *   node scripts/rewards-backfill.js --all      # dry-run, tous les élèves
 *   node scripts/rewards-backfill.js --all --apply
 *
 * - **Dry-run** (défaut) : rien n'est écrit ; affiche, pour chaque badge et chaque palier, le
 *   nombre d'élèves qui l'obtiendraient. Un badge que personne, ou presque tout le monde,
 *   obtiendrait a des seuils à revoir.
 * - **--apply** : attribue les paliers manquants (`source_type = 'backfill'`) et envoie **une
 *   seule** notification récapitulative par élève (module récompenses allumé).
 */

require('dotenv').config({ quiet: true });
const { evaluateMany, listActiveStudentIds, listAllStudentIds } = require('../lib/rewards/batch');

/** Lignes « badge — palier : n élèves » triées par clé. */
function formatDistribution(summary) {
  const { describeReward } = require('../lib/rewards');
  return Object.entries(summary.byKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => {
      const r = describeReward(key);
      const tier = r?.tier ? ` palier ${r.tier}` : '';
      return `${key.padEnd(26)} ${r ? `${r.emoji} ${r.title}${tier}` : ''} : ${n} élève${n > 1 ? 's' : ''}`;
    });
}

async function main(argv = process.argv.slice(2)) {
  const db = require('../database');
  try {
    const apply = argv.includes('--apply');
    const ids = argv.includes('--all')
      ? await listAllStudentIds(db)
      : await listActiveStudentIds({ db });
    const summary = await evaluateMany(ids, { dryRun: !apply, announce: 'recap', db });
    console.log(
      `${apply ? 'Appliqué' : 'Dry-run'} : ${summary.students} élève(s) évalué(s), ${summary.rewarded} récompensé(s), ${summary.awarded} palier(s)${apply ? `, ${summary.notified} notification(s)` : ''}, ${summary.failures} échec(s).`,
    );
    for (const line of formatDistribution(summary)) console.log(`  ${line}`);
    return summary;
  } finally {
    if (require.main === module) await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, formatDistribution };
