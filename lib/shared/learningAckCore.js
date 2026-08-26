'use strict';

// =====================================================================
// Accuses d'apprentissage — coeur COMMUN aux deux produits.
//
// Le module etait cable sur `gl_learning_acknowledgements` : ForetMap, qui n'avait aucune
// notion d'« appris », n'en avait pas l'usage. Depuis que le glossaire ForetMap se valide
// (migration 201), les deux produits font la meme chose sur deux tables differentes.
//
// Une seule difference reelle, imposee par les produits : GL identifie son lecteur par un
// COUPLE (type, identifiant) — un invite ou un MJ n'a pas de compte —, ForetMap par son
// `user_id`. Elle est portee par le descripteur de magasin ci-dessous ; tout le reste
// (normalisation, requetes, regroupement) est identique et n'existe qu'une fois.
// =====================================================================

/** Magasin GL : lecteur identifie par couple (type, identifiant). */
const GL_ACK_STORE = Object.freeze({
  table: 'gl_learning_acknowledgements',
  readerColumns: Object.freeze(['reader_user_type', 'reader_user_id']),
});

/** Magasin ForetMap : lecteur identifie par son compte. */
const FM_ACK_STORE = Object.freeze({
  table: 'learning_acknowledgements',
  readerColumns: Object.freeze(['user_id']),
});

function ackStoreFor(product) {
  return String(product || '').toLowerCase() === 'gl' ? GL_ACK_STORE : FM_ACK_STORE;
}

const LEARNING_TARGET_TYPES = Object.freeze([
  'species',
  'glossary',
  'tutorial',
  'lore_glossary',
  'feuillet',
  'content_page',
  'ecosystem',
]);
const MAX_TARGET_CODE_LEN = 64;

function parseConfirmBody(body) {
  if (!body || body.confirm !== true) {
    return { ok: false, error: 'Confirmation explicite requise (confirm: true)' };
  }
  return { ok: true };
}

function normalizeLearningTargetType(value) {
  const t = String(value || '')
    .trim()
    .toLowerCase();
  if (!LEARNING_TARGET_TYPES.includes(t)) return null;
  return t;
}

function normalizeTargetCode(value) {
  const code = String(value || '').trim();
  if (!code || code.length > MAX_TARGET_CODE_LEN) return null;
  return code;
}

function buildReaderKey(auth) {
  const reader_user_type = String(auth?.userType || '').trim();
  const reader_user_id = String(auth?.userId || '').trim();
  if (!reader_user_type || !reader_user_id) return null;
  return { reader_user_type, reader_user_id };
}

/** Valeurs des colonnes de lecteur d'un magasin, ou null si l'une manque. */
function readerValues(store, reader) {
  if (!reader) return null;
  const values = store.readerColumns.map((col) => reader[col]);
  return values.every((v) => v != null && v !== '') ? values : null;
}

/**
 * Enregistre (ou rafraichit) un accuse. Idempotent : re-marquer un contenu deja appris
 * ne fait que remonter la date, ce qui evite d'avoir a interroger avant d'ecrire.
 */
async function upsertLearningAckIn(db, store, reader, targetType, targetCode) {
  const type = normalizeLearningTargetType(targetType);
  const code = normalizeTargetCode(targetCode);
  const values = readerValues(store, reader);
  if (!type || !code || !values) return false;
  const cols = [...store.readerColumns, 'target_type', 'target_code', 'acknowledged_at'];
  const marks = [...store.readerColumns.map(() => '?'), '?', '?', 'NOW()'];
  await db.execute(
    `INSERT INTO ${store.table} (${cols.join(', ')})
     VALUES (${marks.join(', ')})
     ON DUPLICATE KEY UPDATE acknowledged_at = NOW()`,
    [...values, type, code],
  );
  return true;
}

/** Compatibilite : forme historique, cablee sur le magasin GL. */
async function upsertLearningAck(db, reader, targetType, targetCode) {
  return upsertLearningAckIn(db, GL_ACK_STORE, reader, targetType, targetCode);
}

async function listLearningAcksIn(db, store, reader, targetType = null) {
  const values = readerValues(store, reader);
  if (!values) return [];
  const normalizedType = targetType == null ? null : normalizeLearningTargetType(targetType);
  if (targetType != null && !normalizedType) return [];
  const params = [...values];
  const where = store.readerColumns.map((col) => `${col} = ?`).join(' AND ');
  let sql = `SELECT target_type, target_code FROM ${store.table} WHERE ${where}`;
  if (normalizedType) {
    sql += ' AND target_type = ?';
    params.push(normalizedType);
  }
  sql += ' ORDER BY target_type ASC, target_code ASC';
  return db.queryAll(sql, params);
}

/** Compatibilite : forme historique, cablee sur le magasin GL. */
async function listLearningAcks(db, reader, targetType = null) {
  return listLearningAcksIn(db, GL_ACK_STORE, reader, targetType);
}

function groupLearningAcksByType(rows) {
  const species_codes = [];
  const glossary_codes = [];
  const tutorial_ids = [];
  const lore_glossary_codes = [];
  const feuillet_codes = [];
  const content_page_slugs = [];
  const ecosystem_slugs = [];
  for (const row of rows || []) {
    const type = normalizeLearningTargetType(row?.target_type);
    const code = normalizeTargetCode(row?.target_code);
    if (!type || !code) continue;
    if (type === 'species') species_codes.push(code);
    else if (type === 'glossary') glossary_codes.push(code);
    else if (type === 'tutorial') {
      const id = Number(code);
      if (Number.isFinite(id) && id > 0) tutorial_ids.push(id);
    } else if (type === 'lore_glossary') lore_glossary_codes.push(code);
    else if (type === 'feuillet') feuillet_codes.push(code);
    else if (type === 'content_page') content_page_slugs.push(code);
    else if (type === 'ecosystem') ecosystem_slugs.push(code);
  }
  return {
    species_codes,
    glossary_codes,
    tutorial_ids,
    lore_glossary_codes,
    feuillet_codes,
    content_page_slugs,
    ecosystem_slugs,
  };
}

function markItemsLearned(items, learnedCodes, codeField) {
  const set = new Set(
    (Array.isArray(learnedCodes) ? learnedCodes : [])
      .map((c) => String(c || '').trim())
      .filter(Boolean),
  );
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    const key = String(item?.[codeField] || '').trim();
    return { ...item, learned: key ? set.has(key) : false };
  });
}

/** Lecteur ForetMap : toujours un compte. */
function buildFmReaderKey(userId) {
  const id = String(userId || '').trim();
  return id ? { user_id: id } : null;
}

module.exports = {
  GL_ACK_STORE,
  FM_ACK_STORE,
  ackStoreFor,
  buildFmReaderKey,
  upsertLearningAckIn,
  listLearningAcksIn,
  LEARNING_TARGET_TYPES,
  MAX_TARGET_CODE_LEN,
  parseConfirmBody,
  normalizeLearningTargetType,
  normalizeTargetCode,
  buildReaderKey,
  upsertLearningAck,
  listLearningAcks,
  groupLearningAcksByType,
  markItemsLearned,
};
