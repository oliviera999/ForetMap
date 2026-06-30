'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ANCIENS_IDS,
  BATIMENTS,
  buildSql,
} = require('../scripts/gen-zones-lyautey-batiments');

describe('zones Lyautey — SQL import bâtiments', () => {
  it('ne supprime pas les anciens ids génériques déjà référencés', () => {
    const sql = buildSql();

    assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+zones\b/i);
    assert.match(sql, /@foretmap_lyautey_has_legacy_batiments\s*:=\s*EXISTS/i);
    for (const id of ANCIENS_IDS) {
      assert.match(sql, new RegExp(`'${id}'`));
    }
  });

  it('insère ou met à jour les ids parlants uniquement si aucun ancien import existe', () => {
    const sql = buildSql();

    assert.equal(
      (sql.match(/WHERE @foretmap_lyautey_has_legacy_batiments = 0/g) || []).length,
      BATIMENTS.length,
    );
    assert.equal((sql.match(/ON DUPLICATE KEY UPDATE/g) || []).length, BATIMENTS.length);
  });
});
