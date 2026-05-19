'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { replayGameEvents } = require('../lib/glGameEvents');

test('replayGameEvents reconstruit la dernière position par équipe', () => {
  const events = [
    {
      id: 1,
      game_id: 10,
      team_id: 21,
      actor_type: 'mj',
      actor_id: '1',
      event_type: 'move',
      payload_json: JSON.stringify({ markerId: 5 }),
      created_at: '2026-01-01 10:00:00',
    },
    {
      id: 2,
      game_id: 10,
      team_id: 21,
      actor_type: 'mj',
      actor_id: '1',
      event_type: 'move',
      payload_json: JSON.stringify({ markerId: 8 }),
      created_at: '2026-01-01 10:01:00',
    },
  ];
  const replay = replayGameEvents(events, { gameStatus: 'draft' });
  assert.strictEqual(replay.markersByTeamId[21], 8);
  assert.strictEqual(replay.timeline.length, 2);
});
