#!/usr/bin/env node
/**
 * Contrôle d'activation du connecteur MCP distant — sans écrire dans le contenu.
 *
 * Usage :
 *   npm run mcp:activate-check -- --base https://foretmap.example
 *   npm run mcp:activate-check -- --base https://foretmap.example --print-env
 *   npm run mcp:activate-check -- --local-env   # lit MCP_PUBLIC_BASE_URL / FORETMAP_MCP_URL du .env
 *
 * Code de sortie : 0 si les contrôles réseau passent, 1 sinon.
 * Doc utilisateur : docs/reference/foretmap/activer-le-connecteur.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { base: null, printEnv: false, localEnv: false, help: false, timeoutMs: 15000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base' || a === '-b') out.base = String(argv[++i] || '').trim();
    else if (a === '--print-env') out.printEnv = true;
    else if (a === '--local-env') out.localEnv = true;
    else if (a === '--timeout') out.timeoutMs = Number(argv[++i]) || 15000;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/mcp$/i, '');
}

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

function resolveBase(opts) {
  if (opts.base) return normalizeBase(opts.base);
  const fromEnv =
    process.env.FORETMAP_MCP_URL ||
    process.env.MCP_SMOKE_BASE_URL ||
    process.env.MCP_PUBLIC_BASE_URL ||
    '';
  return normalizeBase(fromEnv);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function ok(msg) {
  log(`  OK  ${msg}`);
}

function fail(msg) {
  log(`  KO  ${msg}`);
}

function info(msg) {
  log(`  ·   ${msg}`);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'manual' });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Contrôles réseau purs (testables).
 * @returns {Promise<{ ok: boolean, steps: string[], errors: string[], resource?: string }>}
 */
export async function runActivateChecks(
  base,
  { timeoutMs = 15000, fetchImpl = fetchWithTimeout } = {},
) {
  const steps = [];
  const errors = [];
  const root = normalizeBase(base);
  if (!root || !/^https?:\/\//i.test(root)) {
    return { ok: false, steps, errors: ['URL de base invalide (ex. https://foretmap.example)'] };
  }
  const mcpUrl = `${root}/mcp`;

  // 1. POST /mcp sans jeton → 401 + WWW-Authenticate
  let unauth;
  try {
    unauth = await fetchImpl(
      mcpUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize' }),
      },
      timeoutMs,
    );
  } catch (err) {
    errors.push(`POST /mcp injoignable : ${err?.cause?.code || err?.message || err}`);
    return { ok: false, steps, errors };
  }
  if (unauth.status === 404) {
    errors.push(
      'POST /mcp → 404 : connecteur probablement éteint (MCP_ENABLED≠true) ou mauvaise URL',
    );
  } else if (unauth.status === 503) {
    errors.push(
      'POST /mcp → 503 : souvent MCP_PUBLIC_BASE_URL manquant en production, ou base non prête',
    );
  } else if (unauth.status !== 401) {
    errors.push(`POST /mcp : 401 attendu, reçu ${unauth.status}`);
  } else {
    steps.push(`POST /mcp → 401`);
  }
  const challenge = unauth.headers.get('www-authenticate') || '';
  const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  if (unauth.status === 401 && !prmUrl) {
    errors.push('WWW-Authenticate présent mais sans resource_metadata (WAF qui tronque ?)');
  } else if (prmUrl) {
    steps.push(`WWW-Authenticate resource_metadata=${prmUrl}`);
  }

  // 2. Métadonnées ressource
  let resource = `${root}/mcp`;
  if (prmUrl) {
    try {
      const prmRes = await fetchImpl(prmUrl, { method: 'GET' }, timeoutMs);
      const prm = await prmRes.json();
      if (prm.resource !== resource) {
        errors.push(
          `resource métadonnées « ${prm.resource} » ≠ attendu « ${resource} » (aligner MCP_PUBLIC_BASE_URL)`,
        );
      } else {
        steps.push(`ressource protégée OK (${prm.resource})`);
        resource = prm.resource;
      }
      const issuer = prm.authorization_servers?.[0];
      if (!issuer) errors.push('authorization_servers absent des métadonnées');
      else {
        // 3. Serveur d'autorisation
        const asmUrl = `${String(issuer).replace(/\/+$/, '')}/.well-known/oauth-authorization-server`;
        const asmRes = await fetchImpl(asmUrl, { method: 'GET' }, timeoutMs);
        if (asmRes.status < 200 || asmRes.status >= 300) {
          errors.push(`métadonnées autorisation HTTP ${asmRes.status} (${asmUrl})`);
        } else {
          const asm = await asmRes.json();
          if (!asm.authorization_endpoint || !asm.token_endpoint) {
            errors.push('authorization_endpoint ou token_endpoint manquant');
          } else {
            steps.push(`AS ${asm.issuer || issuer}`);
          }
          if (!asm.code_challenge_methods_supported?.includes('S256')) {
            errors.push('PKCE S256 non annoncé');
          }
          if (asm.registration_endpoint) steps.push(`DCR ${asm.registration_endpoint}`);
          if (asm.client_id_metadata_document_supported) steps.push('CIMD annoncé');
        }
      }
    } catch (err) {
      errors.push(`Lecture métadonnées : ${err?.message || err}`);
    }
  }

  // 4. Alias well-known classiques
  for (const p of [
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-authorization-server',
  ]) {
    try {
      const r = await fetchImpl(`${root}${p}`, { method: 'GET' }, timeoutMs);
      if (r.status === 404) errors.push(`${p} → 404`);
      else if (r.status < 200 || r.status >= 300) errors.push(`${p} → HTTP ${r.status}`);
      else steps.push(`${p} → ${r.status}`);
    } catch (err) {
      errors.push(`${p} injoignable : ${err?.message || err}`);
    }
  }

  return { ok: errors.length === 0, steps, errors, resource };
}

function printEnvSnippet(base) {
  const root = normalizeBase(base);
  log('');
  log('— Exemple de variables à poser sur le serveur (puis redémarrer) —');
  log(`MCP_ENABLED=true`);
  log(`MCP_PUBLIC_BASE_URL=${root}`);
  log(`# MCP_HEALTH_TOKEN=<openssl rand -base64 36>`);
  log(`# MCP_SQL_ENABLED=false`);
  log('');
  log('— Côté poste Cursor —');
  log(`FORETMAP_MCP_URL=${root}/mcp`);
}

function printClientChecklist(base) {
  const mcp = `${normalizeBase(base)}/mcp`;
  log('');
  log('— Brancher un assistant (après contrôles OK) —');
  log(`Adresse unique : ${mcp}`);
  log('');
  log('Claude     : Réglages → Connecteurs → Ajouter → coller l’URL → Connecter');
  log(`Claude Code: claude mcp add --transport http foretmap ${mcp}`);
  log('Cursor     : FORETMAP_MCP_URL=<url>/mcp puis redémarrer → MCP → foretmap → Auth');
  log('ChatGPT    : serveur MCP personnalisé OAuth avec la même URL');
  log('Gemini CLI : mcpServers.url = même URL (pas Gemini Enterprise)');
  log('');
  log('Guide détaillé : docs/reference/foretmap/activer-le-connecteur.md');
}

function printLocalEnvHints() {
  log('');
  log('— État local (.env / environnement, indicatif) —');
  const enabled = String(process.env.MCP_ENABLED || '')
    .trim()
    .toLowerCase();
  const pub = String(process.env.MCP_PUBLIC_BASE_URL || '').trim();
  const cursor = String(process.env.FORETMAP_MCP_URL || '').trim();
  if (!enabled || ['0', 'false', 'no', 'off', 'non'].includes(enabled)) {
    info(`MCP_ENABLED=${enabled || '(absent)'} → connecteur éteint tant que ≠ true`);
  } else {
    ok(`MCP_ENABLED=${enabled}`);
  }
  if (!pub) info('MCP_PUBLIC_BASE_URL absent (obligatoire en production)');
  else ok(`MCP_PUBLIC_BASE_URL=${pub}`);
  if (cursor) ok(`FORETMAP_MCP_URL=${cursor}`);
  else info('FORETMAP_MCP_URL absent (utile pour Cursor)');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    log(`Usage: npm run mcp:activate-check -- --base https://domaine [--print-env] [--local-env]
       npm run mcp:activate-check -- --local-env`);
    process.exit(0);
  }

  loadDotEnv();
  if (opts.localEnv) printLocalEnvHints();

  const base = resolveBase(opts);
  if (!base) {
    fail('Indiquez --base https://votre-domaine ou posez MCP_PUBLIC_BASE_URL / FORETMAP_MCP_URL');
    log('Voir docs/reference/foretmap/activer-le-connecteur.md');
    process.exit(1);
  }

  log(`Contrôle du connecteur MCP sur ${base}`);
  const result = await runActivateChecks(base, { timeoutMs: opts.timeoutMs });
  for (const s of result.steps) ok(s);
  for (const e of result.errors) fail(e);

  if (opts.printEnv) printEnvSnippet(base);
  printClientChecklist(base);

  if (!result.ok) {
    log('');
    log('Échec : corrigez le serveur avant de brancher un assistant.');
    process.exit(1);
  }
  log('');
  log('Serveur prêt pour OAuth. Enchaînez avec un assistant ou npm run mcp:smoke.');
  process.exit(0);
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((err) => {
    fail(err?.stack || String(err));
    process.exit(1);
  });
}
