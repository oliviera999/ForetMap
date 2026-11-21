'use strict';

// Propositions d'une clé de détermination : mise à jour en place (identifiants conservés),
// issue / aide / image gardées quand elles ne sont pas renvoyées, retrait d'une proposition,
// crédit des images. Constat du 20/11/2026 : un `upsert_node` avec identifiants seuls était
// refusé (« Espèce manquante ») puis recréait les propositions sous de nouveaux identifiants.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { mergeLeadInput } = require('../lib/idKeys');
const { serializeLead } = require('../lib/shared/idKeyLeadCore');

const stamp = Date.now();
const cladeId = `clade-inplace-${stamp}`.slice(0, 64);
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const plants = [];
let keyId = 0;
let otherKeyId = 0;
let c1 = 0;
let c2 = 0;

const putLeads = (coupletId, leads) =>
  request(app).put(`/api/id-keys/${keyId}/couplets/${coupletId}/leads`).set(auth()).send({ leads });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  for (const n of ['A', 'B', 'C']) {
    const r = await execute(`INSERT INTO plants (name, emoji, description) VALUES (?, '🐾', 't')`, [
      `InPlace ${n} ${stamp}`,
    ]);
    plants.push(r.insertId);
  }
  await execute(
    `INSERT INTO clades (id, name, shared_attribute, sort_order) VALUES (?, 'Mammifères test', 'poils', 0)`,
    [cladeId],
  );
  const other = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `inplace-suite-${stamp}`, title: 'Clé suite' })
    .expect(201);
  otherKeyId = other.body.id;
  const created = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `inplace-${stamp}`, title: 'Clé en place' })
    .expect(201);
  keyId = created.body.id;
  c1 = created.body.couplets[0].id;
  c2 = (await request(app).post(`/api/id-keys/${keyId}/couplets`).set(auth()).send({}).expect(201))
    .body.id;
});

after(async () => {
  for (const id of [keyId, otherKeyId]) {
    if (id) await execute('DELETE FROM id_keys WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of plants) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  await execute('DELETE FROM clades WHERE id = ?', [cladeId]).catch(() => {});
});

test('cœur pur : un champ absent n’efface rien, une issue énoncée remplace l’ancienne', () => {
  const previous = serializeLead({
    id: 7,
    couplet_id: 1,
    statement: 'Empreinte à cinq doigts',
    hint: 'Doigts : pelotes au bout.',
    image_url: '/img/a.jpg',
    image_credit: 'A. Auteur',
    image_licence: 'CC BY-SA 4.0',
    outcome: 'espece',
    plant_id: 12,
    next_key_id: 3,
  });
  // Identifiant seul : tout est repris.
  const kept = mergeLeadInput({ id: 7 }, previous);
  assert.equal(kept.statement, 'Empreinte à cinq doigts');
  assert.equal(kept.hint, 'Doigts : pelotes au bout.');
  assert.equal(kept.image_credit, 'A. Auteur');
  assert.equal(kept.outcome, 'espece');
  assert.equal(kept.plant_id, 12);
  assert.equal(kept.next_key_id, 3);
  // Ancien client : couplet et espèce envoyés vides → l'issue est gardée.
  assert.equal(
    mergeLeadInput({ id: 7, plant_id: null, next_couplet_id: null }, previous).plant_id,
    12,
  );
  // Champ envoyé vide : effacé.
  assert.equal(mergeLeadInput({ id: 7, hint: null }, previous).hint, null);
  assert.equal(mergeLeadInput({ id: 7, imageCredit: '' }, previous).image_credit, '');
  // Issue énoncée : elle remplace l'ancienne en entier.
  const moved = mergeLeadInput({ id: 7, outcome: 'couplet', next_couplet_id: 9 }, previous);
  assert.equal(moved.plant_id, undefined);
  assert.equal(moved.next_key_id, undefined);
  assert.equal(moved.next_couplet_id, 9);
  // Forme historique { plant_id } : le renvoi « pour aller plus loin » est gardé.
  assert.equal(mergeLeadInput({ id: 7, plant_id: 13 }, previous).next_key_id, 3);
  // Sans proposition existante, rien n'est inventé.
  assert.equal(mergeLeadInput({ statement: 'x' }, null).outcome, undefined);
});

test('sérialiseur unique : le crédit suit l’image, le groupe accepte une liste « 1,2 »', () => {
  const noImage = serializeLead({ id: 1, image_credit: 'X', image_licence: 'CC0' });
  assert.equal(noImage.image_url, null);
  assert.equal(noImage.image_credit, null);
  assert.equal(noImage.image_licence, null);
  const group = serializeLead({ id: 2, result_label: 'Rongeurs', group_plant_ids: '4,5' });
  assert.equal(group.outcome, 'groupe');
  assert.deepEqual(group.group_plant_ids, [4, 5]);
  // Renvoi masqué (null) ou laissé tel qu'en base (absent).
  assert.equal(
    serializeLead({ id: 3, plant_id: 1, next_key_id: 8 }, { nextKey: null }).next_key_id,
    null,
  );
  assert.equal(serializeLead({ id: 3, plant_id: 1, next_key_id: 8 }).next_key_id, 8);
});

test('identifiants seuls : identifiants, issues, aide et image inchangés', async () => {
  await putLeads(c1, [
    { statement: 'Poils', outcome: 'clade', clade_id: cladeId, next_key_id: otherKeyId },
    { statement: 'Traces au sol', next_couplet_id: c2 },
  ]).expect(200);
  const first = await putLeads(c2, [
    {
      statement: 'Empreinte à cinq doigts',
      hint: 'Compter les pelotes.',
      image_url: '/uploads/empreinte.jpg',
      image_credit: 'Marie Curie',
      image_licence: 'CC BY-SA 4.0',
      plant_id: plants[0],
      next_key_id: otherKeyId,
    },
    {
      statement: 'Crottes en chapelet',
      outcome: 'groupe',
      result_label: 'Petits rongeurs',
      clade_id: cladeId,
      group_plant_ids: [plants[1], plants[2]],
    },
    { statement: 'Terrier', plant_id: plants[0] },
  ]).expect(200);
  const ids = first.body.leads.map((l) => l.id);
  assert.equal(ids.length, 3);

  // Le cas du 20/11 : trois propositions renvoyées avec leur seul identifiant.
  const again = await putLeads(
    c2,
    ids.map((id) => ({ id })),
  ).expect(200);
  assert.deepEqual(
    again.body.leads.map((l) => l.id),
    ids,
    'aucun identifiant recréé',
  );
  const strip = (l) => ({ ...l });
  assert.deepEqual(again.body.leads.map(strip), first.body.leads.map(strip), 'rien n’a changé');
  const [species, group] = again.body.leads;
  assert.equal(species.plant_id, plants[0]);
  assert.equal(species.next_key_id, otherKeyId);
  assert.equal(species.hint, 'Compter les pelotes.');
  assert.equal(species.image_credit, 'Marie Curie');
  assert.equal(species.image_licence, 'CC BY-SA 4.0');
  assert.equal(group.outcome, 'groupe');
  assert.deepEqual(group.group_plant_ids, [plants[1], plants[2]]);
  assert.equal(group.clade_id, cladeId);

  // Couplet de départ : feuille clade et renvoi vers un couplet, identifiants seuls aussi.
  const start = await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200);
  const startLeads = start.body.couplets.find((c) => c.id === c1).leads;
  const startAgain = await putLeads(
    c1,
    startLeads.map((l) => ({ id: l.id })),
  ).expect(200);
  assert.deepEqual(startAgain.body.leads, startLeads);
});

test('énoncé seul modifié : même identifiant, issue gardée ; issue énoncée : remplacée', async () => {
  const before = (await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200)).body;
  const leads = before.couplets.find((c) => c.id === c2).leads;
  const res = await putLeads(c2, [
    { id: leads[0].id, statement: 'Empreinte à cinq doigts, griffes visibles' },
    { id: leads[1].id },
    // La feuille « espèce » devient un groupe : l'ancienne issue ne traîne pas.
    {
      id: leads[2].id,
      outcome: 'groupe',
      result_label: 'Fouisseurs',
      group_plant_ids: [plants[0], plants[1]],
    },
  ]).expect(200);
  assert.deepEqual(
    res.body.leads.map((l) => l.id),
    leads.map((l) => l.id),
  );
  assert.equal(res.body.leads[0].statement, 'Empreinte à cinq doigts, griffes visibles');
  assert.equal(res.body.leads[0].plant_id, plants[0]);
  assert.equal(res.body.leads[2].outcome, 'groupe');
  assert.equal(res.body.leads[2].plant_id, null);
  assert.equal(res.body.leads[2].statement, 'Terrier', 'énoncé non renvoyé : gardé');
  // La contrainte chk_idkey_lead_outcome tient : la ligne en base est cohérente.
  const row = await queryOne(
    'SELECT outcome, plant_id, result_label, clade_id FROM id_key_leads WHERE id = ?',
    [leads[2].id],
  );
  assert.equal(row.outcome, 'groupe');
  assert.equal(row.result_label, 'Fouisseurs');
  assert.equal(row.clade_id, null);
});

test('retrait : une proposition absente de la liste est supprimée, les autres gardent leur identifiant', async () => {
  const leads = (
    await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200)
  ).body.couplets.find((c) => c.id === c2).leads;
  const res = await putLeads(c2, [
    { id: leads[0].id },
    { id: leads[1].id },
    { statement: 'Nid de feuilles', plant_id: plants[2] },
  ]).expect(200);
  const ids = res.body.leads.map((l) => l.id);
  assert.deepEqual(ids.slice(0, 2), [leads[0].id, leads[1].id]);
  assert.ok(!ids.includes(leads[2].id), 'proposition retirée');
  assert.ok(ids[2] > leads[2].id, 'proposition sans id : créée');
  assert.equal(
    await queryOne('SELECT id FROM id_key_leads WHERE id = ?', [leads[2].id]),
    undefined,
  );
  const orphans = await queryAll('SELECT plant_id FROM id_key_lead_plants WHERE lead_id = ?', [
    leads[2].id,
  ]);
  assert.equal(orphans.length, 0, 'espèces candidates de la proposition retirée supprimées');
  // Toujours au moins deux propositions.
  await putLeads(c2, [{ id: leads[0].id }]).expect(400);
});

test('identifiant inconnu, d’un autre couplet ou en double : refusé sans rien écrire', async () => {
  const bundle = (await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200)).body;
  const own = bundle.couplets.find((c) => c.id === c2).leads;
  const foreign = bundle.couplets.find((c) => c.id === c1).leads[0];
  const unknown = await putLeads(c2, [{ id: own[0].id }, { id: 999999999, statement: 'X' }]).expect(
    400,
  );
  assert.match(unknown.body.error, /introuvable dans ce couplet/);
  await putLeads(c2, [{ id: own[0].id }, { id: foreign.id }]).expect(400);
  const twice = await putLeads(c2, [{ id: own[0].id }, { id: own[0].id }]).expect(400);
  assert.match(twice.body.error, /deux fois/);
  // Proposition nouvelle sans issue : toujours refusée.
  await putLeads(c2, [{ id: own[0].id }, { statement: 'Sans issue' }]).expect(400);
  const after = (await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200)).body;
  assert.deepEqual(after.couplets.find((c) => c.id === c2).leads, own, 'rien n’a été écrit');
});

test('crédit des images : écrit, relu, effacé avec l’image, refusé trop long', async () => {
  const leads = (
    await request(app).get(`/api/id-keys/${keyId}`).set(auth()).expect(200)
  ).body.couplets.find((c) => c.id === c2).leads;
  // Alias camelCase acceptés ; crédit modifié seul, l'image reste.
  const res = await putLeads(c2, [
    { id: leads[0].id, imageCredit: 'Jean Rostand', imageLicence: 'CC BY 4.0' },
    { id: leads[1].id, image_url: '/uploads/crottes.jpg' },
    { id: leads[2].id },
  ]).expect(200);
  assert.equal(res.body.leads[0].image_url, '/uploads/empreinte.jpg');
  assert.equal(res.body.leads[0].image_credit, 'Jean Rostand');
  assert.equal(res.body.leads[0].image_licence, 'CC BY 4.0');
  assert.equal(res.body.leads[1].image_url, '/uploads/crottes.jpg');
  assert.equal(res.body.leads[1].image_credit, null, 'image sans crédit');

  // Lecture élève (clé publiée) : le crédit est servi avec l'image.
  await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ is_published: true })
    .expect(200);
  const pub = await request(app).get(`/api/id-keys/inplace-${stamp}`).expect(200);
  const shown = pub.body.couplets.flatMap((c) => c.leads).find((l) => l.id === leads[0].id);
  assert.equal(shown.image_credit, 'Jean Rostand');
  assert.equal(shown.image_licence, 'CC BY 4.0');

  // Image retirée : son crédit part avec elle.
  const cleared = await putLeads(c2, [
    { id: leads[0].id, image_url: null },
    { id: leads[1].id },
    { id: leads[2].id },
  ]).expect(200);
  assert.equal(cleared.body.leads[0].image_url, null);
  assert.equal(cleared.body.leads[0].image_credit, null);
  assert.equal(cleared.body.leads[0].image_licence, null);
  const row = await queryOne('SELECT image_credit, image_licence FROM id_key_leads WHERE id = ?', [
    leads[0].id,
  ]);
  assert.equal(row.image_credit, null);
  assert.equal(row.image_licence, null);

  await putLeads(c2, [
    { id: leads[0].id, image_url: '/uploads/a.jpg', image_credit: 'x'.repeat(256) },
    { id: leads[1].id },
    { id: leads[2].id },
  ]).expect(400);
  await putLeads(c2, [
    { id: leads[0].id, image_url: '/uploads/a.jpg', image_licence: 'y'.repeat(65) },
    { id: leads[1].id },
    { id: leads[2].id },
  ]).expect(400);
});
