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
    })
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
    })
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
    }
  );
  assert.strictEqual(indexPath, distGlIndex);
});
