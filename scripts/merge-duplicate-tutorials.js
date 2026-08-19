#!/usr/bin/env node
'use strict';

/**
 * Fusionne les tutoriels dont le contenu HTML est identique, en conservant le plus ancien
 * et en repointant tous les liens (audit docs/AUDIT_BDD_2026-08.md §5.4).
 *
 *   node scripts/merge-duplicate-tutorials.js            # à blanc : liste, ne modifie rien
 *   node scripts/merge-duplicate-tutorials.js --apply    # applique la fusion
 *
 * À BLANC PAR DÉFAUT. La fusion supprime des lignes de contenu pédagogique : le titre, le
 * slug et l'ordre d'affichage du doublon disparaissent (le contenu, lui, est par définition
 * identique). C'est une décision éditoriale — d'où l'exécution explicite.
 *
 * Ce que la fusion NE perd pas : lectures attestées, liaisons tâches / zones / marqueurs /
 * projets / questions / glossaire / visite, et références polymorphes du modèle
 * d'apprentissage sont toutes repointées vers le tutoriel conservé avant suppression.
 */

require('dotenv').config({ quiet: true });

const { queryAll, withTransaction, endPool } = require('../database');
const { findDuplicateGroups, mergeTutorialGroup } = require('../lib/tutorialDedup');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

function describe(row) {
  const active = String(row.is_active) === '1' ? 'actif  ' : 'inactif';
  return `id=${String(row.id).padStart(4)}  ${active}  ordre=${String(row.sort_order).padStart(3)}  ${row.slug}  « ${row.title} »`;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const groups = await findDuplicateGroups({ queryAll });

  if (groups.length === 0) {
    console.log('[tutorials:dedup] Aucun doublon de contenu. Rien à faire.');
    return;
  }

  const totalDrop = groups.reduce((n, g) => n + g.drop.length, 0);
  console.log(
    `[tutorials:dedup] ${groups.length} groupe(s) de contenu identique, ${totalDrop} tutoriel(s) en trop.\n`,
  );
  for (const group of groups) {
    console.log(`  CONSERVÉ  ${describe(group.keep)}   (${group.keep.content_length} caractères)`);
    for (const row of group.drop) console.log(`  fusionné  ${describe(row)}`);
    console.log('');
  }

  if (!apply) {
    console.log('[tutorials:dedup] Exécution à blanc — rien n’a été modifié.');
    console.log('[tutorials:dedup] Relancer avec --apply pour appliquer la fusion.');
    return;
  }

  for (const group of groups) {
    const dropIds = group.drop.map((r) => Number(r.id));
    const result = await withTransaction((tx) =>
      mergeTutorialGroup(tx, Number(group.keep.id), dropIds),
    );
    const relinked = Object.entries(result.relinked)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${table}:${n}`)
      .join(' ');
    console.log(
      `[tutorials:dedup] id=${group.keep.id} ← ${dropIds.join(', ')} · supprimés=${result.deleted}` +
        (relinked ? ` · repointés ${relinked}` : ' · aucun lien à repointer'),
    );
  }
  console.log('\n[tutorials:dedup] Fusion appliquée.');
}

main()
  .then(async () => {
    await endPool().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`[tutorials:dedup] Erreur: ${err?.message || err}`);
    await endPool().catch(() => {});
    process.exit(1);
  });
