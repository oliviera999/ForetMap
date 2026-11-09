'use strict';

/**
 * Journal d'une partie « Tenir à deux » : plus aucune ligne « Un évènement s'est produit ».
 * Le test relève TOUS les types d'évènements émis par le moteur (`eventType: '…'` dans lib/gl*,
 * lib/gl/, routes/gl/) et échoue s'il en reste un sans libellé propre — pour l'élève comme pour
 * le prof —, puis vérifie la numérotation humaine des cases (rang + 1), le titre d'une page lue
 * et « Olu se reprend » pour la correction automatique.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentJournalEvent, buildTeamsById } = require('../lib/glJournalPresent');
const { presentTenirJournalEvent, TENIR_EVENT_TYPES } = require('../lib/glJournalPresentTenir');
const { numeroCase, libelleCase, rangDepuisNumero } = require('../lib/shared/glCaseNumeroCore');

const ROOT = path.join(__dirname, '..');
const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|krâ|kraa|\bgrise\b|\bfaux\b|raté|perdu|classement/i;

function listSourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  };
  for (const f of fs.readdirSync(path.join(ROOT, 'lib'))) {
    if (f.startsWith('gl') && f.endsWith('.js')) out.push(path.join(ROOT, 'lib', f));
  }
  walk(path.join(ROOT, 'lib', 'gl'));
  walk(path.join(ROOT, 'routes', 'gl'));
  return out;
}

/** Types d'évènements émis par le moteur (littéraux `eventType: '…'`). */
function listEmittedEventTypes() {
  const types = new Set();
  for (const file of listSourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/eventType:\s*'([a-z_]+)'/g)) types.add(m[1]);
    for (const m of src.matchAll(
      /eventType:\s*(?:[a-zA-Z]+ === '[a-z_]+' \? '([a-z_]+)' : '([a-z_]+)')/g,
    )) {
      types.add(m[1]);
      types.add(m[2]);
    }
  }
  return [...types].sort();
}

const teams = [
  { id: 1, name: 'Les Racines' },
  { id: 2, name: 'Les Lucioles' },
];
const teamsById = buildTeamsById(teams);

function present(eventType, payload, { teamId = 1, forPlayer = true } = {}) {
  return presentJournalEvent(
    { eventType, payload, teamId, actorType: 'team', actorId: '1' },
    { teamsById, forPlayer, tenir: true },
  );
}

test('tous les types émis par le moteur ont un libellé propre en partie tenir (élève et prof)', () => {
  const emitted = listEmittedEventTypes();
  assert.ok(emitted.length > 40, `relevé suspect : ${emitted.length} types`);
  const missing = [];
  for (const type of emitted) {
    for (const forPlayer of [true, false]) {
      const out = present(type, { roundNumber: 2 }, { forPlayer });
      const generic =
        !out ||
        out.title === 'Évènement' ||
        out.title === 'Évènement de partie' ||
        /^Type : /.test(out.title) ||
        /s’est produit dans la partie|concerne l’équipe/.test(out.body) ||
        !String(out.body || '').trim();
      if (generic) missing.push(`${type} (${forPlayer ? 'élève' : 'prof'})`);
      if (out && FORBIDDEN.test(`${out.title} ${out.body}`))
        missing.push(`${type} : chaîne interdite`);
    }
  }
  assert.deepEqual(missing, [], `types sans libellé : ${missing.join(', ')}`);
  // La liste exportée couvre bien le relevé (utile aux écrans qui filtrent par type).
  const uncovered = emitted.filter(
    (t) => !TENIR_EVENT_TYPES.includes(t) && presentTenirJournalEvent(t, {}) == null,
  );
  assert.deepEqual(uncovered, []);
});

test('numérotation des cases : rang + 1 partout (journal du voile = bandeau)', () => {
  assert.equal(numeroCase(0), 1);
  assert.equal(numeroCase(8), 9);
  assert.equal(numeroCase(-1), null);
  assert.equal(numeroCase('x'), null);
  assert.equal(libelleCase(8), 'case 9');
  assert.equal(libelleCase(null), '—');
  assert.equal(rangDepuisNumero(9), 8);
  const voile = presentTenirJournalEvent('voile_avance', { from: 3, to: 8, teamsUnderVoile: [1] });
  assert.match(voile.body, /de la case 4 jusqu’à la case 9/);
  const move = present('move', { fromDice: true, index: 8, markerId: 12 });
  assert.match(move.body, /jusqu’à la case 9/);
});

test('page lue : le titre de la page, jamais son code ; Olu se reprend sans équipe', () => {
  const lue = present('page_lue', {
    feuilletCode: 'sort-jungle-01',
    titre: 'La corne dans la pénombre',
  });
  assert.match(lue.body, /« La corne dans la pénombre »/);
  assert.ok(!/sort-jungle-01/.test(lue.body));
  const auto = present(
    'olu_corrige',
    { correction: 'Le baobab est un arbre.', teamId: null },
    { teamId: null },
  );
  assert.equal(auto.title, 'Olu se reprend');
  assert.match(auto.body, /Olu se reprend/);
  const equipe = present('olu_corrige', { correction: 'Le baobab est un arbre.', teamId: 1 });
  assert.equal(equipe.title, 'Olu corrigé');
  const relance = present('relance_bonus', { relance: false, roundNumber: 1 });
  assert.match(relance.body, /relance du tour est déjà prise/);
  const effet = present('spell_effect', { spellName: 'Progression', type: 'move_delta', delta: 1 });
  assert.match(effet.body, /Progression.*\+1 case/);
});
