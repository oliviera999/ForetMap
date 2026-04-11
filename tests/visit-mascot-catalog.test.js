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

test('catalogue inclut SPR0UT et SCR4P avec états étendus', async () => {
  const {
    getVisitMascotById,
    getVisitMascotSupportedStates,
  } = await loadModule();

  const sprout = getVisitMascotById('sprout-rive');
  const scrap = getVisitMascotById('scrap-rive');

  assert.ok(sprout);
  assert.ok(scrap);
  assert.equal(sprout.renderer, 'rive');
  assert.equal(scrap.renderer, 'rive');
  assert.equal(sprout.fallbackSilhouette, 'sprout');
  assert.equal(scrap.fallbackSilhouette, 'scrap');

  const sproutStates = getVisitMascotSupportedStates('sprout-rive');
  const scrapStates = getVisitMascotSupportedStates('scrap-rive');

  for (const wanted of ['idle', 'walking', 'happy', 'talk', 'alert', 'angry', 'surprise']) {
    assert.ok(sproutStates.includes(wanted), `sprout etat manquant: ${wanted}`);
    assert.ok(scrapStates.includes(wanted), `scrap etat manquant: ${wanted}`);
  }
});
