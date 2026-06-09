'use strict';

/**
 * Middleware de validation d'entree base sur zod (deja en dependance).
 *
 * Objectif : remplacer progressivement la validation manuelle heterogene des routes par des
 * schemas declaratifs, source de verite unique (corps / query / params), avec des messages
 * d'erreur 400 coherents. Adoption incrementale, route par route, sans changer le contrat
 * existant (les schemas doivent rester aussi permissifs que la validation manuelle remplacee).
 *
 * Usage :
 *   const { z, validate } = require('../lib/validate');
 *   const bodySchema = z.object({ reason: z.string().trim().min(1).max(300) });
 *   router.post('/x', validate({ body: bodySchema }), handler);
 *
 * Apres validation : `req.body` est remplace par les donnees parsees/coercees. Comme Express 5
 * expose `req.query` en lecture seule, les query/params valides sont exposes sur
 * `req.validatedQuery` / `req.validatedParams` (l'original reste accessible).
 */
const { z } = require('zod');

/** Construit un message d'erreur lisible (premier probleme) a partir d'une ZodError. */
function formatZodError(error) {
  const issues = error && Array.isArray(error.issues) ? error.issues : [];
  const first = issues[0];
  if (!first) return 'Requête invalide';
  const path = Array.isArray(first.path) && first.path.length ? `${first.path.join('.')} : ` : '';
  return `${path}${first.message}`;
}

/**
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
function validate(schemas = {}) {
  const { body, query, params } = schemas;
  return (req, res, next) => {
    try {
      if (body) {
        const r = body.safeParse(req.body);
        if (!r.success) return res.status(400).json({ error: formatZodError(r.error) });
        req.body = r.data;
      }
      if (query) {
        const r = query.safeParse(req.query);
        if (!r.success) return res.status(400).json({ error: formatZodError(r.error) });
        req.validatedQuery = r.data;
      }
      if (params) {
        const r = params.safeParse(req.params);
        if (!r.success) return res.status(400).json({ error: formatZodError(r.error) });
        req.validatedParams = r.data;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { z, validate, formatZodError };
