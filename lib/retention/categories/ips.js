'use strict';

/**
 * Catégorie `ip` — troncature des adresses IP des journaux au-delà de 3 mois (défaut 90 jours,
 * `--ip-days=` / `FORETMAP_RETENTION_IP_DAYS`, 12 mois au plus) :
 *   - `security_events.ip_address` : IPv4 → /24 (`192.0.2.0`), IPv6 → /48 (`2001:db8:1::`),
 *     navigateur (`user_agent`) effacé ;
 *   - `payload_json.ip` de `security_events` et d'`audit_log` (IP recopiée dans les données
 *     complémentaires) : tronquée de même.
 *
 * Pourquoi 3 mois : une IP complète sert à analyser un problème de sécurité récent ; au-delà,
 * le préfixe suffit aux statistiques (réseau de l'établissement ou non) et ne désigne plus un
 * appareil. La ligne elle-même reste jusqu'à la fin de sa durée de conservation (12 mois).
 *
 * La durée est lue dans les options préparées par la catégorie `journaux` (mêmes options que
 * l'outil manuel `scripts/purge-audit-logs.js`).
 */

const purgeLogs = require('../../../scripts/purge-audit-logs');

module.exports = {
  key: 'ip',
  label: 'adresses IP',
  async run({ apply, db, options, log }) {
    const ipDays = options.journalRetentions?.ipDays ?? purgeLogs.DEFAULT_IP_RETENTION_DAYS;
    purgeLogs.assertRetention('troncature IP (--ip-days)', ipDays, {
      max: purgeLogs.MAX_JOURNAL_RETENTION_DAYS,
    });
    const result = await purgeLogs.truncateJournalIps(db, ipDays, apply);
    log(
      `${result.total} ligne(s) ${apply ? 'anonymisée(s)' : 'à anonymiser'} au-delà de ` +
        `${ipDays} jours (journal de sécurité : ${result.securityEvents} ; données ` +
        `complémentaires : ${Object.entries(result.payloads)
          .map(([table, n]) => `${table} ${n}`)
          .join(', ')}).`,
    );
    return {
      counts: {
        jours: ipDays,
        total: result.total,
        security_events: result.securityEvents,
        donnees_complementaires: result.payloads,
      },
    };
  },
};
