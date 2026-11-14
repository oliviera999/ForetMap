'use strict';

/**
 * Catalogue de mascottes G&L (lib/glUnifiedMascotCatalog.js) = packs PUBLIÉS du studio
 * ForêtMap, et rien d'autre. Le fichier `src/gl/utils/glMascotCatalog.js` ne sert plus que de
 * palette au rendu SVG de repli (`GLMascotAvatar`).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { initSchema, execute, queryAll } = require('../database');
const { createVisitMascotPack } = require('./helpers/glFixtures');
const {
  getGlUnifiedMascotCatalog,
  getGlUnifiedMascotById,
} = require('../lib/glUnifiedMascotCatalog');

const PALETTE_PATH = path.join(__dirname, '..', 'src', 'gl', 'utils', 'glMascotCatalog.js');
const stamp = Date.now();
const created = [];
let gnome = null;
let licorne = null;
let typed = null;
let olu = null;
let draft = null;

before(async () => {
  await initSchema();
  gnome = await createVisitMascotPack({ label: `Gnome des forêts ${stamp}` });
  licorne = await createVisitMascotPack({ label: `Licorne marine ${stamp}` });
  // `type` fixé au studio : prime sur le libellé.
  typed = await createVisitMascotPack({ label: `Gnome déguisé ${stamp}`, type: 'unicorn' });
  olu = await createVisitMascotPack({ label: `Olu ${stamp}` });
  draft = await createVisitMascotPack({ label: `Gnome brouillon ${stamp}`, published: false });
  created.push(gnome, licorne, typed, olu, draft);
});

after(async () => {
  for (const p of created) await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [p.id]);
});

test('catalogue = packs publiés du studio uniquement (brouillon absent, aucun gl-*)', async () => {
  const catalog = await getGlUnifiedMascotCatalog();
  const ids = new Set(catalog.map((m) => m.id));
  for (const p of [gnome, licorne, typed, olu]) assert.ok(ids.has(p.catalogId), p.label);
  assert.ok(!ids.has(draft.catalogId), 'un brouillon ne doit pas être proposé');
  assert.ok(
    catalog.every((m) => !String(m.id).startsWith('gl-')),
    'plus aucune mascotte SVG gl-*',
  );
  // Chaque entrée correspond à une ligne publiée de `visit_mascot_packs`.
  const published = new Set(
    (await queryAll('SELECT catalog_id FROM visit_mascot_packs WHERE is_published = 1')).map(
      (r) => r.catalog_id,
    ),
  );
  assert.ok(catalog.every((m) => published.has(m.id)));
  assert.ok(catalog.every((m) => m.source === 'foretmap'));
});

test('type déduit : gnome / licorne depuis le libellé, pack.type prioritaire, sinon null', async () => {
  assert.equal((await getGlUnifiedMascotById(gnome.catalogId))?.type, 'gnome');
  assert.equal((await getGlUnifiedMascotById(licorne.catalogId))?.type, 'unicorn');
  assert.equal((await getGlUnifiedMascotById(typed.catalogId))?.type, 'unicorn');
  assert.equal((await getGlUnifiedMascotById(olu.catalogId))?.type, null);
  const entry = await getGlUnifiedMascotById(gnome.catalogId);
  assert.equal(entry.renderer, 'sprite_cut');
  assert.ok(entry.spriteCut?.stateFrames?.idle?.srcs?.length);
});

test('dépublier un pack le retire du catalogue sans cache ni redéploiement', async () => {
  assert.ok(await getGlUnifiedMascotById(licorne.catalogId));
  await execute('UPDATE visit_mascot_packs SET is_published = 0 WHERE id = ?', [licorne.id]);
  try {
    assert.equal(await getGlUnifiedMascotById(licorne.catalogId), null);
  } finally {
    await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE id = ?', [licorne.id]);
  }
  assert.ok(await getGlUnifiedMascotById(licorne.catalogId));
});

test('mascotte livrée supprimée au studio : absente du catalogue G&L', async () => {
  // Une mascotte livrée n'existe pour G&L que par sa ligne publiée au studio : sans elle
  // (supprimée, ou dépubliée), elle n'est plus proposée, même si le fichier existe encore.
  const rows = await queryAll(
    "SELECT id, catalog_id FROM visit_mascot_packs WHERE origin = 'builtin' AND is_published = 1 LIMIT 1",
  );
  if (!rows.length) return;
  const { id, catalog_id: catalogId } = rows[0];
  await execute('UPDATE visit_mascot_packs SET is_published = 0 WHERE id = ?', [id]);
  try {
    assert.equal(await getGlUnifiedMascotById(catalogId), null);
  } finally {
    await execute('UPDATE visit_mascot_packs SET is_published = 1 WHERE id = ?', [id]);
  }
});

test('ids inconnus, vides ou gl-* : null', async () => {
  assert.equal(await getGlUnifiedMascotById('gl-gnome-mousse'), null);
  assert.equal(await getGlUnifiedMascotById('gl-licorne-aube'), null);
  assert.equal(await getGlUnifiedMascotById(''), null);
  assert.equal(await getGlUnifiedMascotById(null), null);
});

test('palette de repli SVG : chaque entrée a un type, des couleurs et un id gl-*', async () => {
  const mod = await import(pathToFileURL(PALETTE_PATH).href);
  for (const entry of mod.GL_MASCOT_CATALOG) {
    assert.ok(entry.id.startsWith('gl-'));
    assert.ok(['gnome', 'unicorn'].includes(entry.type));
    assert.ok(/^#[0-9a-fA-F]{3,8}$/.test(entry.primaryColor));
    assert.ok(/^#[0-9a-fA-F]{3,8}$/.test(entry.secondaryColor));
  }
  assert.equal(mod.getGlMascotById('inconnu'), null);
});
