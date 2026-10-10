'use strict';

// Garde d'accès par cookie signé (lot 1, `lib/accessGate.js`) — sans base de données.

const { test } = require('node:test');
const assert = require('node:assert');

const {
  createSignedCookieGate,
  parseCookies,
  resolveCookieSecret,
  timingSafeStringEqual,
} = require('../lib/accessGate');

function fakeRes() {
  const headers = [];
  return {
    headers,
    append: (name, value) => headers.push([name, value]),
  };
}

function cookieHeaderFrom(res) {
  return res.headers
    .filter(([name]) => name === 'Set-Cookie')
    .map(([, value]) => value.split(';')[0])
    .join('; ');
}

test('parseCookies décode les paires et ignore le bruit', () => {
  assert.deepStrictEqual(parseCookies({ headers: { cookie: 'a=1; b=x%3Dy; ; c=' } }), {
    a: '1',
    b: 'x=y',
    c: '',
  });
  assert.deepStrictEqual(parseCookies({ headers: {} }), {});
  assert.deepStrictEqual(parseCookies(null), {});
});

test('timingSafeStringEqual : égalité stricte, longueurs différentes → faux, jamais d’exception', () => {
  assert.strictEqual(timingSafeStringEqual('abc', 'abc'), true);
  assert.strictEqual(timingSafeStringEqual('abc', 'abd'), false);
  assert.strictEqual(timingSafeStringEqual('abc', 'ab'), false);
  assert.strictEqual(timingSafeStringEqual(null, ''), true);
});

test('resolveCookieSecret : variable d’env, sinon repli hors production, sinon erreur en production', () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.FORETMAP_TEST_GATE_SECRET = '';
  process.env.NODE_ENV = 'test';
  assert.strictEqual(
    resolveCookieSecret({ envVar: 'FORETMAP_TEST_GATE_SECRET', devFallback: () => 'dev' }),
    'dev',
  );
  process.env.FORETMAP_TEST_GATE_SECRET = 'from-env';
  assert.strictEqual(resolveCookieSecret({ envVar: 'FORETMAP_TEST_GATE_SECRET' }), 'from-env');
  process.env.FORETMAP_TEST_GATE_SECRET = '';
  process.env.NODE_ENV = 'production';
  assert.throws(
    () => resolveCookieSecret({ envVar: 'FORETMAP_TEST_GATE_SECRET' }),
    /FORETMAP_TEST_GATE_SECRET requis en production/,
  );
  assert.strictEqual(
    resolveCookieSecret({
      envVar: 'FORETMAP_TEST_GATE_SECRET',
      requireInProduction: false,
      devFallback: 'x',
    }),
    'x',
  );
  process.env.NODE_ENV = previousEnv;
  delete process.env.FORETMAP_TEST_GATE_SECRET;
});

test('cookie signé : pose, relit, rejette une signature altérée ou un autre secret', () => {
  const gate = createSignedCookieGate({
    name: 'gate_test',
    ttlSeconds: 60,
    secret: () => 'secret-a',
  });
  const res = fakeRes();
  gate.set(res, 'valeur-1');
  const [name, header] = res.headers[0];
  assert.strictEqual(name, 'Set-Cookie');
  assert.match(header, /^gate_test=/);
  assert.match(header, /Max-Age=60; Path=\/; HttpOnly; SameSite=Lax$/);

  const req = { headers: { cookie: cookieHeaderFrom(res) } };
  assert.strictEqual(gate.read(req), 'valeur-1');

  const tampered = {
    headers: { cookie: `gate_test=${encodeURIComponent('valeur-2.' + gate.sign('valeur-1'))}` },
  };
  assert.strictEqual(gate.read(tampered), null);

  const other = createSignedCookieGate({
    name: 'gate_test',
    ttlSeconds: 60,
    secret: () => 'secret-b',
  });
  assert.strictEqual(other.read(req), null);
  assert.strictEqual(gate.verify('sans-point'), null);
});

test('readOrCreate : conserve la valeur existante, sinon en crée une et pose le cookie', () => {
  const gate = createSignedCookieGate({ name: 'anon', ttlSeconds: 10, secret: () => 's' });
  const first = fakeRes();
  const created = gate.readOrCreate({ headers: {} }, first, () => 'nouveau');
  assert.strictEqual(created, 'nouveau');
  assert.strictEqual(first.headers.length, 1);

  const second = fakeRes();
  const req = { headers: { cookie: cookieHeaderFrom(first) } };
  assert.strictEqual(gate.readOrCreate(req, second), 'nouveau');
  assert.strictEqual(second.headers.length, 0, 'aucun nouveau cookie posé');

  gate.clear(second);
  assert.match(second.headers[0][1], /^anon=; Max-Age=0/);
});

test('Secure suit l’environnement de production', () => {
  const gate = createSignedCookieGate({
    name: 'g',
    ttlSeconds: 10,
    secret: () => 's',
    secure: () => true,
  });
  const res = fakeRes();
  gate.set(res, 'v');
  assert.match(res.headers[0][1], /; Secure$/);
});

// --- Échéance signée (laissez-passer des plans) ---------------------------------------------

function expiringGate(extra = {}) {
  return createSignedCookieGate({
    name: 'pass_test',
    ttlSeconds: 3600,
    secret: () => 'secret-echeance',
    bindName: true,
    expiring: true,
    ...extra,
  });
}

function cookieValueFrom(res) {
  return decodeURIComponent(cookieHeaderFrom(res).split('=').slice(1).join('='));
}

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

test('échéance signée : le laissez-passer porte sa date d’expiration, couverte par la signature', () => {
  const gate = expiringGate();
  const res = fakeRes();
  gate.set(res, 'code-abc', { now: NOW });
  assert.match(res.headers[0][1], /Max-Age=3600;/);
  const raw = cookieValueFrom(res);
  const expected = Math.floor(NOW / 1000) + 3600;
  assert.match(raw, new RegExp(`^code-abc~${expected}\\.`), 'échéance lisible dans la valeur');
  const req = { headers: { cookie: cookieHeaderFrom(res) } };
  assert.strictEqual(gate.read(req, { now: NOW }), 'code-abc');
  assert.strictEqual(gate.read(req, { now: NOW + 3599 * 1000 }), 'code-abc');
});

test('échéance signée : un laissez-passer expiré est refusé', () => {
  const gate = expiringGate();
  const res = fakeRes();
  gate.set(res, 'code-abc', { now: NOW });
  const req = { headers: { cookie: cookieHeaderFrom(res) } };
  assert.strictEqual(gate.read(req, { now: NOW + 3600 * 1000 }), null);
  assert.strictEqual(gate.read(req, { now: NOW + 40 * 24 * 3600 * 1000 }), null);
});

test('échéance signée : une échéance modifiée invalide la signature', () => {
  const gate = expiringGate();
  const res = fakeRes();
  gate.set(res, 'code-abc', { now: NOW });
  const raw = cookieValueFrom(res);
  const pushed = raw.replace(/~(\d+)\./, (_m, exp) => `~${Number(exp) + 365 * 24 * 3600}.`);
  assert.notStrictEqual(pushed, raw);
  assert.strictEqual(gate.verify(pushed, { now: NOW }), null);
  // Retirer l'échéance ne marche pas mieux : la signature couvrait la valeur complète.
  const stripped = raw.replace(/~\d+\./, '.');
  assert.strictEqual(gate.verify(stripped, { now: NOW }), null);
});

test('échéance signée : un laissez-passer sans échéance (format antérieur) est refusé', () => {
  const gate = expiringGate();
  // Format émis avant l'échéance signée : `<valeur>.<HMAC(nom + valeur)>`, signature valide.
  const legacy = `code-abc.${gate.sign('code-abc')}`;
  assert.strictEqual(gate.verify(legacy, { now: NOW }), null);
});

test('échéance signée : la durée se règle à l’émission (Max-Age et échéance suivent)', () => {
  const gate = expiringGate();
  const res = fakeRes();
  gate.set(res, 'code-abc', { now: NOW, ttlSeconds: 2 * 24 * 3600 });
  assert.match(res.headers[0][1], /Max-Age=172800;/);
  const req = { headers: { cookie: cookieHeaderFrom(res) } };
  assert.strictEqual(gate.read(req, { now: NOW + 47 * 3600 * 1000 }), 'code-abc');
  assert.strictEqual(gate.read(req, { now: NOW + 49 * 3600 * 1000 }), null);
});

test('garde sans échéance : comportement inchangé (progression Visite)', () => {
  const gate = createSignedCookieGate({ name: 'anon', ttlSeconds: 60, secret: () => 's' });
  const res = fakeRes();
  gate.set(res, 'uuid-1');
  const req = { headers: { cookie: cookieHeaderFrom(res) } };
  assert.strictEqual(gate.read(req, { now: NOW + 10 * 365 * 24 * 3600 * 1000 }), 'uuid-1');
  assert.doesNotMatch(cookieValueFrom(res), /~/);
});
