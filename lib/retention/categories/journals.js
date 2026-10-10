'use strict';

/**
 * Catégorie `journaux` — journaux et traces d'activité au-delà de leur durée de conservation,
 * 12 mois au plus : journal de sécurité et journal d'audit, journal d'activité, ouvertures des
 * applications, compteurs d'usage, synchronisations Moodle terminées, réponses des invités du
 * jeu, jetons consommés ; et les historiques de contenu (récoltes, parties).
 *
 * Les cibles, les durées par défaut, leurs options (`--days=`, `--activity-days=`…) et leurs
 * variables `FORETMAP_RETENTION_…` sont celles de l'outil manuel `scripts/purge-audit-logs.js`
 * (une seule liste à maintenir). Suppression en lots bornés (`--row-batch-size=`).
 */

const purgeLogs = require('../../../scripts/purge-audit-logs');

const OPTION_FLAGS = purgeLogs.RETENTION_OPTIONS.map((o) => o.flag);

module.exports = {
  key: 'journaux',
  label: 'journaux',
  /** Options de durée reconnues : celles de `purge-audit-logs.js`. */
  parseArg(arg, out) {
    if (!OPTION_FLAGS.some((flag) => arg.startsWith(flag))) return false;
    out.journalArgs = [...(out.journalArgs || []), arg];
    return true;
  },
  /** Durées (option, sinon `.env`, sinon défaut) contrôlées avant toute écriture. */
  prepareOptions(options, env) {
    const parsed = purgeLogs.parseArgs(options.journalArgs || [], env);
    delete parsed.apply;
    purgeLogs.assertRetentions(parsed);
    options.journalRetentions = parsed;
    delete options.journalArgs;
  },
  async run({ apply, db, options, log }) {
    const report = await purgeLogs.purgeTargets(
      { ...options.journalRetentions, apply, batchSize: options.rowBatchSize },
      db,
      log,
    );
    const lignes = apply ? report.deleted : report.purgeable;
    const total = Object.values(lignes).reduce((a, b) => a + b, 0);
    log(
      apply
        ? `${total} ligne(s) supprimée(s) au total.`
        : `${total} ligne(s) au-delà de leur durée de conservation (simulation).`,
    );
    return { counts: { total, tables: lignes, tables_absentes: report.missing } };
  },
};
