'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { ROLE_PERMISSION_MATRIX, PERMISSIONS } = require('../lib/rbac');
const {
  HEALTH_RISK_VALUES,
  normalizeHealthRisk,
  listHealthRisks,
  healthRiskLabel,
} = require('../lib/plantHealthRisk');
const {
  HAZARD_REVIEW_TRACKED_FIELDS,
  hazardReviewInvalidated,
} = require('../lib/plantHazardReview');
const { PLANT_HEALTH_FIELDS, PLANT_COLUMNS } = require('../lib/plantsRouteHelpers');
const { ORIGIN_STATUS_VALUES, normalizeOriginStatus } = require('../lib/plantOriginStatus');

/**
 * Statut d'origine étendu, risque sanitaire et validation des dangers (migration 271).
 *
 * L'enjeu central est la règle d'invalidation : `hazard_reviewed` certifie qu'un enseignant a
 * relu ce qui était écrit. Si le texte change ensuite sans que la coche retombe, elle
 * certifie une version qui n'existe plus — et l'avertissement affiché aux élèves passe pour
 * relu alors qu'il ne l'est pas.
 */

test.before(async () => {
  await initSchema();
});

test('migration 271 — colonnes sanitaires, traçabilité et ENUM d’origine étendu', async () => {
  const cols = await queryOne(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'plants'
        AND column_name IN ('health_risk','health_notes','hazard_reviewed_by','hazard_reviewed_at')`,
  );
  assert.equal(Number(cols.c), 4);

  const origin = await queryOne(
    `SELECT COLUMN_TYPE AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'plants' AND column_name = 'origin_status'`,
  );
  assert.match(String(origin.t), /endemique/);
  assert.match(String(origin.t), /domestique/);

  const health = await queryOne(
    `SELECT COLUMN_TYPE AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'plants' AND column_name = 'health_risk'`,
  );
  for (const value of HEALTH_RISK_VALUES) {
    assert.match(String(health.t), new RegExp(value), `valeur absente du SET SQL : ${value}`);
  }
});

test('origin_status — endémique et domestique sont des valeurs à part entière', () => {
  assert.deepEqual(
    [...ORIGIN_STATUS_VALUES],
    ['indigene', 'introduit', 'envahissant', 'endemique', 'domestique'],
  );
  // Avant la 271, « endémique » était rabattu sur « indigène » et l'information se perdait.
  assert.equal(normalizeOriginStatus('endemique'), 'endemique');
  assert.equal(normalizeOriginStatus('Endémique'), 'endemique');
  assert.equal(normalizeOriginStatus('domestique'), 'domestique');
  assert.equal(normalizeOriginStatus('Élevage'), 'domestique');
  assert.equal(normalizeOriginStatus('indigene'), 'indigene');
  assert.equal(normalizeOriginStatus('inconnu'), null);
});

test('health_risk — normalisation vers le SET SQL', () => {
  assert.equal(normalizeHealthRisk('rage,toxoplasmose'), 'rage,toxoplasmose');
  // Ordre canonique réimposé : deux saisies équivalentes donnent la même chaîne.
  assert.equal(normalizeHealthRisk('toxoplasmose ; rage'), 'rage,toxoplasmose');
  assert.equal(normalizeHealthRisk(['Tétanos', 'tetanus']), 'tetanos');
  assert.equal(normalizeHealthRisk('pollen'), 'allergie');
  assert.equal(normalizeHealthRisk('porteur de germes'), 'vecteur');
  assert.equal(normalizeHealthRisk('sorcellerie'), null);
  assert.equal(normalizeHealthRisk(''), null);
  assert.deepEqual(listHealthRisks('vecteur,rage'), ['rage', 'vecteur']);
  for (const value of HEALTH_RISK_VALUES) {
    assert.equal(normalizeHealthRisk(value), value, `risque perdu : ${value}`);
    assert.ok(healthRiskLabel(value), `libellé manquant : ${value}`);
  }
});

test('les deux colonnes sanitaires sont écrites par INSERT/UPDATE', () => {
  assert.deepEqual(PLANT_HEALTH_FIELDS, ['health_risk', 'health_notes']);
  for (const field of PLANT_HEALTH_FIELDS) {
    assert.ok(PLANT_COLUMNS.includes(field), `colonne absente de la whitelist : ${field}`);
  }
  // Traçabilité exclue : ces deux colonnes n'appartiennent qu'à la route de validation.
  assert.ok(!PLANT_COLUMNS.includes('hazard_reviewed_by'));
  assert.ok(!PLANT_COLUMNS.includes('hazard_reviewed_at'));
});

test('hazardReviewInvalidated — toute évolution du danger annule la relecture', () => {
  assert.deepEqual(
    [...HAZARD_REVIEW_TRACKED_FIELDS],
    ['toxicity_level', 'hazard_exposure', 'hazard_notes', 'health_risk', 'health_notes'],
  );
  const before = {
    toxicity_level: 'toxique',
    hazard_exposure: 'ingestion',
    hazard_notes: 'Baies toxiques.',
    health_risk: null,
    health_notes: null,
  };
  assert.equal(hazardReviewInvalidated(before, { ...before }), false);
  // `null` côté MySQL et `''` côté formulaire décrivent le même vide.
  assert.equal(hazardReviewInvalidated(before, { ...before, health_risk: '' }), false);
  assert.equal(
    hazardReviewInvalidated(before, { ...before, hazard_notes: 'Baies toxiques. ' }),
    false,
  );
  assert.equal(hazardReviewInvalidated(before, { ...before, toxicity_level: 'mortel' }), true);
  assert.equal(hazardReviewInvalidated(before, { ...before, hazard_exposure: 'contact' }), true);
  assert.equal(hazardReviewInvalidated(before, { ...before, hazard_notes: 'Autre texte' }), true);
  assert.equal(hazardReviewInvalidated(before, { ...before, health_risk: 'rage' }), true);
  assert.equal(
    hazardReviewInvalidated(before, { ...before, health_notes: 'Lavage des mains' }),
    true,
  );
});

test('plants.hazards.validate — catalogue et matrices de rôles', () => {
  const catalogKeys = new Set(PERMISSIONS.map((row) => row[0]));
  assert.ok(catalogKeys.has('plants.hazards.validate'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('plants.hazards.validate'));
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('plants.hazards.validate'));
  // Le tuteur de classe n'a pas le jardin ; valider un danger engage la sécurité en sortie.
  assert.ok(!ROLE_PERMISSION_MATRIX.prof_classe.includes('plants.hazards.validate'));
});

test('POST /api/plants/:id/validate-hazard — validation, retrait, et remise à zéro sur édition', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const adminId = String(await getAdminTeacherUserId());
  const name = `Renard test danger ${Date.now()}`;

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      emoji: '🦊',
      toxicity_level: 'irritation',
      hazard_exposure: 'piqure_morsure',
      hazard_notes: 'Morsure possible si l’animal est saisi.',
      health_risk: 'Rage',
      health_notes: 'Toute morsure impose une consultation médicale immédiate.',
      origin_status: 'endemique',
    })
    .expect(201);

  const plantId = created.body.id;
  assert.ok(plantId);
  // La pré-saisie n'est pas une validation : une fiche neuve arrive non relue.
  assert.equal(Number(created.body.hazard_reviewed), 0);
  assert.equal(created.body.health_risk, 'rage');
  assert.equal(created.body.origin_status, 'endemique');

  try {
    const validated = await request(app)
      .post(`/api/plants/${plantId}/validate-hazard`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewed: true })
      .expect(200);
    assert.equal(Number(validated.body.hazard_reviewed), 1);
    assert.equal(String(validated.body.hazard_reviewed_by), adminId);
    assert.ok(validated.body.hazard_reviewed_at);

    // Modifier autre chose que le danger ne dévalide pas la fiche.
    await request(app)
      .put(`/api/plants/${plantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, emoji: '🦊', description: 'Carnivore discret du site.' })
      .expect(200);
    const afterHarmlessEdit = await queryOne(
      'SELECT hazard_reviewed, hazard_reviewed_by FROM plants WHERE id = ?',
      [plantId],
    );
    assert.equal(Number(afterHarmlessEdit.hazard_reviewed), 1);
    assert.equal(String(afterHarmlessEdit.hazard_reviewed_by), adminId);

    // Réécrire la conduite à tenir remet la fiche « à valider », relecteur effacé.
    const reedited = await request(app)
      .put(`/api/plants/${plantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, emoji: '🦊', hazard_notes: 'Ne jamais approcher ni toucher l’animal.' })
      .expect(200);
    assert.equal(Number(reedited.body.hazard_reviewed), 0);
    assert.equal(reedited.body.hazard_reviewed_by, null);
    assert.equal(reedited.body.hazard_reviewed_at, null);

    // Même règle pour le volet sanitaire.
    await request(app)
      .post(`/api/plants/${plantId}/validate-hazard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const afterHealthEdit = await request(app)
      .put(`/api/plants/${plantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, emoji: '🦊', health_risk: 'rage,leptospirose' })
      .expect(200);
    assert.equal(Number(afterHealthEdit.body.hazard_reviewed), 0);
    assert.equal(afterHealthEdit.body.hazard_reviewed_by, null);

    // Retrait explicite de la validation (une relecture peut conclure « à revoir »).
    await request(app)
      .post(`/api/plants/${plantId}/validate-hazard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const unvalidated = await request(app)
      .post(`/api/plants/${plantId}/validate-hazard`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reviewed: false })
      .expect(200);
    assert.equal(Number(unvalidated.body.hazard_reviewed), 0);
    assert.equal(unvalidated.body.hazard_reviewed_by, null);
    assert.equal(unvalidated.body.hazard_reviewed_at, null);
  } finally {
    await execute('DELETE FROM plants WHERE id = ?', [plantId]);
  }
});

test('POST /api/plants/:id/validate-hazard — garde d’accès et fiche inconnue', async () => {
  const token = await ensureAdminTeacherAuthToken();
  await request(app).post('/api/plants/1/validate-hazard').expect(401);
  await request(app)
    .post('/api/plants/99999999/validate-hazard')
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  await request(app)
    .post('/api/plants/abc/validate-hazard')
    .set('Authorization', `Bearer ${token}`)
    .expect(400);
});

// Audit du 25/09/2026, § 1.3.6 — le drapeau passait par `PLANT_COLUMNS` : le formulaire et
// l'import (`danger_valide`) le posaient avec la seule permission `plants.manage`, sans
// relecteur ni date. Il n'est plus écrit que par la route de validation.
test('PUT/POST /api/plants — le drapeau de relecture n’est pas écrivable par la fiche', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  assert.ok(!PLANT_COLUMNS.includes('hazard_reviewed'));
  const name = `Contournement relecture ${Date.now()}`;
  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🌿', toxicity_level: 'toxique', hazard_reviewed: 1 })
    .expect(201);
  try {
    assert.equal(Number(created.body.hazard_reviewed), 0);
    const updated = await request(app)
      .put(`/api/plants/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, emoji: '🌿', toxicity_level: 'toxique', hazard_reviewed: '1' })
      .expect(200);
    assert.equal(Number(updated.body.hazard_reviewed), 0);
    assert.equal(updated.body.hazard_reviewed_by, null);
  } finally {
    await execute('DELETE FROM plants WHERE id = ?', [created.body.id]);
  }
});

test('migration 293 — les fiches validées sans relecteur repassent « à valider »', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { splitSqlStatements } = require('../database');
  const adminId = await getAdminTeacherUserId();
  const stamp = Date.now();
  const ids = [];
  const insert = async (name, reviewed, by, at) => {
    const r = await execute(
      `INSERT INTO plants (name, emoji, toxicity_level, hazard_reviewed, hazard_reviewed_by, hazard_reviewed_at)
       VALUES (?, '🌿', 'toxique', ?, ?, ?)`,
      [name, reviewed, by, at],
    );
    ids.push(r.insertId);
    return r.insertId;
  };
  try {
    const orphan = await insert(`M293 orpheline ${stamp}`, 1, null, null);
    const legit = await insert(`M293 relue ${stamp}`, 1, adminId, '2026-09-01 10:00:00');
    const residue = await insert(`M293 résidu ${stamp}`, 0, adminId, '2026-09-01 10:00:00');
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '293_plants_hazard_review_reset.sql'),
      'utf8',
    );
    for (const stmt of splitSqlStatements(sql)) await execute(stmt);
    const row = (id) =>
      queryOne(
        'SELECT hazard_reviewed AS r, hazard_reviewed_by AS b, hazard_reviewed_at AS a FROM plants WHERE id = ?',
        [id],
      );
    const o = await row(orphan);
    assert.equal(Number(o.r), 0);
    const l = await row(legit);
    assert.equal(Number(l.r), 1);
    assert.equal(String(l.b), String(adminId));
    const d = await row(residue);
    assert.equal(d.b, null);
    assert.equal(d.a, null);
  } finally {
    for (const id of ids) await execute('DELETE FROM plants WHERE id = ?', [id]);
  }
});
