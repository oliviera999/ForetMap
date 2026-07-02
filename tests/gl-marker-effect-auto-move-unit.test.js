'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyMarkerEffectAutoMoveTx,
  hasMarkerEffectAutoMoveApplied,
  parseMarkerEffectAutoMovePayload,
} = require('../lib/glMarkerEffectAutoMove');

test('parseMarkerEffectAutoMovePayload identifie le repère source', () => {
  assert.deepStrictEqual(
    parseMarkerEffectAutoMovePayload(
      JSON.stringify({ source: 'marker_effect', originMarkerId: 42, markerId: 99 }),
    ),
    { originMarkerId: 42 },
  );
  assert.strictEqual(parseMarkerEffectAutoMovePayload(JSON.stringify({ markerId: 99 })), null);
  assert.strictEqual(parseMarkerEffectAutoMovePayload('json invalide'), null);
});

test('hasMarkerEffectAutoMoveApplied détecte un auto-déplacement déjà émis', async () => {
  const rows = [
    { payload_json: JSON.stringify({ source: 'manual', originMarkerId: 7 }) },
    { payload_json: JSON.stringify({ source: 'marker_effect', originMarkerId: 7 }) },
  ];
  const deps = { queryAll: async () => rows };

  assert.strictEqual(
    await hasMarkerEffectAutoMoveApplied(deps, { gameId: 1, teamId: 2, originMarkerId: 7 }),
    true,
  );
  assert.strictEqual(
    await hasMarkerEffectAutoMoveApplied(deps, { gameId: 1, teamId: 2, originMarkerId: 8 }),
    false,
  );
});

test('applyMarkerEffectAutoMoveTx ne rejoue pas le même repère d’origine', async () => {
  const chapterMarkers = [
    { id: 10, label: 'A', x_pct: 10, y_pct: 10, order_index: 0 },
    { id: 20, label: 'B', x_pct: 20, y_pct: 20, order_index: 1 },
    { id: 30, label: 'C', x_pct: 30, y_pct: 30, order_index: 2 },
  ];
  const moveEvents = [];
  const updates = [];
  const tx = {
    queryOne: async (sql, params) => {
      if (sql.includes('FROM gl_teams')) {
        return { id: params[0], position_marker_id: 10, position_x_pct: 10, position_y_pct: 10 };
      }
      if (sql.includes('FROM gl_chapter_markers')) {
        return chapterMarkers.find((marker) => Number(marker.id) === Number(params[0]));
      }
      if (sql.includes('FROM gl_game_events') && sql.includes('WHERE id = ?')) {
        // insertGameEvent relit l'événement par insertId après l'INSERT.
        return moveEvents.find((evt) => Number(evt.id) === Number(params[0])) || null;
      }
      return null;
    },
    queryAll: async (sql) => {
      if (sql.includes('FROM gl_game_events')) return moveEvents;
      return [];
    },
    execute: async (sql, params) => {
      if (sql.includes('UPDATE gl_teams')) updates.push(params);
      if (sql.includes('INSERT INTO gl_game_events')) {
        // Colonnes de insertGameEvent : game_id, team_id, actor_type, actor_id,
        // event_type, payload_json.
        moveEvents.push({
          id: moveEvents.length + 1,
          game_id: params[0],
          team_id: params[1],
          actor_type: params[2],
          actor_id: params[3],
          event_type: params[4],
          payload_json: params[5],
          created_at: '2026-01-01T00:00:00.000Z',
        });
        return { affectedRows: 1, insertId: moveEvents.length };
      }
      return { affectedRows: 1, insertId: 1 };
    },
  };
  const baseArgs = {
    gameId: 1,
    teamId: 2,
    team: { id: 2, position_marker_id: 10 },
    game: { id: 1, board_movement_mode: 'numbered_path', board_path_start_index: 0 },
    chapterMarkers,
    moveDelta: 1,
    settings: { markerEffectAutoMoveEnabled: true },
    actorType: 'team',
    actorId: '5',
    originMarkerId: 10,
  };

  const first = await applyMarkerEffectAutoMoveTx(tx, baseArgs);
  const second = await applyMarkerEffectAutoMoveTx(tx, baseArgs);

  assert.strictEqual(first?.applied, true);
  assert.strictEqual(first.targetMarkerId, 20);
  assert.strictEqual(second, null);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(moveEvents.length, 1);
});
