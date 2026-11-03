'use strict';

/** Briques communes aux outils de contenu MCP. */

const { z } = require('zod');
const { SCOPES } = require('../config');

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const READ_REQUIRES = Object.freeze({ scope: SCOPES.READ, permission: 'mcp.use' });

/** Pagination standard : `limit` ≤ 200, `offset` ≥ 0. */
const paginationShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Nombre maximal de résultats (≤ 200)'),
  offset: z.number().int().min(0).max(100000).optional().describe('Décalage de pagination'),
};

function page(args, defLimit = 50) {
  return {
    limit: Math.min(200, Math.max(1, args?.limit ?? defLimit)),
    offset: Math.max(0, args?.offset ?? 0),
  };
}

/** Enveloppe paginée compacte : `next_offset` présent seulement s'il reste des résultats. */
function paged(items, { limit, offset }) {
  const out = { items, count: items.length, offset };
  if (items.length === limit) out.next_offset = offset + limit;
  return out;
}

/** Extrait court autour du premier match (≤ 160 caractères). */
function excerpt(text, q, width = 160) {
  const s = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const i = q ? s.toLowerCase().indexOf(String(q).toLowerCase()) : -1;
  if (i < 0 || s.length <= width) return s.slice(0, width);
  const start = Math.max(0, i - Math.floor(width / 3));
  return `${start > 0 ? '…' : ''}${s.slice(start, start + width)}…`;
}

function likePattern(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = v;
  }
  return out;
}

module.exports = {
  READ_ONLY,
  READ_REQUIRES,
  compact,
  excerpt,
  likePattern,
  page,
  paged,
  paginationShape,
};
