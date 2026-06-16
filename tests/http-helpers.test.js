'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOptionalString,
  parsePositiveInt,
  parsePageQuery,
  buildInClauseParams,
} = require('../lib/shared/httpHelpers');

describe('httpHelpers', () => {
  it('normalizeOptionalString renvoie null sur vide et trim sur texte', () => {
    assert.equal(normalizeOptionalString(null), null);
    assert.equal(normalizeOptionalString('   '), null);
    assert.equal(normalizeOptionalString('  abc  '), 'abc');
  });

  it('parsePositiveInt applique le fallback sur valeur invalide', () => {
    assert.equal(parsePositiveInt(undefined, 7), 7);
    assert.equal(parsePositiveInt('0', 7), 7);
    assert.equal(parsePositiveInt('-2', 7), 7);
    assert.equal(parsePositiveInt('42', 7), 42);
  });

  it('parsePageQuery borne page_size et calcule offset', () => {
    const p1 = parsePageQuery(
      { page: '2', page_size: '80' },
      { defaultPageSize: 20, maxPageSize: 50 },
    );
    assert.deepEqual(p1, { page: 2, pageSize: 50, offset: 50 });

    const p2 = parsePageQuery({}, { defaultPageSize: 15, maxPageSize: 30 });
    assert.deepEqual(p2, { page: 1, pageSize: 15, offset: 0 });
  });

  it('buildInClauseParams construit un IN SQL sécurisé', () => {
    const empty = buildInClauseParams([]);
    assert.deepEqual(empty, { clause: '(NULL)', params: [] });

    const filled = buildInClauseParams(['a', 'b', 'c']);
    assert.equal(filled.clause, '(?,?,?)');
    assert.deepEqual(filled.params, ['a', 'b', 'c']);
  });
});
