'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { resolveGeneralRateLimitKey } = require('../lib/rateLimit');

const SECRET = 'rate-limit-key-test-secret';

function reqWithAuth(authorization, ip = '203.0.113.10') {
  return {
    headers: authorization ? { authorization } : {},
    ip,
    socket: { remoteAddress: ip },
  };
}

describe('resolveGeneralRateLimitKey', () => {
  it('utilise canonicalUserId quand présent', () => {
    const token = jwt.sign({ userType: 'student', userId: 42, canonicalUserId: 'stu:42' }, SECRET, {
      algorithm: 'HS256',
    });
    const key = resolveGeneralRateLimitKey(reqWithAuth(`Bearer ${token}`), { jwtSecret: SECRET });
    assert.equal(key, 'u:stu:42');
  });

  it('repli u:<userType>:<userId> sans canonicalUserId', () => {
    const token = jwt.sign({ userType: 'teacher', userId: 7 }, SECRET, { algorithm: 'HS256' });
    const key = resolveGeneralRateLimitKey(reqWithAuth(`Bearer ${token}`), { jwtSecret: SECRET });
    assert.equal(key, 'u:teacher:7');
  });

  it('repli IP sans jeton', () => {
    const key = resolveGeneralRateLimitKey(reqWithAuth(null, '198.51.100.1'), {
      jwtSecret: SECRET,
    });
    assert.equal(key, 'ip:198.51.100.1');
  });

  it('repli IP si jeton invalide', () => {
    const key = resolveGeneralRateLimitKey(reqWithAuth('Bearer not-a-jwt'), { jwtSecret: SECRET });
    assert.equal(key, 'ip:203.0.113.10');
  });

  it('repli IP si secret absent', () => {
    const token = jwt.sign({ userType: 'student', userId: 1 }, SECRET, { algorithm: 'HS256' });
    const key = resolveGeneralRateLimitKey(reqWithAuth(`Bearer ${token}`), { jwtSecret: null });
    assert.equal(key, 'ip:203.0.113.10');
  });
});
