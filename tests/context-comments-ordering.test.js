'use strict';

/**
 * Ordre des messages d'un fil, et marqueur du dernier — filet de la migration **278**.
 *
 * Le défaut corrigé : `context_comments.created_at` était un `DATETIME` à la **seconde**, et
 * `id` porte un UUID tiré au hasard. Les deux requêtes qui ordonnent les messages trient par
 * `created_at DESC, id DESC` : deux messages publiés dans la même seconde étaient donc
 * départagés **au hasard**. Ce n'était pas un cas de bord — dans un échange vif entre un
 * professeur et un élève, c'est le cas courant : le test de la route `/counts` échouait quatre
 * fois sur six avant la migration, et zéro fois sur huit après.
 *
 * Deux conséquences distinctes, d'où deux cas ici :
 * - le **fil s'affichait dans le désordre** (le plus récent n'était pas forcément en tête) ;
 * - le **marqueur du dernier message** pouvait désigner l'avant-dernier, donc ne pas bouger à
 *   l'arrivée du dernier — et le badge « non lus », qui compare ce marqueur au curseur de
 *   lecture, restait muet.
 *
 * Le troisième cas est une garde de schéma : il fige la précision en base. Une migration
 * future qui reviendrait à la seconde rendrait les deux premiers cas capricieux plutôt que
 * franchement rouges — c'est exactement ce qu'il faut éviter de revivre.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

let studentToken;
let contextId;

/** Élève capable d'écrire un commentaire (rôle novice + connexion). */
async function registerStudent() {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `ordre_${stamp}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Ordre', lastName: `Ctx${stamp}`, email, password: 'pass1234' })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: email, password: 'pass1234' })
    .expect(200);
  return login.body.authToken;
}

/** Publie un message et rend sa ligne créée. */
async function postComment(body) {
  const res = await request(app)
    .post('/api/context-comments')
    .set(auth(studentToken))
    .send({ contextType: 'task', contextId, body })
    .expect(201);
  return res.body;
}

/**
 * Tâche réelle à commenter : la route vérifie que le contexte existe (404 sinon). La règle
 * testée ne dépend pas de ce qui est commenté — il faut seulement que ce soit commentable.
 */
async function createTaskContext(teacherToken) {
  const stamp = Date.now();
  const zone = await request(app)
    .post('/api/zones')
    .set(auth(teacherToken))
    .send({
      name: `Zone ordre ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 18, yp: 18 },
        { xp: 26, yp: 18 },
        { xp: 22, yp: 26 },
      ],
      stage: 'empty',
    })
    .expect(201);
  const project = await request(app)
    .post('/api/task-projects')
    .set(auth(teacherToken))
    .send({ map_id: 'foret', title: `Projet ordre ${stamp}`, description: 'Ordre des messages' })
    .expect(201);
  const task = await request(app)
    .post('/api/tasks')
    .set(auth(teacherToken))
    .send({
      title: `Tâche ordre ${stamp}`,
      map_id: 'foret',
      project_id: project.body.id,
      zone_id: zone.body.id,
      required_students: 1,
    })
    .expect(201);
  return task.body.id;
}

test.before(async () => {
  await initSchema();
  const teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  contextId = await createTaskContext(teacherToken);
  studentToken = await registerStudent();
});

test.after(async () => {
  await execute('DELETE FROM context_comments WHERE context_type = ? AND context_id = ?', [
    'task',
    contextId,
  ]);
});

test('deux messages publiés coup sur coup restent dans l’ordre (migration 278)', async () => {
  // Aucune pause volontaire entre les deux : c'est précisément le cas qui échouait.
  const premier = await postComment('Premier message.');
  const second = await postComment('Second message, juste après.');

  assert.notEqual(premier.id, second.id);

  const liste = await request(app)
    .get(
      `/api/context-comments?contextType=task&contextId=${encodeURIComponent(contextId)}&page=1&pageSize=10`,
    )
    .set(auth(studentToken))
    .expect(200);

  const ids = (liste.body?.items || []).map((item) => item.id);
  assert.deepEqual(
    ids,
    [second.id, premier.id],
    'le fil doit être servi du plus récent au plus ancien, même à la même seconde',
  );
});

test('le marqueur du dernier message suit le dernier, pas le plus grand identifiant', async () => {
  const troisieme = await postComment('Troisième message.');

  const counts = await request(app)
    .get(
      `/api/context-comments/counts?contextType=task&contextIds=${encodeURIComponent(contextId)}`,
    )
    .set(auth(studentToken))
    .expect(200);

  const resume = counts.body?.counts?.[contextId];
  assert.equal(resume?.total, 3);
  assert.equal(
    resume?.newestId,
    troisieme.id,
    'le marqueur doit désigner le dernier message publié',
  );
  // Et il reste une **chaîne** : `Number(uuid)` valait `NaN`, replié en `0` par le `||`, ce
  // qui neutralisait la détection des non-lus côté client.
  assert.equal(typeof resume?.newestId, 'string');
  assert.notEqual(resume?.newestId, '0');
});

test('garde de schéma : created_at conserve une précision sous la seconde', async () => {
  const row = await queryOne(
    `SELECT DATETIME_PRECISION AS precision_digits
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'context_comments'
        AND COLUMN_NAME = 'created_at'`,
  );
  assert.ok(
    Number(row?.precision_digits) >= 3,
    'created_at doit rester à la milliseconde : sans elle, deux messages d’une même seconde ' +
      'sont départagés par leur UUID, donc au hasard (migration 278)',
  );
});
