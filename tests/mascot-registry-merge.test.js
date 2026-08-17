const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeMascotRegistryEntries } = require('../lib/mascotRegistryMerge');

// Helper de fusion partagé ForetMap / G&L : dédoublonnage par id, premier groupe gagnant,
// provenance (`source`) appliquée par groupe et jamais écrasée si l'entrée la porte déjà.

test('fusion : ordre des groupes préservé, dédoublonnage par identifiant', () => {
  const merged = mergeMascotRegistryEntries([
    { source: 'gl', entries: [{ id: 'gnome-gl' }, { id: 'partagee' }] },
    { source: 'foretmap', entries: [{ id: 'partagee' }, { id: 'renard2-cut-spritesheet' }] },
  ]);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['gnome-gl', 'partagee', 'renard2-cut-spritesheet'],
  );
  // « partagée » vient du premier groupe : c'est sa provenance qui est retenue.
  assert.equal(merged.find((e) => e.id === 'partagee').source, 'gl');
});

test('fusion : la provenance portée par l’entrée prime sur celle du groupe', () => {
  const merged = mergeMascotRegistryEntries([
    { source: 'catalog', entries: [{ id: 'a', source: 'pack' }, { id: 'b' }] },
  ]);
  assert.equal(merged[0].source, 'pack');
  assert.equal(merged[1].source, 'catalog');
});

test('fusion : entrées sans identifiant ignorées, champs conservés', () => {
  const merged = mergeMascotRegistryEntries([
    { source: 'pack', entries: [{ id: '  ' }, null, { id: 'srv-x', label: 'X', pack: { a: 1 } }] },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0], { id: 'srv-x', label: 'X', pack: { a: 1 }, source: 'pack' });
});

test('fusion : entrée vide ou groupes absents → liste vide (jamais d’exception)', () => {
  assert.deepEqual(mergeMascotRegistryEntries([]), []);
  assert.deepEqual(mergeMascotRegistryEntries(null), []);
  assert.deepEqual(mergeMascotRegistryEntries([{ source: 'gl' }]), []);
});
