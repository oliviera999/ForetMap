require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

/**
 * `GET /api/tasks/recurring-preview` : la prochaine occurrence **prévue** de chaque série.
 *
 * La route sert l'aperçu du cadre « Séries récurrentes » côté n3boss. Ce qu'elle promet et
 * qui n'est vérifiable que côté serveur : une seule ligne par série (la tête, celle qui
 * engendrera la suivante), le champ `pending` qui dit ce qui manque pour que l'occurrence
 * arrive, et la permission `tasks.manage` — un n3beur ne voit pas le calendrier des séries.
 */

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
});

async function getAdminAuthToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id);
  assert.ok(adminRole?.id);
  for (const key of ['tasks.manage', 'tasks.validate', 'teacher.access']) {
    await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
      key,
      key,
      'Permission auto-seed tests recurring-preview',
    ]);
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      adminRole.id,
      key,
    ]);
  }
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [adminRole.id, teacher.id]);
  return await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
}

async function createRecurringTask(token, title, extra = {}) {
  const zones = await request(app).get('/api/zones').expect(200);
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title,
      zone_id: zones.body[0]?.id || 'pg',
      required_students: 1,
      recurrence: 'weekly',
      start_date: '2020-01-07',
      due_date: '2020-01-10',
      ...extra,
    })
    .expect(201);
  return res.body.id;
}

function findSeries(body, taskId) {
  return (body.series || []).find((s) => String(s.task_id) === String(taskId)) || null;
}

test('recurring-preview : une ligne par série, ancrée sur la date de départ', async () => {
  const token = await getAdminAuthToken();
  const title = `RecPreview ${Date.now()}`;
  const taskId = await createRecurringTask(token, title);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.match(res.body.today, /^\d{4}-\d{2}-\d{2}$/, 'le jour de référence est une date ISO');
  const ligne = findSeries(res.body, taskId);
  assert.ok(ligne, 'la série créée figure dans la prévision');
  assert.strictEqual(ligne.title, title);
  assert.strictEqual(ligne.recurrence, 'weekly');
  // L'ancre est la date de départ : c'est elle qui fixe le jour de la semaine de la série.
  assert.strictEqual(ligne.anchor_date, '2020-01-07');
  assert.strictEqual(ligne.current_due, '2020-01-10');
  // Tâche non validée : c'est la validation qui manque pour que la suivante naisse.
  assert.strictEqual(ligne.pending, 'validation');
});

/**
 * `spawn_date` : le jour où le job dupliquera la tâche. Le job n'agit qu'une fois
 * l'échéance atteinte et jamais un jour fermé — premier jour ouvré ≥ max(échéance, today).
 */
test('recurring-preview : annonce le jour de duplication', async () => {
  const token = await getAdminAuthToken();
  const marqueur = Date.now();
  // Échéance future (un jeudi, hors calendrier préchargé : repli jours de semaine ouverts).
  const futureId = await createRecurringTask(token, `RecPreview spawn futur ${marqueur}`, {
    start_date: '2099-12-28',
    due_date: '2099-12-31',
  });
  await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [futureId]);
  // Échéance passée, jamais validée : la duplication ne peut venir qu'à partir d'aujourd'hui.
  const passeeId = await createRecurringTask(token, `RecPreview spawn passé ${marqueur}`);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.strictEqual(typeof res.body.automation_enabled, 'boolean');
  const future = findSeries(res.body, futureId);
  assert.ok(future, 'la série future figure dans la prévision');
  assert.strictEqual(future.pending, 'due_date');
  assert.strictEqual(future.spawn_date, '2099-12-31', 'dupliquée le jour de son échéance');
  assert.ok(future.next_due > future.spawn_date, 'la copie vise une échéance postérieure');

  const passee = findSeries(res.body, passeeId);
  assert.ok(passee, 'la série en retard figure dans la prévision');
  assert.strictEqual(passee.pending, 'validation');
  assert.match(passee.spawn_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(passee.spawn_date >= res.body.today, 'jamais une date de duplication passée');
  assert.ok(
    passee.next_due >= passee.spawn_date,
    'la copie n’a pas une échéance déjà dépassée le jour de sa création',
  );
});

/**
 * Série déjà dupliquée pour son échéance (marqueur posé) mais dont la copie a disparu : le
 * job ne la relancera jamais. La prévision doit le dire au lieu d'annoncer une duplication.
 */
test('recurring-preview : signale une série déjà dupliquée (à l’arrêt)', async () => {
  const token = await getAdminAuthToken();
  const taskId = await createRecurringTask(token, `RecPreview arrêt ${Date.now()}`, {
    start_date: '2099-12-28',
    due_date: '2099-12-31',
  });
  await execute(
    "UPDATE tasks SET status = 'validated', recurrence_spawned_for_due_date = due_date WHERE id = ?",
    [taskId],
  );

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const ligne = findSeries(res.body, taskId);
  assert.ok(ligne, 'la série figure dans la prévision');
  assert.strictEqual(ligne.already_spawned, true);
  assert.strictEqual(ligne.spawn_date, null, 'aucune duplication à annoncer');
});

test('recurring-preview : une série sans échéance n’est pas prévue', async () => {
  const token = await getAdminAuthToken();
  const taskId = await createRecurringTask(token, `RecPreview sans échéance ${Date.now()}`);
  await execute('UPDATE tasks SET due_date = NULL WHERE id = ?', [taskId]);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(findSeries(res.body, taskId), null);
});

test('recurring-preview : une série n’apparaît qu’une fois, par sa tête d’échéance', async () => {
  const token = await getAdminAuthToken();
  const seriesId = `srv-${Date.now()}`;
  const ancienId = await createRecurringTask(token, `RecPreview ancien ${Date.now()}`);
  const recentId = await createRecurringTask(token, `RecPreview récent ${Date.now()}`, {
    start_date: '2020-01-14',
    due_date: '2020-01-17',
  });
  // Les deux occurrences appartiennent à la même série : seule la plus récente doit sortir.
  await execute('UPDATE tasks SET recurrence_series_id = ? WHERE id IN (?, ?)', [
    seriesId,
    ancienId,
    recentId,
  ]);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const pourSerie = (res.body.series || []).filter((s) => String(s.series_id) === seriesId);
  assert.strictEqual(pourSerie.length, 1, 'une seule ligne pour la série');
  assert.strictEqual(String(pourSerie[0].task_id), String(recentId), 'la tête est la plus récente');
});

test('recurring-preview : les tâches archivées sortent de la prévision', async () => {
  const token = await getAdminAuthToken();
  const taskId = await createRecurringTask(token, `RecPreview archivée ${Date.now()}`);

  await request(app)
    .post(`/api/tasks/${taskId}/archive`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(findSeries(res.body, taskId), null, 'une série archivée ne s’annonce plus');
});

test('recurring-preview : réservé à `tasks.manage`', async () => {
  await request(app).get('/api/tasks/recurring-preview').expect(401);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prev', lastName: `Stu${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentToken = await signAuthToken(
    {
      userType: 'student',
      userId: studentRes.body.id,
      canonicalUserId: studentRes.body.id,
      roleSlug: 'eleve_novice',
      roleDisplayName: 'n3beur novice',
      elevated: false,
    },
    false,
  );
  await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(403);
});

/**
 * Régression : le plafond de la liste coupait exactement les séries qu'il fallait montrer.
 *
 * Le calcul par série coûte plusieurs allers-retours en base, la liste est donc bornée.
 * Elle l'était par `ORDER BY due_date DESC` : on gardait les échéances les plus lointaines,
 * c'est-à-dire les séries qui roulent toutes seules, et on jetait les plus anciennes. Or
 * une série bloquée garde une vieille échéance *parce qu'*elle est bloquée — les séries en
 * attente de validation étaient les premières à tomber hors fenêtre, et le panneau perdait
 * leur ligne de prévision sans rien dire.
 */
test('recurring-preview : les séries bloquées passent avant celles qui roulent', async () => {
  const token = await getAdminAuthToken();
  const marqueur = Date.now();
  // Bloquée : vieille échéance, jamais validée — c'est elle qui réclame une action.
  const bloqueeId = await createRecurringTask(token, `RecPreview bloquee ${marqueur}`, {
    start_date: '2020-02-03',
    due_date: '2020-02-07',
  });
  // Saine : échéance très lointaine et validée — elle n'attend rien de personne.
  const saineId = await createRecurringTask(token, `RecPreview saine ${marqueur}`, {
    start_date: '2099-12-28',
    due_date: '2099-12-31',
  });
  await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [saineId]);

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const ids = (res.body.series || []).map((s) => String(s.task_id));
  const rangBloquee = ids.indexOf(String(bloqueeId));
  const rangSaine = ids.indexOf(String(saineId));
  assert.ok(rangBloquee >= 0, 'la série bloquée figure dans la prévision');
  assert.ok(rangSaine >= 0, 'la série saine figure dans la prévision');
  assert.ok(
    rangBloquee < rangSaine,
    `la série bloquée (rang ${rangBloquee}) doit précéder la série validée (rang ${rangSaine})`,
  );
});

test('recurring-preview : l’ordre annoncé est celui qui survit au plafond', async () => {
  const token = await getAdminAuthToken();
  await createRecurringTask(token, `RecPreview ordre ${Date.now()}`, {
    start_date: '2020-03-02',
    due_date: '2020-03-06',
  });

  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const lignes = res.body.series || [];
  assert.ok(lignes.length > 0, 'la prévision n’est pas vide');
  // L'invariant porte sur toute la réponse, pas seulement sur les séries du test : c'est
  // lui, et pas le contenu, qui décide de ce que le plafond garde.
  let dejaValidee = false;
  let echeancePrecedente = '';
  for (const ligne of lignes) {
    const bloquee = ligne.pending === 'validation';
    if (bloquee) {
      assert.ok(!dejaValidee, `série en attente après une série validée : ${ligne.title}`);
    } else if (!dejaValidee) {
      dejaValidee = true;
      echeancePrecedente = '';
    }
    const echeance = String(ligne.current_due || '');
    assert.ok(
      echeance >= echeancePrecedente,
      `échéances non croissantes dans le groupe : ${echeancePrecedente} puis ${echeance}`,
    );
    echeancePrecedente = echeance;
  }
});

test('recurring-preview : la troncature est annoncée, jamais silencieuse', async () => {
  const token = await getAdminAuthToken();
  const res = await request(app)
    .get('/api/tasks/recurring-preview')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.strictEqual(typeof res.body.truncated, 'boolean', '`truncated` est toujours présent');
  assert.strictEqual(typeof res.body.limit, 'number', '`limit` dit où la liste s’arrête');
  assert.ok(res.body.limit > 0);
  assert.ok(
    (res.body.series || []).length <= res.body.limit,
    'la liste ne dépasse jamais le plafond annoncé',
  );
  // Sans troncature, `series` est complète : le front peut alors conclure qu'une série
  // absente de la réponse n'a réellement pas de prochaine occurrence.
  if (!res.body.truncated) {
    assert.ok((res.body.series || []).length < res.body.limit + 1);
  }
});
