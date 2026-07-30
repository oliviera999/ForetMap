'use strict';

/**
 * Garde-fou course validation : recalculateTaskStatusWithConn doit relire le statut
 * en base et ne pas se fier à un objet `task` périmé (sinon available/in_progress/done
 * écrase `validated` après POST /validate concurrent).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { recalculateTaskStatusWithConn } = require('../lib/taskStatusRecalc');

function mockConn({ status, completionMode = 'single_done', assigned = 1, done = 0 }) {
  const updates = [];
  return {
    updates,
    async queryOne(sql) {
      if (/FROM tasks WHERE id/i.test(sql)) {
        return { id: 't1', status, completion_mode: completionMode };
      }
      if (/FROM task_assignments/i.test(sql)) {
        return { assigned_count: assigned, done_count: done };
      }
      throw new Error(`queryOne inattendue: ${sql}`);
    },
    async execute(sql, params) {
      updates.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
}

describe('recalculateTaskStatusWithConn — statut relu (anti-écrasement validated)', () => {
  it('ignore un snapshot in_progress si la base est déjà validated', async () => {
    const conn = mockConn({ status: 'validated', assigned: 1, done: 0 });
    const result = await recalculateTaskStatusWithConn(conn, {
      id: 't1',
      status: 'in_progress',
      completion_mode: 'single_done',
    });
    assert.equal(result.status, 'validated');
    assert.equal(conn.updates.length, 0, 'aucun UPDATE de statut ne doit partir');
  });

  it('ignore un snapshot in_progress si la base est on_hold', async () => {
    const conn = mockConn({ status: 'on_hold', assigned: 2, done: 1 });
    const result = await recalculateTaskStatusWithConn(conn, {
      id: 't1',
      status: 'in_progress',
      completion_mode: 'all_assignees_done',
    });
    assert.equal(result.status, 'on_hold');
    assert.equal(conn.updates.length, 0);
  });

  it('recalcule normalement quand la base est encore in_progress', async () => {
    const conn = mockConn({
      status: 'in_progress',
      completionMode: 'all_assignees_done',
      assigned: 2,
      done: 2,
    });
    const result = await recalculateTaskStatusWithConn(conn, {
      id: 't1',
      status: 'available',
      completion_mode: 'single_done',
    });
    assert.equal(result.status, 'done');
    assert.equal(conn.updates.length, 1);
    assert.match(conn.updates[0].sql, /UPDATE tasks SET status/i);
    assert.deepEqual(conn.updates[0].params, ['done', 't1']);
  });
});
