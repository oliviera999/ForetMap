'use strict';

/**
 * Suggestion de métier et de format (`lib/tasks/taskCategoryGuess.js`, noyau partagé
 * `src/shared/taskCategoryGuessCore.js`) : exemples de l'annexe 1 du cahier des charges
 * (tâches réelles de la base, avec leur nombre d'élèves et leur récurrence), et un titre
 * inconnu qui ne reçoit aucune suggestion plutôt qu'un mauvais métier.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { guessTaskTaxonomy, foldForGuess } = require('../lib/tasks/taskCategoryGuess');

const EXAMPLES = [
  [
    { title: "Arrosage des cactus en pot sur la cuve de l'or bleu", recurrence: 'weekly' },
    'jardinage',
    'routine',
  ],
  [
    { title: 'Récolter le jus de vers de terre', recurrence: 'monthly', required_students: 2 },
    'jardinage',
    'routine',
  ],
  [
    {
      title: 'Transférer des vers du lombricomposteur vers le compost',
      required_students: 2,
      description: 'x'.repeat(208),
    },
    'animaux',
    'seance',
  ],
  [
    {
      title: 'Remettre des cetoines funeste dans insectopolis',
      required_students: 2,
      description: 'x'.repeat(68),
    },
    'animaux',
    'flash',
  ],
  // Récurrence hebdomadaire signalée comme erreur de saisie : la règle serveur impose
  // « routine » tant qu'elle existe (le script de reprise la signale à part).
  [
    { title: 'Transformation Insectopolis', recurrence: 'weekly', required_students: 3 },
    'animaux',
    'routine',
  ],
  [
    { title: 'Transformation Insectopolis', required_students: 3, description: 'x'.repeat(252) },
    'animaux',
    'seance',
  ],
  [
    {
      title: 'Réparer les bordures du tiny garden.',
      required_students: 2,
      description: 'x'.repeat(339),
    },
    'terrassement',
    'seance',
  ],
  [
    { title: "Nettoyer toute les tables de l'espace", required_students: 10 },
    'entretien',
    'seance',
  ],
  [
    { title: 'Ranger les affaires qui traînent comme les tasses', required_students: 1 },
    'entretien',
    'flash',
  ],
  [
    { title: 'inversion de pompe farmflow', required_students: 1, description: 'x'.repeat(168) },
    'electronique',
    'seance',
  ],
  [
    { title: 'Récolte petits pois', required_students: 2, description: 'x'.repeat(78) },
    'jardinage',
    'flash',
  ],
  [
    {
      title: "Chasse à l'oïdium, tailler les plantes",
      required_students: 34,
      description: 'x'.repeat(260),
    },
    'jardinage',
    'seance',
  ],
  [
    { title: "Decider de ce qu'on fait de cette parcelle", required_students: 10, project_id: 'p' },
    'jardinage',
    'seance',
  ],
];

test('exemples de l’annexe 1', () => {
  for (const [task, category, format] of EXAMPLES) {
    const guess = guessTaskTaxonomy(task);
    assert.equal(guess.category, category, `${task.title} : métier`);
    assert.equal(guess.format, format, `${task.title} : format`);
    assert.ok(guess.rule, `${task.title} : règle appliquée`);
  }
});

test('titre inconnu : aucune suggestion plutôt qu’un mauvais métier', () => {
  for (const title of ['test', 'déambulation', 'Achat de matériel', '2 tests']) {
    assert.deepEqual(guessTaskTaxonomy({ title }), { category: null, format: null, rule: null });
  }
  // Récurrente mais inconnue : seul le format est suggéré (imposé par la récurrence).
  assert.deepEqual(guessTaskTaxonomy({ title: 'Truc', recurrence: 'weekly' }), {
    category: null,
    format: 'routine',
    rule: null,
  });
});

test('motifs bornés au mot et titre prioritaire sur la description', () => {
  assert.equal(guessTaskTaxonomy({ title: 'Achat de graines' }).category, 'jardinage');
  assert.equal(guessTaskTaxonomy({ title: 'Achat' }).category, null, '« chat » dans « achat »');
  assert.equal(
    guessTaskTaxonomy({ title: "Arrosage des plantes en pot au-dessus de l'établi" }).category,
    'jardinage',
  );
  assert.equal(
    guessTaskTaxonomy({
      title: 'Mettre les plantes en culture',
      description: 'Utiliser la peinture',
    }).category,
    'jardinage',
  );
  assert.equal(foldForGuess("L'Oïdium !"), ' l oidium ');
});

test('métiers techniques et étapes de projet : pas de Flash par défaut', () => {
  assert.equal(
    guessTaskTaxonomy({ title: 'réparer le banc', required_students: 1 }).format,
    'seance',
  );
  assert.equal(
    guessTaskTaxonomy({ title: 'Récolte coriandre', required_students: 1, project_id: 'p' }).format,
    'seance',
  );
  assert.equal(
    guessTaskTaxonomy({ title: 'Nettoyer les gants', required_students: 3 }).format,
    'seance',
  );
});
