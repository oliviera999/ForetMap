'use strict';

/**
 * Processeur du scénario `artillery-biodiv.yml`.
 *
 * Artillery ne capture qu'UNE valeur par expression `json:` — impossible d'en tirer la liste
 * d'identifiants nécessaire à la boucle « une requête par fiche ». On la construit donc ici,
 * à partir de la réponse de `GET /api/plants`, pour que le scénario reste juste quel que soit
 * le jeu de données (des identifiants codés en dur taperaient des fiches inexistantes et
 * mesureraient des 404).
 */

/** Nombre de fiches dont on rejoue la rafale (borne basse : le catalogue réel en a plus). */
const CARDS_PER_OPEN = 20;

function collectPlantIds(requestParams, response, context, ee, next) {
  let ids = [];
  try {
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    if (Array.isArray(body)) {
      ids = body
        .map((row) => Number(row && row.id))
        .filter((n) => Number.isFinite(n) && n > 0)
        .slice(0, CARDS_PER_OPEN);
    }
  } catch (_err) {
    ids = [];
  }
  context.vars.plantIds = ids;
  context.vars.openedPlantId = ids[0] || 1;
  return next();
}

module.exports = { collectPlantIds, CARDS_PER_OPEN };
