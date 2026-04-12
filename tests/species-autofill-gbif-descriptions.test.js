require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractGbifDescriptionFields,
  fetchGbifSpeciesEnrichment,
} = require('../lib/speciesAutofillGbifDescriptions');

test('extractGbifDescriptionFields classe habit et native range', () => {
  const fields = extractGbifDescriptionFields([
    { type: 'habit', language: 'eng', description: 'herb' },
    { type: 'native range', language: 'fra', description: 'Europe' },
    { type: 'ecology', language: 'en', description: 'wet meadows' },
  ]);
  assert.match(fields.habitat, /herb/i);
  assert.match(fields.geographic_origin, /Europe/i);
  assert.match(fields.ecosystem_role, /wet meadows/i);
});

test('fetchGbifSpeciesEnrichment agrège warnings et champs (fetch mock)', async () => {
  const fetchJson = async (url) => {
    const u = String(url);
    if (u.includes('/descriptions')) {
      return { results: [{ type: 'habit', language: '', description: 'shrub' }] };
    }
    return { taxonomicStatus: 'DOUBTFUL', remarks: 'Check synonymy.' };
  };
  const { fields, warnings } = await fetchGbifSpeciesEnrichment(12345, fetchJson, {});
  assert.match(fields.habitat, /shrub/i);
  assert.ok(warnings.some((w) => /DOUBTFUL/i.test(w)));
});
