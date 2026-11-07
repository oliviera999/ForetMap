'use strict';

/**
 * Horloge injectable du moteur G&L (`lib/glClock.js`) : décalage par appel direct ou par
 * l'en-tête `X-GL-Sim-Clock` (seulement si `GL_SIM_ALLOW=1` et hors production) ; les fenêtres
 * par semaine ISO et par trimestre la suivent.
 */

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const glClock = require('../lib/glClock');
const { isoWeekOf, trimestreOf } = require('../lib/glTenir');
const { assertFenetre } = require('../lib/glSpellFenetres');

afterEach(() => {
  glClock.resetSim();
  delete process.env.GL_SIM_ALLOW;
});

test('now() suit le décalage ; setSimNow fixe une date ; resetSim revient au réel', () => {
  const before = glClock.now().getTime();
  assert.ok(Math.abs(before - Date.now()) < 1000);
  glClock.setSimNow('2027-01-18T10:00:00Z');
  assert.equal(glClock.now().toISOString().slice(0, 13), '2027-01-18T10');
  assert.equal(isoWeekOf(), '2027-W03', 'la semaine ISO par défaut suit l’horloge');
  assert.equal(trimestreOf(glClock.now()), 2);
  glClock.resetSim();
  assert.ok(Math.abs(glClock.now().getTime() - Date.now()) < 1000);
  assert.throws(() => glClock.setSimNow('pas une date'), RangeError);
});

test('fenêtre « trimestre 3 » : lue sur l’horloge injectable', () => {
  const spell = { fenetre: 'trimestre_3' };
  glClock.setSimNow('2027-05-10T09:00:00Z');
  assert.doesNotThrow(() => assertFenetre({ spell, round: { phase: 'jeu' }, teamRolled: false }));
  glClock.setSimNow('2026-11-10T09:00:00Z');
  assert.throws(() => assertFenetre({ spell, round: { phase: 'jeu' }, teamRolled: false }), {
    code: 'SPELL_FENETRE',
  });
});

test('X-GL-Sim-Clock : ignoré sans GL_SIM_ALLOW=1, accepté sinon (hors production), ISO ou ms', () => {
  const req = (value) => ({
    get: (name) => (name.toLowerCase() === 'x-gl-sim-clock' ? value : null),
  });
  let called = 0;
  const next = () => {
    called += 1;
  };
  delete process.env.GL_SIM_ALLOW;
  glClock.simClockMiddleware(req('2027-02-01T08:00:00Z'), {}, next);
  assert.equal(called, 1);
  assert.equal(glClock.getSimOffsetMs(), 0, 'sans GL_SIM_ALLOW, aucun décalage');

  process.env.GL_SIM_ALLOW = '1';
  glClock.simClockMiddleware(req('2027-02-01T08:00:00Z'), {}, next);
  assert.equal(glClock.now().toISOString().slice(0, 10), '2027-02-01');
  glClock.simClockMiddleware(req(String(Date.UTC(2027, 2, 3, 8))), {}, next);
  assert.equal(glClock.now().toISOString().slice(0, 10), '2027-03-03');
  glClock.simClockMiddleware(req('n’importe quoi'), {}, next);
  assert.equal(glClock.now().toISOString().slice(0, 10), '2027-03-03', 'valeur invalide ignorée');
  assert.equal(called, 4);

  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal(glClock.simClockAllowed(), false, 'jamais en production');
  process.env.NODE_ENV = previousEnv;
});
