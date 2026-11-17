'use strict';

// Issues de clés : groupe d'espèces, grand groupe (clade), renvoi vers une autre clé (migration 366).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  validateLeadOutcome,
  assertLeadWellFormed,
  findManipulationInvitation,
} = require('../lib/idKeys');
const { resolveLeadOutcome, isLeadPracticable } = require('../lib/shared/idKeyLeadCore');

const stamp = Date.now();
const cladeId = `clade-test-${stamp}`.slice(0, 64);
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const plants = [];
let keyId = 0;
let otherKeyId = 0;

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  for (const n of ['A', 'B', 'C']) {
    const r = await execute(`INSERT INTO plants (name, emoji, description) VALUES (?, '🦋', 't')`, [
      `Outcome ${n} ${stamp}`,
    ]);
    plants.push(r.insertId);
  }
  await execute(
    `INSERT INTO clades (id, name, shared_attribute, sort_order) VALUES (?, 'Insectes test', 'six pattes', 0)`,
    [cladeId],
  );
});

after(async () => {
  for (const id of [keyId, otherKeyId]) {
    if (id) await execute('DELETE FROM id_keys WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of plants) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  await execute('DELETE FROM clades WHERE id = ?', [cladeId]).catch(() => {});
});

test('cœur pur : déduction et validation des issues', () => {
  assert.equal(resolveLeadOutcome({ next_couplet_id: 3 }), 'couplet');
  assert.equal(resolveLeadOutcome({ plant_id: 3 }), 'espece');
  assert.equal(resolveLeadOutcome({ outcome: 'couplet', plant_id: 3 }), 'espece');
  assert.equal(resolveLeadOutcome({ outcome: 'clade', clade_id: 'x' }), 'clade');
  assert.equal(resolveLeadOutcome({ group_plant_ids: [1, 2], result_label: 'g' }), 'groupe');
  assert.equal(resolveLeadOutcome({}), null);

  assert.equal(
    validateLeadOutcome({ outcome: 'groupe', result_label: 'Mouettes', group_plant_ids: [1] }).ok,
    true,
  );
  assert.equal(validateLeadOutcome({ outcome: 'groupe', group_plant_ids: [1] }).ok, false);
  assert.equal(validateLeadOutcome({ outcome: 'groupe', result_label: 'x' }).ok, false);
  assert.equal(validateLeadOutcome({ outcome: 'clade', clade_id: 'insectes' }).ok, true);
  assert.equal(validateLeadOutcome({ outcome: 'clade' }).ok, false);
  assert.equal(validateLeadOutcome({ outcome: 'clade', clade_id: 'x', plant_id: 2 }).ok, false);
  assert.equal(validateLeadOutcome({ plant_id: 2, next_key_id: 9 }, { keyId: 9 }).ok, false);
  assert.equal(validateLeadOutcome({ plant_id: 2, next_key_id: 9 }, { keyId: 4 }).ok, true);
  assert.equal(validateLeadOutcome({ next_couplet_id: 2, next_key_id: 9 }).ok, false);
  // Contrainte CHECK de la prod (chk_idkey_lead_outcome).
  assert.equal(validateLeadOutcome({ plant_id: 2, clade_id: 'x' }).ok, false);
  assert.equal(validateLeadOutcome({ plant_id: 2, result_label: 'x' }).ok, false);
  assert.equal(
    validateLeadOutcome({ outcome: 'clade', clade_id: 'x', result_label: 'y' }).ok,
    false,
  );

  const coupletIds = new Set([10]);
  assert.equal(isLeadPracticable({ outcome: 'clade', clade_id: 'x' }, coupletIds), true);
  assert.equal(isLeadPracticable({ next_couplet_id: 11 }, coupletIds), false);
  assert.equal(
    assertLeadWellFormed({ statement: 'Six pattes', outcome: 'clade', clade_id: 'x' }, coupletIds),
    null,
  );
});

test('filtre de manipulation : plus de faux positifs « goutte »', () => {
  assert.equal(findManipulationInvitation('Bec en forme de goutte'), null);
  assert.equal(findManipulationInvitation('Le long des gouttières'), null);
  assert.ok(findManipulationInvitation('Goûter le fruit'));
  assert.ok(findManipulationInvitation('Froisser une feuille'));
});

test('API : feuilles groupe / clade / renvoi, conservation et publication', async () => {
  const other = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `suite-${stamp}`, title: 'Clé suite', niveau: 'college' })
    .expect(201);
  otherKeyId = other.body.id;

  const created = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug: `outcomes-${stamp}`, title: 'Clé issues', niveau: 'college' })
    .expect(201);
  keyId = created.body.id;
  const c1 = created.body.couplets[0].id;
  const c2 = (
    await request(app).post(`/api/id-keys/${keyId}/couplets`).set(auth()).send({}).expect(201)
  ).body.id;

  await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ tool_required: ['loupe', 'jumelles'], safety_note: 'Observer sans toucher.' })
    .expect(200);
  await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ tool_required: ['microscope'] })
    .expect(400);

  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c1}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Six pattes', outcome: 'clade', clade_id: cladeId },
        { statement: 'Plus de six pattes', next_couplet_id: c2 },
      ],
    })
    .expect(200);

  const c2res = await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c2}/leads`)
    .set(auth())
    .send({
      leads: [
        {
          statement: 'Ailes colorées',
          outcome: 'groupe',
          result_label: 'Papillons du jardin',
          group_plant_ids: [plants[0], plants[1]],
        },
        {
          statement: 'Ailes transparentes',
          hint: 'Transparentes : on voit à travers.',
          plant_id: plants[2],
          next_key_id: otherKeyId,
        },
      ],
    })
    .expect(200);
  const groupLead = c2res.body.leads.find((l) => l.outcome === 'groupe');
  assert.deepEqual(groupLead.group_plant_ids, [plants[0], plants[1]]);
  assert.equal(groupLead.result_label, 'Papillons du jardin');

  // Ancien client (ou outil MCP) : renvoie seulement id + énoncé → issues conservées.
  const legacy = await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c2}/leads`)
    .set(auth())
    .send({
      leads: c2res.body.leads.map((l) => ({
        id: l.id,
        statement: `${l.statement} (bis)`,
        plant_id: l.plant_id,
        next_couplet_id: l.next_couplet_id,
      })),
    })
    .expect(200);
  const keptGroup = legacy.body.leads.find((l) => l.outcome === 'groupe');
  assert.ok(keptGroup, 'la feuille groupe est conservée');
  assert.equal(keptGroup.group_plants.length, 2);
  const keptSpecies = legacy.body.leads.find((l) => l.outcome === 'espece');
  assert.equal(keptSpecies.next_key_id, otherKeyId);
  assert.equal(keptSpecies.hint, 'Transparentes : on voit à travers.', 'aide conservée');

  // Groupe sans libellé refusé
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${c2}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Ailes colorées', outcome: 'groupe', group_plant_ids: [plants[0]] },
        { statement: 'Ailes transparentes', plant_id: plants[2] },
      ],
    })
    .expect(400);

  await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ is_published: true })
    .expect(200);

  // Élève : le renvoi vers une clé brouillon est masqué
  const pub = await request(app).get(`/api/id-keys/outcomes-${stamp}`).expect(200);
  assert.deepEqual(pub.body.tool_required, ['loupe', 'jumelles']);
  assert.equal(pub.body.safety_note, 'Observer sans toucher.');
  const leads = pub.body.couplets.flatMap((c) => c.leads);
  const clade = leads.find((l) => l.outcome === 'clade');
  assert.equal(clade.clade.name, 'Insectes test');
  assert.equal(leads.find((l) => l.outcome === 'espece').next_key, null);

  const rows = await queryAll(
    `SELECT lp.plant_id FROM id_key_lead_plants lp JOIN id_key_leads l ON l.id = lp.lead_id
      JOIN id_key_couplets c ON c.id = l.couplet_id WHERE c.key_id = ? ORDER BY lp.sort_order`,
    [keyId],
  );
  assert.deepEqual(
    rows.map((r) => Number(r.plant_id)),
    [plants[0], plants[1]],
  );
});
