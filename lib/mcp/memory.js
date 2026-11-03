'use strict';

/**
 * Mémoire persistante du connecteur MCP (`foretmap_remember`, `foretmap_recall`,
 * `foretmap_forget`) — table `mcp_memory`, migration 325.
 *
 * Une note = un **sujet** (clé de mise à jour), un **contenu**, des **étiquettes**, une portée :
 * - `site` : partagée entre tous les comptes `mcp.use` (conventions du dépôt, pièges connus) ;
 * - `user` : visible par son seul auteur.
 *
 * Règles :
 * - `remember` sur un sujet existant (même portée, même compte pour `user`) **met à jour** la
 *   note et la marque vérifiée ; pour une note de site, seul l'auteur ou un admin
 *   (`mcp.write`) peut la réécrire — une note semée (sans auteur) est réécrivable par un admin ;
 * - contenu borné (`MAX_CONTENT_CHARS`) et **refusé** s'il ressemble à un secret (jeton, clé,
 *   hachage bcrypt, mot de passe affecté) ou contient une adresse e-mail (`secretMask.js`) ;
 * - `recall` cherche dans le sujet, le contenu et les étiquettes (LIKE paramétré), signale
 *   `stale: true` (« à revérifier ») une note non vérifiée depuis `MCP_MEMORY_STALE_DAYS` ;
 * - `forget` : auteur ou admin seulement.
 *
 * SQL paramétré par `database.js` (table `mcp_*` hors liste blanche de lecture du connecteur :
 * elle n'est jamais lisible par `foretmap_sql_select` ni par les outils de contenu).
 */

const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../../database');
const { McpToolError } = require('./registry');
const { findSecretLike } = require('./secretMask');
const { likePattern } = require('./tools/common');

const MAX_SUBJECT_CHARS = 200;
const MAX_CONTENT_CHARS = 4000;
const MAX_TAGS = 12;
const MAX_TAG_CHARS = 40;
/** Plafond de notes par compte (portée `user`) et pour le site : évite qu'un client s'emballe. */
const MAX_NOTES_PER_OWNER = 500;

function staleDays() {
  const n = Number.parseInt(String(process.env.MCP_MEMORY_STALE_DAYS || ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : 90;
}

function normalizeSubject(subject) {
  return String(subject || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Même calcul que la migration 325 : SHA2(portée|compte|LOWER(TRIM(sujet))). */
function subjectKey(scope, userId, subject) {
  const owner = scope === 'user' ? String(userId || '') : '';
  return crypto
    .createHash('sha256')
    .update(`${scope}|${owner}|${normalizeSubject(subject).toLowerCase()}`, 'utf8')
    .digest('hex');
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const out = [];
  for (const t of list) {
    const v = String(t || '')
      .trim()
      .toLowerCase()
      .slice(0, MAX_TAG_CHARS);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function isAdmin(user) {
  return Array.isArray(user?.permissions) && user.permissions.includes('mcp.write');
}

function assertClean(label, text) {
  const reason = findSecretLike(text);
  if (reason) {
    throw new McpToolError(
      `${label} refusé : ressemble à un secret ou à une donnée personnelle (${reason}). Une note de mémoire ne doit contenir ni mot de passe, ni jeton, ni clé, ni adresse e-mail.`,
      'MCP_MEMORY_REJECTED',
    );
  }
}

function toNote(row, now = Date.now()) {
  const verified = row.verified_at ? new Date(row.verified_at).getTime() : null;
  const limitMs = staleDays() * 24 * 3600 * 1000;
  const stale = verified == null || now - verified > limitMs;
  return {
    id: Number(row.id),
    scope: row.scope,
    subject: row.subject,
    content: row.content,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    seeded: row.created_by == null,
    mine: Boolean(row.mine),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    verified_at: verified != null ? new Date(verified).toISOString() : null,
    stale,
    ...(stale ? { note: `À revérifier : non vérifiée depuis plus de ${staleDays()} jours` } : {}),
  };
}

/**
 * Crée ou met à jour une note.
 * @param {{ subject: string, content: string, tags?: string[], scope?: 'site'|'user' }} args
 * @param {{ userId: string, permissions?: string[] }} user
 */
async function remember(args, user) {
  const scope = args.scope === 'user' ? 'user' : 'site';
  const subject = normalizeSubject(args.subject);
  const content = String(args.content || '').trim();
  if (!subject) throw new McpToolError('Sujet vide', 'MCP_MEMORY_REJECTED');
  if (subject.length > MAX_SUBJECT_CHARS) {
    throw new McpToolError(`Sujet trop long (${MAX_SUBJECT_CHARS} caractères au plus)`);
  }
  if (!content) throw new McpToolError('Contenu vide', 'MCP_MEMORY_REJECTED');
  if (content.length > MAX_CONTENT_CHARS) {
    throw new McpToolError(
      `Contenu trop long (${content.length} caractères, ${MAX_CONTENT_CHARS} au plus) : résumer`,
      'MCP_MEMORY_REJECTED',
    );
  }
  const tags = normalizeTags(args.tags);
  assertClean('Sujet', subject);
  assertClean('Contenu', content);
  assertClean('Étiquettes', tags.join(' '));

  const key = subjectKey(scope, user.userId, subject);
  const existing = await queryOne(
    'SELECT id, created_by FROM mcp_memory WHERE subject_key = ? LIMIT 1',
    [key],
  );
  if (existing) {
    const author = existing.created_by == null ? null : String(existing.created_by);
    if (scope === 'site' && author !== String(user.userId) && !isAdmin(user)) {
      throw new McpToolError(
        'Cette note de site appartient à un autre compte : seul son auteur ou un administrateur peut la réécrire. Proposer une note personnelle (scope "user") ou demander à un administrateur.',
        'MCP_FORBIDDEN',
      );
    }
    await execute(
      `UPDATE mcp_memory SET subject = ?, content = ?, tags = ?, verified_at = NOW(),
              created_by = COALESCE(created_by, ?)
        WHERE id = ?`,
      [subject, content, tags.join(',') || null, String(user.userId), existing.id],
    );
    return { action: 'updated', id: Number(existing.id), scope, subject, tags };
  }
  const owned = await queryOne(
    scope === 'user'
      ? "SELECT COUNT(*) AS n FROM mcp_memory WHERE scope = 'user' AND user_id = ?"
      : "SELECT COUNT(*) AS n FROM mcp_memory WHERE scope = 'site' AND (created_by = ? OR created_by IS NULL)",
    [String(user.userId)],
  );
  if (Number(owned?.n || 0) >= MAX_NOTES_PER_OWNER) {
    throw new McpToolError(
      `Plafond de ${MAX_NOTES_PER_OWNER} notes atteint : oublier des notes devenues inutiles (foretmap_forget)`,
      'MCP_MEMORY_FULL',
    );
  }
  const res = await execute(
    `INSERT INTO mcp_memory (scope, user_id, subject, subject_key, content, tags, created_by, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      scope,
      scope === 'user' ? String(user.userId) : null,
      subject,
      key,
      content,
      tags.join(',') || null,
      String(user.userId),
    ],
  );
  return { action: 'created', id: Number(res.insertId), scope, subject, tags };
}

/**
 * Recherche dans les notes visibles par le compte (site + ses notes personnelles).
 * @param {{ query?: string, tags?: string[], limit?: number, stale_only?: boolean }} args
 */
async function recall(args, user) {
  const limit = Math.min(100, Math.max(1, args.limit ?? 30));
  const where = ["(m.scope = 'site' OR (m.scope = 'user' AND m.user_id = ?))"];
  const params = [String(user.userId), String(user.userId)];
  const words = String(args.query || '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const w of words) {
    where.push('(m.subject LIKE ? OR m.content LIKE ? OR m.tags LIKE ?)');
    const p = likePattern(w);
    params.push(p, p, p);
  }
  for (const t of normalizeTags(args.tags)) {
    where.push("CONCAT(',', COALESCE(m.tags, ''), ',') LIKE ?");
    params.push(`%,${t.replace(/[\\%_]/g, (c) => `\\${c}`)},%`);
  }
  const rows = await queryAll(
    `SELECT m.id, m.scope, m.subject, m.content, m.tags, m.created_by, m.updated_at,
            m.verified_at, (m.created_by = ?) AS mine
       FROM mcp_memory m
      WHERE ${where.join(' AND ')}
      ORDER BY m.verified_at IS NULL DESC, m.updated_at DESC, m.id DESC
      LIMIT ${limit}`,
    params,
  );
  let notes = rows.map((r) => toNote(r));
  if (args.stale_only) notes = notes.filter((n) => n.stale);
  return {
    count: notes.length,
    stale_after_days: staleDays(),
    notes,
    hint: notes.some((n) => n.stale)
      ? 'Des notes sont à revérifier : contrôler dans le dépôt ou sur le site, puis les réécrire avec foretmap_remember (même sujet) pour les marquer vérifiées.'
      : undefined,
  };
}

/**
 * Supprime une note : auteur ou administrateur seulement.
 * @param {{ id: number }} args
 */
async function forget(args, user) {
  const row = await queryOne(
    'SELECT id, scope, user_id, created_by, subject FROM mcp_memory WHERE id = ? LIMIT 1',
    [args.id],
  );
  const visible =
    row && (row.scope === 'site' || String(row.user_id || '') === String(user.userId));
  if (!visible) throw new McpToolError('Note introuvable', 'MCP_NOT_FOUND');
  const author = row.created_by == null ? null : String(row.created_by);
  if (author !== String(user.userId) && !isAdmin(user)) {
    throw new McpToolError(
      'Seul l’auteur de la note ou un administrateur peut l’oublier',
      'MCP_FORBIDDEN',
    );
  }
  await execute('DELETE FROM mcp_memory WHERE id = ?', [row.id]);
  return { action: 'forgotten', id: Number(row.id), subject: row.subject };
}

module.exports = {
  MAX_CONTENT_CHARS,
  MAX_SUBJECT_CHARS,
  forget,
  normalizeTags,
  recall,
  remember,
  staleDays,
  subjectKey,
};
