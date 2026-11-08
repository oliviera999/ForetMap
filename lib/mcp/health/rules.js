'use strict';

/**
 * Règles du statut global du rapport de santé — **fonctions pures**, sans base ni réseau
 * (testées sur des jeux de faits construits, `tests/mcp-health.test.js`).
 *
 * Chaque règle produit au plus un constat `{ level: 'red'|'orange'|'info', rule, message }`.
 * Statut global : **rouge** si au moins un constat rouge, sinon **orange** si au moins un
 * constat orange, sinon **vert**. Les constats `info` ne changent pas le statut.
 *
 * Seuils (tous réglables par variable d'environnement, valeurs par défaut ci-dessous) :
 *
 * | Règle               | Orange                                    | Rouge                                  |
 * | ------------------- | ----------------------------------------- | -------------------------------------- |
 * | `app_unreachable`   | —                                         | application injoignable (script cron)  |
 * | `database`          | latence ≥ 500 ms                          | ping en échec, ou latence ≥ 2 000 ms   |
 * | `migrations`        | —                                         | migration(s) en attente                |
 * | `http_5xx_24h`      | ≥ 5 réponses 5xx sur 24 h                 | ≥ 50, ou ≥ 5 % des requêtes (≥ 100)    |
 * | `http_429_24h`      | ≥ 500 réponses 429 sur 24 h               | —                                      |
 * | `restarts`          | crash, échec de démarrage ou processus tué sur 24 h (RSS max avant arrêt brutal si relevée) | — |
 * | `memory`            | RSS ≥ `MCP_HEALTH_RSS_WARN_MB` (800)      | —                                      |
 * | `disk`              | espace libre < 10 %                       | espace libre < 5 %                     |
 * | `tls`               | expiration < 21 j, ou contrôle impossible | expiration < 7 j, certificat invalide  |
 * | `cron`              | tâche en échec, en retard, ou jamais tracée (ligne de crontab attendue en `hint`) | — |
 * | `audit`             | cases G&L dont la promesse n'est pas tenue (`gl_marker_promises`) | — (`info` : autres constats du corpus) |
 */

const LEVEL_RANK = Object.freeze({ info: 0, orange: 1, red: 2 });

function envNumber(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function thresholds() {
  return {
    dbLatencyOrangeMs: envNumber('MCP_HEALTH_DB_LATENCY_WARN_MS', 500, { min: 1 }),
    dbLatencyRedMs: envNumber('MCP_HEALTH_DB_LATENCY_CRIT_MS', 2000, { min: 1 }),
    http5xxOrange: envNumber('MCP_HEALTH_5XX_WARN', 5, { min: 1 }),
    http5xxRed: envNumber('MCP_HEALTH_5XX_CRIT', 50, { min: 1 }),
    http5xxRatioRed: 0.05,
    http429Orange: envNumber('MCP_HEALTH_429_WARN', 500, { min: 1 }),
    rssOrangeMb: envNumber('MCP_HEALTH_RSS_WARN_MB', 800, { min: 64 }),
    diskOrangePct: 10,
    diskRedPct: 5,
    tlsOrangeDays: envNumber('MCP_HEALTH_TLS_WARN_DAYS', 21, { min: 1, max: 365 }),
    tlsRedDays: envNumber('MCP_HEALTH_TLS_CRIT_DAYS', 7, { min: 0, max: 365 }),
  };
}

/**
 * @param {object} facts rapport brut (`collect.js`)
 * @returns {{ status: 'green'|'orange'|'red', findings: Array<{ level: string, rule: string, message: string }>, thresholds: object }}
 */
function evaluateHealth(facts = {}) {
  const t = thresholds();
  const findings = [];
  const add = (level, rule, message) => findings.push({ level, rule, message });

  if (facts.app && facts.app.reachable === false) {
    add('red', 'app_unreachable', `Application injoignable : ${facts.app.error || 'sans réponse'}`);
  }

  const db = facts.database || {};
  if (db.ok === false) add('red', 'database', 'Base de données injoignable');
  else if (Number.isFinite(db.latencyMs)) {
    if (db.latencyMs >= t.dbLatencyRedMs) {
      add('red', 'database', `Latence MySQL ${db.latencyMs} ms (≥ ${t.dbLatencyRedMs} ms)`);
    } else if (db.latencyMs >= t.dbLatencyOrangeMs) {
      add('orange', 'database', `Latence MySQL ${db.latencyMs} ms (≥ ${t.dbLatencyOrangeMs} ms)`);
    }
  }

  const schema = facts.schema || {};
  if (Array.isArray(schema.pending) && schema.pending.length > 0) {
    add(
      'red',
      'migrations',
      `${schema.pending.length} migration(s) en attente (base ${schema.current ?? '?'}, code ${schema.latest ?? '?'}) : npm run db:migrate`,
    );
  }

  const http = facts.http || {};
  if (http.available) {
    const d = http.last24h || {};
    const n5 = Number(d.http5xx || 0);
    const ratio = Number(d.requests || 0) >= 100 ? n5 / Number(d.requests) : 0;
    if (n5 >= t.http5xxRed || ratio >= t.http5xxRatioRed) {
      add(
        'red',
        'http_5xx_24h',
        `${n5} réponses 5xx sur 24 h (${Math.round(ratio * 1000) / 10} %)`,
      );
    } else if (n5 >= t.http5xxOrange) {
      add('orange', 'http_5xx_24h', `${n5} réponses 5xx sur 24 h`);
    }
    if (Number(d.http429 || 0) >= t.http429Orange) {
      add('orange', 'http_429_24h', `${d.http429} réponses 429 sur 24 h (limiteurs)`);
    }
  } else if (http.reason) {
    add('info', 'http', `Compteurs HTTP indisponibles : ${http.reason}`);
  }

  const restarts = facts.restarts || {};
  const rc = restarts.counts || {};
  const bad = Number(rc.crashes || 0) + Number(rc.startupFailures || 0) + Number(rc.hardKills || 0);
  if (bad > 0) {
    const rssMax = restarts.maxRssMbBeforeKill;
    const rssNote =
      Number(rc.hardKills || 0) > 0
        ? rssMax != null && Number.isFinite(Number(rssMax))
          ? ` ; RSS max relevée avant arrêt brutal : ${rssMax} Mo`
          : ' ; RSS avant arrêt brutal inconnue (aucun relevé)'
        : '';
    add(
      'orange',
      'restarts',
      `Sur 24 h : ${rc.crashes || 0} crash, ${rc.startupFailures || 0} échec(s) de démarrage, ${rc.hardKills || 0} processus tué(s) (verdict ${restarts.verdict || '?'})${rssNote}`,
    );
  }

  const mem = facts.process?.memory || {};
  if (Number.isFinite(mem.rssMb) && mem.rssMb >= t.rssOrangeMb) {
    add('orange', 'memory', `Mémoire RSS ${mem.rssMb} Mo (≥ ${t.rssOrangeMb} Mo)`);
  }

  const disk = facts.disk || {};
  if (Number.isFinite(disk.freePct)) {
    if (disk.freePct < t.diskRedPct) {
      add('red', 'disk', `Espace disque libre ${disk.freePct} % (< ${t.diskRedPct} %)`);
    } else if (disk.freePct < t.diskOrangePct) {
      add('orange', 'disk', `Espace disque libre ${disk.freePct} % (< ${t.diskOrangePct} %)`);
    }
  }

  for (const c of facts.tls?.hosts || []) {
    if (c.error) {
      add('orange', 'tls', `${c.host} : contrôle TLS impossible (${c.error})`);
    } else if (c.authorized === false) {
      add('red', 'tls', `${c.host} : certificat refusé (${c.authorizationError || 'invalide'})`);
    } else if (Number.isFinite(c.daysRemaining)) {
      if (c.daysRemaining < t.tlsRedDays) {
        add('red', 'tls', `${c.host} : certificat expire dans ${c.daysRemaining} j`);
      } else if (c.daysRemaining < t.tlsOrangeDays) {
        add('orange', 'tls', `${c.host} : certificat expire dans ${c.daysRemaining} j`);
      }
    }
  }

  for (const j of facts.cron?.jobs || []) {
    if (j.state === 'failure') {
      add(
        'orange',
        'cron',
        `${j.job} : dernière exécution en échec${j.detail ? ` (${j.detail})` : ''}`,
      );
    } else if (j.state === 'late') {
      add(
        'orange',
        'cron',
        `${j.job} : en retard (dernière exécution il y a ${j.ageHours} h, attendu toutes les ${j.expectedEveryHours} h)`,
      );
    } else if (j.state === 'blocked') {
      add('orange', 'cron', `${j.job} : bloquée par un seuil`);
    } else if (j.state === 'never' && j.hint) {
      // Tâche attendue qui n'a jamais laissé de trace : ligne de crontab probablement absente.
      // `hint` (lib/mcp/files/cron.js) donne la ligne à coller dans cPanel.
      add('orange', 'cron', `${j.job} : aucune trace d’exécution — ${j.hint}`);
    }
  }

  const audit = facts.audit || {};
  const promesses = Number(audit.byCheck?.gl_marker_promises || 0);
  if (promesses > 0) {
    // Une case qui promet à l'élève ce que le moteur n'applique pas lui apprend que le jeu
    // ment : c'est un défaut à corriger avant la prochaine séance, pas un simple constat.
    add(
      'orange',
      'audit_gl_marker_promises',
      `${promesses} case(s) G&L dont le texte ou un libellé n'est pas tenu par le moteur (foretmap_audit check=gl_marker_promises)`,
    );
  }
  if (Number.isFinite(audit.total_findings) && audit.total_findings > 0) {
    add('info', 'audit', `${audit.total_findings} constat(s) de cohérence du corpus`);
  }

  let rank = 0;
  for (const f of findings) rank = Math.max(rank, LEVEL_RANK[f.level] ?? 0);
  const status = rank === 2 ? 'red' : rank === 1 ? 'orange' : 'green';
  findings.sort((a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0));
  return { status, findings, thresholds: t };
}

const STATUS_LABEL = Object.freeze({ green: 'VERT', orange: 'ORANGE', red: 'ROUGE' });

/** Résumé d'une ligne : « ORANGE — 2 alerte(s) : … ». */
function summarize({ status, findings }) {
  const alerts = findings.filter((f) => f.level !== 'info');
  if (!alerts.length) return `${STATUS_LABEL[status]} — aucune alerte`;
  return `${STATUS_LABEL[status]} — ${alerts.length} alerte(s) : ${alerts
    .slice(0, 4)
    .map((f) => f.message)
    .join(' ; ')}${alerts.length > 4 ? ' ; …' : ''}`.slice(0, 1000);
}

module.exports = { LEVEL_RANK, STATUS_LABEL, evaluateHealth, summarize, thresholds };
