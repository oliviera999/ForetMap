'use strict';

/**
 * Reprise de l'initialisation BDD (`lib/databaseInitRetry.js`).
 *
 * L'enjeu est une panne observée en production : `initDatabase()` échoue au démarrage,
 * le process reste debout, et **tout `/api/*` répond 503 SERVICE_NOT_READY jusqu'à un
 * redémarrage manuel** — le client réessayant 8 fois par requête, l'utilisateur voit
 * « reconnexion en cours… » en boucle sans fin. Ce qui est vérifié ici, c'est donc :
 * une panne transitoire est rattrapée, et l'arrêt du process n'est jamais retardé.
 */

const test = require('node:test');
const assert = require('node:assert');

const { createDatabaseInitRetry, retryDelayMs } = require('../lib/databaseInitRetry');

/** Ordonnanceur synchrone : exécute immédiatement et mémorise les délais demandés. */
function immediateScheduler() {
  const delays = [];
  return {
    delays,
    schedule(fn, ms) {
      delays.push(ms);
      // `setImmediate` : on reste asynchrone (comme un vrai minuteur) sans attendre.
      return setImmediate(fn);
    },
  };
}

test('retryDelayMs : backoff progressif puis palier sur la dernière valeur', () => {
  assert.strictEqual(retryDelayMs(1, [2000, 5000, 10000]), 2000);
  assert.strictEqual(retryDelayMs(2, [2000, 5000, 10000]), 5000);
  assert.strictEqual(retryDelayMs(3, [2000, 5000, 10000]), 10000);
  assert.strictEqual(retryDelayMs(99, [2000, 5000, 10000]), 10000);
});

test('initDatabase qui réussit du premier coup : une seule tentative, état prêt', async () => {
  let calls = 0;
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
    },
    schedule: immediateScheduler().schedule,
  });
  assert.strictEqual(await runner.start(), true);
  assert.strictEqual(calls, 1);
  const state = runner.getState();
  assert.strictEqual(state.ready, true);
  assert.strictEqual(state.attempts, 1);
  assert.strictEqual(state.lastError, null);
  assert.strictEqual(state.nextRetryMs, null);
});

test('panne transitoire : réessaie jusqu’au succès (au lieu de rester en 503 à vie)', async () => {
  const scheduler = immediateScheduler();
  let calls = 0;
  const failures = [];
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
      if (calls < 3) throw new Error(`ECONNREFUSED ${calls}`);
    },
    delays: [10, 20, 30],
    schedule: scheduler.schedule,
    onAttemptFailed: (ctx) => failures.push(ctx),
  });

  assert.strictEqual(await runner.start(), true);
  assert.strictEqual(calls, 3);
  assert.deepStrictEqual(scheduler.delays, [10, 20]);
  assert.strictEqual(failures.length, 2);
  assert.strictEqual(failures[0].attempts, 1);
  assert.strictEqual(failures[0].nextRetryMs, 10);
  const state = runner.getState();
  assert.strictEqual(state.ready, true);
  assert.strictEqual(state.attempts, 3);
  assert.strictEqual(state.lastError, null);
});

test('état exposé pendant l’échec : diagnostic exploitable (attempts, lastError, nextRetryMs)', async () => {
  let calls = 0;
  let observed = null;
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
      throw new Error('Access denied for user');
    },
    delays: [5],
    schedule: (fn, ms) => setTimeout(fn, ms),
    onAttemptFailed: () => {
      if (!observed) observed = runner.getState();
    },
    // Deux tentatives suffisent : on coupe ensuite pour ne pas boucler dans le test.
    shouldStop: () => calls >= 2,
  });

  assert.strictEqual(await runner.start(), false);
  assert.strictEqual(observed.ready, false);
  assert.strictEqual(observed.attempts, 1);
  assert.match(observed.lastError, /Access denied/);
  assert.strictEqual(observed.nextRetryMs, 5);
  assert.strictEqual(runner.getState().stopped, true);
});

test('arrêt du process : la boucle abandonne sans reprogrammer de tentative', async () => {
  const scheduler = immediateScheduler();
  let shuttingDown = false;
  let calls = 0;
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
      shuttingDown = true; // l'arrêt gracieux démarre pendant la tentative
      throw new Error('MySQL down');
    },
    delays: [10],
    schedule: scheduler.schedule,
    shouldStop: () => shuttingDown,
  });

  assert.strictEqual(await runner.start(), false);
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(scheduler.delays, []);
  assert.strictEqual(runner.getState().stopped, true);
});

test('un rappel de journalisation qui lève n’interrompt pas la reprise', async () => {
  const scheduler = immediateScheduler();
  let calls = 0;
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
      if (calls < 2) throw new Error('boom');
    },
    delays: [10],
    schedule: scheduler.schedule,
    onAttemptFailed: () => {
      throw new Error('logger cassé');
    },
    onReady: () => {
      throw new Error('logger cassé');
    },
  });
  assert.strictEqual(await runner.start(), true);
  assert.strictEqual(runner.getState().ready, true);
});

test('start() est idempotent : deux appels partagent la même boucle', async () => {
  let calls = 0;
  const runner = createDatabaseInitRetry({
    initDatabase: async () => {
      calls += 1;
    },
  });
  const [a, b] = await Promise.all([runner.start(), runner.start()]);
  assert.strictEqual(a, true);
  assert.strictEqual(b, true);
  assert.strictEqual(calls, 1);
});

test('initDatabase manquant : erreur explicite à la construction', () => {
  assert.throws(() => createDatabaseInitRetry({}), /initDatabase/);
});
