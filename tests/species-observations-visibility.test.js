'use strict';

/**
 * Observations d'espèces — qui voit un texte ou une photo NON VALIDÉS ?
 *
 * Règle : tant qu'une observation n'est pas validée (soumise, ou refusée), son texte et ses
 * photos ne sont visibles que de son auteur et des validateurs (permission
 * `observations.validate`, sur une carte de leur périmètre). Public : élèves mineurs.
 *
 * Ce que ce fichier protège, route par route :
 * - un autre élève, un enseignant sans la permission, un visiteur et un anonyme n'obtiennent
 *   ni la fiche, ni le fichier photo, ni la file d'examen, ni les relations candidates ;
 * - ils ne peuvent ni ajouter ni retirer une photo, ni supprimer l'observation ;
 * - le fichier n'est jamais servi par `/uploads` (famille privée) ;
 * - le texte ne fuit par aucune liste ouverte aux élèves (catalogue, présence, réseau) ;
 * - un refus ne change rien à ces règles ; l'auteur, lui, lit le refus et sa note.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const sharp = require('sharp');

const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');

const stamp = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
const CANARY = `canari-observation-${stamp}`;
const NOTE_CANARY = `canari-note-${stamp}`;

let adminToken;
let mapId;
let plant;
let author;
let otherStudent;
let teacherNoPermission;
let visitor;
let observationId;
let photo;
const userIds = [];

async function createAccount({ roleSlug = 'eleve_novice', userType = 'student' } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, NULL, 'Vis', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, userType, `Compte${stamp}`, `Vis Compte${stamp}`],
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `rôle ${roleSlug}`);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [userType, id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  clearMapAccessCache();
  userIds.push(id);
  const token = await signAuthToken({ product: 'foret', userType, userId: id, roleSlug });
  return { id, token };
}

async function tinyJpegDataUrl() {
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const as = (account) => ({ Authorization: `Bearer ${account.token}` });

/** Les comptes qui ne doivent rien voir : un autre élève, un enseignant sans la permission. */
function outsiders() {
  return [
    ['autre élève', otherStudent],
    ['enseignant sans la permission', teacherNoPermission],
    ['visiteur', visitor],
  ];
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ extraPermissions: ['observations.validate'] });
  mapId = (await fx.createMap({ label: `Carte visibilité ${stamp}` })).id;
  plant = await fx.createPlant();
  author = await createAccount();
  otherStudent = await createAccount();
  teacherNoPermission = await createAccount({ roleSlug: 'prof_classe', userType: 'teacher' });
  visitor = await createAccount({ roleSlug: 'visiteur' });

  const created = await request(app)
    .post('/api/species-observations')
    .set(as(author))
    .send({ map_id: mapId, plant_id: plant.id, text: `Vue près du compost ${CANARY}` })
    .expect(201);
  observationId = created.body.observation.id;
  const uploaded = await request(app)
    .post(`/api/species-observations/${observationId}/photos`)
    .set(as(author))
    .send({ imageData: await tinyJpegDataUrl() })
    .expect(201);
  photo = uploaded.body.photo;
});

test.after(async () => {
  if (observationId) {
    await request(app)
      .delete(`/api/species-observations/${observationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    await execute('DELETE FROM species_observations WHERE id = ?', [observationId]);
  }
  for (const id of userIds) await execute('DELETE FROM users WHERE id = ?', [id]);
  await execute('DELETE FROM plants WHERE id = ?', [plant.id]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
});

test('le rôle témoin « enseignant sans la permission » n’a pas observations.validate', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
      WHERE r.slug = 'prof_classe' AND rp.permission_key = 'observations.validate'`,
  );
  assert.equal(Number(row.n), 0);
});

test('soumise : l’auteur et le validateur lisent le texte et la photo', async () => {
  for (const headers of [as(author), { Authorization: `Bearer ${adminToken}` }]) {
    const sheet = await request(app)
      .get(`/api/species-observations/${observationId}`)
      .set(headers)
      .expect(200);
    assert.match(sheet.body.observation.text, new RegExp(CANARY));
    assert.equal(sheet.body.observation.photos.length, 1);
    const file = await request(app).get(photo.url).set(headers).expect(200);
    assert.match(String(file.headers['content-type'] || ''), /image/);
    assert.match(String(file.headers['cache-control'] || ''), /private/);
  }
});

test('soumise : personne d’autre ne lit ni la fiche ni la photo', async () => {
  for (const [label, account] of outsiders()) {
    const sheet = await request(app)
      .get(`/api/species-observations/${observationId}`)
      .set(as(account));
    assert.equal(sheet.status, 404, `${label} : fiche`);
    assert.equal(JSON.stringify(sheet.body).includes(CANARY), false);
    const file = await request(app).get(photo.url).set(as(account));
    assert.equal(file.status, 404, `${label} : fichier photo`);
    assert.doesNotMatch(String(file.headers['content-type'] || ''), /image/);

    const mine = await request(app).get('/api/species-observations/me').set(as(account));
    assert.equal(JSON.stringify(mine.body).includes(CANARY), false, `${label} : mes observations`);

    const review = await request(app).get('/api/species-observations/review').set(as(account));
    assert.equal(review.status, 403, `${label} : file d’examen`);
    assert.equal(JSON.stringify(review.body).includes(CANARY), false);
    const candidates = await request(app)
      .get(`/api/species-observations/${observationId}/interactions`)
      .set(as(account));
    assert.equal(candidates.status, 403, `${label} : relations candidates`);
  }
});

test('sans connexion : aucune route ne répond, le fichier n’est pas servi par /uploads', async () => {
  for (const url of [
    `/api/species-observations/${observationId}`,
    photo.url,
    '/api/species-observations/me',
    '/api/species-observations/review',
  ]) {
    const res = await request(app).get(url);
    assert.ok([401, 403].includes(res.status), `${url} → ${res.status}`);
    assert.equal(JSON.stringify(res.body).includes(CANARY), false);
  }
  const stored = await queryOne('SELECT file_path FROM species_observation_photos WHERE id = ?', [
    photo.id,
  ]);
  for (const headers of [{}, as(otherStudent), as(author)]) {
    const direct = await request(app).get(`/uploads/${stored.file_path}`).set(headers);
    assert.equal(direct.status, 403);
    assert.equal(direct.body.code, 'PRIVATE_UPLOAD');
  }
});

test('personne d’autre ne modifie l’observation : ni photo ajoutée ou retirée, ni suppression', async () => {
  for (const [label, account] of outsiders()) {
    const add = await request(app)
      .post(`/api/species-observations/${observationId}/photos`)
      .set(as(account))
      .send({ imageData: await tinyJpegDataUrl() });
    assert.equal(add.status, 404, `${label} : ajout de photo`);
    const removePhoto = await request(app)
      .delete(`/api/species-observations/${observationId}/photos/${photo.id}`)
      .set(as(account));
    assert.equal(removePhoto.status, 404, `${label} : retrait de photo`);
    const remove = await request(app)
      .delete(`/api/species-observations/${observationId}`)
      .set(as(account));
    assert.equal(remove.status, 404, `${label} : suppression`);
    const decide = await request(app)
      .post(`/api/species-observations/${observationId}/decision`)
      .set(as(account))
      .send({ decision: 'validee' });
    assert.equal(decide.status, 403, `${label} : décision`);
  }
  const row = await queryOne(
    `SELECT o.status, (SELECT COUNT(*) FROM species_observation_photos p
                        WHERE p.observation_id = o.id) AS photos
       FROM species_observations o WHERE o.id = ?`,
    [observationId],
  );
  assert.equal(row.status, 'soumise');
  assert.equal(Number(row.photos), 1);
});

test('le texte non validé ne fuit par aucune liste ouverte aux élèves', async () => {
  const urls = [
    '/api/plants',
    `/api/plants/${plant.id}/interactions`,
    `/api/plants/me/observation-counts?plant_ids=${plant.id}`,
    `/api/maps/${encodeURIComponent(mapId)}/species`,
    '/api/food-web',
    `/api/food-web?mapId=${encodeURIComponent(mapId)}`,
    `/api/zones?map_id=${encodeURIComponent(mapId)}`,
    '/api/stats/me',
  ];
  let answered = 0;
  for (const url of urls) {
    const res = await request(app).get(url).set(as(otherStudent));
    if (res.status === 200) answered += 1;
    const body = `${JSON.stringify(res.body)}${res.text || ''}`;
    assert.equal(body.includes(CANARY), false, `${url} ne rend pas le texte de l’observation`);
    assert.equal(body.includes(photo.url), false, `${url} ne rend pas le lien de la photo`);
  }
  assert.ok(answered >= 4, 'les listes interrogées répondent bien');

  // Non validée : l'espèce n'est pas confirmée sur la carte, l'observateur n'y est pas nommé.
  const presence = await request(app)
    .get(`/api/maps/${encodeURIComponent(mapId)}/species`)
    .set(as(otherStudent))
    .expect(200);
  const entry = (presence.body.species || []).find((s) => s.plant_id === plant.id);
  assert.notEqual(entry?.validation_status, 'confirme_site');
  assert.equal(JSON.stringify(presence.body).includes(author.id), false);
});

test('refusée : mêmes règles ; l’auteur lit le refus et sa note', async () => {
  const decided = await request(app)
    .post(`/api/species-observations/${observationId}/decision`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'refusee', note: `Photo floue ${NOTE_CANARY}` })
    .expect(200);
  assert.equal(decided.body.observation.status, 'refusee');

  const mine = await request(app)
    .get(`/api/species-observations/${observationId}`)
    .set(as(author))
    .expect(200);
  assert.equal(mine.body.observation.status, 'refusee');
  assert.match(mine.body.observation.decision_note, new RegExp(NOTE_CANARY));
  await request(app).get(photo.url).set(as(author)).expect(200);

  for (const [label, account] of outsiders()) {
    const sheet = await request(app)
      .get(`/api/species-observations/${observationId}`)
      .set(as(account));
    assert.equal(sheet.status, 404, `${label} : fiche refusée`);
    const body = JSON.stringify(sheet.body);
    assert.equal(body.includes(CANARY) || body.includes(NOTE_CANARY), false);
    const file = await request(app).get(photo.url).set(as(account));
    assert.equal(file.status, 404, `${label} : photo d’une observation refusée`);
  }
  // Un refus ne confirme rien sur la carte.
  const presence = await request(app)
    .get(`/api/maps/${encodeURIComponent(mapId)}/species`)
    .set(as(otherStudent))
    .expect(200);
  assert.equal(
    (presence.body.species || []).some(
      (s) => s.plant_id === plant.id && s.validation_status === 'confirme_site',
    ),
    false,
  );
});
