'use strict';

/**
 * Connexion Google **lancée depuis un autre produit** que celui qui porte le rappel OAuth
 * (proflyautey, gl, planlyautey… vers l'hôte de ForetMap).
 *
 * Régression corrigée ici : Google ne rappelle que sur les `redirect_uri` enregistrées — en
 * production il n'y en a qu'une. Les cookies de la poignée de main sont posés **sans
 * `Domain`**, donc liés à l'hôte qui les pose. Partir de `proflyautey.*` les rendait invisibles
 * au rappel arrivant sur l'hôte de ForetMap : plus de `state` (« Connexion Google invalide
 * (session expirée) »), et plus d'origine de retour non plus, si bien que l'utilisateur
 * atterrissait sur ForetMap avec une erreur au lieu de revenir sur le plan des personnels.
 *
 * Le correctif fait rebondir le navigateur par l'hôte du rappel avant d'aller chez Google.
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { app } = require('../server');
const { initSchema } = require('../database');

const CALLBACK_ORIGIN = 'https://foretmap.olution.info';
const STAFF_ORIGIN = 'https://proflyautey.olution.info';

/** Environnement OAuth d'origine, restauré en fin de suite (les autres suites le partagent). */
const savedEnv = {};
const ENV_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'FRONTEND_ORIGIN',
];

/** Requête vue par le serveur derrière le reverse-proxy, depuis l'hôte demandé. */
function fromHost(path, host) {
  return request(app)
    .get(path)
    .set('Host', host)
    .set('X-Forwarded-Host', host)
    .set('X-Forwarded-Proto', 'https');
}

function cookieValue(res, name) {
  const hit = [].concat(res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split(';')[0].slice(name.length + 1)) : '';
}

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  // Configuration de production : UNE seule `redirect_uri` enregistrée chez Google.
  process.env.GOOGLE_OAUTH_REDIRECT_URI = `${CALLBACK_ORIGIN}/api/auth/google/callback`;
  process.env.FRONTEND_ORIGIN = CALLBACK_ORIGIN;
  await initSchema();
});

after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('OAuth Google lancé depuis un autre produit', () => {
  it('premier saut : rebondit vers l’hôte du rappel, sans poser de cookie ici', async () => {
    const res = await fromHost('/api/auth/google/start?mode=teacher', 'proflyautey.olution.info');
    assert.strictEqual(res.status, 302);
    const location = new URL(String(res.headers.location));
    assert.strictEqual(location.origin, CALLBACK_ORIGIN);
    assert.strictEqual(location.pathname, '/api/auth/google/start');
    assert.strictEqual(location.searchParams.get('mode'), 'teacher');
    assert.strictEqual(location.searchParams.get('return_origin'), STAFF_ORIGIN);
    // Aucun cookie posé sur l'hôte de départ : le rappel ne le verrait jamais, et un cookie
    // que personne ne lit vaut moins qu'un cookie absent.
    assert.deepStrictEqual([].concat(res.headers['set-cookie'] || []), []);
  });

  it('second saut : sur l’hôte du rappel, la poignée de main est posée au bon endroit', async () => {
    const res = await fromHost(
      `/api/auth/google/start?mode=teacher&return_origin=${encodeURIComponent(STAFF_ORIGIN)}`,
      'foretmap.olution.info',
    );
    assert.strictEqual(res.status, 302);
    assert.ok(String(res.headers.location).startsWith('https://accounts.google.com/'));
    assert.ok(cookieValue(res, 'foretmap_oauth_state'), 'state posé');
    assert.strictEqual(cookieValue(res, 'foretmap_oauth_mode'), 'teacher');
    // C'est ce cookie-ci qui ramènera l'utilisateur sur proflyautey après le rappel.
    assert.strictEqual(cookieValue(res, 'foretmap_oauth_origin'), STAFF_ORIGIN);
  });

  it('pas de boucle : arrivé sur l’hôte du rappel, on part chez Google', async () => {
    const res = await fromHost('/api/auth/google/start?mode=student', 'foretmap.olution.info');
    assert.ok(String(res.headers.location).startsWith('https://accounts.google.com/'));
  });

  it('`return_origin` hostile : ignoré au profit de l’origine courante', async () => {
    for (const hostile of [
      'https://proflyautey.attaquant.test', // bon préfixe, mauvais domaine parent
      'https://inconnu.olution.info', // bon domaine, produit non déclaré
      'javascript:alert(1)',
      '//proflyautey.attaquant.test',
    ]) {
      const res = await fromHost(
        `/api/auth/google/start?mode=teacher&return_origin=${encodeURIComponent(hostile)}`,
        'foretmap.olution.info',
      );
      assert.strictEqual(
        cookieValue(res, 'foretmap_oauth_origin'),
        CALLBACK_ORIGIN,
        `origine de retour refusée pour ${hostile}`,
      );
    }
  });

  it('déploiement mono-hôte : aucun rebond, comportement inchangé', async () => {
    const saved = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    try {
      // Sans URI enregistrée en dur, elle est dérivée de la requête : les deux origines
      // coïncident, il n'y a rien à faire rebondir.
      const res = await fromHost('/api/auth/google/start?mode=student', 'proflyautey.olution.info');
      assert.ok(String(res.headers.location).startsWith('https://accounts.google.com/'));
      assert.ok(cookieValue(res, 'foretmap_oauth_state'), 'state posé sur place');
    } finally {
      process.env.GOOGLE_OAUTH_REDIRECT_URI = saved;
    }
  });
});
