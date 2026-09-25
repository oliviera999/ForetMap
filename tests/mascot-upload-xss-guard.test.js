require('./helpers/setup');

// Audit du 25/09/2026, N1 — un fichier `.html` déposé dans un pack de mascotte (permission
// `visit.manage`, profil « prof ») atterrissait sous `uploads/` (famille publique) et
// `express.static` le servait en `text/html` : XSS stocké sur l'origine de l'application,
// vol du jeton d'un administrateur qui ouvre le lien. Trois verrous :
//   1. le nom de fichier doit porter une extension d'image ;
//   2. le contenu doit avoir la signature d'une image ;
//   3. tout fichier non inerte sous `/uploads` est servi en téléchargement, sandboxé.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { initDatabase, initSchema } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  sanitizeMascotPackAssetFilename,
  sanitizeMascotPackImageFilename,
  decodeMascotAssetImageData,
  mascotAssetImageKindFromBuffer,
} = require('../lib/visitMascotPackHelpers');
const { UPLOADS_DIR } = require('../lib/uploads');

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';
const HOSTILE_HTML = '<html><script>fetch("/x?t="+localStorage.getItem("t"))</script></html>';
const HOSTILE_HTML_B64 = Buffer.from(HOSTILE_HTML).toString('base64');

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
});

test('nom de fichier de pack de visite : seules les extensions d’image passent', () => {
  assert.equal(sanitizeMascotPackImageFilename('frame-1.png'), 'frame-1.png');
  assert.equal(sanitizeMascotPackImageFilename('Cell.WEBP'), 'Cell.WEBP');
  assert.equal(sanitizeMascotPackImageFilename('photo.jpeg'), 'photo.jpeg');
  assert.equal(sanitizeMascotPackImageFilename('anim.gif'), 'anim.gif');
  assert.equal(sanitizeMascotPackImageFilename('x.html'), null);
  assert.equal(sanitizeMascotPackImageFilename('x.htm'), null);
  assert.equal(sanitizeMascotPackImageFilename('x.svg'), null);
  assert.equal(sanitizeMascotPackImageFilename('x.png.html'), null);
  assert.equal(sanitizeMascotPackImageFilename('sans-extension'), null);
  // La variante historique, partagée avec d'autres usages (noms de dossier), est inchangée.
  assert.equal(sanitizeMascotPackAssetFilename('foret'), 'foret');
});

test('contenu de pack : la signature d’image est exigée', () => {
  assert.equal(mascotAssetImageKindFromBuffer(Buffer.from(TINY_PNG_B64, 'base64')), 'png');
  assert.deepEqual(Object.keys(decodeMascotAssetImageData(TINY_PNG_B64)), ['buffer']);
  assert.ok(decodeMascotAssetImageData(`data:image/png;base64,${HOSTILE_HTML_B64}`).error);
  assert.ok(decodeMascotAssetImageData('').error);
});

test('POST /api/visit/mascot-packs/:id/assets refuse une page HTML', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const created = await request(app)
    .post('/api/visit/mascot-packs')
    .set('Authorization', `Bearer ${token}`)
    .send({ is_published: 0 })
    .expect(201);
  const packId = created.body.id;
  try {
    await request(app)
      .post(`/api/visit/mascot-packs/${packId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'x.html', image_data: HOSTILE_HTML_B64 })
      .expect(400);
    await request(app)
      .post(`/api/visit/mascot-packs/${packId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'deguise.png', image_data: HOSTILE_HTML_B64 })
      .expect(400);
    await request(app)
      .post(`/api/visit/mascot-packs/${packId}/assets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'vraie.png', image_data: TINY_PNG_B64 })
      .expect(201);
    const dir = path.join(UPLOADS_DIR, 'visit_mascot_packs', packId);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['vraie.png']);
  } finally {
    await request(app)
      .delete(`/api/visit/mascot-packs/${packId}`)
      .set('Authorization', `Bearer ${token}`);
  }
});

test('POST /api/visit/mascot-sprite-library/assets refuse une page HTML', async () => {
  const token = await ensureAdminTeacherAuthToken();
  await request(app)
    .post('/api/visit/mascot-sprite-library/assets')
    .set('Authorization', `Bearer ${token}`)
    .send({ filename: 'lib-x.html', image_data: HOSTILE_HTML_B64 })
    .expect(400);
  await request(app)
    .post('/api/visit/mascot-sprite-library/assets')
    .set('Authorization', `Bearer ${token}`)
    .send({ filename: 'lib-deguise.png', image_data: HOSTILE_HTML_B64 })
    .expect(400);
});

test('/uploads : un fichier non inerte est téléchargé, jamais rendu', async () => {
  const relDir = `test-static-headers-${process.pid}`;
  const absDir = path.join(UPLOADS_DIR, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(path.join(absDir, 'page.html'), HOSTILE_HTML);
  fs.writeFileSync(path.join(absDir, 'image.png'), Buffer.from(TINY_PNG_B64, 'base64'));
  try {
    const html = await request(app).get(`/uploads/${relDir}/page.html`).expect(200);
    assert.equal(html.headers['content-disposition'], 'attachment');
    assert.match(String(html.headers['content-security-policy'] || ''), /sandbox/);

    const png = await request(app).get(`/uploads/${relDir}/image.png`).expect(200);
    assert.equal(png.headers['content-disposition'], undefined);
    assert.match(String(png.headers['content-type']), /image\/png/);
  } finally {
    fs.rmSync(absDir, { recursive: true, force: true });
  }
});
