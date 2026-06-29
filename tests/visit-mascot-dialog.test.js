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

test('parseDialogProfileJson accepte une clé personnalisée (snake-case)', async () => {
  const { parseDialogProfileJson } = await import('../src/utils/visitMascotDialogEvents.js');
  const ok = parseDialogProfileJson({ ambient_yawn: ['Hmm...'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.profile.ambient_yawn, ['Hmm...']);
  // Une clé camelCase non connue reste rejetée (format invalide).
  const bad = parseDialogProfileJson({ notAnEvent: ['x'] });
  assert.equal(bad.ok, false);
});

test('sanitizeDialogProfile conserve les clés personnalisées valides', async () => {
  const { sanitizeDialogProfile } = await import('../src/utils/visitMascotDialogEvents.js');
  const cleaned = sanitizeDialogProfile({
    move: ['  Bonjour  '],
    ambient_yawn: ['Baille'],
    'MAUVAISE CLE': ['nope'],
  });
  assert.deepEqual(cleaned.move, ['Bonjour']);
  assert.deepEqual(cleaned.ambient_yawn, ['Baille']);
  assert.equal(cleaned['MAUVAISE CLE'], undefined);
});

test('resolveTriggerDialogLines : profil central prioritaire sur inline', async () => {
  const { resolveTriggerDialogLines } = await import('../src/utils/visitMascotCustomBehaviors.js');
  const trigger = { key: 'amb', dialog: ['inline'] };
  const entry = { dialogProfile: { amb: ['central'] } };
  assert.deepEqual(resolveTriggerDialogLines(entry, trigger), ['central']);
  // Sans profil central : repli sur la bulle inline du déclencheur.
  assert.deepEqual(resolveTriggerDialogLines({}, trigger), ['inline']);
  assert.deepEqual(resolveTriggerDialogLines(null, { key: 'x' }), []);
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
