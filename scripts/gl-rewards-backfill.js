#!/usr/bin/env node
'use strict';

/**
 * Gnomes & Licornes — rattrapage des badges individuels sur le moteur commun.
 *
 * Usage :
 *   node scripts/gl-rewards-backfill.js            # dry-run : rien n'est écrit
 *   node scripts/gl-rewards-backfill.js --apply    # convertit `gl_player_badges` puis évalue
 *
 * Conversion des badges hérités (`lib/glRewardsBackfill.js`, `LEGACY_MAP`) : Première page →
 * Trouveur 🧵, Lecteur → Lecteur 🪢, Fouilleur → Fouilleur 🧵, Mains tendues → 🪢, Veilleur →
 * 🪢, Nommeur → 🪢, Cartographe → 🪢, Passeur de seuil → 🧶, Chuchoteur et Correcteur du renard
 * → badges décernés. Puis chaque joueur actif est évalué (paliers manquants). L'ancienne
 * table n'est ni vidée ni supprimée : elle reste en lecture seule.
 */

require('dotenv').config({ quiet: true });

function formatDistribution(byKey) {
  const { glRewards } = require('../lib/glRewards');
  return Object.entries(byKey || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => {
      const r = glRewards.describeReward(key);
      const tier = r?.tier ? ` palier ${r.tier}` : '';
      return `${key.padEnd(28)} ${r ? `${r.emoji} ${r.title}${tier}` : ''} : ${n} joueur${n > 1 ? 's' : ''}`;
    });
}

async function main(argv = process.argv.slice(2)) {
  const db = require('../database');
  try {
    const apply = argv.includes('--apply');
    const { runGlRewardsBackfill } = require('../lib/glRewardsBackfill');
    const summary = await runGlRewardsBackfill({ dryRun: !apply, db });
    const ev = summary.evaluation;
    console.log(
      `${apply ? 'Appliqué' : 'Dry-run'} : ${summary.players} joueur(s), ${summary.legacyRows} badge(s) hérité(s) lu(s), ` +
        `${summary.converted} palier(s) converti(s), ${summary.skipped} déjà présent(s) ou inconnu(s) ; ` +
        `évaluation : ${ev.rewarded} joueur(s) récompensé(s), ${ev.awarded} palier(s), ${ev.failures} échec(s).`,
    );
    for (const line of formatDistribution(ev.byKey)) console.log(`  ${line}`);
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
