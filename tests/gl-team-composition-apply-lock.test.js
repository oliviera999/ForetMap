'use strict';

/**
 * `applyComposition` doit verrouiller `gl_games` avant tout DELETE des équipes.
 * Sans `SELECT … FOR UPDATE`, un POST /start (ou un second apply) peut passer
 * entre la lecture `draft` et l’écriture : partie live recomposée, joueurs
 * orphelins. Ce fichier reste sans BDD — le `tx` est factice.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyComposition, GlTeamCompositionError } = require('../lib/glTeamComposition');

const SAMPLE_TEAMS = [
  { name: 'Les Sources', type: 'gnome', memberIds: [1] },
  { name: 'La Lande', type: 'unicorn', memberIds: [2] },
];

function fakeTx({ lockedStatus, missing = false }) {
  const queries = [];
  const executes = [];
  const tx = {
    queryOne: async (sql) => {
      queries.push(sql);
      if (/FROM gl_games WHERE id = \? LIMIT 1 FOR UPDATE/i.test(sql)) {
        return missing ? null : { id: 7, status: lockedStatus };
      }
      throw new Error(`queryOne inattendu (la garde doit s’arrêter au verrou) : ${sql}`);
    },
    queryAll: async (sql) => {
      throw new Error(`queryAll inattendu : ${sql}`);
    },
    execute: async (sql, params) => {
      executes.push({ sql, params });
      return { affectedRows: 1, insertId: 1 };
    },
  };
  return { tx, queries, executes };
}

test('applyComposition refuse une partie live lue sous FOR UPDATE, sans écriture', async () => {
  const { tx, queries, executes } = fakeTx({ lockedStatus: 'live' });
  await assert.rejects(
    () =>
      applyComposition(
        { gameId: 7, teams: SAMPLE_TEAMS, actor: { userId: 42 } },
        { withTransaction: (work) => work(tx) },
      ),
    (err) =>
      err instanceof GlTeamCompositionError && err.code === 'GAME_NOT_DRAFT' && err.status === 409,
  );
  assert.equal(executes.length, 0, 'aucun DELETE / INSERT d’équipes');
  assert.ok(
    queries.some((sql) => /FROM gl_games WHERE id = \? LIMIT 1 FOR UPDATE/i.test(sql)),
    'la première lecture de la partie doit poser FOR UPDATE',
  );
});

test('applyComposition refuse aussi une partie paused lue sous verrou', async () => {
  const { tx, executes } = fakeTx({ lockedStatus: 'paused' });
  await assert.rejects(
    () =>
      applyComposition(
        { gameId: 7, teams: SAMPLE_TEAMS, actor: { userId: 42 } },
        { withTransaction: (work) => work(tx) },
      ),
    (err) => err instanceof GlTeamCompositionError && err.code === 'GAME_NOT_DRAFT',
  );
  assert.equal(executes.length, 0);
});

test('applyComposition : partie disparue sous verrou → GAME_NOT_FOUND', async () => {
  const { tx, executes } = fakeTx({ lockedStatus: 'draft', missing: true });
  await assert.rejects(
    () =>
      applyComposition(
        { gameId: 7, teams: SAMPLE_TEAMS, actor: { userId: 42 } },
        { withTransaction: (work) => work(tx) },
      ),
    (err) =>
      err instanceof GlTeamCompositionError && err.code === 'GAME_NOT_FOUND' && err.status === 404,
  );
  assert.equal(executes.length, 0);
});
