require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchPlantnetSpeciesTraits, isPlantnetAutofillEnabled } = require('../lib/speciesAutofillPlantnet');

test('PlantNet : désactivé sans flag + clé', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  delete process.env.SPECIES_AUTOFILL_PLANTNET;
  delete process.env.PLANTNET_API_KEY;
  assert.equal(isPlantnetAutofillEnabled(), false);
  assert.equal(await fetchPlantnetSpeciesTraits('Rosa canina'), null);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});

test('PlantNet : second_name depuis align (fetch mock)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ bestMatch: { commonName: 'Églantier' } }),
  });
  const pack = await fetchPlantnetSpeciesTraits('Rosa canina', { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.second_name, 'Églantier');
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});
