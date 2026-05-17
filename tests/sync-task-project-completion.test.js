require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

function loadSyncModuleWithMocks({ projectStatus, total, doneCount }) {
  const dbPath = require.resolve('../database');
  const realtimePath = require.resolve('../lib/realtime');
  const syncPath = require.resolve('../lib/syncTaskProjectCompletion');
  const previous = {
    db: require.cache[dbPath],
    realtime: require.cache[realtimePath],
    sync: require.cache[syncPath],
  };
  const executeCalls = [];
  const emitted = [];

  delete require.cache[syncPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      queryOne: async (sql, params) => {
        if (String(sql).includes('FROM task_projects')) {
          return { id: params[0], status: projectStatus, map_id: 'foret' };
        }
        if (String(sql).includes('FROM tasks')) {
          return { n: total, done_n: doneCount };
        }
        throw new Error(`Requête inattendue: ${sql}`);
      },
      execute: async (...args) => {
        executeCalls.push(args);
      },
    },
  };
  require.cache[realtimePath] = {
    id: realtimePath,
    filename: realtimePath,
    loaded: true,
    exports: {
      emitTasksChanged: (event) => emitted.push(event),
    },
  };

  return {
    module: require('../lib/syncTaskProjectCompletion'),
    executeCalls,
    emitted,
    restore() {
      delete require.cache[syncPath];
      if (previous.db) require.cache[dbPath] = previous.db;
      else delete require.cache[dbPath];
      if (previous.realtime) require.cache[realtimePath] = previous.realtime;
      else delete require.cache[realtimePath];
      if (previous.sync) require.cache[syncPath] = previous.sync;
    },
  };
}

test('syncTaskProjectCompletionForProject préserve les projets mis en attente manuellement', async () => {
  const ctx = loadSyncModuleWithMocks({ projectStatus: 'on_hold', total: 2, doneCount: 2 });
  try {
    const changed = await ctx.module.syncTaskProjectCompletionForProject('project-1');
    assert.strictEqual(changed, false);
    assert.deepStrictEqual(ctx.executeCalls, []);
    assert.deepStrictEqual(ctx.emitted, []);
  } finally {
    ctx.restore();
  }
});
