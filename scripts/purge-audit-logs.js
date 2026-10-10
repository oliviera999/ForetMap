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
 *   --visits-days=N    ouvertures des applications (`user_product_visits`) et compteurs
 *                      d'usage anonymes (`usage_counters`) — défaut 365 j (12 mois)
 *                      (FORETMAP_RETENTION_VISITS_DAYS) ;
 *   --guest-days=N     réponses QCM des **invités** G&L (`gl_qcm_attempts`, lecteur
 *                      `gl_guest`) — défaut 30 j (FORETMAP_RETENTION_GUEST_DAYS) ;
 *   --ip-days=N        au-delà, l'IP de `security_events` est **tronquée** (IPv4 → /24,
 *                      IPv6 → /48) et le user-agent effacé ; l'IP recopiée dans les données
 *                      complémentaires (`payload_json.ip`) de `security_events` et
 *                      d'`audit_log` est tronquée de même — défaut 90 j (3 mois)
 *                      (FORETMAP_RETENTION_IP_DAYS). `audit_log` n'a pas de colonne IP.
 * Rétention fixe d'un jour pour les traces transitoires : jetons QCM consommés
 * (`gl_qcm_presentation_uses`, invités compris — la table ne porte pas de lecteur) et jetons de
 * réinitialisation de mot de passe (`password_reset_tokens`) utilisés ou expirés.
 *
 * Une table absente (`elevation_audit`, supprimée par la migration 164 et au démarrage ;
 * installation en retard de migration) est signalée et ignorée, sans faire échouer la purge.
 *
 * JOURNAUX : 12 MOIS AU PLUS. Les durées des journaux et traces d'activité (sécurité, activité,
 * synchronisation, visites, invités, IP complètes) sont refusées au-delà de 365 jours
 * ({@link MAX_JOURNAL_RETENTION_DAYS}) : un réglage plus long dans le `.env` fait échouer la
 * purge (et alerter) plutôt que de conserver en silence. Les historiques de contenu
 * (`--history-days`) ne sont pas des journaux et restent réglables librement.
 *
 * LOTS BORNÉS : chaque suppression est une suite de `DELETE … LIMIT n` (défaut
 * {@link DEFAULT_DELETE_BATCH_SIZE}), chacun sa propre transaction courte — jamais un verrou
 * sur toute une table, et une interruption laisse un état cohérent.
 *
 * La purge planifiée (`scripts/retention-purge.js`, catégorie `journaux`) appelle
 * {@link purgeTargets} ; ce script reste l'outil manuel.
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
const DEFAULT_VISITS_RETENTION_DAYS = 365;
const DEFAULT_GUEST_RETENTION_DAYS = 30;
const DEFAULT_IP_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 30;
/** Plafond des journaux et traces d'activité : 12 mois. */
const MAX_JOURNAL_RETENTION_DAYS = 365;
const DEFAULT_DELETE_BATCH_SIZE = 5000;

/** Option CLI → clé de résultat, variable d'environnement, défaut. */
const RETENTION_OPTIONS = Object.freeze([
  {
    flag: '--days=',
    key: 'days',
    env: 'FORETMAP_RETENTION_SECURITY_DAYS',
    def: DEFAULT_RETENTION_DAYS,
    journal: true,
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
    journal: true,
  },
  {
    flag: '--sync-days=',
    key: 'syncDays',
    env: 'FORETMAP_RETENTION_SYNC_DAYS',
    def: DEFAULT_SYNC_RETENTION_DAYS,
    journal: true,
  },
  {
    flag: '--visits-days=',
    key: 'visitsDays',
    env: 'FORETMAP_RETENTION_VISITS_DAYS',
    def: DEFAULT_VISITS_RETENTION_DAYS,
    journal: true,
  },
  {
    flag: '--guest-days=',
    key: 'guestDays',
    env: 'FORETMAP_RETENTION_GUEST_DAYS',
    def: DEFAULT_GUEST_RETENTION_DAYS,
    journal: true,
  },
  {
    flag: '--ip-days=',
    key: 'ipDays',
    env: 'FORETMAP_RETENTION_IP_DAYS',
    def: DEFAULT_IP_RETENTION_DAYS,
    journal: true,
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
    // Compteurs quotidiens anonymes (mesure d'usage) — la clé libre peut porter le texte d'une
    // recherche : mêmes 12 mois que les ouvertures des applications.
    table: 'usage_counters',
    retention: 'visits',
    where: 'day < (CURDATE() - INTERVAL ? DAY)',
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

function assertRetention(label, days, { max = null } = {}) {
  if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
    throw new Error(
      `Durée de conservation ${label} invalide (${days}). Minimum ${MIN_RETENTION_DAYS} jours — ` +
        'une purge plus agressive effacerait des traces encore utiles à une investigation.',
    );
  }
  if (max != null && days > max) {
    throw new Error(
      `Durée de conservation ${label} invalide (${days}). Maximum ${max} jours : les journaux ` +
        'et traces d’activité ne sont pas conservés plus de 12 mois.',
    );
  }
}

/** Libellés des durées (messages d'erreur). */
const RETENTION_LABELS = Object.freeze({
  days: 'sécurité (--days)',
  historyDays: 'historiques (--history-days)',
  activityDays: 'activité (--activity-days)',
  syncDays: 'synchronisation (--sync-days)',
  visitsDays: 'visites (--visits-days)',
  guestDays: 'invités G&L (--guest-days)',
  ipDays: 'troncature IP (--ip-days)',
});

/** Contrôle toutes les durées : minimum partout, 12 mois au plus pour les journaux. */
function assertRetentions(options) {
  for (const opt of RETENTION_OPTIONS) {
    assertRetention(RETENTION_LABELS[opt.key], options[opt.key], {
      max: opt.journal ? MAX_JOURNAL_RETENTION_DAYS : null,
    });
  }
}

function assertBatchSize(batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`Taille de lot invalide (${batchSize}).`);
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

/**
 * Journaux dont les données complémentaires (`payload_json`) peuvent porter une IP sous la clé
 * `ip` (entrées par code du plan des personnels, `routes/staff-plan.js`), chacun dans son
 * référentiel de temps (voir `TARGETS`).
 */
const PAYLOAD_IP_TABLES = Object.freeze([
  { table: 'security_events', dateWhere: 'occurred_at < (NOW() - INTERVAL ? DAY)' },
  {
    table: 'audit_log',
    dateWhere:
      "created_at < DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT%H:%i:%s.000Z')",
  },
]);

const PAYLOAD_IP_EXPR = "JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.ip'))";
/** IP encore complète dans `payload_json.ip` (une valeur tronquée finit par `.0` ou `::`). */
const PAYLOAD_IP_STALE =
  "JSON_TYPE(JSON_EXTRACT(payload_json, '$.ip')) = 'STRING' " +
  `AND ${PAYLOAD_IP_EXPR} NOT LIKE '%.0' AND ${PAYLOAD_IP_EXPR} NOT LIKE '%::'`;

/**
 * Au-delà de `ipDays` : IP de `payload_json.ip` tronquée (illisible → `null`), dans chaque
 * table de {@link PAYLOAD_IP_TABLES}. Idempotent : une IP déjà tronquée n'est plus relue.
 * @returns {Promise<Record<string, number>>} lignes concernées (à blanc) ou modifiées, par table
 */
async function truncatePayloadIps({ queryAll, queryOne, execute }, ipDays, apply) {
  const out = {};
  for (const { table, dateWhere } of PAYLOAD_IP_TABLES) {
    const stale = `${dateWhere} AND ${PAYLOAD_IP_STALE}`;
    if (!apply) {
      const row = await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${stale}`, [ipDays]);
      out[table] = Number(row?.n || 0);
      continue;
    }
    let total = 0;
    let lastId = 0;
    for (;;) {
      const rows = await queryAll(
        `SELECT id, ${PAYLOAD_IP_EXPR} AS ip FROM ${table} WHERE ${stale} AND id > ? ORDER BY id LIMIT ${IP_BATCH_SIZE}`,
        [ipDays, lastId],
      );
      if (!rows.length) break;
      for (const row of rows) {
        await execute(
          `UPDATE ${table} SET payload_json = JSON_SET(payload_json, '$.ip', ?) WHERE id = ?`,
          [truncateIp(row.ip), row.id],
        );
        lastId = Number(row.id);
      }
      total += rows.length;
    }
    out[table] = total;
  }
  return out;
}

/**
 * Toutes les IP des journaux au-delà de `ipDays` : colonne `security_events.ip_address`
 * (et navigateur), puis `payload_json.ip` de `security_events` et d'`audit_log`.
 * @returns {Promise<{ securityEvents: number, payloads: Record<string, number>, total: number }>}
 */
async function truncateJournalIps(db, ipDays, apply) {
  const securityEvents = await truncateSecurityEventIps(db, ipDays, apply);
  const payloads = await truncatePayloadIps(db, ipDays, apply);
  const total = securityEvents + Object.values(payloads).reduce((a, b) => a + b, 0);
  return { securityEvents, payloads, total };
}

function isMissingTableError(err) {
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146;
}

/**
 * Suppression des lignes au-delà de leur durée de conservation, table par table, en lots
 * bornés (`DELETE … LIMIT n`). Sans `apply`, compte seulement.
 * @param {object} options durées (voir `parseArgs`), `apply`, `batchSize`
 * @param {{ queryOne: Function, execute: Function }} db
 * @param {(text: string) => void} say journal (préfixe déjà posé)
 * @returns {Promise<{ deleted: Record<string, number>, purgeable: Record<string, number>,
 *   missing: string[] }>}
 */
async function purgeTargets(options, db, say) {
  const { apply } = options;
  const batchSize = options.batchSize ?? DEFAULT_DELETE_BATCH_SIZE;
  assertRetentions(options);
  assertBatchSize(batchSize);

  const report = { deleted: {}, purgeable: {}, missing: [] };
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
      say(`${target.table} : table absente, ignorée.`);
      continue;
    }
    report.purgeable[target.table] = (report.purgeable[target.table] || 0) + count;
    if (count === 0) {
      say(`${target.table} : rien à purger.`);
      continue;
    }
    if (!apply) {
      say(`${target.table} : ${count} ligne(s) purgeable(s).`);
      continue;
    }
    let deleted = 0;
    for (;;) {
      const result = await db.execute(
        `DELETE FROM ${target.table} WHERE ${target.where} LIMIT ${batchSize}`,
        params,
      );
      const affected = Number(result?.affectedRows || 0);
      deleted += affected;
      if (affected < batchSize) break;
    }
    report.deleted[target.table] = (report.deleted[target.table] || 0) + deleted;
    say(`${target.table} : ${deleted} ligne(s) supprimée(s).`);
  }
  return report;
}

/**
 * Purge et anonymisation, sur des accès base injectés (tests) ou ceux de `database.js`.
 * @returns {Promise<{ deleted: Record<string, number>, purgeable: Record<string, number>,
 *   missing: string[], ipRows: number }>}
 */
async function runPurge(options, db, log = (line) => console.log(line)) {
  const { apply, days, historyDays, activityDays, syncDays, visitsDays, guestDays, ipDays } =
    options;
  const say = (text) => log(`[purge-logs] ${text}`);
  assertRetentions(options);

  say(
    `Conservation : sécurité ${days} j, historiques ${historyDays} j, ` +
      `activité ${activityDays} j, synchro ${syncDays} j, visites ${visitsDays} j, ` +
      `invités G&L ${guestDays} j, IP complètes ${ipDays} j. ` +
      `Mode : ${apply ? 'APPLICATION' : 'à blanc'}.`,
  );

  const report = { ...(await purgeTargets(options, db, say)), ipRows: 0, payloadIpRows: {} };
  const totalDeleted = Object.values(report.deleted).reduce((a, b) => a + b, 0);

  const ips = await truncateJournalIps(db, ipDays, apply);
  report.ipRows = ips.securityEvents;
  report.payloadIpRows = ips.payloads;
  say(
    `security_events : ${report.ipRows} ligne(s) ` +
      `${apply ? 'anonymisée(s)' : 'à anonymiser'} (IP tronquée, navigateur effacé).`,
  );
  for (const [table, n] of Object.entries(ips.payloads)) {
    say(`${table} : ${n} IP de données complémentaires ${apply ? 'tronquée(s)' : 'à tronquer'}.`);
  }

  if (!apply) {
    say('Exécution à blanc — rien n’a été supprimé.');
    say('Relancer avec --apply pour purger.');
  } else {
    say(`Terminé — ${totalDeleted} ligne(s) supprimée(s).`);
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
  MAX_JOURNAL_RETENTION_DAYS,
  DEFAULT_DELETE_BATCH_SIZE,
  RETENTION_OPTIONS,
  parseArgs,
  TARGETS,
  assertRetention,
  assertRetentions,
  TRANSIENT_RETENTION_DAYS,
  retentionDaysFor,
  paramsFor,
  truncateIp,
  truncateSecurityEventIps,
  PAYLOAD_IP_TABLES,
  truncatePayloadIps,
  truncateJournalIps,
  purgeTargets,
  runPurge,
};
