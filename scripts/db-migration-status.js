#!/usr/bin/env node
'use strict';

/**
 * Indique si la base est en retard sur les fichiers de `migrations/`.
 *
 *   npm run db:status            # affiche « schéma 299 / dernier fichier 301 : 2 en attente »
 *   node scripts/db-migration-status.js --quiet   # rien à l'écran, seulement le code de sortie
 *
 * Codes de sortie (le cron de déploiement s'en sert, scripts/auto-deploy-cron.sh) :
 *   0 = à jour ; 3 = migrations en attente ; 1 = base injoignable ou erreur ;
 *   4 = migration(s) ignorée(s) : numéro inférieur à `schema_version`, jamais appliquée(s), à
 *       renuméroter (audit du 19/11/2026, S13). `db:migrate` n'y peut rien : le cron, qui ne
 *       migre que sur le code 3, ne boucle donc pas dessus.
 *
 * Contrôle d'écart du schéma (flux F7) : sauf en `--quiet`, le script compare aussi la
 * structure réelle à l'empreinte versionnée (`sql/schema_fingerprint.json`) et liste les
 * tables, colonnes, index et valeurs d'ENUM / SET en plus ou en moins, « à reprendre en
 * migration ». **Informatif seulement** : le code de sortie n'en dépend jamais (le cron de
 * déploiement ne doit ni migrer ni s'arrêter pour un écart de structure).
 *
 * Lecture seule : ce script n'applique rien. Pour migrer : `npm run db:migrate`.
 * Lançable sans terminal depuis cPanel → Setup Node.js App → « Run JS Script » → `db:status`.
 */

require('dotenv').config({ quiet: true });

const EXIT_UP_TO_DATE = 0;
const EXIT_ERROR = 1;
const EXIT_PENDING = 3;
const EXIT_SKIPPED = 4;

/** Écart de structure avec le schéma attendu : informatif, n'influe pas sur le code de sortie. */
function reportDrift(drift, say) {
  if (!drift) return;
  if (!drift.available) {
    say(`[db:status] contrôle d'écart du schéma indisponible : ${drift.reason}.`);
    return;
  }
  if (drift.ok) {
    say('[db:status] structure conforme au schéma attendu (aucun écart prod/dépôt).');
    return;
  }
  say(`[db:status] ${drift.total} écart(s) de structure avec le schéma attendu (informatif) :`);
  for (const line of drift.messages) say(`  - ${line}`);
  if (drift.stale) {
    say('[db:status] base en retard sur les migrations : une partie de ces écarts est attendue.');
  }
}

async function main() {
  const quiet = process.argv.includes('--quiet');
  const say = (message) => {
    if (!quiet) console.log(message);
  };
  const database = require('../database');
  const { getMigrationStatus } = require('../lib/migrationStatus');
  let code = EXIT_ERROR;
  try {
    const status = await getMigrationStatus(database, { includeDrift: !quiet });
    const skipped = Array.isArray(status.skipped) ? status.skipped : [];
    if (status.upToDate) {
      say(`[db:status] schéma à jour (version ${status.current}).`);
      code = EXIT_UP_TO_DATE;
    } else if (status.pending.length === 0 && skipped.length > 0) {
      say(
        `[db:status] schéma PAS à jour : ${skipped.length} migration(s) jamais appliquée(s), de ` +
          `numéro inférieur à la version ${status.current} (${skipped.join(', ')}).`,
      );
      say('[db:status] db:migrate ne les rejouera pas : les renuméroter au-dessus de la version.');
      code = EXIT_SKIPPED;
    } else {
      const current = status.current === null ? 'aucune' : status.current;
      say(
        `[db:status] schéma en retard : version ${current}, dernier fichier ${status.latest} — ` +
          `${status.pending.length} migration(s) en attente (${status.pending.join(', ')}).`,
      );
      say('[db:status] Pour les appliquer : npm run db:migrate (après une sauvegarde vérifiée).');
      if (skipped.length > 0) {
        say(`[db:status] Également jamais appliquée(s), à renuméroter : ${skipped.join(', ')}.`);
      }
      code = EXIT_PENDING;
    }
    if (!quiet) reportDrift(status.drift, say);
  } catch (err) {
    if (!quiet) console.error(`[db:status] lecture impossible : ${err.message}`);
    code = EXIT_ERROR;
  } finally {
    await database.endPool().catch(() => {});
  }
  process.exit(code);
}

main();
