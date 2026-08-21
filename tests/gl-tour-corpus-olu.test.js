'use strict';

/**
 * Non-régression du corpus des **visites guidées GL** — charte §2.4 et statut d'OLU §8.4
 * de `docs/MASCOT_NARRATEUR_OLU.md`. Pendant de `tests/help-corpus-olu.test.js`.
 *
 * Aucune base de données requise.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const tourUrl = pathToFileURL(join(__dirname, '../src/gl/constants/glDiscoveryTour.js')).href;

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const FORBIDDEN_PHRASES = ['n’hésite pas', "n'hésite pas", 'Désolé', 'Tu me suis', 'C’est clair ?'];

/**
 * Mots qui feraient d'OLU un conteur du royaume ou un partisan. Le §8.4 est clair :
 * il parle **du** jeu, jamais **dans** le jeu, et ne prend pas parti entre les peuples.
 * Le nom du carnet reste admis dans un **titre** — c'est le nom d'un onglet, pas du récit.
 */
const LORE_WORDS = [/souffle/i, /gnome/i, /licorne/i, /sélène/i];

function stepTexts(step) {
  return [step.body, step.bodyTeacher].filter((value) => typeof value === 'string');
}

test('parcours GL : aucun emoji', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    for (const step of tour.steps) {
      for (const text of [...stepTexts(step), step.title]) {
        assert.ok(!EMOJI_RE.test(text), `parcours ${key} : emoji dans « ${text} »`);
      }
    }
  }
});

test('parcours GL : au plus un point d’exclamation par parcours', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    const count = tour.steps
      .flatMap(stepTexts)
      .reduce((total, text) => total + (text.match(/!/g) || []).length, 0);
    assert.ok(count <= 1, `parcours ${key} : ${count} points d’exclamation (maximum 1)`);
  }
});

test('parcours GL : aucune tournure bannie', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    for (const text of tour.steps.flatMap(stepTexts)) {
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.ok(!text.includes(phrase), `parcours ${key} : tournure bannie « ${phrase} »`);
      }
    }
  }
});

test('parcours GL : chaque bulle tient en 1 à 3 phrases', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    for (const step of tour.steps) {
      for (const text of stepTexts(step)) {
        const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
        assert.ok(
          sentences >= 1 && sentences <= 3,
          `parcours ${key} / « ${step.title} » : ${sentences} phrases (attendu 1 à 3)`,
        );
      }
    }
  }
});

// §8.4 — la règle centrale, dans ce qu'elle a de mécanisable.
test('parcours GL : OLU ne raconte pas le lore et ne prend pas parti', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    for (const step of tour.steps) {
      for (const text of stepTexts(step)) {
        for (const word of LORE_WORDS) {
          assert.ok(!word.test(text), `parcours ${key} : « ${word} » dans une bulle d’OLU`);
        }
      }
    }
  }
});

test('parcours GL : structure intacte (cibles, placements, titres)', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  const PLACEMENTS = ['top', 'bottom', 'left', 'right', 'center', 'auto'];
  for (const [key, tour] of Object.entries(GL_DISCOVERY_TOURS)) {
    assert.ok(tour.title, `parcours ${key} : sans titre, le studio d’édition l’affiche mal`);
    assert.ok(tour.steps.length > 0, `parcours ${key} : aucune étape`);
    for (const step of tour.steps) {
      assert.ok(step.key, `parcours ${key} : étape sans clé`);
      assert.ok(step.title, `parcours ${key} : étape sans titre`);
      assert.ok(
        step.target === null || (typeof step.target === 'string' && step.target.length > 0),
        `parcours ${key} : cible invalide`,
      );
      assert.ok(PLACEMENTS.includes(step.placement), `parcours ${key} : placement invalide`);
      if (step.role !== undefined) {
        assert.ok(['teacher', 'student'].includes(step.role), `parcours ${key} : rôle invalide`);
      }
    }
  }
});

test('parcours GL : l’étape de relance reste un objet unique partagé', async () => {
  const { GL_DISCOVERY_TOURS, GL_RELAUNCH_STEP, GL_WELCOME_TOUR_KEY } = await import(tourUrl);
  // L'accueil en est dispensé : sa dernière bulle dit déjà où retrouver OLU.
  const tours = Object.entries(GL_DISCOVERY_TOURS).filter(([key]) => key !== GL_WELCOME_TOUR_KEY);
  assert.ok(tours.length > 0);
  for (const [key, tour] of tours) {
    const last = tour.steps[tour.steps.length - 1];
    assert.equal(last, GL_RELAUNCH_STEP, `parcours ${key} : dernière étape ≠ relance partagée`);
  }
});

test('accueil GL : bulles centrées, sans cible, avec variante MJ', async () => {
  const { GL_DISCOVERY_TOURS, GL_WELCOME_TOUR_KEY } = await import(tourUrl);
  const steps = GL_DISCOVERY_TOURS[GL_WELCOME_TOUR_KEY]?.steps || [];
  assert.ok(steps.length >= 1 && steps.length <= 3, `${steps.length} bulles d’accueil (max 3)`);
  for (const step of steps) {
    assert.equal(step.target, null, `l’étape « ${step.key} » vise un élément`);
    assert.equal(step.placement, 'center', `l’étape « ${step.key} » n’est pas centrée`);
    assert.ok(step.bodyTeacher, `l’étape « ${step.key} » n’a pas de variante MJ`);
  }
});
