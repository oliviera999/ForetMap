'use strict';

/**
 * Enveloppe un handler de route asynchrone pour router toute exception (ou rejet de promesse)
 * vers `next(err)` — donc vers le gestionnaire d'erreurs centralise de `server.js`.
 *
 * Objectif (O8) : remplacer progressivement les ~338 blocs try/catch + `respondInternalError`
 * disperses dans `routes/` par un wrapper unique, sans changer le contrat d'erreur public
 * (le handler central renvoie deja `{ error }` avec le bon statut et masque les 5xx).
 *
 * Adoption INCREMENTALE : a appliquer route par route en verifiant que la reponse d'erreur
 * (statut + corps) reste identique a l'existant. Ne PAS retirer en masse les try/catch qui
 * exposent un message/he code specifique sans verifier le test correspondant.
 *
 * Usage :
 *   const asyncHandler = require('../lib/asyncHandler');
 *   router.get('/x', asyncHandler(async (req, res) => { ... }));  // throw -> next(err)
 *
 * Pour propager un statut precis depuis un handler, jeter une erreur portant `.status` :
 *   const e = new Error('Interdit'); e.status = 403; throw e;  // -> 403 { error: 'Interdit' }
 */
function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler attend une fonction (req, res, next)');
  }
  return function wrappedAsyncHandler(req, res, next) {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') {
        // Handler async : on renvoie la promesse DEJA catchee (rejet -> next, pas de rejet non gere).
        return Promise.resolve(result).catch(next);
      }
      return result;
    } catch (err) {
      // throw synchrone (avant tout await) : route aussi vers next(err).
      next(err);
      return undefined;
    }
  };
}

module.exports = asyncHandler;
