'use strict';

const { queryAll, execute } = require('../database');

function normalizeBiomeSlug(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Valide et dédoublonne une liste de slugs de biomes (ordre conservé).
 * @param {unknown} input
 * @returns {string[]}
 */
function normalizeBiomeSlugList(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const slug = normalizeBiomeSlug(item);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Extrait biomeSlugs depuis un body admin (biomeSlugs[] ou biomeSlug legacy).
 * @param {Record<string, unknown>|null|undefined} body
 * @returns {string[]|null} null si aucun champ biome fourni
 */
function parseBiomeSlugsFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(body, 'biomeSlugs')) {
    return normalizeBiomeSlugList(body.biomeSlugs);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'biomeSlug')) {
    const single = normalizeBiomeSlug(body.biomeSlug);
    return single ? [single] : [];
  }
  return null;
}

/**
 * Parse biomeSlugs depuis query string (?biomeSlugs=a,b ou ?biomeSlug=a).
 * @param {Record<string, unknown>|null|undefined} query
 * @returns {string[]}
 */
function parseBiomeSlugsFromQuery(query) {
  if (!query || typeof query !== 'object') return [];
  const multi = query.biomeSlugs;
  if (multi != null) {
    const raw = String(multi).trim();
    if (!raw) return [];
    return normalizeBiomeSlugList(raw.split(',').map((s) => s.trim()));
  }
  const single = normalizeBiomeSlug(query.biomeSlug);
  return single ? [single] : [];
}

/**
 * @param {{ queryAll: typeof queryAll }} db
 * @param {number[]} chapterIds
 * @returns {Promise<Map<number, Array<{ slug: string, nom: string, order_index: number }>>>}
 */
async function loadBiomesForChapterIds(db, chapterIds) {
  const map = new Map();
  const ids = [...new Set(chapterIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT cb.chapter_id, cb.biome_slug AS slug, b.nom, cb.order_index
       FROM gl_chapter_biomes cb
  INNER JOIN gl_biomes b ON b.slug = cb.biome_slug
      WHERE cb.chapter_id IN (${placeholders})
      ORDER BY cb.chapter_id ASC, cb.order_index ASC, cb.biome_slug ASC`,
    ids
  );
  for (const row of rows) {
    const chapterId = Number(row.chapter_id);
    if (!map.has(chapterId)) map.set(chapterId, []);
    map.get(chapterId).push({
      slug: String(row.slug),
      nom: String(row.nom || row.slug),
      order_index: Number(row.order_index || 0),
    });
  }
  return map;
}

/**
 * @param {{ queryAll: typeof queryAll, execute: typeof execute }} db
 * @param {number} chapterId
 * @param {string[]} biomeSlugs
 */
async function syncChapterBiomes(db, chapterId, biomeSlugs) {
  const slugs = normalizeBiomeSlugList(biomeSlugs);
  await db.execute('DELETE FROM gl_chapter_biomes WHERE chapter_id = ?', [chapterId]);
  for (let i = 0; i < slugs.length; i += 1) {
    await db.execute(
      `INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
       VALUES (?, ?, ?)`,
      [chapterId, slugs[i], i * 10]
    );
  }
}

/**
 * Vérifie que tous les slugs existent dans gl_biomes.
 * @param {{ queryAll: typeof queryAll }} db
 * @param {string[]} biomeSlugs
 * @returns {Promise<string|null>} message d'erreur ou null
 */
async function validateBiomeSlugsExist(db, biomeSlugs) {
  const slugs = normalizeBiomeSlugList(biomeSlugs);
  if (slugs.length === 0) return null;
  const placeholders = slugs.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT slug FROM gl_biomes WHERE slug IN (${placeholders})`,
    slugs
  );
  const found = new Set(rows.map((r) => String(r.slug)));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length > 0) {
    return `biomeSlugs introuvable(s) dans le catalogue : ${missing.join(', ')}`;
  }
  return null;
}

/**
 * @param {{ queryAll: typeof queryAll }} db
 * @param {string[]} biomeSlugs
 * @returns {Promise<Array<{ slug: string, nom: string }>>}
 */
async function loadBiomeMetaBySlugs(db, biomeSlugs) {
  const slugs = normalizeBiomeSlugList(biomeSlugs);
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT slug, nom FROM gl_biomes WHERE slug IN (${placeholders})`,
    slugs
  );
  const bySlug = new Map(rows.map((r) => [String(r.slug), { slug: String(r.slug), nom: String(r.nom || r.slug) }]));
  return slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
}

module.exports = {
  normalizeBiomeSlug,
  normalizeBiomeSlugList,
  parseBiomeSlugsFromBody,
  parseBiomeSlugsFromQuery,
  loadBiomesForChapterIds,
  syncChapterBiomes,
  validateBiomeSlugsExist,
  loadBiomeMetaBySlugs,
};
