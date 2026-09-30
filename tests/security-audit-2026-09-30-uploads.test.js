'use strict';

// Constat RG4 de docs/AUDIT_SECURITE_RGPD_2026-09-30.md : les photos et productions d'élèves
// (avatars, forum, commentaires, tâches, carnet G&L) étaient servies sans authentification
// sous `/uploads`, avec des noms parfois prévisibles. Elles ne sont plus lisibles que par une
// URL signée à durée limitée, émise par l'API qui a contrôlé l'accès (lib/uploadsSignedUrls.js).

require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { writeBufferToDisk, deleteFile, deleteDirectory } = require('../lib/uploads');
const {
  signUploadRelativePath,
  signUploadUrl,
  signUploadUrlsInText,
  stripUploadSignaturesInText,
  verifySignedUploadRequest,
  BUCKET_SECONDS,
} = require('../lib/uploadsSignedUrls');
const { toPublicUserRow } = require('../lib/publicUser');
const { toGlPlayerProfile } = require('../lib/glPlayerIdentity');
const { attachPublicImageUrls } = require('../lib/userContentImages');
const { stripDisallowedImageUrls } = require('../lib/glPlayerJournal');

// PNG 1×1 valide (signature binaire exigée par `writeBufferToDisk`).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
  'base64',
);
const RUN = `rg4-${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Un fichier par famille désormais privée (lecture par URL signée). */
const SIGNED_FAMILY_FILES = [
  `students/${RUN}/avatar-1.png`,
  `student/${RUN}/avatar-1.png`,
  `gl_players/${RUN}/avatar-1.png`,
  `forum-posts/${RUN}/0.png`,
  `gl-forum-posts/${RUN}/0.png`,
  `context-comments/${RUN}/0.png`,
  `tasks/${RUN}.png`,
  `gl-player-journal/${RUN}/12-1790000000000-0.png`,
];
const TASK_THUMB = `tasks/${RUN}.thumb.jpg`;
/** Familles de contenu pédagogique : restent publiques. */
const PUBLIC_FAMILY_FILES = [
  `zones/${RUN}/1.png`,
  `markers/${RUN}/1.png`,
  `plants/${RUN}/photo-1.png`,
  `media-library/image/${RUN}/1790000000000-abcdef0123.png`,
  `visit_media/${RUN}.png`,
  `teacher/${RUN}/avatar-1.png`,
];
const ALL_FILES = [...SIGNED_FAMILY_FILES, TASK_THUMB, ...PUBLIC_FAMILY_FILES];

function withSignature(rel, { exp, sig }) {
  return `/uploads/${rel}?exp=${exp}&sig=${sig}`;
}

function parseSigned(url) {
  const u = new URL(url, 'https://x.test');
  return { exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') };
}

before(async () => {
  await initSchema();
  for (const rel of ALL_FILES) {
    // La vignette est un JPEG « .thumb.jpg » : un PNG y passerait la signature binaire
    // attendue d'une image matricielle, ce qui suffit ici (seul le service est testé).
    await writeBufferToDisk(rel, PNG);
  }
});

after(() => {
  for (const rel of ALL_FILES) deleteFile(rel);
  // Dossiers propres au test, vignettes dérivées comprises (plantes, médiathèque).
  for (const rel of ALL_FILES) {
    const dir = rel.slice(0, rel.lastIndexOf('/'));
    if (dir.endsWith(RUN)) deleteDirectory(dir);
  }
  deleteDirectory(`media-thumbs/media-library/image/${RUN}`);
});

describe('RG4 — accès direct aux médias d’élèves', () => {
  it('accès anonyme sans signature → 404 pour chaque famille privée', async () => {
    for (const rel of SIGNED_FAMILY_FILES) {
      const res = await request(app).get(`/uploads/${rel}`);
      assert.strictEqual(res.status, 404, rel);
    }
  });

  it('URL signée valide → 200, Cache-Control privé, pas d’indexation', async () => {
    for (const rel of SIGNED_FAMILY_FILES) {
      const res = await request(app).get(`/uploads/${signUploadRelativePath(rel)}`);
      assert.strictEqual(res.status, 200, rel);
      assert.strictEqual(res.headers['cache-control'], 'private, max-age=3600', rel);
      assert.match(String(res.headers['x-robots-tag'] || ''), /noindex/, rel);
    }
  });

  it('signature altérée, empruntée à un autre fichier ou incomplète → 404', async () => {
    const rel = SIGNED_FAMILY_FILES[0];
    const { exp, sig } = parseSigned(signUploadRelativePath(rel));
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    await request(app)
      .get(withSignature(rel, { exp, sig: flipped }))
      .expect(404);
    // Échéance modifiée : la signature ne la couvre plus.
    await request(app)
      .get(withSignature(rel, { exp: Number(exp) + BUCKET_SECONDS, sig }))
      .expect(404);
    // Signature d'un autre élève réutilisée sur ce fichier.
    const other = parseSigned(signUploadRelativePath(SIGNED_FAMILY_FILES[1]));
    await request(app).get(withSignature(rel, other)).expect(404);
    // Paramètres manquants ou doublés.
    await request(app).get(`/uploads/${rel}?sig=${sig}`).expect(404);
    await request(app).get(`/uploads/${rel}?exp=${exp}`).expect(404);
    await request(app).get(`/uploads/${rel}?exp=${exp}&sig=${sig}&sig=${sig}`).expect(404);
    // Casse modifiée : un autre chemin, donc une autre signature.
    await request(app).get(withSignature(rel.toUpperCase(), { exp, sig })).expect(404);
  });

  it('URL signée expirée → 404', async () => {
    const rel = SIGNED_FAMILY_FILES[3];
    const expired = signUploadRelativePath(rel, { now: Date.now() - 8 * DAY_MS });
    await request(app).get(`/uploads/${expired}`).expect(404);
  });

  it('échéance au-delà de la durée de vie courante (TTL réduit depuis) → 404', async () => {
    const rel = SIGNED_FAMILY_FILES[2];
    const previous = process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS;
    process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS = String(7 * 24 * 3600);
    const longLived = signUploadRelativePath(rel);
    process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS = '3600';
    try {
      await request(app).get(`/uploads/${longLived}`).expect(404);
    } finally {
      if (previous === undefined) delete process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS;
      else process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS = previous;
    }
  });

  it('chemin avec remontée (`..`) → 404, signé ou non', async () => {
    const target = SIGNED_FAMILY_FILES[0];
    const signed = parseSigned(signUploadRelativePath(target));
    await request(app)
      .get(`/uploads/zones/..%2f${target.replace(/\//g, '%2f')}`)
      .expect(404);
    await request(app)
      .get(withSignature(`students/..%2f${target.replace(/\//g, '%2f')}`, signed))
      .expect(404);
    await request(app).get('/uploads/zones/..%2f..%2fpackage.json').expect(404);
  });

  it('la vignette d’une tâche est couverte par la signature de l’original', async () => {
    const { exp, sig } = parseSigned(signUploadRelativePath(`tasks/${RUN}.png`));
    await request(app).get(withSignature(TASK_THUMB, { exp, sig })).expect(200);
    await request(app).get(`/uploads/${TASK_THUMB}`).expect(404);
  });

  it('familles servies par route API : toujours 403 PRIVATE_UPLOAD, signature ignorée', async () => {
    const res = await request(app).get('/uploads/task-logs/1_1.jpg?exp=9999999999&sig=abc');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'PRIVATE_UPLOAD');
  });

  it('familles de contenu pédagogique : toujours publiques', async () => {
    for (const rel of PUBLIC_FAMILY_FILES) {
      const res = await request(app).get(`/uploads/${rel}`);
      assert.strictEqual(res.status, 200, rel);
      assert.match(String(res.headers['cache-control'] || ''), /^public/, rel);
    }
  });
});

describe('RG4 — émission des URL signées', () => {
  it('même URL pendant une heure (cache navigateur), échéance ≥ TTL', () => {
    const now = Date.UTC(2026, 8, 30, 10, 5, 0);
    const a = signUploadRelativePath('students/s1/avatar-1.png', { now });
    const b = signUploadRelativePath('students/s1/avatar-1.png', { now: now + 20 * 60 * 1000 });
    assert.strictEqual(a, b);
    const { exp } = parseSigned(a);
    assert.strictEqual(Number(exp) % BUCKET_SECONDS, 0);
    assert.ok(Number(exp) * 1000 >= now + 6 * 3600 * 1000);
  });

  it('familles publiques et valeurs vides : rendues telles quelles', () => {
    assert.strictEqual(signUploadRelativePath('zones/z/1.jpg'), 'zones/z/1.jpg');
    assert.strictEqual(signUploadRelativePath(null), null);
    assert.strictEqual(signUploadUrl('/uploads/plants/3/a.jpg'), '/uploads/plants/3/a.jpg');
    assert.strictEqual(signUploadUrl('https://ex.test/a.jpg'), 'https://ex.test/a.jpg');
  });

  it('re-signer une URL déjà signée remplace la signature (pas de doublon)', () => {
    const once = signUploadUrl('/uploads/tasks/t1.png');
    const twice = signUploadUrl(once);
    assert.strictEqual((twice.match(/sig=/g) || []).length, 1);
  });

  it('la clé dérive de JWT_SECRET : changer le secret invalide les URL', () => {
    const rel = 'students/s1/avatar-1.png';
    const { exp, sig } = parseSigned(signUploadRelativePath(rel));
    assert.strictEqual(verifySignedUploadRequest(`/${rel}`, { exp, sig }), true);
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'un-autre-secret-de-test';
    try {
      assert.strictEqual(verifySignedUploadRequest(`/${rel}`, { exp, sig }), false);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });

  it('avatars : élève et joueur G&L signés, personnel inchangé', () => {
    const student = toPublicUserRow({ id: 's1', avatar_path: 'students/s1/avatar-1.png' });
    assert.match(student.avatar_path, /^students\/s1\/avatar-1\.png\?exp=\d+&sig=[\w-]+$/);
    const teacher = toPublicUserRow({ id: 't1', avatar_path: 'teacher/t1/avatar-1.png' });
    assert.strictEqual(teacher.avatar_path, 'teacher/t1/avatar-1.png');
    const player = toGlPlayerProfile({ id: 4, avatar_path: 'gl_players/4/avatar-1.png' });
    assert.match(player.avatar_path, /^gl_players\/4\/avatar-1\.png\?exp=\d+&sig=/);
  });

  it('pièces jointes de forum / commentaires : image_urls signées', () => {
    const row = { image_paths_json: JSON.stringify(['forum-posts/9/0.png', 'zones/../x.png']) };
    attachPublicImageUrls(row, 'forum-posts');
    assert.strictEqual(row.image_urls.length, 1);
    assert.match(row.image_urls[0], /^\/uploads\/forum-posts\/9\/0\.png\?exp=\d+&sig=/);
  });

  it('carnet G&L : seules les illustrations du joueur sont signées dans le texte', () => {
    const body =
      '![a](/uploads/gl-player-journal/3/1-1-0.png) ' +
      '<img src="/uploads/gl-player-journal/4/9-9-0.png">';
    const out = signUploadUrlsInText(body, 'gl-player-journal/3');
    assert.match(out, /gl-player-journal\/3\/1-1-0\.png\?exp=\d+&sig=/);
    // L'illustration d'un autre joueur, citée dans le texte, n'obtient aucune signature.
    assert.ok(out.includes('"/uploads/gl-player-journal/4/9-9-0.png"'));
  });

  it('carnet G&L : un corps renvoyé avec des URL signées est enregistré sans signature', () => {
    const signed = signUploadUrl('/uploads/gl-player-journal/3/1-1-0.png');
    const stored = stripDisallowedImageUrls(`![a](${signed})`, 3);
    assert.strictEqual(stored, '![a](/uploads/gl-player-journal/3/1-1-0.png)');
    assert.strictEqual(
      stripUploadSignaturesInText(`<img src="${signed}">`),
      '<img src="/uploads/gl-player-journal/3/1-1-0.png">',
    );
  });
});
