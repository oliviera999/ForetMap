'use strict';

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  ensureRbacBootstrap,
  resetRbacBootstrapForTests,
  getRoleBySlug,
  ROLE_PERMISSION_MATRIX,
} = require('../lib/rbac');

describe('Semis RBAC durable', () => {
  before(async () => {
    await initSchema();
    resetRbacBootstrapForTests();
    await ensureRbacBootstrap();
  });

  /**
   * Le garde-fou qui manquait. Les tests d'alignement existants comparent la matrice JS au
   * catalogue JS — ils ne voient donc rien quand le semis n'écrit pas en base. C'est ce trou
   * qui a laissé passer une base neuve où `admin` n'avait pas `forum.group.moderate` :
   * personne ne pouvait modérer le forum, et `npm test` ne tombait que sur un test de forum,
   * loin de la cause. On affirme ici la propriété directement : ce que la matrice déclare,
   * la base le porte.
   */
  it('toute la matrice des profils système est réellement posée en base', async () => {
    for (const [slug, expectedKeys] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      const role = await getRoleBySlug(slug);
      if (!role) continue;
      const rows = await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [
        role.id,
      ]);
      const granted = new Set(rows.map((r) => r.permission_key));
      const missing = expectedKeys.filter((key) => !granted.has(key));
      assert.deepEqual(missing, [], `${slug} : permissions déclarées mais jamais posées`);
    }
  });

  it('une révocation sur profil système survit à un re-bootstrap', async () => {
    const role = await getRoleBySlug('prof');
    assert.ok(role);
    await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
      role.id,
      'audit.read',
    ]);
    let row = await queryOne(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? AND permission_key = ?',
      [role.id, 'audit.read'],
    );
    assert.ok(!row);

    resetRbacBootstrapForTests();
    await ensureRbacBootstrap();

    row = await queryOne(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? AND permission_key = ?',
      [role.id, 'audit.read'],
    );
    assert.ok(!row, 'audit.read ne doit pas être réinséré');

    // Restaurer pour ne pas polluer la suite de tests partagée.
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      role.id,
      'audit.read',
    ]);
  });

  it('prof_classe existe avec sa matrice minimale si neuf', async () => {
    const role = await getRoleBySlug('prof_classe');
    assert.ok(role);
    const rows = await queryAll(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? ORDER BY permission_key',
      [role.id],
    );
    const keys = rows.map((r) => r.permission_key);
    for (const expected of ROLE_PERMISSION_MATRIX.prof_classe) {
      assert.ok(keys.includes(expected), `manque ${expected}`);
    }
    assert.ok(!keys.includes('users.create'));
    assert.ok(!keys.includes('stats.read.all'));
  });

  it('personnel : rang 320, avec le seul accès au plan des personnels', async () => {
    const role = await getRoleBySlug('personnel');
    assert.ok(role);
    assert.equal(role.display_name, 'Personnel');
    /*
     * 320, et non plus 50 (réalignement du 22/09/2026, migration 277). Au rang du visiteur,
     * « le plus élevé l'emporte » faisait perdre à un personnel sa qualité de personnel dès
     * qu'il était rattaché à un groupe classe — donc `staff_plan.access`, donc l'entrée sur
     * proflyautey. Le rang ne lui donne rien au passage : la vue globale commence à 400.
     */
    assert.equal(Number(role.rank), 320);
    const rows = await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [
      role.id,
    ]);
    // Aucune action métier : `staff_plan.access` n'ouvre qu'une lecture, celle de proflyautey.
    assert.deepEqual(
      rows.map((r) => r.permission_key),
      ['staff_plan.access'],
    );
    const visitor = await getRoleBySlug('visiteur');
    assert.ok(visitor);
    assert.ok(Number(role.rank) > Number(visitor.rank));
    // Le visiteur, lui, n'y entre pas : c'est là que passe la frontière public / personnels.
    const visitorRows = await queryAll(
      'SELECT permission_key FROM role_permissions WHERE role_id = ?',
      [visitor.id],
    );
    assert.equal(visitorRows.length, 0);
  });

  /**
   * Le point qui a motivé tout le lot : une permission retirée à la main en base doit
   * **survivre au démarrage**.
   *
   * `teacher.access` a été retiré à « Prof de classe » par le script du 22/09/2026. Deux
   * mécanismes pourraient le reposer : le semis de `ensureDefaultRolesAndPermissions` (neutralisé
   * par `rbac_seeded_permissions`, migration 241, et par le retrait de la clé de la matrice) et
   * la migration 259, qui la réinsère explicitement (elle ne rejoue pas, `schema_version` étant
   * au-delà). Ce test fait tourner le semis pour de vrai et vérifie qu'il ne la repose pas.
   */
  it('teacher.access retiré à prof_classe n’est pas réinjecté par le semis', async () => {
    const role = await getRoleBySlug('prof_classe');
    assert.ok(role);
    assert.ok(
      !ROLE_PERMISSION_MATRIX.prof_classe.includes('teacher.access'),
      'la matrice livrée ne doit plus porter teacher.access sur prof_classe',
    );

    await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
      role.id,
      'teacher.access',
    ]);
    // Trace « déjà proposée à ce profil » : ce que posent la migration 241 puis la 269.
    await execute(
      'INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key) VALUES (?, ?)',
      [role.id, 'teacher.access'],
    );

    resetRbacBootstrapForTests();
    await ensureRbacBootstrap();

    const row = await queryOne(
      'SELECT permission_key FROM role_permissions WHERE role_id = ? AND permission_key = ?',
      [role.id, 'teacher.access'],
    );
    assert.ok(!row, 'teacher.access a été réinjecté sur prof_classe');
  });
});
