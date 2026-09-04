import { VISIT_MASCOT_STATE } from './visitMascotState.js';
import {
  MASCOT_EXPRESSION,
  MASCOT_EXPRESSIONS,
  MASCOT_EXPRESSION_LABELS,
  MASCOT_FRAMINGS,
  DEFAULT_MASCOT_EXPRESSION,
  DEFAULT_MASCOT_FRAMING,
  resolveMascotExpression,
  resolveMascotFraming,
} from '../shared/mascot/mascotExpressionsBase.js';

/**
 * Expressions du narrateur (OLU) — voir `docs/MASCOT_NARRATEUR_OLU.md` §4.3.
 *
 * Une **expression** n'est pas un état d'animation : c'est un sous-ensemble
 * sémantique, mappé sur les états canoniques déjà définis dans
 * `VISIT_MASCOT_STATE`. Aucun enum concurrent n'est introduit ici — la table
 * ci-dessous ne fait que projeter les expressions sur ces états.
 *
 * Le vocabulaire (expressions, cadrages, libellés, résolutions) vit dans le socle
 * neutre `src/shared/mascot/mascotExpressionsBase.js` (§8.2 : le mapping est
 * explicitement autorisé au partage, contrairement au **réglage**
 * `content.help.narrator` qui reste propre à ForetMap) ; ce module y ajoute la
 * projection sur `VISIT_MASCOT_STATE`, qui relève du code produit de la visite.
 */

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
