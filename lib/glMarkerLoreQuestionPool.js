'use strict';

const {
  normalizeQuestionCode,
  normalizeLoreQuestionPool,
  resolveMarkerEventConfig,
  resolveChapitreSlugsForPool,
} = require('./glMarkerEventConfig');
const {
  loadActiveLoreQuestion,
  isPresentableLoreQuestionRow,
  presentableLoreQuestionError,
} = require('./glQcmLoreQuestionQuery');

const QUESTION_POOL_SELECT = `
  SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
         niveau, difficulte, difficulte_label, tags, mots_cles, statut
    FROM gl_qcm_lore_questions
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
  const q = String(searchQuery || '')
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = `${row.question || ''} ${row.tags || ''} ${row.mots_cles || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function applySelectedCodes(rows, selectedQuestionCodes) {
  const selected = Array.isArray(selectedQuestionCodes)
    ? selectedQuestionCodes
        .map((c) =>
          String(c || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : [];
  if (selected.length === 0) return rows;
  const allowed = new Set(selected);
  return rows.filter((row) => allowed.has(String(row.question_code || '').toUpperCase()));
}

function buildLorePoolQueryFilters(pool, chapitreSlugs) {
  const params = [];
  let sql = `${QUESTION_POOL_SELECT} WHERE statut = 'actif'`;

  const slugs = Array.isArray(chapitreSlugs) ? chapitreSlugs.filter(Boolean) : [];
  if (slugs.length === 0) {
    return { sql: null, params, error: 'Aucun scope chapitre disponible pour le pool lore' };
  }
  sql += ` AND chapitre_slug IN (${slugs.map(() => '?').join(', ')})`;
  params.push(...slugs);

  const categorieSlugs = pool.categorieSlugs || [];
  if (categorieSlugs.length > 0) {
    sql += ` AND categorie_slug IN (${categorieSlugs.map(() => '?').join(', ')})`;
    params.push(...categorieSlugs);
  }

  const tierLore = pool.tierLore || [];
  if (tierLore.length > 0) {
    sql += ` AND tier_lore IN (${tierLore.map(() => '?').join(', ')})`;
    params.push(...tierLore);
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

  sql += ' ORDER BY chapitre_slug ASC, categorie_slug ASC, numero_dans_categorie ASC';
  return { sql, params, error: null };
}

async function queryLoreQuestionPool(deps, { pool, chapterPlateauNumber, excludeCodes = [] }) {
  const normalizedPool = normalizeLoreQuestionPool(pool);
  const chapitreSlugs = resolveChapitreSlugsForPool(normalizedPool, chapterPlateauNumber);
  const { sql, params, error } = buildLorePoolQueryFilters(normalizedPool, chapitreSlugs);
  if (!sql) return { items: [], error };

  let rows = await deps.queryAll(sql, params);
  rows = applyTextSearch(rows, normalizedPool.searchQuery);
  rows = applySelectedCodes(rows, normalizedPool.selectedQuestionCodes);

  const exclude = new Set(
    (Array.isArray(excludeCodes) ? excludeCodes : [])
      .map((c) =>
        String(c || '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
  if (exclude.size > 0) {
    rows = rows.filter((row) => !exclude.has(String(row.question_code || '').toUpperCase()));
  }

  return { items: rows, error: null };
}

function toLorePoolPreviewItem(row) {
  return {
    question_code: row.question_code,
    question: row.question,
    chapitre_slug: row.chapitre_slug,
    categorie_slug: row.categorie_slug,
    tier_lore: row.tier_lore,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
  };
}

async function previewLoreQuestionPool(deps, options) {
  const { items } = await queryLoreQuestionPool(deps, options);
  return items.map(toLorePoolPreviewItem);
}

async function drawLoreQuestionFromMarker(deps, marker, chapterPlateauNumber, excludeCodes = []) {
  const eventConfig = resolveMarkerEventConfig(marker);
  const questionCfg = eventConfig?.question;
  if (!questionCfg) {
    return { error: 'Repère sans configuration question', questionCode: null, qcmSet: 'lore' };
  }

  if (questionCfg.mode === 'fixed') {
    const code = normalizeQuestionCode(questionCfg.fixedQuestionCode);
    if (!code) return { error: 'Question fixe non configurée', questionCode: null, qcmSet: 'lore' };
    const row = await loadActiveLoreQuestion(deps, code);
    if (!row)
      return { error: 'Question fixe introuvable ou inactive', questionCode: null, qcmSet: 'lore' };
    if (!isPresentableLoreQuestionRow(row)) {
      return { error: presentableLoreQuestionError(code), questionCode: null, qcmSet: 'lore' };
    }
    return { questionCode: code, error: null, qcmSet: 'lore' };
  }

  const { items, error } = await queryLoreQuestionPool(deps, {
    pool: questionCfg.pool,
    chapterPlateauNumber,
    excludeCodes,
  });
  if (error) return { error, questionCode: null, qcmSet: 'lore' };
  if (items.length === 0) {
    return {
      error: 'Aucune question lore présentable dans le pool',
      questionCode: null,
      qcmSet: 'lore',
    };
  }

  for (const candidate of fisherYates(items)) {
    const code = String(candidate.question_code || '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    const row = await loadActiveLoreQuestion(deps, code);
    if (isPresentableLoreQuestionRow(row)) {
      return { questionCode: code, error: null, qcmSet: 'lore' };
    }
  }

  return {
    error: 'Aucune question lore présentable dans le pool',
    questionCode: null,
    qcmSet: 'lore',
  };
}

module.exports = {
  buildLorePoolQueryFilters,
  queryLoreQuestionPool,
  previewLoreQuestionPool,
  drawLoreQuestionFromMarker,
  toLorePoolPreviewItem,
};
