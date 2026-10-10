'use strict';

/**
 * Catégorie `desactivations` — cohérence de `users.deactivated_at` (date de départ constaté).
 *
 * Les chemins connus posent la date au passage actif → inactif (lib/accounts/deactivation.js).
 * Cette étape rattrape les autres, avant les purges de comptes :
 *   - compte inactif sans date : daté du jour (la suppression viendra 12 mois APRÈS ce
 *     rattrapage — un retard, jamais une avance) ;
 *   - compte actif portant une date : date effacée (réactivé par un chemin qui l'ignorait).
 *
 * `updated_at = updated_at` : la date de dernière modification du compte n'est pas touchée.
 */

const { runInBatches } = require('../batches');

const UNDATED_WHERE =
  "is_active = 0 AND deactivated_at IS NULL AND user_type IN ('student', 'teacher')";
const STALE_WHERE = 'is_active = 1 AND deactivated_at IS NOT NULL';

async function count(db, where) {
  const row = await db.queryOne(`SELECT COUNT(*) AS n FROM users WHERE ${where}`);
  return Number(row?.n || 0);
}

module.exports = {
  key: 'desactivations',
  label: 'dates de départ',
  async run({ apply, db, options, log }) {
    if (!apply) {
      const undated = await count(db, UNDATED_WHERE);
      const stale = await count(db, STALE_WHERE);
      log(
        `${undated} compte(s) désactivé(s) à dater, ${stale} date(s) à effacer (comptes actifs).`,
      );
      return { counts: { non_datees: undated, dates_obsoletes: stale } };
    }
    const undated = await runInBatches(options.rowBatchSize, (limit) =>
      db.execute(
        `UPDATE users SET deactivated_at = NOW(), updated_at = updated_at WHERE ${UNDATED_WHERE} LIMIT ${limit}`,
      ),
    );
    const stale = await runInBatches(options.rowBatchSize, (limit) =>
      db.execute(
        `UPDATE users SET deactivated_at = NULL, updated_at = updated_at WHERE ${STALE_WHERE} LIMIT ${limit}`,
      ),
    );
    log(`${undated} compte(s) désactivé(s) daté(s), ${stale} date(s) effacée(s) (comptes actifs).`);
    return { counts: { non_datees: undated, dates_obsoletes: stale } };
  },
};
