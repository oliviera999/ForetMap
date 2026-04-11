const test = require('node:test');
const assert = require('node:assert/strict');

function mockWindowStorage() {
  const store = new Map();
  return {
    localStorage: {
      getItem(k) {
        return store.has(k) ? store.get(k) : null;
      },
      setItem(k, v) {
        store.set(k, v);
      },
      removeItem(k) {
        store.delete(k);
      },
      _store: store,
    },
  };
}

async function loadModule() {
  return import('../src/utils/visitMascotPositionPersistence.js');
}

test('normalizeStoredPct refuse les valeurs non numériques', async () => {
  const { normalizeStoredPct } = await loadModule();
  assert.equal(normalizeStoredPct('x', 10), null);
  assert.equal(normalizeStoredPct(10, NaN), null);
  assert.deepEqual(normalizeStoredPct(10, 20), { xp: 10, yp: 20 });
  assert.deepEqual(normalizeStoredPct(-5, 200), { xp: 0, yp: 100 });
});

test('load retourne null sans window', async () => {
  const prev = globalThis.window;
  // eslint-disable-next-line no-delete-var -- test isolation
  delete globalThis.window;
  try {
    const { loadVisitMascotPositionPct } = await loadModule();
    assert.equal(loadVisitMascotPositionPct('n3'), null);
  } finally {
    if (prev !== undefined) globalThis.window = prev;
  }
});

test('sauvegarde et relecture par carte', async () => {
  globalThis.window = mockWindowStorage();
  try {
    const {
      loadVisitMascotPositionPct,
      saveVisitMascotPositionPct,
      positionStorageKey,
    } = await loadModule();
    assert.equal(loadVisitMascotPositionPct('n3'), null);
    saveVisitMascotPositionPct('n3', { xp: 42.5, yp: 61 });
    assert.deepEqual(loadVisitMascotPositionPct('n3'), { xp: 42.5, yp: 61 });
    assert.equal(loadVisitMascotPositionPct('foret'), null);
    const keyN3 = positionStorageKey('n3');
    assert.ok(globalThis.window.localStorage._store.has(keyN3));
  } finally {
    // eslint-disable-next-line no-delete-var -- test isolation
    delete globalThis.window;
  }
});

test('JSON invalide ou structure incorrecte → null', async () => {
  globalThis.window = mockWindowStorage();
  try {
    const { loadVisitMascotPositionPct, positionStorageKey } = await loadModule();
    window.localStorage.setItem(positionStorageKey('n3'), '{');
    assert.equal(loadVisitMascotPositionPct('n3'), null);
    window.localStorage.setItem(positionStorageKey('n3'), JSON.stringify({ xp: 1 }));
    assert.equal(loadVisitMascotPositionPct('n3'), null);
  } finally {
    // eslint-disable-next-line no-delete-var -- test isolation
    delete globalThis.window;
  }
});
