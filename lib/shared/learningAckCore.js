'use strict';

const LEARNING_TARGET_TYPES = Object.freeze(['species', 'glossary', 'tutorial']);
const MAX_TARGET_CODE_LEN = 64;

function parseConfirmBody(body) {
  if (!body || body.confirm !== true) {
    return { ok: false, error: 'Confirmation explicite requise (confirm: true)' };
  }
  return { ok: true };
}

function normalizeLearningTargetType(value) {
  const t = String(value || '').trim().toLowerCase();
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

async function upsertLearningAck(db, reader, targetType, targetCode) {
  const type = normalizeLearningTargetType(targetType);
  const code = normalizeTargetCode(targetCode);
  if (!type || !code || !reader) return false;
  await db.execute(
    `INSERT INTO gl_learning_acknowledgements
      (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE acknowledged_at = NOW()`,
    [reader.reader_user_type, reader.reader_user_id, type, code]
  );
  return true;
}

async function listLearningAcks(db, reader, targetType = null) {
  if (!reader) return [];
  const normalizedType = targetType == null ? null : normalizeLearningTargetType(targetType);
  if (targetType != null && !normalizedType) return [];
  const params = [reader.reader_user_type, reader.reader_user_id];
  let sql = `SELECT target_type, target_code
               FROM gl_learning_acknowledgements
              WHERE reader_user_type = ? AND reader_user_id = ?`;
  if (normalizedType) {
    sql += ' AND target_type = ?';
    params.push(normalizedType);
  }
  sql += ' ORDER BY target_type ASC, target_code ASC';
  return db.queryAll(sql, params);
}

function groupLearningAcksByType(rows) {
  const species_codes = [];
  const glossary_codes = [];
  const tutorial_ids = [];
  for (const row of rows || []) {
    const type = normalizeLearningTargetType(row?.target_type);
    const code = normalizeTargetCode(row?.target_code);
    if (!type || !code) continue;
    if (type === 'species') species_codes.push(code);
    else if (type === 'glossary') glossary_codes.push(code);
    else if (type === 'tutorial') {
      const id = Number(code);
      if (Number.isFinite(id) && id > 0) tutorial_ids.push(id);
    }
  }
  return { species_codes, glossary_codes, tutorial_ids };
}

function markItemsLearned(items, learnedCodes, codeField) {
  const set = new Set(
    (Array.isArray(learnedCodes) ? learnedCodes : [])
      .map((c) => String(c || '').trim())
      .filter(Boolean)
  );
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    const key = String(item?.[codeField] || '').trim();
    return { ...item, learned: key ? set.has(key) : false };
  });
}

module.exports = {
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
