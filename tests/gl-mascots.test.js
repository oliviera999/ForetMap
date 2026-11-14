'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  createGlPlayer,
  createGlMascotPackPool,
  createVisitMascotPack,
  signTokens,
} = require('./helpers/glFixtures');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamAId = null;
let teamBId = null;
// Catalogue G&L = packs publiés du studio ForêtMap : la suite sème les siens.
let mascotPool = null;
let untypedPack = null;
let gnomeA = '';
let licorneA = '';

const stamp = Date.now();
const adminEmail = `mascots.mj.${stamp}@ecole.local`;
const className = `Classe Mascots ${stamp}`;
const gameName = `Partie Mascots ${stamp}`;
const playerPseudo = `mascots-player-${stamp}`;

async function readZipResponseBody(agentReq) {
  const chunks = [];
  const res = await agentReq
    .buffer(true)
    .parse((resStream, callback) => {
      resStream.on('data', (chunk) => chunks.push(chunk));
      resStream.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.ok(String(res.headers['content-type'] || '').includes('zip'));
  if (Buffer.isBuffer(res.body)) return res.body;
  if (chunks.length) return Buffer.concat(chunks);
  return Buffer.from(String(res.text || ''), 'binary');
}

before(async () => {
  await initSchema();
  mascotPool = await createGlMascotPackPool({ gnomes: 2, unicorns: 2, tag: stamp });
  untypedPack = await createVisitMascotPack({ label: `Olu test ${stamp}` });
  [gnomeA] = mascotPool.gnomeIds;
  [licorneA] = mascotPool.unicornIds;
  const admin = await createGlAdmin({ email: adminEmail, displayName: 'MJ Mascots' });
  const cls = await createGlClass({ name: className, school: 'Ecole Mascots', adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: gameName,
    createdBy: admin.id,
    status: 'live',
    teams: [
      { name: 'Team A', type: 'gnome', color: '#22c55e' },
      { name: 'Team B', type: 'unicorn', color: '#ef4444' },
    ],
  });
  gameId = Number(gameSeed.game.id);
  teamAId = Number(gameSeed.teams[0].id);
  teamBId = Number(gameSeed.teams[1].id);

  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: playerPseudo,
    password: '1234',
  });
  const tokens = await signTokens({
    adminId: admin.id,
    adminDisplayName: 'MJ Mascots',
    adminPermissions: ['gl.read', 'gl.team.manage', 'gl.game.manage', 'gl.content.manage'],
    playerId: player.id,
    playerPseudo,
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('GET /api/gl/mascots retourne le catalogue (auth GL requise)', async () => {
  await request(app).get('/api/gl/mascots').expect(401);
  const res = await request(app)
    .get('/api/gl/mascots')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.mascots));
  const ids = new Set(res.body.mascots.map((row) => row.id));
  for (const id of [...mascotPool.gnomeIds, ...mascotPool.unicornIds]) assert.ok(ids.has(id));
  assert.ok(res.body.mascots.every((row) => !String(row.id).startsWith('gl-')));
  assert.ok(res.body.mascots.every((row) => row.source === 'foretmap'));
  const byId = new Map(res.body.mascots.map((row) => [row.id, row]));
  assert.equal(byId.get(gnomeA)?.type, 'gnome');
  assert.equal(byId.get(licorneA)?.type, 'unicorn');
  assert.equal(byId.get(untypedPack.catalogId)?.type, null);
});

test('POST /api/gl/mascots/assign exige gl.team.manage', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ gameId, teamId: teamAId, mascotId: gnomeA })
    .expect(403);
});

test('POST /api/gl/mascots/assign assigne une mascotte à une équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: gnomeA })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, gnomeA);
  const team = await queryOne('SELECT mascot_id FROM gl_teams WHERE id = ? LIMIT 1', [teamAId]);
  assert.strictEqual(team?.mascot_id, gnomeA);
});

test('POST /api/gl/mascots/assign refuse une mascotte déjà prise (409)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: gnomeA })
    .expect(409);
});

test('POST /api/gl/mascots/assign accepte une autre mascotte pour la 2e équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: licorneA })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, licorneA);
});

test('POST /api/gl/mascots/assign refuse une mascotte inconnue (404)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-inexistante' })
    .expect(404);
});

test('POST /api/gl/mascots/assign refuse 404 les anciennes mascottes gl-* et un brouillon', async () => {
  for (const mascotId of ['gl-gnome-mousse', 'gl-licorne-aube']) {
    await request(app)
      .post('/api/gl/mascots/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId, teamId: teamAId, mascotId })
      .expect(404);
  }
  const draft = await createVisitMascotPack({
    label: `Gnome brouillon ${stamp}`,
    published: false,
  });
  try {
    await request(app)
      .post('/api/gl/mascots/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId, teamId: teamAId, mascotId: draft.catalogId })
      .expect(404);
  } finally {
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [draft.id]);
  }
});

test('POST /api/gl/mascots/assign accepte un pack publié sans peuple (choix manuel du MJ)', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: untypedPack.catalogId })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, untypedPack.catalogId);
  assert.strictEqual(res.body?.mascot?.source, 'foretmap');
  assert.strictEqual(res.body?.mascot?.type, null);
});

test('GET /api/gl/mascots?gameId=... renvoie les assignations actuelles', async () => {
  const res = await request(app)
    .get(`/api/gl/mascots?gameId=${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const map = Object.fromEntries(
    (res.body?.assignments || []).map((a) => [Number(a.team_id), a.mascot_id]),
  );
  assert.strictEqual(map[Number(teamAId)], untypedPack.catalogId);
  assert.strictEqual(map[Number(teamBId)], licorneA);
});

test('POST /api/gl/mascots/packs valide le payload Zod', async () => {
  await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pack invalide', payload: { renderer: 'sprite_cut' } })
    .expect(400);
});

test('CRUD pack mascotte GL + assets', async () => {
  const payload = {
    id: `pack-${stamp}`,
    name: 'Pack test GL',
    renderer: 'sprite_cut',
    assets: [{ key: 'atlas', src: '/uploads/x.png' }],
    states: [{ key: 'idle', frames: [0, 1, 2], loop: true, fps: 12 }],
  };
  const created = await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId: 1, name: 'Pack test GL', payload })
    .expect(201);
  const packId = Number(created.body?.pack?.id);
  assert.ok(Number.isFinite(packId) && packId > 0);

  const list = await request(app)
    .get('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((list.body?.packs || []).some((pack) => Number(pack.id) === packId));

  const updatedPayload = { ...payload, name: 'Pack update GL' };
  await request(app)
    .put(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pack update GL', payload: updatedPayload })
    .expect(200);

  const dataBase64 = Buffer.from('asset-test', 'utf8').toString('base64');
  await request(app)
    .post(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      filename: 'atlas.txt',
      mimeType: 'text/plain',
      dataBase64,
    })
    .expect(201);

  const assets = await request(app)
    .get(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((assets.body?.assets || []).some((asset) => asset.filename === 'atlas.txt'));

  await request(app)
    .delete(`/api/gl/mascots/packs/${packId}/assets/atlas.txt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  await request(app)
    .delete(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GL mascot packs : export ZIP et import create', async () => {
  const dataBase64 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
    'base64',
  ).toString('base64');
  const created = await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      chapterId: 1,
      name: 'Pack ZIP GL',
      payload: {
        id: `gl-zip-${stamp}`,
        name: 'Pack ZIP GL',
        type: 'gnome',
        renderer: 'sprite_cut',
        assets: [{ key: 'atlas', src: '/uploads/placeholder.png' }],
        states: [{ key: 'idle', frames: [0], loop: true, fps: 8 }],
      },
    })
    .expect(201);
  const packId = Number(created.body?.pack?.id);
  assert.ok(Number.isFinite(packId) && packId > 0);

  await request(app)
    .post(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ filename: 'atlas.png', mimeType: 'image/png', dataBase64 })
    .expect(201);

  const assets = await request(app)
    .get(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const atlasUrl = assets.body?.assets?.find((a) => a.filename === 'atlas.png')?.url;
  assert.ok(atlasUrl);

  await request(app)
    .put(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      payload: {
        id: `gl-zip-${stamp}`,
        name: 'Pack ZIP GL',
        type: 'gnome',
        renderer: 'sprite_cut',
        assets: [{ key: 'atlas', src: atlasUrl }],
        states: [{ key: 'idle', frames: [0], loop: true, fps: 8 }],
      },
    })
    .expect(200);

  const zipBody = await readZipResponseBody(
    request(app)
      .get(`/api/gl/mascots/packs/${packId}/export.zip`)
      .set('Authorization', `Bearer ${adminToken}`),
  );
  const archiveB64 = zipBody.toString('base64');
  const imported = await request(app)
    .post('/api/gl/mascots/packs/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      mode: 'create',
      chapterId: 1,
      archive: { fileName: 'gl-pack.zip', fileDataBase64: archiveB64 },
    })
    .expect(201);
  const importedId = Number(imported.body?.pack?.id);
  assert.ok(Number.isFinite(importedId) && importedId > 0);
  assert.notStrictEqual(importedId, packId);

  await request(app)
    .delete(`/api/gl/mascots/packs/${importedId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .delete(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('sprite library GL: ajout, liste, suppression', async () => {
  const dataBase64 = Buffer.from('sprite-test', 'utf8').toString('base64');
  const created = await request(app)
    .post('/api/gl/mascots/sprite-library')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId: 1, filename: 'sprite.txt', mimeType: 'text/plain', dataBase64 })
    .expect(201);
  const id = Number(created.body?.asset?.id);
  assert.ok(Number.isFinite(id) && id > 0);

  const list = await request(app)
    .get('/api/gl/mascots/sprite-library')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((list.body?.assets || []).some((asset) => Number(asset.id) === id));

  await request(app)
    .delete(`/api/gl/mascots/sprite-library/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GET /api/gl/mascots expose les packs visit publiés, plus les packs GL persistés', async () => {
  const { invalidateGlUnifiedMascotCatalogForTests } = require('../lib/glUnifiedMascotCatalog');
  invalidateGlUnifiedMascotCatalogForTests();

  const glPayload = {
    id: `gl-pack-${stamp}`,
    name: 'Pack GL catalogue',
    type: 'unicorn',
    renderer: 'sprite_cut',
    assets: [{ key: 'atlas', src: '/uploads/x.png' }],
    states: [{ key: 'idle', frames: [0], loop: true, fps: 12 }],
  };
  await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pack GL catalogue', payload: glPayload })
    .expect(201);

  // Le jeton doit porter l'époque de session COURANTE du compte : une suite voisine peut
  // avoir changé le mot de passe de ce même enseignant (`token_epoch` incrémenté), et un
  // jeton signé sans cette claim est alors rejeté en 401 « Session expirée » — d'où l'échec
  // intermittent observé en CI sur ce test.
  const teacher = await queryOne(
    "SELECT id, token_epoch FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id && adminRole?.id);
  const teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: true,
      tokenEpoch: Number(teacher.token_epoch) || 0,
    },
    true,
  );

  const visitCreated = await request(app)
    .post('/api/visit/mascot-packs')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ map_id: 'foret', is_published: 0 })
    .expect(201);
  const visitPackId = visitCreated.body.id;
  const visitCatalogId = visitCreated.body.catalog_id;

  await request(app)
    .put(`/api/visit/mascot-packs/${visitPackId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      map_id: 'foret',
      label: 'Pack visite GL test',
      pack: visitCreated.body.pack,
      is_published: 1,
    })
    .expect(200);

  invalidateGlUnifiedMascotCatalogForTests();

  const res = await request(app)
    .get('/api/gl/mascots')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  // Le studio de packs GL (`gl_mascot_packs`) n'alimente plus le catalogue.
  assert.ok(!(res.body?.mascots || []).some((row) => row.id === glPayload.id));
  assert.ok((res.body?.mascots || []).some((row) => row.id === visitCatalogId));

  // Dépublié au studio ForêtMap : retiré du catalogue G&L à l'appel suivant.
  await request(app)
    .put(`/api/visit/mascot-packs/${visitPackId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      map_id: 'foret',
      label: 'Pack visite GL test',
      pack: visitCreated.body.pack,
      is_published: 0,
    })
    .expect(200);
  const after = await request(app)
    .get('/api/gl/mascots')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(!(after.body?.mascots || []).some((row) => row.id === visitCatalogId));

  await request(app)
    .delete(`/api/visit/mascot-packs/${visitPackId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
});

after(async () => {
  await mascotPool?.cleanup();
  if (untypedPack) {
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [untypedPack.id]);
  }
});
