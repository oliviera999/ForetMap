require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pickScientificSeed,
  computeEmptyGapKeys,
  mergeSources,
} = require('../lib/speciesAutofill');
const { fetchOpenAiSpeciesGapFill } = require('../lib/speciesAutofillOpenAi');

test('pickScientificSeed priorise hint_scientific binomial', () => {
  const seed = pickScientificSeed('tomate en pot', [], { scientific_name: 'Solanum lycopersicum L.' });
  assert.equal(seed, 'Solanum lycopersicum L.');
});

test('computeEmptyGapKeys liste les champs vides', () => {
  const keys = computeEmptyGapKeys({ name: 'X', habitat: '', description: '   ' });
  assert.ok(keys.includes('habitat'));
  assert.ok(!keys.includes('name'));
});

test('remplissage manuel des champs vides depuis un pack complémentaire (mock)', async () => {
  const merged = mergeSources([
    {
      source: 'wikipedia',
      confidence: 0.9,
      source_url: 'https://example.com',
      fields: { description: 'Court.' },
      photos: [],
      warnings: [],
    },
  ]);
  const extraPack = {
    source: 'extra_mock',
    confidence: 0.46,
    source_url: 'https://example.org',
    fields: { group_3: 'Rosaceae', second_name: 'Églantier' },
    photos: [],
    warnings: [],
  };
  const emptySet = new Set(computeEmptyGapKeys(merged.fields));
  assert.ok(emptySet.has('group_3'));
  for (const [k, v] of Object.entries(extraPack.fields)) {
    if (!emptySet.has(k)) continue;
    merged.fields[k] = v;
  }
  assert.equal(merged.fields.group_3, 'Rosaceae');
});

test('fetchOpenAiSpeciesGapFill sans clé / flag', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  delete process.env.SPECIES_AUTOFILL_OPENAI;
  delete process.env.OPENAI_API_KEY;
  const out = await fetchOpenAiSpeciesGapFill({
    query: 'x',
    keysToFill: ['habitat'],
    knownFields: {},
  });
  assert.equal(out, null);
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('fetchOpenAiSpeciesGapFill mock HTTP', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({ habitat: 'Haies et lisières.', nutrition: 'ignorer' }),
        },
      }],
    }),
  });
  const pack = await fetchOpenAiSpeciesGapFill({
    query: 'Rosa',
    scientificName: 'Rosa canina',
    partialContext: 'Contexte',
    keysToFill: ['habitat'],
    knownFields: { description: 'Arbrisseau' },
  }, { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.habitat, 'Haies et lisières.');
  assert.equal(pack.fields.nutrition, undefined);
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});
