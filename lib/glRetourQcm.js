'use strict';

/**
 * Retour d'une réponse de QCM G&L — **une seule fonction** pour la chasse, la lecture, la
 * question de case et les QCM hors partie (`lib/glChasse.js`, `routes/gl/games/qcm.js`,
 * `routes/gl/qcm.js`, `routes/gl/lore.js`).
 *
 * Constats du 14 novembre 2026 :
 * - `feedback_incorrect` des questions de lecture n'était jamais lu (seuls `feedback_a…e`
 *   l'étaient) ;
 * - 3 709 retours sur 3 742 commencent par « Non » : l'écran affichait « Pas encore. Non, c'est
 *   tout l'inverse… », et 25 d'entre eux « Non, c'est faux : … » (mot interdit).
 *
 * Ordre pour une mauvaise réponse : `feedback_<lettre>`, puis `feedback_incorrect`, puis le
 * défaut. L'amorce « Non » est retirée **à l'affichage** (la base garde le texte d'auteur).
 * Garde-fou « l'erreur ne punit jamais » : en mode « Tenir », le retour commence par
 * « Pas encore », une seule fois.
 */

const DEFAULT_FEEDBACK_CORRECT = 'Bonne réponse !';
const DEFAULT_FEEDBACK_INCORRECT = 'Ce n’est pas la bonne réponse.';

/** Défauts « Pas encore » quand la question ne porte aucun retour, par contexte. */
const PAS_ENCORE_DEFAUTS = Object.freeze({
  chasse: 'Pas encore : la page dort encore ici.',
  lecture: 'Pas encore. Relis la page : la réponse s’y trouve.',
  case: 'Pas encore. Rien n’est retiré.',
});

// « Non », « Non, », « Non. », « Non : », « Non ! », « Non — » : seulement suivi d'une
// ponctuation ou de la fin du texte (« Non seulement… » et « Nonobstant » ne sont pas des amorces).
const AMORCE_NON_RE = /^\s*non(?:\s*[,.:!;…]+|\s+[—–-]|\s*$)\s*/iu;
// « c'est faux : », seulement juste après l'amorce.
const AMORCE_FAUX_RE = /^c[’']est\s+faux\s*[:,.!;…]*\s*/iu;
const DEFAUT_INCORRECT_RE = /^ce n[’']est pas la bonne réponse\.?\s*/iu;
const PAS_ENCORE_RE = /^pas encore/iu;

/** Met en majuscule la première lettre (après d'éventuels guillemets ou parenthèses). */
function majusculeInitiale(text) {
  return String(text).replace(
    /^([^\p{L}\p{N}]*)(\p{L})/u,
    (_, avant, lettre) => `${avant}${lettre.toLocaleUpperCase('fr-FR')}`,
  );
}

/**
 * Retire l'amorce « Non » d'un retour et, si elle suit, « c'est faux : » ; remet la majuscule.
 * Un texte sans amorce est rendu tel quel (espaces de bord retirés).
 */
function nettoyerAmorce(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const amorce = AMORCE_NON_RE.exec(s);
  if (!amorce) return s;
  const reste = s.slice(amorce[0].length).replace(AMORCE_FAUX_RE, '').trim();
  return reste ? majusculeInitiale(reste) : '';
}

/**
 * « Pas encore » : jamais « Non », jamais « faux » côté élève (règles § 1-4). Ne produit jamais
 * « Pas encore. Pas encore » : un texte qui commence déjà ainsi est gardé tel quel.
 */
function pasEncore(feedback, defaut = PAS_ENCORE_DEFAUTS.chasse) {
  const cleaned = nettoyerAmorce(String(feedback ?? '').replace(DEFAUT_INCORRECT_RE, ''));
  if (!cleaned) return defaut;
  if (PAS_ENCORE_RE.test(cleaned)) return cleaned;
  return `Pas encore. ${cleaned}`;
}

/** Texte d'auteur d'une mauvaise réponse : lettre choisie, puis retour commun, sinon `''`. */
function texteMauvaiseReponse(questionRow, selectedLetter) {
  if (!questionRow) return '';
  const letter = String(selectedLetter || '').toLowerCase();
  if (letter) {
    const parLettre = String(questionRow[`feedback_${letter}`] || '').trim();
    if (parLettre) return parLettre;
  }
  return String(questionRow.feedback_incorrect || '').trim();
}

/**
 * Retour affiché après une réponse.
 *
 * @param {object|null} questionRow ligne de question (`feedback_correct`, `feedback_a…e`,
 *   `feedback_incorrect` selon la table)
 * @param {{ correct: boolean, selectedLetter?: string|null }} verification
 * @param {object} [options]
 * @param {boolean} [options.tenir] partie « Tenir à deux » : « Pas encore… » sur une erreur
 * @param {'chasse'|'lecture'|'case'} [options.contexte] choisit le défaut « Pas encore »
 * @param {string} [options.defautCorrect] défaut d'une bonne réponse sans retour
 * @returns {string}
 */
function resoudreRetour(questionRow, verification, options = {}) {
  const { tenir = false, contexte = 'chasse', defautCorrect = DEFAULT_FEEDBACK_CORRECT } = options;
  if (verification?.correct) {
    return String(questionRow?.feedback_correct || '').trim() || defautCorrect;
  }
  const auteur = texteMauvaiseReponse(questionRow, verification?.selectedLetter);
  if (tenir) {
    return pasEncore(auteur, PAS_ENCORE_DEFAUTS[contexte] || PAS_ENCORE_DEFAUTS.chasse);
  }
  return nettoyerAmorce(auteur) || DEFAULT_FEEDBACK_INCORRECT;
}

module.exports = {
  DEFAULT_FEEDBACK_CORRECT,
  DEFAULT_FEEDBACK_INCORRECT,
  PAS_ENCORE_DEFAUTS,
  majusculeInitiale,
  nettoyerAmorce,
  pasEncore,
  texteMauvaiseReponse,
  resoudreRetour,
};
