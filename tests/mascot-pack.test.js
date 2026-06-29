const test = require('node:test');
const assert = require('node:assert/strict');

async function loadMascotPack() {
  return import('../src/utils/mascotPack.js');
}

test('validateMascotPackV1 accepte le pack exemple (chemins /assets/)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { validateMascotPackV1 } = await loadMascotPack();
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../docs/mascot-pack.example.json'), 'utf8'),
  );
  const r = validateMascotPackV1(raw, { relaxAssetPrefix: false });
  assert.equal(r.ok, true);
  assert.equal(r.pack.id, 'exemple-pack');
  assert.equal(r.spriteCut.stateFrames.idle.srcs.length, 2);
  assert.ok(Array.isArray(r.spriteCut.stateFrames.idle.frameDwellMs));
  assert.equal(r.spriteCut.stateFrames.idle.frameDwellMs.length, 2);
  assert.equal(r.spriteCut.displayScale, 1);
});

test('validateMascotPackV1 refuse un état inconnu', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'bad',
      label: 'x',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/bad/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { files: ['a.png'], fps: 1 },
        not_a_real_state: { files: ['b.png'], fps: 1 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, false);
});

test('validateMascotPackV1 refuse frameDwellMs de mauvaise longueur', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'dwell-bad',
      label: 'x',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/dwell-bad/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { files: ['a.png', 'b.png'], fps: 4, frameDwellMs: [100] },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, false);
});

test('expandMascotPackToSpriteCut sans frameDwellMs remplit fps seulement', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'no-dwell',
      label: 'x',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/no-dwell/frames/',
      frameWidth: 64,
      frameHeight: 64,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { files: ['a.png', 'b.png'], fps: 10 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.spriteCut.stateFrames.idle.frameDwellMs, undefined);
  assert.equal(r.spriteCut.stateFrames.idle.srcs.length, 2);
});

test('allowedFramesBasePrefixes autorise une base API pack', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const base = `/api/visit/mascot-packs/${uuid}/assets/`;
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'api-pack',
      label: 'API',
      renderer: 'sprite_cut',
      framesBase: base,
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { files: ['a.png'], fps: 2 },
      },
    },
    { allowedFramesBasePrefixes: [base] },
  );
  assert.equal(r.ok, true);
});

test('validateMascotPack v2 + interactionProfile + bibliothèque API', async () => {
  const { validateMascotPackV1, visitMascotSpriteLibraryAssetsPrefix } = await loadMascotPack();
  const base = visitMascotSpriteLibraryAssetsPrefix('foret');
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'pack-v2-lib',
      label: 'V2',
      renderer: 'sprite_cut',
      framesBase: base,
      frameWidth: 8,
      frameHeight: 8,
      fallbackSilhouette: 'gnome',
      interactionProfile: {
        mascotDragVeryLarge: { mode: 'transient', state: 'running', durationMs: 800 },
      },
      stateFrames: {
        idle: { files: ['a.png'], fps: 2 },
      },
    },
    { allowedFramesBasePrefixes: [base] },
  );
  assert.equal(r.ok, true);
  assert.strictEqual(r.pack.mascotPackVersion, 2);
});

test('validateMascotPack v2 + dialogProfile', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'dialog-pack',
      label: 'Dialog',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/dialog-pack/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
      dialogProfile: {
        move: ['Pack bubble'],
        markerMarkedSeen: ['Bravo pack'],
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.pack.dialogProfile.move, ['Pack bubble']);
  const bad = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'dialog-bad',
      label: 'Bad',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/dialog-bad/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
      dialogProfile: { notAnEvent: ['x'] },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(bad.ok, false);
});

test('palette élargie : un nouvel état canonique (wave) est accepté', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'palette-wave',
      label: 'Palette',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/palette-wave/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { files: ['a.png'], fps: 1 },
        wave: { files: ['w.png'], fps: 4 },
        dance: { files: ['d.png'], fps: 6 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.ok(r.spriteCut.stateFrames.wave);
  assert.ok(r.spriteCut.stateFrames.dance);
});

test('customStates : états personnalisés acceptés dans stateFrames + alias + interaction', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'custom-states',
      label: 'Custom',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/custom-states/frames/',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      customStates: [{ key: 'magic_spell', label: 'Sort magique' }],
      stateFrames: {
        idle: { files: ['a.png'], fps: 1 },
        magic_spell: { files: ['m.png'], fps: 8 },
      },
      stateAliases: { magic_spell: 'idle' },
      interactionProfile: {
        markerInspectOpen: { mode: 'transient', state: 'magic_spell', durationMs: 1000 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.spriteCut.customStates[0].key, 'magic_spell');
});

test('customStates : refus si la clé entre en collision avec un état canonique', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'custom-collision',
      label: 'X',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/custom-collision/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      customStates: [{ key: 'idle', label: 'Doublon' }],
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, false);
});

test('customStates : refus si interactionProfile cible un état inexistant', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'custom-badstate',
      label: 'X',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/custom-badstate/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
      interactionProfile: {
        markerInspectOpen: { mode: 'transient', state: 'pas_un_etat', durationMs: 1000 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, false);
});

test('customTriggers : déclencheur périodique + tap valides', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'custom-triggers',
      label: 'Triggers',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/custom-triggers/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      customStates: [{ key: 'yawn', label: 'Bâillement' }],
      stateFrames: {
        idle: { files: ['a.png'], fps: 1 },
        yawn: { files: ['y.png'], fps: 3 },
      },
      customTriggers: [
        {
          key: 'ambient_yawn',
          label: 'Bâille de temps en temps',
          type: 'periodic',
          state: 'yawn',
          durationMs: 1200,
          everyMs: 8000,
          dialog: ['Hmm...'],
        },
        { key: 'tap_dance', label: 'Danse au tap', type: 'tap', state: 'dance', durationMs: 900 },
      ],
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.spriteCut.customTriggers.length, 2);
});

test('customTriggers : refus périodique sans everyMs et clé réservée', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const noEvery = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'trig-noevery',
      label: 'X',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/trig-noevery/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
      customTriggers: [
        { key: 'ambient_x', label: 'X', type: 'periodic', state: 'idle', durationMs: 900 },
      ],
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(noEvery.ok, false);
  const reserved = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'trig-reserved',
      label: 'X',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/trig-reserved/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 1 } },
      customTriggers: [
        { key: 'mascotTap', label: 'X', type: 'tap', state: 'idle', durationMs: 900 },
      ],
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(reserved.ok, false);
});

test('relaxAssetPrefix autorise framesBase hors /assets/', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'blob-test',
      label: 'Blob',
      renderer: 'sprite_cut',
      framesBase: '/virtual/',
      frameWidth: 8,
      frameHeight: 8,
      fallbackSilhouette: 'gnome',
      stateFrames: {
        idle: { srcs: ['blob:http://x/1'], fps: 2 },
      },
    },
    { relaxAssetPrefix: true },
  );
  assert.equal(r.ok, true);
});

test('validateMascotPackV1 conserve clonedFromCatalogId', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const r = validateMascotPackV1(
    {
      mascotPackVersion: 2,
      id: 'srv-clone',
      label: 'Copie',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/renard2-cut/frames/',
      frameWidth: 153,
      frameHeight: 160,
      fallbackSilhouette: 'backpackFox2',
      clonedFromCatalogId: 'renard2-cut-spritesheet',
      stateFrames: {
        idle: { files: ['cell-r0-c0.png'], fps: 1 },
      },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.pack.clonedFromCatalogId, 'renard2-cut-spritesheet');
});

test('mascotPackEditorModel : parse, stringify, ensureServerFramesBase', async () => {
  const {
    parsePackJson,
    stringifyPack,
    ensureServerFramesBase,
    serverMascotPackAssetsPrefix,
    clonePackDeep,
  } = await import('../src/utils/mascotPackEditorModel.js');
  const bad = parsePackJson('{');
  assert.equal(bad.ok, false);
  const ok = parsePackJson('{"a":1}');
  assert.equal(ok.ok, true);
  assert.equal(ok.pack.a, 1);
  assert.equal(stringifyPack({ x: 1 }, 0), '{"x":1}');
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.ok(String(serverMascotPackAssetsPrefix(uuid)).includes(uuid));
  assert.equal(serverMascotPackAssetsPrefix('not-uuid'), null);
  const merged = ensureServerFramesBase({ framesBase: '/old/', id: 'p' }, uuid);
  assert.ok(String(merged.framesBase).startsWith('/api/visit/mascot-packs/'));
  const src = { nested: { y: 2 } };
  const c = clonePackDeep(src);
  c.nested.y = 99;
  assert.equal(src.nested.y, 2);
});

test('mascotPackValidationUi extrait des erreurs lisibles depuis format() Zod', async () => {
  const { validateMascotPackV1 } = await loadMascotPack();
  const { extractMascotPackValidationIssues, toMascotPackIssueLines } =
    await import('../src/utils/mascotPackValidationUi.js');
  const invalid = validateMascotPackV1(
    {
      mascotPackVersion: 1,
      id: 'bad-ui',
      label: 'UI',
      renderer: 'sprite_cut',
      framesBase: '/assets/mascots/bad-ui/frames/',
      frameWidth: 16,
      frameHeight: 16,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: {} },
    },
    { relaxAssetPrefix: false },
  );
  assert.equal(invalid.ok, false);
  const issues = extractMascotPackValidationIssues(invalid.error.format());
  assert.ok(Array.isArray(issues));
  assert.ok(issues.some((it) => it.path.includes('stateFrames.idle')));
  const lines = toMascotPackIssueLines(issues);
  assert.ok(lines.length > 0);
});

test('sanitizeMascotPackDraft retire les entrées srcs/files vides et états vides', async () => {
  const { sanitizeMascotPackDraft } = await import('../src/utils/mascotPackValidationUi.js');
  const cleaned = sanitizeMascotPackDraft({
    id: 'draft',
    stateFrames: {
      idle: { srcs: ['  ', 'https://cdn.example.test/idle.png', ''], fps: 7 },
      walking: { srcs: ['   '], fps: 8 },
      happy: { files: ['a.png', ' ', 'b.png'], fps: 12 },
      talk: { files: ['   '] },
    },
  });
  assert.deepEqual(cleaned.stateFrames.idle.srcs, ['https://cdn.example.test/idle.png']);
  assert.deepEqual(cleaned.stateFrames.happy.files, ['a.png', 'b.png']);
  assert.equal(cleaned.stateFrames.walking, undefined);
  assert.equal(cleaned.stateFrames.talk, undefined);
});

test('toMascotPackIssueLines propose des messages plus pédagogiques', async () => {
  const { toMascotPackIssueLines } = await import('../src/utils/mascotPackValidationUi.js');
  const lines = toMascotPackIssueLines([
    { path: 'stateFrames.walking', message: 'Chaque état doit avoir `srcs` ou `files` non vide.' },
    { path: 'stateFrames.walking.srcs.0', message: 'Invalid input' },
    {
      path: 'stateFrames.walking',
      message: 'Utiliser soit `srcs` soit `files`, pas les deux sur un même état.',
    },
  ]);
  assert.ok(lines.some((l) => l.includes('Ajoutez au moins une image')));
  assert.ok(lines.some((l) => l.includes('URL vide ou invalide')));
  assert.ok(lines.some((l) => l.includes('Choisissez un seul mode')));
});
