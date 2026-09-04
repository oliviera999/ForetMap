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
