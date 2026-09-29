'use strict';

require('./helpers/setup');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const request = require('supertest');
const { app } = require('../server');
const { initDatabase, initSchema } = require('../database');
const { setSetting } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const {
  normalizeRemoteMediaUrl,
  setRemoteMediaFetchForTests,
  resetRemoteMediaStateForTests,
  cachePaths,
  purgeRemoteMediaCache,
  CACHE_DIR,
} = require('../lib/remoteMedia');
const { buildEnforcedPolicy } = require('../lib/csp');
const { localizeTutorialExternalAssets } = require('../lib/tutorialViewExternalAssets');
const { resolveLocalFontFile } = require('../lib/localFonts');

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function fakeResponse({ status = 200, headers = {}, body = PNG_BYTES } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    body: null,
    arrayBuffer: async () => body,
    json: async () => JSON.parse(body.toString()),
  };
}

function uniqueUrl(name) {
  return `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}-${Date.now()}-${Math.random()}.png`;
}

function clearCacheFor(url) {
  const paths = cachePaths(normalizeRemoteMediaUrl(url));
  for (const p of [paths.body, paths.meta]) fs.rmSync(p, { force: true });
}

before(async () => {
  await initSchema();
  await initDatabase();
});
beforeEach(() => resetRemoteMediaStateForTests());
after(() => setRemoteMediaFetchForTests(null));

describe('Relais média — purge du cache disque', () => {
  function seedEntry(name, { ageMs = 0, size = 1024 } = {}) {
    const paths = cachePaths(normalizeRemoteMediaUrl(uniqueUrl(name)));
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(paths.body, Buffer.alloc(size, 1));
    fs.writeFileSync(paths.meta, JSON.stringify({ contentType: 'image/png' }));
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(paths.body, when, when);
    fs.utimesSync(paths.meta, when, when);
    return paths;
  }
  const DAY = 24 * 60 * 60 * 1000;

  it('retire les entrées expirées (image et métadonnées), garde les récentes', () => {
    const old = seedEntry('vieille', { ageMs: 31 * DAY });
    const fresh = seedEntry('recente');
    purgeRemoteMediaCache({ maxBytes: Number.MAX_SAFE_INTEGER });
    assert.strictEqual(fs.existsSync(old.body), false);
    assert.strictEqual(fs.existsSync(old.meta), false);
    assert.strictEqual(fs.existsSync(fresh.body), true);
    for (const p of [fresh.body, fresh.meta]) fs.rmSync(p, { force: true });
  });

  it('au-delà du plafond, les plus anciennes sortent d’abord', () => {
    const a = seedEntry('a', { ageMs: 3 * DAY, size: 4096 });
    const b = seedEntry('b', { ageMs: 2 * DAY, size: 4096 });
    const c = seedEntry('c', { ageMs: 1 * DAY, size: 4096 });
    // Plafond qui ne laisse la place qu'à l'entrée la plus récente parmi celles-ci.
    const others = fs
      .readdirSync(CACHE_DIR)
      .filter((n) => n.endsWith('.bin'))
      .map((n) => fs.statSync(`${CACHE_DIR}/${n}`))
      .filter((s) => s.mtimeMs > Date.now() - 12 * 60 * 60 * 1000)
      .reduce((sum, s) => sum + s.size, 0);
    purgeRemoteMediaCache({ maxBytes: others + 4096 });
    assert.strictEqual(fs.existsSync(a.body), false);
    assert.strictEqual(fs.existsSync(b.body), false);
    assert.strictEqual(fs.existsSync(c.body), true);
    for (const p of [c.body, c.meta]) fs.rmSync(p, { force: true });
  });
});

describe('Relais média — validation des URL', () => {
  it('seuls les hôtes Wikimedia en HTTPS sont acceptés', () => {
    assert.ok(normalizeRemoteMediaUrl('https://upload.wikimedia.org/x.png'));
    assert.ok(normalizeRemoteMediaUrl('https://commons.wikimedia.org/wiki/Special:FilePath/x.png'));
    for (const bad of [
      'http://upload.wikimedia.org/x.png',
      'https://example.org/x.png',
      'https://upload.wikimedia.org.evil.test/x.png',
      'https://user:pw@upload.wikimedia.org/x.png',
      'https://upload.wikimedia.org:8443/x.png',
      'https://127.0.0.1/x.png',
      'file:///etc/passwd',
      '',
    ]) {
      assert.strictEqual(normalizeRemoteMediaUrl(bad), null, bad);
    }
  });

  it('GET /api/media/remote refuse un hôte hors liste sans rien télécharger', async () => {
    let called = 0;
    setRemoteMediaFetchForTests(async () => {
      called += 1;
      return fakeResponse();
    });
    const res = await request(app)
      .get('/api/media/remote')
      .query({ url: 'https://example.org/tracker.png' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(called, 0);
  });
});

describe('Relais média — téléchargement et cache', () => {
  it('sert l’image, puis la resert depuis le cache sans nouvel appel', async () => {
    const url = uniqueUrl('cache');
    let called = 0;
    setRemoteMediaFetchForTests(async () => {
      called += 1;
      return fakeResponse({ headers: { 'content-type': 'image/png' } });
    });
    try {
      const first = await request(app).get('/api/media/remote').query({ url });
      assert.strictEqual(first.status, 200);
      assert.match(first.headers['content-type'], /^image\/png/);
      assert.strictEqual(first.headers['x-content-type-options'], 'nosniff');
      assert.match(first.headers['content-security-policy'], /sandbox/);
      const second = await request(app).get('/api/media/remote').query({ url });
      assert.strictEqual(second.status, 200);
      assert.strictEqual(called, 1, 'le second appel doit venir du cache');
    } finally {
      clearCacheFor(url);
    }
  });

  it('suit une redirection vers un hôte autorisé', async () => {
    const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Redir-ok.png';
    clearCacheFor(url);
    const seen = [];
    setRemoteMediaFetchForTests(async (target) => {
      seen.push(new URL(target).hostname);
      if (seen.length === 1) {
        return fakeResponse({
          status: 302,
          headers: { location: 'https://upload.wikimedia.org/wikipedia/commons/r/re/Redir-ok.png' },
        });
      }
      return fakeResponse({ headers: { 'content-type': 'image/png' } });
    });
    try {
      const res = await request(app).get('/api/media/remote').query({ url });
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(seen, ['commons.wikimedia.org', 'upload.wikimedia.org']);
    } finally {
      clearCacheFor(url);
    }
  });

  it('refuse une redirection vers une adresse interne', async () => {
    const url = uniqueUrl('redir-internal');
    const seen = [];
    setRemoteMediaFetchForTests(async (target) => {
      seen.push(target);
      return fakeResponse({ status: 302, headers: { location: 'http://127.0.0.1:3306/' } });
    });
    const res = await request(app).get('/api/media/remote').query({ url });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(seen.length, 1, 'la cible interne ne doit jamais être contactée');
  });

  it('refuse un contenu qui n’est pas une image', async () => {
    const url = uniqueUrl('html');
    setRemoteMediaFetchForTests(async () =>
      fakeResponse({ headers: { 'content-type': 'text/html' }, body: Buffer.from('<script>') }),
    );
    const res = await request(app).get('/api/media/remote').query({ url });
    assert.strictEqual(res.status, 415);
  });

  it('refuse une image trop volumineuse', async () => {
    const url = uniqueUrl('big');
    setRemoteMediaFetchForTests(async () =>
      fakeResponse({
        headers: { 'content-type': 'image/png', 'content-length': String(64 << 20) },
      }),
    );
    const res = await request(app).get('/api/media/remote').query({ url });
    assert.strictEqual(res.status, 413);
  });
});

describe('Relais média — aperçu de catégorie Commons', () => {
  it('renvoie une URL Wikimedia normalisée', async () => {
    setRemoteMediaFetchForTests(async (target) => {
      assert.match(target, /^https:\/\/commons\.wikimedia\.org\/w\/api\.php\?/);
      return fakeResponse({
        body: Buffer.from(
          JSON.stringify({
            query: {
              pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/t.jpg' }] } },
            },
          }),
        ),
      });
    });
    const res = await request(app)
      .get('/api/media/commons-preview')
      .query({ category: `Category:Malus-${Date.now()}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.url, 'https://upload.wikimedia.org/t.jpg');
  });

  it('refuse un titre qui n’est pas une catégorie', async () => {
    const res = await request(app).get('/api/media/commons-preview').query({ category: 'File:x' });
    assert.strictEqual(res.status, 400);
  });
});

describe('Polices locales des fiches tutoriels', () => {
  it('la feuille pointe vers nos propres fichiers, jamais vers Google', async () => {
    const res = await request(app).get('/fonts/local-fonts.css');
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
    assert.match(res.text, /font-family: 'DM Sans'/);
    assert.match(res.text, /url\(\/fonts\/files\/dm-sans\//);
    assert.ok(!/googleapis|gstatic/.test(res.text));
  });

  it('un fichier listé est servi ; paquet inconnu ou traversée → 404', async () => {
    const css = (await request(app).get('/fonts/local-fonts.css')).text;
    const match = /url\((\/fonts\/files\/[^)]+\.woff2)\)/.exec(css);
    assert.ok(match, 'au moins un fichier woff2');
    const ok = await request(app).get(match[1]);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers['content-type'], 'font/woff2');
    assert.strictEqual(resolveLocalFontFile('lodash', 'index.woff2'), null);
    assert.strictEqual(resolveLocalFontFile('dm-sans', '../package.json'), null);
    const bad = await request(app).get('/fonts/files/dm-sans/..%2Fpackage.json');
    assert.strictEqual(bad.status, 404);
  });
});

describe('Fiches tutoriels — ressources tierces', () => {
  const html =
    '<!doctype html><html><head><style>@import url("https://fonts.googleapis.com/css2?family=X");body{}</style></head>' +
    '<body><img src="https://upload.wikimedia.org/a.jpg?x=1&amp;y=2"><img src="/uploads/b.jpg"></body></html>';

  it('mode local : feuille locale ajoutée, @import Google retiré, images relayées', () => {
    const out = localizeTutorialExternalAssets(html, 'local');
    assert.ok(out.includes('href="/fonts/local-fonts.css"'));
    assert.ok(!out.includes('fonts.googleapis.com'));
    assert.ok(
      out.includes(
        `src="/api/media/remote?url=${encodeURIComponent('https://upload.wikimedia.org/a.jpg?x=1&y=2')}"`,
      ),
    );
    assert.ok(out.includes('src="/uploads/b.jpg"'));
  });

  it('mode external : seules les polices locales sont ajoutées', () => {
    const out = localizeTutorialExternalAssets(html, 'external');
    assert.ok(out.includes('href="/fonts/local-fonts.css"'));
    assert.ok(out.includes('fonts.googleapis.com'));
    assert.ok(out.includes('src="https://upload.wikimedia.org/a.jpg'));
  });
});

describe('CSP candidate selon le réglage privacy.external_assets_mode', () => {
  let snapshot = null;
  before(async () => {
    snapshot = await snapshotSetting('privacy.external_assets_mode');
  });
  after(async () => {
    if (snapshot) await restoreSetting(snapshot);
  });

  it('mode local : aucun domaine Google Fonts', () => {
    const policy = buildEnforcedPolicy({ externalAssetsMode: 'local' });
    assert.ok(!policy.includes('fonts.googleapis.com'));
    assert.ok(!policy.includes('fonts.gstatic.com'));
    assert.ok(buildEnforcedPolicy().includes("font-src 'self' data:"), 'local par défaut');
  });

  it('mode external : Google Fonts autorisé pour les styles et les polices', () => {
    const policy = buildEnforcedPolicy({ externalAssetsMode: 'external' });
    assert.ok(policy.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"));
    assert.ok(policy.includes("font-src 'self' https://fonts.gstatic.com data:"));
  });

  it('l’en-tête servi suit le réglage', async () => {
    await setSetting('privacy.external_assets_mode', 'external', {});
    const ext = await request(app).get('/api/health');
    assert.match(ext.headers['content-security-policy'], /fonts\.gstatic\.com/);
    await setSetting('privacy.external_assets_mode', 'local', {});
    const loc = await request(app).get('/api/health');
    assert.ok(!/fonts\.gstatic\.com/.test(loc.headers['content-security-policy']));
  });

  it('le réglage est servi aux fronts par GET /api/settings/public', async () => {
    const res = await request(app).get('/api/settings/public');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body?.settings?.privacy?.external_assets_mode, 'local');
  });

  it('le jeu reçoit aussi le mode (GET /api/gl/auth/config)', async () => {
    const gl = await request(app).get('/api/gl/auth/config');
    assert.strictEqual(gl.status, 200);
    assert.strictEqual(gl.body.externalAssetsMode, 'local');
  });
});
