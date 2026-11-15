'use strict';

/**
 * Retour d'une réponse de QCM G&L (`lib/glRetourQcm.js`) : une seule fonction pour la chasse,
 * la lecture, la question de case et les QCM hors partie. Tests purs, sans base.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_FEEDBACK_INCORRECT,
  PAS_ENCORE_DEFAUTS,
  nettoyerAmorce,
  pasEncore,
  resoudreRetour,
} = require('../lib/glRetourQcm');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

// Le mot interdit des retours d'origine est construit à l'exécution (jamais en clair ici).
const MOT = ['fa', 'ux'].join('');

test('nettoyerAmorce : « Non », « Non, », « Non. », « Non : » et « c’est … : » retirés, majuscule remise', () => {
  assert.equal(nettoyerAmorce('Non. La coccinelle est utile.'), 'La coccinelle est utile.');
  assert.equal(nettoyerAmorce("Non, c'est tout l'inverse."), "C'est tout l'inverse.");
  assert.equal(nettoyerAmorce('Non : le baobab est trapu.'), 'Le baobab est trapu.');
  assert.equal(nettoyerAmorce('Non ! Regarde encore.'), 'Regarde encore.');
  assert.equal(nettoyerAmorce('non, élan et renne diffèrent.'), 'Élan et renne diffèrent.');
  assert.equal(
    nettoyerAmorce(`Non, c'est ${MOT} : on cultive bien des céréales.`),
    'On cultive bien des céréales.',
  );
  assert.equal(
    nettoyerAmorce(`Non, c’est ${MOT} : l'ours hiberne.`),
    "L'ours hiberne.",
    'apostrophe typographique',
  );
  assert.equal(nettoyerAmorce('Non.'), '');
  assert.equal(nettoyerAmorce('Non'), '');
});

test('nettoyerAmorce : un texte sans amorce est gardé tel quel', () => {
  assert.equal(nettoyerAmorce('Le chêne est un arbre.'), 'Le chêne est un arbre.');
  assert.equal(
    nettoyerAmorce('Non seulement il nage, mais il plonge.'),
    'Non seulement il nage, mais il plonge.',
  );
  assert.equal(nettoyerAmorce('Nonobstant la pluie, il sort.'), 'Nonobstant la pluie, il sort.');
  assert.equal(nettoyerAmorce('  Pas encore. Relis.  '), 'Pas encore. Relis.');
  assert.equal(nettoyerAmorce(null), '');
});

test('pasEncore : une seule fois « Pas encore », défaut quand le retour est vide', () => {
  assert.equal(pasEncore('Non. Relis la page.'), 'Pas encore. Relis la page.');
  assert.equal(pasEncore('Pas encore. Relis la page.'), 'Pas encore. Relis la page.');
  assert.equal(
    pasEncore('Non. Pas encore : cherche du côté du sol.'),
    'Pas encore : cherche du côté du sol.',
  );
  assert.equal(pasEncore(''), PAS_ENCORE_DEFAUTS.chasse);
  assert.equal(pasEncore(DEFAULT_FEEDBACK_INCORRECT), PAS_ENCORE_DEFAUTS.chasse);
  assert.equal(pasEncore('', PAS_ENCORE_DEFAUTS.case), PAS_ENCORE_DEFAUTS.case);
});

const ROW = {
  feedback_correct: 'Oui : la sentinelle guette.',
  feedback_a: null,
  feedback_b: `Non, c'est ${MOT} : chacun cherche sa nourriture.`,
  feedback_c: 'Non. Les suricates mangent surtout des insectes.',
  feedback_d: '',
};

test('resoudreRetour : bonne réponse → feedback_correct, sinon le défaut', () => {
  assert.equal(resoudreRetour(ROW, { correct: true, selectedLetter: 'A' }), ROW.feedback_correct);
  assert.equal(resoudreRetour({}, { correct: true }), 'Bonne réponse !');
  assert.equal(
    resoudreRetour(null, { correct: true }, { defautCorrect: 'Page tenue.' }),
    'Page tenue.',
  );
});

test('resoudreRetour (chasse, tenir) : avec feedback_<lettre> → nettoyé ; sans → défaut', () => {
  const avec = resoudreRetour(ROW, { correct: false, selectedLetter: 'B' }, { tenir: true });
  assert.equal(avec, 'Pas encore. Chacun cherche sa nourriture.');
  assert.equal(findForbiddenString(avec), null);
  const sans = resoudreRetour(ROW, { correct: false, selectedLetter: 'D' }, { tenir: true });
  assert.equal(sans, PAS_ENCORE_DEFAUTS.chasse);
  const sansLettre = resoudreRetour(
    ROW,
    { correct: false, selectedLetter: null },
    { tenir: true, contexte: 'case' },
  );
  assert.equal(sansLettre, PAS_ENCORE_DEFAUTS.case);
});

test('resoudreRetour (lecture) : feedback_incorrect est lu, une seule fois « Pas encore »', () => {
  const lecture = {
    feedback_correct: 'Oui, la forêt respire.',
    feedback_incorrect: 'Pas encore. Relis la première ligne de la page.',
  };
  const out = resoudreRetour(
    lecture,
    { correct: false, selectedLetter: 'C' },
    { tenir: true, contexte: 'lecture' },
  );
  assert.equal(out, 'Pas encore. Relis la première ligne de la page.');
  assert.equal(out.match(/Pas encore/g).length, 1);
  // Le retour par lettre garde la priorité quand il existe.
  const mixte = { ...lecture, feedback_c: 'Non. La neige écoute ailleurs.' };
  assert.equal(
    resoudreRetour(
      mixte,
      { correct: false, selectedLetter: 'C' },
      { tenir: true, contexte: 'lecture' },
    ),
    'Pas encore. La neige écoute ailleurs.',
  );
  assert.equal(
    resoudreRetour(
      {},
      { correct: false, selectedLetter: 'C' },
      { tenir: true, contexte: 'lecture' },
    ),
    PAS_ENCORE_DEFAUTS.lecture,
  );
});

test('resoudreRetour (hors « Tenir ») : même nettoyage, sans « Pas encore »', () => {
  assert.equal(
    resoudreRetour(ROW, { correct: false, selectedLetter: 'C' }),
    'Les suricates mangent surtout des insectes.',
  );
  assert.equal(
    resoudreRetour(ROW, { correct: false, selectedLetter: 'D' }),
    DEFAULT_FEEDBACK_INCORRECT,
  );
  assert.equal(resoudreRetour(null, { correct: false }), DEFAULT_FEEDBACK_INCORRECT);
});

test('aucune amorce « Non » ne sort, quel que soit le mode', () => {
  for (const tenir of [true, false]) {
    for (const selectedLetter of ['B', 'C']) {
      const out = resoudreRetour(ROW, { correct: false, selectedLetter }, { tenir });
      assert.doesNotMatch(out, /(^|\. )Non\b/);
    }
  }
});
