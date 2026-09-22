'use strict';

/**
 * Porte du plan des personnels : **profil attribué** quand un groupe a changé le profil effectif.
 *
 * Régression corrigée ici : le profil effectif (`user_roles.is_primary`) n'est pas ce qu'un
 * administrateur attribue. Un groupe actif confère le sien dès qu'il est de rang supérieur, et
 * « Personnel » était alors le plus bas du catalogue (rang 50, sous « n3beur novice » à 100). Un
 * personnel rattaché à un groupe — vie scolaire qui suit une classe, agent inscrit à un projet —
 * se retrouvait donc avec un profil effectif d'élève, sans `staff_plan.access` ni case cochée :
 * « Connexion réussie, mais ce compte n'a pas encore l'accès au plan des personnels », alors que
 * sa fiche affichait bien « Personnel ».
 *
 * Deux défenses, testées ici toutes les deux :
 *   1. le **rang** (320 depuis le réalignement du 22/09/2026, migration 269) : un groupe de
 *      classe ne recouvre plus le profil, le cas ne se produit donc plus par ce chemin ;
 *   2. le **repli sur le profil attribué** dans `resolveAccountStaffPlanAccess`, qui reste
 *      nécessaire — un groupe qui **impose** son profil (`force_default_role`) passe devant le
 *      rang, et rien n'interdit à un administrateur de rebaisser celui de « Personnel ».
 */

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { initSchema, queryOne, execute } = require('../database');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { buildAuthzPayload } = require('../lib/rbac');
const { resolveAccountStaffPlanAccess } = require('../lib/staffPlanAccess');
const { addUserToGroup } = require('../lib/groupMembers');

before(async () => {
  await initSchema();
});

async function createAccount({ roleSlug, userType }) {
  const id = crypto.randomUUID();
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `profil ${roleSlug} absent du catalogue`);
  await execute(
    `INSERT INTO users (id, user_type, assigned_role_id, email, first_name, last_name, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test', ?, ?, 1, NOW(), NOW())`,
    [
      id,
      userType,
      role.id,
      `staffassign.${roleSlug}.${id.slice(0, 8)}@pedagolyautey.org`,
      roleSlug,
      `Test ${roleSlug}`,
    ],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    [userType, id, role.id],
  );
  await recomputeUserRole(id);
  return id;
}

/** Groupe actif dont le profil par défaut est `roleSlug`. */
async function createGroup(roleSlug, { force = false } = {}) {
  const id = crypto.randomUUID();
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  await execute(
    'INSERT INTO `groups` (id, name, slug, default_role_id, force_default_role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [id, `Groupe ${id.slice(0, 8)}`, `grp-${id.slice(0, 8)}`, role.id, force ? 1 : 0],
  );
  return id;
}

/** Accès de ce compte à la porte, tel que la connexion et `/api/staff-plan/*` le calculent. */
async function staffAccessOf(userId, userType) {
  const authz = await buildAuthzPayload(userType, userId);
  return resolveAccountStaffPlanAccess({ ...authz, userId, userType });
}

describe('Plan des personnels — profil attribué vs profil effectif', () => {
  it('un « Personnel » rattaché à un groupe de classe garde son profil (rang 320)', async () => {
    const userId = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const groupId = await createGroup('eleve_novice');
    const attach = await addUserToGroup(userId, groupId);
    assert.ok(attach.ok, `rattachement refusé : ${attach.error || ''}`);
    await recomputeUserRole(userId);

    // Première défense : le groupe ne prend plus la main, « le plus élevé l'emporte » jouant
    // désormais en faveur du personnel (320 contre 100).
    const authz = await buildAuthzPayload('student', userId);
    assert.equal(authz.roleSlug, 'personnel');
    assert.equal(authz.permissions.includes('staff_plan.access'), true);

    const access = await staffAccessOf(userId, 'student');
    assert.equal(access.ok, true, 'le personnel reste refusé à sa propre porte');
    // Plus besoin du repli : l'accès passe par le profil effectif lui-même.
    assert.equal(access.via, 'role');
    assert.equal(access.roleSlug, 'personnel');
  });

  /** Seconde défense : un groupe qui **impose** son profil passe devant le rang. */
  it('le repli sur le profil attribué joue quand le groupe impose son profil', async () => {
    const userId = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const groupId = await createGroup('eleve_novice', { force: true });
    const attach = await addUserToGroup(userId, groupId);
    assert.ok(attach.ok, `rattachement refusé : ${attach.error || ''}`);
    await recomputeUserRole(userId);

    // Le profil effectif est bien celui du groupe : c'est la situation que le repli couvre.
    const authz = await buildAuthzPayload('student', userId);
    assert.equal(authz.roleSlug, 'eleve_novice');
    assert.equal(authz.permissions.includes('staff_plan.access'), false);

    const access = await staffAccessOf(userId, 'student');
    assert.equal(access.ok, true);
    assert.equal(access.via, 'assigned_role');
    // Le profil d'audience suit le profil attribué : il voit ce qu'un personnel doit voir.
    assert.equal(access.roleSlug, 'personnel');
  });

  it('sans groupe, rien ne change : l’accès passe par le profil effectif', async () => {
    const userId = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const access = await staffAccessOf(userId, 'student');
    assert.equal(access.ok, true);
    assert.equal(access.via, 'role');
    assert.equal(access.roleSlug, 'personnel');
  });

  it('un compte sans profil de personnel reste refusé, et le refus nomme son profil', async () => {
    const userId = await createAccount({ roleSlug: 'eleve_novice', userType: 'student' });
    const access = await staffAccessOf(userId, 'student');
    assert.equal(access.ok, false);
    assert.equal(access.roleSlug, 'eleve_novice');
  });

  it('le profil attribué n’ajoute aucune permission au lecteur', async () => {
    const userId = await createAccount({ roleSlug: 'prof_classe', userType: 'student' });
    const groupId = await createGroup('eleve_novice');
    await addUserToGroup(userId, groupId);
    await recomputeUserRole(userId);
    const authz = await buildAuthzPayload('student', userId);
    const access = await resolveAccountStaffPlanAccess({
      ...authz,
      userId,
      userType: 'student',
    });
    assert.equal(access.ok, true);
    // `resolveAccountStaffPlanAccess` ne renvoie qu'un verdict et un profil d'audience : les
    // permissions du lecteur ne sont jamais remplacées par celles du profil attribué.
    assert.equal(Object.prototype.hasOwnProperty.call(access, 'permissions'), false);
  });
});
