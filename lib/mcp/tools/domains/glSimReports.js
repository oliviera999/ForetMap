'use strict';

/**
 * `gl_sim_reports` — rapports du banc de simulation « Tenir à deux » présents sur le serveur
 * (domaine `gl`, lecture seule, bornée).
 *
 * Convention : `reports/gl-sim/<date>-<scenario>/summary.json` (+ un `index.html` jamais lu
 * ici). Le dossier racine est `reports/gl-sim/` à la racine du dépôt, ou `GL_SIM_REPORTS_DIR` ;
 * s'il est absent, la liste est vide (les rapports sont produits par un autre lot).
 *
 * - `list` : un rapport par dossier (nom, date, scénario, date de modification, résumé :
 *   champs scalaires de premier niveau et tailles des tableaux) ;
 * - `get` : le `summary.json` d'un rapport (≤ 512 Ko), jamais le HTML.
 *
 * Aucun nom d'élève attendu dans ces fichiers (banc anonyme) ; la sortie passe de toute façon
 * par l'expurgeage du connecteur.
 */

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const { defineDomainTool, req, pageOf, pageParams, paged } = require('./factory');
const { requireGlStaff } = require('../../glBridge');
const { McpToolError } = require('../../registry');

const TOOL = 'gl_sim_reports';
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const NAME_RE = /^\d{4}-\d{2}-\d{2}[A-Za-z0-9_.-]*$/;
const SUMMARY_MAX_BYTES = 512 * 1024;
const LIST_MAX = 500;

function reportsDir() {
  const env = String(process.env.GL_SIM_REPORTS_DIR || '').trim();
  return env ? path.resolve(env) : path.join(ROOT, 'reports', 'gl-sim');
}

function summaryPath(dir, name) {
  if (!NAME_RE.test(name))
    throw new McpToolError(`Nom de rapport invalide : ${name}`, 'MCP_INVALID_ARGS');
  const full = path.join(dir, name);
  if (path.dirname(full) !== dir)
    throw new McpToolError('Nom de rapport invalide', 'MCP_INVALID_ARGS');
  return path.join(full, 'summary.json');
}

function readSummary(file) {
  const st = fs.statSync(file);
  if (st.size > SUMMARY_MAX_BYTES) {
    throw new McpToolError(
      `summary.json trop volumineux (${st.size} octets, plafond ${SUMMARY_MAX_BYTES})`,
      'MCP_TOO_LARGE',
    );
  }
  return { json: JSON.parse(fs.readFileSync(file, 'utf8')), modifiedAt: st.mtime.toISOString() };
}

/** Résumé compact : scalaires de premier niveau, tailles des tableaux, clés des objets. */
function resumeOf(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { type: typeof json };
  const out = {};
  for (const [k, v] of Object.entries(json).slice(0, 40)) {
    if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) {
      out[k] = typeof v === 'string' ? v.slice(0, 200) : v;
    } else if (Array.isArray(v)) out[k] = { items: v.length };
    else out[k] = { keys: Object.keys(v).length };
  }
  return out;
}

function splitName(name) {
  const m = /^(\d{4}-\d{2}-\d{2})[-_]?(.*)$/.exec(name);
  return { date: m ? m[1] : null, scenario: m && m[2] ? m[2] : null };
}

function listReports() {
  const dir = reportsDir();
  if (!fs.existsSync(dir)) return { dir, items: [], absent: true };
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && NAME_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse()
    .slice(0, LIST_MAX);
  const items = [];
  for (const name of entries) {
    const file = path.join(dir, name, 'summary.json');
    if (!fs.existsSync(file)) continue;
    let resume = null;
    let modifiedAt = null;
    let error = null;
    try {
      const r = readSummary(file);
      resume = resumeOf(r.json);
      modifiedAt = r.modifiedAt;
    } catch (err) {
      error = String(err?.message || err).slice(0, 200);
    }
    let files = [];
    try {
      files = fs
        .readdirSync(path.join(dir, name))
        .filter((f) => !f.startsWith('.'))
        .slice(0, 50);
    } catch (_) {
      files = [];
    }
    items.push({
      name,
      ...splitName(name),
      modifiedAt,
      files,
      resume,
      ...(error ? { error } : {}),
    });
  }
  return { dir, items, absent: false };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : rapports de simulation « Tenir à deux »',
  intro:
    'Rapports du banc de simulation « Tenir à deux » présents sur le serveur (reports/gl-sim/<date>-<scenario>/summary.json) : liste avec résumé, lecture d’un résumé (jamais le HTML). Dossier absent = liste vide. Lecture seule, bornée. Réservé au staff G&L.',
  actions: {
    list: {
      summary: 'rapports présents (nom, date, scénario, résumé), plus récents d’abord',
      params: { ...pageParams },
      run: async (args, ctx) => {
        await requireGlStaff(ctx);
        const { items, absent } = listReports();
        const p = pageOf(args, ctx, 50);
        return paged(items.slice(p.offset, p.offset + p.limit), p, {
          total: items.length,
          dossier_absent: absent,
        });
      },
    },
    get: {
      summary: 'le summary.json d’un rapport (≤ 512 Ko)',
      params: {
        name: req(z.string().min(10).max(120).describe('Nom du dossier (ex. 2026-11-07-complet)')),
      },
      run: async (args, ctx) => {
        await requireGlStaff(ctx);
        const dir = reportsDir();
        const file = summaryPath(dir, args.name);
        if (!fs.existsSync(file)) {
          throw new McpToolError(`Rapport introuvable : ${args.name}`, 'MCP_NOT_FOUND');
        }
        const r = readSummary(file);
        return {
          name: args.name,
          ...splitName(args.name),
          modifiedAt: r.modifiedAt,
          summary: r.json,
        };
      },
    },
  },
});

module.exports = { buildGlSimReportsTool: () => tool, listReports, reportsDir, resumeOf };
