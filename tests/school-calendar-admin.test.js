require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { isSchoolOpenDay, nextSchoolOpenDay } = require('../lib/schoolCalendar');

/**
 * Édition du calendrier scolaire depuis les réglages : congés, fériés, fermetures,
 * ouvertures exceptionnelles, jours ouvrables et nouvelle année.
 *
 * Tout se passe sur une année fictive loin dans le futur (2090-2091) : le calendrier est
 * partagé par toute la base de test, et le job des tâches récurrentes lit le vrai.
 */
const YEAR_LABEL = 'TEST-2090-2091';
const YEAR_START = '2090-09-01'; // vendredi
const YEAR_END = '2091-07-06';

let token;

async function dropTestYear() {
  // ON DELETE CASCADE : les jours partent avec l'année.
  await execute('DELETE FROM school_calendar_years WHERE label = ?', [YEAR_LABEL]);
}

async function dayRow(date) {
  return queryOne('SELECT is_open, kind, label FROM school_calendar_days WHERE day_date = ?', [
    date,
  ]);
}

function put(path, body) {
  return request(app)
    .put(`/api/school-calendar${path}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
  token = await ensureAdminTeacherAuthToken();
  await dropTestYear();
});

test.after(async () => {
  await dropTestYear();
});

test('créer une année scolaire : jours posés selon les jours ouvrables', async () => {
  const res = await request(app)
    .post('/api/school-calendar/years')
    .set('Authorization', `Bearer ${token}`)
    .send({ label: YEAR_LABEL, starts_on: YEAR_START, ends_on: YEAR_END })
    .expect(201);
  assert.strictEqual(res.body.year.label, YEAR_LABEL);
  assert.ok(res.body.year.days > 300);

  assert.deepStrictEqual(await dayRow('2090-09-01'), { is_open: 1, kind: 'open', label: null });
  assert.deepStrictEqual(await dayRow('2090-09-02'), { is_open: 0, kind: 'weekend', label: null });

  // Chevauchement refusé : deux années ne se partagent pas un jour.
  await request(app)
    .post('/api/school-calendar/years')
    .set('Authorization', `Bearer ${token}`)
    .send({ label: `${YEAR_LABEL}-bis`, starts_on: '2091-01-01', ends_on: '2091-02-01' })
    .expect(409);
});

test('vacances : les jours ouvrables ferment, les week-ends restent des week-ends', async () => {
  // Du lundi 16/10/2090 au vendredi 27/10/2090, week-end du 21-22 compris.
  const res = await put('/days', {
    from: '2090-10-16',
    to: '2090-10-27',
    action: 'close',
    kind: 'vacation',
    label: 'Toussaint test',
  }).expect(200);
  assert.strictEqual(res.body.updated, 12);

  assert.deepStrictEqual(await dayRow('2090-10-16'), {
    is_open: 0,
    kind: 'vacation',
    label: 'Toussaint test',
  });
  assert.deepStrictEqual(await dayRow('2090-10-21'), { is_open: 0, kind: 'weekend', label: null });
  // C'est ce que le job lit : la reprise se fait au lundi de la rentrée.
  assert.strictEqual(await isSchoolOpenDay('2090-10-18'), false);
  assert.strictEqual(await nextSchoolOpenDay('2090-10-16'), '2090-10-30');

  // La lecture d'administration restitue la période.
  const year = await queryOne('SELECT id FROM school_calendar_years WHERE label = ?', [YEAR_LABEL]);
  const admin = await request(app)
    .get(`/api/school-calendar/admin?year_id=${year.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(admin.body.year_id, year.id);
  assert.deepStrictEqual(admin.body.open_weekdays, [1, 2, 3, 4, 5]);
  const toussaint = admin.body.days.filter((d) => d.label === 'Toussaint test');
  assert.strictEqual(toussaint.length, 10);
});

test('ouverture exceptionnelle puis retour aux jours ouvrables', async () => {
  // Samedi 04/11/2090 : ouvert exceptionnellement (portes ouvertes).
  await put('/days', {
    from: '2090-11-04',
    to: '2090-11-04',
    action: 'open',
    label: 'Portes ouvertes',
  }).expect(200);
  assert.deepStrictEqual(await dayRow('2090-11-04'), {
    is_open: 1,
    kind: 'extra_open',
    label: 'Portes ouvertes',
  });

  // « Annuler » la Toussaint : retour aux jours ouvrables, libellés effacés.
  await put('/days', { from: '2090-10-16', to: '2090-10-27', action: 'reset' }).expect(200);
  assert.deepStrictEqual(await dayRow('2090-10-16'), { is_open: 1, kind: 'open', label: null });
  assert.deepStrictEqual(await dayRow('2090-10-21'), { is_open: 0, kind: 'weekend', label: null });
});

test('jours ouvrables : recalcul des jours ordinaires, congés et exceptions conservés', async () => {
  await put('/days', {
    from: '2090-12-25',
    to: '2090-12-25',
    action: 'close',
    kind: 'holiday',
    label: 'Noël',
  }).expect(200);
  try {
    // Mercredi libéré, samedi travaillé.
    const res = await put('/weekdays', { open_weekdays: [1, 2, 4, 5, 6] }).expect(200);
    assert.deepStrictEqual(res.body.open_weekdays, [1, 2, 4, 5, 6]);

    assert.strictEqual(await isSchoolOpenDay('2090-09-06'), false); // mercredi
    assert.strictEqual(await isSchoolOpenDay('2090-09-09'), true); // samedi
    assert.strictEqual((await dayRow('2090-09-06')).kind, 'weekend');
    // Hors calendrier, le repli suit aussi le réglage.
    assert.strictEqual(await isSchoolOpenDay('2095-01-08'), true); // samedi
    assert.strictEqual(await isSchoolOpenDay('2095-01-05'), false); // mercredi
    // Posés à la main, donc intacts.
    assert.strictEqual((await dayRow('2090-12-25')).kind, 'holiday');
    assert.strictEqual((await dayRow('2090-11-04')).kind, 'extra_open');
  } finally {
    await put('/weekdays', { open_weekdays: [1, 2, 3, 4, 5] }).expect(200);
  }
  assert.strictEqual(await isSchoolOpenDay('2090-09-06'), true);
});

test('saisies refusées : dates, action, type, hors année, aucun jour ouvrable', async () => {
  await put('/days', { from: '2090-10-27', to: '2090-10-16', action: 'reset' }).expect(400);
  await put('/days', { from: 'hier', to: '2090-10-16', action: 'reset' }).expect(400);
  await put('/days', { from: '2090-10-16', to: '2090-10-16', action: 'effacer' }).expect(400);
  await put('/days', {
    from: '2090-10-16',
    to: '2090-10-16',
    action: 'close',
    kind: 'weekend',
  }).expect(400);
  // Hors de toute année : pas de ligne à écrire, il faut d'abord créer l'année.
  const hors = await put('/days', { from: '2099-03-02', to: '2099-03-02', action: 'reset' });
  assert.strictEqual(hors.status, 400);
  assert.match(hors.body.error, /aucune année scolaire/);
  await put('/weekdays', { open_weekdays: [] }).expect(400);
});

test('écriture réservée à admin.settings.write', async () => {
  await request(app)
    .put('/api/school-calendar/weekdays')
    .send({ open_weekdays: [1] })
    .expect(401);
  await request(app).get('/api/school-calendar/admin').expect(401);
  await request(app)
    .post('/api/school-calendar/years')
    .send({ label: 'x', starts_on: '2092-09-01', ends_on: '2093-07-01' })
    .expect(401);
});
