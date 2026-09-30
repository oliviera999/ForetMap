'use strict';

/**
 * Audit sécurité / RGPD du 30/09/2026 (`docs/AUDIT_SECURITE_RGPD_2026-09-30.md`) — filet des
 * correctifs applicatifs :
 *
 *  - AP2 : message d'erreur technique (pilote MySQL, `fs`) renvoyé tel quel au client ;
 *  - AP3 : injection de formules dans les exports CSV (OWASP CSV Injection) ;
 *  - AP4 : relais média public — cache par query string, écriture avant contrôle de taille,
 *    aucun quota par IP ;
 *  - AP6 : suivi des individus lisible sans filtre de carte / surface, champs personnels ;
 *  - AP7 : suppression d'un message du forum hors du périmètre de groupe du modérateur ;
 *  - AP9 : bombe ZIP (pack mascotte, classeur XLSX) ;
 *  - AP10 : corps JSON de 25 Mo analysé avant le 401 ;
 *  - § 6 : fin de séance pédagogique sans démarrage préalable (badge gratuit).
 *
 * (AP8 — `style` des contenus riches — est couvert côté Vitest :
 * `tests-ui/markdownStyleSanitize.test.js`.)
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const request = require('supertest');

const { publicErrorMessage, isPublicError } = require('../lib/shared/publicError');
const { csvCell, neutralizeCsvFormula } = require('../lib/shared/csvCell');
const { csvEscape } = require('../lib/importRows');
const { securityEventsToCsv } = require('../lib/securityEventsQuery');
const quizService = require('../lib/pedago/quizService');
const {
  normalizeRemoteMediaUrl,
  getRemoteMedia,
  setRemoteMediaFetchForTests,
  resetRemoteMediaStateForTests,
  cachePaths,
} = require('../lib/remoteMedia');
const { buildWorkbookBuffer, parseWorkbook } = require('../lib/spreadsheet');
const { initSchema, initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const silentLog = { error() {} };
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// --- AP2 : erreurs publiques ---------------------------------------------------------------

test('AP2 — publicErrorMessage : erreur MySQL, fs et TypeError masquées', () => {
  const sql = Object.assign(new Error('Deadlock found when trying to get lock; table `users`'), {
    code: 'ER_LOCK_DEADLOCK',
    errno: 1213,
    sqlState: '40001',
    sqlMessage: 'Deadlock found',
  });
  const fsErr = Object.assign(new Error("EACCES: permission denied, open '/srv/app/uploads/x'"), {
    code: 'EACCES',
    errno: -13,
    syscall: 'open',
    path: '/srv/app/uploads/x',
  });
  const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
  for (const err of [sql, fsErr, bug]) {
    assert.equal(isPublicError(err), false, err.message);
    assert.equal(publicErrorMessage(err, 'Générique', { log: silentLog }), 'Générique');
  }
  const server = Object.assign(new Error('Détail interne'), { statusCode: 503 });
  assert.equal(publicErrorMessage(server, 'Générique', { log: silentLog }), 'Générique');
});

test('AP2 — publicErrorMessage : erreur métier conservée', () => {
  assert.equal(
    publicErrorMessage(Object.assign(new Error('Colonne manquante'), { statusCode: 400 }), 'x'),
    'Colonne manquante',
  );
  assert.equal(publicErrorMessage(new Error('Jeton invalide'), 'x'), 'Jeton invalide');
  assert.equal(
    publicErrorMessage(Object.assign(new Error('Sûr'), { expose: true, statusCode: 500 }), 'x'),
    'Sûr',
  );
  assert.equal(publicErrorMessage(null, 'Défaut', { log: silentLog }), 'Défaut');
});

test('AP2 — QCM : une erreur SQL à l’enregistrement ne sort pas en 400', async () => {
  const sqlErr = Object.assign(new Error("Table 'foretmap.fm_quiz_questions' is locked"), {
    code: 'ER_LOCK_WAIT_TIMEOUT',
    errno: 1205,
    sqlMessage: 'Lock wait timeout exceeded',
  });
  await assert.rejects(
    quizService.saveQuestion(
      {},
      {
        withTransaction: async () => {
          throw sqlErr;
        },
      },
    ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.responseBody.error, 'Création impossible');
      assert.doesNotMatch(JSON.stringify(err.responseBody), /foretmap|Lock wait/);
      return true;
    },
  );
});

// --- AP3 : CSV ---------------------------------------------------------------------------------

test('AP3 — csvEscape / csvCell neutralisent les formules de tableur', () => {
  assert.equal(csvEscape('=HYPERLINK("http://x","clic")'), `"'=HYPERLINK(""http://x"",""clic"")"`);
  assert.equal(csvEscape('+33 6'), "'+33 6");
  assert.equal(csvEscape('-2+3'), "'-2+3");
  assert.equal(csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvEscape('\tcmd'), "'\tcmd");
  assert.equal(csvCell('\r=1'), `"'\r=1"`);
  // Inchangé : texte ordinaire, guillemets, nombres produits par le code.
  assert.equal(csvEscape('Dupont'), 'Dupont');
  assert.equal(csvEscape('a;b'), '"a;b"');
  assert.equal(csvCell(-3), '-3');
  assert.equal(neutralizeCsvFormula(null), '');
});

test('AP3 — export des événements de sécurité : User-Agent piégé neutralisé', () => {
  const csv = securityEventsToCsv([
    { id: 1, action: 'login_failed', user_agent: '=HYPERLINK("https://evil.example")' },
  ]);
  const line = csv.split(/\r?\n/)[1];
  assert.ok(line.includes(`"'=HYPERLINK(""https://evil.example"")"`), line);
  assert.ok(!/;=HYPERLINK/.test(line));
});

// --- AP4 : relais média -------------------------------------------------------------------------

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function fakeImageResponse(body = PNG_BYTES) {
  return {
    status: 200,
    ok: true,
    headers: {
      get: (name) => ({ 'content-type': 'image/png' })[String(name).toLowerCase()] ?? null,
    },
    body: null,
    arrayBuffer: async () => body,
  };
}

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

function clearCache(url) {
  const paths = cachePaths(normalizeRemoteMediaUrl(url));
  for (const p of [paths.body, paths.meta]) fs.rmSync(p, { force: true });
}

test('AP4 — la query string ne multiplie plus les entrées de cache', async () => {
  const base = `https://upload.wikimedia.org/wikipedia/commons/a/ab/ap4-${stamp}.png`;
  assert.equal(normalizeRemoteMediaUrl(`${base}?x=1`), base);
  assert.equal(normalizeRemoteMediaUrl(`${base}?x=2#frag`), base);
  assert.equal(
    normalizeRemoteMediaUrl(
      'https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg?width=300&x=9',
    ),
    'https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg?width=300',
  );
  resetRemoteMediaStateForTests();
  let called = 0;
  const upstream = [];
  setRemoteMediaFetchForTests(async (url) => {
    called += 1;
    upstream.push(url);
    return fakeImageResponse();
  });
  try {
    const served = [];
    for (let i = 1; i <= 3; i += 1) {
      served.push((await getRemoteMedia(`${base}?x=${i}`, { clientKey: '192.0.2.1' })).filePath);
    }
    assert.equal(new Set(served).size, 1, 'un seul fichier de cache');
    assert.equal(called, 1, 'une seule entrée de cache, un seul téléchargement amont');
    assert.equal(upstream[0], base, 'l’URL amont est aussi débarrassée de la query');
  } finally {
    setRemoteMediaFetchForTests(null);
    clearCache(base);
  }
});

test('AP4 — quota de téléchargements amont par IP (429)', async () => {
  resetRemoteMediaStateForTests();
  setRemoteMediaFetchForTests(async () => fakeImageResponse());
  const urls = [1, 2, 3].map(
    (i) => `https://upload.wikimedia.org/wikipedia/commons/a/ab/ap4-quota-${stamp}-${i}.png`,
  );
  try {
    await withEnv({ FORETMAP_REMOTE_MEDIA_FETCHES_PER_IP: '2' }, async () => {
      await getRemoteMedia(urls[0], { clientKey: '203.0.113.7' });
      await getRemoteMedia(urls[1], { clientKey: '203.0.113.7' });
      await assert.rejects(getRemoteMedia(urls[2], { clientKey: '203.0.113.7' }), (err) => {
        assert.equal(err.status, 429);
        return true;
      });
      // Une autre IP n'est pas pénalisée ; une image en cache ne consomme rien.
      await getRemoteMedia(urls[2], { clientKey: '198.51.100.9' });
      await getRemoteMedia(urls[0], { clientKey: '203.0.113.7' });
    });
  } finally {
    setRemoteMediaFetchForTests(null);
    resetRemoteMediaStateForTests();
    urls.forEach(clearCache);
  }
});

test('AP4 — taille du cache vérifiée AVANT écriture (507, rien sur le disque)', async () => {
  resetRemoteMediaStateForTests();
  const url = `https://upload.wikimedia.org/wikipedia/commons/a/ab/ap4-big-${stamp}.png`;
  const big = Buffer.concat([PNG_BYTES, Buffer.alloc(1024 * 1024 + 10, 1)]);
  setRemoteMediaFetchForTests(async () => fakeImageResponse(big));
  try {
    await withEnv({ FORETMAP_REMOTE_MEDIA_CACHE_MAX_BYTES: String(1024 * 1024) }, async () => {
      await assert.rejects(getRemoteMedia(url), (err) => {
        assert.equal(err.status, 507);
        return true;
      });
    });
    assert.equal(fs.existsSync(cachePaths(normalizeRemoteMediaUrl(url)).body), false);
  } finally {
    setRemoteMediaFetchForTests(null);
    resetRemoteMediaStateForTests();
    clearCache(url);
  }
});

// --- AP9 : bombes ZIP ------------------------------------------------------------------------

/** Réécrit la taille décompressée déclarée de chaque entrée du répertoire central. */
function forgeDeclaredSizes(buffer, size) {
  const out = Buffer.from(buffer);
  for (let i = 0; i <= out.length - 46; i += 1) {
    if (out.readUInt32LE(i) === 0x02014b50) out.writeUInt32LE(size, i + 24);
  }
  return out;
}

test('AP9 — pack mascotte : taille déclarée contrôlée avant toute décompression', () => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from('{"format":"x"}'));
  zip.addFile('pack.json', Buffer.from('{}'));
  const forged = forgeDeclaredSizes(zip.toBuffer(), 0x7fffffff);

  // Espion : aucune entrée ne doit être décompressée.
  const admPath = require.resolve('adm-zip');
  const original = require.cache[admPath].exports;
  let getDataCalls = 0;
  require.cache[admPath].exports = function SpyZip(...args) {
    const inner = new original(...args);
    const getEntries = inner.getEntries.bind(inner);
    inner.getEntries = () =>
      getEntries().map((entry) => {
        const getData = entry.getData.bind(entry);
        entry.getData = (...a) => {
          getDataCalls += 1;
          return getData(...a);
        };
        return entry;
      });
    return inner;
  };
  const archivePath = require.resolve('../lib/mascotPackArchive');
  delete require.cache[archivePath];
  try {
    const { parseMascotPackZipBuffer } = require('../lib/mascotPackArchive');
    assert.throws(() => parseMascotPackZipBuffer(forged), /décompressée trop importante/);
    assert.equal(getDataCalls, 0, 'aucune décompression avant le contrôle');
  } finally {
    require.cache[admPath].exports = original;
    delete require.cache[archivePath];
  }
});

test('AP9 — classeur XLSX : taille décompressée déclarée et nombre de lignes plafonnés', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'Feuille1',
      aoa: [['Nom'], ['a'], ['b'], ['c'], ['d'], ['e']],
    },
  ]);
  const ok = await parseWorkbook(buffer);
  assert.equal(ok.rows.length, 5, 'un classeur ordinaire se lit toujours');

  await assert.rejects(parseWorkbook(forgeDeclaredSizes(buffer, 200 * 1024 * 1024)), (err) => {
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /décompressé/);
    return true;
  });

  await withEnv({ FORETMAP_SPREADSHEET_MAX_ROWS: '3' }, async () => {
    await assert.rejects(parseWorkbook(buffer), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /trop longue/);
      return true;
    });
  });
});

// --- Avec base de données ------------------------------------------------------------------

let adminToken;
let plantId;
const MAP_IN = `ap6-in-${stamp}`;
const MAP_OUT = `ap6-out-${stamp}`;
const MAP_HIDDEN = `ap6-hidden-${stamp}`;
const GROUP_SCOPE = `ap6-grp-${stamp}`;
const GROUP_FORUM = `ap7-grp-${stamp}`;
const MODO_ROLE_SLUG = `ap7_modo_${stamp}`;
const createdUserIds = [];
const createdIndividualIds = [];

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function createStudent({ groupId = null, roleSlug = 'eleve_novice' } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, 'Audit', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, `Ap${stamp}`, `Audit Ap${stamp}`],
  );
  createdUserIds.push(id);
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, roleSlug);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  if (groupId) {
    await execute(
      `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
      [groupId, id],
    );
  }
  clearMapAccessCache();
  const token = await signAuthToken({
    product: 'foret',
    userType: 'student',
    userId: id,
    roleSlug,
    permissions: [],
  });
  return { id, token };
}

async function createIndividual(mapId, extra = {}) {
  const res = await request(app)
    .post('/api/individuals')
    .set(bearer(adminToken))
    .send({ plant_id: plantId, map_id: mapId, label: `Arbre ${mapId}`, ...extra })
    .expect(201);
  createdIndividualIds.push(res.body.id);
  return res.body.id;
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  const plant = await execute(
    `INSERT INTO plants (name, emoji, description) VALUES (?, '🌳', 'audit 30/09')`,
    [`Plante audit ${stamp}`],
  );
  plantId = plant.insertId;
  await execute(
    `INSERT INTO maps (id, label, map_image_url, sort_order, is_active)
     VALUES (?, ?, NULL, 950, 1), (?, ?, NULL, 951, 1), (?, ?, NULL, 952, 0)`,
    [MAP_IN, `AP6 dedans ${stamp}`, MAP_OUT, `AP6 dehors ${stamp}`, MAP_HIDDEN, `AP6 ${stamp}`],
  );
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1), (?, ?, ?, 'class', 1)",
    [GROUP_SCOPE, GROUP_SCOPE, `AP6 ${stamp}`, GROUP_FORUM, GROUP_FORUM, `AP7 ${stamp}`],
  );
  await execute('INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, ?, NULL)', [
    GROUP_SCOPE,
    MAP_IN,
  ]);
  clearMapAccessCache();
});

test.after(async () => {
  for (const id of createdIndividualIds) {
    await execute('DELETE FROM tracked_individuals WHERE id = ?', [id]).catch(() => {});
  }
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await execute('DELETE FROM group_scopes WHERE group_id = ?', [GROUP_SCOPE]).catch(() => {});
  await execute('DELETE FROM group_members WHERE group_id IN (?, ?)', [
    GROUP_SCOPE,
    GROUP_FORUM,
  ]).catch(() => {});
  await execute('DELETE FROM forum_threads WHERE group_id = ?', [GROUP_FORUM]).catch(() => {});
  await execute('DELETE FROM `groups` WHERE id IN (?, ?)', [GROUP_SCOPE, GROUP_FORUM]).catch(
    () => {},
  );
  for (const id of createdUserIds) {
    await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM user_rewards WHERE user_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [id]).catch(() => {});
  }
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [MODO_ROLE_SLUG]);
  if (role?.id) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [role.id]).catch(() => {});
    await execute('DELETE FROM roles WHERE id = ?', [role.id]).catch(() => {});
  }
  await execute('DELETE FROM maps WHERE id IN (?, ?, ?)', [MAP_IN, MAP_OUT, MAP_HIDDEN]).catch(
    () => {},
  );
  clearMapAccessCache();
});

test('AP6 — lecture anonyme : carte hors surface → 404, absente de la liste', async () => {
  const hiddenId = await createIndividual(MAP_HIDDEN);
  await request(app).get(`/api/individuals/${hiddenId}`).expect(404);
  await request(app).get('/api/individuals').query({ mapId: MAP_HIDDEN }).expect(404);
  const list = await request(app).get('/api/individuals').expect(200);
  assert.ok(!(list.body.items || []).some((i) => i.id === hiddenId));
  // Le personnel la voit toujours.
  await request(app).get(`/api/individuals/${hiddenId}`).set(bearer(adminToken)).expect(200);
});

test('AP6 — champs personnels masqués hors personnel', async () => {
  const id = await createIndividual('foret', { notes: 'Note interne du prof' });
  await request(app)
    .post(`/api/individuals/${id}/measurements`)
    .set(bearer(adminToken))
    .send({
      measured_at: '2026-09-30',
      height_m: 3,
      notes: 'Mesuré par Paul, 5eB',
      group_id: GROUP_SCOPE,
    })
    .expect(201);

  const anon = await request(app).get(`/api/individuals/${id}`).expect(200);
  assert.equal(anon.body.notes, null);
  assert.equal(anon.body.measurements.length, 1);
  const m = anon.body.measurements[0];
  assert.equal(m.observer_user_id, null);
  assert.equal(m.group_id, null);
  assert.equal(m.notes, null);
  assert.equal(m.height_m, 3, 'les mesures elles-mêmes restent publiques');

  const staff = await request(app).get(`/api/individuals/${id}`).set(bearer(adminToken));
  assert.equal(staff.status, 200);
  assert.equal(staff.body.notes, 'Note interne du prof');
  assert.equal(staff.body.measurements[0].notes, 'Mesuré par Paul, 5eB');
  assert.ok(staff.body.measurements[0].observer_user_id);
});

test('AP6 — élève borné à sa carte : lecture et mesure hors périmètre refusées', async () => {
  const inId = await createIndividual(MAP_IN);
  const outId = await createIndividual(MAP_OUT);
  const student = await createStudent({ groupId: GROUP_SCOPE });

  await request(app).get(`/api/individuals/${outId}`).set(bearer(student.token)).expect(404);
  await request(app)
    .get('/api/individuals')
    .query({ mapId: MAP_OUT })
    .set(bearer(student.token))
    .expect(403);
  const list = await request(app).get('/api/individuals').set(bearer(student.token)).expect(200);
  const ids = (list.body.items || []).map((i) => i.id);
  assert.ok(ids.includes(inId));
  assert.ok(!ids.includes(outId));

  const denied = await request(app)
    .post(`/api/individuals/${outId}/measurements`)
    .set(bearer(student.token))
    .send({ measured_at: '2026-09-30', height_m: 2 })
    .expect(403);
  assert.equal(denied.body.code, 'MAP_OUT_OF_SCOPE');
  await request(app)
    .post(`/api/individuals/${inId}/measurements`)
    .set(bearer(student.token))
    .send({ measured_at: '2026-09-30', height_m: 2 })
    .expect(201);
});

test('AP7 — un modérateur limité à ses groupes ne supprime pas hors périmètre', async () => {
  // Profil personnalisé de rang élève (donc sans vue globale) portant `forum.group.moderate`.
  let role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [MODO_ROLE_SLUG]);
  if (!role?.id) {
    await execute(
      `INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, \`rank\`, is_system, forum_participate, context_comment_participate)
       VALUES (?, 'Modérateur de groupe (test)', '🧪', 0, 9990, 1, 0, 1, 1)`,
      [MODO_ROLE_SLUG],
    );
    role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [MODO_ROLE_SLUG]);
  }
  await execute(
    "INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'forum.group.moderate')",
    [role.id],
  );
  const modo = await createStudent({ roleSlug: MODO_ROLE_SLUG });

  const thread = await request(app)
    .post('/api/forum/threads')
    .set(bearer(adminToken))
    .send({ title: `AP7 ${stamp}`, body: 'Message d’une autre classe', group_id: GROUP_FORUM })
    .expect(201);
  const postId = thread.body.first_post_id;
  assert.ok(postId);

  const refused = await request(app)
    .delete(`/api/forum/posts/${postId}`)
    .set(bearer(modo.token))
    .expect(403);
  assert.match(refused.body.error, /périmètre/);
  const still = await queryOne('SELECT is_deleted FROM forum_posts WHERE id = ?', [postId]);
  assert.equal(Number(still.is_deleted), 0);

  // Un administrateur (vue globale) garde la main.
  await request(app).delete(`/api/forum/posts/${postId}`).set(bearer(adminToken)).expect(200);
});

test('AP10 — le parseur de 25 Mo exige un jeton valide', async () => {
  const payload = { pad: 'x'.repeat(3 * 1024 * 1024) };
  const anon = await request(app).post('/api/quiz/import').send(payload);
  assert.equal(anon.status, 413, 'anonyme : limite standard (2 Mo)');
  const forged = await request(app)
    .post('/api/quiz/import')
    .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.invalide')
    .send(payload);
  assert.equal(forged.status, 413, 'jeton mal signé : limite standard');
  const staff = await request(app).post('/api/quiz/import').set(bearer(adminToken)).send(payload);
  assert.notEqual(staff.status, 413, 'authentifié : niveau import');
});

test('§ 6 — séance : pas de fin (ni de badge) sans démarrage préalable', async () => {
  const student = await createStudent();
  const slug = 'college-qui-mange-qui';
  const refused = await request(app)
    .post(`/api/pedago-sessions/${slug}/runs/complete`)
    .set(bearer(student.token))
    .expect(409);
  assert.equal(refused.body.code, 'SESSION_NOT_STARTED');
  const rewards = await queryOne('SELECT COUNT(*) AS n FROM user_rewards WHERE user_id = ?', [
    student.id,
  ]);
  assert.equal(Number(rewards.n), 0, 'aucun badge attribué');

  await request(app)
    .post(`/api/pedago-sessions/${slug}/runs/start`)
    .set(bearer(student.token))
    .expect(200);
  const done = await request(app)
    .post(`/api/pedago-sessions/${slug}/runs/complete`)
    .set(bearer(student.token))
    .expect(200);
  assert.equal(done.body.run.completionCount, 1);
  // Une seconde fin exige un nouveau démarrage.
  await request(app)
    .post(`/api/pedago-sessions/${slug}/runs/complete`)
    .set(bearer(student.token))
    .expect(409);
});
