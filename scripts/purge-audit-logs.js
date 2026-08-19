#!/usr/bin/env node
'use strict';

/**
 * Purge des journaux au-delà d'une durée de conservation (audit docs/AUDIT_BDD_2026-08.md §5.2).
 *
 *   node scripts/purge-audit-logs.js                 # à blanc : compte, ne supprime rien
 *   node scripts/purge-audit-logs.js --apply         # supprime au-delà de 365 jours
 *   node scripts/purge-audit-logs.js --days=180 --apply
 *
 * Pourquoi : `security_events` conserve sans limite l'adresse IP et le user-agent de chaque
 * connexion — des données personnelles, dans un établissement scolaire, sur des comptes de
 * mineurs. `audit_log` grossit de même. Aucune purge n'existait.
 *
 * À BLANC PAR DÉFAUT : une purge est irréversible. Prévu pour un cron mensuel une fois la
 * durée validée (voir docs/CRONTAB.md).
 *
 * Subtilité de fuseau, assumée : `audit_log.created_at` est de l'ISO-8601 UTC dans une
 * colonne VARCHAR, tandis que `security_events.occurred_at` est un DATETIME en heure
 * locale serveur (§4.4). Chaque table est donc filtrée dans SON référentiel — sur une
 * borne exprimée en jours, l'écart d'une heure ou deux est sans portée.
 */

require('dotenv').config({ quiet: true });

const { queryOne, execute, endPool } = require('../database');

const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;

function parseArgs(argv) {
  const out = { apply: false, days: DEFAULT_RETENTION_DAYS };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--days=')) out.days = Number.parseInt(arg.slice('--days='.length), 10);
  }
  return out;
}

/** Deux journaux, deux référentiels de temps : chacun sa condition. */
const TARGETS = [
  {
    table: 'audit_log',
    // VARCHAR ISO-8601 UTC : la comparaison lexicographique est valide, le format étant unique.
    where: "created_at < DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT%H:%i:%s.000Z')",
  },
  {
    table: 'security_events',
    // DATETIME en heure locale serveur (voir routes/audit.js).
    where: 'occurred_at < (NOW() - INTERVAL ? DAY)',
  },
];

async function main() {
  const { apply, days } = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
    throw new Error(
      `Durée de conservation invalide (${days}). Minimum ${MIN_RETENTION_DAYS} jours — ` +
        'une purge plus agressive effacerait des traces encore utiles à une investigation.',
    );
  }

  console.log(
    `[purge-logs] Conservation : ${days} jours. Mode : ${apply ? 'APPLICATION' : 'à blanc'}.`,
  );

  let totalDeleted = 0;
  for (const target of TARGETS) {
    const row = await queryOne(`SELECT COUNT(*) AS n FROM ${target.table} WHERE ${target.where}`, [
      days,
    ]);
    const count = Number(row?.n || 0);
    if (count === 0) {
      console.log(`[purge-logs] ${target.table} : rien à purger.`);
      continue;
    }
    if (!apply) {
      console.log(`[purge-logs] ${target.table} : ${count} ligne(s) purgeable(s).`);
      continue;
    }
    const result = await execute(`DELETE FROM ${target.table} WHERE ${target.where}`, [days]);
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
}

main()
  .then(async () => {
    await endPool().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`[purge-logs] Erreur: ${err?.message || err}`);
    await endPool().catch(() => {});
    process.exit(1);
  });
