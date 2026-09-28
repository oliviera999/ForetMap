require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const AdmZip = require('adm-zip');
const { initDatabase, initSchema, queryOne, execute } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { setAssignedRole } = require('../lib/effectiveRole');
const { UPLOADS_DIR } = require('../lib/uploads');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  FORET_EXPORT_ENTRIES,
  GL_EXPORT_ENTRIES,
  GLOBAL_SECRET_COLUMNS,
} = require('../lib/accounts/exportRegistry');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');

/**
 * Audit RGPD du 28/09/2026 (S-5, recommandation R4) : chacun télécharge l'archive de ses
 * données (droit d'accès et de portabilité), l'admin peut la produire pour un compte.
 */

const suffix = Date.now();
const avatarRel = `tests-export/${suffix}/avatar.txt`;
let adminToken;
let alice;
let bob;

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function register(firstName) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName, lastName: `Export${suffix}`, password: 'pass1234' })
    .expect(201);
  // Sans groupe, l'inscription retombe sur `visiteur`, qu'on ne peut pas inscrire à une tâche.
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  await setAssignedRole(res.body.id, role.id);
  return { id: res.body.id, firstName, lastName: res.body.last_name, token: res.body.authToken };
}

function readArchive(buffer) {
  const zip = new AdmZip(buffer);
  const names = zip.getEntries().map((e) => e.entryName);
  const json = zip.readAsText('donnees.json');
  return { names, json, data: JSON.parse(json), readme: zip.readAsText('LISEZMOI.txt'), zip };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  alice = await register('Alice');
  bob = await register('Bob');

  fs.mkdirSync(path.join(UPLOADS_DIR, path.dirname(avatarRel)), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, avatarRel), 'avatar alice');
  await execute('UPDATE users SET avatar_path = ? WHERE id = ?', [avatarRel, alice.id]);

  const zones = await request(app).get('/api/zones').expect(200);
  const task = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: `Export RGPD ${suffix}`,
      zone_id: zones.body[0]?.id || 'pg',
      required_students: 3,
    })
    .expect(201);
  for (const s of [alice, bob]) {
    const body = { firstName: s.firstName, lastName: s.lastName, studentId: s.id };
    await request(app)
      .post(`/api/tasks/${task.body.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/done`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...body, comment: `Compte rendu de ${s.firstName} ${suffix}` })
      .expect(200);
  }
});

test.after(() => {
  fs.rmSync(path.join(UPLOADS_DIR, 'tests-export', String(suffix)), {
    recursive: true,
    force: true,
  });
});

test('registre : sections uniques, aucune colonne secrète exportable', () => {
  const sections = [...FORET_EXPORT_ENTRIES, ...GL_EXPORT_ENTRIES].map((e) => e.section);
  assert.strictEqual(new Set(sections).size, sections.length);
  for (const col of [
    'password_hash',
    'legacy_password_hash',
    'token_epoch',
    'token_hash',
    'pin_hash',
  ]) {
    assert.ok(GLOBAL_SECRET_COLUMNS.includes(col), col);
  }
});

test('personalDataExportFilename : nom de fichier sûr et daté', async () => {
  const { personalDataExportFilename } = await import('../src/shared/personalDataExport.js');
  const day = new Date('2026-09-28T10:00:00Z');
  assert.strictEqual(personalDataExportFilename('mes-donnees', day), 'mes-donnees-2026-09-28.zip');
  assert.strictEqual(
    personalDataExportFilename('données-Élodie/../x', day),
    'donnees-Elodie-x-2026-09-28.zip',
  );
  assert.strictEqual(personalDataExportFilename('', day), 'mes-donnees-2026-09-28.zip');
});

test('GET /api/auth/me/export sans jeton → 401', async () => {
  await request(app).get('/api/auth/me/export').expect(401);
});

test('GET /api/auth/me/export : archive ZIP de ses seules données, fichiers joints, sans secret', async () => {
  const res = await request(app)
    .get('/api/auth/me/export')
    .set('Authorization', `Bearer ${alice.token}`)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  assert.match(res.headers['content-type'], /application\/zip/);
  assert.match(res.headers['content-disposition'], /attachment; filename="donnees-personnelles-/);
  assert.strictEqual(res.headers['cache-control'], 'no-store');

  const archive = readArchive(res.body);
  assert.ok(archive.names.includes('donnees.json'));
  assert.ok(archive.names.includes('LISEZMOI.txt'));
  assert.ok(archive.names.includes(`fichiers/${avatarRel}`));
  assert.strictEqual(archive.zip.readAsText(`fichiers/${avatarRel}`), 'avatar alice');

  const { data, json } = archive;
  assert.strictEqual(data.format, 'foretmap-personal-data-export');
  assert.strictEqual(data.personne.id, String(alice.id));
  assert.strictEqual(data.sections.compte.lignes.length, 1);
  assert.strictEqual(data.sections.compte.lignes[0].first_name, 'Alice');
  assert.ok(!('password_hash' in data.sections.compte.lignes[0]));
  assert.ok(!('token_epoch' in data.sections.compte.lignes[0]));
  assert.doesNotMatch(json, /\$2[aby]\$/, 'aucun hachage bcrypt dans l’export');

  assert.strictEqual(data.sections.taches_inscriptions.lignes.length, 1);
  const logs = data.sections.taches_comptes_rendus.lignes;
  assert.strictEqual(logs.length, 1);
  assert.match(logs[0].comment, /Compte rendu de Alice/);
  assert.doesNotMatch(json, new RegExp(`Compte rendu de Bob ${suffix}`), 'rien du camarade');
  assert.match(archive.readme, /donnees\.json/);
});

test('GET /api/rbac/users/:type/:id/export : réservé à admin.users.export, journalisé', async () => {
  await request(app)
    .get(`/api/rbac/users/student/${alice.id}/export`)
    .set('Authorization', `Bearer ${bob.token}`)
    .expect(403);

  const res = await request(app)
    .get(`/api/rbac/users/student/${alice.id}/export`)
    .set('Authorization', `Bearer ${adminToken}`)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  const { data } = readArchive(res.body);
  assert.strictEqual(data.personne.id, String(alice.id));

  const audit = await queryOne(
    "SELECT action FROM audit_log WHERE action = 'admin_personal_data_export' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [String(alice.id)],
  );
  assert.ok(audit, 'export administrateur tracé dans le journal d’audit');
});

test('GET /api/rbac/users/:type/:id/export : compte inconnu → 404', async () => {
  const res = await request(app)
    .get('/api/rbac/users/student/inexistant-export/export')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.ok([400, 404].includes(res.status), `statut ${res.status}`);
});

test('GET /api/gl/auth/me/export : joueur → archive G&L avec sa fiche de compte ; jeton ForetMap refusé', async () => {
  const glAdmin = await createGlAdmin({ email: `gl.export.${suffix}@ecole.local` });
  const glClass = await createGlClass({ name: `Classe export ${suffix}`, adminId: glAdmin.id });
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo: `gl-export-${suffix}`,
    firstName: 'Gaspard',
    lastName: `Export${suffix}`,
  });
  const { playerToken } = await signTokens({ playerId: player.id, playerPseudo: player.pseudo });

  await request(app).get('/api/gl/auth/me/export').expect(401);
  await request(app)
    .get('/api/gl/auth/me/export')
    .set('Authorization', `Bearer ${alice.token}`)
    .expect((r) => assert.ok([401, 403].includes(r.status), `statut ${r.status}`));

  const res = await request(app)
    .get('/api/gl/auth/me/export')
    .set('Authorization', `Bearer ${playerToken}`)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  const { data, json } = readArchive(res.body);
  assert.strictEqual(data.personne.produit, 'gl');
  assert.strictEqual(data.sections.gl_joueur.lignes.length, 1);
  assert.strictEqual(data.sections.gl_joueur.lignes[0].pseudo, player.pseudo);
  assert.ok(!('legacy_password_hash' in data.sections.gl_joueur.lignes[0]));
  assert.strictEqual(data.sections.compte.lignes[0].first_name, 'Gaspard');
  assert.doesNotMatch(json, /\$2[aby]\$/);
  assert.ok(!data.sections.taches_inscriptions, 'pas d’activité ForetMap dans l’export G&L');
});
