'use strict';

/**
 * Participation du profil « Personnel » — forum et commentaires de contexte.
 *
 * Réalignement des profils du 22/09/2026. Les deux routeurs refusaient en bloc les profils
 * « type visiteur », une liste qui décrit le **parcours** (pas de carte de travail, pas de
 * tâches) et où `personnel` figure légitimement. Le personnel du lycée — agents, vie
 * scolaire, AED — se retrouvait donc muet : ni forum, ni commentaire, ni réaction, alors que
 * c'est précisément le public qu'on veut faire remonter du terrain. Le blocage avait déjà
 * imposé une porte de contournement pour les signalements du plan des personnels
 * (`POST /api/staff-plan/report`).
 *
 * La décision se prend désormais sur `PARTICIPATION_EXCLUDED_ROLE_SLUGS`
 * (`lib/shared/visitorRoles.js`), qui ne retient que `visiteur`. Ce test fixe les deux
 * versants : le personnel parle, le visiteur non.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const crypto = require('node:crypto');
const { initDatabase, queryOne, execute } = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { recomputeUserRole } = require('../lib/effectiveRole');

test.before(async () => {
  await initDatabase();
});

/** Compte élève inscrit puis reconnecté avec le profil demandé. */
async function accountWithRole(prefix, roleSlug) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `${prefix.toLowerCase()}_${stamp}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Part${stamp}`,
      email,
      password: 'pass1234',
      affiliation: 'both',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, roleSlug);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: email, password: 'pass1234' })
    .expect(200);
  return { id: res.body.id, email, token: login.body.authToken };
}

/**
 * Groupe « personnels » sans profil par défaut, et rattachement d'un compte.
 *
 * Le forum est cloisonné par groupe pour tout compte sans vue globale
 * (`resolveForumVisibleGroupIds`) : ouvrir un sujet suppose d'appartenir à au moins un
 * groupe, pour le personnel comme pour un élève. `default_role_id` reste nul pour que le
 * rattachement ne confère aucun profil et que le compte garde « Personnel ».
 */
async function attachToStaffGroup(userId) {
  const slug = 'test-personnels-forum';
  let group = await queryOne('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [slug]);
  if (!group?.id) {
    const groupId = crypto.randomUUID();
    await execute(
      "INSERT INTO `groups` (id, slug, name, kind, default_role_id, is_active) VALUES (?, ?, ?, 'class', NULL, 1)",
      [groupId, slug, 'Personnels (test)'],
    );
    group = { id: groupId };
  }
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [group.id, userId],
  );
  await recomputeUserRole(userId);
  return group.id;
}

/** Une zone quelconque, pour porter un commentaire de contexte. */
async function anyZoneId() {
  const zone = await queryOne('SELECT id FROM zones LIMIT 1');
  if (zone?.id) return zone.id;
  const id = `zone_part_${Date.now()}`;
  await execute('INSERT INTO zones (id, name) VALUES (?, ?)', [id, 'Zone test participation']);
  return id;
}

test('Personnel : le forum est ouvert (lecture, sujet, réaction)', async () => {
  const personnel = await accountWithRole('Agent', 'personnel');
  await attachToStaffGroup(personnel.id);

  await request(app)
    .get('/api/forum/threads')
    .set('Authorization', `Bearer ${personnel.token}`)
    .expect(200);

  const created = await request(app)
    .post('/api/forum/threads')
    .set('Authorization', `Bearer ${personnel.token}`)
    .send({ title: 'Ampoule grillée préau', body: 'Signalée ce matin par le service technique.' });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  assert.ok(created.body?.thread?.id, JSON.stringify(created.body));
  const postId = created.body?.first_post_id;
  assert.ok(postId, 'Premier message du sujet introuvable');

  // Réagir : même garde de participation que la publication.
  const reacted = await request(app)
    .post(`/api/forum/posts/${postId}/reactions`)
    .set('Authorization', `Bearer ${personnel.token}`)
    .send({ emoji: '👍' });
  assert.strictEqual(reacted.status, 200, JSON.stringify(reacted.body));
});

test('Personnel : les commentaires de contexte sont ouverts', async () => {
  const personnel = await accountWithRole('Aed', 'personnel');
  const zoneId = await anyZoneId();

  await request(app)
    .get('/api/context-comments')
    .query({ contextType: 'zone', contextId: zoneId })
    .set('Authorization', `Bearer ${personnel.token}`)
    .expect(200);

  const posted = await request(app)
    .post('/api/context-comments')
    .set('Authorization', `Bearer ${personnel.token}`)
    .send({
      contextType: 'zone',
      contextId: zoneId,
      body: 'Le portillon de cette zone ne se referme plus correctement.',
    });
  assert.strictEqual(posted.status, 201, JSON.stringify(posted.body));
});

test('Visiteur : forum et commentaires restent fermés', async () => {
  const visiteur = await accountWithRole('Visi', 'visiteur');
  const zoneId = await anyZoneId();

  await request(app)
    .get('/api/forum/threads')
    .set('Authorization', `Bearer ${visiteur.token}`)
    .expect(403);

  await request(app)
    .post('/api/context-comments')
    .set('Authorization', `Bearer ${visiteur.token}`)
    .send({ contextType: 'zone', contextId: zoneId, body: 'Un visiteur ne publie pas ici.' })
    .expect(403);
});
