'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readServiceWorker(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function extractVisitReadMatcher(source) {
  const match = /function isVisitReadApiPath\(pathname\) \{[\s\S]*?\n\}/.exec(source);
  assert.ok(match, 'matcher isVisitReadApiPath introuvable');
  return match[0];
}

describe('Service Worker cache visite', () => {
  for (const relativePath of ['public/sw.js', 'dist/sw.js']) {
    it(`${relativePath} ne met pas en cache la progression liée au compte`, () => {
      const source = readServiceWorker(relativePath);
      const matcher = extractVisitReadMatcher(source);
      assert.ok(matcher.includes('/api/maps'));
      assert.ok(matcher.includes('/api/visit/content'));
      assert.ok(!matcher.includes('/api/visit/progress'));
    });
  }

  it('public/sw.js et dist/sw.js utilisent la même version de cache', () => {
    const publicSw = readServiceWorker('public/sw.js');
    const distSw = readServiceWorker('dist/sw.js');
    const publicVersion = /const CACHE_NAME = '([^']+)'/.exec(publicSw)?.[1];
    const distVersion = /const CACHE_NAME = '([^']+)'/.exec(distSw)?.[1];
    assert.ok(publicVersion);
    assert.strictEqual(publicVersion, distVersion);
  });
});
