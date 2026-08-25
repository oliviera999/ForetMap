'use strict';

/**
 * Le carnet personnel ne doit jamais être opacifié par une copie plus effacée.
 *
 * `loadPlayerFeuilletStates` garde déjà le moins effacé à la lecture, mais si
 * `upsertPlayerFeuilletState` réécrit la trace durable, la meilleure copie
 * disparaît dès que le joueur quitte l'équipe d'origine (fin de partie,
 * changement d'équipe, suppression). Même classe que l'anti-écrasement
 * d'équipe dans `deliverFeuillets`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergePlayerFeuilletSnapshot,
  upsertPlayerFeuilletState,
} = require('../lib/glLoreFeuillets');

test('mergePlayerFeuilletSnapshot : insert si aucune possession personnelle', () => {
  const merged = mergePlayerFeuilletSnapshot(null, {
    status: 'discovered',
    effacementPct: 40,
    acquiredVia: 'echange',
  });
  assert.deepEqual(merged, {
    status: 'discovered',
    effacementPct: 40,
    acquiredVia: 'echange',
  });
});

test('mergePlayerFeuilletSnapshot : une copie plus opaque est ignorée', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'discovered', effacement_pct: 0, acquired_via: 'decouverte' },
    { status: 'effaced', effacementPct: 90, acquiredVia: 'echange' },
  );
  assert.deepEqual(merged, {
    status: 'discovered',
    effacementPct: 0,
    acquiredVia: 'decouverte',
  });
});

test('mergePlayerFeuilletSnapshot : une copie plus lisible remplace', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'effaced', effacement_pct: 90, acquired_via: 'echange' },
    { status: 'discovered', effacementPct: 0, acquiredVia: 'decouverte' },
  );
  assert.deepEqual(merged, {
    status: 'discovered',
    effacementPct: 0,
    acquiredVia: 'decouverte',
  });
});

test('mergePlayerFeuilletSnapshot : à pct égal, on garde le statut existant', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'read', effacement_pct: 40, acquired_via: 'decouverte' },
    { status: 'discovered', effacementPct: 40, acquiredVia: 'echange' },
  );
  assert.deepEqual(merged, {
    status: 'read',
    effacementPct: 40,
    acquiredVia: 'decouverte',
  });
});

test('mergePlayerFeuilletSnapshot : une découverte crédite même si le texte n’est pas meilleur', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'discovered', effacement_pct: 0, acquired_via: 'echange' },
    { status: 'effaced', effacementPct: 40, acquiredVia: 'decouverte' },
  );
  assert.strictEqual(merged.effacementPct, 0);
  assert.strictEqual(merged.status, 'discovered');
  assert.strictEqual(merged.acquiredVia, 'decouverte');
});

test('upsertPlayerFeuilletState : n’écrit pas un pct pire que la trace personnelle', async () => {
  const executeLog = [];
  await upsertPlayerFeuilletState(
    {
      async queryOne() {
        return { status: 'discovered', effacement_pct: 0, acquired_via: 'decouverte' };
      },
      async execute(sql, params) {
        executeLog.push({ sql, params });
        return { insertId: 0 };
      },
    },
    {
      playerId: 7,
      feuilletCode: 'ep-finale',
      status: 'effaced',
      effacementPct: 90,
      acquiredVia: 'echange',
    },
  );
  assert.strictEqual(executeLog.length, 1);
  assert.match(executeLog[0].sql, /LEAST\(effacement_pct, VALUES\(effacement_pct\)\)/);
  assert.strictEqual(executeLog[0].params[2], 'discovered');
  assert.strictEqual(executeLog[0].params[3], 0);
  assert.strictEqual(executeLog[0].params[4], 'decouverte');
});
