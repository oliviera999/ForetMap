require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchTrefleSpeciesTraits,
  isTrefleAutofillEnabled,
} = require('../lib/speciesAutofillTrefle');
const {
  fetchOpenAiSpeciesTraits,
  fetchOpenAiSpeciesGapFill,
  isOpenAiAutofillEnabled,
} = require('../lib/speciesAutofillOpenAi');

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
      data: [
        {
          observations: 'Open ground',
          edible_part: ['fruit'],
          duration: ['Perennial'],
          growth: { description: 'Fast grower', ph_minimum: 6, ph_maximum: 7 },
          image_url: 'https://images.trefle.io/example.jpg',
        },
      ],
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
      choices: [
        {
          message: {
            content: JSON.stringify({
              habitat: 'Sol drainé, soleil.',
              optimal_ph: '6-7',
            }),
          },
        },
      ],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits(
    { query: 'Tomate', scientificName: 'Solanum' },
    { fetchImpl },
  );
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
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Plante potagère annuelle, fruit comestible.',
                habitat: 'Maraîchage, sol fertile et drainé.',
              }),
            },
          },
        ],
      }),
    };
  };
  const shortCtx = '[Texte de recherche pré-saisie]\naubergine';
  const pack = await fetchOpenAiSpeciesTraits(
    {
      query: 'aubergine',
      partialContext: shortCtx,
      hintName: 'Aubergine',
    },
    { fetchImpl },
  );
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
      choices: [
        {
          message: {
            content: JSON.stringify({
              fields: { second_name: longVern, habitat: 'Plein soleil.' },
            }),
          },
        },
      ],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits(
    { query: 'x', partialContext: 'Libellé: Tomate' },
    { fetchImpl },
  );
  assert.ok(pack);
  assert.ok(pack.fields.second_name.length <= 118);
  assert.equal(pack.fields.habitat, 'Plein soleil.');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : complète aussi les champs taxonomiques quand plausibles', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: 'Cétoine funeste',
              scientific_name: 'Oxythyrea funesta',
              group_1: 'Animalia',
              group_2: 'Coleoptera',
              group_3: 'Scarabaeidae',
              group_4: 'Cetoniinae',
              habitat: 'Milieux ouverts, fleuris et ensoleillés.',
            }),
          },
        },
      ],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits({ query: 'cétoine funeste' }, { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.name, 'Cétoine funeste');
  assert.equal(pack.fields.scientific_name, 'Oxythyrea funesta');
  assert.equal(pack.fields.group_1, 'Animalia');
  assert.equal(pack.fields.group_2, 'Coleoptera');
  assert.equal(pack.fields.group_3, 'Scarabaeidae');
  assert.equal(pack.fields.group_4, 'Cetoniinae');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : rejette les valeurs taxonomiques/numériques non plausibles', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              scientific_name: '12345 ???',
              ideal_temperature_c: 'température tiède',
              optimal_ph: 'acide',
              group_1: 'inconnu',
              habitat: 'Prairie sèche.',
            }),
          },
        },
      ],
    }),
  });
  const pack = await fetchOpenAiSpeciesTraits({ query: 'x' }, { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.scientific_name, undefined);
  assert.equal(pack.fields.ideal_temperature_c, undefined);
  assert.equal(pack.fields.optimal_ph, undefined);
  assert.equal(pack.fields.group_1, undefined);
  assert.equal(pack.fields.habitat, 'Prairie sèche.');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : fallback Responses API si chat/completions indisponible', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const urls = [];
  const fetchImpl = async (url) => {
    const raw = String(url || '');
    urls.push(raw);
    if (raw.includes('/v1/chat/completions')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Unsupported model for this endpoint' } }),
      };
    }
    if (raw.includes('/v1/responses')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            fields: {
              habitat: 'Sol drainé, exposition ensoleillée.',
              harvest_part: 'Fruit.',
            },
          }),
        }),
      };
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  const pack = await fetchOpenAiSpeciesTraits(
    { query: 'Tomate', scientificName: 'Solanum lycopersicum' },
    { fetchImpl },
  );
  assert.ok(pack);
  assert.equal(pack.fields.habitat, 'Sol drainé, exposition ensoleillée.');
  assert.equal(pack.fields.harvest_part, 'Fruit.');
  assert.ok(urls.some((u) => u.includes('/v1/chat/completions')));
  assert.ok(urls.some((u) => u.includes('/v1/responses')));
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI gap-fill : fallback Responses API si chat/completions indisponible', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  const fetchImpl = async (url) => {
    const raw = String(url || '');
    if (raw.includes('/v1/chat/completions')) {
      return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) };
    }
    if (raw.includes('/v1/responses')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ habitat: 'Milieu chaud.', size: '0,6 à 1,2 m.' }),
                },
              ],
            },
          ],
        }),
      };
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  const gap = await fetchOpenAiSpeciesGapFill(
    {
      query: 'aubergine',
      keysToFill: ['habitat', 'size'],
      knownFields: { scientific_name: 'Solanum melongena' },
    },
    { fetchImpl },
  );
  assert.ok(gap);
  assert.equal(gap.fields.habitat, 'Milieu chaud.');
  assert.equal(gap.fields.size, '0,6 à 1,2 m.');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});

test('OpenAI : mode contexte court + allowGeneralKnowledge inclut extension taxons non végétaux', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_OPENAI;
  const prevK = process.env.OPENAI_API_KEY;
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  process.env.OPENAI_API_KEY = 'sk-test';
  let capturedSystem = '';
  let capturedUser = '';
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const sysMsg = Array.isArray(body.messages)
      ? body.messages.find((m) => m.role === 'system')
      : null;
    const userMsg = Array.isArray(body.messages)
      ? body.messages.find((m) => m.role === 'user')
      : null;
    capturedSystem = String(sysMsg?.content || '');
    capturedUser = String(userMsg?.content || '');
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    };
  };
  await fetchOpenAiSpeciesTraits(
    {
      query: 'cétoine funeste',
      partialContext: 'cétoine funeste',
      allowGeneralKnowledge: true,
    },
    { fetchImpl },
  );
  assert.match(capturedSystem, /insecte|non végétal|mammifère/i);
  const parsedUser = JSON.parse(capturedUser);
  assert.equal(parsedUser.mode_contexte, 'court_indicatif');
  process.env.SPECIES_AUTOFILL_OPENAI = prevF;
  process.env.OPENAI_API_KEY = prevK;
});
