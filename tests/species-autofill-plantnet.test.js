require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlantnetAutofillEnabled,
  normalizePlantnetIdentifyResponse,
  decodeImageDataToBuffer,
  plantnetIdentifyFromImages,
  buildPlantnetQuotaTestUrl,
} = require('../lib/speciesAutofillPlantnet');

test('Pl@ntNet : désactivé sans flag + clé', () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  delete process.env.SPECIES_AUTOFILL_PLANTNET;
  delete process.env.PLANTNET_API_KEY;
  assert.equal(isPlantnetAutofillEnabled(), false);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});

test('buildPlantnetQuotaTestUrl est null sans PLANTNET_API_KEY', () => {
  const prev = process.env.PLANTNET_API_KEY;
  delete process.env.PLANTNET_API_KEY;
  try {
    assert.equal(buildPlantnetQuotaTestUrl(), null);
  } finally {
    if (prev !== undefined) process.env.PLANTNET_API_KEY = prev;
    else delete process.env.PLANTNET_API_KEY;
  }
});

test('buildPlantnetQuotaTestUrl contient /v2/quota', () => {
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.PLANTNET_API_KEY = 'pk-unit';
  try {
    const u = buildPlantnetQuotaTestUrl();
    assert.ok(u);
    assert.match(u, /my-api\.plantnet\.org\/v2\/quota/);
    assert.match(u, /api-key=/);
  } finally {
    if (prevK !== undefined) process.env.PLANTNET_API_KEY = prevK;
    else delete process.env.PLANTNET_API_KEY;
  }
});

test('decodeImageDataToBuffer accepte une data URL base64', () => {
  const raw = Buffer.from([10, 20, 30]).toString('base64');
  const r = decodeImageDataToBuffer(`data:image/png;base64,${raw}`);
  assert.ok(r);
  assert.equal(r.buffer.length, 3);
  assert.match(r.contentType, /png/i);
});

test('normalizePlantnetIdentifyResponse extrait prédictions', () => {
  const data = normalizePlantnetIdentifyResponse({
    results: [
      {
        score: 0.42,
        species: {
          scientificNameWithoutAuthor: 'Acer campestre',
          scientificNameAuthorship: 'L.',
          scientificName: 'Acer campestre L.',
          commonNames: ['Érable champêtre', 'Field Maple'],
          genus: { scientificNameWithoutAuthor: 'Acer' },
          family: { scientificNameWithoutAuthor: 'Sapindaceae' },
        },
      },
    ],
    version: '2.2',
    bestMatch: 'Acer campestre L.',
  });
  assert.equal(data.predictions.length, 1);
  const p = data.predictions[0];
  assert.equal(p.scientificNameWithoutAuthor, 'Acer campestre');
  assert.equal(p.genus, 'Acer');
  assert.equal(p.family, 'Sapindaceae');
  assert.equal(p.score, 0.42);
  assert.ok(String(p.scientificName || '').includes('Acer campestre'));
});

test('plantnetIdentifyFromImages : mock HTTP OK', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imageData = `data:image/png;base64,${png}`;
  const fetchImpl = async (url, opts) => {
    assert.match(String(url), /\/v2\/identify\//);
    assert.ok(opts && opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{
          score: 0.91,
          species: {
            scientificNameWithoutAuthor: 'Rosa canina',
            commonNames: ['Églantier'],
          },
        }],
      }),
    };
  };
  const out = await plantnetIdentifyFromImages({
    images: [{ organ: 'leaf', imageData }],
    fetchImpl,
    timeoutMs: 8000,
  });
  assert.equal(out.ok, true);
  assert.equal(out.data.predictions.length, 1);
  assert.equal(out.data.predictions[0].scientificNameWithoutAuthor, 'Rosa canina');
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});

test('plantnetIdentifyFromImages : organe invalide', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const out = await plantnetIdentifyFromImages({
    images: [{ organ: 'invalid_organ', imageData: `data:image/png;base64,${png}` }],
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.equal(out.ok, false);
  assert.match(String(out.error || ''), /Organe invalide/i);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});
