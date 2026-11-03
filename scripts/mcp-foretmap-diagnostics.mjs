#!/usr/bin/env node
/**
 * Serveur MCP stdio pour diagnostiquer ForetMap à distance depuis Cursor.
 * Charge `.env` à la racine du dépôt (sans écraser les variables déjà définies par l’OS / Cursor).
 * Secret : FORETMAP_DEPLOY_SECRET, DEPLOY_SECRET ou FORETMAP_DEPLOY_CHECK_SECRET (pas dans le chat).
 *
 * Les définitions d'outils (noms, descriptions, schémas) viennent du registre partagé avec le
 * serveur distant `/mcp` (`lib/mcp/tools/diagnostics.js`) : une seule vérité. Ici, la source
 * de données reste HTTP vers la production avec `DEPLOY_SECRET` ; côté serveur, les mêmes
 * outils lisent les fonctions internes. Les anciens noms (`foretmap_public_health`,
 * `gl_diagnostics`) restent servis pour les configurations Cursor existantes.
 *
 * Rien n'est écrit sur stdout hors protocole MCP : le registre ne charge ni la base ni Pino.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), quiet: true });
const require = createRequire(import.meta.url);
const {
  buildDiagnosticsTools,
  createHttpDiagnosticsSource,
} = require('../lib/mcp/tools/diagnostics.js');
const { registerTools } = require('../lib/mcp/registry.js');

function baseUrl() {
  const raw = (process.env.FORETMAP_BASE_URL || 'https://foretmap.olution.info').trim();
  return raw.replace(/\/$/, '');
}

function glBaseUrl() {
  const raw = (
    process.env.GL_BASE_URL ||
    process.env.GL_PROD_BASE_URL ||
    'https://gl.olution.info'
  ).trim();
  return raw.replace(/\/$/, '');
}

function requireSecret() {
  const s = String(
    process.env.FORETMAP_DEPLOY_SECRET ||
      process.env.DEPLOY_SECRET ||
      process.env.FORETMAP_DEPLOY_CHECK_SECRET ||
      '',
  ).trim();
  if (!s) {
    const err = new Error(
      'Secret deploy manquant pour MCP : FORETMAP_DEPLOY_SECRET (recommandé), ou DEPLOY_SECRET / FORETMAP_DEPLOY_CHECK_SECRET dans l’environnement du serveur MCP.',
    );
    err.name = 'McpToolError';
    throw err;
  }
  return s;
}

const source = createHttpDiagnosticsSource({ baseUrl, glBaseUrl, secret: requireSecret });
const shared = buildDiagnosticsTools(source, { remote: true });
const byName = new Map(shared.map((t) => [t.name, t]));

// Alias historiques (configurations Cursor existantes) : mêmes handlers que les outils partagés.
const legacy = [
  {
    ...byName.get('foretmap_health'),
    name: 'foretmap_public_health',
    description:
      'Contrôles publics ForetMap (sans secret) : /api/health, /api/health/db, /api/version. Alias historique de foretmap_health.',
  },
  {
    name: 'gl_diagnostics',
    title: 'Diagnostics G&L',
    description:
      "Section GL de l'instantané serveur (secret requis) : statuts parties, joueurs actifs, types d'évènements récents, nb packs.",
    inputSchema: z.strictObject({}),
    annotations: byName.get('foretmap_diagnostics').annotations,
    requires: {},
    handler: () => source.glDiagnostics(),
  },
];

const server = new McpServer({ name: 'foretmap-diagnostics', version: '1.1.0' });
registerTools(server, [...shared, ...legacy], { access: {} });

const transport = new StdioServerTransport();
await server.connect(transport);
