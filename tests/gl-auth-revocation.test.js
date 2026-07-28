'use strict';

/**
 * Non-régression audit B6 (docs/AUDIT_BUGS_2026-07.md) : les droits Gnomes & Licornes sont
 * relus en base à CHAQUE requête, comme côté ForetMap. Un jeton déjà émis ne doit donc plus
 * survivre à une rétrogradation de rôle, à une désactivation ni à une suppression de compte.
 *
 * Avant le correctif, le tableau `permissions` était lu tel quel dans le JWT : la révocation
 * n'avait aucun effet avant expiration (90 min par défaut, jusqu'à 7 jours).
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();

let admin;
let player;
let adminToken;
let playerToken;

/**
 * Sonde de permission sur une route réservée à `gl.settings.manage` (admin GL, pas MJ).
 *
 * La clé de module est volontairement inconnue : un appelant AUTORISÉ atteint le handler et
 * repart avec **400 « Clé module inconnue »** (aucun réglage n'est écrit — la base de test est
 * partagée), tandis qu'un appelant NON autorisé est arrêté en **403** par le middleware. On
 * teste donc exactement la couche permission, sans dépendre du contrat de la route.
 */
function probeGlSettingsPermission(token) {
  return request(app)
    .put('/api/gl/admin/settings/modules.__audit_b6_probe')
    .set('Authorization', `Bearer ${token}`)
    .send({ value: true });
}

/** Route de lecture GL ouverte à tout compte authentifié. */
function getGlWorld(token) {
  return request(app).get('/api/gl/content/world').set('Authorization', `Bearer ${token}`);
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();

  admin = await createGlAdmin({
    email: `revocation.mj.${stamp}@ecole.local`,
    displayName: 'MJ Révocation',
    role: 'admin',
  });
  const cls = await createGlClass({ name: `Classe Révocation ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({ classId: cls.id, pseudo: `revocation-player-${stamp}` });

  // Jetons volontairement émis AVEC des permissions étendues : elles ne doivent plus faire foi.
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
    displayName: 'MJ Révocation',
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: 'Joueur Révocation',
  });
});

describe('B6 — les droits GL sont relus en base à chaque requête', () => {
  it('un admin GL actif franchit la garde gl.settings.manage (cas nominal)', async () => {
    await execute("UPDATE gl_admins SET role = 'admin', is_active = 1 WHERE id = ?", [admin.id]);
    const res = await probeGlSettingsPermission(adminToken);
    assert.equal(res.status, 400, `attendu 400 (handler atteint): ${JSON.stringify(res.body)}`);
  });

  it('rétrograder l’admin en MJ retire gl.settings.manage sans réémettre de jeton', async () => {
    await execute("UPDATE gl_admins SET role = 'mj' WHERE id = ?", [admin.id]);
    const res = await probeGlSettingsPermission(adminToken);
    assert.equal(res.status, 403, `réponse inattendue: ${JSON.stringify(res.body)}`);

    // Le MJ garde en revanche ses droits de lecture : c'est bien une rétrogradation ciblée.
    const read = await getGlWorld(adminToken);
    assert.equal(read.status, 200);
  });

  it('désactiver le compte invalide le jeton déjà émis', async () => {
    await execute('UPDATE gl_admins SET is_active = 0 WHERE id = ?', [admin.id]);
    const res = await getGlWorld(adminToken);
    assert.equal(res.status, 401, `réponse inattendue: ${JSON.stringify(res.body)}`);
  });

  it('désactiver un joueur invalide son jeton', async () => {
    const before = await getGlWorld(playerToken);
    assert.equal(before.status, 200);

    await execute('UPDATE gl_players SET is_active = 0 WHERE id = ?', [player.id]);
    const after = await getGlWorld(playerToken);
    assert.equal(after.status, 401, `réponse inattendue: ${JSON.stringify(after.body)}`);
  });

  it('supprimer le joueur invalide son jeton', async () => {
    await execute('UPDATE gl_players SET is_active = 1 WHERE id = ?', [player.id]);
    assert.equal((await getGlWorld(playerToken)).status, 200);

    await execute('DELETE FROM gl_players WHERE id = ?', [player.id]);
    const res = await getGlWorld(playerToken);
    assert.equal(res.status, 401, `réponse inattendue: ${JSON.stringify(res.body)}`);
  });

  it('un jeton ne peut pas s’octroyer une permission absente de son rôle', async () => {
    // Jeton forgé avec TOUTES les permissions staff, mais identité de simple joueur.
    const cls = await createGlClass({ name: `Classe Escalade ${stamp}`, adminId: admin.id });
    const modest = await createGlPlayer({ classId: cls.id, pseudo: `escalade-${stamp}` });
    const forged = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(modest.id),
      roleSlug: 'gl_admin',
      permissions: [
        'gl.read',
        'gl.content.manage',
        'gl.players.manage',
        'gl.game.manage',
        'gl.settings.manage',
      ],
      displayName: 'Joueur ambitieux',
    });
    const res = await probeGlSettingsPermission(forged);
    assert.equal(res.status, 403, `réponse inattendue: ${JSON.stringify(res.body)}`);
  });

  it('désactiver l’acteur invalide un jeton d’impersonation déjà émis', async () => {
    await execute("UPDATE gl_admins SET role = 'admin', is_active = 1 WHERE id = ?", [admin.id]);
    const cls = await createGlClass({ name: `Classe Impersonation ${stamp}`, adminId: admin.id });
    const target = await createGlPlayer({ classId: cls.id, pseudo: `impersonated-${stamp}` });
    const impersonationToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(target.id),
      roleSlug: 'gl_player',
      permissions: ['gl.read'],
      displayName: target.pseudo || 'Joueur',
      impersonating: true,
      actorUserType: 'gl_admin',
      actorUserId: String(admin.id),
      actorRoleSlug: 'gl_admin',
    });

    assert.equal((await getGlWorld(impersonationToken)).status, 200);

    await execute('UPDATE gl_admins SET is_active = 0 WHERE id = ?', [admin.id]);
    const after = await getGlWorld(impersonationToken);
    assert.equal(after.status, 401, `réponse inattendue: ${JSON.stringify(after.body)}`);
  });
});
