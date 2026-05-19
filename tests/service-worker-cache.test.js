'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('le service worker ne met pas en cache la progression visite privée', () => {
  for (const relativePath of ['../public/sw.js', '../dist/sw.js']) {
    const swSource = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
    const visitReadMatcher = swSource.match(/function isVisitReadApiPath\(pathname\) \{[\s\S]*?\n\}/);
    assert.ok(visitReadMatcher, `${relativePath}: isVisitReadApiPath doit rester explicite`);
    assert.ok(!visitReadMatcher[0].includes('/api/visit/progress'), relativePath);
  }
});
