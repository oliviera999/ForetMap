#!/usr/bin/env node
'use strict';

/**
 * Indique si la base est en retard sur les fichiers de `migrations/`.
 *
 *   npm run db:status            # affiche « schéma 299 / dernier fichier 301 : 2 en attente »
 *   node scripts/db-migration-status.js --quiet   # rien à l'écran, seulement le code de sortie
 *
 * Codes de sortie (le cron de déploiement s'en sert, scripts/auto-deploy-cron.sh) :
 *   0 = à jour ; 3 = migrations en attente ; 1 = base injoignable ou erreur.
 *
 * Lecture seule : ce script n'applique rien. Pour migrer : `npm run db:migrate`.
 * Lançable sans terminal depuis cPanel → Setup Node.js App → « Run JS Script » → `db:status`.
 */

require('dotenv').config({ quiet: true });

const EXIT_UP_TO_DATE = 0;
const EXIT_ERROR = 1;
const EXIT_PENDING = 3;

async function main() {
  const quiet = process.argv.includes('--quiet');
  const say = (message) => {
    if (!quiet) console.log(message);
  };
  const database = require('../database');
  const { getMigrationStatus } = require('../lib/migrationStatus');
  let code = EXIT_ERROR;
  try {
    const status = await getMigrationStatus(database);
    if (status.upToDate) {
      say(`[db:status] schéma à jour (version ${status.current}).`);
      code = EXIT_UP_TO_DATE;
    } else {
      const current = status.current === null ? 'aucune' : status.current;
      say(
        `[db:status] schéma en retard : version ${current}, dernier fichier ${status.latest} — ` +
          `${status.pending.length} migration(s) en attente (${status.pending.join(', ')}).`,
      );
      say('[db:status] Pour les appliquer : npm run db:migrate (après une sauvegarde vérifiée).');
      code = EXIT_PENDING;
    }
  } catch (err) {
    if (!quiet) console.error(`[db:status] lecture impossible : ${err.message}`);
    code = EXIT_ERROR;
  } finally {
    await database.endPool().catch(() => {});
  }
  process.exit(code);
}

main();
