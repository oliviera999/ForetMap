'use strict';

// Clés de détermination : tutoriels « avant de commencer » (`id_key_tutorials`) et drapeau
// « chemins multiples voulus » (`id_keys.allows_multiple_paths`).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const checks = require('../lib/mcp/audits/checks');
const { SNAPSHOT_SQL } = require('../lib/mcp/audits');

const stamp = Date.now();
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
let plantId = 0;
let keyId = 0;
let draftKeyId = 0;
const tutorials = [];

const putKey = (id, body) => request(app).put(`/api/id-keys/${id}`).set(auth()).send(body);
const links = () =>
  queryAll(
    'SELECT tutorial_id, sort_order FROM id_key_tutorials WHERE key_id = ? ORDER BY sort_order',
    [keyId],
  );

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  plantId = (
    await execute(`INSERT INTO plants (name, emoji, description) VALUES (?, '🔍', 't')`, [
      `KeyTuto ${stamp}`,
    ])
  ).insertId;
  for (const [n, active] of [
    ['Loupe', 1],
    ['Jumelles', 1],
    ['Archivé', 0],
  ]) {
    const r = await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active)
       VALUES (?, ?, 'html', 'Résumé', '<p>Contenu</p>', ?)`,
      [`${n} ${stamp}`, `key-tuto-${n.toLowerCase()}-${stamp}`.replace(/[^a-z0-9-]/g, 'x'), active],
    );
    tutorials.push(r.insertId);
  }
  const created = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `key-tuto-${stamp}`, title: 'Clé à tutoriels', allows_multiple_paths: true })
    .expect(201);
  keyId = created.body.id;
  assert.equal(created.body.allows_multiple_paths, true, 'drapeau accepté à la création');
  assert.deepEqual(created.body.tutorials, []);
  const c1 = created.body.couplets[0].id;
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c1}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Empreinte', plant_id: plantId },
        { statement: 'Terrier', plant_id: plantId },
      ],
    })
    .expect(200);
  draftKeyId = (
    await request(app)
      .post('/api/id-keys')
      .set(auth())
      .send({ slug: `key-tuto-brouillon-${stamp}`, title: 'Clé brouillon' })
      .expect(201)
  ).body.id;
});

after(async () => {
  for (const id of [keyId, draftKeyId]) {
    if (id) await execute('DELETE FROM id_keys WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of tutorials) {
    await execute('DELETE FROM tutorials WHERE id = ?', [id]).catch(() => {});
  }
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

test('liens clé ↔ tutoriel : liste ordonnée, remplacée, conservée si absente du corps', async () => {
  const [loupe, jumelles, archive] = tutorials;
  const res = await putKey(keyId, { tutorial_ids: [jumelles, loupe, jumelles] }).expect(200);
  assert.deepEqual(res.body.tutorial_ids, [jumelles, loupe], 'ordre reçu, doublon écarté');
  assert.deepEqual(
    res.body.tutorials.map((t) => [t.id, t.sort_order, t.type]),
    [
      [jumelles, 0, 'html'],
      [loupe, 1, 'html'],
    ],
  );
  assert.deepEqual(
    (await links()).map((r) => [Number(r.tutorial_id), Number(r.sort_order)]),
    [
      [jumelles, 0],
      [loupe, 1],
    ],
  );

  // Une autre modification de la clé ne touche pas aux liens.
  const meta = await putKey(keyId, { title: 'Clé à tutoriels (bis)' }).expect(200);
  assert.deepEqual(meta.body.tutorial_ids, [jumelles, loupe]);

  // Alias camelCase, tutoriel archivé accepté par le gestionnaire.
  const camel = await putKey(keyId, { tutorialIds: [loupe, archive] }).expect(200);
  assert.deepEqual(camel.body.tutorial_ids, [loupe, archive]);
  assert.equal(camel.body.tutorials[1].is_active, false);

  await putKey(keyId, { tutorial_ids: [999999999] }).expect(400);
  await putKey(keyId, { tutorial_ids: 'loupe' }).expect(400);
  await putKey(keyId, { tutorial_ids: [0] }).expect(400);
  assert.equal((await links()).length, 2, 'un refus n’écrit rien');
});

test('lecture élève : tutoriels actifs seulement ; filtre des clés par tutoriel', async () => {
  const [loupe, , archive] = tutorials;
  await putKey(keyId, { is_published: true, tool_required: ['loupe'] }).expect(200);
  const pub = await request(app).get(`/api/id-keys/key-tuto-${stamp}`).expect(200);
  assert.deepEqual(pub.body.tutorial_ids, [loupe], 'tutoriel archivé masqué aux élèves');
  assert.equal(pub.body.tutorials[0].title, `Loupe ${stamp}`);
  assert.deepEqual(pub.body.tool_required, ['loupe']);

  // Clé brouillon liée au même tutoriel : visible du seul gestionnaire.
  await putKey(draftKeyId, { tutorial_ids: [loupe] }).expect(200);
  const anon = await request(app).get(`/api/id-keys?tutorial_id=${loupe}`).expect(200);
  assert.deepEqual(
    anon.body.items.map((k) => k.id),
    [keyId],
  );
  const manager = await request(app)
    .get(`/api/id-keys?all=1&tutorial_id=${loupe}`)
    .set(auth())
    .expect(200);
  assert.deepEqual(manager.body.items.map((k) => k.id).sort(), [keyId, draftKeyId].sort());
  const none = await request(app).get(`/api/id-keys?tutorial_id=${archive}`).expect(200);
  assert.deepEqual(
    none.body.items.map((k) => k.id),
    [keyId],
    'le filtre porte sur le lien, pas sur l’état du tutoriel',
  );
  await request(app).get('/api/id-keys?tutorial_id=abc').expect(400);
});

test('suppression : le lien part avec le tutoriel ou avec la clé', async () => {
  const [loupe, jumelles, archive] = tutorials;
  await putKey(keyId, { tutorial_ids: [loupe, jumelles, archive] }).expect(200);
  await execute('DELETE FROM tutorials WHERE id = ?', [archive]);
  assert.deepEqual(
    (await links()).map((r) => Number(r.tutorial_id)),
    [loupe, jumelles],
  );
  await putKey(keyId, { tutorial_ids: [] }).expect(200);
  assert.equal((await links()).length, 0);
});

test('chemins multiples voulus : drapeau éditable, audit muet sur la clé qui le porte', async () => {
  // Requêtes réelles de l'audit, réduites à la clé du test (base partagée).
  const snapshot = async () => {
    const idKeyCouplets = (await queryAll(SNAPSHOT_SQL.idKeyCouplets)).filter(
      (c) => Number(c.key_id) === keyId,
    );
    const coupletIds = new Set(idKeyCouplets.map((c) => Number(c.id)));
    return {
      idKeys: (await queryAll(SNAPSHOT_SQL.idKeys)).filter((k) => Number(k.id) === keyId),
      idKeyCouplets,
      idKeyLeads: (await queryAll(SNAPSHOT_SQL.idKeyLeads)).filter((l) =>
        coupletIds.has(Number(l.couplet_id)),
      ),
    };
  };
  assert.ok(checks.CHECKS.id_key_dead_paths, 'contrôle enregistré');
  const marker = `key:${keyId}:plant:${plantId}`;
  const ids = async () => checks.idKeyDeadPaths(await snapshot()).map((f) => f.id);

  // Posé à la création : la même espèce atteinte par deux feuilles n'est pas signalée.
  assert.ok(!(await ids()).includes(marker));

  const off = await putKey(keyId, { allows_multiple_paths: false }).expect(200);
  assert.equal(off.body.allows_multiple_paths, false);
  assert.ok((await ids()).includes(marker), 'sans le drapeau, le constat revient');

  const on = await putKey(keyId, { allowsMultiplePaths: true }).expect(200);
  assert.equal(on.body.allows_multiple_paths, true);
  // Une modification sans le champ ne le remet pas à zéro.
  const untouched = await putKey(keyId, { scope_label: 'Traces' }).expect(200);
  assert.equal(untouched.body.allows_multiple_paths, true);
  assert.ok(!(await ids()).includes(marker));
});
