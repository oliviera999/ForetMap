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

test('PlantNet : second_name depuis bestMatch legacy (fetch mock)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  const prevNoImg = process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES = '1';
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ bestMatch: { commonName: 'Églantier', acceptedName: 'Rosa canina L.', family: 'Rosaceae', genus: 'Rosa' } }),
    };
  };
  const pack = await fetchPlantnetSpeciesTraits('Rosa canina', { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.second_name, 'Églantier');
  assert.equal(pack.fields.group_3, 'Rosaceae');
  assert.equal(pack.fields.group_4, 'Rosa');
  assert.equal(calls, 1);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
  if (prevNoImg === undefined) delete process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES;
  else process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES = prevNoImg;
});

test('PlantNet : align officiel + liste espèces (vernaculaire, UICN, photos)', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes('/species/align')) {
      return {
        ok: true,
        json: async () => ({
          searchedName: 'Acer campestre',
          matchingName: 'Acer campestre L.',
          acceptedName: 'Acer campestre L.',
          isSynonym: false,
          project: 'k-southwestern-europe',
          family: 'Sapindaceae',
          genus: 'Acer',
          gbif: { id: '3189863' },
        }),
      };
    }
    return {
      ok: true,
      json: async () => [
        {
          id: '1356455',
          scientificNameWithoutAuthor: 'Acer campestre',
          commonNames: ['Field Maple', 'Érable champêtre'],
          iucnCategory: 'LC',
          images: [
            {
              organ: 'leaf',
              author: 'Test',
              license: 'cc-by-sa',
              url: { m: 'https://bs.plantnet.org/image/m/abc123' },
              citation: 'Test / Pl@ntNet, cc-by-sa',
            },
            {
              organ: 'flower',
              url: { o: 'https://bs.plantnet.org/image/o/def456' },
              citation: 'Fl / Pl@ntNet',
            },
          ],
        },
      ],
    };
  };
  const pack = await fetchPlantnetSpeciesTraits('Acer campestre', { fetchImpl, timeoutMs: 8000 });
  assert.ok(pack);
  assert.equal(pack.fields.second_name, 'Érable champêtre');
  assert.equal(pack.fields.group_3, 'Sapindaceae');
  assert.equal(pack.fields.group_4, 'Acer');
  assert.ok(pack.fields.ecosystem_role.includes('LC'));
  assert.equal(pack.photos.length, 2);
  const leaf = pack.photos.find((p) => p.field === 'photo_leaf');
  assert.ok(leaf);
  assert.equal(leaf.url, 'https://bs.plantnet.org/image/m/abc123');
  assert.equal(calls, 2);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});

test('PlantNet : sans appel species si SPECIES_AUTOFILL_PLANTNET_NO_IMAGES=1', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES = '1';
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.ok(String(url).includes('/species/align'));
    return {
      ok: true,
      json: async () => ({
        acceptedName: 'Foo bar L.',
        family: 'Fabaceae',
        genus: 'Foo',
      }),
    };
  };
  const pack = await fetchPlantnetSpeciesTraits('Foo bar', { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.photos.length, 0);
  assert.equal(calls, 1);
  delete process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES;
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});

test('PlantNet : plusieurs lignes espèce — pas de correspondance exacte → pas de vernaculaire ni photos', async () => {
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes('/species/align')) {
      return {
        ok: true,
        json: async () => ({ acceptedName: 'Acer platanoides L.', family: 'Sapindaceae', genus: 'Acer' }),
      };
    }
    return {
      ok: true,
      json: async () => [
        { scientificNameWithoutAuthor: 'Acer pseudoplatanus', commonNames: ['Erable'], images: [] },
        { scientificNameWithoutAuthor: 'Acer saccharum', commonNames: ['Erable'], images: [] },
      ],
    };
  };
  const pack = await fetchPlantnetSpeciesTraits('Acer platanoides', { fetchImpl });
  assert.ok(pack);
  assert.equal(pack.fields.group_3, 'Sapindaceae');
  assert.equal(pack.fields.second_name, undefined);
  assert.equal(pack.photos.length, 0);
  assert.equal(calls, 2);
  process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
  process.env.PLANTNET_API_KEY = prevK;
});
