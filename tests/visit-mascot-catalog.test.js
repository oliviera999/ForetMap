const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../src/utils/visitMascotCatalog.js');
}

test('catalogue mascotte expose un défaut valide', async () => {
  const { getVisitMascotCatalog, getDefaultVisitMascotId, getVisitMascotById } = await loadModule();
  const list = getVisitMascotCatalog();
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
  const def = getDefaultVisitMascotId();
  assert.ok(def);
  assert.ok(getVisitMascotById(def));
});

test('normalizeVisitMascotId retombe sur la mascotte par défaut', async () => {
  const { normalizeVisitMascotId, getDefaultVisitMascotId } = await loadModule();
  const def = getDefaultVisitMascotId();
  assert.equal(normalizeVisitMascotId('inconnue'), def);
  assert.equal(normalizeVisitMascotId(''), def);
});
