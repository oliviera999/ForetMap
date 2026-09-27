'use strict';

/**
 * Observations d'espèces validées par un enseignant (migration 307, audit du 25/09/2026
 * § 3.2.4) — invariants du service et contrat HTTP.
 *
 * Ce que chaque groupe de cas garantit :
 * - soumission : statut `soumise`, idempotence `client_uuid` (renvoi et envois simultanés) ;
 * - validation : `map_species` passe à `confirme_site` en une transaction, la première mention
 *   n'écrase jamais une saisie existante, l'audit est écrit, la double validation est sans effet ;
 * - jamais de rétrogradation : un refus ou une suppression ne touchent pas au registre ;
 * - preuves d'interaction : `observe_site` ⇔ au moins une preuve validée ;
 * - photos : fichier et ligne ensemble, EXIF retiré, accès réservé à l'auteur et au validateur ;
 * - HTTP : droits (élève, visiteur, enseignant), périmètre carte, ancien `/api/observations` en 410.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const request = require('supertest');
const sharp = require('sharp');

const database = require('../database');
const { initSchema, queryOne, queryAll, execute, getSyncDomainVersions } = database;
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { getAbsolutePath } = require('../lib/uploads');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');
const service = require('../lib/terrain/observationService');

const stamp = Date.now();
let adminToken;
let adminId;
let mapId;

/** Compte élève novice (ou autre profil) avec son jeton, rattaché à un groupe si demandé. */
async function createAccount({
  roleSlug = 'eleve_novice',
  groupId = null,
  userType = 'student',
} = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, NULL, 'Obs', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, userType, `Eleve${stamp}`, `Obs Eleve${stamp}`],
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `rôle ${roleSlug}`);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [userType, id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  if (groupId) {
    await execute(`INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)`, [
      groupId,
      id,
      userType,
    ]);
  }
  clearMapAccessCache();
  const token = await signAuthToken({ product: 'foret', userType, userId: id, roleSlug });
  return { id, token };
}

async function mapSpeciesRow(map, plantId) {
  return queryOne(
    `SELECT validation_status, DATE_FORMAT(first_record_at, '%Y-%m-%d') AS first_record_at,
            first_record_by, detection_mode, site_notes
       FROM map_species WHERE map_id = ? AND plant_id = ?`,
    [map, plantId],
  );
}

async function createInteraction(fromId, toId, type = 'predation') {
  const res = await execute(
    `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, evidence_level)
     VALUES (?, ?, ?, 'bibliographie')`,
    [fromId, toId, type],
  );
  return res.insertId;
}

async function evidenceLevel(interactionId) {
  const row = await queryOne('SELECT evidence_level FROM species_interactions WHERE id = ?', [
    interactionId,
  ]);
  return row?.evidence_level;
}

async function plainJpeg(size = 32) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
}

async function jpegWithGpsDataUrl() {
  const buf = await sharp(await plainJpeg())
    .withExif({
      IFD0: { Make: 'ACME', Model: 'Telephone X' },
      GPS: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '33/1 35/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '7/1 35/1 0/1',
      },
    })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  assert.ok(meta.exif, 'le fixture porte bien des métadonnées EXIF');
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ extraPermissions: ['observations.validate'] });
  adminId = await getAdminTeacherUserId();
  mapId = (await fx.createMap({ label: `Carte observations ${stamp}` })).id;
});

// --- Service : soumission -----------------------------------------------------------------

test('recordObservation : statut « soumise », date du jour par défaut, lieu vérifié', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  const zone = await fx.createZone({ mapId });
  const { observation, replayed } = await service.recordObservation({
    observerId: student.id,
    mapId,
    zoneId: zone.id,
    plantId: plant.id,
    detectionMode: 'vue',
    text: 'Deux individus sur les feuilles',
  });
  assert.equal(replayed, false);
  assert.equal(observation.status, 'soumise');
  assert.equal(observation.plant_id, plant.id);
  assert.equal(observation.zone_id, zone.id);
  assert.match(observation.observed_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(observation.validated_by, null);

  // Zone d'une autre carte : refus métier (400), jamais une violation de clé étrangère.
  const otherMap = await fx.createMap({ label: `Autre carte ${stamp}` });
  const otherZone = await fx.createZone({ mapId: otherMap.id });
  await assert.rejects(
    service.recordObservation({ observerId: student.id, mapId, zoneId: otherZone.id, text: 'x' }),
    (err) => err.status === 400 && /Zone introuvable/.test(err.message),
  );
  // Ni espèce ni texte : rien à examiner.
  await assert.rejects(
    service.recordObservation({ observerId: student.id, mapId }),
    (err) => err.status === 400,
  );
  // Date dans le futur.
  await assert.rejects(
    service.recordObservation({
      observerId: student.id,
      mapId,
      text: 'x',
      observedAt: '2999-01-01',
    }),
    (err) => err.status === 400,
  );
});

test('recordObservation : idempotence client_uuid (renvoi et envois simultanés)', async () => {
  const student = await createAccount();
  const uuid = crypto.randomUUID();
  const first = await service.recordObservation({
    observerId: student.id,
    mapId,
    text: 'Chant entendu près de la haie',
    detectionMode: 'chant',
    clientUuid: uuid,
  });
  const again = await service.recordObservation({
    observerId: student.id,
    mapId,
    text: 'Chant entendu près de la haie',
    clientUuid: uuid,
  });
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true);
  assert.equal(again.observation.id, first.observation.id);

  const racing = crypto.randomUUID();
  const results = await Promise.all(
    [0, 1, 2].map(() =>
      service.recordObservation({
        observerId: student.id,
        mapId,
        text: 'course',
        clientUuid: racing,
      }),
    ),
  );
  const ids = new Set(results.map((r) => r.observation.id));
  assert.equal(ids.size, 1, 'une seule observation pour trois envois simultanés');
  const count = await queryOne(
    'SELECT COUNT(*) AS n FROM species_observations WHERE observer_user_id = ? AND client_uuid = ?',
    [student.id, racing],
  );
  assert.equal(Number(count.n), 1);

  // La clé d'un autre compte ne rejoue jamais l'observation de quelqu'un d'autre.
  const other = await createAccount();
  const foreign = await service.recordObservation({
    observerId: other.id,
    mapId,
    text: 'même clé, autre compte',
    clientUuid: uuid,
  });
  assert.equal(foreign.replayed, false);
  assert.notEqual(foreign.observation.id, first.observation.id);
});

// --- Service : validation et registre ----------------------------------------------------

test('validateObservation : confirme_site créé, première mention posée, audit écrit', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: plant.id,
    observedAt: '2026-09-20',
    detectionMode: 'trace',
    text: 'Empreintes dans la boue',
  });
  assert.equal(await mapSpeciesRow(mapId, plant.id), undefined);

  const out = await service.validateObservation(observation.id, {
    teacherId: adminId,
    decision: 'validee',
    note: 'Bien vu',
  });
  assert.equal(out.alreadyDecided, false);
  assert.equal(out.observation.status, 'validee');
  assert.equal(out.observation.validated_by, adminId);
  assert.equal(out.observation.decision_note, 'Bien vu');
  assert.ok(out.observation.decided_at);
  assert.deepEqual(out.mapSpecies, {
    map_id: mapId,
    plant_id: plant.id,
    previous_status: null,
    status: 'confirme_site',
    created: true,
  });
  const row = await mapSpeciesRow(mapId, plant.id);
  assert.equal(row.validation_status, 'confirme_site');
  assert.equal(row.first_record_at, '2026-09-20');
  assert.equal(row.first_record_by, student.id);
  assert.equal(row.detection_mode, 'trace');

  const audit = await queryOne(
    `SELECT action, target_id FROM audit_log
      WHERE action = 'validate_species_observation' AND target_id = ? ORDER BY id DESC LIMIT 1`,
    [String(observation.id)],
  );
  assert.ok(audit, 'une entrée d’audit accompagne la validation');
});

test('validateObservation : ligne existante — COALESCE sur la première mention, notes conservées', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  await execute(
    `INSERT INTO map_species (map_id, plant_id, validation_status, first_record_at, first_record_by, site_notes)
     VALUES (?, ?, 'attendu', '2024-05-01', NULL, 'Note éditoriale')`,
    [mapId, plant.id],
  );
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: plant.id,
    observedAt: '2026-09-21',
  });
  const out = await service.validateObservation(observation.id, {
    teacherId: adminId,
    decision: 'validee',
  });
  assert.equal(out.mapSpecies.previous_status, 'attendu');
  assert.equal(out.mapSpecies.created, false);
  const row = await mapSpeciesRow(mapId, plant.id);
  assert.equal(row.validation_status, 'confirme_site');
  assert.equal(row.first_record_at, '2024-05-01', 'une première mention existante est conservée');
  assert.equal(row.first_record_by, student.id, 'un auteur manquant est complété');
  assert.equal(row.site_notes, 'Note éditoriale');
});

test('validateObservation : espèce exigée, corrigeable par l’enseignant ; échec = rien d’écrit', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    text: 'Un oiseau noir au bec jaune',
  });
  await assert.rejects(
    service.validateObservation(observation.id, { teacherId: adminId, decision: 'validee' }),
    (err) => err.status === 400,
  );
  const still = await service.getObservation(observation.id);
  assert.equal(still.status, 'soumise', 'la transaction annulée laisse l’observation soumise');

  const out = await service.validateObservation(observation.id, {
    teacherId: adminId,
    decision: 'validee',
    plantId: plant.id,
  });
  assert.equal(out.observation.plant_id, plant.id);
  assert.equal((await mapSpeciesRow(mapId, plant.id)).validation_status, 'confirme_site');
});

test('double validation : sans effet ; décision contraire : 409', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: plant.id,
  });
  await service.validateObservation(observation.id, { teacherId: adminId, decision: 'validee' });
  const auditsBefore = await queryOne(
    "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'validate_species_observation' AND target_id = ?",
    [String(observation.id)],
  );
  const again = await service.validateObservation(observation.id, {
    teacherId: adminId,
    decision: 'validee',
  });
  assert.equal(again.alreadyDecided, true);
  assert.equal(again.mapSpecies, null);
  const auditsAfter = await queryOne(
    "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'validate_species_observation' AND target_id = ?",
    [String(observation.id)],
  );
  assert.equal(Number(auditsAfter.n), Number(auditsBefore.n), 'pas de seconde entrée d’audit');
  await assert.rejects(
    service.validateObservation(observation.id, { teacherId: adminId, decision: 'refusee' }),
    (err) => err.status === 409 && err.code === 'ALREADY_DECIDED',
  );
});

test('jamais de rétrogradation : refus et suppression laissent confirme_site', async () => {
  const student = await createAccount();
  const plant = await fx.createPlant();
  const first = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: plant.id,
  });
  await service.validateObservation(first.observation.id, {
    teacherId: adminId,
    decision: 'validee',
  });

  const second = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: plant.id,
  });
  const refused = await service.validateObservation(second.observation.id, {
    teacherId: adminId,
    decision: 'refusee',
    note: 'Confusion probable',
  });
  assert.equal(refused.observation.status, 'refusee');
  assert.equal(refused.mapSpecies, null);
  assert.equal((await mapSpeciesRow(mapId, plant.id)).validation_status, 'confirme_site');

  await service.deleteObservation(second.observation.id);
  assert.equal((await mapSpeciesRow(mapId, plant.id)).validation_status, 'confirme_site');

  // Une observation validée est une preuve : elle ne se supprime pas.
  await assert.rejects(
    service.deleteObservation(first.observation.id),
    (err) => err.status === 409,
  );

  // Un refus sur une espèce absente du registre ne crée rien.
  const other = await fx.createPlant();
  const third = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: other.id,
  });
  await service.validateObservation(third.observation.id, {
    teacherId: adminId,
    decision: 'refusee',
  });
  assert.equal(await mapSpeciesRow(mapId, other.id), undefined);
});

// --- Service : preuves d'interaction -----------------------------------------------------

test('observe_site ⇔ au moins une preuve validée', async () => {
  const student = await createAccount();
  const predator = await fx.createPlant({ name: `Coccinelle ${stamp}` });
  const prey = await fx.createPlant({ name: `Puceron ${stamp}` });
  const unrelated = await fx.createPlant();
  const interaction = await createInteraction(predator.id, prey.id);
  const other = await createInteraction(prey.id, unrelated.id, 'herbivorie');

  const obs = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: predator.id,
    text: 'Une coccinelle mange des pucerons',
  });
  // Preuve soumise : rattachée, mais le niveau de preuve ne bouge pas.
  const attached = await service.attachInteractionEvidence(interaction, obs.observation.id, {
    actorId: adminId,
  });
  assert.equal(attached.attached, true);
  assert.equal(attached.upgraded, false);
  assert.equal(await evidenceLevel(interaction), 'bibliographie');

  // Validation : la preuve rattachée fait passer l'interaction à observe_site.
  const out = await service.validateObservation(obs.observation.id, {
    teacherId: adminId,
    decision: 'validee',
  });
  assert.equal(out.interactionsUpgraded, 1);
  assert.equal(await evidenceLevel(interaction), 'observe_site');

  // Rattacher une observation validée : effet immédiat ; rattacher deux fois : sans effet.
  const preyObs = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: prey.id,
  });
  await service.validateObservation(preyObs.observation.id, {
    teacherId: adminId,
    decision: 'validee',
  });
  const direct = await service.attachInteractionEvidence(other, preyObs.observation.id, {
    actorId: adminId,
  });
  assert.equal(direct.upgraded, true);
  assert.equal(await evidenceLevel(other), 'observe_site');
  const twice = await service.attachInteractionEvidence(other, preyObs.observation.id, {
    actorId: adminId,
  });
  assert.equal(twice.attached, false);

  // Espèce étrangère à la relation : refus.
  const stray = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId: unrelated.id,
  });
  await assert.rejects(
    service.attachInteractionEvidence(interaction, stray.observation.id),
    (err) => err.status === 400,
  );
  // Observation refusée : jamais une preuve.
  await service.validateObservation(stray.observation.id, {
    teacherId: adminId,
    decision: 'refusee',
  });
  await assert.rejects(
    service.attachInteractionEvidence(other, stray.observation.id),
    (err) => err.status === 409,
  );
  // Une preuve validée ne se détache pas.
  await assert.rejects(
    service.detachInteractionEvidence(interaction, obs.observation.id),
    (err) => err.status === 409,
  );

  const candidates = await service.listInteractionCandidates(obs.observation.id);
  const mine = candidates.items.find((i) => i.id === interaction);
  assert.ok(mine?.attached, 'la relation rattachée est signalée parmi les candidates');
});

// --- Service : photos --------------------------------------------------------------------

test('photos : EXIF retiré, fichier et ligne supprimés ensemble, plafond par observation', async () => {
  const student = await createAccount();
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    text: 'Photo de feuille',
  });
  const photo = await service.addObservationPhoto(observation.id, await jpegWithGpsDataUrl());
  const row = await queryOne('SELECT file_path FROM species_observation_photos WHERE id = ?', [
    photo.id,
  ]);
  assert.ok(row.file_path.startsWith(`observations/species/${observation.id}/`));
  const abs = getAbsolutePath(row.file_path);
  assert.ok(fs.existsSync(abs));
  const meta = await sharp(abs).metadata();
  assert.equal(meta.exif, undefined, 'les métadonnées EXIF (GPS) sont retirées');

  await assert.rejects(
    service.addObservationPhoto(observation.id, 'data:text/html;base64,PGgxPng8L2gxPg=='),
    (err) => err.status === 400,
  );

  await service.deleteObservationPhoto(observation.id, photo.id);
  assert.equal(fs.existsSync(abs), false, 'le fichier part avec la ligne');
  assert.equal(
    await queryOne('SELECT id FROM species_observation_photos WHERE id = ?', [photo.id]),
    undefined,
  );

  const small = `data:image/jpeg;base64,${(await plainJpeg(8)).toString('base64')}`;
  const kept = [];
  for (let i = 0; i < service.MAX_PHOTOS_PER_OBSERVATION; i += 1) {
    kept.push(await service.addObservationPhoto(observation.id, small));
  }
  await assert.rejects(
    service.addObservationPhoto(observation.id, small),
    (err) => err.status === 409,
  );
  const paths = (
    await queryAll('SELECT file_path FROM species_observation_photos WHERE observation_id = ?', [
      observation.id,
    ])
  ).map((r) => getAbsolutePath(r.file_path));
  await service.deleteObservation(observation.id);
  for (const p of paths)
    assert.equal(fs.existsSync(p), false, 'suppression de l’observation : fichiers compris');
  assert.equal(kept.length, service.MAX_PHOTOS_PER_OBSERVATION);
});

test('synchronisation : une observation ne réveille aucun domaine, le registre seulement « plants »', async () => {
  const before = getSyncDomainVersions();
  await execute('DELETE FROM species_observations WHERE 1 = 0');
  await execute('DELETE FROM species_observation_photos WHERE 1 = 0');
  await execute('DELETE FROM interaction_evidence WHERE 1 = 0');
  const mid = getSyncDomainVersions();
  for (const domain of Object.keys(before)) {
    assert.equal(mid[domain], before[domain], `${domain} ne doit pas bouger`);
  }
  await execute('DELETE FROM map_species WHERE 1 = 0');
  const after = getSyncDomainVersions();
  assert.ok(after.plants > mid.plants, 'le registre fait partie de la réponse de GET /api/plants');
  for (const domain of Object.keys(before).filter((d) => d !== 'plants')) {
    assert.equal(after[domain], mid[domain], `${domain} ne doit pas bouger`);
  }
});

// --- HTTP --------------------------------------------------------------------------------

test('HTTP : soumission élève, rejeu, liste « mes observations », photo privée', async () => {
  const student = await createAccount();
  const intruder = await createAccount();
  const plant = await fx.createPlant();
  const uuid = crypto.randomUUID();
  const body = {
    client_uuid: uuid,
    map_id: mapId,
    plant_id: plant.id,
    observed_at: '2026-09-22',
    detection_mode: 'vue',
    text: 'Observée sans la toucher',
  };
  const created = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send(body)
    .expect(201);
  assert.equal(created.body.replayed, false);
  assert.equal(created.body.observation.status, 'soumise');
  const replay = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send(body)
    .expect(200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.observation.id, created.body.observation.id);

  const id = created.body.observation.id;
  const mine = await request(app)
    .get('/api/species-observations/me')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  assert.deepEqual(
    mine.body.items.map((o) => o.id),
    [id],
  );
  const theirs = await request(app)
    .get('/api/species-observations/me')
    .set('Authorization', `Bearer ${intruder.token}`)
    .expect(200);
  assert.equal(theirs.body.items.length, 0);

  await request(app)
    .get(`/api/species-observations/${id}`)
    .set('Authorization', `Bearer ${intruder.token}`)
    .expect(404);

  const small = `data:image/jpeg;base64,${(await plainJpeg(8)).toString('base64')}`;
  const photo = await request(app)
    .post(`/api/species-observations/${id}/photos`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ imageData: small })
    .expect(201);
  const url = photo.body.photo.url;
  const file = await request(app)
    .get(url)
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  assert.match(String(file.headers['content-type'] || ''), /image/);
  await request(app).get(url).set('Authorization', `Bearer ${intruder.token}`).expect(404);
  await request(app).get(url).set('Authorization', `Bearer ${adminToken}`).expect(200);
  const stored = await queryOne('SELECT file_path FROM species_observation_photos WHERE id = ?', [
    photo.body.photo.id,
  ]);
  const direct = await request(app).get(`/uploads/${stored.file_path}`).expect(403);
  assert.equal(direct.body.code, 'PRIVATE_UPLOAD');

  // Zone inconnue : 400 explicite, pas 500.
  const ghost = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: mapId, zone_id: 'zone-fantome', text: 'x' });
  assert.equal(ghost.status, 400);
  assert.match(ghost.body.error, /Zone introuvable/);
});

test('HTTP : profils — visiteur refusé, file d’examen et décision réservées au validateur', async () => {
  const visitor = await createAccount({ roleSlug: 'visiteur' });
  await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${visitor.token}`)
    .send({ map_id: mapId, text: 'x' })
    .expect(403);

  const student = await createAccount();
  const plant = await fx.createPlant();
  const created = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: mapId, plant_id: plant.id, text: 'Vue au bord de la mare' })
    .expect(201);
  const id = created.body.observation.id;

  await request(app)
    .get('/api/species-observations/review')
    .set('Authorization', `Bearer ${student.token}`)
    .expect(403);
  await request(app)
    .post(`/api/species-observations/${id}/decision`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ decision: 'validee' })
    .expect(403);

  const review = await request(app)
    .get(`/api/species-observations/review?map_id=${encodeURIComponent(mapId)}&status=soumise`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(review.body.items.some((o) => o.id === id));
  assert.ok(review.body.counts.soumise >= 1);
  assert.ok(review.body.items.every((o) => o.status === 'soumise' && o.map_id === mapId));

  await request(app)
    .post(`/api/species-observations/${id}/decision`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'peut-etre' })
    .expect(400);

  const decided = await request(app)
    .post(`/api/species-observations/${id}/decision`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'validee', note: 'Confirmé' })
    .expect(200);
  assert.equal(decided.body.observation.status, 'validee');
  assert.equal(decided.body.map_species.status, 'confirme_site');
  assert.equal(decided.body.already_decided, false);

  // La présence publiée par la carte le dit : confirmée sur le site.
  const presence = await request(app)
    .get(`/api/maps/${encodeURIComponent(mapId)}/species`)
    .set('Authorization', `Bearer ${student.token}`)
    .expect(200);
  const entry = presence.body.species.find((s) => s.plant_id === plant.id);
  assert.equal(entry?.validation_status, 'confirme_site');

  // Photos figées une fois l'observation examinée (pour l'auteur).
  const small = `data:image/jpeg;base64,${(await plainJpeg(8)).toString('base64')}`;
  await request(app)
    .post(`/api/species-observations/${id}/photos`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ imageData: small })
    .expect(409);
  // Et une observation validée ne se supprime pas.
  await request(app)
    .delete(`/api/species-observations/${id}`)
    .set('Authorization', `Bearer ${student.token}`)
    .expect(409);
});

test('HTTP : périmètre carte — un élève borné ne signale pas hors de sa carte', async () => {
  const outside = await fx.createMap({ label: `Hors périmètre ${stamp}` });
  const groupId = `grp-obs-${stamp}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, groupId, `Classe observations ${stamp}`],
  );
  await execute('INSERT INTO group_scopes (group_id, map_id) VALUES (?, ?)', [groupId, mapId]);
  const student = await createAccount({ groupId });
  await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: outside.id, text: 'hors périmètre' })
    .expect(403);
  await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: mapId, text: 'dans le périmètre' })
    .expect(201);
});

test('HTTP : preuve d’interaction rattachée par l’enseignant', async () => {
  const student = await createAccount();
  const a = await fx.createPlant();
  const b = await fx.createPlant();
  const interaction = await createInteraction(a.id, b.id, 'pollinisation');
  const created = await request(app)
    .post('/api/species-observations')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ map_id: mapId, plant_id: a.id, text: 'Butine les fleurs' })
    .expect(201);
  const id = created.body.observation.id;
  await request(app)
    .post(`/api/species-observations/${id}/interaction-evidence`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ interaction_id: interaction })
    .expect(403);
  const list = await request(app)
    .get(`/api/species-observations/${id}/interactions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(list.body.items.some((i) => i.id === interaction));
  const attached = await request(app)
    .post(`/api/species-observations/${id}/interaction-evidence`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ interaction_id: interaction })
    .expect(201);
  assert.equal(attached.body.evidence_level, 'bibliographie');
  await request(app)
    .post(`/api/species-observations/${id}/decision`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'validee' })
    .expect(200);
  assert.equal(await evidenceLevel(interaction), 'observe_site');
});

test('ancien carnet : /api/observations répond 410 Gone (retrait, temps 1 et 2)', async () => {
  const student = await createAccount();
  for (const [method, path] of [
    ['get', `/api/observations/student/${student.id}`],
    ['get', '/api/observations/all'],
    ['post', '/api/observations'],
    ['get', '/api/observations/1/image'],
    ['delete', '/api/observations/1'],
  ]) {
    const res = await request(app)[method](path).set('Authorization', `Bearer ${student.token}`);
    assert.equal(res.status, 410, `${method.toUpperCase()} ${path}`);
    assert.equal(res.body.code, 'OBSERVATIONS_LEGACY_GONE');
  }
});

test('interrupteur ui.modules.species_observations_enabled : fermé aux élèves, ouvert au validateur', async () => {
  const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
  const key = 'ui.modules.species_observations_enabled';
  const snapshot = await snapshotSetting(key);
  const setModule = (value) =>
    request(app)
      .put(`/api/settings/admin/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value })
      .expect(200);
  const student = await createAccount();
  try {
    await setModule(false);
    for (const [method, path] of [
      ['get', '/api/species-observations/me'],
      ['post', '/api/species-observations'],
      ['get', '/api/species-observations/review'],
    ]) {
      const res = await request(app)[method](path).set('Authorization', `Bearer ${student.token}`);
      assert.equal(res.status, 503, `${method.toUpperCase()} ${path}`);
      assert.match(String(res.body.error || ''), /désactivées/);
    }
    // Le validateur garde sa file d'examen.
    await request(app)
      .get('/api/species-observations/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await setModule(true);
    await request(app)
      .get('/api/species-observations/me')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
  } finally {
    await restoreSetting(snapshot);
  }
});

test('permission observations.validate : catalogue et rôles professeurs par défaut', () => {
  const { PERMISSIONS, ROLE_PERMISSION_MATRIX } = require('../lib/rbac');
  assert.ok(PERMISSIONS.some((row) => row[0] === 'observations.validate'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('observations.validate'));
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('observations.validate'));
  // Prof de classe : pas de jardin — valider écrit dans le registre biodiversité.
  assert.ok(!ROLE_PERMISSION_MATRIX.prof_classe.includes('observations.validate'));
  for (const slug of ['eleve_novice', 'eleve_avance', 'eleve_chevronne', 'visiteur', 'personnel']) {
    assert.ok(!ROLE_PERMISSION_MATRIX[slug].includes('observations.validate'), slug);
  }
});

test('normalizeObservedAt et decodeImagePayload (sans base)', () => {
  const now = new Date('2026-09-26T10:00:00');
  assert.equal(service.normalizeObservedAt(null, now), '2026-09-26');
  assert.equal(service.normalizeObservedAt('2026-09-27', now), '2026-09-27', 'tolérance d’un jour');
  assert.throws(() => service.normalizeObservedAt('2026-09-29', now), /futur/);
  assert.throws(() => service.normalizeObservedAt('2026-02-30', now), /invalide/);
  assert.throws(() => service.normalizeObservedAt('1999-12-31', now), /ancienne/);
  assert.throws(() => service.decodeImagePayload('data:image/svg+xml;base64,PHN2Zz4='), /JPEG/);
  assert.throws(
    () =>
      service.decodeImagePayload(
        `data:image/png;base64,${Buffer.from('pas une image du tout').toString('base64')}`,
      ),
    /invalide/,
  );
});
