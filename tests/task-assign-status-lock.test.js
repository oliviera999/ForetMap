'use strict';

/**
 * Non-régression : une inscription concurrente ne doit pas écraser une validation
 * prof via `recalculateTaskStatus` sur un objet `task` périmé.
 *
 * Scénario : lecture initiale status=available → validation → INSERT sous FOR UPDATE
 * → recalcul. Le recalcul doit recevoir le statut LU sous verrou (validated) et le
 * conserver (cf. computeTaskStatusFromProgress).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeTaskStatusFromProgress,
  recalculateTaskStatusWithConn,
} = require('../lib/taskStatusRecalc');

describe('recalcul statut sous verrou (course assign / validate)', () => {
  it('préserve validated même si assignedCount > 0', () => {
    assert.equal(
      computeTaskStatusFromProgress({
        currentStatus: 'validated',
        completionMode: 'single_done',
        assignedCount: 2,
        doneCount: 0,
      }),
      'validated',
    );
  });

  it('recalculateTaskStatusWithConn ne réécrit pas validated → in_progress', async () => {
    const executes = [];
    const conn = {
      queryOne: async (sql) => {
        if (/FROM tasks/i.test(sql)) {
          return { id: 't1', status: 'validated', completion_mode: 'single_done' };
        }
        if (/FROM task_assignments/i.test(sql)) {
          return { assigned_count: 1, done_count: 0 };
        }
        return null;
      },
      execute: async (sql, params) => {
        executes.push({ sql, params });
        return { affectedRows: 1 };
      },
    };
    const result = await recalculateTaskStatusWithConn(conn, 't1');
    assert.equal(result.status, 'validated');
    assert.equal(
      executes.length,
      0,
      'aucun UPDATE tasks.status ne doit partir quand le statut sous verrou est validated',
    );
  });

  it('un objet task périmé (available) RÉÉCRIRAIT in_progress — d’où le relecture sous verrou', async () => {
    const executes = [];
    const staleTask = { id: 't1', status: 'available', completion_mode: 'single_done' };
    const conn = {
      queryOne: async (sql) => {
        if (/FROM task_assignments/i.test(sql)) {
          return { assigned_count: 1, done_count: 0 };
        }
        return null;
      },
      execute: async (sql, params) => {
        executes.push({ sql, params });
        return { affectedRows: 1 };
      },
    };
    const result = await recalculateTaskStatusWithConn(conn, staleTask);
    assert.equal(result.status, 'in_progress');
    assert.equal(executes.length, 1);
    assert.match(String(executes[0].sql), /UPDATE tasks SET status/i);
    assert.deepEqual(executes[0].params, ['in_progress', 't1']);
  });
});
