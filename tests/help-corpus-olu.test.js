'use strict';

/**
 * Non-régression du corpus à la voix d'OLU (lot 4, cf. `docs/MASCOT_NARRATEUR_OLU.md`).
 *
 * Ce test ne juge pas le style — il verrouille les règles mécaniques de la charte §2.4
 * et les invariants de structure que la réécriture ne doit pas casser silencieusement.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const { loadDefaultHelpConfig, helpConfigSchema } = require('../lib/helpContent');

const tourUrl = pathToFileURL(join(__dirname, '../src/constants/discoveryTour.js')).href;
const helpUrl = pathToFileURL(join(__dirname, '../src/constants/help.js')).href;

/** Emoji au sens large (pictogrammes), y compris les séquences à sélecteur de variation. */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Tournures explicitement bannies par la charte (§2.6). */
const FORBIDDEN_PHRASES = ['n’hésite pas', "n'hésite pas", 'Désolé', 'Tu me suis', 'C’est clair ?'];

/** Textes narratifs d'une étape (le `title` reste un libellé d'interface). */
function stepTexts(step) {
  return [step.body, step.bodyTeacher].filter((value) => typeof value === 'string');
}

test('parcours : aucun emoji dans les textes d’OLU', async () => {
  const { DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
    for (const step of tour.steps) {
      for (const text of stepTexts(step)) {
        assert.ok(
          !EMOJI_RE.test(text),
          `parcours ${key} / étape « ${step.title} » : emoji interdit dans « ${text} »`,
        );
      }
    }
  }
});

test('parcours : au plus un point d’exclamation par parcours', async () => {
  const { DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
    const count = tour.steps
      .flatMap(stepTexts)
      .reduce((total, text) => total + (text.match(/!/g) || []).length, 0);
    assert.ok(count <= 1, `parcours ${key} : ${count} points d’exclamation (maximum 1)`);
  }
});

test('parcours : aucune tournure bannie par la charte', async () => {
  const { DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
    for (const text of tour.steps.flatMap(stepTexts)) {
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.ok(!text.includes(phrase), `parcours ${key} : tournure bannie « ${phrase} »`);
      }
    }
  }
});

test('parcours : chaque bulle tient en 1 à 3 phrases', async () => {
  const { DISCOVERY_TOURS } = await import(tourUrl);
  for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
    for (const step of tour.steps) {
      for (const text of stepTexts(step)) {
        // Les « … » et les points d'abréviation ne terminent pas une phrase : on ne
        // compte que les ponctuations fortes suivies d'une espace ou d'une fin de texte.
        const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
        assert.ok(
          sentences >= 1 && sentences <= 3,
          `parcours ${key} / étape « ${step.title} » : ${sentences} phrases (attendu 1 à 3)`,
        );
      }
    }
  }
});

test('parcours : structure intacte (cibles, placements, rôles)', async () => {
  const { DISCOVERY_TOURS } = await import(tourUrl);
  const PLACEMENTS = ['top', 'bottom', 'left', 'right', 'center', 'auto'];
  for (const [key, tour] of Object.entries(DISCOVERY_TOURS)) {
    assert.ok(tour.steps.length > 0, `parcours ${key} : aucune étape`);
    for (const step of tour.steps) {
      assert.ok(
        step.target === null || (typeof step.target === 'string' && step.target.length > 0),
        `parcours ${key} : cible invalide`,
      );
      assert.ok(PLACEMENTS.includes(step.placement), `parcours ${key} : placement invalide`);
      if (step.role !== undefined) {
        assert.ok(['teacher', 'student'].includes(step.role), `parcours ${key} : rôle invalide`);
      }
      assert.equal(typeof step.title, 'string');
      assert.ok(step.title.length > 0, `parcours ${key} : titre vide`);
    }
  }
});

/*
 * L'accueil de première connexion n'est pas un parcours d'onglet : ses bulles ne visent
 * aucun élément et sa dernière étape dit déjà où retrouver OLU. Lui coller l'étape de
 * relance ferait redire la même chose deux fois de suite.
 */
test('parcours : l’étape de relance reste un objet unique partagé', async () => {
  const { DISCOVERY_TOURS, WELCOME_TOUR_KEY } = await import(tourUrl);
  const tours = Object.entries(DISCOVERY_TOURS).filter(([key]) => key !== WELCOME_TOUR_KEY);
  const relaunchSteps = tours.map(([key, tour]) => {
    const step = tour.steps[tour.steps.length - 1];
    assert.equal(step.target, '.fm-help-btn', `parcours ${key} : dernière étape ≠ relance`);
    return step;
  });
  // Partagé **par référence** : dupliquer l'objet pour l'adapter à un parcours ferait
  // diverger silencieusement 13 textes qui doivent rester interchangeables.
  for (const step of relaunchSteps) {
    assert.equal(step, relaunchSteps[0], 'l’étape de relance a été dupliquée');
  }
  assert.equal(relaunchSteps.length, tours.length);
});

test('corpus d’aide : les défauts versionnés passent le schéma Zod', () => {
  const defaults = loadDefaultHelpConfig();
  const parsed = helpConfigSchema.safeParse(defaults);
  assert.ok(
    parsed.success,
    `data/help.default.json rejeté : ${JSON.stringify(parsed.error?.issues ?? [], null, 2)}`,
  );
});

test('corpus d’aide : le miroir client est identique aux défauts', async () => {
  const defaults = loadDefaultHelpConfig();
  const { HELP_PANELS } = await import(helpUrl);

  assert.deepEqual(
    Object.keys(HELP_PANELS),
    Object.keys(defaults.panels),
    'src/constants/help.js et data/help.default.json ne déclarent pas les mêmes panneaux',
  );

  for (const [key, panel] of Object.entries(defaults.panels)) {
    const mirror = HELP_PANELS[key];
    assert.equal(mirror.title, panel.title, `panneau ${key} : titres divergents`);
    assert.equal(
      mirror.items.length,
      panel.items.length,
      `panneau ${key} : nombres d’items divergents`,
    );
    // Comparaison au caractère près : une retouche d'un seul côté sort du miroir, et
    // l'utilisateur verrait alors un texte avant la réponse serveur, un autre après.
    assert.deepEqual(mirror.items, panel.items, `panneau ${key} : textes divergents`);
  }
});

test('corpus d’aide : les infobulles restent au registre fonctionnel', () => {
  const defaults = loadDefaultHelpConfig();
  // Décision §7.3 : les infobulles ne passent pas à la première personne. Le garde-fou
  // porte sur la longueur — une infobulle qui s'allonge est le premier symptôme.
  for (const [key, entry] of Object.entries(defaults.tooltips)) {
    for (const text of [entry.text, entry.textTeacher].filter(Boolean)) {
      assert.ok(text.length <= 300, `infobulle ${key} : ${text.length} caractères (maximum 300)`);
    }
  }
});

/*
 * L'accueil : une séquence centrée, jouée une seule fois, avant tout parcours d'onglet.
 */
test('accueil : trois bulles au plus, aucune ne visant un élément de l’interface', async () => {
  const { DISCOVERY_TOURS, WELCOME_TOUR_KEY } = await import(tourUrl);
  const steps = DISCOVERY_TOURS[WELCOME_TOUR_KEY]?.steps || [];
  assert.ok(steps.length >= 1 && steps.length <= 3, `${steps.length} bulles d’accueil (max 3)`);
  for (const step of steps) {
    assert.equal(step.target, null, `l’étape « ${step.key} » vise un élément`);
    assert.equal(step.placement, 'center', `l’étape « ${step.key} » n’est pas centrée`);
    assert.ok(step.bodyTeacher, `l’étape « ${step.key} » n’a pas de variante prof`);
  }
});

test('accueil : la clé n’est celle d’aucun onglet — il ne peut pas se déclencher par navigation', async () => {
  const { DISCOVERY_TOURS, WELCOME_TOUR_KEY } = await import(tourUrl);
  const { HELP_PANELS } = await import(helpUrl);
  assert.ok(!Object.keys(HELP_PANELS).includes(WELCOME_TOUR_KEY));
  assert.ok(Object.keys(DISCOVERY_TOURS).includes(WELCOME_TOUR_KEY));
});
