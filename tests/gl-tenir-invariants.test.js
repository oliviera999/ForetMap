'use strict';

/**
 * Invariants d'une partie « Tenir à deux » (`lib/glTenirInvariants.js`) : fonction pure sur un
 * instantané, puis chargeur depuis la base sur une partie de fixture (anonyme).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { initSchema, execute } = db;
const {
  checkTenirInvariants,
  checkTenirInvariantsFromDb,
  loadTenirSnapshot,
} = require('../lib/glTenirInvariants');
const { createTenirGame, setPlayerBourses } = require('./helpers/glTenirFixtures');

const base = () => ({
  caps: { maxHealth: 8, maxPower: 8 },
  players: [
    { id: 1, teamId: 10, health: 3, power: 3, initialHealth: 3, initialPower: 3 },
    { id: 2, teamId: 11, health: 4, power: 3, initialHealth: 3, initialPower: 3 },
  ],
  teams: [
    { id: 10, type: 'gnome', pathIndex: 2 },
    { id: 11, type: 'unicorn', pathIndex: 0 },
  ],
  campIndex: 11,
  voilePosition: -1,
  pages: [
    { zoneKey: 'cz-p1-01', etat: 'tenue', trouveeParTeamId: 10, tenueParTeamId: 11 },
    { zoneKey: 'cz-p1-02', etat: 'endormie', trouveeParTeamId: null, tenueParTeamId: null },
  ],
  ledger: [
    {
      playerId: 2,
      deltaHealth: 1,
      deltaPower: 0,
      soldeHealthApres: 4,
      soldePowerApres: 3,
      cause: 'trame',
    },
  ],
  relances: [{ roundNumber: 1, teamId: 10, relances: 1 }],
  relancesMax: 1,
});

test('instantané cohérent : ok, aucune violation', () => {
  const out = checkTenirInvariants(base());
  assert.deepEqual(out, { ok: true, violations: [] });
});

test('chaque invariant tombe sous son code', () => {
  const codes = (snapshot) => checkTenirInvariants(snapshot).violations.map((v) => v.code);

  const bourses = base();
  bourses.players[0].health = 9;
  bourses.players[1].power = -1;
  assert.deepEqual(codes(bourses).filter((c) => c === 'BOURSE_BORNES').length, 2);

  const livre = base();
  livre.ledger[0].soldeHealthApres = 5;
  assert.ok(codes(livre).includes('LIVRE_SOLDE'));

  const somme = base();
  somme.players[1].initialHealth = 2;
  assert.ok(codes(somme).includes('LIVRE_SOMME'));

  const cause = base();
  cause.ledger.push({
    playerId: 1,
    deltaHealth: 1,
    deltaPower: 0,
    soldeHealthApres: 3,
    soldePowerApres: 3,
    cause: 'sort_pot',
  });
  assert.ok(codes(cause).includes('GAIN_NON_DOCUMENTE'));
  cause.ledger.push({
    playerId: 1,
    deltaHealth: 0,
    deltaPower: 0,
    soldeHealthApres: 3,
    soldePowerApres: 3,
    cause: 'inconnue',
  });
  assert.ok(codes(cause).includes('LIVRE_CAUSE'));

  const pion = base();
  pion.teams[0].pathIndex = 12;
  assert.ok(codes(pion).includes('PION_HORS_PLATEAU'));

  const voile = base();
  voile.voilePosition = 11;
  assert.ok(codes(voile).includes('VOILE_HORS_BORNES'));

  const page = base();
  page.pages[0].tenueParTeamId = 10;
  page.pages.push({ zoneKey: 'cz-x', etat: 'bizarre' });
  assert.equal(codes(page).filter((c) => c === 'PAGE_ETAT').length, 2);

  const relances = base();
  relances.relances[0].relances = 2;
  assert.ok(codes(relances).includes('RELANCES_MAX'));
  relances.relancesMax = 0;
  assert.ok(!codes(relances).includes('RELANCES_MAX'), '0 = illimité');
});

test('depuis la base : une partie de fixture est cohérente, une bourse forcée au-dessus du plafond est vue', async () => {
  await initSchema();
  const ctx = await createTenirGame({ stamp: Date.now() });
  const ok = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(ok.violations, []);
  assert.equal(ok.snapshot.teams.length, 4);
  assert.equal(ok.snapshot.campIndex, 11);
  await setPlayerBourses(ctx.players[0].id, 12, 3);
  const ko = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.ok(ko.violations.some((v) => v.code === 'BOURSE_BORNES'));
  await execute('UPDATE gl_players SET health_points = 3 WHERE id = ?', [ctx.players[0].id]);
  assert.equal(await loadTenirSnapshot(db, 999999999), null);
});
