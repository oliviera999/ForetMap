'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createDistStaticServeOptions,
  createPublicStaticServeOptions,
  JAVASCRIPT_CONTENT_TYPE,
  IMMUTABLE_CACHE_CONTROL,
  FONT_CACHE_CONTROL,
  FRESQUE_CACHE_CONTROL,
} = require('../lib/staticCacheHeaders');

function buildDistFixture() {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-dist-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.mkdirSync(path.join(distDir, 'fonts'));
  fs.mkdirSync(path.join(distDir, 'fresques', 'climat-junior-fr-v7-5', 'cards'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(distDir, 'fresques', 'climat-junior-fr-v7-5', 'cards', 'c04-recto.sm.webp'),
    'RIFF-factice',
  );
  fs.writeFileSync(path.join(distDir, 'index.vite.html'), '<!doctype html><title>fm</title>');
  fs.writeFileSync(path.join(distDir, 'assets', 'main-AbCd1234.js'), '// hashé par Rollup');
  fs.writeFileSync(path.join(distDir, 'fonts', 'noto-color-emoji.woff2'), 'wOF2-factice');
  fs.writeFileSync(path.join(distDir, 'robots.txt'), 'User-agent: *');
  fs.mkdirSync(path.join(distDir, 'gl', 'intro', 'assets', 'audio'), { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'gl', 'intro', 'assets', '960174da-012b-46d8-ad07-7482b2d7830a.bin'),
    '/* bundle JavaScript de l’intro, nommé .bin par l’export */',
  );
  fs.writeFileSync(path.join(distDir, 'gl', 'intro', 'assets', 'audio', 'loop.mp3'), 'ID3');
  fs.writeFileSync(path.join(distDir, 'autre.bin'), 'binaire');
  return distDir;
}

test('les scripts .bin de l’intro G&L sont servis en JavaScript (dist et public), le reste inchangé', async () => {
  // Prod (8 novembre 2026) : `application/octet-stream` + `nosniff` → Chrome refuse d’exécuter
  // le script, l’intro reste muette. Même règle hors production (public/).
  const distDir = buildDistFixture();
  for (const options of [createDistStaticServeOptions(distDir), createPublicStaticServeOptions()]) {
    const mini = express();
    mini.use(express.static(distDir, options));
    const script = await request(mini).get(
      '/gl/intro/assets/960174da-012b-46d8-ad07-7482b2d7830a.bin',
    );
    assert.strictEqual(script.status, 200);
    assert.strictEqual(script.headers['content-type'], JAVASCRIPT_CONTENT_TYPE);
    const audio = await request(mini).get('/gl/intro/assets/audio/loop.mp3');
    assert.match(String(audio.headers['content-type']), /^audio\/mpeg/);
    const other = await request(mini).get('/autre.bin');
    assert.match(String(other.headers['content-type']), /octet-stream/);
  }
  fs.rmSync(distDir, { recursive: true, force: true });
});

test('dist/assets/* est servi en cache long immutable, les HTML restent no-store', async () => {
  const distDir = buildDistFixture();
  const mini = express();
  mini.use(express.static(distDir, createDistStaticServeOptions(distDir)));

  const asset = await request(mini).get('/assets/main-AbCd1234.js');
  assert.strictEqual(asset.status, 200);
  assert.strictEqual(asset.headers['cache-control'], IMMUTABLE_CACHE_CONTROL);

  const html = await request(mini).get('/index.vite.html');
  assert.strictEqual(html.status, 200);
  assert.match(String(html.headers['cache-control'] || ''), /no-store/);
  assert.strictEqual(html.headers['pragma'], 'no-cache');

  // Un fichier hors assets/ et hors HTML d'entrée ne reçoit ni l'un ni l'autre.
  const other = await request(mini).get('/robots.txt');
  assert.strictEqual(other.status, 200);
  assert.notStrictEqual(other.headers['cache-control'], IMMUTABLE_CACHE_CONTROL);
  assert.doesNotMatch(String(other.headers['cache-control'] || ''), /no-store/);

  fs.rmSync(distDir, { recursive: true, force: true });
});

test("index: false — la racine n'est pas résolue en index.html par express.static", async () => {
  const distDir = buildDistFixture();
  const mini = express();
  mini.use(express.static(distDir, createDistStaticServeOptions(distDir)));
  const res = await request(mini).get('/');
  // Le SPA fallback (hors périmètre de ce test) prend le relais dans server.js.
  assert.strictEqual(res.status, 404);
  fs.rmSync(distDir, { recursive: true, force: true });
});

test('dist/fonts/* reçoit un cache long borné (30 j), sans immutable', async () => {
  const distDir = buildDistFixture();
  const mini = express();
  mini.use(express.static(distDir, createDistStaticServeOptions(distDir)));

  const font = await request(mini).get('/fonts/noto-color-emoji.woff2');
  assert.strictEqual(font.status, 200);
  assert.strictEqual(font.headers['cache-control'], FONT_CACHE_CONTROL);
  // Nom de fichier non haché : `immutable` figerait la police pour un an chez les visiteurs
  // (cf. docs/AUDIT_EMOJIS_APPLE_2026-09-17.md, EMO-APL-004 et R6).
  assert.doesNotMatch(String(font.headers['cache-control'] || ''), /immutable/);

  fs.rmSync(distDir, { recursive: true, force: true });
});

test('dist/fresques/* (cartes des jeux fresque) reçoit un cache long borné, sans immutable', async () => {
  const distDir = buildDistFixture();
  const mini = express();
  mini.use(express.static(distDir, createDistStaticServeOptions(distDir)));
  const res = await request(mini).get('/fresques/climat-junior-fr-v7-5/cards/c04-recto.sm.webp');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['cache-control'], FRESQUE_CACHE_CONTROL);
  assert.doesNotMatch(FRESQUE_CACHE_CONTROL, /immutable/);
  assert.match(FRESQUE_CACHE_CONTROL, /max-age=2592000/);
  fs.rmSync(distDir, { recursive: true, force: true });
});
