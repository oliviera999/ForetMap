#!/usr/bin/env node
/**
 * Serveur MCP stdio pour diagnostiquer ForetMap à distance depuis Cursor.
 * Configurez FORETMAP_BASE_URL et FORETMAP_DEPLOY_SECRET dans les env du serveur MCP (pas dans le chat).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

function baseUrl() {
  const raw = (process.env.FORETMAP_BASE_URL || 'https://foretmap.olution.info').trim();
  return raw.replace(/\/$/, '');
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(25000),
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 8000) };
  }
  return { status: res.status, json };
}

function requireSecret() {
  const s = String(process.env.FORETMAP_DEPLOY_SECRET || '').trim();
  if (!s) {
    throw new Error(
      'FORETMAP_DEPLOY_SECRET manquant : ajoutez-le aux variables d’environnement du serveur MCP Cursor.'
    );
  }
  return s;
}

const server = new McpServer({
  name: 'foretmap-diagnostics',
  version: '1.0.0',
});

server.registerTool(
  'foretmap_public_health',
  {
    description:
      'Contrôles publics ForetMap (sans secret) : /api/health, /api/health/db, /api/version. Utile pour savoir si le site répond et si la BDD répond.',
  },
  async () => {
    const b = baseUrl();
    const [h, db, ver] = await Promise.all([
      fetchText(`${b}/api/health`),
      fetchText(`${b}/api/health/db`),
      fetchText(`${b}/api/version`),
    ]);
    const out = {
      baseUrl: b,
      health: { status: h.status, body: h.json },
      healthDb: { status: db.status, body: db.json },
      version: { status: ver.status, body: ver.json },
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }
);

server.registerTool(
  'foretmap_diagnostics',
  {
    description:
      'Instantané serveur (secret requis en env MCP) : version, uptime, mémoire, latence ping MySQL, taille du tampon de logs. Équivalent GET /api/admin/diagnostics.',
  },
  async () => {
    const secret = requireSecret();
    const { status, json } = await fetchText(`${baseUrl()}/api/admin/diagnostics`, {
      headers: { 'X-Deploy-Secret': secret },
    });
    if (status !== 200) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status, body: json }, null, 2) }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(json, null, 2) }] };
  }
);

server.registerTool(
  'foretmap_tail_logs',
  {
    description:
      'Dernières lignes du tampon Pino (secret requis en env MCP). Paramètre optionnel lines (1–5000, défaut 200).',
    inputSchema: {
      lines: z
        .number()
        .int()
        .min(1)
        .max(5000)
        .optional()
        .describe('Nombre de lignes (défaut 200)'),
    },
  },
  async (args) => {
    const secret = requireSecret();
    const lines = args?.lines ?? 200;
    const q = new URLSearchParams({ lines: String(lines) });
    const { status, json } = await fetchText(`${baseUrl()}/api/admin/logs?${q}`, {
      headers: { 'X-Deploy-Secret': secret },
    });
    if (status !== 200) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ status, body: json }, null, 2) }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(json, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
