'use strict';

// O10 — vérifie SANS DB les helpers runtime extraits de routes/gl/games.js vers
// lib/gl/gamesRuntime.js (déplacement pur byte-identique) qui ne dépendent pas du
// pool de connexions :
// - resolveRosterError : mapping pur des erreurs roster (404/409 → message FR) ;
// - recordVitalityChangeEvent : forme du payload + de l'INSERT gl_game_events via
//   un faux `tx` (le helper n'utilise que `tx.execute`, jamais le pool module).
// Les helpers à DB (getPlayerGameMembership, ensurePlayerInGameClass, readGameState)
// sont couverts par les tests DB en CI.
const test = require('node:test');
const assert = require('node:assert');
const {
  resolveRosterError,
  recordVitalityChangeEvent,
} = require('../lib/gl/gamesRuntime');

test('resolveRosterError mappe les 404 connus vers leur message FR', () => {
  assert.deepStrictEqual(
    resolveRosterError({ status: 404, message: 'TEAM_NOT_FOUND' }),
    { status: 404, error: 'Équipe introuvable' }
  );
  assert.deepStrictEqual(
    resolveRosterError({ status: 404, message: 'PLAYER_NOT_FOUND' }),
    { status: 404, error: 'Joueur introuvable' }
  );
  assert.deepStrictEqual(
    resolveRosterError({ status: 404, message: 'GAME_NOT_FOUND' }),
    { status: 404, error: 'Partie introuvable' }
  );
});

test('resolveRosterError : 404 inconnu → message générique', () => {
  assert.deepStrictEqual(
    resolveRosterError({ status: 404, message: 'WHATEVER' }),
    { status: 404, error: 'Ressource introuvable' }
  );
});

test('resolveRosterError : 409 ou PLAYER_CLASS_MISMATCH → 409 classe', () => {
  const expected = { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  assert.deepStrictEqual(resolveRosterError({ status: 409 }), expected);
  assert.deepStrictEqual(resolveRosterError({ message: 'PLAYER_CLASS_MISMATCH' }), expected);
});

test('resolveRosterError : erreur non mappée → null (relancée par le handler)', () => {
  assert.strictEqual(resolveRosterError({ status: 500 }), null);
  assert.strictEqual(resolveRosterError(new Error('boom')), null);
  assert.strictEqual(resolveRosterError(undefined), null);
});

test('recordVitalityChangeEvent insère un event vitality_change avec le payload normalisé', async () => {
  const calls = [];
  const tx = {
    async execute(sql, params) { calls.push({ sql, params }); },
  };
  await recordVitalityChangeEvent(tx, {
    gameId: 7,
    teamId: 3,
    actorId: '42',
    healthDelta: '2.9',
    powerDelta: -1,
    reason: '  soin  ',
    results: [{ playerId: 1 }],
  });
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO gl_game_events/);
  assert.match(calls[0].sql, /'vitality_change'/);
  const [gameId, teamId, actorId, payloadJson] = calls[0].params;
  assert.strictEqual(gameId, 7);
  assert.strictEqual(teamId, 3);
  assert.strictEqual(actorId, '42');
  // healthDelta '2.9' → trunc 2 ; powerDelta -1 → -1 ; reason trimmé ; results passés tels quels
  assert.deepStrictEqual(JSON.parse(payloadJson), {
    healthDelta: 2,
    powerDelta: -1,
    reason: 'soin',
    results: [{ playerId: 1 }],
  });
});

test('recordVitalityChangeEvent : deltas nuls/absents → 0, reason vide → null', async () => {
  const calls = [];
  const tx = { async execute(sql, params) { calls.push(params); } };
  await recordVitalityChangeEvent(tx, {
    gameId: 1,
    teamId: null,
    actorId: '9',
    healthDelta: null,
    powerDelta: 'abc',
    reason: '   ',
    results: [],
  });
  const payload = JSON.parse(calls[0][3]);
  assert.deepStrictEqual(payload, {
    healthDelta: 0,
    powerDelta: 0,
    reason: null,
    results: [],
  });
});
