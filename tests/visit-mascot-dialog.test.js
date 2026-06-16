const test = require('node:test');
const assert = require('node:assert/strict');

test('parseDialogProfileJson valide un profil minimal', async () => {
  const { parseDialogProfileJson } = await import('../src/utils/visitMascotDialogEvents.js');
  const r = parseDialogProfileJson({ move: ['Bonjour'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile.move, ['Bonjour']);
});

test('parseDialogProfileJson refuse une clé inconnue', async () => {
  const { parseDialogProfileJson } = await import('../src/utils/visitMascotDialogEvents.js');
  const r = parseDialogProfileJson({ unknownEvent: ['x'] });
  assert.equal(r.ok, false);
});

test('resolveMascotDialogLine priorise pack puis catalogue puis global', async () => {
  const { resolveMascotDialogLine } = await import('../src/utils/visitMascotDialogApply.js');
  const extras = [
    {
      id: 'srv-pack',
      label: 'Pack',
      renderer: 'sprite_cut',
      fallbackSilhouette: 'gnome',
      mascotPackVersion: 2,
      dialogProfile: { move: ['Pack line'] },
      spriteCut: { frameWidth: 8, frameHeight: 8, stateFrames: { idle: { srcs: ['/x'], fps: 2 } } },
    },
  ];
  const global = { move: ['Global line'] };
  const catalog = { 'gnome-foret-rive': { move: ['Catalog line'] } };
  const fromPack = resolveMascotDialogLine('move', {
    mascotId: 'srv-pack',
    extraCatalogEntries: extras,
    globalDefaults: global,
    catalogOverrides: catalog,
  });
  assert.equal(fromPack, 'Pack line');
  const fromCatalog = resolveMascotDialogLine('move', {
    mascotId: 'gnome-foret-rive',
    extraCatalogEntries: [],
    globalDefaults: global,
    catalogOverrides: catalog,
  });
  assert.equal(fromCatalog, 'Catalog line');
  const fromGlobal = resolveMascotDialogLine('move', {
    mascotId: 'sprout-rive',
    extraCatalogEntries: [],
    globalDefaults: global,
    catalogOverrides: catalog,
  });
  assert.equal(fromGlobal, 'Global line');
});

test('resolveMascotDialogLine accepte les clés legacy', async () => {
  const { resolveMascotDialogLine } = await import('../src/utils/visitMascotDialogApply.js');
  const line = resolveMascotDialogLine('mark_seen', {
    mascotId: 'sprout-rive',
    extraCatalogEntries: [],
  });
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0);
});

test('normalizeDialogEventKey mappe surprise vers mascotDragLarge', async () => {
  const { normalizeDialogEventKey, VISIT_MASCOT_DIALOG_EVENT } =
    await import('../src/utils/visitMascotDialogEvents.js');
  assert.equal(normalizeDialogEventKey('surprise'), VISIT_MASCOT_DIALOG_EVENT.MASCOT_DRAG_LARGE);
});
