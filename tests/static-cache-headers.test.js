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
  IMMUTABLE_CACHE_CONTROL,
} = require('../lib/staticCacheHeaders');

function buildDistFixture() {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-dist-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'index.vite.html'), '<!doctype html><title>fm</title>');
  fs.writeFileSync(path.join(distDir, 'assets', 'main-AbCd1234.js'), '// hashé par Rollup');
  fs.writeFileSync(path.join(distDir, 'robots.txt'), 'User-agent: *');
  return distDir;
}

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
