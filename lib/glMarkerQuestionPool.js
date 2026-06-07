'use strict';

const {
  normalizeQuestionCode,
  normalizeQuestionPool,
  resolveBiomeSlugsForPool,
  resolveMarkerEventConfig,
} = require('./glMarkerEventConfig');
const {
  loadActiveQuestion,
  isPresentableQuestionRow,
  presentableQuestionError,
} = require('./glQcmQuestionQuery');

const QUESTION_POOL_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         niveau, difficulte, difficulte_label, tags, mots_cles, statut
    FROM gl_qcm_questions
`;

function fisherYates(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

  sql += ` AND CHAR_LENGTH(TRIM(COALESCE(choix_a, ''))) > 0
           AND CHAR_LENGTH(TRIM(COALESCE(choix_b, ''))) > 0
           AND UPPER(TRIM(COALESCE(reponse_correcte, ''))) IN ('A','B','C','D','E')`;

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

const { drawLoreQuestionFromMarker } = require('./glMarkerLoreQuestionPool');
const { normalizeQuestionSet } = require('./glMarkerEventConfig');

async function drawQuestionFromMarker(deps, marker, chapterBiomeSlugs, excludeCodes = [], chapterPlateauNumber = null) {
  const eventConfig = resolveMarkerEventConfig(marker);
  const questionCfg = eventConfig?.question;
  const qcmSet = normalizeQuestionSet(questionCfg?.set);
  if (qcmSet === 'lore') {
    return drawLoreQuestionFromMarker(deps, marker, chapterPlateauNumber, excludeCodes);
  }
  if (!questionCfg) {
    return { error: 'Repère sans configuration question', questionCode: null, qcmSet: 'biome' };
  }

  if (questionCfg.mode === 'fixed') {
    const code = normalizeQuestionCode(questionCfg.fixedQuestionCode);
    if (!code) return { error: 'Question fixe non configurée', questionCode: null, qcmSet: 'biome' };
    const row = await loadActiveQuestion(deps, code);
    if (!row) return { error: 'Question fixe introuvable ou inactive', questionCode: null, qcmSet: 'biome' };
    if (!isPresentableQuestionRow(row)) {
      return { error: presentableQuestionError(code), questionCode: null, qcmSet: 'biome' };
    }
    return { questionCode: code, error: null, qcmSet: 'biome' };
  }

  const { items, error } = await queryQuestionPool(deps, {
    pool: questionCfg.pool,
    chapterBiomeSlugs,
    excludeCodes,
  });
  if (error) return { error, questionCode: null, qcmSet: 'biome' };
  if (items.length === 0) {
    return { error: 'Aucune question présentable dans le pool (vérifiez les choix QCM)', questionCode: null, qcmSet: 'biome' };
  }

  for (const candidate of fisherYates(items)) {
    const code = String(candidate.question_code || '').trim().toUpperCase();
    if (!code) continue;
    const row = await loadActiveQuestion(deps, code);
    if (isPresentableQuestionRow(row)) {
      return { questionCode: code, error: null, qcmSet: 'biome' };
    }
  }

  return { error: 'Aucune question présentable dans le pool (vérifiez les choix QCM)', questionCode: null, qcmSet: 'biome' };
}

module.exports = {
  buildPoolQueryFilters,
  queryQuestionPool,
  previewQuestionPool,
  drawQuestionFromMarker,
  toPoolPreviewItem,
};
