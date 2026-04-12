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

test('Trefle : mapping quand API renvoie une espèce (fetch mock)', async () => {
  const prevFlag = process.env.SPECIES_AUTOFILL_TREFLE;
  const prevTok = process.env.TREFLE_TOKEN;
  process.env.SPECIES_AUTOFILL_TREFLE = '1';
  process.env.TREFLE_TOKEN = 'test-token';
  assert.equal(isTrefleAutofillEnabled(), true);
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      data: [{
        observations: 'Open ground',
        edible_part: ['fruit'],
        duration: ['Perennial'],
        growth: { description: 'Fast grower', ph_minimum: 6, ph_maximum: 7 },
        image_url: 'https://images.trefle.io/example.jpg',
      }],
    }),
  });
  const pack = await fetchTrefleSpeciesTraits('Solanum lycopersicum', { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.source, 'trefle');
  assert.match(pack.fields.habitat, /Open ground/i);
  assert.ok((pack.photos || []).length >= 1);
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

test('OpenAI : mode contexte court — payload indique mode_contexte court_indicatif (fetch mock)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              description: 'Plante potagère annuelle, fruit comestible.',
              habitat: 'Maraîchage, sol fertile et drainé.',
            }),
          },
        }],
      }),
    };
  };
  const shortCtx = '[Texte de recherche pré-saisie]\naubergine';
  const pack = await fetchOpenAiSpeciesTraits({
    query: 'aubergine',
    partialContext: shortCtx,
    hintName: 'Aubergine',
  }, { fetchImpl });
  assert.ok(pack);
  assert.ok((pack.warnings || []).some((w) => String(w).includes('Contexte externe limité')));
  assert.ok(capturedBody?.messages?.[1]?.content);
  const user = JSON.parse(capturedBody.messages[1].content);
  assert.strictEqual(user.mode_contexte, 'court_indicatif');
  assert.equal(pack.fields.description.length > 10, true);
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : second_name autorisé et tronqué si trop long (fetch mock)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const longVern = `Tomate ${'x'.repeat(200)}`;
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            fields: { second_name: longVern, habitat: 'Plein soleil.' },
          }),
        },
      }],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits({ query: 'x', partialContext: 'Libellé: Tomate' }, { fetchImpl });
  assert.ok(pack);
  assert.ok(pack.fields.second_name.length <= 118);
  assert.equal(pack.fields.habitat, 'Plein soleil.');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});
