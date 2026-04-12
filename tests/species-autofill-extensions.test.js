require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchTrefleSpeciesTraits, isTrefleAutofillEnabled } = require('../lib/speciesAutofillTrefle');
const { fetchOpenAiSpeciesTraits, isOpenAiAutofillEnabled } = require('../lib/speciesAutofillOpenAi');

test('Trefle : désactivé sans flag + token', async () => {
  const prevFlag = process.env.SPECIES_AUTOFILL_TREFLE;
  const prevTok = process.env.TREFLE_TOKEN;
  delete process.env.SPECIES_AUTOFILL_TREFLE;
  delete process.env.TREFLE_TOKEN;
  assert.equal(isTrefleAutofillEnabled(), false);
  assert.equal(await fetchTrefleSpeciesTraits('Solanum lycopersicum'), null);
  process.env.SPECIES_AUTOFILL_TREFLE = prevFlag;
  process.env.TREFLE_TOKEN = prevTok;
});

test('Trefle : activé mais squelette → null sans fetch', async () => {
  const prevFlag = process.env.SPECIES_AUTOFILL_TREFLE;
  const prevTok = process.env.TREFLE_TOKEN;
  process.env.SPECIES_AUTOFILL_TREFLE = '1';
  process.env.TREFLE_TOKEN = 'test-token';
  assert.equal(isTrefleAutofillEnabled(), true);
  assert.equal(await fetchTrefleSpeciesTraits('Solanum lycopersicum'), null);
  process.env.SPECIES_AUTOFILL_TREFLE = prevFlag;
  process.env.TREFLE_TOKEN = prevTok;
});

test('OpenAI : désactivé sans flag + clé', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  delete process.env.SPECIES_AUTOFILL_OPENAI;
  delete process.env.OPENAI_API_KEY;
  assert.equal(isOpenAiAutofillEnabled(), false);
  assert.equal(await fetchOpenAiSpeciesTraits({ query: 'Tomate' }), null);
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : parse JSON et mappe les champs (fetch mock)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            habitat: 'Sol drainé, soleil.',
            optimal_ph: '6-7',
          }),
        },
      }],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits({ query: 'Tomate', scientificName: 'Solanum' }, { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.source, 'openai');
  assert.equal(pack.confidence, 0.22);
  assert.equal(pack.fields.habitat, 'Sol drainé, soleil.');
  assert.equal(pack.fields.optimal_ph, '6-7');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});
