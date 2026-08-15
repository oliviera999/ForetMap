import { VISIT_MASCOT_STATE } from './visitMascotState.js';

/**
 * Expressions du narrateur (OLU) — voir `docs/MASCOT_NARRATEUR_OLU.md` §4.3.
 *
 * Une **expression** n'est pas un état d'animation : c'est un sous-ensemble
 * sémantique, mappé sur les états canoniques déjà définis dans
 * `VISIT_MASCOT_STATE`. Aucun enum concurrent n'est introduit ici — la table
 * ci-dessous ne fait que projeter les expressions sur ces états.
 *
 * Partagé ForetMap + GL (§8.2 : le mapping est explicitement autorisé au partage,
 * contrairement au **réglage** `content.help.narrator` qui reste propre à ForetMap).
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

/** Expression → état canonique de `VISIT_MASCOT_STATE`. */
const MASCOT_EXPRESSION_STATE = Object.freeze({
  [MASCOT_EXPRESSION.NEUTRE]: VISIT_MASCOT_STATE.IDLE,
  [MASCOT_EXPRESSION.PARLE]: VISIT_MASCOT_STATE.TALK,
  [MASCOT_EXPRESSION.MONTRE]: VISIT_MASCOT_STATE.POINT,
  [MASCOT_EXPRESSION.CONTENT]: VISIT_MASCOT_STATE.HAPPY,
  [MASCOT_EXPRESSION.VIGILANT]: VISIT_MASCOT_STATE.ALERT,
  [MASCOT_EXPRESSION.CHERCHE]: VISIT_MASCOT_STATE.SEARCH,
  [MASCOT_EXPRESSION.GRAVE]: VISIT_MASCOT_STATE.SAD,
  [MASCOT_EXPRESSION.COMPLICE]: VISIT_MASCOT_STATE.WAVE,
});

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

/**
 * @param {string} raw expression brute
 * @returns {string} état canonique `VISIT_MASCOT_STATE` correspondant
 */
function mascotExpressionToState(raw) {
  return MASCOT_EXPRESSION_STATE[resolveMascotExpression(raw)];
}

export {
  MASCOT_EXPRESSION,
  MASCOT_EXPRESSIONS,
  MASCOT_EXPRESSION_STATE,
  MASCOT_EXPRESSION_LABELS,
  MASCOT_FRAMINGS,
  DEFAULT_MASCOT_EXPRESSION,
  DEFAULT_MASCOT_FRAMING,
  resolveMascotExpression,
  resolveMascotFraming,
  mascotExpressionToState,
};
