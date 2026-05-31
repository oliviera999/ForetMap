'use strict';

const {
  normalizeQuestionCode,
  normalizeQuestionPool,
  resolveBiomeSlugsForPool,
  resolveMarkerEventConfig,
} = require('./glMarkerEventConfig');
// normalizeQuestionPool used in queryQuestionPool

const QUESTION_POOL_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         niveau, difficulte, difficulte_label, tags, mots_cles, statut
    FROM gl_qcm_questions
`;

function applyTextSearch(rows, searchQuery) {
  const q = String(searchQuery || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = `${row.question || ''} ${row.tags || ''} ${row.mots_cles || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function applySelectedCodes(rows, selectedQuestionCodes) {
  const selected = Array.isArray(selectedQuestionCodes)
    ? selectedQuestionCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
    : [];
  if (selected.length === 0) return rows;
  const allowed = new Set(selected);
  return rows.filter((row) => allowed.has(String(row.question_code || '').toUpperCase()));
}

function buildPoolQueryFilters(pool, biomeSlugs) {
  const params = [];
  let sql = `${QUESTION_POOL_SELECT} WHERE statut = 'actif'`;

  const slugs = Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean) : [];
  if (slugs.length === 0) {
    return { sql: null, params, error: 'Aucun biome disponible pour le pool' };
  }
  sql += ` AND biome_slug IN (${slugs.map(() => '?').join(', ')})`;
  params.push(...slugs);

  const categorieSlugs = pool.categorieSlugs || [];
  if (categorieSlugs.length > 0) {
    sql += ` AND categorie_slug IN (${categorieSlugs.map(() => '?').join(', ')})`;
    params.push(...categorieSlugs);
  }

  const niveaux = pool.niveaux || [];
  if (niveaux.length > 0) {
    sql += ` AND niveau IN (${niveaux.map(() => '?').join(', ')})`;
    params.push(...niveaux);
  }

  if (pool.difficulteMin != null) {
    sql += ' AND difficulte >= ?';
    params.push(pool.difficulteMin);
  }
  if (pool.difficulteMax != null) {
    sql += ' AND difficulte <= ?';
    params.push(pool.difficulteMax);
  }

  sql += ' ORDER BY biome_slug ASC, categorie_slug ASC, numero_dans_categorie ASC';
  return { sql, params, error: null };
}

async function queryQuestionPool(deps, { pool, chapterBiomeSlugs, excludeCodes = [] }) {
  const normalizedPool = normalizeQuestionPool(pool);
  const biomeSlugs = resolveBiomeSlugsForPool(normalizedPool, chapterBiomeSlugs);
  const { sql, params, error } = buildPoolQueryFilters(normalizedPool, biomeSlugs);
  if (!sql) return { items: [], error };

  let rows = await deps.queryAll(sql, params);
  rows = applyTextSearch(rows, normalizedPool.searchQuery);
  rows = applySelectedCodes(rows, normalizedPool.selectedQuestionCodes);

  const exclude = new Set(
    (Array.isArray(excludeCodes) ? excludeCodes : [])
      .map((c) => String(c || '').trim().toUpperCase())
      .filter(Boolean)
  );
  if (exclude.size > 0) {
    rows = rows.filter((row) => !exclude.has(String(row.question_code || '').toUpperCase()));
  }

  return { items: rows, error: null };
}

function toPoolPreviewItem(row) {
  return {
    question_code: row.question_code,
    question: row.question,
    biome_slug: row.biome_slug,
    categorie_slug: row.categorie_slug,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
  };
}

async function previewQuestionPool(deps, options) {
  const { items } = await queryQuestionPool(deps, options);
  return items.map(toPoolPreviewItem);
}

async function drawQuestionFromMarker(deps, marker, chapterBiomeSlugs, excludeCodes = []) {
  const eventConfig = resolveMarkerEventConfig(marker);
  const questionCfg = eventConfig?.question;
  if (!questionCfg) {
    return { error: 'Repère sans configuration question', questionCode: null };
  }

  if (questionCfg.mode === 'fixed') {
    const code = normalizeQuestionCode(questionCfg.fixedQuestionCode);
    if (!code) return { error: 'Question fixe non configurée', questionCode: null };
    const row = await deps.queryOne(
      `${QUESTION_POOL_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
      [code]
    );
    if (!row) return { error: 'Question fixe introuvable ou inactive', questionCode: null };
    return { questionCode: code, error: null };
  }

  const { items, error } = await queryQuestionPool(deps, {
    pool: questionCfg.pool,
    chapterBiomeSlugs,
    excludeCodes,
  });
  if (error) return { error, questionCode: null };
  if (items.length === 0) return { error: 'Aucune question disponible dans le pool', questionCode: null };

  const picked = items[Math.floor(Math.random() * items.length)];
  return { questionCode: picked.question_code, error: null };
}

module.exports = {
  buildPoolQueryFilters,
  queryQuestionPool,
  previewQuestionPool,
  drawQuestionFromMarker,
  toPoolPreviewItem,
};
