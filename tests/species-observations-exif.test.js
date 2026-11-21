'use strict';

/**
 * Photos d'observation — retrait des métadonnées (EXIF, position GPS, modèle d'appareil).
 *
 * `docs/API.md` l'annonce pour `POST /api/species-observations/:id/photos`. Le retrait est
 * fait à l'écriture par `lib/uploads.js` (commun à tous les envois, non modifié ici) : ce
 * fichier vérifie qu'il s'applique bien aux photos d'observation, de bout en bout — une photo
 * prise au téléphone par un élève mineur ne doit jamais garder sa position.
 *
 * Vérifié sur le fichier écrit ET sur les octets servis par l'API, pour JPEG, PNG et WebP.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const request = require('supertest');
const sharp = require('sharp');

const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { getAbsolutePath } = require('../lib/uploads');
const fx = require('./helpers/fmFixtures');

const stamp = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
/** Valeurs reconnaissables, cherchées ensuite dans les octets. */
const CAMERA_MAKE = `FabricantTemoin${stamp}`;
const CAMERA_MODEL = `TelephoneTemoin${stamp}`;

let mapId;
let student;
let observationId;

const EXIF_TAGS = {
  IFD0: { Make: CAMERA_MAKE, Model: CAMERA_MODEL, Software: 'AppareilPhoto 1.0' },
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '33/1 35/1 0/1',
    GPSLongitudeRef: 'W',
    GPSLongitude: '7/1 35/1 0/1',
  },
};

function base(size = 48) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 30, g: 120, b: 60 } },
  });
}

/** Image d'un format donné, portant position GPS et modèle d'appareil. */
async function photoWithGps(format) {
  const buf = await base()[format]().withExif(EXIF_TAGS).toBuffer();
  const meta = await sharp(buf).metadata();
  assert.ok(meta.exif, `${format} : le fichier d’essai porte bien des métadonnées EXIF`);
  assert.ok(buf.includes(Buffer.from(CAMERA_MODEL)), `${format} : modèle présent avant envoi`);
  const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function assertClean(buffer, label) {
  for (const needle of [CAMERA_MAKE, CAMERA_MODEL, 'AppareilPhoto']) {
    assert.equal(buffer.includes(Buffer.from(needle)), false, `${label} : « ${needle} » retiré`);
  }
}

async function assertNoMetadata(buffer, label) {
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.exif, undefined, `${label} : aucun bloc EXIF (donc aucune position GPS)`);
  assert.equal(meta.xmp, undefined, `${label} : aucun bloc XMP`);
  assert.equal(meta.iptc, undefined, `${label} : aucun bloc IPTC`);
  assertClean(buffer, label);
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test.before(async () => {
  await initSchema();
  mapId = (await fx.createMap({ label: `Carte EXIF ${stamp}` })).id;
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, auth_provider, is_active,
       created_at, updated_at)
     VALUES (?, 'student', 'Exif', ?, ?, 'local', 1, NOW(), NOW())`,
    [id, `Eleve${stamp}`, `Exif Eleve${stamp}`],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    ['student', id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  student = {
    id,
    token: await signAuthToken({
      product: 'foret',
      userType: 'student',
      userId: id,
      roleSlug: 'eleve_novice',
    }),
  };
  const created = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: mapId, text: 'Photos avec position' })
    .expect(201);
  observationId = created.body.observation.id;
});

test.after(async () => {
  if (observationId) {
    await request(app)
      .delete(`/api/species-observations/${observationId}`)
      .set('Authorization', `Bearer ${student.token}`);
  }
  await execute('DELETE FROM users WHERE id = ?', [student.id]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
});

for (const format of ['jpeg', 'png', 'webp']) {
  test(`${format} : position GPS et modèle d’appareil retirés du fichier écrit et du fichier servi`, async () => {
    const uploaded = await request(app)
      .post(`/api/species-observations/${observationId}/photos`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ imageData: await photoWithGps(format) })
      .expect(201);

    const row = await queryOne(
      'SELECT file_path, mime_type, byte_size FROM species_observation_photos WHERE id = ?',
      [uploaded.body.photo.id],
    );
    const abs = getAbsolutePath(row.file_path);
    const onDisk = fs.readFileSync(abs);
    await assertNoMetadata(onDisk, `${format}, fichier écrit`);
    assert.equal(Number(row.byte_size), onDisk.length, 'taille enregistrée = fichier nettoyé');

    const served = await request(app)
      .get(uploaded.body.photo.url)
      .set('Authorization', `Bearer ${student.token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    assert.ok(Buffer.isBuffer(served.body) && served.body.length > 0);
    await assertNoMetadata(served.body, `${format}, fichier servi`);
    assert.equal(served.body.equals(onDisk), true, 'le fichier servi est le fichier nettoyé');

    // L'image reste une image lisible, aux mêmes dimensions.
    const meta = await sharp(onDisk).metadata();
    assert.equal(meta.width, 48);
    assert.equal(meta.height, 48);

    await request(app)
      .delete(`/api/species-observations/${observationId}/photos/${uploaded.body.photo.id}`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    assert.equal(fs.existsSync(abs), false);
  });
}

test('une image illisible est refusée : rien n’est écrit sans avoir été nettoyé', async () => {
  // En-tête JPEG valide, contenu tronqué : ni nettoyable, ni vérifiable.
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(64, 0x41)]);
  const before = await queryOne(
    'SELECT COUNT(*) AS n FROM species_observation_photos WHERE observation_id = ?',
    [observationId],
  );
  const res = await request(app)
    .post(`/api/species-observations/${observationId}/photos`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ imageData: `data:image/jpeg;base64,${broken.toString('base64')}` });
  assert.ok(res.status >= 400 && res.status < 500, `refus attendu, reçu ${res.status}`);
  const after = await queryOne(
    'SELECT COUNT(*) AS n FROM species_observation_photos WHERE observation_id = ?',
    [observationId],
  );
  assert.equal(Number(after.n), Number(before.n), 'aucune ligne de photo créée');
});
