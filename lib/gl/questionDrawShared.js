'use strict';

/**
 * Handler de tirage aléatoire mutualisé entre `GET /api/gl/qcm/draw`
 * (`routes/gl/qcm.js`) et `GET /api/gl/lore/qcm/draw` (`routes/gl/lore.js`)
 * — AUDIT_CODE_2026-07 §4.2. Les deux routes ne diffèrent que par la table,
 * la colonne de scope et le message d'erreur « scope vide » ; le reste du
 * tirage (filtre catégorie, exclusion, requête projetée `question_code`,
 * codes HTTP, tirage `Math.random`, corps de réponse) est byte-identique.
 *
 * `table` et `scopeColumn` sont des constantes contrôlées par l'appelant
 * (jamais des entrées utilisateur) : elles sont interpolées car un nom de
 * table/colonne SQL ne peut pas être un placeholder `?`. Toutes les valeurs
 * issues de la requête HTTP restent paramétrées (`?`).
 *
 * Périmètre GL uniquement : aucun store de session ni claim mutualisé.
 */

const { normalizeOptionalString } = require('../shared/httpHelpers');

/**
 * @param {{ queryAll: Function }} db
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ table: string, scopeColumn: string, scopeSlugs: string[], emptyScopeError: string }} config
 */
async function handleQuestionDraw(
  { queryAll },
  req,
  res,
  { table, scopeColumn, scopeSlugs, emptyScopeError },
) {
  if (scopeSlugs.length === 0) {
    return res.status(400).json({ error: emptyScopeError });
  }
  const categorieSlug = normalizeOptionalString(req.query?.categorieSlug);
  const excludeRaw = normalizeOptionalString(req.query?.exclude);
  const exclude = excludeRaw
    ? excludeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const placeholders = scopeSlugs.map(() => '?').join(', ');
  const params = [...scopeSlugs];
  // Tirage : seuls les codes sont chargés (la route ne renvoie que question_code).
  let sql = `SELECT question_code FROM ${table}
      WHERE statut = 'actif' AND ${scopeColumn} IN (${placeholders})`;
  if (categorieSlug) {
    sql += ' AND categorie_slug = ?';
    params.push(categorieSlug);
  }
  if (exclude.length > 0) {
    sql += ` AND question_code NOT IN (${exclude.map(() => '?').join(', ')})`;
    params.push(...exclude);
  }

  const pool = await queryAll(sql, params);
  if (pool.length === 0) return res.status(404).json({ error: 'Aucune question disponible' });
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return res.json({ question_code: picked.question_code });
}

module.exports = { handleQuestionDraw };
