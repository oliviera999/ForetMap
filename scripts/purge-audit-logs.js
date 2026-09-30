#!/usr/bin/env node
'use strict';

/**
 * Purge des journaux au-delà d'une durée de conservation (audit docs/AUDIT_BDD_2026-08.md §5.2,
 * étendu par docs/AUDIT_STABILITE_PERF_2026-09.md §C3, puis par le constat RG2 de
 * docs/AUDIT_SECURITE_RGPD_2026-09-30.md — conservation limitée, RGPD art. 5-1-e).
 *
 *   node scripts/purge-audit-logs.js                 # à blanc : compte, ne supprime rien
 *   node scripts/purge-audit-logs.js --apply         # supprime au-delà des rétentions par défaut
 *   node scripts/purge-audit-logs.js --days=180 --history-days=730 --activity-days=90 --apply
 *
 * Pourquoi : `security_events` conservait sans limite l'adresse IP et le user-agent de chaque
 * connexion — des données personnelles, dans un établissement scolaire, sur des comptes de
 * mineurs. `audit_log` grossit de même. Et deux tables de contenu croissent elles aussi sans
 * borne (§C3) : `gl_game_events` (une ligne par action de jeu G&L) et `zone_history`
 * (historique des récoltes) — sans purge, elles pèsent sur les sauvegardes (`db-backup.sh`),
 * la durée des `mysqldump` et l'espace disque du compte.
 *
 * Rétentions DISTINCTES, chacune configurable (option, sinon variable d'environnement) :
 *   --days=N           journaux de sécurité (`audit_log`, `security_events`, `elevation_audit`)
 *                      — défaut 365 j (FORETMAP_RETENTION_SECURITY_DAYS) ;
 *   --history-days=N   historiques de jeu et de jardin — défaut 365 j
 *                      (FORETMAP_RETENTION_HISTORY_DAYS) ;
 *   --activity-days=N  journal d'activité légère (`user_activity_events`) — défaut 90 j
 *                      (FORETMAP_RETENTION_ACTIVITY_DAYS) ;
 *   --sync-days=N      synchronisation Moodle terminée ou résolue (`sync_runs` et leurs
 *                      `sync_actions`, `sync_pending_matches` et `sync_conflicts` résolus,
 *                      qui portent des fiches Moodle complètes) — défaut 365 j (12 mois)
 *                      (FORETMAP_RETENTION_SYNC_DAYS) ;
 *   --visits-days=N    ouvertures des applications (`user_product_visits`) — défaut 395 j
 *                      (13 mois, durée CNIL des traceurs de mesure d'audience)
 *                      (FORETMAP_RETENTION_VISITS_DAYS) ;
 *   --guest-days=N     réponses QCM des **invités** G&L (`gl_qcm_attempts`, lecteur
 *                      `gl_guest`) — défaut 30 j (FORETMAP_RETENTION_GUEST_DAYS) ;
 *   --ip-days=N        au-delà, l'IP de `security_events` est **tronquée** (IPv4 → /24,
 *                      IPv6 → /48) et le user-agent effacé — défaut 183 j (6 mois)
 *                      (FORETMAP_RETENTION_IP_DAYS). `audit_log` ne stocke ni IP ni UA.
 * Rétention fixe d'un jour pour les traces transitoires : jetons QCM consommés
 * (`gl_qcm_presentation_uses`, invités compris — la table ne porte pas de lecteur) et jetons de
 * réinitialisation de mot de passe (`password_reset_tokens`) utilisés ou expirés.
 *
 * Une table absente (`elevation_audit`, supprimée par la migration 164 et au démarrage ;
 * installation en retard de migration) est signalée et ignorée, sans faire échouer la purge.
 *
 * À BLANC PAR DÉFAUT : une purge est irréversible. Prévu pour un cron mensuel une fois la
 * durée validée (voir docs/CRONTAB.md — la ligne de purge n'y est PAS optionnelle).
 *
 * Subtilité de fuseau, assumée : `audit_log.created_at` est comparé à une borne ISO-8601 UTC,
 * tandis que `security_events.occurred_at` et `gl_game_events.created_at` sont des DATETIME
 * en heure locale serveur ; `zone_history.harvested_at` est une DATE (`YYYY-MM-DD`) dans un
 * VARCHAR. Chaque table est donc filtrée dans SON référentiel — sur une borne exprimée en
 * jours, l'écart d'une heure ou deux est sans portée.
 */

const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_HISTORY_RETENTION_DAYS = 365;
const DEFAULT_ACTIVITY_RETENTION_DAYS = 90;
const DEFAULT_SYNC_RETENTION_DAYS = 365;
const DEFAULT_VISITS_RETENTION_DAYS = 395;
const DEFAULT_GUEST_RETENTION_DAYS = 30;
const DEFAULT_IP_RETENTION_DAYS = 183;
const MIN_RETENTION_DAYS = 30;

/** Option CLI → clé de résultat, variable d'environnement, défaut. */
const RETENTION_OPTIONS = Object.freeze([
  {
    flag: '--days=',
    key: 'days',
    env: 'FORETMAP_RETENTION_SECURITY_DAYS',
    def: DEFAULT_RETENTION_DAYS,
  },
  {
    flag: '--history-days=',
    key: 'historyDays',
    env: 'FORETMAP_RETENTION_HISTORY_DAYS',
    def: DEFAULT_HISTORY_RETENTION_DAYS,
  },
  {
    flag: '--activity-days=',
    key: 'activityDays',
    env: 'FORETMAP_RETENTION_ACTIVITY_DAYS',
    def: DEFAULT_ACTIVITY_RETENTION_DAYS,
  },
  {
    flag: '--sync-days=',
    key: 'syncDays',
    env: 'FORETMAP_RETENTION_SYNC_DAYS',
    def: DEFAULT_SYNC_RETENTION_DAYS,
  },
  {
    flag: '--visits-days=',
    key: 'visitsDays',
    env: 'FORETMAP_RETENTION_VISITS_DAYS',
    def: DEFAULT_VISITS_RETENTION_DAYS,
  },
  {
    flag: '--guest-days=',
    key: 'guestDays',
    env: 'FORETMAP_RETENTION_GUEST_DAYS',
    def: DEFAULT_GUEST_RETENTION_DAYS,
  },
  {
    flag: '--ip-days=',
    key: 'ipDays',
    env: 'FORETMAP_RETENTION_IP_DAYS',
    def: DEFAULT_IP_RETENTION_DAYS,
  },
]);

function parseArgs(argv, env = {}) {
  const out = { apply: false };
  for (const opt of RETENTION_OPTIONS) {
    const fromEnv = String(env?.[opt.env] ?? '').trim();
    out[opt.key] = fromEnv ? Number.parseInt(fromEnv, 10) : opt.def;
  }
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') {
      out.apply = true;
      continue;
    }
    const opt = RETENTION_OPTIONS.find((o) => arg.startsWith(o.flag));
    if (opt) out[opt.key] = Number.parseInt(arg.slice(opt.flag.length), 10);
  }
  return out;
}

/**
 * Journaux et historiques, rétentions (`retention`) distinctes, référentiels de temps propres.
 * Chaque `?` d'une clause reçoit la durée de la rétention de la cible.
 */
const TARGETS = [
  {
    table: 'audit_log',
    retention: 'security',
    // Borne ISO-8601 UTC ; MariaDB la convertit pour la comparer à la colonne.
    where: "created_at < DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT%H:%i:%s.000Z')",
  },
  {
    table: 'security_events',
    retention: 'security',
    // DATETIME en heure locale serveur (voir routes/audit.js).
    where: 'occurred_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    // Ancien mode PIN : table supprimée au démarrage, purgée si une installation la porte.
    table: 'elevation_audit',
    retention: 'security',
    where: 'created_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'user_activity_events',
    retention: 'activity',
    where: 'occurred_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'gl_game_events',
    retention: 'history',
    // DATETIME en heure locale serveur (migration 081).
    where: 'created_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'zone_history',
    retention: 'history',
    // DATE `YYYY-MM-DD` dans un VARCHAR : comparaison lexicographique valide.
    where: "harvested_at < DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y-%m-%d')",
  },
  // --- Conditionnement des lectures (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, C6) ---------------
  {
    table: 'gl_qcm_presentation_uses',
    retention: 'transient',
    where: 'used_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'resource_gating_cooldowns',
    retention: 'history',
    where: 'locked_until < NOW() AND updated_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'gl_resource_gating_cooldowns',
    retention: 'history',
    where: 'locked_until < NOW() AND updated_at < (NOW() - INTERVAL ? DAY)',
  },
  // --- Conservation RGPD (docs/AUDIT_SECURITE_RGPD_2026-09-30.md, RG2) ----------------------
  {
    // Jeton utilisé OU expiré depuis plus d'un jour : min(used_at, expires_at) < borne.
    table: 'password_reset_tokens',
    retention: 'transient',
    where: 'LEAST(COALESCE(used_at, expires_at), expires_at) < (NOW() - INTERVAL ? DAY)',
  },
  {
    // Actions d'une synchronisation terminée (avant le run : la cascade les emporterait sans
    // qu'on les compte).
    table: 'sync_actions',
    retention: 'sync',
    where:
      "run_id IN (SELECT r.id FROM sync_runs r WHERE r.status <> 'running' " +
      'AND COALESCE(r.finished_at, r.started_at) < (NOW() - INTERVAL ? DAY))',
  },
  {
    table: 'sync_runs',
    retention: 'sync',
    where: "status <> 'running' AND COALESCE(finished_at, started_at) < (NOW() - INTERVAL ? DAY)",
  },
  {
    // Fiche Moodle complète (`external_snapshot_json`) : seulement une fois tranchée.
    table: 'sync_pending_matches',
    retention: 'sync',
    where: 'resolved_at IS NOT NULL AND resolved_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'sync_conflicts',
    retention: 'sync',
    where: 'resolved_at IS NOT NULL AND resolved_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    table: 'user_product_visits',
    retention: 'visits',
    where: 'last_seen_at < (NOW() - INTERVAL ? DAY)',
  },
  {
    // Invités G&L (GL8) : aucune raison de garder leurs réponses au-delà d'un mois.
    table: 'gl_qcm_attempts',
    retention: 'guest',
    where: "reader_user_type = 'gl_guest' AND answered_at < (NOW() - INTERVAL ? DAY)",
  },
];

/** Rétention des traces transitoires (jetons consommés) : fixe, non paramétrable. */
const TRANSIENT_RETENTION_DAYS = 1;

function retentionDaysFor(target, retentions) {
  const {
    days,
    historyDays,
    activityDays,
    syncDays = DEFAULT_SYNC_RETENTION_DAYS,
    visitsDays = DEFAULT_VISITS_RETENTION_DAYS,
    guestDays = DEFAULT_GUEST_RETENTION_DAYS,
  } = retentions;
  switch (target.retention) {
    case 'transient':
      return TRANSIENT_RETENTION_DAYS;
    case 'activity':
      return activityDays;
    case 'history':
      return historyDays;
    case 'sync':
      return syncDays;
    case 'visits':
      return visitsDays;
    case 'guest':
      return guestDays;
    default:
      return days;
  }
}

/** Paramètres d'une clause : la durée, une fois par `?`. */
function paramsFor(where, retentionDays) {
  const count = (String(where).match(/\?/g) || []).length;
  return Array.from({ length: count }, () => retentionDays);
}

function assertRetention(label, days) {
  if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
    throw new Error(
      `Durée de conservation ${label} invalide (${days}). Minimum ${MIN_RETENTION_DAYS} jours — ` +
        'une purge plus agressive effacerait des traces encore utiles à une investigation.',
    );
  }
}

// --- Troncature des adresses IP ------------------------------------------------------------

/** Développe une IPv6 (forme compressée acceptée) en huit groupes, ou `null`. */
function expandIpv6(ip) {
  const parts = String(ip).split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

/**
 * Adresse tronquée : IPv4 → /24 (`192.0.2.0`), IPv6 → /48 (`2001:db8:1::`). Une IPv4
 * encapsulée (`::ffff:192.0.2.7`, forme que rend Express) est tronquée comme une IPv4.
 * Idempotent. Une valeur illisible devient `null` (mieux vaut perdre la trace que la garder).
 * @param {string|null} ip
 * @returns {string|null}
 */
function truncateIp(ip) {
  const raw = String(ip == null ? '' : ip).trim();
  if (!raw) return null;
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(raw);
  if (v4) {
    const octets = v4.slice(1, 4).map(Number);
    if (octets.some((o) => o > 255) || Number(v4[4]) > 255) return null;
    return `${octets.join('.')}.0`;
  }
  const groups = expandIpv6(raw.replace(/%.*$/, ''));
  if (!groups) return null;
  return `${groups.slice(0, 3).join(':')}::`;
}

const IP_BATCH_SIZE = 500;

/**
 * Au-delà de `ipDays` : IP tronquée, user-agent effacé, dans `security_events`. Seules les
 * lignes encore porteuses d'un user-agent ou d'une IP non tronquée sont relues.
 * @returns {Promise<number>} lignes concernées (à blanc) ou modifiées
 */
async function truncateSecurityEventIps({ queryAll, queryOne, execute }, ipDays, apply) {
  const stale =
    'occurred_at < (NOW() - INTERVAL ? DAY) AND (user_agent IS NOT NULL OR ' +
    "(ip_address IS NOT NULL AND ip_address NOT LIKE '%.0' AND ip_address NOT LIKE '%::'))";
  if (!apply) {
    const row = await queryOne(`SELECT COUNT(*) AS n FROM security_events WHERE ${stale}`, [
      ipDays,
    ]);
    return Number(row?.n || 0);
  }
  let total = 0;
  let lastId = 0;
  for (;;) {
    const rows = await queryAll(
      `SELECT id, ip_address FROM security_events WHERE ${stale} AND id > ? ORDER BY id LIMIT ${IP_BATCH_SIZE}`,
      [ipDays, lastId],
    );
    if (!rows.length) break;
    for (const row of rows) {
      await execute('UPDATE security_events SET ip_address = ?, user_agent = NULL WHERE id = ?', [
        truncateIp(row.ip_address),
        row.id,
      ]);
      lastId = Number(row.id);
    }
    total += rows.length;
  }
  return total;
}

function isMissingTableError(err) {
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146;
}

/**
 * Purge et anonymisation, sur des accès base injectés (tests) ou ceux de `database.js`.
 * @returns {Promise<{ deleted: Record<string, number>, purgeable: Record<string, number>,
 *   missing: string[], ipRows: number }>}
 */
async function runPurge(options, db, log = (line) => console.log(line)) {
  const { apply, days, historyDays, activityDays, syncDays, visitsDays, guestDays, ipDays } =
    options;
  assertRetention('sécurité (--days)', days);
  assertRetention('historiques (--history-days)', historyDays);
  assertRetention('activité (--activity-days)', activityDays);
  assertRetention('synchronisation (--sync-days)', syncDays);
  assertRetention('visites (--visits-days)', visitsDays);
  assertRetention('invités G&L (--guest-days)', guestDays);
  assertRetention('troncature IP (--ip-days)', ipDays);

  log(
    `[purge-logs] Conservation : sécurité ${days} j, historiques ${historyDays} j, ` +
      `activité ${activityDays} j, synchro ${syncDays} j, visites ${visitsDays} j, ` +
      `invités G&L ${guestDays} j, IP complètes ${ipDays} j. ` +
      `Mode : ${apply ? 'APPLICATION' : 'à blanc'}.`,
  );

  const report = { deleted: {}, purgeable: {}, missing: [], ipRows: 0 };
  let totalDeleted = 0;
  for (const target of TARGETS) {
    const retentionDays = retentionDaysFor(target, options);
    const params = paramsFor(target.where, retentionDays);
    let count;
    try {
      const row = await db.queryOne(
        `SELECT COUNT(*) AS n FROM ${target.table} WHERE ${target.where}`,
        params,
      );
      count = Number(row?.n || 0);
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      report.missing.push(target.table);
      log(`[purge-logs] ${target.table} : table absente, ignorée.`);
      continue;
    }
    report.purgeable[target.table] = (report.purgeable[target.table] || 0) + count;
    if (count === 0) {
      log(`[purge-logs] ${target.table} : rien à purger.`);
      continue;
    }
    if (!apply) {
      log(`[purge-logs] ${target.table} : ${count} ligne(s) purgeable(s).`);
      continue;
    }
    const result = await db.execute(`DELETE FROM ${target.table} WHERE ${target.where}`, params);
    const deleted = Number(result?.affectedRows || 0);
    report.deleted[target.table] = (report.deleted[target.table] || 0) + deleted;
    totalDeleted += deleted;
    log(`[purge-logs] ${target.table} : ${deleted} ligne(s) supprimée(s).`);
  }

  report.ipRows = await truncateSecurityEventIps(db, ipDays, apply);
  log(
    `[purge-logs] security_events : ${report.ipRows} ligne(s) ` +
      `${apply ? 'anonymisée(s)' : 'à anonymiser'} (IP tronquée, navigateur effacé).`,
  );

  if (!apply) {
    log('[purge-logs] Exécution à blanc — rien n’a été supprimé.');
    log('[purge-logs] Relancer avec --apply pour purger.');
  } else {
    log(`[purge-logs] Terminé — ${totalDeleted} ligne(s) supprimée(s).`);
  }
  return report;
}

async function main() {
  const { queryAll, queryOne, execute, endPool } = require('../database');
  const options = parseArgs(process.argv.slice(2), process.env);
  try {
    await runPurge(options, { queryAll, queryOne, execute });
  } finally {
    await endPool().catch(() => {});
  }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[purge-logs] Erreur: ${err?.message || err}`);
      process.exit(1);
    });
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_HISTORY_RETENTION_DAYS,
  DEFAULT_ACTIVITY_RETENTION_DAYS,
  DEFAULT_SYNC_RETENTION_DAYS,
  DEFAULT_VISITS_RETENTION_DAYS,
  DEFAULT_GUEST_RETENTION_DAYS,
  DEFAULT_IP_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  RETENTION_OPTIONS,
  parseArgs,
  TARGETS,
  assertRetention,
  TRANSIENT_RETENTION_DAYS,
  retentionDaysFor,
  paramsFor,
  truncateIp,
  truncateSecurityEventIps,
  runPurge,
};
