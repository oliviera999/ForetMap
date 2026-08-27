'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  EXPRESS_MAJOR,
  registerSpaFallbackRoutes,
  createSpaFallbackHandler,
  resolveSpaIndexPath,
} = require('../lib/spaFallback');
const { resolveProductFromRequest } = require('../lib/productResolver');

test('EXPRESS_MAJOR correspond à la version installée (>= 4)', () => {
  assert.ok(EXPRESS_MAJOR >= 4);
});

test('registerSpaFallbackRoutes sert GET / (200 html)', async () => {
  const mini = express();
  const deployHelp = path.join(__dirname, '..', 'public', 'deploy-help.html');
  registerSpaFallbackRoutes(
    mini,
    createSpaFallbackHandler({
      serveDist: false,
      distSpaIndex: '',
      distGlIndex: '',
      deployHelpPath: deployHelp,
      resolveProductFromRequest,
      logger: { error: () => {} },
    }),
  );
  const res = await request(mini).get('/');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /html/i);
});

test('registerSpaFallbackRoutes sert les sous-chemins SPA', async () => {
  const mini = express();
  const deployHelp = path.join(__dirname, '..', 'public', 'deploy-help.html');
  registerSpaFallbackRoutes(
    mini,
    createSpaFallbackHandler({
      serveDist: false,
      distSpaIndex: '',
      distGlIndex: '',
      deployHelpPath: deployHelp,
      resolveProductFromRequest,
      logger: { error: () => {} },
    }),
  );
  const res = await request(mini).get('/chemin-spa-inconnu');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /html/i);
});

test('resolveSpaIndexPath choisit gl.html sur produit gl en prod', () => {
  const distDir = path.join(__dirname, '..', 'dist');
  const distSpaIndex = fs.existsSync(path.join(distDir, 'index.vite.html'))
    ? path.join(distDir, 'index.vite.html')
    : path.join(distDir, 'index.html');
  const distGlIndex = path.join(distDir, 'gl.html');
  const serveDist = process.env.NODE_ENV === 'production' && fs.existsSync(distSpaIndex);
  if (!serveDist || !fs.existsSync(distGlIndex)) return;

  const indexPath = resolveSpaIndexPath(
    { hostname: 'gl.olution.info', get: () => '' },
    {
      serveDist: true,
      distSpaIndex,
      distGlIndex,
      deployHelpPath: path.join(__dirname, '..', 'public', 'deploy-help.html'),
      resolveProductFromRequest,
    },
  );
  assert.strictEqual(indexPath, distGlIndex);
});

// ── Garde `/api` : un chemin d'API inconnu ne doit pas retomber sur l'index de la SPA ──
// Sans elle, le wildcard renvoyait `200 text/html` pour un endpoint supprimé ou mal
// orthographié : le client recevait un succès, la supervision ne distinguait plus
// « endpoint disparu » de « tout va bien », et un sondage de l'API concluait à tort qu'une
// route inexistante était exposée sans authentification (audit du 26/08, §2.2).

function miniAppWithFallback() {
  const mini = express();
  mini.get('/api/existe', (req, res) => res.json({ ok: true }));
  registerSpaFallbackRoutes(
    mini,
    createSpaFallbackHandler({
      serveDist: false,
      distSpaIndex: '',
      distGlIndex: '',
      deployHelpPath: path.join(__dirname, '..', 'public', 'deploy-help.html'),
      resolveProductFromRequest,
      logger: { error: () => {} },
    }),
  );
  return mini;
}

test('GET /api inconnu → 404 JSON, pas l’index de la SPA', async () => {
  const res = await request(miniAppWithFallback()).get('/api/nimporte-quoi');
  assert.strictEqual(res.status, 404);
  assert.match(String(res.headers['content-type'] || ''), /json/i);
  assert.strictEqual(res.body.error, 'Route introuvable');
});

test('POST /api inconnu → 404 JSON (la garde est montée en use, pas en get)', async () => {
  const res = await request(miniAppWithFallback()).post('/api/nimporte-quoi');
  assert.strictEqual(res.status, 404);
  assert.match(String(res.headers['content-type'] || ''), /json/i);
});

test('la garde ne masque pas une route /api réellement montée', async () => {
  const res = await request(miniAppWithFallback()).get('/api/existe');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { ok: true });
});

test('un chemin hors /api retombe toujours sur la SPA', async () => {
  const res = await request(miniAppWithFallback()).get('/apiculture');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /html/i);
});
