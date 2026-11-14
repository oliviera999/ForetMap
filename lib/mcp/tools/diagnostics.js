'use strict';

/**
 * Outils de diagnostic — **une seule définition**, deux sources de données :
 *
 * - côté serveur (`/mcp`), `source` lit les fonctions internes (ping BDD, état des
 *   migrations, tampon de logs Pino, instantané processus) : pas d'aller-retour HTTP ;
 * - côté script stdio Cursor, `source` interroge la production en HTTP avec `DEPLOY_SECRET`
 *   (`createHttpDiagnosticsSource`), comme avant.
 *
 * Ce module ne charge **rien** du serveur à l'import : la source interne est fournie par
 * `lib/mcp/tools/diagnosticsInternal.js`, chargé seulement par le serveur.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

/**
 * @param {{
 *   health: () => Promise<object>,
 *   diagnostics: (opts?: { restartsWindowHours?: number }) => Promise<object>,
 *   logs: (lines: number) => Promise<object>,
 *   dbStatus: () => Promise<object>,
 *   glHealth?: () => Promise<object>,
 * }} source
 * @param {{ remote?: boolean }} [opts] `remote` : outils du script stdio (pas de scope OAuth)
 */
function buildDiagnosticsTools(source, { remote = false } = {}) {
  const adminRequires = remote ? {} : { scope: SCOPES.READ, permission: 'admin.settings.read' };
  const readRequires = remote ? {} : { scope: SCOPES.READ };
  const tools = [
    {
      name: 'foretmap_health',
      title: 'Santé du site',
      description:
        'État public du site : le serveur répond-il, la base de données répond-elle, quelle version tourne. Aucun secret, aucune donnée personnelle. À appeler en premier pour savoir si le reste a une chance de marcher.',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: readRequires,
      handler: () => source.health(),
    },
    {
      name: 'foretmap_diagnostics',
      title: 'Diagnostics serveur (admin)',
      description:
        'Instantané d’exploitation réservé aux administrateurs : version, uptime, mémoire, latence MySQL, état du schéma, historique des redémarrages (causes par jour, arrêts brutaux par heure), agrégats Gnomes & Licornes. `restarts_window_hours` élargit la fenêtre des redémarrages (168 = une semaine). Équivalent de GET /api/admin/diagnostics.',
      inputSchema: z.strictObject({
        restarts_window_hours: z
          .number()
          .int()
          .min(1)
          .max(24 * 31)
          .optional()
          .describe('Fenêtre des redémarrages en heures (défaut 24, 168 = 7 jours)'),
      }),
      annotations: READ_ONLY,
      requires: adminRequires,
      handler: (args = {}) =>
        source.diagnostics({ restartsWindowHours: args.restarts_window_hours }),
    },
    {
      name: 'foretmap_tail_logs',
      title: 'Derniers journaux (admin)',
      description:
        'Dernières lignes du journal applicatif Pino (tampon mémoire, champs sensibles déjà retirés par le logger). Paramètre `lines` (1–1000, défaut 200). Réservé aux administrateurs.',
      inputSchema: z.strictObject({
        lines: z.number().int().min(1).max(1000).optional().describe('Nombre de lignes'),
      }),
      annotations: READ_ONLY,
      requires: adminRequires,
      handler: (args) => source.logs(args.lines ?? 200),
    },
    {
      name: 'foretmap_db_status',
      title: 'État des migrations',
      description:
        'Version du schéma en base comparée aux fichiers migrations/ : dernière migration appliquée, dernière disponible, numéros en attente. Une base en retard explique beaucoup de 500.',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: adminRequires,
      handler: () => source.dbStatus(),
    },
  ];
  if (source.glHealth) {
    tools.push({
      name: 'gl_public_health',
      title: 'Santé publique G&L',
      description:
        'Contrôles publics Gnomes & Licornes : /api/health et /api/version mutualisés, /api/gl/chapters sans authentification (401 attendu).',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: readRequires,
      handler: () => source.glHealth(),
    });
  }
  return tools;
}

/**
 * Source HTTP (script stdio Cursor) : appelle la production avec `DEPLOY_SECRET`.
 * @param {{ baseUrl: () => string, glBaseUrl: () => string, secret: () => string, fetchImpl?: Function }} opts
 */
function createHttpDiagnosticsSource({ baseUrl, glBaseUrl, secret, fetchImpl = fetch }) {
  async function fetchJson(url, headers = {}) {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(25000),
      headers: { Accept: 'application/json', ...headers },
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
  async function admin(path) {
    const { status, json } = await fetchJson(`${baseUrl()}${path}`, {
      'X-Deploy-Secret': secret(),
    });
    if (status !== 200) {
      const err = new Error(JSON.stringify({ status, body: json }));
      err.name = 'McpToolError';
      throw err;
    }
    return json;
  }
  return {
    async health() {
      const b = baseUrl();
      const [h, db, ver] = await Promise.all([
        fetchJson(`${b}/api/health`),
        fetchJson(`${b}/api/health/db`),
        fetchJson(`${b}/api/version`),
      ]);
      return {
        baseUrl: b,
        health: { status: h.status, body: h.json },
        healthDb: { status: db.status, body: db.json },
        version: { status: ver.status, body: ver.json },
      };
    },
    diagnostics: ({ restartsWindowHours } = {}) =>
      admin(
        `/api/admin/diagnostics${restartsWindowHours ? `?restartsWindowHours=${Number(restartsWindowHours)}` : ''}`,
      ),
    async logs(lines) {
      return admin(`/api/admin/logs?${new URLSearchParams({ lines: String(lines) })}`);
    },
    async dbStatus() {
      const json = await admin('/api/admin/diagnostics');
      return { ts: json?.ts || null, version: json?.version || null, schema: json?.schema || null };
    },
    async glHealth() {
      const b = glBaseUrl();
      const [h, ver, ch] = await Promise.all([
        fetchJson(`${b}/api/health`),
        fetchJson(`${b}/api/version`),
        fetchJson(`${b}/api/gl/chapters`),
      ]);
      return {
        baseUrl: b,
        health: { status: h.status, body: h.json },
        version: { status: ver.status, body: ver.json },
        glChapters: { status: ch.status, body: ch.json },
      };
    },
    async glDiagnostics() {
      const json = await admin('/api/admin/diagnostics');
      return { ts: json?.ts || null, version: json?.version || null, gl: json?.gl || null };
    },
  };
}

module.exports = { buildDiagnosticsTools, createHttpDiagnosticsSource, READ_ONLY };
