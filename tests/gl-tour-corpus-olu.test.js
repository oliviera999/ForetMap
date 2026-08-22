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

/*
 * Les deux cas suivants verrouillent la classe de défaut qui a coûté quatre parcours au
 * lot 9b : un contenu impeccable, rangé sous une clé ou visant une ancre que
 * l'application n'atteint jamais. Rien ne casse, rien ne s'affiche — le pire des deux.
 */

test('parcours GL : chaque clé est un onglet où l’on atterrit vraiment', async () => {
  const { GL_DISCOVERY_TOURS, GL_WELCOME_TOUR_KEY } = await import(tourUrl);
  const runtimeUrl = pathToFileURL(join(__dirname, '../src/gl/constants/app-runtime.js')).href;
  const { GL_VALID_TABS, GL_NATURE_TAB, GL_ADVENTURE_TAB, GL_MONDE_TAB, GL_JOUEURS_TAB } =
    await import(runtimeUrl);

  /*
   * `resolveGlMainTabChange()` et `readStoredGlTab()` replient les identifiants de hub
   * sur un sous-onglet : `tab` ne vaut donc **jamais** `nature`, `adventure`,
   * `monde-gl` ni `joueurs`. Un parcours rangé sous l'un d'eux serait mort-né.
   */
  const HUB_IDS = [GL_NATURE_TAB.id, GL_ADVENTURE_TAB.id, GL_MONDE_TAB.id, GL_JOUEURS_TAB.id];
  const reachable = new Set([...GL_VALID_TABS].filter((tab) => !HUB_IDS.includes(tab)));

  for (const key of Object.keys(GL_DISCOVERY_TOURS)) {
    if (key === GL_WELCOME_TOUR_KEY) continue; // Volontairement hors navigation.
    assert.ok(
      reachable.has(key),
      `parcours ${key} : aucun onglet ne prend cette valeur, la visite ne se déclencherait jamais`,
    );
  }
});

test('parcours GL : chaque ancre visée existe dans le code des vues', async () => {
  const { GL_DISCOVERY_TOURS } = await import(tourUrl);
  const { readdirSync, readFileSync } = require('node:fs');

  /*
   * Le registre lui-même est **exclu** du balayage : ses sélecteurs contiennent
   * littéralement `data-gl-tour="…"`, donc chaque cible s'y trouverait elle-même et le
   * test ne pourrait jamais échouer. On ne cherche l'ancre que là où elle est posée.
   */
  const registryFile = join(__dirname, '../src/gl/constants/glDiscoveryTour.js');

  function sourceFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.jsx?$/.test(entry.name) && full !== registryFile) out.push(full);
    }
    return out;
  }
  const sources = sourceFiles(join(__dirname, '../src/gl')).map((file) =>
    readFileSync(file, 'utf8'),
  );

  // Sélecteurs structurels admis hors convention `data-gl-tour` (posés hors des vues).
  const ALLOWED_PLAIN = new Set(['.gl-help-btn']);

  const targets = new Set();
  for (const tour of Object.values(GL_DISCOVERY_TOURS)) {
    for (const step of tour.steps) if (step.target) targets.add(step.target);
  }
  assert.ok(targets.size > 0);

  for (const target of targets) {
    const anchor = /^\[data-gl-tour="([a-z0-9-]+)"\]$/.exec(target);
    if (!anchor) {
      assert.ok(
        ALLOWED_PLAIN.has(target),
        `cible « ${target} » : hors convention data-gl-tour et hors liste admise`,
      );
      continue;
    }
    const needle = `data-gl-tour="${anchor[1]}"`;
    assert.ok(
      sources.some((source) => source.includes(needle)),
      `ancre « ${anchor[1]} » : citée par un parcours, posée nulle part dans src/gl/`,
    );
  }
});
