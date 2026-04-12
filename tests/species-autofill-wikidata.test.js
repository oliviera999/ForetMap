require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectItemIdsFromClaims,
  extractWikidataTraitFields,
} = require('../lib/speciesAutofillWikidata');

test('collectItemIdsFromClaims agrège P366, P183 et P9714', () => {
  const claims = {
    P366: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: {
          type: 'wikibase-entityid',
          value: { id: 'Q2095' },
        },
      },
    }],
    P183: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: {
          type: 'wikibase-entityid',
          value: { id: 'Q142' },
        },
      },
    }],
    P9714: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: {
          type: 'wikibase-entityid',
          value: { id: 'Q155' },
        },
      },
    }],
  };
  const ids = collectItemIdsFromClaims(claims, ['P366', 'P183', 'P9714']);
  assert.ok(ids.includes('Q2095'));
  assert.ok(ids.includes('Q142'));
  assert.ok(ids.includes('Q155'));
});

test('extractWikidataTraitFields inclut P9714 dans geographic_origin', () => {
  const claims = {
    P9714: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: { type: 'wikibase-entityid', value: { id: 'Q155' } },
      },
    }],
  };
  const labelMap = new Map([['Q155', { fr: 'Brésil', en: 'Brazil' }]]);
  const { fields } = extractWikidataTraitFields(claims, labelMap);
  assert.match(fields.geographic_origin, /Brésil/);
});

test('extractWikidataTraitFields joint libellés P366 et P183', () => {
  const claims = {
    P366: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: { type: 'wikibase-entityid', value: { id: 'Q2095' } },
      },
    }],
    P183: [{
      mainsnak: {
        snaktype: 'value',
        datavalue: { type: 'wikibase-entityid', value: { id: 'Q142' } },
      },
    }],
  };
  const labelMap = new Map([
    ['Q2095', { fr: 'aliment', en: 'food' }],
    ['Q142', { fr: 'France', en: 'France' }],
  ]);
  const { fields, warnings } = extractWikidataTraitFields(claims, labelMap);
  assert.match(fields.human_utility, /aliment/);
  assert.match(fields.geographic_origin, /France/);
  assert.ok(warnings.length >= 1);
});
