'use strict';

/**
 * `upsertFeuilletState` : un marquage lu/tenu ne doit pas réécrire l'effacement.
 *
 * Les routes POST …/feuillets/:code/read et …/hold n'envoient que `status`.
 * Avant ce correctif, le défaut `effacementPct = 0` écrasait le pourcentage
 * calculé à la découverte — le Souffle disparaissait dès qu'un joueur ouvrait
 * le feuillet, y compris un feuillet déjà totalement effacé.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { upsertFeuilletState } = require('../lib/glLoreFeuillets');

function makeDeps({ existing, executeLog, members = [{ player_id: 7 }] }) {
  return {
    async queryOne() {
      return existing;
    },
    async queryAll() {
      return members;
    },
    async execute(sql, params) {
      executeLog.push({ sql, params });
      return { insertId: 0 };
    },
  };
}

function teamWritePct(executeLog) {
  const row = executeLog.find((c) => /INSERT INTO gl_game_feuillet_states/.test(c.sql));
  assert.ok(row, 'écriture d’état d’équipe attendue');
  return row.params[4];
}

function playerWritePct(executeLog) {
  const row = executeLog.find((c) => /INSERT INTO gl_player_feuillet_states/.test(c.sql));
  assert.ok(row, 'instantané de possession attendu');
  return row.params[3];
}

const FADED_EXISTING = {
  status: 'discovered',
  discovered_at: '2026-08-19T10:00:00.000Z',
  read_at: null,
  held_at: null,
  effaced_at: null,
  effacement_pct: 40,
};

test('upsertFeuilletState : read sans pct conserve l’effacement existant (équipe + carnet)', async () => {
  const executeLog = [];
  await upsertFeuilletState(makeDeps({ existing: FADED_EXISTING, executeLog }), {
    gameId: 1,
    teamId: 2,
    feuilletCode: 'ep-finale',
    status: 'read',
  });
  assert.strictEqual(teamWritePct(executeLog), 40);
  assert.strictEqual(playerWritePct(executeLog), 40);
});

test('upsertFeuilletState : hold sans pct conserve l’effacement existant', async () => {
  const executeLog = [];
  await upsertFeuilletState(makeDeps({ existing: FADED_EXISTING, executeLog }), {
    gameId: 1,
    teamId: 2,
    feuilletCode: 'ep-finale',
    status: 'held',
  });
  assert.strictEqual(teamWritePct(executeLog), 40);
});

test('upsertFeuilletState : un feuillet totalement effacé reste à 100 % après read', async () => {
  const executeLog = [];
  await upsertFeuilletState(
    makeDeps({
      existing: { ...FADED_EXISTING, status: 'effaced', effacement_pct: 100 },
      executeLog,
    }),
    {
      gameId: 1,
      teamId: 2,
      feuilletCode: 'ep-finale',
      status: 'read',
    },
  );
  assert.strictEqual(teamWritePct(executeLog), 100);
  assert.strictEqual(playerWritePct(executeLog), 100);
});

test('upsertFeuilletState : un pct explicite (nouvelle découverte) s’écrit tel quel', async () => {
  const executeLog = [];
  await upsertFeuilletState(makeDeps({ existing: null, executeLog }), {
    gameId: 1,
    teamId: 2,
    feuilletCode: 'ep-I-01',
    status: 'discovered',
    effacementPct: 25,
  });
  assert.strictEqual(teamWritePct(executeLog), 25);
});

test('upsertFeuilletState : un pct explicite à 0 (liasse offerte) s’écrit bien à 0', async () => {
  const executeLog = [];
  await upsertFeuilletState(makeDeps({ existing: FADED_EXISTING, executeLog }), {
    gameId: 1,
    teamId: 2,
    feuilletCode: 'GL2P-01',
    status: 'discovered',
    effacementPct: 0,
  });
  assert.strictEqual(teamWritePct(executeLog), 0);
});

test('upsertFeuilletState : sans état existant, l’omission du pct pose 0 (insert)', async () => {
  const executeLog = [];
  await upsertFeuilletState(makeDeps({ existing: null, executeLog }), {
    gameId: 1,
    teamId: 2,
    feuilletCode: 'nouveau',
    status: 'discovered',
  });
  assert.strictEqual(teamWritePct(executeLog), 0);
});
