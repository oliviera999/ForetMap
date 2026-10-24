#!/usr/bin/env node
'use strict';

/**
 * Purge planifiée — applique les durées de conservation (docs/CRONTAB.md, docs/EXPLOITATION.md,
 * docs/reference/exploitation/durees-de-conservation.md).
 *
 *   node scripts/retention-purge.js                          # SIMULATION : comptages seulement
 *   node scripts/retention-purge.js --only=journaux,ip       # simulation de deux catégories
 *   RETENTION_PURGE_APPLY=1 node scripts/retention-purge.js --apply   # exécution réelle
 *
 * Simulation par défaut : une exécution réelle exige `--apply` ET `RETENTION_PURGE_APPLY=1`.
 * Logique, options et codes de sortie : lib/retention/retentionPurge.js.
 *
 * Les journaux applicatifs (Pino) sont coupés pendant l'exécution : les modules d'effacement
 * des comptes y écrivent parfois un identifiant, et la sortie de ce script ne doit en contenir
 * aucun (elle part dans un fichier de journal et dans les alertes e-mail).
 * `RETENTION_PURGE_LOG_LEVEL=warn` les rétablit pour un diagnostic ponctuel.
 */

require('dotenv').config({ quiet: true });
// Avant tout `require` qui charge lib/logger.js.
process.env.LOG_LEVEL = process.env.RETENTION_PURGE_LOG_LEVEL || 'silent';

const { runRetentionPurge } = require('../lib/retention/retentionPurge');
const { sanitizeForOutput } = require('../lib/retention/purgeJournal');

async function main() {
  const { endPool } = require('../database');
  let exitCode = 1;
  try {
    ({ exitCode } = await runRetentionPurge({ argv: process.argv.slice(2), env: process.env }));
  } catch (err) {
    console.error(`[conservation] ÉCHEC : ${sanitizeForOutput(err?.message || err)}`);
    exitCode = 1;
  } finally {
    await endPool().catch(() => {});
  }
  return exitCode;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { main };
