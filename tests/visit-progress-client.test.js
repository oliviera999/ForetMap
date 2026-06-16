'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

/** @type {Record<string, string>} */
let memoryStore = {};

function installMemoryLocalStorage() {
  memoryStore = {};
  const mock = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    },
    setItem(key, value) {
      memoryStore[key] = String(value);
    },
    removeItem(key) {
      delete memoryStore[key];
    },
  };
  global.localStorage = mock;
  global.window = { localStorage: mock };
}

let safeVisitProgressPayload;
let compactVisitSeenQueue;
let enqueueVisitSeenAction;
let loadVisitSeenQueue;
let applyVisitSeenQueueToSet;
let flushVisitSeenQueue;
let replaceQueuedVisitSeenAction;
let VISIT_SEEN_QUEUE_STORAGE_KEY;

before(async () => {
  installMemoryLocalStorage();
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/utils/visitProgressClient.js')).href
  );
  safeVisitProgressPayload = mod.safeVisitProgressPayload;
  compactVisitSeenQueue = mod.compactVisitSeenQueue;
  enqueueVisitSeenAction = mod.enqueueVisitSeenAction;
  loadVisitSeenQueue = mod.loadVisitSeenQueue;
  applyVisitSeenQueueToSet = mod.applyVisitSeenQueueToSet;
  flushVisitSeenQueue = mod.flushVisitSeenQueue;
  replaceQueuedVisitSeenAction = mod.replaceQueuedVisitSeenAction;
  VISIT_SEEN_QUEUE_STORAGE_KEY = mod.VISIT_SEEN_QUEUE_STORAGE_KEY;
});

describe('visitProgressClient', () => {
  it('extrait seen valides depuis une réponse API typique', () => {
    const { seen } = safeVisitProgressPayload({
      mode: 'anonymous',
      seen: [
        { target_type: 'zone', target_id: 'z1' },
        { target_type: 'marker', target_id: 'm2' },
      ],
    });
    assert.deepEqual(seen, [
      { target_type: 'zone', target_id: 'z1' },
      { target_type: 'marker', target_id: 'm2' },
    ]);
  });

  it('renvoie seen vide si corps null ou non-objet', () => {
    assert.deepEqual(safeVisitProgressPayload(null).seen, []);
    assert.deepEqual(safeVisitProgressPayload(undefined).seen, []);
    assert.deepEqual(safeVisitProgressPayload([]).seen, []);
    assert.deepEqual(safeVisitProgressPayload('x').seen, []);
  });

  it('renvoie seen vide si seen absent ou non-tableau', () => {
    assert.deepEqual(safeVisitProgressPayload({ mode: 'student' }).seen, []);
    assert.deepEqual(safeVisitProgressPayload({ seen: null }).seen, []);
    assert.deepEqual(safeVisitProgressPayload({ seen: {} }).seen, []);
  });

  it('filtre les entrées invalides sans rejeter le lot', () => {
    const { seen } = safeVisitProgressPayload({
      seen: [
        { target_type: 'zone', target_id: 'ok' },
        null,
        { target_type: '', target_id: 'x' },
        { target_type: 'marker', target_id: '' },
        { target_type: 'marker', target_id: '  good  ' },
      ],
    });
    assert.deepEqual(seen, [
      { target_type: 'zone', target_id: 'ok' },
      { target_type: 'marker', target_id: 'good' },
    ]);
  });

  it('compacte la file : dernier état par cible', () => {
    const compact = compactVisitSeenQueue([
      { target_type: 'zone', target_id: 'a', seen: true, updated_at: 1 },
      { target_type: 'zone', target_id: 'a', seen: false, updated_at: 2 },
      { target_type: 'marker', target_id: 'b', seen: true, updated_at: 3 },
    ]);
    assert.strictEqual(compact.length, 2);
    assert.strictEqual(compact[0].target_id, 'a');
    assert.strictEqual(compact[0].seen, false);
    assert.strictEqual(compact[1].target_id, 'b');
    assert.strictEqual(compact[1].seen, true);
  });

  it('enqueue persiste et applique sur un Set seen', () => {
    memoryStore = {};
    enqueueVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: true });
    enqueueVisitSeenAction({ target_type: 'marker', target_id: 'm1', seen: true });
    assert.strictEqual(loadVisitSeenQueue().length, 2);
    const seenSet = applyVisitSeenQueueToSet(new Set());
    assert.ok(seenSet.has('zone:z1'));
    assert.ok(seenSet.has('marker:m1'));
    assert.ok(memoryStore[VISIT_SEEN_QUEUE_STORAGE_KEY]);
  });

  it('flush vide la file quand toutes les actions réussissent', async () => {
    memoryStore = {};
    enqueueVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: true });
    const posted = [];
    const result = await flushVisitSeenQueue(async (action) => {
      posted.push(action);
    });
    assert.strictEqual(result.synced, 1);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(loadVisitSeenQueue().length, 0);
    assert.strictEqual(posted.length, 1);
  });

  it('flush conserve les actions en échec', async () => {
    memoryStore = {};
    enqueueVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: true });
    enqueueVisitSeenAction({ target_type: 'marker', target_id: 'm1', seen: false });
    const result = await flushVisitSeenQueue(async (action) => {
      if (action.target_type === 'marker') throw new Error('network');
    });
    assert.strictEqual(result.synced, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.remaining, 1);
    const left = loadVisitSeenQueue();
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].target_id, 'm1');
  });

  it('remplace une action en attente après un succès réseau pour la même cible', () => {
    memoryStore = {};
    enqueueVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: true });
    const queue = replaceQueuedVisitSeenAction({
      target_type: 'zone',
      target_id: 'z1',
      seen: false,
    });
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].target_id, 'z1');
    assert.strictEqual(queue[0].seen, false);
  });

  it('ne perd pas une mise à jour locale arrivée pendant le flush', async () => {
    memoryStore = {};
    enqueueVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: true });
    const result = await flushVisitSeenQueue(async () => {
      replaceQueuedVisitSeenAction({ target_type: 'zone', target_id: 'z1', seen: false });
    });
    assert.strictEqual(result.synced, 1);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.remaining, 1);
    const left = loadVisitSeenQueue();
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].target_id, 'z1');
    assert.strictEqual(left[0].seen, false);
  });
});
