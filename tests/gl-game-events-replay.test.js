'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { replayGameEvents } = require('../lib/glGameEvents');

function ev(id, type, opts = {}) {
  return {
    id,
    game_id: 10,
    team_id: opts.teamId == null ? null : opts.teamId,
    actor_type: opts.actorType || 'mj',
    actor_id: opts.actorId || '1',
    event_type: type,
    payload_json: JSON.stringify(opts.payload || {}),
    created_at: opts.createdAt || '2026-01-01 10:00:00',
  };
}

test('replayGameEvents reconstruit la dernière position par équipe', () => {
  const events = [
    ev(1, 'move', { teamId: 21, payload: { markerId: 5, xp: 12.4, yp: 33.1 } }),
    ev(2, 'move', { teamId: 21, payload: { markerId: 8, xp: 60.2, yp: 44.5 } }),
  ];
  const replay = replayGameEvents(events, { gameStatus: 'draft' });
  assert.strictEqual(replay.markersByTeamId[21], 8);
  assert.strictEqual(replay.positionsByTeamId[21].markerId, 8);
  assert.strictEqual(replay.positionsByTeamId[21].xp, 60.2);
  assert.strictEqual(replay.positionsByTeamId[21].yp, 44.5);
  assert.strictEqual(replay.timeline.length, 2);
});

test('replayGameEvents applique turn_change (currentTeamId)', () => {
  const events = [
    ev(1, 'turn_change', { teamId: 21, payload: { teamId: 21 } }),
    ev(2, 'turn_change', { teamId: 22, payload: { teamId: 22 } }),
  ];
  const replay = replayGameEvents(events, { gameStatus: 'live', currentTeamId: null });
  assert.strictEqual(replay.currentTeamId, 22);
});

test('replayGameEvents cumule les scores par équipe', () => {
  const events = [
    ev(1, 'score', { teamId: 21, payload: { delta: 3 } }),
    ev(2, 'score', { teamId: 22, payload: { delta: 1, reason: 'quiz' } }),
    ev(3, 'score', { teamId: 21, payload: { delta: -1, reason: 'pénalité' } }),
  ];
  const replay = replayGameEvents(events);
  assert.strictEqual(replay.scoresByTeamId[21], 2);
  assert.strictEqual(replay.scoresByTeamId[22], 1);
});

test('replayGameEvents collecte les narrations dans l’ordre', () => {
  const events = [
    ev(1, 'narration', { payload: { text: 'Première narration' } }),
    ev(2, 'narration', { payload: { text: '   ' } }), // ignoré (vide)
    ev(3, 'narration', { payload: { text: 'Seconde narration' } }),
  ];
  const replay = replayGameEvents(events);
  assert.strictEqual(replay.narrations.length, 2);
  assert.strictEqual(replay.narrations[0].text, 'Première narration');
  assert.strictEqual(replay.narrations[1].text, 'Seconde narration');
});

test('replayGameEvents conserve les action_request non résolues', () => {
  const events = [
    ev(1, 'action_request', {
      teamId: 21,
      payload: {
        actionRequestId: 100,
        actionType: 'explore',
        playerId: 5,
        payload: { markerId: 12 },
      },
    }),
    ev(2, 'action_request', {
      teamId: 22,
      payload: { actionRequestId: 101, actionType: 'quiz', playerId: 9 },
    }),
    ev(3, 'action_resolved', {
      teamId: 22,
      payload: { actionRequestId: 101, decision: 'accepted' },
    }),
  ];
  const replay = replayGameEvents(events);
  assert.strictEqual(replay.pendingActions.length, 1);
  assert.strictEqual(replay.pendingActions[0].actionRequestId, 100);
  assert.strictEqual(replay.pendingActions[0].actionType, 'explore');
});

test('replayGameEvents ignore les événements inconnus mais les conserve dans la timeline', () => {
  const events = [
    ev(1, 'mystery', { payload: { foo: 'bar' } }),
    ev(2, 'move', { teamId: 21, payload: { markerId: 1 } }),
  ];
  const replay = replayGameEvents(events);
  assert.strictEqual(replay.timeline.length, 2);
  assert.strictEqual(replay.markersByTeamId[21], 1);
});
