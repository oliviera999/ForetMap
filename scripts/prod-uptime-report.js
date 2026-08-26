#!/usr/bin/env node
/**
 * Rapport de stabilité : pourquoi le service a-t-il été indisponible ?
 *
 * Lit `restarts` dans GET /api/admin/diagnostics (journal persistant du cycle de vie
 * du process, cf. `lib/bootJournal.js`) et le traduit en français, avec la conduite à
 * tenir. Complément « pourquoi » du `deploy:check` (« est-ce debout ? »).
 *
 * Prérequis : DEPLOY_SECRET, FORETMAP_DEPLOY_CHECK_SECRET ou FORETMAP_DEPLOY_SECRET dans .env.
 *
 * Usage :
 *   npm run prod:uptime-report
 *   npm run prod:uptime-report -- --hours=168        # fenêtre d'une semaine
 *   npm run prod:uptime-report -- --json             # sortie brute
 */
'use strict';

require('dotenv').config();
const https = require('https');
const http = require('http');
const { deploySecretFromEnv } = require('./lib/deploy-secret-from-env');

const BASE = String(process.env.FORETMAP_PROD_BASE_URL || 'https://foretmap.olution.info').replace(
  /\/$/,
  '',
);
const SECRET = deploySecretFromEnv();
const UA = 'ForetMap-UptimeReport/1.0';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const rawHours = parseInt(argValue('hours') || '24', 10);
const HOURS = Number.isFinite(rawHours) && rawHours >= 1 && rawHours <= 720 ? rawHours : 24;
const AS_JSON = process.argv.includes('--json');

function request(path) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const client = u.protocol === 'http:' ? http : https;
    const req = client.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Deploy-Secret': SECRET },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            body = { _nonJson: raw.slice(0, 800) };
          }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** Libellé humain de la nature d'un arrêt, aligné sur le tableau de `lib/bootJournal.js`. */
function describeEntry(entry) {
  const at = String(entry.at || '')
    .replace('T', ' ')
    .replace(/\..*$/, '');
  if (entry.event === 'stop') {
    const reason = String(entry.reason || '').toLowerCase();
    if (reason === 'restart') return `${at}  ARRÊT    déploiement (POST /api/admin/restart)`;
    if (reason === 'env_invalid')
      return `${at}  ARRÊT    refus de démarrage : variables d'environnement invalides`;
    if (reason === 'listen_error') return `${at}  ARRÊT    refus de démarrage : port indisponible`;
    return `${at}  ARRÊT    signal ${entry.reason} — décidé par l'hébergeur (inactivité Passenger)`;
  }
  if (entry.event === 'crash') {
    return `${at}  CRASH    ${entry.kind} — ${entry.message || 'sans message'}`;
  }
  if (entry.event === 'boot') {
    const causes = {
      hard: 'process tué sans signal (mémoire / limite LVE)',
      graceful: `après arrêt maîtrisé${entry.previousStopReason ? ` (${entry.previousStopReason})` : ''}`,
      crash: 'après crash applicatif',
      none: 'premier démarrage enregistré',
    };
    const gap = Number.isFinite(entry.downtimeMs)
      ? `, indisponible ${formatDuration(entry.downtimeMs)}`
      : '';
    return `${at}  DÉPART   ${causes[entry.previousStop] || entry.previousStop}${gap}`;
  }
  return `${at}  ${entry.event}`;
}

async function main() {
  if (!SECRET) {
    console.error(
      'Secret deploy manquant (.env) : DEPLOY_SECRET, FORETMAP_DEPLOY_CHECK_SECRET ou FORETMAP_DEPLOY_SECRET.',
    );
    process.exit(1);
  }

  const res = await request(`/api/admin/diagnostics?restartsWindowHours=${HOURS}`);
  if (res.status !== 200) {
    console.error('diagnostics HTTP', res.status, JSON.stringify(res.body, null, 2));
    process.exit(1);
  }

  const restarts = res.body?.restarts;
  if (AS_JSON) {
    console.log(JSON.stringify(restarts ?? { error: 'champ restarts absent' }, null, 2));
    return;
  }

  console.log(`ForetMap — rapport de stabilité (${BASE})`);
  console.log(
    `Version ${res.body?.version || '?'} · process en vie depuis ${formatDuration((res.body?.uptimeSeconds || 0) * 1000)} · RSS ${res.body?.memory?.rssMb ?? '?'} Mo`,
  );
  console.log('');

  if (!restarts) {
    console.log(
      'Champ `restarts` absent : la version déployée est antérieure au journal de cycle de vie. Déployer le lot en cours, puis relancer.',
    );
    return;
  }
  if (restarts.enabled === false) {
    console.log('Journal de cycle de vie désactivé sur le serveur (FORETMAP_BOOT_JOURNAL=0).');
    return;
  }

  const c = restarts.counts || {};
  console.log(`Sur les ${restarts.windowHours} dernières heures :`);
  console.log(`  ${c.boots ?? 0} démarrage(s), dont`);
  console.log(
    `    · ${c.deployRestarts ?? 0} arrêt(s) de déploiement       → normal si vous venez de pousser`,
  );
  console.log(
    `    · ${c.hostStops ?? 0} arrêt(s) par l'hébergeur         → inactivité Passenger (démarrage à froid au retour)`,
  );
  console.log(`    · ${c.crashes ?? 0} crash(s) applicatif(s)           → bug à corriger`);
  console.log(`    · ${c.hardKills ?? 0} process tué(s) sans signal       → limite mémoire / LVE`);
  console.log(
    `    · ${c.startupFailures ?? 0} refus de démarrage             → configuration serveur (.env, port)`,
  );
  if (restarts.downtime?.samples > 0) {
    console.log(
      `  Indisponibilité mesurée : ${formatDuration(restarts.downtime.totalMs)} au total, ${formatDuration(restarts.downtime.averageMs)} en moyenne par redémarrage.`,
    );
  }
  console.log('');
  console.log(`VERDICT : ${restarts.verdict}`);
  console.log(restarts.advice);
  console.log('');
  console.log('Derniers évènements :');
  for (const entry of restarts.recent || []) console.log(`  ${describeEntry(entry)}`);
}

main().catch((err) => {
  console.error('Échec du rapport :', err?.message || err);
  process.exit(1);
});
