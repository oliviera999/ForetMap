'use strict';

// Séances pédagogiques — action d'étape `open_tutorial` (chantier CPT, flux F3) : validation
// des cibles à l'écriture (tutoriel inexistant, inactif, valide), résolution du slug en
// identifiant, contrôle à la publication, et noyau pur (`lib/pedagoSessions.js`).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { PEDAGO_STEP_ACTION: A } = require('../lib/shared/pedagoStepActions');
const { resolveSteps, tutorialStepTargets, validateSteps } = require('../lib/pedagoSessions');

const stamp = Date.now().toString(36);
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
const sessionIds = [];
let activeId = 0;
let inactiveId = 0;
const activeSlug = `tuto-f3-actif-${stamp}`;
const inactiveSlug = `tuto-f3-inactif-${stamp}`;

async function insertTutorial(title, slug, isActive) {
  const res = await execute(
    `INSERT INTO tutorials (title, slug, type, html_content, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, 'html', ?, ?, 0, NOW(), NOW())`,
    [title, slug, '<p>Contenu</p>', isActive ? 1 : 0],
  );
  return Number(res.insertId);
}

const tutorialStep = (payload, id = 't1') => ({
  id,
  title: 'Lire le tutoriel',
  body: 'Lis la fiche puis reviens à la séance.',
  action: { type: A.OPEN_TUTORIAL, payload },
  completeWhen: 'manual',
});

async function createCustom(steps, extra = {}) {
  const res = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'custom',
      title: `Séance tutoriel ${stamp}`,
      slug: `seance-tuto-${stamp}-${sessionIds.length}-${Math.random().toString(36).slice(2, 8)}`,
      steps,
      ...extra,
    });
  if (res.body?.id) sessionIds.push(res.body.id);
  return res;
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  activeId = await insertTutorial(`Tutoriel actif ${stamp}`, activeSlug, true);
  inactiveId = await insertTutorial(`Tutoriel inactif ${stamp}`, inactiveSlug, false);
});

after(async () => {
  for (const id of sessionIds) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [id]).catch(() => {});
  }
  await execute('DELETE FROM tutorials WHERE id IN (?, ?)', [activeId, inactiveId]).catch(() => {});
});

test('noyau : l’action est reconnue, ses cibles sont normalisées et recensées', () => {
  const check = validateSteps([
    { id: 'm', title: 'Consigne', body: '', action: { type: A.MESSAGE, payload: {} } },
    tutorialStep({ tutorialId: '12', tutorialSlug: '  ' }),
    tutorialStep({ tutorialSlug: ' ma-fiche ' }, 't2'),
    tutorialStep({}, 't3'),
  ]);
  assert.equal(check.ok, true, check.error);
  assert.deepEqual(tutorialStepTargets(check.steps), [
    { index: 1, tutorialId: 12, tutorialSlug: null },
    { index: 2, tutorialId: null, tutorialSlug: 'ma-fiche' },
    { index: 3, tutorialId: null, tutorialSlug: null },
  ]);
  // La config de séance ne fournit aucune valeur par défaut : la cible est propre à l'étape.
  const resolved = resolveSteps(check.steps, { plantId: 3 }, { payloadFirst: true });
  assert.deepEqual(resolved[1].action.payload, { tutorialId: 12, tutorialSlug: null });
  assert.deepEqual(resolved[2].action.payload, { tutorialId: null, tutorialSlug: 'ma-fiche' });
  assert.deepEqual(tutorialStepTargets([]), []);
  assert.deepEqual(tutorialStepTargets(null), []);
});

test('POST : tutoriel valide par identifiant → 201, étape servie avec tutorialId', async () => {
  const res = await createCustom([tutorialStep({ tutorialId: activeId })]);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.steps[0].action.type, A.OPEN_TUTORIAL);
  assert.equal(res.body.steps[0].action.payload.tutorialId, activeId);
  // Lecture publique après publication : la cible suit.
  const pub = await request(app)
    .put(`/api/pedago-sessions/${res.body.id}`)
    .set(auth())
    .send({ isPublished: true })
    .expect(200);
  assert.equal(pub.body.isPublished, true);
  const detail = await request(app).get(`/api/pedago-sessions/${res.body.slug}`).expect(200);
  assert.equal(detail.body.steps[0].action.payload.tutorialId, activeId);
});

test('POST : tutorialSlug résolu en tutorialId, seul l’identifiant est enregistré', async () => {
  const res = await createCustom([tutorialStep({ tutorialSlug: activeSlug, note: 'gardé' })]);
  assert.equal(res.status, 201, res.text);
  const row = await queryOne('SELECT steps_json FROM pedago_sessions WHERE id = ?', [res.body.id]);
  const stored = typeof row.steps_json === 'string' ? JSON.parse(row.steps_json) : row.steps_json;
  assert.deepEqual(stored[0].action.payload, { note: 'gardé', tutorialId: activeId });
});

test('POST : tutoriel inexistant, inactif ou non choisi → 400, rien n’est créé', async () => {
  const missing = await createCustom([tutorialStep({ tutorialId: 987654321 })]);
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /étape 1 : tutoriel n° 987654321 introuvable/);

  const missingSlug = await createCustom([tutorialStep({ tutorialSlug: `absent-${stamp}` })]);
  assert.equal(missingSlug.status, 400);
  assert.match(missingSlug.body.error, /tutoriel « absent-.* » introuvable/);

  const inactive = await createCustom([
    { id: 'm', title: 'Consigne', body: '', action: { type: A.MESSAGE, payload: {} } },
    tutorialStep({ tutorialId: inactiveId }),
  ]);
  assert.equal(inactive.status, 400);
  assert.match(inactive.body.error, /étape 2 : tutoriel « Tutoriel inactif .* » inactif/);

  const inactiveBySlug = await createCustom([tutorialStep({ tutorialSlug: inactiveSlug })]);
  assert.equal(inactiveBySlug.status, 400);
  assert.match(inactiveBySlug.body.error, /inactif/);

  const empty = await createCustom([tutorialStep({})]);
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /étape 1 : tutoriel à choisir/);
});

test('PUT : mêmes contrôles sur les étapes d’une séance libre (brouillon compris)', async () => {
  const created = await createCustom([
    { id: 'm', title: 'Consigne', body: 'Bonjour', action: { type: A.MESSAGE, payload: {} } },
  ]);
  assert.equal(created.status, 201, created.text);
  const url = `/api/pedago-sessions/${created.body.id}`;

  const bad = await request(app)
    .put(url)
    .set(auth())
    .send({ steps: [tutorialStep({ tutorialId: inactiveId })] })
    .expect(400);
  assert.match(bad.body.error, /inactif/);

  const ok = await request(app)
    .put(url)
    .set(auth())
    .send({ steps: [tutorialStep({ tutorialSlug: activeSlug })] })
    .expect(200);
  assert.equal(ok.body.steps[0].action.payload.tutorialId, activeId);
});

test('publication : un tutoriel désactivé depuis l’enregistrement bloque la publication', async () => {
  const tempId = await insertTutorial(`Tutoriel éphémère ${stamp}`, `tuto-f3-temp-${stamp}`, true);
  try {
    const created = await createCustom([tutorialStep({ tutorialId: tempId })]);
    assert.equal(created.status, 201, created.text);
    await execute('UPDATE tutorials SET is_active = 0 WHERE id = ?', [tempId]);
    const pub = await request(app)
      .put(`/api/pedago-sessions/${created.body.id}`)
      .set(auth())
      .send({ isPublished: true })
      .expect(400);
    assert.match(pub.body.error, /Publication impossible : étape 1 : tutoriel « .* » inactif/);
    // Le brouillon reste modifiable sans toucher aux étapes (titre seul).
    await request(app)
      .put(`/api/pedago-sessions/${created.body.id}`)
      .set(auth())
      .send({ title: `Séance renommée ${stamp}` })
      .expect(200);
  } finally {
    await execute('DELETE FROM tutorials WHERE id = ?', [tempId]).catch(() => {});
  }
});

test('modèle figé : aucune étape tutoriel, création inchangée', async () => {
  const res = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({ templateKey: 'college_reconaitre', slug: `modele-f3-${stamp}` })
    .expect(201);
  sessionIds.push(res.body.id);
  assert.ok(res.body.steps.every((s) => s.action.type !== A.OPEN_TUTORIAL));
});
