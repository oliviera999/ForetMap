'use strict';

/**
 * Limiteur strict d'authentification (choix C9, simulation du 7 novembre 2026) : défaut 300 par
 * 15 min et par IP (toutes les tablettes du lycée sortent par une seule adresse), bornes 10..1000,
 * et journal agrégé : une ligne `warn` par adresse et par fenêtre, avec le nombre de refus de la
 * fenêtre précédente.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTH_RATE_LIMIT_DEFAULT,
  AUTH_RATE_LIMIT_WINDOW_MS,
  parseAuthRateLimitMax,
  createAuthLimitWindowLogger,
} = require('../lib/rateLimit');

test('défaut 300 / 15 min ; bornes 10..1000 ; valeur invalide → repli', () => {
  assert.equal(AUTH_RATE_LIMIT_DEFAULT, 300);
  assert.equal(AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(parseAuthRateLimitMax(''), 300);
  assert.equal(parseAuthRateLimitMax(undefined), 300);
  assert.equal(parseAuthRateLimitMax('120'), 120);
  assert.equal(parseAuthRateLimitMax('5'), 300);
  assert.equal(parseAuthRateLimitMax('5000'), 300);
  assert.equal(parseAuthRateLimitMax('abc'), 300);
});

test('journal agrégé : une ligne par adresse et par fenêtre, refus de la fenêtre précédente reportés', () => {
  const lines = [];
  let clock = 1_000_000;
  const onLimited = createAuthLimitWindowLogger({
    logger: { warn: (data, message) => lines.push({ ...data, message }) },
    windowMs: 1000,
    limit: 300,
    now: () => clock,
  });
  const req = (ip) => ({ ip, path: '/api/gl/auth/login' });
  for (let i = 0; i < 25; i += 1) onLimited(req('10.20.30.40'));
  assert.equal(lines.length, 1, 'une seule ligne dans la fenêtre');
  assert.equal(lines[0].msg, 'auth_rate_limit_reached');
  assert.equal(lines[0].clientIpTruncated, '10.20.*', 'jamais l’adresse complète');
  assert.equal(lines[0].limit, 300);
  assert.equal(lines[0].previousWindowRefusals, undefined);

  onLimited(req('192.0.2.9'));
  assert.equal(lines.length, 2, 'une autre adresse ouvre sa propre ligne');

  clock += 1001;
  onLimited(req('10.20.30.40'));
  assert.equal(lines.length, 3, 'nouvelle fenêtre → nouvelle ligne');
  assert.equal(lines[2].previousWindowRefusals, 25);
});
