'use strict';

// Avatars par défaut générés par le serveur (`lib/defaultAvatar.js`, `routes/users.js`) :
// même dessin que l'ancien appel au service DiceBear, aucune graine dans les URL, lecture par
// URL signée émise par les routes qui exposent déjà le compte.

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, initDatabase, execute } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { toPublicUserRow } = require('../lib/publicUser');
const { BUCKET_SECONDS } = require('../lib/uploadsSignedUrls');
const {
  defaultAvatarSeed,
  defaultAvatarUrlFor,
  isSafeAvatarSvg,
  renderDefaultAvatarSvg,
  clearDefaultAvatarCache,
} = require('../lib/defaultAvatar');

/**
 * Empreintes SHA-256 des SVG servis par `https://api.dicebear.com/9.x/adventurer-neutral/svg
 * ?seed=<graine>&radius=50` (relevées le 10/10/2026) : l'appel que faisait le navigateur. Le
 * rendu local doit être identique octet pour octet — même graine, même visage.
 */
const DICEBEAR_API_REFERENCE_SHA256 = Object.freeze({
  'eleve-42': 'ceebbfdcf436b558f6e83ce80b5e15b1ba5253299eb1ae4865566031bb96a161',
  foretmap: '9228950e43722ab9c815a313d400c08cb8722316dac5002a311e0cc0f4c2c09d',
  'Jean Test-Duponté': 'cdace9fab4034531619aa36b935367968bfe573fb746cb0b03ae2a962715b477',
});

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseSigned(url) {
  const u = new URL(url, 'https://x.test');
  return { path: u.pathname, exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') };
}

const RUN = Date.now().toString(36);

async function insertUser({ id, pseudo = null, firstName = 'Avatar', lastName = `Test${RUN}` }) {
  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name, auth_provider,
                        is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, pseudo, firstName, lastName, `${firstName} ${lastName}`],
  );
  return { id, pseudo, first_name: firstName, last_name: lastName };
}

describe('Avatar par défaut — graine et rendu', () => {
  it('la graine suit la règle de l’ancien client : pseudo, puis prénom-nom, puis identifiant', () => {
    assert.equal(
      defaultAvatarSeed({ id: 'u1', pseudo: 'Lynx', first_name: 'A', last_name: 'B' }),
      'Lynx',
    );
    assert.equal(
      defaultAvatarSeed({ id: 'u1', pseudo: null, first_name: 'Ana', last_name: 'Bel' }),
      'Ana-Bel',
    );
    assert.equal(
      defaultAvatarSeed({ id: 'u1', pseudo: '', first_name: 'Ana', last_name: null }),
      'Ana',
    );
    assert.equal(defaultAvatarSeed({ id: 'u1', pseudo: '', first_name: '', last_name: '' }), 'u1');
    assert.equal(defaultAvatarSeed(null), 'foretmap');
  });

  it('dessin identique, octet pour octet, à celui de l’API DiceBear 9.x', async () => {
    clearDefaultAvatarCache();
    for (const [seed, expected] of Object.entries(DICEBEAR_API_REFERENCE_SHA256)) {
      const { svg } = await renderDefaultAvatarSvg(seed);
      assert.equal(sha256Hex(svg), expected, seed);
    }
  });

  it('le SVG porte l’attribution de l’œuvre, jamais la graine, et aucun élément actif', async () => {
    const seed = 'Graine-Secrete-Prenom-Nom';
    const { svg } = await renderDefaultAvatarSvg(seed);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!svg.includes(seed), 'la graine ne doit pas figurer dans le SVG');
    assert.ok(!svg.includes('Graine'));
    assert.match(svg, /Adventurer Neutral/);
    assert.match(svg, /Lisa Wischofsky/);
    assert.match(svg, /creativecommons\.org\/licenses\/by\/4\.0/);
    assert.ok(isSafeAvatarSvg(svg));
    assert.doesNotMatch(svg, /<script/i);
  });

  it('le garde-fou refuse un SVG actif ou à référence externe', () => {
    assert.equal(isSafeAvatarSvg('<svg><script>alert(1)</script></svg>'), false);
    assert.equal(isSafeAvatarSvg('<svg onload="x()"></svg>'), false);
    assert.equal(isSafeAvatarSvg('<svg><image href="https://t.example/x.png"/></svg>'), false);
    assert.equal(isSafeAvatarSvg('<svg><g fill="url(https://t.example/#a)"/></svg>'), false);
    assert.equal(isSafeAvatarSvg('<svg><g mask="url(#m)"><path d="M0 0"/></g></svg>'), true);
    assert.equal(isSafeAvatarSvg('<html></html>'), false);
  });

  it('rendu mis en cache : la même graine ne redessine pas', async () => {
    clearDefaultAvatarCache();
    const a = await renderDefaultAvatarSvg('cache-graine');
    const b = await renderDefaultAvatarSvg('cache-graine');
    assert.strictEqual(a, b);
    assert.match(a.etag, /^"da-[A-Za-z0-9_-]{22}"$/);
  });

  it('URL signée vers l’application, sans graine en clair', () => {
    const url = defaultAvatarUrlFor({
      id: 'abc-123',
      pseudo: 'PseudoVisible',
      first_name: 'Prenom',
      last_name: 'Nom',
    });
    assert.match(url, /^\/api\/users\/abc-123\/default-avatar\?exp=\d+&sig=[A-Za-z0-9_-]{22}$/);
    assert.ok(!url.includes('PseudoVisible'));
    assert.ok(!url.includes('Prenom'));
    assert.ok(!/dicebear/i.test(url));
    // Ligne incomplète : pas d'URL plutôt qu'une signature invérifiable.
    assert.equal(defaultAvatarUrlFor({ id: 'abc-123', pseudo: 'x' }), null);
    assert.equal(defaultAvatarUrlFor(null), null);
  });
});

describe('GET /api/users/:id/default-avatar', () => {
  let user;
  let other;

  before(async () => {
    await initSchema();
    await initDatabase();
    await ensureRbacBootstrap();
    user = await insertUser({ id: `c04-${RUN}-a`, pseudo: `Renard${RUN}` });
    other = await insertUser({ id: `c04-${RUN}-b`, pseudo: null, firstName: 'Bea' });
  });

  it('URL signée valide → 200, SVG, cache privé, ETag, CSP inerte', async () => {
    const url = defaultAvatarUrlFor(user);
    const res = await request(app).get(url).buffer(true).parse(textParser);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^image\/svg\+xml/);
    assert.equal(res.headers['cache-control'], 'private, max-age=3600');
    assert.match(res.headers['content-security-policy'], /default-src 'none'.*sandbox/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['x-robots-tag'] || ''), /noindex/);
    const expected = await renderDefaultAvatarSvg(defaultAvatarSeed(user));
    assert.equal(res.body, expected.svg);
    assert.equal(res.headers.etag, expected.etag);
    // Revalidation : 304 sans corps.
    const again = await request(app).get(url).set('If-None-Match', expected.etag);
    assert.equal(again.status, 304);
  });

  it('sans signature, signature altérée, expirée ou empruntée → 404', async () => {
    const { path, exp, sig } = parseSigned(defaultAvatarUrlFor(user));
    await request(app).get(path).expect(404);
    await request(app).get(`${path}?exp=${exp}`).expect(404);
    await request(app).get(`${path}?sig=${sig}`).expect(404);
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    await request(app).get(`${path}?exp=${exp}&sig=${flipped}`).expect(404);
    await request(app)
      .get(`${path}?exp=${Number(exp) + BUCKET_SECONDS}&sig=${sig}`)
      .expect(404);
    // Échéance passée, même correctement signée.
    const past = defaultAvatarUrlFor(user, { now: Date.now() - 30 * 24 * 3600 * 1000 });
    await request(app).get(past).expect(404);
    // Signature d'un autre compte réutilisée.
    const borrowed = parseSigned(defaultAvatarUrlFor(other));
    await request(app).get(`${path}?exp=${borrowed.exp}&sig=${borrowed.sig}`).expect(404);
  });

  it('compte inexistant, même avec une signature bien formée → 404', async () => {
    const ghost = { id: `c04-${RUN}-ghost`, pseudo: 'Fantome', first_name: 'X', last_name: 'Y' };
    await request(app).get(defaultAvatarUrlFor(ghost)).expect(404);
  });

  it('changement de pseudo : nouvelle URL, nouveau visage, l’ancienne URL ne sert plus', async () => {
    const before = defaultAvatarUrlFor(user);
    await execute('UPDATE users SET pseudo = ? WHERE id = ?', [`Blaireau${RUN}`, user.id]);
    const updated = { ...user, pseudo: `Blaireau${RUN}` };
    const after = defaultAvatarUrlFor(updated);
    assert.notEqual(after, before);
    await request(app).get(before).expect(404);
    const res = await request(app).get(after).buffer(true).parse(textParser).expect(200);
    const oldSvg = (await renderDefaultAvatarSvg(defaultAvatarSeed(user))).svg;
    assert.notEqual(res.body, oldSvg);
    user = updated;
  });

  it('les réponses qui exposent un compte portent `default_avatar_url`', async () => {
    const projected = toPublicUserRow({ ...user, password_hash: 'x' });
    assert.match(projected.default_avatar_url, /^\/api\/users\/[^/]+\/default-avatar\?exp=/);

    // Inscription (projection publique) puis fiche de statistiques du compte.
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Avatar', lastName: `Reg${RUN}`, password: 'pass1234' })
      .expect(201);
    assert.match(reg.body.default_avatar_url, /^\/api\/users\/[^/]+\/default-avatar\?exp=/);
    await request(app).get(reg.body.default_avatar_url).expect(200);
    const stats = await request(app)
      .get(`/api/stats/me/${reg.body.id}`)
      .set('Authorization', `Bearer ${reg.body.authToken}`)
      .expect(200);
    assert.match(stats.body.default_avatar_url, /\/default-avatar\?exp=/);
    await request(app).get(stats.body.default_avatar_url).expect(200);

    // Tableau de bord enseignant et profil enseignant (`/api/auth/me`).
    const adminToken = await ensureAdminTeacherAuthToken();
    const all = await request(app)
      .get('/api/stats/all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listed = all.body.students.find((s) => s.id === reg.body.id);
    assert.ok(listed, 'le compte inscrit figure au tableau de bord de l’administrateur');
    assert.match(listed.default_avatar_url, /\/default-avatar\?exp=/);
    await request(app).get(listed.default_avatar_url).expect(200);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.match(me.body.profile.default_avatar_url, /\/default-avatar\?exp=/);
    await request(app).get(me.body.profile.default_avatar_url).expect(200);
  });
});

/** Corps SVG lu comme texte dans `res.body` (supertest ne parse pas `image/svg+xml`). */
function textParser(res, callback) {
  res.setEncoding('utf8');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => callback(null, data));
}
