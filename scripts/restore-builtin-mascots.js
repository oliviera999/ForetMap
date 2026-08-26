#!/usr/bin/env node
/**
 * Restauration des **mascottes livrées supprimées** au studio.
 *
 * Supprimer une mascotte livrée est définitif par construction : sans trace de la suppression,
 * le semis la réinsérerait au prochain `npm run db:migrate` et le bouton « Supprimer » se
 * serait annulé tout seul. La trace vit dans `visit_mascot_pack_deletions`.
 *
 * Ce script est le retour en arrière. Il est **hors du studio** à dessein : y remettre une liste
 * de « mascottes livrées disponibles » recréerait la seconde liste que la fusion catalogue /
 * packs a précisément supprimée.
 *
 * Ce qu'il rend : l'apparence **d'origine** des mascottes effacées, telle que le catalogue en
 * code la décrit. Pas les modifications qu'on leur avait apportées, ni leurs images téléversées —
 * celles-là sont parties avec la suppression.
 *
 * Par défaut, dry-run (aucune écriture).
 *
 * Usage:
 *   node scripts/restore-builtin-mascots.js
 *   node scripts/restore-builtin-mascots.js --apply
 *   node scripts/restore-builtin-mascots.js --json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { endPool } = require('../database');
const {
  listDeletedBuiltinCatalogIds,
  clearBuiltinMascotDeletions,
  seedBuiltinMascotPacks,
} = require('../lib/visitMascotBuiltinSeed');

function parseFlags(argv) {
  return {
    apply: argv.includes('--apply'),
    json: argv.includes('--json'),
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const supprimees = [...(await listDeletedBuiltinCatalogIds())].sort();

  const report = {
    applied: false,
    deleted: supprimees,
    restored: [],
  };

  if (supprimees.length === 0 || !flags.apply) {
    if (flags.json) return void console.log(JSON.stringify(report));
    if (supprimees.length === 0) {
      console.log('✅ Aucune mascotte livrée supprimée — rien à restaurer.');
      return;
    }
    console.log(
      `🔍 Dry-run — ${supprimees.length} mascotte(s) livrée(s) supprimée(s) : ${supprimees.join(', ')}`,
    );
    console.log('   Relancer avec --apply pour les restaurer.');
    return;
  }

  await clearBuiltinMascotDeletions();
  // Le semis ne réinsère que ce qui est absent : les mascottes livrées encore présentes ne sont
  // pas touchées, et celles qu'on vient d'oublier reviennent à leur apparence d'origine.
  const bilan = await seedBuiltinMascotPacks();
  report.applied = true;
  report.restored = supprimees.filter((id) => bilan.inserted.includes(id));

  if (flags.json) return void console.log(JSON.stringify({ ...report, seed: bilan }));

  console.log(`✅ ${report.restored.length} mascotte(s) livrée(s) restaurée(s).`);
  if (report.restored.length > 0) console.log(`   ${report.restored.join(', ')}`);
  const manquantes = supprimees.filter((id) => !report.restored.includes(id));
  if (manquantes.length > 0) {
    // Cas réel : la mascotte a disparu du catalogue en code depuis sa suppression. Oublier la
    // suppression ne suffit alors pas à la faire revenir — il n'y a plus de graine.
    console.log(
      `   ⚠️ Sans effet pour : ${manquantes.join(', ')} — ces identifiants ne figurent plus au catalogue livré.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌ Échec de la restauration :', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof endPool === 'function') await Promise.resolve(endPool()).catch(() => {});
  });
