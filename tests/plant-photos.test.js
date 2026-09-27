'use strict';

// Photos des fiches espèces — table `plant_photos` (migration 302), piste C de l'audit du
// 25/09/2026 (§ 1.3.6, § 2.3, § 3.5). Temps 1 : la fiche lit la table, avec repli sur les
// colonnes ; temps 2 : formulaire, téléversement et import écrivent la table (crédit et
// licence compris) et tiennent les anciennes colonnes en miroir.

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  initSchema,
  queryAll,
  queryOne,
  execute,
  withTransaction,
  splitSqlStatements,
} = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const photos = require('../lib/biodiv/plantPhotos');
const speciesRelations = require('../lib/biodiv/speciesRelations');

const STAMP = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const U = (name) => `https://upload.wikimedia.org/wikipedia/commons/a/aa/${name}.jpg`;

describe('plantPhotos — logique pure', () => {
  test('photoRowsFromColumns : découpe, ordre, attribution du même fichier', () => {
    const rows = photos.photoRowsFromColumns({
      photo: U('Main'),
      photo_species: `${U('Main')}\n${U('Second')}, ${U('Third')}`,
      photo_flower: '/uploads/plants/1/photo_flower-1.jpg',
      photo_credit: 'Auteur',
      photo_licence: 'CC BY 4.0',
    });
    assert.deepEqual(
      rows.map((r) => [r.kind, r.sort_order, r.credit, r.licence, r.source]),
      [
        ['photo', 0, 'Auteur', 'CC BY 4.0', 'wikimedia_commons'],
        ['photo_species', 0, 'Auteur', 'CC BY 4.0', 'wikimedia_commons'],
        ['photo_species', 1, null, null, 'wikimedia_commons'],
        ['photo_species', 2, null, null, 'wikimedia_commons'],
        ['photo_flower', 0, null, null, 'televersement'],
      ],
    );
  });

  test('photoRowsFromColumns garde l’attribution connue d’une même photo', () => {
    const rows = photos.photoRowsFromColumns({ photo_leaf: U('Leaf') }, [
      { id: 9, kind: 'photo_leaf', url: U('Leaf'), credit: 'Moi', licence: 'CC0', source: 'x' },
    ]);
    assert.equal(rows[0].id, 9);
    assert.equal(rows[0].credit, 'Moi');
    assert.equal(rows[0].licence, 'CC0');
    assert.equal(rows[0].source, 'x');
  });

  test('miroir et contrôle de correspondance', () => {
    const rows = [
      { kind: 'photo_species', url: U('B'), sort_order: 1, credit: null },
      { kind: 'photo', url: U('A'), sort_order: 0, credit: 'X', licence: 'CC0' },
      { kind: 'photo_species', url: U('A'), sort_order: 0 },
    ];
    const mirror = photos.mirrorColumnsFromPhotoRows(rows);
    assert.equal(mirror.photo, U('A'));
    assert.equal(mirror.photo_species, `${U('A')}\n${U('B')}`);
    assert.equal(mirror.photo_leaf, null);
    assert.equal(mirror.photo_credit, 'X');
    assert.equal(mirror.photo_licence, 'CC0');
    assert.equal(photos.photoColumnsMatchRows(mirror, rows), true);
    // Colonne réécrite sans la table (retour arrière du code, migration de contenu…).
    assert.equal(photos.photoColumnsMatchRows({ ...mirror, photo_species: U('A') }, rows), false);
    assert.equal(photos.photoColumnsMatchRows({ ...mirror, photo_credit: 'Y' }, rows), false);
  });

  test('resolvePlantPhotos : table, repli sur colonnes, fiche vide', () => {
    const plant = { photo: U('A'), photo_credit: 'X', photo_licence: 'CC0' };
    const rows = [
      { id: 1, kind: 'photo', url: U('A'), credit: 'X', licence: 'CC0', sort_order: 0 },
    ];
    assert.equal(photos.resolvePlantPhotos(plant, rows).origin, 'table');
    const stale = photos.resolvePlantPhotos({ ...plant, photo: U('Z') }, rows);
    assert.equal(stale.origin, 'colonnes');
    assert.equal(stale.photos[0].url, U('Z'));
    assert.equal(stale.photos[0].credit, 'X');
    assert.equal(stale.columns.photo, U('Z'));
    const noRows = photos.resolvePlantPhotos(plant, []);
    assert.equal(noRows.origin, 'colonnes');
    assert.equal(noRows.photos[0].credit, 'X');
    const empty = photos.resolvePlantPhotos({}, []);
    assert.equal(empty.origin, 'table');
    assert.deepEqual(empty.photos, []);
  });

  test('normalizeClientPhotos : validation, doublons, ordre par emplacement', () => {
    const ok = photos.normalizeClientPhotos(
      [
        { kind: 'photo_leaf', url: U('L1'), credit: ' Anne ', license: 'CC BY 4.0' },
        { kind: 'photo_leaf', url: U('L1') },
        { kind: 'photo_leaf', url: U('L2'), source: 'Wikimedia Commons' },
        { kind: 'photo', url: '  ' },
      ],
      () => null,
    );
    assert.deepEqual(
      ok.rows.map((r) => [r.kind, r.url, r.credit, r.licence, r.source, r.sort_order]),
      [
        ['photo_leaf', U('L1'), 'Anne', 'CC BY 4.0', 'wikimedia_commons', 0],
        ['photo_leaf', U('L2'), null, null, 'wikimedia_commons', 1],
      ],
    );
    assert.match(photos.normalizeClientPhotos([{ kind: 'x', url: U('a') }]).error, /inconnu/);
    assert.match(photos.normalizeClientPhotos('x').error, /liste/);
    assert.match(
      photos.normalizeClientPhotos([{ kind: 'photo', url: U('a'), source_url: 'http://x' }]).error,
      /HTTPS/,
    );
  });

  test('diffPhotoRows : conserve, met à jour, ajoute, retire (doublons compris)', () => {
    const existing = [
      { id: 1, kind: 'photo', url: U('A'), credit: null, sort_order: 0 },
      { id: 2, kind: 'photo_leaf', url: U('L'), credit: 'x', sort_order: 0 },
      { id: 3, kind: 'photo_leaf', url: U('L'), credit: 'x', sort_order: 1 },
      { id: 4, kind: 'photo_fruit', url: U('F'), sort_order: 0 },
    ];
    const wanted = [
      { kind: 'photo', url: U('A'), credit: 'Anne', sort_order: 0 },
      { kind: 'photo_leaf', url: U('L'), credit: 'x', sort_order: 0 },
      { kind: 'photo_flower', url: U('N'), sort_order: 0 },
    ];
    const diff = photos.diffPhotoRows(existing, wanted);
    assert.deepEqual(
      diff.update.map((r) => [r.id, r.credit]),
      [[1, 'Anne']],
    );
    assert.deepEqual(
      diff.insert.map((r) => r.url),
      [U('N')],
    );
    assert.deepEqual(diff.remove.sort(), [3, 4]);
  });

  test('insertPhotoRow : en tête ou en fin de l’emplacement, sans doublon', () => {
    const base = [
      { kind: 'photo', url: U('A'), sort_order: 0 },
      { kind: 'photo', url: U('B'), sort_order: 1 },
    ];
    const first = photos.insertPhotoRow(base, { kind: 'photo', url: U('C') }, 'prepend');
    assert.deepEqual(
      first.map((r) => [r.url, r.sort_order]),
      [
        [U('C'), 0],
        [U('A'), 1],
        [U('B'), 2],
      ],
    );
    assert.equal(photos.insertPhotoRow(base, { kind: 'photo', url: U('A') }).length, 2);
  });
});

describe('plant_photos — base et API', () => {
  let token;
  const ids = [];

  before(async () => {
    await initSchema();
    token = await ensureAdminTeacherAuthToken();
  });

  after(async () => {
    for (const id of ids) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  });

  async function listRow(id) {
    const res = await request(app).get('/api/plants').expect(200);
    return res.body.find((p) => Number(p.id) === Number(id));
  }

  test('migration 302 — table, reprise des colonnes, idempotence, contrôle T3', async () => {
    const table = await queryOne(
      `SELECT COUNT(*) AS c FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'plant_photos'`,
    );
    assert.equal(Number(table.c), 1);

    // Fiche « d'avant la migration » : colonnes remplies, aucune ligne.
    const legacy = await execute(
      `INSERT INTO plants (name, emoji, photo, photo_species, photo_leaf, photo_credit, photo_licence)
       VALUES (?, '🌿', ?, ?, ?, 'Auteur M302', 'CC BY-SA 4.0')`,
      [
        `M302 fiche ${STAMP}`,
        U('M302'),
        `${U('M302')}\r\n${U('M302b')},${U('M302c')}`,
        '/uploads/plants/0/photo_leaf-1.jpg',
      ],
    );
    ids.push(legacy.insertId);
    // Fiche déjà gérée par la table : jamais complétée par ses colonnes.
    const managed = await execute(`INSERT INTO plants (name, emoji, photo) VALUES (?, '🌿', ?)`, [
      `M302 gérée ${STAMP}`,
      U('Col'),
    ]);
    ids.push(managed.insertId);
    await execute(
      `INSERT INTO plant_photos (plant_id, kind, url, sort_order) VALUES (?, 'photo', ?, 0)`,
      [managed.insertId, U('Table')],
    );

    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '302_plant_photos.sql'),
      'utf8',
    );
    const runMigration = async () => {
      for (const stmt of splitSqlStatements(sql)) await execute(stmt);
    };
    await runMigration();
    await runMigration();

    const rows = await queryAll(
      'SELECT kind, url, credit, licence, source, sort_order FROM plant_photos WHERE plant_id = ? ORDER BY kind, sort_order',
      [legacy.insertId],
    );
    assert.deepEqual(
      rows.map((r) => [r.kind, r.url, r.credit, r.licence, r.source, Number(r.sort_order)]),
      [
        ['photo', U('M302'), 'Auteur M302', 'CC BY-SA 4.0', 'wikimedia_commons', 0],
        ['photo_species', U('M302'), 'Auteur M302', 'CC BY-SA 4.0', 'wikimedia_commons', 0],
        ['photo_species', U('M302b'), null, null, 'wikimedia_commons', 1],
        ['photo_species', U('M302c'), null, null, 'wikimedia_commons', 2],
        ['photo_leaf', '/uploads/plants/0/photo_leaf-1.jpg', null, null, 'televersement', 0],
      ],
    );
    const managedRows = await queryAll('SELECT url FROM plant_photos WHERE plant_id = ?', [
      managed.insertId,
    ]);
    assert.deepEqual(
      managedRows.map((r) => r.url),
      [U('Table')],
    );

    // Contrôle de passage au T3 : la découpe du code et celle de la migration coïncident
    // (autant de lignes que de liens), la fiche est lue depuis la table.
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [legacy.insertId]);
    const legacyRows = await queryAll('SELECT * FROM plant_photos WHERE plant_id = ?', [
      legacy.insertId,
    ]);
    const expected = photos.photoRowsFromColumns(plant);
    assert.equal(legacyRows.length, expected.length);
    assert.equal(photos.resolvePlantPhotos(plant, legacyRows).origin, 'table');
  });

  test('PUT photos : liste avec attribution par photo, miroir des colonnes', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Photos API ${STAMP}` })
      .expect(201);
    const id = created.body.id;
    ids.push(id);
    assert.deepEqual(created.body.photos, []);

    const res = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos API ${STAMP}`,
        photos: [
          { kind: 'photo', url: U('P1'), credit: 'Anne', licence: 'CC BY 4.0' },
          {
            kind: 'photo_leaf',
            url: U('L1'),
            credit: 'Bob',
            licence: 'CC BY-SA 3.0',
            source: 'wikipedia',
            source_url: 'https://fr.wikipedia.org/wiki/Test',
          },
          { kind: 'photo_leaf', url: '/uploads/plants/0/photo_leaf-2.jpg' },
        ],
        // Ignorées : la liste fait foi.
        photo: U('Ignored'),
        photo_credit: 'Ignoré',
      })
      .expect(200);
    assert.equal(res.body.photos_origin, 'table');
    assert.equal(res.body.photo, U('P1'));
    assert.equal(res.body.photo_leaf, `${U('L1')}\n/uploads/plants/0/photo_leaf-2.jpg`);
    assert.equal(res.body.photo_credit, 'Anne');
    assert.equal(res.body.photo_licence, 'CC BY 4.0');
    const leaf = res.body.photos.find((p) => p.url === U('L1'));
    assert.equal(leaf.credit, 'Bob');
    assert.equal(leaf.licence, 'CC BY-SA 3.0');
    assert.equal(leaf.source, 'wikipedia');
    assert.equal(leaf.source_url, 'https://fr.wikipedia.org/wiki/Test');

    // Miroir écrit en base : un retour arrière du code relit les mêmes photos.
    const col = await queryOne(
      'SELECT photo, photo_leaf, photo_credit, photo_licence FROM plants WHERE id = ?',
      [id],
    );
    assert.equal(col.photo, U('P1'));
    assert.equal(col.photo_leaf, `${U('L1')}\n/uploads/plants/0/photo_leaf-2.jpg`);
    assert.equal(col.photo_credit, 'Anne');

    // Nouvelle attribution sur une photo existante : même ligne, mise à jour.
    const before = await queryOne(
      'SELECT id FROM plant_photos WHERE plant_id = ? AND kind = ? AND url = ?',
      [id, 'photo_leaf', '/uploads/plants/0/photo_leaf-2.jpg'],
    );
    const put2 = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos API ${STAMP}`,
        photos: res.body.photos.map((p) =>
          p.url === '/uploads/plants/0/photo_leaf-2.jpg'
            ? { ...p, credit: 'Élève de 6e', licence: 'CC BY 4.0' }
            : p,
        ),
      })
      .expect(200);
    const after = put2.body.photos.find((p) => p.url === '/uploads/plants/0/photo_leaf-2.jpg');
    assert.equal(after.id, Number(before.id));
    assert.equal(after.credit, 'Élève de 6e');

    // Un PUT sans photos ni anciennes colonnes ne touche pas aux photos.
    const put3 = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Photos API ${STAMP}`, description: 'Sans photos' })
      .expect(200);
    assert.equal(put3.body.photos.length, 3);

    // Retrait de toutes les photos.
    const cleared = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Photos API ${STAMP}`, photos: [] })
      .expect(200);
    assert.deepEqual(cleared.body.photos, []);
    assert.equal(cleared.body.photo, null);
    assert.equal(cleared.body.photo_credit, null);
  });

  test('PUT photos : liens refusés (HTTP, virgule, emplacement inconnu)', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Photos refus ${STAMP}` })
      .expect(201);
    ids.push(created.body.id);
    const put = (photosList) =>
      request(app)
        .put(`/api/plants/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Photos refus ${STAMP}`, photos: photosList });
    const http = await put([{ kind: 'photo', url: 'http://example.org/a.jpg' }]);
    assert.equal(http.status, 400);
    assert.match(http.body.error, /HTTPS/);
    const comma = await put([{ kind: 'photo', url: U('a,b') }]);
    assert.equal(comma.status, 400);
    assert.match(comma.body.error, /virgule/);
    const kind = await put([{ kind: 'photo_root', url: U('a') }]);
    assert.equal(kind.status, 400);
  });

  test('client historique : anciennes colonnes → table, attribution connue conservée', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos historique ${STAMP}`,
        photos: [
          { kind: 'photo', url: U('H1'), credit: 'Anne', licence: 'CC0' },
          { kind: 'photo_fruit', url: U('F1'), credit: 'Bob', licence: 'CC BY 4.0' },
        ],
      })
      .expect(201);
    const id = created.body.id;
    ids.push(id);
    // L'ancien formulaire renvoie les colonnes, avec un fruit en plus.
    const res = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos historique ${STAMP}`,
        photo: U('H1'),
        photo_fruit: `${U('F1')}\n${U('F2')}`,
        photo_credit: 'Anne',
        photo_licence: 'CC0',
      })
      .expect(200);
    assert.equal(res.body.photos_origin, 'table');
    const f1 = res.body.photos.find((p) => p.url === U('F1'));
    assert.equal(f1.credit, 'Bob');
    const f2 = res.body.photos.find((p) => p.url === U('F2'));
    assert.equal(f2.credit, null);
    assert.equal(f2.sort_order, 1);
  });

  test('repli de lecture : colonnes réécrites sans la table (retour arrière du code)', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos repli ${STAMP}`,
        photos: [{ kind: 'photo_leaf', url: U('R1'), credit: 'Anne', licence: 'CC0' }],
      })
      .expect(201);
    const id = created.body.id;
    ids.push(id);
    // Une version antérieure du code écrit la colonne seule.
    await execute('UPDATE plants SET photo_leaf = ? WHERE id = ?', [`${U('R1')}\n${U('R2')}`, id]);
    const row = await listRow(id);
    assert.equal(row.photos_origin, 'colonnes');
    assert.deepEqual(
      row.photos.map((p) => [p.url, p.credit]),
      [
        [U('R1'), 'Anne'],
        [U('R2'), null],
      ],
    );
    assert.equal(row.photo_leaf, `${U('R1')}\n${U('R2')}`);
  });

  test('téléversement : une ligne de plus, sans attribution ; miroir recalculé', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Photos upload ${STAMP}`,
        photos: [{ kind: 'photo', url: U('Up1'), credit: 'Anne', licence: 'CC0' }],
      })
      .expect(201);
    const id = created.body.id;
    ids.push(id);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const res = await request(app)
      .post(`/api/plants/${id}/photo-upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'photo', imageData: png, position: 'prepend' })
      .expect(200);
    assert.match(res.body.url, /^\/uploads\/plants\//);
    assert.equal(res.body.value, `${res.body.url}\n${U('Up1')}`);
    assert.deepEqual(
      res.body.photos.map((p) => [p.url, p.credit, p.source, p.sort_order]),
      [
        [res.body.url, null, 'televersement', 0],
        [U('Up1'), 'Anne', 'wikimedia_commons', 1],
      ],
    );
    // La nouvelle photo principale n'hérite pas du crédit de l'ancienne.
    const col = await queryOne('SELECT photo_credit FROM plants WHERE id = ?', [id]);
    assert.equal(col.photo_credit, null);
    const row = await listRow(id);
    assert.equal(row.photos_origin, 'table');
  });

  test('import tableur : les colonnes photo alimentent la table', async () => {
    const name = `Photos import ${STAMP}`;
    const res = await request(app)
      .post('/api/plants/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        strategy: 'upsert_name',
        rows: [
          {
            nom: name,
            photo: U('I1'),
            photo_espece: `${U('I1')}\n${U('I2')}`,
            credit_photo: 'Auteur import',
            licence_photo: 'CC BY 4.0',
          },
        ],
      })
      .expect(200);
    assert.equal(res.body.report.totals.created, 1);
    const plant = await queryOne('SELECT id FROM plants WHERE name = ?', [name]);
    ids.push(plant.id);
    const rows = await queryAll(
      'SELECT kind, url, credit FROM plant_photos WHERE plant_id = ? ORDER BY kind, sort_order',
      [plant.id],
    );
    assert.deepEqual(
      rows.map((r) => [r.kind, r.url, r.credit]),
      [
        ['photo', U('I1'), 'Auteur import'],
        ['photo_species', U('I1'), 'Auteur import'],
        ['photo_species', U('I2'), null],
      ],
    );
    // Second import (mise à jour) : pas de doublon.
    await request(app)
      .post('/api/plants/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        strategy: 'upsert_name',
        rows: [{ nom: name, photo: U('I1'), photo_espece: U('I2') }],
      })
      .expect(200);
    const again = await queryAll(
      'SELECT kind, url, credit FROM plant_photos WHERE plant_id = ? ORDER BY kind, sort_order',
      [plant.id],
    );
    assert.deepEqual(
      again.map((r) => [r.kind, r.url, r.credit]),
      [
        ['photo', U('I1'), null],
        ['photo_species', U('I2'), null],
      ],
    );
  });

  test('reconstruction après « remplacer tout » : seules les fiches sans ligne', async () => {
    const bare = await execute(
      `INSERT INTO plants (name, emoji, photo_fruit) VALUES (?, '🌿', ?)`,
      [`Photos rebuild ${STAMP}`, U('Rb')],
    );
    ids.push(bare.insertId);
    await withTransaction((tx) => speciesRelations.rebuildPhotosFromColumns(tx));
    await withTransaction((tx) => speciesRelations.rebuildPhotosFromColumns(tx));
    const rows = await queryAll('SELECT kind, url FROM plant_photos WHERE plant_id = ?', [
      bare.insertId,
    ]);
    assert.deepEqual(
      rows.map((r) => [r.kind, r.url]),
      [['photo_fruit', U('Rb')]],
    );
  });

  test('suppression de la fiche : ses photos partent avec elle', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Photos cascade ${STAMP}`, photos: [{ kind: 'photo', url: U('C1') }] })
      .expect(201);
    await request(app)
      .delete(`/api/plants/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const left = await queryOne('SELECT COUNT(*) AS c FROM plant_photos WHERE plant_id = ?', [
      created.body.id,
    ]);
    assert.equal(Number(left.c), 0);
  });
});
