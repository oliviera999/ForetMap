#!/usr/bin/env node
'use strict';

/**
 * Purge des journaux au-delà d'une durée de conservation (audit docs/AUDIT_BDD_2026-08.md §5.2,
 * étendu par docs/AUDIT_STABILITE_PERF_2026-09.md §C3).
 *
 *   node scripts/purge-audit-logs.js                 # à blanc : compte, ne supprime rien
 *   node scripts/purge-audit-logs.js --apply         # supprime au-delà des rétentions par défaut
 *   node scripts/purge-audit-logs.js --days=180 --history-days=730 --apply
 *
 * Pourquoi : `security_events` conserve sans limite l'adresse IP et le user-agent de chaque
 * connexion — des données personnelles, dans un établissement scolaire, sur des comptes de
 * mineurs. `audit_log` grossit de même. Et deux tables de contenu croissent elles aussi sans
 * borne (§C3) : `gl_game_events` (une ligne par action de jeu G&L) et `zone_history`
 * (historique des récoltes) — sans purge, elles pèsent sur les sauvegardes (`db-backup.sh`),
 * la durée des `mysqldump` et l'espace disque du compte.
 *
 * Deux rétentions DISTINCTES, chacune configurable :
 *   --days=N          journaux de sécurité (`audit_log`, `security_events`) — défaut 365 j ;
 *   --history-days=N  historiques de jeu et de jardin (`gl_game_events`, `zone_history`) —
 *                     défaut 365 j (« un an de partie »).
 *
 * À BLANC PAR DÉFAUT : une purge est irréversible. Prévu pour un cron mensuel une fois la
 * durée validée (voir docs/CRONTAB.md — la ligne de purge n'y est PAS optionnelle).
 *
 * Subtilité de fuseau, assumée : `audit_log.created_at` est de l'ISO-8601 UTC dans une
 * colonne VARCHAR, tandis que `security_events.occurred_at` et `gl_game_events.created_at`
 * sont des DATETIME en heure locale serveur ; `zone_history.harvested_at` est une DATE
 * (`YYYY-MM-DD`) dans un VARCHAR. Chaque table est donc filtrée dans SON référentiel — sur
 * une borne exprimée en jours, l'écart d'une heure ou deux est sans portée.
 */

const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_HISTORY_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;

function parseArgs(argv) {
  const out = {
    apply: false,
    days: DEFAULT_RETENTION_DAYS,
    historyDays: DEFAULT_HISTORY_RETENTION_DAYS,
  };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--days=')) out.days = Number.parseInt(arg.slice('--days='.length), 10);
    else if (arg.startsWith('--history-days=')) {
      out.historyDays = Number.parseInt(arg.slice('--history-days='.length), 10);
    }
  }
  return out;
}

/**
 * Quatre journaux, deux rétentions (`retention`), et des référentiels de temps propres :
 * chaque table porte SA condition.
 */
const TARGETS = [
  {
    table: 'audit_log',
    retention: 'security',
    // VARCHAR ISO-8601 UTC : la comparaison lexicographique est valide, le format étant unique.
    where: "created_at < DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT%H:%i:%s.000Z')",
  },
  {
    table: 'security_events',
    retention: 'security',
    // DATETIME en heure locale serveur (voir routes/audit.js).
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
];

function assertRetention(label, days) {
  if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
    throw new Error(
      `Durée de conservation ${label} invalide (${days}). Minimum ${MIN_RETENTION_DAYS} jours — ` +
        'une purge plus agressive effacerait des traces encore utiles à une investigation.',
    );
  }
}

async function main() {
  const { queryOne, execute, endPool } = require('../database');
  const { apply, days, historyDays } = parseArgs(process.argv.slice(2));

  assertRetention('sécurité (--days)', days);
  assertRetention('historiques (--history-days)', historyDays);

  console.log(
    `[purge-logs] Conservation : sécurité ${days} j, historiques ${historyDays} j. ` +
      `Mode : ${apply ? 'APPLICATION' : 'à blanc'}.`,
  );

  try {
    let totalDeleted = 0;
    for (const target of TARGETS) {
      const retentionDays = target.retention === 'history' ? historyDays : days;
      const row = await queryOne(
        `SELECT COUNT(*) AS n FROM ${target.table} WHERE ${target.where}`,
        [retentionDays],
      );
      const count = Number(row?.n || 0);
      if (count === 0) {
        console.log(`[purge-logs] ${target.table} : rien à purger.`);
        continue;
      }
      if (!apply) {
        console.log(`[purge-logs] ${target.table} : ${count} ligne(s) purgeable(s).`);
        continue;
      }
      const result = await execute(`DELETE FROM ${target.table} WHERE ${target.where}`, [
        retentionDays,
      ]);
      const deleted = Number(result?.affectedRows || 0);
      totalDeleted += deleted;
      console.log(`[purge-logs] ${target.table} : ${deleted} ligne(s) supprimée(s).`);
    }

    if (!apply) {
      console.log('[purge-logs] Exécution à blanc — rien n’a été supprimé.');
      console.log('[purge-logs] Relancer avec --apply pour purger.');
    } else {
      console.log(`[purge-logs] Terminé — ${totalDeleted} ligne(s) supprimée(s).`);
    }
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
  MIN_RETENTION_DAYS,
  parseArgs,
  TARGETS,
  assertRetention,
};
