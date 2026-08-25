'use strict';

// Moteur d'appariement CONTENU question <-> CONTENU tutoriel (lib pure, sans BDD).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../lib/shared/tutorialQuestionMatch');

const TUTORIALS = [
  {
    id: 1,
    title: 'Le compostage',
    summary: 'Transformer les déchets verts en terreau fertile.',
    html_content:
      '<h2>Le compost</h2><p>Le compostage recycle les déchets organiques. Il faut alterner ' +
      'matières azotées (épluchures, tontes) et carbonées (feuilles mortes, carton). Le tas ' +
      'doit rester humide et aéré. Les vers de terre décomposent la matière.</p>',
  },
  {
    id: 2,
    title: 'Arroser au jardin',
    summary: 'Quand et comment arroser sans gaspiller.',
    html_content:
      '<p>Arroser tôt le matin limite évaporation. Le paillage conserve humidité du sol. ' +
      'Le goutte-à-goutte économise eau.</p>',
  },
  {
    id: 3,
    title: 'Le sol vivant',
    summary: 'Comprendre la vie du sol.',
    html_content:
      '<p>Un sol vivant abrite bactéries, champignons, vers de terre. La mycorhize associe ' +
      'champignon et racine.</p>',
  },
];

function suggest(questions, options = {}) {
  return m.suggestTutorialLinks({ questions, tutorials: TUTORIALS, ...options });
}

test('stem — pluriel retiré avant dérivation, radical stable', () => {
  // Le pluriel doit tomber en premier, sinon « elements » et « element » ne se
  // rejoindraient jamais (regression du premier jet).
  assert.equal(m.stem('elements'), m.stem('element'));
  assert.equal(m.stem('compostage'), m.stem('compost'));
  assert.equal(m.stem('compostages'), m.stem('compost'));
  assert.equal(m.stem('arrosage'), m.stem('arroser'));
  assert.equal(m.stem('journaux'), m.stem('journal'));
});

test('stem — pas de fusion abusive de mots distincts', () => {
  assert.notEqual(m.stem('pollen'), m.stem('polluer'));
  // Le garde de longueur minimale protège les mots courts d'un rabotage.
  assert.equal(m.stem('hiver'), 'hiver');
});

test('stripHtml — balises, scripts et entités retirés', () => {
  assert.equal(
    m.stripHtml('<p>Le <strong>compost</strong>&nbsp;chauffe.</p><script>alert(1)</script>'),
    'Le compost chauffe.',
  );
  assert.equal(m.stripHtml('<!-- caché -->visible'), 'visible');
  assert.equal(m.stripHtml(null), '');
});

test('extractTerms — mots-outils et mots trop courts écartés', () => {
  const terms = m.extractTerms('Quelle est la couleur du compost ?');
  // Les termes sont stockés sous forme de RADICAL, pas de mot brut.
  assert.ok(terms.has(m.stem('compost')));
  assert.ok(terms.has(m.stem('couleur')));
  for (const noise of ['quelle', 'est', 'la', 'du']) {
    assert.ok(!terms.has(noise), `« ${noise} » ne devrait pas être un terme`);
  }
});

test('apparie chaque question au tutoriel qui traite son sujet', () => {
  const links = suggest([
    { code: 'QF001', text: 'Que met-on dans le compost pour équilibrer les matières azotées ?' },
    {
      code: 'QF002',
      text: 'À quel moment vaut-il mieux arroser ?',
      reponse_texte: 'Tôt le matin.',
    },
    {
      code: 'QF003',
      text: 'Qu est-ce qu une mycorhize ?',
      reponse_texte: 'Un champignon associé à une racine.',
    },
  ]);
  const byQuestion = new Map(links.map((l) => [l.question_code, l]));
  assert.equal(byQuestion.get('QF001').resource_ref, '1');
  assert.equal(byQuestion.get('QF002').resource_ref, '2');
  // Correspondance trouvée uniquement dans le CORPS du tutoriel : le champ est un
  // bonus, jamais un diviseur — sans quoi elle plafonnerait sous le seuil.
  assert.equal(byQuestion.get('QF003').resource_ref, '3');
});

test('une question hors sujet ne produit aucun lien', () => {
  const links = suggest([
    {
      code: 'QF404',
      text: 'Quelle est la capitale de la Mongolie ?',
      reponse_texte: 'Oulan-Bator.',
    },
  ]);
  assert.deepEqual(links, []);
});

test('la confiance croît avec le nombre de termes partagés', () => {
  // Seuil abaissé volontairement : on compare DEUX candidats, dont le plus faible
  // passe sous le seuil par défaut (0,5) — c'est le classement qu'on teste ici.
  const links = suggest(
    [{ code: 'QF006', text: 'Les vers de terre vivent-ils dans le compost ?' }],
    {
      minConfidence: 0.1,
    },
  );
  assert.ok(links.length >= 2, 'deux tutoriels partagent du vocabulaire avec cette question');
  // Le tutoriel qui partage le plus de termes passe devant.
  assert.equal(links[0].resource_ref, '1');
  assert.ok(links[0].confidence > links[1].confidence);
});

test('un seul terme partagé ne suffit pas à proposer un lien', () => {
  const links = suggest([{ code: 'QF007', text: 'Le carton se recycle-t-il en ville ?' }]);
  for (const link of links) {
    assert.ok(link.matched_terms.length >= m.MIN_SHARED_TERMS);
  }
});

test('les liens déjà existants ne sont jamais re-suggérés', () => {
  const question = [{ code: 'QF001', text: 'Que met-on dans le compost, matières azotées ?' }];
  assert.ok(suggest(question).some((l) => l.resource_ref === '1'));
  const filtered = suggest(question, { existing: new Set(['tutorial|1|QF001']) });
  assert.ok(!filtered.some((l) => l.resource_ref === '1'));
});

test('maxPerQuestion borne le nombre de propositions', () => {
  const links = suggest(
    [{ code: 'QF006', text: 'Les vers de terre vivent-ils dans le compost ?' }],
    {
      maxPerQuestion: 1,
    },
  );
  assert.equal(links.length, 1);
});

test('minConfidence écarte les rapprochements faibles', () => {
  const question = [{ code: 'QF006', text: 'Les vers de terre vivent-ils dans le compost ?' }];
  assert.ok(
    suggest(question, { minConfidence: 0.1 }).length >
      suggest(question, { minConfidence: 0.9 }).length,
  );
});

test('forme du lien conforme à resource_question_links', () => {
  const [link] = suggest([
    { code: 'QF001', text: 'Que met-on dans le compost pour équilibrer les matières azotées ?' },
  ]);
  assert.equal(link.resource_type, 'tutorial');
  assert.equal(link.origin, 'auto');
  assert.equal(link.status, 'suggested');
  assert.ok(link.confidence > 0 && link.confidence <= 1, 'confiance dans [0,1] (DECIMAL(4,3))');
  assert.ok(link.reason.startsWith('contenu: '));
  assert.ok(link.reason.length <= 255, 'note bornée à 255 caractères en base');
});

test('entrées vides ou dégénérées ne cassent rien', () => {
  assert.deepEqual(m.suggestTutorialLinks({}), []);
  assert.deepEqual(m.suggestTutorialLinks({ questions: [], tutorials: TUTORIALS }), []);
  assert.deepEqual(m.suggestTutorialLinks({ questions: [{ code: 'Q' }], tutorials: [] }), []);
  assert.deepEqual(suggest([{ text: 'sans code' }]), []);
  assert.deepEqual(suggest([null]), []);
});

test('un tutoriel sans corps (lien externe / PDF) reste appariable par titre et résumé', () => {
  const links = m.suggestTutorialLinks({
    questions: [{ code: 'QF010', text: 'Comment réussir un semis de radis sous châssis ?' }],
    tutorials: [
      { id: 9, title: 'Réussir ses semis', summary: 'Semis de radis et repiquage sous châssis.' },
      { id: 10, title: 'Le compostage', summary: 'Déchets verts et terreau.' },
    ],
  });
  assert.ok(links.length >= 1);
  assert.equal(links[0].resource_ref, '9');
});

test('un vocabulaire passe-partout ne suffit pas à un score élevé', () => {
  // Sur le corpus réel, dix questions-photo sans texte utile (« Quelle espèce
  // reconnais-tu ? ») arrivaient en tête à 0,95 : la couverture est RELATIVE et
  // sature dès que la question a peu de termes. La preuve absolue corrige cela.
  const generic = m.suggestTutorialLinks({
    questions: [{ code: 'QF900', text: 'Quelle espèce du jardin reconnais-tu sur cette photo ?' }],
    tutorials: TUTORIALS,
    minConfidence: 0,
  });
  for (const link of generic) {
    assert.ok(
      link.confidence < 0.7,
      `score trop élevé pour un vocabulaire générique : ${link.confidence}`,
    );
  }
});

test('un terme partagé par plusieurs fiches pèse moins qu’un terme rare', () => {
  const idf = m.computeIdf(TUTORIALS.map(m.buildTutorialDocument));
  const partage = idf.get(m.stem('terre')); // présent dans deux fiches
  const rare = idf.get(m.stem('mycorhize')); // présent dans une seule
  assert.ok(partage != null && rare != null, 'les deux termes doivent être dans le corpus');
  assert.ok(rare > partage, 'un terme rare doit peser plus qu’un terme partagé');
});
