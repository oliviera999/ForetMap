'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliverFeuillets } = require('../lib/glMarketFeuillets');

// Contrepartie unitaire de `tests/gl-market-feuillets.test.js` : la règle « on n'écrase
// pas un feuillet déjà trouvé » se vérifie ici sans base, sur les quatre cas d'état.
function makeTx({ teamRow, existingByCode, executeLog }) {
  return {
    async queryOne(sql, params) {
      if (sql.includes('gl_team_members')) return teamRow;
      if (sql.includes('gl_game_feuillet_states')) return existingByCode.get(params[2]) || null;
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

const FADED_GIVER_STATE = {
  effacement_pct: 90,
  discovered_by_player_id: '9',
  discovered_by_name: 'Donneur',
};

function txFor(existingStatus, executeLog) {
  return makeTx({
    teamRow: { game_id: 1, team_id: 20 },
    existingByCode: new Map(existingStatus ? [['F1', { status: existingStatus }]] : []),
    executeLog,
  });
}

for (const status of ['discovered', 'read', 'held', 'effaced']) {
  test(`deliverFeuillets : un feuillet déjà « ${status} » n’est pas réécrit`, async () => {
    const executeLog = [];
    const result = await deliverFeuillets(txFor(status, executeLog), {
      giverStates: new Map([['F1', FADED_GIVER_STATE]]),
      receiverId: 5,
      codes: ['F1'],
    });
    assert.strictEqual(result.delivered, 0);
    assert.strictEqual(result.gameId, 1);
    assert.strictEqual(result.teamId, 20);
    assert.strictEqual(executeLog.length, 0, 'aucune écriture : l’état de l’équipe reste intact');
  });
}

test('deliverFeuillets : copie un feuillet absent chez le receveur', async () => {
  const executeLog = [];
  const result = await deliverFeuillets(txFor(null, executeLog), {
    giverStates: new Map([['F1', { ...FADED_GIVER_STATE, effacement_pct: 0 }]]),
    receiverId: 5,
    codes: ['F1'],
  });
  assert.strictEqual(result.delivered, 1);
  assert.ok(executeLog.some((c) => /INSERT INTO gl_game_feuillet_states/.test(c.sql)));
});

test('deliverFeuillets : un état « locked » n’est pas une possession — la copie s’écrit', async () => {
  const executeLog = [];
  const result = await deliverFeuillets(txFor('locked', executeLog), {
    giverStates: new Map([['F1', FADED_GIVER_STATE]]),
    receiverId: 5,
    codes: ['F1'],
  });
  assert.strictEqual(result.delivered, 1);
  assert.ok(executeLog.some((c) => /INSERT INTO gl_game_feuillet_states/.test(c.sql)));
});
