'use strict';

/**
 * Niveau de contenu des comptes non élèves (demande du 22/11/2026, migration 387).
 *
 * Ordre de résolution : visite invitée > aperçu (session) > séance en cours > choix explicite du
 * profil (`users.pedago_content_level`, `complet` = vue gestion) > niveau des groupes du compte
 * (le plus haut, héritage du parent compris) > cycle 3. Le défaut est calculé, jamais écrit.
 * Les élèves sont inchangés : le réglage leur est refusé (403).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole } = require('../lib/effectiveRole');
const {
  resolveLearnerLevel,
  loadLearnerLevel,
  loadLearnerLevelForRequest,
  readPedagoPreviewParam,
  STAFF_DEFAULT_NIVEAU,
} = require('../lib/pedago/learnerLevel');
const {
  STAFF_CONTENT_LEVEL_ENUM,
  normalizeStaffContentLevel,
} = require('../lib/shared/pedagoEnums');

const SEANCE_LYCEE = { level: 'lycee', notionNiveau: null };

// --- Cœur pur -------------------------------------------------------------------------------

test('compte non élève sans choix ni groupe : cycle 3 (et non plus la vue complète)', () => {
  const out = resolveLearnerLevel({ staff: true });
  assert.equal(STAFF_DEFAULT_NIVEAU, 'cycle3');
  assert.equal(out.niveau, 'cycle3');
  assert.equal(out.etape, 'college');
  assert.equal(out.maxPalier, 1);
  assert.equal(out.sources.niveau, 'defaut');
});

test('défaut = le plus haut niveau des groupes du compte', () => {
  const out = resolveLearnerLevel({ staff: true, classNiveaux: ['cycle3', 'seconde', 'cycle4'] });
  assert.equal(out.niveau, 'seconde');
  assert.equal(out.etape, 'lycee');
  assert.equal(out.sources.niveau, 'classe');
});

test('les replis hérités de l’élève ne comptent pas pour un compte non élève', () => {
  // Étape de groupe, carte et défaut de l'établissement : ignorés, le défaut reste le cycle 3.
  const out = resolveLearnerLevel({
    staff: true,
    groupLevels: ['lycee'],
    mapLevel: 'universite',
    siteDefault: 'lycee',
  });
  assert.equal(out.niveau, 'cycle3');
  assert.equal(out.sources.niveau, 'defaut');
});

test('choix explicite du profil : il passe devant les groupes', () => {
  const out = resolveLearnerLevel({
    staff: true,
    contentLevel: 'cycle4',
    classNiveaux: ['terminale_spe'],
  });
  assert.equal(out.niveau, 'cycle4');
  assert.equal(out.maxPalier, 2);
  assert.equal(out.sources.niveau, 'profil');
});

test('« Complet (vue gestion) » : université, aucune borne', () => {
  const out = resolveLearnerLevel({
    staff: true,
    contentLevel: 'complet',
    classNiveaux: ['cycle3'],
  });
  assert.equal(out.niveau, 'universite');
  assert.equal(out.etape, 'universite');
  assert.equal(out.maxPalier, null);
  assert.equal(out.sources.niveau, 'vue_complete');
});

test('choix inconnu ignoré : retour au niveau des groupes', () => {
  const out = resolveLearnerLevel({
    staff: true,
    contentLevel: 'college',
    classNiveaux: ['cycle4'],
  });
  assert.equal(out.niveau, 'cycle4');
  assert.equal(out.sources.niveau, 'classe');
});

test('la préférence d’affichage d’élève ne s’applique pas à un compte non élève', () => {
  const out = resolveLearnerLevel({
    staff: true,
    contentLevel: 'seconde',
    userPreference: 'college',
  });
  assert.equal(out.etape, 'lycee');
  assert.equal(out.sources.affichage, 'profil');
});

test('ordre : invité > aperçu > séance > profil', () => {
  const base = { staff: true, contentLevel: 'complet', classNiveaux: ['seconde'] };
  assert.equal(resolveLearnerLevel({ ...base, isGuest: true }).sources.niveau, 'invite');
  const apercu = resolveLearnerLevel({ ...base, teacherPreview: 'cycle3', session: SEANCE_LYCEE });
  assert.equal(apercu.niveau, 'cycle3');
  assert.equal(apercu.sources.niveau, 'apercu');
  const seance = resolveLearnerLevel({ ...base, session: SEANCE_LYCEE });
  assert.equal(seance.etape, 'lycee');
  assert.equal(seance.sources.niveau, 'seance');
  assert.equal(resolveLearnerLevel(base).sources.niveau, 'vue_complete');
});

test('élève inchangé : le choix de contenu ne le concerne pas', () => {
  const eleve = resolveLearnerLevel({ contentLevel: 'complet', classNiveaux: ['cycle3'] });
  assert.equal(eleve.niveau, 'cycle3');
  assert.equal(eleve.sources.niveau, 'classe');
  const sansClasse = resolveLearnerLevel({ contentLevel: 'complet', siteDefault: 'college' });
  assert.equal(sansClasse.sources.niveau, 'site');
});

test('référentiel : niveaux de l’apprenant + complet, normalisation', () => {
  assert.equal(STAFF_CONTENT_LEVEL_ENUM.values.at(-1), 'complet');
  assert.ok(STAFF_CONTENT_LEVEL_ENUM.values.includes('cycle3'));
  assert.equal(normalizeStaffContentLevel(' Seconde '), 'seconde');
  assert.equal(normalizeStaffContentLevel('lycee'), null);
  assert.equal(normalizeStaffContentLevel(''), null);
  assert.equal(normalizeStaffContentLevel(null), null);
});

test('paramètre d’aperçu : niveau ou étape reconnus seulement', () => {
  assert.equal(readPedagoPreviewParam({ query: { pedagoPreview: 'cycle4' } }), 'cycle4');
  assert.equal(readPedagoPreviewParam({ query: { pedagoPreview: 'lycee' } }), 'lycee');
  assert.equal(readPedagoPreviewParam({ query: { pedagoPreview: 'complet' } }), null);
  assert.equal(readPedagoPreviewParam({ query: { pedagoPreview: ['a'] } }), null);
  assert.equal(readPedagoPreviewParam(null), null);
});

test('libellés d’interface du niveau d’un compte non élève (miroir ESM)', async () => {
  const ui = await import('../src/utils/learnerLevel.js');
  assert.equal(
    ui.staffContentLevelLabel(ui.resolveLearnerLevel({ staff: true })),
    'Cycle 3 (CM1–6e) — par défaut',
  );
  assert.equal(
    ui.staffContentLevelLabel(ui.resolveLearnerLevel({ staff: true, classNiveaux: ['cycle4'] })),
    'Cycle 4 (5e–3e) — mes groupes',
  );
  assert.equal(
    ui.staffContentLevelLabel(ui.resolveLearnerLevel({ staff: true, contentLevel: 'complet' })),
    'Complet (vue gestion)',
  );
  assert.deepEqual(
    ui.STAFF_CONTENT_LEVEL_OPTIONS.map((o) => o.value),
    [...STAFF_CONTENT_LEVEL_ENUM.values],
  );
});

// --- Base et API ----------------------------------------------------------------------------

test.before(async () => {
  await initSchema();
});

const stamp = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function createAccount(userType) {
  const id = crypto.randomUUID();
  const s = stamp();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Niv', ?, ?, 'local', 1, NOW(), NOW())`,
    [id, userType, `niv_${s}@example.com`, `niv_${s}`, s, `Niv ${s}`],
  );
  await recomputeUserRole(id);
  return id;
}

async function tokenFor(userType, userId) {
  const role = await queryOne(
    `SELECT r.id, r.slug, r.\`rank\` FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [userType, userId],
  );
  const epoch = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [userId]);
  return signAuthToken({
    userType,
    userId,
    roleId: role?.id,
    roleSlug: role?.slug,
    roleRank: role?.rank,
    tokenEpoch: Number(epoch?.token_epoch || 0),
  });
}

async function createGroup({ curriculumNiveau = null, parentId = null } = {}) {
  const id = crypto.randomUUID();
  const s = stamp();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, parent_group_id, curriculum_niveau, is_active,
                            created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, ?, 1, NOW(), NOW())`,
    [id, `niv-${s}`, `Niveau ${s}`, parentId, curriculumNiveau],
  );
  return id;
}

async function join(groupId, userId, userType = 'teacher') {
  await execute(
    'INSERT INTO group_members (group_id, user_id, user_type, joined_at) VALUES (?, ?, ?, NOW())',
    [groupId, userId, userType],
  );
}

test('serveur : prof sans groupe → cycle 3 ; groupe enfant hérite du parent ; plus haut niveau', async () => {
  const teacher = await createAccount('teacher');
  let level = await loadLearnerLevel(teacher);
  assert.equal(level.niveau, 'cycle3');
  assert.equal(level.sources.niveau, 'defaut');

  // Groupe enfant sans niveau propre : il hérite du cycle 4 de son parent.
  const parent = await createGroup({ curriculumNiveau: 'cycle4' });
  const child = await createGroup({ parentId: parent });
  await join(child, teacher);
  level = await loadLearnerLevel(teacher);
  assert.equal(level.niveau, 'cycle4');
  assert.equal(level.sources.niveau, 'classe');

  // Deuxième groupe plus haut : le plus haut l'emporte. Le défaut suit les groupes (calculé).
  await join(await createGroup({ curriculumNiveau: 'seconde' }), teacher);
  level = await loadLearnerLevel(teacher);
  assert.equal(level.niveau, 'seconde');
  const row = await queryOne('SELECT pedago_content_level FROM users WHERE id = ?', [teacher]);
  assert.equal(row.pedago_content_level, null, 'le défaut n’est jamais écrit en base');
});

test('serveur : choix explicite, « Complet », aperçu annoncé cru pour un compte non élève seul', async () => {
  const teacher = await createAccount('teacher');
  await execute("UPDATE users SET pedago_content_level = 'premiere_spe' WHERE id = ?", [teacher]);
  let level = await loadLearnerLevel(teacher);
  assert.equal(level.niveau, 'premiere_spe');
  assert.equal(level.sources.niveau, 'profil');

  const viaPreview = await loadLearnerLevelForRequest({
    auth: { userId: teacher },
    query: { pedagoPreview: 'cycle3' },
  });
  assert.equal(viaPreview.niveau, 'cycle3');
  assert.equal(viaPreview.sources.niveau, 'apercu');

  await execute("UPDATE users SET pedago_content_level = 'complet' WHERE id = ?", [teacher]);
  level = await loadLearnerLevel(teacher);
  assert.equal(level.sources.niveau, 'vue_complete');
  assert.equal(level.maxPalier, null);

  // Un élève qui annonce un aperçu n'obtient rien : sa classe fait foi.
  const student = await createAccount('student');
  await join(await createGroup({ curriculumNiveau: 'cycle3' }), student, 'student');
  const eleve = await loadLearnerLevelForRequest({
    auth: { userId: student },
    query: { pedagoPreview: 'universite' },
  });
  assert.equal(eleve.niveau, 'cycle3');
  assert.equal(eleve.sources.niveau, 'classe');
});

test('API : lecture (/me), écriture, valeur invalide → 400, retour au défaut', async () => {
  const teacher = await createAccount('teacher');
  const token = await tokenFor('teacher', teacher);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.profile.pedago_content_level, null);
  assert.equal(me.body.learnerLevel.niveau, 'cycle3');

  const set = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: 'Cycle4' })
    .expect(200);
  assert.equal(set.body.pedago_content_level, 'cycle4');

  const bad = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: 'lycee' })
    .expect(400);
  assert.match(bad.body.error, /pedago_content_level invalide/);

  const full = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: 'complet' })
    .expect(200);
  assert.equal(full.body.pedago_content_level, 'complet');
  const me2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me2.body.profile.pedago_content_level, 'complet');
  assert.equal(me2.body.learnerLevel.sources.niveau, 'vue_complete');

  // « Revenir au niveau de mes groupes » : NULL en base.
  const reset = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: null })
    .expect(200);
  assert.equal(reset.body.pedago_content_level, null);
  const row = await queryOne('SELECT pedago_content_level FROM users WHERE id = ?', [teacher]);
  assert.equal(row.pedago_content_level, null);
});

test('API : un élève ne peut pas utiliser ce réglage (403, deux routes)', async () => {
  const student = await createAccount('student');
  const token = await tokenFor('student', student);
  const viaMe = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: 'complet' })
    .expect(403);
  assert.match(viaMe.body.error, /comptes non élèves/);
  await request(app)
    .patch(`/api/students/${student}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({ pedago_content_level: 'complet' })
    .expect(403);
  const row = await queryOne('SELECT pedago_content_level FROM users WHERE id = ?', [student]);
  assert.equal(row.pedago_content_level, null);
});
