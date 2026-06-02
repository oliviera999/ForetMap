'use strict';

const { queryAll, execute } = require('../database');

function normalizeSpellCode(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  return s.length > 0 ? s : null;
}

/**
 * Valide et dédoublonne une liste de codes sort (ordre conservé).
 * @param {unknown} input
 * @returns {string[]}
 */
function normalizeSpellCodeList(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const code = normalizeSpellCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 * @returns {string[]|null}
 */
function parseSpellCodesFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(body, 'spellCodes')) {
    return normalizeSpellCodeList(body.spellCodes);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'spellCode')) {
    const single = normalizeSpellCode(body.spellCode);
    return single ? [single] : [];
  }
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} query
 * @returns {string[]}
 */
function parseSpellCodesFromQuery(query) {
  if (!query || typeof query !== 'object') return [];
  const multi = query.spellCodes;
  if (multi != null) {
    const raw = String(multi).trim();
    if (!raw) return [];
    return normalizeSpellCodeList(raw.split(',').map((s) => s.trim()));
  }
  const single = normalizeSpellCode(query.spellCode);
  return single ? [single] : [];
}

/**
 * @param {{ queryAll: typeof queryAll }} db
 * @param {number[]} chapterIds
 * @returns {Promise<Map<number, Array<{ spell_code: string, nom: string, emoji: string|null, category_slug: string, order_index: number }>>>}
 */
async function loadSpellsForChapterIds(db, chapterIds) {
  const map = new Map();
  const ids = [...new Set(chapterIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT cs.chapter_id, cs.spell_code, s.nom, s.emoji, s.category_slug, cs.order_index
       FROM gl_chapter_spells cs
  INNER JOIN gl_spells s ON s.spell_code = cs.spell_code
      WHERE cs.chapter_id IN (${placeholders})
      ORDER BY cs.chapter_id ASC, cs.order_index ASC, cs.spell_code ASC`,
    ids
  );
  for (const row of rows) {
    const chapterId = Number(row.chapter_id);
    if (!map.has(chapterId)) map.set(chapterId, []);
    map.get(chapterId).push({
      spell_code: String(row.spell_code),
      nom: String(row.nom || row.spell_code),
      emoji: row.emoji != null ? String(row.emoji) : null,
      category_slug: String(row.category_slug || ''),
      order_index: Number(row.order_index || 0),
    });
  }
  return map;
}

/**
 * @param {{ queryAll: typeof queryAll, execute: typeof execute }} db
 * @param {number} chapterId
 * @param {string[]} spellCodes
 */
async function syncChapterSpells(db, chapterId, spellCodes) {
  const codes = normalizeSpellCodeList(spellCodes);
  await db.execute('DELETE FROM gl_chapter_spells WHERE chapter_id = ?', [chapterId]);
  for (let i = 0; i < codes.length; i += 1) {
    await db.execute(
      `INSERT INTO gl_chapter_spells (chapter_id, spell_code, order_index)
       VALUES (?, ?, ?)`,
      [chapterId, codes[i], i * 10]
    );
  }
}

/**
 * @param {{ queryAll: typeof queryAll }} db
 * @param {string[]} spellCodes
 * @returns {Promise<string|null>}
 */
async function validateSpellCodesExist(db, spellCodes) {
  const codes = normalizeSpellCodeList(spellCodes);
  if (codes.length === 0) return null;
  const placeholders = codes.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT spell_code FROM gl_spells WHERE spell_code IN (${placeholders})`,
    codes
  );
  const found = new Set(rows.map((r) => String(r.spell_code).toUpperCase()));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length > 0) {
    return `spellCodes introuvable(s) dans le catalogue : ${missing.join(', ')}`;
  }
  return null;
}

module.exports = {
  normalizeSpellCode,
  normalizeSpellCodeList,
  parseSpellCodesFromBody,
  parseSpellCodesFromQuery,
  loadSpellsForChapterIds,
  syncChapterSpells,
  validateSpellCodesExist,
};
