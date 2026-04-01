#!/usr/bin/env node
/**
 * Affiche le JSON complet de GET /api/admin/diagnostics (retry si 429).
 * Prérequis : .env avec DEPLOY_SECRET, FORETMAP_DEPLOY_CHECK_SECRET ou FORETMAP_DEPLOY_SECRET.
 */
'use strict';

require('dotenv').config();
const { URL } = require('url');
const { deploySecretFromEnv } = require('./lib/deploy-secret-from-env');
const { requestJsonWithRetry } = require('./post-deploy-check.js');

const BASE = String(process.env.FORETMAP_PROD_BASE_URL || 'https://foretmap.olution.info').replace(/\/$/, '');
const TIMEOUT_MS = Math.max(3000, parseInt(process.env.FORETMAP_PROD_DIAG_TIMEOUT_MS || '15000', 10));

async function main() {
  const secret = deploySecretFromEnv();
  if (!secret) {
    console.error(
      'Secret manquant : DEPLOY_SECRET, FORETMAP_DEPLOY_CHECK_SECRET ou FORETMAP_DEPLOY_SECRET dans .env.'
    );
    process.exit(1);
  }

  const full = new URL('/api/admin/diagnostics', BASE).toString();
  const res = await requestJsonWithRetry(full, TIMEOUT_MS, 3, {
    'X-Deploy-Secret': secret,
    'User-Agent': 'ForetMap-ProdDiagnostics/1.0',
  });

  console.log(JSON.stringify(res.body, null, 2));
  if (!res.ok) {
    console.error(`\n[prod-admin-diagnostics] HTTP ${res.status}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
