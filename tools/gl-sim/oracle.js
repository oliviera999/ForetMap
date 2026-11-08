'use strict';

/**
 * Oracle du **prof virtuel** : pour qu'un élève virtuel réponde juste avec la probabilité de sa
 * `justesse`, le banc doit connaître la bonne réponse d'une présentation. Il la lit en base
 * (`gl_qcm_questions.reponse_correcte`, `gl_tenir_questions_lecture.reponse`) et la rapproche de
 * l'ordre des choix présentés (`readPresentationLayout` de `lib/qcmChoices.js`, sans consommer le
 * jeton). Les élèves virtuels ne lisent jamais la base : seul l'oracle le fait, à leur place,
 * pour décider « juste » ou « pas encore ».
 */

const { readPresentationLayout } = require('../../lib/qcmChoices');
const { LECTURE_PREFIX } = require('../../lib/glChasse');

const LETTRES = ['A', 'B', 'C', 'D', 'E'];

function creerOracle(db) {
  const cache = new Map();

  async function lettreCorrecte(questionCode) {
    const code = String(questionCode || '');
    if (cache.has(code)) return cache.get(code);
    let lettre = null;
    if (code.startsWith(LECTURE_PREFIX)) {
      const row = await db.queryOne(
        'SELECT reponse FROM gl_tenir_questions_lecture WHERE zone_key = ? AND actif = 1 LIMIT 1',
        [code.slice(LECTURE_PREFIX.length)],
      );
      lettre = row ? String(row.reponse || 'A').toUpperCase() : null;
    } else {
      const row = await db.queryOne(
        'SELECT reponse_correcte FROM gl_qcm_questions WHERE question_code = ? LIMIT 1',
        [code],
      );
      lettre = row ? String(row.reponse_correcte || '').toUpperCase() : null;
      if (!lettre) {
        const lore = await db
          .queryOne(
            'SELECT reponse_correcte FROM gl_qcm_lore_questions WHERE question_code = ? LIMIT 1',
            [code],
          )
          .catch(() => null);
        lettre = lore ? String(lore.reponse_correcte || '').toUpperCase() : null;
      }
    }
    cache.set(code, lettre);
    return lettre;
  }

  /**
   * Identifiant du bon choix d'une présentation (`{ presentationToken, questionCode, choices }`),
   * ou `null` si inconnu.
   */
  async function bonChoix(presentation) {
    if (!presentation?.presentationToken) return null;
    const layout = readPresentationLayout(presentation.presentationToken);
    const letters = Array.isArray(layout?.choiceLetters) ? layout.choiceLetters : [];
    const lettre = await lettreCorrecte(presentation.questionCode || layout?.questionCode);
    if (!lettre || !LETTRES.includes(lettre)) return null;
    const idx = letters.findIndex((l) => String(l).toUpperCase() === lettre);
    return idx >= 0 ? idx : null;
  }

  /**
   * Choix d'un élève de `justesse` p : le bon avec probabilité p, sinon un mauvais au hasard.
   * @returns {Promise<{ choiceId: number, voulaitJuste: boolean }>}
   */
  async function choisir(presentation, justesse, rng) {
    const n = Array.isArray(presentation?.choices) ? presentation.choices.length : 0;
    const bon = await bonChoix(presentation);
    const voulaitJuste = rng.chance(justesse);
    if (bon == null || n < 2) return { choiceId: rng.int(0, Math.max(0, n - 1)), voulaitJuste };
    if (voulaitJuste) return { choiceId: bon, voulaitJuste };
    const mauvais = [];
    for (let i = 0; i < n; i += 1) if (i !== bon) mauvais.push(i);
    return { choiceId: rng.pick(mauvais), voulaitJuste };
  }

  return { lettreCorrecte, bonChoix, choisir };
}

module.exports = { creerOracle, LETTRES };
