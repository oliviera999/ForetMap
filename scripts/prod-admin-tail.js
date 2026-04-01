#!/usr/bin/env node
/**
 * Lecture distante du tampon Pino + instantané diagnostics (prod ou staging).
 * Évite les 429 : User-Agent dédié + pause entre requêtes (cf. rate limit /api/*).
 *
 * Prérequis : DEPLOY_SECRET ou FORETMAP_DEPLOY_CHECK_SECRET dans .env (non versionné).
 *
 * Usage :
 *   node scripts/prod-admin-tail.js
 *   FORETMAP_PROD_BASE_URL=https://foretmap.olution.info FORETMAP_ADMIN_LOG_LINES=400 node scripts/prod-admin-tail.js
 */
'use strict';

require('dotenv').config();
const https = require('https');

const BASE = String(process.env.FORETMAP_PROD_BASE_URL || 'https://foretmap.olution.info').replace(/\/$/, '');
const SECRET = String(process.env.DEPLOY_SECRET || process.env.FORETMAP_DEPLOY_CHECK_SECRET || '').trim();
const UA = 'ForetMap-ProdAdminTail/1.0';
const LINES = Math.min(5000, Math.max(50, parseInt(process.env.FORETMAP_ADMIN_LOG_LINES || '250', 10)));
const PAUSE_MS = Math.max(0, parseInt(process.env.FORETMAP_ADMIN_TAIL_PAUSE_MS || '300', 10));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
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
    });
    req.on('error', reject);
    req.end();
  });
}

function summarizePinoLines(entries) {
  const byLevel = { trace10: 0, debug20: 0, info30: 0, warn40: 0, error50: 0, fatal60: 0, nonJson: 0 };
  const errorSamples = [];
  for (const line of entries) {
    try {
      const j = JSON.parse(line);
      const lv = j.level;
      if (lv === 10) byLevel.trace10 += 1;
      else if (lv === 20) byLevel.debug20 += 1;
      else if (lv === 30) byLevel.info30 += 1;
      else if (lv === 40) byLevel.warn40 += 1;
      else if (lv === 50) byLevel.error50 += 1;
      else if (lv === 60) byLevel.fatal60 += 1;
      else byLevel.nonJson += 1;
      if (lv >= 50 || j.err) {
        errorSamples.push({
          time: j.time,
          msg: j.msg,
          level: j.level,
          requestId: j.requestId,
          event: j.event,
        });
      }
    } catch {
      byLevel.nonJson += 1;
    }
  }
  return { byLevel, errorSamples: errorSamples.slice(-20) };
}

async function main() {
  if (!SECRET) {
    console.error(
      'DEPLOY_SECRET ou FORETMAP_DEPLOY_CHECK_SECRET manquant dans .env — impossible de lire /api/admin/logs sur la prod.'
    );
    console.error('Ajoutez la même valeur que sur le serveur (sans commiter .env), ou utilisez les outils MCP documentés dans docs/MCP_FORETMAP_CURSOR.md.');
    process.exit(1);
  }

  const diag = await request('/api/admin/diagnostics', { 'X-Deploy-Secret': SECRET });
  if (diag.status === 429) {
    console.error('HTTP 429 sur diagnostics — réessayez après quelques secondes ou augmentez FORETMAP_ADMIN_TAIL_PAUSE_MS.');
    process.exit(1);
  }
  await sleep(PAUSE_MS);

  const logs = await request(`/api/admin/logs?lines=${LINES}`, { 'X-Deploy-Secret': SECRET });
  if (logs.status === 429) {
    console.error('HTTP 429 sur logs — réessayez après quelques secondes.');
    process.exit(1);
  }

  if (diag.status !== 200) {
    console.error('diagnostics HTTP', diag.status, JSON.stringify(diag.body, null, 2));
    process.exit(1);
  }
  if (logs.status !== 200) {
    console.error('logs HTTP', logs.status, JSON.stringify(logs.body, null, 2));
    process.exit(1);
  }

  const entries = logs.body.entries || [];
  const summary = summarizePinoLines(entries);

  console.log('=== Diagnostics (résumé) ===');
  console.log(
    JSON.stringify(
      {
        version: diag.body.version,
        uptimeSeconds: diag.body.uptimeSeconds,
        nodeEnv: diag.body.nodeEnv,
        database: diag.body.database,
        memory: diag.body.memory,
        logBuffer: diag.body.logBuffer,
        metrics: diag.body.metrics,
      },
      null,
      2
    )
  );

  console.log(`\n=== Tampon : ${entries.length} ligne(s) analysées (demandé max ${LINES}) ===`);
  console.log('Comptage par niveau Pino (trace/debug/info/warn/error/fatal) :');
  console.log(JSON.stringify(summary.byLevel, null, 2));
  console.log('\n=== Échantillon erreurs / fatal (champs récents) ===');
  console.log(JSON.stringify(summary.errorSamples, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
