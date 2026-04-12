require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { runSpeciesAutofillProviderSelfTest } = require('../lib/speciesAutofillProviderSelfTest');
const { buildPlantnetQuotaTestUrl } = require('../lib/speciesAutofillPlantnet');

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

test('runSpeciesAutofillProviderSelfTest : HTTP 200 simulés', async () => {
  const prevPk = process.env.PLANTNET_API_KEY;
  const prevPf = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevOk = process.env.OPENAI_API_KEY;
  const prevOf = process.env.SPECIES_AUTOFILL_OPENAI;
  process.env.PLANTNET_API_KEY = 'pk-mock';
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.OPENAI_API_KEY = 'sk-mock';
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  const fetchImpl = async (url) => {
    const u = String(url || '');
    if (u.includes('my-api.plantnet.org')) {
      return { ok: true, status: 200, json: async () => ({ identify: 500 }) };
    }
    if (u.includes('api.openai.com/v1/models')) {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-4o-mini' }] }) };
    }
    throw new Error(`URL inattendue: ${u}`);
  };
  try {
    const out = await runSpeciesAutofillProviderSelfTest({ fetchImpl, timeoutMs: 4000 });
    assert.equal(out.ok, true);
    assert.equal(out.plantnet.tested, true);
    assert.equal(out.plantnet.ok, true);
    assert.equal(out.plantnet.httpStatus, 200);
    assert.equal(out.openai.tested, true);
    assert.equal(out.openai.ok, true);
    assert.equal(out.openai.httpStatus, 200);
  } finally {
    if (prevPk !== undefined) process.env.PLANTNET_API_KEY = prevPk;
    else delete process.env.PLANTNET_API_KEY;
    if (prevPf !== undefined) process.env.SPECIES_AUTOFILL_PLANTNET = prevPf;
    else delete process.env.SPECIES_AUTOFILL_PLANTNET;
    if (prevOk !== undefined) process.env.OPENAI_API_KEY = prevOk;
    else delete process.env.OPENAI_API_KEY;
    if (prevOf !== undefined) process.env.SPECIES_AUTOFILL_OPENAI = prevOf;
    else delete process.env.SPECIES_AUTOFILL_OPENAI;
  }
});

test('runSpeciesAutofillProviderSelfTest : 401 OpenAI', async () => {
  const prevPk = process.env.PLANTNET_API_KEY;
  const prevPf = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevOk = process.env.OPENAI_API_KEY;
  const prevOf = process.env.SPECIES_AUTOFILL_OPENAI;
  delete process.env.PLANTNET_API_KEY;
  delete process.env.SPECIES_AUTOFILL_PLANTNET;
  process.env.OPENAI_API_KEY = 'sk-bad';
  process.env.SPECIES_AUTOFILL_OPENAI = '1';
  const fetchImpl = async (url) => {
    const u = String(url || '');
    if (u.includes('api.openai.com/v1/models')) {
      return { ok: false, status: 401, json: async () => ({}) };
    }
    throw new Error(`URL inattendue: ${u}`);
  };
  try {
    const out = await runSpeciesAutofillProviderSelfTest({ fetchImpl, timeoutMs: 4000 });
    assert.equal(out.ok, false);
    assert.equal(out.plantnet.tested, false);
    assert.equal(out.openai.ok, false);
    assert.equal(out.openai.httpStatus, 401);
  } finally {
    if (prevPk !== undefined) process.env.PLANTNET_API_KEY = prevPk;
    else delete process.env.PLANTNET_API_KEY;
    if (prevPf !== undefined) process.env.SPECIES_AUTOFILL_PLANTNET = prevPf;
    else delete process.env.SPECIES_AUTOFILL_PLANTNET;
    if (prevOk !== undefined) process.env.OPENAI_API_KEY = prevOk;
    else delete process.env.OPENAI_API_KEY;
    if (prevOf !== undefined) process.env.SPECIES_AUTOFILL_OPENAI = prevOf;
    else delete process.env.SPECIES_AUTOFILL_OPENAI;
  }
});
