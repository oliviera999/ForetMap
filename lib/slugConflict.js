'use strict';

/**
 * Traduit un conflit d'unicité MySQL (slug déjà pris) en erreur HTTP 409 portée par `.status`,
 * destinée à être relancée depuis un `catch` scopé sur l'INSERT/UPDATE et rendue telle quelle par
 * le gestionnaire d'erreurs central (`server.js`). Patron O8 « mapping spécial » (cf. `routes/groups.js`).
 *
 * @param {any} err erreur d'origine (driver mysql2)
 * @throws {Error} une erreur `.status = 409` si conflit d'unicité, sinon relance `err` tel quel.
 */
function rethrowSlugConflict(err) {
  if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
    const conflict = new Error('Slug déjà utilisé');
    conflict.status = 409;
    throw conflict;
  }
  throw err;
}

module.exports = { rethrowSlugConflict };
