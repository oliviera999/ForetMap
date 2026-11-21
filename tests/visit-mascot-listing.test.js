'use strict';

/**
 * « Proposé dans la Visite » (`visit_mascot_packs.visit_listed`, migration 374) et contenu de
 * la Visite allégé — audit UI/UX du 19/11/2026, constat U4 et lot 2 point 3.
 *
 * Contrats vérifiés :
 * - un pack publié mais retiré de la Visite (`visit_listed = 0`) n'est proposé ni par le
 *   registre public, ni par le contenu, ni par la route de pack à la demande — et reste
 *   proposé aux équipes de Gnomes & Licornes ;
 * - un pack non publié n'est jamais proposé, quelle que soit la case ;
 * - le contenu ne sert que le pack du guide par défaut, et retombe sur un guide proposé
 *   quand le réglage désigne un pack retiré (repli documenté) ;
 * - le registre léger (`?light=1`) n'embarque aucun JSON de pack ;
 * - le libellé de la ligne est la source unique : le `label` du JSON est réaligné ;
 * - `variant_of` : base existante, pas de chaîne, pas d'auto-référence.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, queryOne } = require('../database');
const { app } = require('../server');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { getGlUnifiedMascotCatalog } = require('../lib/glUnifiedMascotCatalog');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const {
  buildVisitMascotCatalog,
  pickDefaultVisitMascotPack,
  withVisitContentMascots,
} = require('../lib/visitContentMascots');

const DEFAULT_KEY = 'ui.visit.mascot.default_id';
let token;
let defaultSnapshot;
const created = [];

async function createPack(body) {
  const res = await request(app)
    .post('/api/visit/mascot-packs')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  created.push(res.body.id);
  return res.body;
}

async function setDefault(value) {
  await setSetting(DEFAULT_KEY, value, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  token = await ensureAdminTeacherAuthToken({ elevated: true });
  defaultSnapshot = await snapshotSetting(DEFAULT_KEY);
});

test.after(async () => {
  for (const id of created) {
    await request(app)
      .delete(`/api/visit/mascot-packs/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }
  await restoreSetting(defaultSnapshot);
});

test('un pack retiré de la Visite reste proposé aux équipes G&L', async () => {
  const listed = await createPack({ is_published: 1, label: 'Guide proposé (test)' });
  const unlisted = await createPack({
    is_published: 1,
    visit_listed: 0,
    label: 'Gnome des équipes (test)',
  });
  const draft = await createPack({ is_published: 0, visit_listed: 1, label: 'Brouillon (test)' });
  assert.equal(unlisted.visit_listed, false);
  assert.equal(listed.visit_listed, true, 'proposé par défaut');

  const registry = await request(app).get('/api/visit/mascots').expect(200);
  const ids = registry.body.mascots.map((m) => m.catalog_id);
  assert.ok(ids.includes(listed.catalog_id));
  assert.ok(!ids.includes(unlisted.catalog_id), 'retiré de la Visite : absent du registre');
  assert.ok(!ids.includes(draft.catalog_id), 'non publié : jamais proposé');

  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const catalogIds = content.body.mascot_catalog.map((m) => m.catalog_id);
  assert.ok(catalogIds.includes(listed.catalog_id));
  assert.ok(!catalogIds.includes(unlisted.catalog_id));
  assert.ok(!catalogIds.includes(draft.catalog_id));

  await request(app).get(`/api/visit/mascots/${unlisted.catalog_id}`).expect(404);
  await request(app).get(`/api/visit/mascots/${draft.catalog_id}`).expect(404);
  const one = await request(app).get(`/api/visit/mascots/${listed.catalog_id}`).expect(200);
  assert.equal(one.body.catalog_id, listed.catalog_id);
  assert.ok(one.body.pack && typeof one.body.pack === 'object');

  const gl = await getGlUnifiedMascotCatalog();
  const glIds = gl.map((entry) => entry.id);
  assert.ok(glIds.includes(unlisted.catalog_id), 'G&L ne lit pas la case de la Visite');
  assert.ok(!glIds.includes(draft.catalog_id), 'G&L ignore toujours les brouillons');
});

test('le contenu ne sert que le pack du guide par défaut, avec repli si le réglage désigne un pack retiré', async () => {
  const guide = await createPack({ is_published: 1, label: 'Guide par défaut (test)' });
  const retire = await createPack({ is_published: 1, visit_listed: 0, label: 'Retiré (test)' });

  await setDefault(guide.catalog_id);
  const ok = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.equal(ok.body.mascot_default_id, guide.catalog_id);
  assert.equal(ok.body.mascot_packs.length, 1);
  assert.equal(ok.body.mascot_packs[0].catalog_id, guide.catalog_id);
  assert.ok(ok.body.mascot_catalog.length >= 1);
  for (const entry of ok.body.mascot_catalog) assert.ok(!('pack' in entry));

  await setDefault(retire.catalog_id);
  const repli = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.notEqual(repli.body.mascot_default_id, retire.catalog_id, 'jamais un pack retiré');
  assert.ok(
    repli.body.mascot_catalog.some((m) => m.catalog_id === repli.body.mascot_default_id),
    'le repli désigne un guide proposé',
  );
});

test('registre léger : aucun JSON de pack', async () => {
  await createPack({ is_published: 1, label: 'Léger (test)' });
  const res = await request(app).get('/api/visit/mascots?light=1').expect(200);
  assert.ok(res.body.mascots.length > 0);
  for (const entry of res.body.mascots) {
    assert.ok(!('pack' in entry), `${entry.catalog_id} : pack embarqué`);
  }
});

test('le libellé de la ligne est la source unique du nom (JSON réaligné)', async () => {
  const pack = await createPack({ is_published: 0, label: 'Ancien nom (test)' });
  await request(app)
    .put(`/api/visit/mascot-packs/${pack.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ label: 'Oiseau noir (test)', pack: { ...pack.pack, label: 'Ancien nom (test)' } })
    .expect(200);
  const row = await queryOne('SELECT label, pack_json FROM visit_mascot_packs WHERE id = ?', [
    pack.id,
  ]);
  assert.equal(row.label, 'Oiseau noir (test)');
  assert.equal(JSON.parse(row.pack_json).label, 'Oiseau noir (test)');
});

test('variant_of : base existante, un seul niveau, jamais soi-même', async () => {
  const base = await createPack({ is_published: 1, label: 'Personnage (test)' });
  const variante = await createPack({
    is_published: 1,
    label: 'Personnage (femme) (test)',
    variant_of: base.catalog_id,
  });
  assert.equal(variante.variant_of, base.catalog_id);

  const put = (id, body) =>
    request(app)
      .put(`/api/visit/mascot-packs/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  await put(base.id, { variant_of: base.catalog_id }).expect(400);
  await put(base.id, { variant_of: variante.catalog_id }).expect(400);
  await put(variante.id, { variant_of: 'srv-inexistant' }).expect(400);
  const cleared = await put(variante.id, { variant_of: '' }).expect(200);
  assert.equal(cleared.body.variant_of, null);

  await put(variante.id, { variant_of: base.catalog_id }).expect(200);
  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const entry = content.body.mascot_catalog.find((m) => m.catalog_id === variante.catalog_id);
  assert.equal(entry?.variant_of, base.catalog_id);
});

test('projection pure : catalogue léger, choix du défaut et repli', () => {
  const packs = [
    { id: 'b', label: 'B (femme)', pack: { fallbackSilhouette: 'gnome' }, variant_of: 'a' },
    { id: 'a', label: 'A', pack: {} },
  ];
  assert.deepEqual(buildVisitMascotCatalog(packs)[0], {
    catalog_id: 'b',
    label: 'B (femme)',
    variant_of: 'a',
    fallback_silhouette: 'gnome',
    thumbnail_url: null,
  });
  assert.equal(pickDefaultVisitMascotPack(packs, 'b').id, 'b');
  assert.equal(
    pickDefaultVisitMascotPack(packs, 'inconnu').id,
    'a',
    'repli : premier pack de base',
  );
  assert.equal(pickDefaultVisitMascotPack([], 'a'), null);
  const out = withVisitContentMascots({ map_id: 'm', _mascot_packs_full: packs }, '');
  assert.ok(!('_mascot_packs_full' in out));
  assert.equal(out.mascot_packs.length, 1);
  assert.equal(out.mascot_default_id, 'a');
});
