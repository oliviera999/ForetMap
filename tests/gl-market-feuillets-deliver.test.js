'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliverFeuillets } = require('../lib/glMarketFeuillets');

function makeTx({ teamRow, existingByCode, executeLog }) {
  return {
    async queryOne(sql, params) {
      if (sql.includes('gl_team_members')) {
        return teamRow;
      }
      if (sql.includes('gl_game_feuillet_states')) {
        return existingByCode.get(params[2]) || null;
      }
      return null;
    },
    async queryAll() {
      return [];
    },
    async execute(sql, params) {
      executeLog.push({ sql, params });
      return { insertId: 0 };
    },
  };
}

const fadedGiverState = {
  effacement_pct: 90,
  discovered_by_player_id: '9',
  discovered_by_name: 'Giver',
};

test('deliverFeuillets : ne réécrit pas un feuillet déjà trouvé par l’équipe', async () => {
  const executeLog = [];
  const tx = makeTx({
    teamRow: { game_id: 1, team_id: 20 },
    existingByCode: new Map([['F1', { status: 'discovered' }]]),
    executeLog,
  });
  const result = await deliverFeuillets(tx, {
    giverStates: new Map([['F1', fadedGiverState]]),
    receiverId: 5,
    codes: ['F1'],
  });
  assert.strictEqual(result.delivered, 0);
  assert.strictEqual(result.gameId, 1);
  assert.strictEqual(result.teamId, 20);
  assert.strictEqual(
    executeLog.length,
    0,
    'aucun INSERT/UPDATE : l’état d’équipe déjà trouvé doit rester intact',
  );
});

test('deliverFeuillets : une copie plus effacée n’opacifie pas un feuillet lu', async () => {
  const executeLog = [];
  const tx = makeTx({
    teamRow: { game_id: 1, team_id: 20 },
    existingByCode: new Map([['F1', { status: 'read' }]]),
    executeLog,
  });
  await deliverFeuillets(tx, {
    giverStates: new Map([['F1', { ...fadedGiverState, effacement_pct: 100 }]]),
    receiverId: 5,
    codes: ['F1'],
  });
  assert.strictEqual(executeLog.length, 0);
});

test('deliverFeuillets : copie un feuillet absent chez le receveur', async () => {
  const executeLog = [];
  const tx = makeTx({
    teamRow: { game_id: 1, team_id: 20 },
    existingByCode: new Map(),
    executeLog,
  });
  const result = await deliverFeuillets(tx, {
    giverStates: new Map([
      [
        'F2',
        {
          effacement_pct: 0,
          discovered_by_player_id: '9',
          discovered_by_name: 'Giver',
        },
      ],
    ]),
    receiverId: 5,
    codes: ['F2'],
  });
  assert.strictEqual(result.delivered, 1);
  assert.ok(executeLog.some((c) => /INSERT INTO gl_game_feuillet_states/.test(c.sql)));
});

test('deliverFeuillets : un état locked n’est pas une possession — la copie s’écrit', async () => {
  const executeLog = [];
  const tx = makeTx({
    teamRow: { game_id: 1, team_id: 20 },
    existingByCode: new Map([['F3', { status: 'locked' }]]),
    executeLog,
  });
  const result = await deliverFeuillets(tx, {
    giverStates: new Map([['F3', fadedGiverState]]),
    receiverId: 5,
    codes: ['F3'],
  });
  assert.strictEqual(result.delivered, 1);
  assert.ok(executeLog.some((c) => /INSERT INTO gl_game_feuillet_states/.test(c.sql)));
});
