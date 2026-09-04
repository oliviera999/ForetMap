/**
 * Expressions du narrateur (OLU) — socle **neutre** partagé ForetMap + GL.
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §4.3 et §8.2.
 *
 * Ce module ne connaît que le vocabulaire (expressions, cadrages, libellés) et les
 * résolutions tolérantes associées. La projection des expressions sur les états
 * d'animation canoniques (`VISIT_MASCOT_STATE`, code produit de la visite) vit dans
 * `src/utils/mascotExpressions.js`, qui ré-exporte tout ce socle : les consommateurs
 * produit n'ont donc qu'un seul point d'entrée, et `src/shared/` reste étanche.
 */
const MASCOT_EXPRESSION = Object.freeze({
  NEUTRE: 'neutre',
  PARLE: 'parle',
  MONTRE: 'montre',
  CONTENT: 'content',
  VIGILANT: 'vigilant',
  CHERCHE: 'cherche',
  GRAVE: 'grave',
  COMPLICE: 'complice',
});

/** Expression par défaut : toute valeur inconnue ou absente y retombe. */
const DEFAULT_MASCOT_EXPRESSION = MASCOT_EXPRESSION.NEUTRE;

/** Ordre stable (production graphique, écrans d'administration). */
const MASCOT_EXPRESSIONS = Object.freeze([
  MASCOT_EXPRESSION.NEUTRE,
  MASCOT_EXPRESSION.PARLE,
  MASCOT_EXPRESSION.MONTRE,
  MASCOT_EXPRESSION.CONTENT,
  MASCOT_EXPRESSION.VIGILANT,
  MASCOT_EXPRESSION.CHERCHE,
  MASCOT_EXPRESSION.GRAVE,
  MASCOT_EXPRESSION.COMPLICE,
]);

/** Libellés d'administration (studio prof, lot 5). */
const MASCOT_EXPRESSION_LABELS = Object.freeze({
  [MASCOT_EXPRESSION.NEUTRE]: 'Neutre',
  [MASCOT_EXPRESSION.PARLE]: 'Parle',
  [MASCOT_EXPRESSION.MONTRE]: 'Montre',
  [MASCOT_EXPRESSION.CONTENT]: 'Content',
  [MASCOT_EXPRESSION.VIGILANT]: 'Vigilant',
  [MASCOT_EXPRESSION.CHERCHE]: 'Cherche',
  [MASCOT_EXPRESSION.GRAVE]: 'Grave',
  [MASCOT_EXPRESSION.COMPLICE]: 'Complice',
});

/** Cadrages disponibles (§4.4). `bust` est le seul indispensable. */
const MASCOT_FRAMINGS = Object.freeze(['face', 'bust', 'body']);
const DEFAULT_MASCOT_FRAMING = 'bust';

/**
 * @param {string} raw expression brute (donnée de parcours, réglage, saisie prof)
 * @returns {string} expression canonique — `neutre` si inconnue
 */
function resolveMascotExpression(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return MASCOT_EXPRESSIONS.includes(value) ? value : DEFAULT_MASCOT_EXPRESSION;
}

/**
 * @param {string} raw cadrage brut
 * @returns {'face'|'bust'|'body'} cadrage canonique — `bust` si inconnu
 */
function resolveMascotFraming(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return MASCOT_FRAMINGS.includes(value) ? value : DEFAULT_MASCOT_FRAMING;
}

export {
  MASCOT_EXPRESSION,
  MASCOT_EXPRESSIONS,
  MASCOT_EXPRESSION_LABELS,
  MASCOT_FRAMINGS,
  DEFAULT_MASCOT_EXPRESSION,
  DEFAULT_MASCOT_FRAMING,
  resolveMascotExpression,
  resolveMascotFraming,
};
