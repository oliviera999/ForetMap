#!/usr/bin/env node
'use strict';

/**
 * Contrôles de passage au temps 3 des retraits de schéma (lecture seule) :
 * `lib/schemaRetirements.js`, procédure dans `docs/RUNBOOK_RETRAITS_T3.md`.
 *
 *   npm run db:t3-status
 *
 * Codes de sortie : 0 = tous les contrôles au vert ; 3 = au moins un candidat pas prêt ;
 * 1 = base injoignable ou erreur. Des contrôles au vert ne suffisent pas : un T3 attend aussi
 * un cycle de production sans retour arrière et une sauvegarde vérifiée (voir le runbook).
 * Lançable sans terminal depuis cPanel → Setup Node.js App → « Run JS Script » → `db:t3-status`.
 */

require('dotenv').config({ quiet: true });

const EXIT_READY = 0;
const EXIT_ERROR = 1;
const EXIT_NOT_READY = 3;

async function main() {
  const database = require('../database');
  const { evaluateT3Readiness, formatT3Report } = require('../lib/schemaRetirements');
  const { getMigrationStatus } = require('../lib/migrationStatus');
  let code = EXIT_ERROR;
  try {
    // Une base en retard n'a pas encore les tables de remplacement : ses contrôles ne disent
    // rien (une table absente y passerait pour « déjà retirée »).
    const schema = await getMigrationStatus(database);
    if (!schema.upToDate) {
      console.log(
        `[db:t3-status] schéma en retard (version ${schema.current}, dernier fichier ` +
          `${schema.latest}) : lancer d'abord npm run db:migrate ; contrôles non significatifs.`,
      );
      code = EXIT_NOT_READY;
    } else {
      const report = await evaluateT3Readiness(database);
      console.log('[db:t3-status] Contrôles de passage au temps 3 (lecture seule)');
      console.log(formatT3Report(report));
      console.log(
        '[db:t3-status] Avant tout T3 : un cycle de production sans retour arrière, une ' +
          'sauvegarde vérifiée, et le retrait du code lecteur dans la même PR ' +
          '(docs/RUNBOOK_RETRAITS_T3.md).',
      );
      code = report.ready ? EXIT_READY : EXIT_NOT_READY;
    }
  } catch (err) {
    console.error(`[db:t3-status] lecture impossible : ${err.message}`);
    code = EXIT_ERROR;
  } finally {
    await database.endPool().catch(() => {});
  }
  process.exit(code);
}

main();
