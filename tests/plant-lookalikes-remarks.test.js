'use strict';

// Sosies (`plant_lookalikes`) et remarques en une seule zone de texte (`plants.remarks`) —
// migration 305, piste C de l'audit du 25/09/2026 (§ 1.3.6, § 2.3, § 3.5).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  pool,
  initSchema,
  queryAll,
  queryOne,
  execute,
  splitSqlStatements,
} = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const remarks = require('../lib/biodiv/plantRemarks');
const lookalikes = require('../lib/biodiv/plantLookalikes');
const { buildPlantPayload } = require('../lib/plantsRouteHelpers');

const STAMP = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

describe('remarques — logique pure', () => {
  test('concaténation des anciens champs, vides ignorés', () => {
    assert.equal(
      remarks.legacyRemarksText({ remark_1: ' A ', remark_2: '', remark_3: 'C' }),
      'A\n\nC',
    );
    assert.equal(remarks.legacyRemarksText({}), null);
  });

  test('lecture : champ unique, repli sur les anciens champs', () => {
    const row = { remarks: 'A\n\nC', remark_1: 'A', remark_3: 'C' };
    assert.deepEqual(remarks.resolvePlantRemarks(row), { remarks: 'A\n\nC', origin: 'table' });
    // Remarques non reprises (fiche écrite par l'ancien code).
    assert.deepEqual(remarks.resolvePlantRemarks({ remarks: null, remark_2: 'B' }), {
      remarks: 'B',
      origin: 'colonnes',
    });
    // Ancien champ réécrit sans le nouveau (retour arrière du code).
    assert.equal(
      remarks.resolvePlantRemarks({ ...row, remark_1: 'A modifiée' }).origin,
      'colonnes',
    );
    assert.deepEqual(remarks.resolvePlantRemarks({}), { remarks: null, origin: 'table' });
  });

  test('écriture : miroir sûr (anciens champs intacts si inchangés, sinon remark_1)', () => {
    const existing = { name: 'X', remark_1: 'A', remark_2: null, remark_3: 'C', remarks: 'A\n\nC' };
    const same = buildPlantPayload({ name: 'X', remarks: 'A\n\nC' }, existing);
    assert.deepEqual(
      [same.remarks, same.remark_1, same.remark_2, same.remark_3],
      ['A\n\nC', 'A', null, 'C'],
    );
    const edited = buildPlantPayload({ name: 'X', remarks: 'Tout nouveau\n\nTexte' }, existing);
    assert.deepEqual(
      [edited.remarks, edited.remark_1, edited.remark_2, edited.remark_3],
      ['Tout nouveau\n\nTexte', 'Tout nouveau\n\nTexte', null, null],
    );
    const cleared = buildPlantPayload({ name: 'X', remarks: '  ' }, existing);
    assert.deepEqual(
      [cleared.remarks, cleared.remark_1, cleared.remark_2, cleared.remark_3],
      [null, null, null, null],
    );
    // Client historique / import : anciens champs seulement → concaténation.
    const legacy = buildPlantPayload({ name: 'X', remark_2: 'B' }, existing);
    assert.equal(legacy.remarks, 'A\n\nB\n\nC');
    // Ni l'un ni l'autre : inchangé.
    assert.equal(buildPlantPayload({ name: 'X' }, existing).remarks, 'A\n\nC');
  });
});

describe('sosies — logique pure', () => {
  test('paire canonique et normalisation', () => {
    assert.deepEqual(lookalikes.canonicalPair(9, 3), [3, 9]);
    assert.deepEqual(
      lookalikes.normalizeClientLookalikes(
        [
          { plant_id: 4, note: ' Latex amer ' },
          { plant_id: 7 },
          { plant_id: 4, note: 'Autre note' },
          { plant_id: 5 },
          { plant_id: '' },
        ],
        5,
      ),
      {
        entries: [
          { plant_id: 4, note: 'Autre note' },
          { plant_id: 7, note: null },
        ],
      },
    );
    assert.match(lookalikes.normalizeClientLookalikes({}).error, /liste/);
    assert.match(lookalikes.normalizeClientLookalikes([{ plant_id: 'x' }]).error, /invalide/);
  });

  test('vue depuis chaque fiche : l’autre fiche de la paire', () => {
    const rows = [
      { plant_id: 2, lookalike_plant_id: 9, note: 'n', a_name: 'Laitue', b_name: 'Laitue vireuse' },
    ];
    assert.deepEqual(lookalikes.lookalikesForPlant(rows, 2), [
      { plant_id: 9, name: 'Laitue vireuse', emoji: null, note: 'n' },
    ]);
    assert.deepEqual(lookalikes.lookalikesForPlant(rows, 9), [
      { plant_id: 2, name: 'Laitue', emoji: null, note: 'n' },
    ]);
    assert.deepEqual(lookalikes.lookalikesForPlant(rows, 5), []);
  });
});

describe('sosies et remarques — base et API', () => {
  let token;
  const ids = [];

  before(async () => {
    await initSchema();
    token = await ensureAdminTeacherAuthToken();
  });

  after(async () => {
    for (const id of ids) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  });

  async function create(body) {
    const res = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    ids.push(res.body.id);
    return res.body;
  }

  async function listRow(id) {
    const res = await request(app).get('/api/plants').expect(200);
    return res.body.find((p) => Number(p.id) === Number(id));
  }

  test('migration 305 — colonne, reprise des remarques, table, idempotence, contrôle T3', async () => {
    const legacy = await execute(
      "INSERT INTO plants (name, emoji, remark_1, remark_2, remark_3) VALUES (?, '🌿', ?, ?, ?)",
      [`M305 ${STAMP}`, '', 'Deuxième.', 'Troisième.'],
    );
    ids.push(legacy.insertId);
    const kept = await execute(
      "INSERT INTO plants (name, emoji, remark_1, remarks) VALUES (?, '🌿', ?, ?)",
      [`M305 gardée ${STAMP}`, 'Ancien', 'Déjà saisi'],
    );
    ids.push(kept.insertId);
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '305_plant_lookalikes_remarks.sql'),
      'utf8',
    );
    const run = async () => {
      for (const stmt of splitSqlStatements(sql)) {
        try {
          await pool.query(stmt);
        } catch (err) {
          if (err.errno !== 1060) throw err;
        }
      }
    };
    await run();
    await run();
    const row = await queryOne('SELECT remarks FROM plants WHERE id = ?', [legacy.insertId]);
    assert.equal(row.remarks, 'Deuxième.\n\nTroisième.');
    const keptRow = await queryOne('SELECT remarks FROM plants WHERE id = ?', [kept.insertId]);
    assert.equal(keptRow.remarks, 'Déjà saisi');
    const table = await queryOne(
      `SELECT COUNT(*) AS c FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'plant_lookalikes'`,
    );
    assert.equal(Number(table.c), 1);

    // Contrôle de passage au T3 pour la fiche reprise : même nombre de fiches à remarque, et
    // lecture sans repli.
    const t3 = await queryOne(
      `SELECT COUNT(*) AS c FROM plants
        WHERE id = ? AND COALESCE(remarks, '') <> COALESCE(CONCAT_WS(CONCAT(CHAR(10), CHAR(10)),
              NULLIF(TRIM(remark_1),''), NULLIF(TRIM(remark_2),''), NULLIF(TRIM(remark_3),'')), '')`,
      [legacy.insertId],
    );
    assert.equal(Number(t3.c), 0);
    assert.equal((await listRow(legacy.insertId)).remarks_origin, 'table');
    // La fiche « déjà saisie » ne correspond pas à ses anciens champs : repli visible.
    assert.equal((await listRow(kept.insertId)).remarks_origin, 'colonnes');
  });

  test('remarques : zone unique, miroir, repli', async () => {
    const plant = await create({
      name: `Remarques ${STAMP}`,
      remark_1: 'Un.',
      remark_3: 'Trois.',
    });
    assert.equal(plant.remarks, 'Un.\n\nTrois.');
    assert.equal(plant.remarks_origin, 'table');

    // Texte inchangé renvoyé par le formulaire : anciens champs intacts.
    await request(app)
      .put(`/api/plants/${plant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: plant.name, remarks: 'Un.\n\nTrois.' })
      .expect(200);
    let cols = await queryOne('SELECT remark_1, remark_2, remark_3 FROM plants WHERE id = ?', [
      plant.id,
    ]);
    assert.deepEqual([cols.remark_1, cols.remark_2, cols.remark_3], ['Un.', null, 'Trois.']);

    // Texte modifié : tout le texte dans remark_1, les deux autres vidés.
    const edited = await request(app)
      .put(`/api/plants/${plant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: plant.name, remarks: 'Un.\n\nDeux.\n\nTrois.' })
      .expect(200);
    assert.equal(edited.body.remarks, 'Un.\n\nDeux.\n\nTrois.');
    cols = await queryOne('SELECT remark_1, remark_2, remark_3 FROM plants WHERE id = ?', [
      plant.id,
    ]);
    assert.deepEqual(
      [cols.remark_1, cols.remark_2, cols.remark_3],
      ['Un.\n\nDeux.\n\nTrois.', null, null],
    );

    // Ancien code après retour arrière : remark_2 écrit seul → la fiche le montre (repli).
    await execute('UPDATE plants SET remark_2 = ? WHERE id = ?', ['Ajout ancien code.', plant.id]);
    const row = await listRow(plant.id);
    assert.equal(row.remarks_origin, 'colonnes');
    assert.equal(row.remarks, 'Un.\n\nDeux.\n\nTrois.\n\nAjout ancien code.');
  });

  test('sosies : paire symétrique, note, retrait, cascade, refus', async () => {
    const laitue = await create({ name: `Laitue ${STAMP}` });
    const vireuse = await create({ name: `Laitue vireuse ${STAMP}`, emoji: '⚠️' });
    const autre = await create({ name: `Pissenlit sosie ${STAMP}` });

    const res = await request(app)
      .put(`/api/plants/${vireuse.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: vireuse.name,
        lookalikes: [
          { plant_id: laitue.id, note: 'Latex amer, nervure épineuse.' },
          { plant_id: vireuse.id, note: 'soi-même : ignoré' },
        ],
      })
      .expect(200);
    assert.deepEqual(res.body.lookalikes, [
      {
        plant_id: Number(laitue.id),
        name: laitue.name,
        emoji: laitue.emoji,
        note: 'Latex amer, nervure épineuse.',
      },
    ]);
    // Une seule ligne, dans l'ordre canonique ; visible depuis l'autre fiche.
    const pairs = await queryAll(
      'SELECT plant_id, lookalike_plant_id, note FROM plant_lookalikes WHERE plant_id IN (?, ?)',
      [laitue.id, vireuse.id],
    );
    assert.deepEqual(
      pairs.map((p) => [Number(p.plant_id), Number(p.lookalike_plant_id)]),
      [[Math.min(laitue.id, vireuse.id), Math.max(laitue.id, vireuse.id)]],
    );
    const fromLaitue = await listRow(laitue.id);
    assert.deepEqual(
      fromLaitue.lookalikes.map((l) => [l.plant_id, l.name, l.note]),
      [[Number(vireuse.id), vireuse.name, 'Latex amer, nervure épineuse.']],
    );

    // Depuis la laitue : on ajoute le pissenlit, on garde la vireuse avec une autre note.
    await request(app)
      .put(`/api/plants/${laitue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: laitue.name,
        lookalikes: [
          { plant_id: vireuse.id, note: 'Latex amer.' },
          { plant_id: autre.id, note: null },
        ],
      })
      .expect(200);
    assert.deepEqual(
      (await listRow(vireuse.id)).lookalikes.map((l) => [l.plant_id, l.note]),
      [[Number(laitue.id), 'Latex amer.']],
    );
    assert.equal((await listRow(autre.id)).lookalikes.length, 1);

    // Retrait depuis l'autre côté de la paire.
    await request(app)
      .put(`/api/plants/${autre.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: autre.name, lookalikes: [] })
      .expect(200);
    assert.deepEqual(
      (await listRow(laitue.id)).lookalikes.map((l) => l.plant_id),
      [Number(vireuse.id)],
    );

    // Un PUT sans `lookalikes` ne touche à rien.
    await request(app)
      .put(`/api/plants/${laitue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: laitue.name, description: 'x' })
      .expect(200);
    assert.equal((await listRow(laitue.id)).lookalikes.length, 1);

    // Fiche inconnue : refus, rien d'écrit.
    const bad = await request(app)
      .put(`/api/plants/${laitue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: laitue.name, lookalikes: [{ plant_id: 99999999 }] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /introuvable/);
    assert.equal((await listRow(laitue.id)).lookalikes.length, 1);

    // Création avec sosies.
    const neuve = await create({
      name: `Sosie à la création ${STAMP}`,
      lookalikes: [{ plant_id: laitue.id, note: 'Feuilles plus fines.' }],
    });
    assert.equal(neuve.lookalikes[0].plant_id, Number(laitue.id));

    // Suppression d'une fiche : ses paires partent avec elle.
    await request(app)
      .delete(`/api/plants/${vireuse.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.deepEqual(
      (await listRow(laitue.id)).lookalikes.map((l) => l.plant_id),
      [Number(neuve.id)],
    );
  });
});
