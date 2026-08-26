'use strict';

// =====================================================================
// Vue enseignante des verrous de conditionnement (ForetMap + Gnomes & Licornes).
//
// Constat C4 de l'audit : un eleve pouvait rester bloque plusieurs jours sans que
// personne ne le sache. Aucune route, aucun ecran n'exposait les tables de verrous ;
// le seul recours etait une requete SQL directe. Un dispositif qui punit en silence
// n'a pas sa place dans une classe.
//
// Le SQL differe (cle `user_id` cote ForetMap, couple lecteur cote GL) mais la forme
// de sortie est commune : un ecran identique sert les deux produits.
// =====================================================================

const MAX_ROWS = 200;

/** Ligne normalisee, quelle que soit la table d'origine. */
function toLockRow(row, product) {
  const remainingMs = Math.max(0, Date.parse(row.locked_until) - Date.now());
  return {
    product,
    learner: {
      // ForetMap identifie par compte ; GL par couple (type de lecteur, id) — un
      // invite ou un MJ n'a pas de compte utilisateur.
      user_id: product === 'gl' ? row.reader_user_id : row.user_id,
      user_type: product === 'gl' ? row.reader_user_type : 'student',
      display_name: row.display_name || null,
    },
    resource_type: row.resource_type,
    resource_ref: row.resource_ref,
    resource_label: row.resource_label || null,
    // Chaine vide = verrou de portee ressource ; un code = verrou d'une seule question.
    scope: row.question_code ? 'question' : 'resource',
    locked_question_code: row.question_code || null,
    wrong_question_code: row.wrong_question_code || null,
    wrong_attempts: Number(row.wrong_attempts) || 0,
    locked_until: row.locked_until ? new Date(row.locked_until).toISOString() : null,
    remaining_days: remainingMs > 0 ? Math.ceil(remainingMs / 86400000) : 0,
    expired: remainingMs <= 0,
  };
}

/**
 * Verrous ForetMap en cours, du plus recent au plus ancien.
 * Le titre du tutoriel est joint quand la ressource en est un : « tutorial 12 »
 * ne dit rien a un professeur, « Le compostage » si.
 */
async function listFmLocks(db, { includeExpired = false, resourceType = null } = {}) {
  const where = [];
  const params = [];
  if (!includeExpired) where.push('c.locked_until > NOW()');
  if (resourceType) {
    where.push('c.resource_type = ?');
    params.push(resourceType);
  }
  const rows = await db.queryAll(
    `SELECT c.user_id, c.resource_type, c.resource_ref, c.question_code,
            c.wrong_question_code, c.wrong_attempts, c.locked_until,
            u.display_name,
            t.title AS resource_label
       FROM resource_gating_cooldowns c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN tutorials t
         ON c.resource_type = 'tutorial'
        AND t.id = CAST(c.resource_ref AS UNSIGNED)
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.locked_until DESC
      LIMIT ${MAX_ROWS}`,
    params,
  );
  return rows.map((r) => toLockRow(r, 'fm'));
}

/** Verrous GL en cours. Le lecteur peut etre un joueur, un invite ou un MJ. */
async function listGlLocks(db, { includeExpired = false, resourceType = null } = {}) {
  const where = [];
  const params = [];
  if (!includeExpired) where.push('c.locked_until > NOW()');
  if (resourceType) {
    where.push('c.resource_type = ?');
    params.push(resourceType);
  }
  const rows = await db.queryAll(
    `SELECT c.reader_user_type, c.reader_user_id, c.resource_type, c.resource_ref,
            c.question_code, c.wrong_question_code, c.wrong_attempts, c.locked_until
       FROM gl_resource_gating_cooldowns c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.locked_until DESC
      LIMIT ${MAX_ROWS}`,
    params,
  );
  return rows.map((r) => toLockRow(r, 'gl'));
}

/**
 * Leve un verrou. Le professeur doit pouvoir debloquer : sans cela, l'ecran ne
 * ferait que constater les degats.
 * @returns {Promise<{ok: boolean, released: number}>}
 */
async function releaseFmLock(db, { userId, resourceType, resourceRef, questionCode = '' } = {}) {
  if (!userId || !resourceType || !resourceRef) return { ok: false, released: 0 };
  const result = await db.execute(
    `DELETE FROM resource_gating_cooldowns
      WHERE user_id = ? AND resource_type = ? AND resource_ref = ? AND question_code = ?`,
    [String(userId), resourceType, resourceRef, String(questionCode || '')],
  );
  return { ok: true, released: result.affectedRows || 0 };
}

async function releaseGlLock(
  db,
  { readerUserType, readerUserId, resourceType, resourceRef, questionCode = '' } = {},
) {
  if (!readerUserType || !readerUserId || !resourceType || !resourceRef) {
    return { ok: false, released: 0 };
  }
  const result = await db.execute(
    `DELETE FROM gl_resource_gating_cooldowns
      WHERE reader_user_type = ? AND reader_user_id = ?
        AND resource_type = ? AND resource_ref = ? AND question_code = ?`,
    [readerUserType, String(readerUserId), resourceType, resourceRef, String(questionCode || '')],
  );
  return { ok: true, released: result.affectedRows || 0 };
}

module.exports = {
  MAX_ROWS,
  toLockRow,
  listFmLocks,
  listGlLocks,
  releaseFmLock,
  releaseGlLock,
};
