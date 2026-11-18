'use strict';

/**
 * « Tenir à deux », ensemble unifié, PR 3 (M13), point 7 — réseau. Au lycée, les trente
 * appareils d'une classe sortent par UNE adresse publique (NAT de l'établissement). Les
 * sessions d'équipe doivent donc compter dans le plafond de l'API **par appareil**, jamais par
 * adresse : un tour normal ne reçoit aucun 429.
 *
 * Le limiteur de l'application est coupé en test (`shouldSkipRateLimit`) : la charge est jouée
 * sur un limiteur neuf, monté avec la **même clé** (`resolveGeneralRateLimitKey`) et le **même
 * plafond** (`generalApiRateLimitMax`) que `/api/*`.
 */

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const rateLimit = require('express-rate-limit');
const request = require('supertest');
const {
  resolveGeneralRateLimitKey,
  generalApiRateLimitMax,
  authRateLimitMax,
} = require('../lib/rateLimit');
const { signGuestToken, newJti } = require('../lib/glGuestToken');
const { listAuthRateLimitPaths } = require('../lib/products');

const APPAREILS = 30;
/**
 * Requêtes d'un appareil pendant un tour : mesuré sur le banc `multi-appareils` (≈ 20 gestes et
 * lectures par tablette et par séance), multiplié par six pour couvrir les rechargements de
 * l'écran à chaque évènement de la salle.
 */
const REQUETES_PAR_APPAREIL = 120;

/** Jeton d'une tablette d'équipe, tel que l'émet `issueTeamSession` (sans écrire en base). */
function jetonDeTablette(i) {
  const jti = newJti();
  const teamId = 1 + (i % 8);
  return signGuestToken({
    userId: `equipe-7-${teamId}-${jti.slice(0, 8)}`,
    displayName: 'Tablette d’équipe',
    claims: { team_session: { gameId: 7, teamId, jti } },
    expiresIn: '3h',
  });
}

function appliLimitee() {
  const app = express();
  app.use(
    '/api/',
    rateLimit({
      windowMs: 60 * 1000,
      limit: generalApiRateLimitMax,
      keyGenerator: (req) => resolveGeneralRateLimitKey(req),
      validate: { keyGeneratorIpFallback: false },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.all('/api/gl/games/7/*chemin', (_req, res) => res.json({ ok: true }));
  return app;
}

async function tirer(app, jeton, n) {
  const statuts = [];
  // Par paquets : trente appareils en parallèle, chacun enchaînant ses requêtes.
  for (let k = 0; k < n; k += 1) {
    let req = request(app).get('/api/gl/games/7/tenir/tour');
    if (jeton) req = req.set('Authorization', `Bearer ${jeton}`);
    statuts.push((await req).status);
  }
  return statuts;
}

test('clé du plafond : une par appareil, jamais l’adresse — tablette acceptée ou en attente', () => {
  const jetons = Array.from({ length: APPAREILS }, (_, i) => jetonDeTablette(i));
  const cles = jetons.map((t) =>
    resolveGeneralRateLimitKey({
      headers: { authorization: `Bearer ${t}` },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
    }),
  );
  assert.equal(new Set(cles).size, APPAREILS, 'trente appareils, trente clés');
  for (const cle of cles) assert.match(cle, /^u:gl_guest:equipe-7-\d+-[0-9a-f]{8}$/);
  // Deux tablettes de la même équipe ne partagent pas leur plafond.
  const memeEquipe = cles.filter((c) => c.startsWith('u:gl_guest:equipe-7-1-'));
  assert.ok(memeEquipe.length >= 2);
  assert.equal(new Set(memeEquipe).size, memeEquipe.length);
});

test('30 appareils derrière une adresse : aucun 429 sur un tour normal', async () => {
  const total = APPAREILS * REQUETES_PAR_APPAREIL;
  assert.ok(
    total > generalApiRateLimitMax,
    `la charge (${total} requêtes dans la fenêtre) dépasse le plafond d’une clé (${generalApiRateLimitMax}) : comptée par adresse, elle serait refusée`,
  );
  assert.ok(REQUETES_PAR_APPAREIL < generalApiRateLimitMax);
  const app = appliLimitee();
  const jetons = Array.from({ length: APPAREILS }, (_, i) => jetonDeTablette(i));
  const resultats = await Promise.all(jetons.map((t) => tirer(app, t, REQUETES_PAR_APPAREIL)));
  const statuts = resultats.flat();
  assert.equal(statuts.length, total);
  assert.equal(statuts.filter((s) => s === 429).length, 0, 'aucun 429');
  assert.ok(statuts.every((s) => s === 200));
});

test('témoin : la même charge sans jeton, comptée par adresse, est bien refusée', async () => {
  const app = appliLimitee();
  const statuts = (
    await Promise.all(Array.from({ length: APPAREILS }, () => tirer(app, null, 60)))
  ).flat();
  assert.ok(
    statuts.filter((s) => s === 429).length > 0,
    'sans clé par appareil, trente clients derrière une adresse touchent le plafond',
  );
});

test('lien de classe : le plafond des connexions par adresse laisse entrer une classe entière', () => {
  // Chaque appareil ouvre le lien (1 requête) puis demande son équipe (1 requête), et peut
  // redemander après une demande expirée. La relecture de la demande, elle, porte le jeton de
  // la demande : elle compte par appareil, pas ici.
  const parAppareil = 4;
  assert.ok(
    authRateLimitMax >= APPAREILS * parAppareil,
    `plafond des connexions (${authRateLimitMax} / 15 min) ≥ ${APPAREILS * parAppareil}`,
  );
  // Le limiteur par adresse est monté par préfixe : la relecture de la demande n'en relève pas.
  const chemins = listAuthRateLimitPaths();
  assert.ok(chemins.includes('/api/gl/class-link/session'));
  assert.ok(!chemins.some((c) => '/api/gl/class-link/demande'.startsWith(c)));
});
