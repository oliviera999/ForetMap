'use strict';

/**
 * Non-régression du corpus d'apprentissage à la voix d'OLU
 * (cf. `docs/MASCOT_NARRATEUR_OLU.md` §2.4 et §7.4).
 *
 * Même esprit que `help-corpus-olu.test.js` : ce test ne juge pas le style, il verrouille
 * les règles mécaniques de la charte et les invariants que la réécriture ne doit pas casser
 * silencieusement. Deux d'entre eux sont propres à ces surfaces-ci :
 *
 * - **le tirage est déterministe** — une phrase qui changerait à chaque rendu de React se
 *   lirait comme un bug, pas comme de la variété ;
 * - **les variantes sont réellement distinctes** — un pool de cinq lignes dont trois
 *   seraient tirées vers le même texte ne protégerait de rien.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const voiceUrl = pathToFileURL(join(__dirname, '../src/shared/utils/oluLearningVoice.js')).href;

/** Emoji au sens large (pictogrammes), y compris les séquences à sélecteur de variation. */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Tournures explicitement bannies par la charte (§2.6). */
const FORBIDDEN_PHRASES = [
  'n’hésite pas',
  "n'hésite pas",
  'Désolé',
  'Tu me suis',
  'C’est clair ?',
  // Flatterie (§2.2) : le corpus d'origine en était fait, c'est précisément ce qu'on retire.
  'Bravo',
  'Excellent',
  // Tournures scribales de la toute première charte (§2.6), abandonnées avec le personnage.
  'mon herbier',
  'j’ai recopié',
];

/**
 * Jetons de rendu des pools écrits en fonctions — mêmes arguments que l'appelant réel, sinon
 * la ligne mesurée ne serait pas celle que l'élève lit.
 */
const RENDER_ARGS = {
  OLU_GATING_INTRO: ['« Le compostage »', 'une question sera posée'],
  OLU_SERIES_PROGRESS: [1, 3, 2, '« Le compostage »', 's'],
  OLU_CONTROL_PASSED: ['« Le compostage »'],
};

/** Toutes les lignes du module, pools de fonctions compris. */
async function allVoiceLines() {
  const voice = await import(voiceUrl);
  const lines = [];
  for (const [name, value] of Object.entries(voice)) {
    if (!name.startsWith('OLU_')) continue;
    const args = RENDER_ARGS[name] || [];
    const pools = Array.isArray(value) ? { [name]: value } : value;
    for (const [key, pool] of Object.entries(pools)) {
      for (const entry of pool) {
        const text = typeof entry === 'function' ? entry(...args) : entry;
        lines.push({ pool: `${name}.${key}`, text: String(text) });
      }
    }
  }
  return lines;
}

test('voix d’apprentissage : aucun emoji', async () => {
  for (const { pool, text } of await allVoiceLines()) {
    assert.ok(!EMOJI_RE.test(text), `${pool} : emoji interdit dans « ${text} »`);
  }
});

// §2.4 : le plafond d'exclamations de l'aide était « une par parcours ». Ici, une même ligne
// est relue des dizaines de fois dans l'heure : le plafond tombe à zéro, et le ton se joue
// sur le décalage et le placement de la chute, pas sur la ponctuation.
test('voix d’apprentissage : aucun point d’exclamation', async () => {
  for (const { pool, text } of await allVoiceLines()) {
    assert.ok(!text.includes('!'), `${pool} : point d’exclamation dans « ${text} »`);
  }
});

test('voix d’apprentissage : aucune tournure bannie par la charte', async () => {
  for (const { pool, text } of await allVoiceLines()) {
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase), `${pool} : tournure bannie « ${phrase} » dans « ${text} »`);
    }
  }
});

// §2.4 : « 1 à 3 phrases par bulle ». Sur un retour de QCM, c'est même plus court — et une
// ligne qui déborde passerait mal sous une question, au chausse-pied dans un popover.
test('voix d’apprentissage : des lignes courtes', async () => {
  for (const { pool, text } of await allVoiceLines()) {
    assert.ok(
      text.length <= 130,
      `${pool} : ${text.length} caractères (maximum 130) — « ${text} »`,
    );
  }
});

// §2.2bis-3 : c'est la répétition d'un même procédé qui use le ton, pas la blague isolée.
// Un pool de deux lignes ne tient pas la distance sur une surface aussi relue.
test('voix d’apprentissage : au moins trois variantes par pool', async () => {
  const voice = await import(voiceUrl);
  const pools = {
    OLU_CORRECT_FEEDBACK: voice.OLU_CORRECT_FEEDBACK,
    OLU_WRONG_FEEDBACK: voice.OLU_WRONG_FEEDBACK,
    OLU_QUIZ_INTRO: voice.OLU_QUIZ_INTRO,
    OLU_QUIZ_HEADER: voice.OLU_QUIZ_HEADER,
    OLU_GATING_INTRO: voice.OLU_GATING_INTRO,
    OLU_SERIES_PROGRESS: voice.OLU_SERIES_PROGRESS,
    OLU_CONTROL_PASSED: voice.OLU_CONTROL_PASSED,
    OLU_SERIES_DONE: voice.OLU_SERIES_DONE,
    ...voice.OLU_ACK_ASIDES,
  };
  for (const [name, pool] of Object.entries(pools)) {
    assert.ok(Array.isArray(pool) && pool.length >= 3, `${name} : au moins 3 variantes attendues`);
    const args = RENDER_ARGS[name] || [];
    const rendered = pool.map((entry) =>
      typeof entry === 'function' ? String(entry(...args)) : String(entry),
    );
    assert.equal(new Set(rendered).size, rendered.length, `${name} : deux variantes identiques`);
  }
});

test('tirage déterministe : même graine, même phrase', async () => {
  const { oluAnswerFeedback } = await import(voiceUrl);
  const first = oluAnswerFeedback(true, 'QF0042');
  for (let i = 0; i < 5; i += 1) {
    assert.equal(oluAnswerFeedback(true, 'QF0042'), first);
  }
});

test('tirage déterministe : des graines voisines se répartissent', async () => {
  const { oluAnswerFeedback, OLU_WRONG_FEEDBACK } = await import(voiceUrl);
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) {
    seen.add(oluAnswerFeedback(false, `QF${String(i).padStart(4, '0')}`));
  }
  assert.ok(
    seen.size >= Math.min(3, OLU_WRONG_FEEDBACK.length),
    `40 questions consécutives ne tirent que ${seen.size} formulation(s)`,
  );
});

test('graine absente : une phrase quand même, jamais une chaîne vide', async () => {
  const { oluAnswerFeedback, oluQuizIntroOpener, oluSeriesDoneOpener } = await import(voiceUrl);
  assert.ok(oluAnswerFeedback(true).length > 0);
  assert.ok(oluAnswerFeedback(false).length > 0);
  assert.ok(oluQuizIntroOpener().length > 0);
  assert.ok(oluSeriesDoneOpener().length > 0);
});

// Chaque produit a son geste : ForetMap fait déclarer une observation de terrain (`plant`),
// G&L fait déclarer l'étude d'une fiche (`species`). Les confondre ferait dire à OLU
// « vu sur le terrain » devant un élève qui n'a rien vu du tout.
test('pointes d’accusé : une par nature de ressource, et rien pour les autres', async () => {
  const { oluAsideKindForResource, oluAcknowledgeAside } = await import(voiceUrl);
  assert.equal(oluAsideKindForResource('plant'), 'observation');
  assert.equal(oluAsideKindForResource('species'), 'species');
  assert.equal(oluAsideKindForResource('glossary'), 'glossary');
  assert.equal(oluAsideKindForResource('tutorial'), 'tutorial');
  assert.equal(oluAsideKindForResource('feuillet'), '');
  assert.equal(oluAsideKindForResource(null), '');
  assert.equal(oluAcknowledgeAside('', 'X'), '');
  assert.equal(oluAcknowledgeAside('inconnu', 'X'), '');
  assert.ok(oluAcknowledgeAside('glossary', 'compost').length > 0);
});

// Un feedback écrit par le professeur reste prioritaire : la voix d'OLU n'est qu'un défaut.
test('le feedback du professeur gagne toujours sur la voix d’OLU', async () => {
  const feedbackUrl = pathToFileURL(join(__dirname, '../src/shared/qcm/qcmFeedback.js')).href;
  const { getQcmFeedbackText } = await import(feedbackUrl);
  assert.equal(
    getQcmFeedbackText({ correct: true, feedback: '  Le compost monte à 60 °C.  ' }),
    'Le compost monte à 60 °C.',
  );
  assert.equal(getQcmFeedbackText({ correct: true, error: 'boum' }), '');
  assert.equal(getQcmFeedbackText(null), '');
});
