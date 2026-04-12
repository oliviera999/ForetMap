require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpeciesAutofill, mergeSources } = require('../lib/speciesAutofill');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test('mergeSources priorise la source la plus fiable', () => {
  const merged = mergeSources([
    {
      source: 'source_a',
      confidence: 0.35,
      source_url: 'https://a.example',
      fields: { name: 'Tomate', scientific_name: 'Solanum lycopersicum' },
      photos: [],
      warnings: [],
    },
    {
      source: 'source_b',
      confidence: 0.8,
      source_url: 'https://b.example',
      fields: { name: 'Tomate commune', scientific_name: 'Solanum lycopersicum L.' },
      photos: [],
      warnings: [],
    },
  ]);
  assert.equal(merged.fields.name, 'Tomate commune');
  assert.equal(merged.fields.scientific_name, 'Solanum lycopersicum L.');
  assert.ok(merged.confidence > 0.25);
});

test('buildSpeciesAutofill fusionne les sources et retourne des photos', async () => {
  const fetchImpl = async (url) => {
    const raw = String(url || '');
    if (raw.includes('wikipedia.org/api/rest_v1/page/summary')) {
      return jsonResponse({
        title: 'Tomate',
        extract: 'Plante cultivée pour son fruit.',
        thumbnail: { source: 'https://upload.wikimedia.org/tomate.jpg' },
        content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Tomate' } },
      });
    }
    if (raw.includes('wikidata.org/w/api.php')) {
      return jsonResponse({ search: [{ id: 'Q111' }, { id: 'Q23501' }] });
    }
    if (raw.includes('wikidata.org/wiki/Special:EntityData')) {
      if (raw.includes('Q111')) {
        return jsonResponse({
          entities: {
            Q111: {
              labels: { fr: { value: 'Tomate' } },
              descriptions: { fr: { value: 'chanteur' } },
              claims: {},
            },
          },
        });
      }
      return jsonResponse({
        entities: {
          Q23501: {
            labels: { fr: { value: 'Tomate' } },
            descriptions: { fr: { value: 'Espèce de plantes' } },
            sitelinks: { frwiki: { title: 'Tomate' } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }],
              P105: [{ mainsnak: { datavalue: { value: { id: 'Q7432' } } } }],
              P225: [{ mainsnak: { datavalue: { value: 'Solanum lycopersicum' } } }],
              P18: [{ mainsnak: { datavalue: { value: 'Tomato_je.jpg' } } }],
            },
          },
        },
      });
    }
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) {
      return jsonResponse({
        result: [{
          id: 'COL-123',
          name: 'Solanum lycopersicum',
          classification: [
            { rank: 'kingdom', name: 'Plantae' },
            { rank: 'order', name: 'Solanales' },
            { rank: 'family', name: 'Solanaceae' },
          ],
        }],
      });
    }
    if (raw.includes('api.gbif.org/v1/species/match')) {
      return jsonResponse({
        confidence: 95,
        canonicalName: 'Tomate',
        scientificName: 'Solanum lycopersicum',
        family: 'Solanaceae',
        order: 'Solanales',
        kingdom: 'Plantae',
        usageKey: 2930132,
      });
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  const result = await buildSpeciesAutofill('tomate', { fetchImpl, timeoutMs: 1200 });
  assert.equal(result.query, 'tomate');
  assert.equal(result.fields.scientific_name, 'Solanum lycopersicum');
  assert.ok((result.photos || []).length >= 1);
  assert.ok(result.sources.some((s) => s.source === 'wikipedia'));
  assert.ok(result.sources.some((s) => s.source === 'wikidata'));
  assert.ok(result.sources.some((s) => s.source === 'gbif'));
  assert.ok(result.sources.some((s) => s.source === 'catalogue_of_life'));
});

test('buildSpeciesAutofill ajoute un warning si une source échoue', async () => {
  const fetchImpl = async (url) => {
    const raw = String(url || '');
    if (raw.includes('wikipedia.org')) throw new Error('timeout');
    if (raw.includes('wikidata.org/w/api.php')) return jsonResponse({ search: [] });
    if (raw.includes('api.gbif.org/v1/species/match')) return jsonResponse({ matchType: 'NONE' });
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) return jsonResponse({ result: [] });
    throw new Error(`URL inattendue: ${raw}`);
  };
  const result = await buildSpeciesAutofill('plante inconnue', { fetchImpl, timeoutMs: 1200 });
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.some((w) => String(w).includes('wikipedia')));
});

test('buildSpeciesAutofill évite un homonyme wikidata non taxonomique', async () => {
  const fetchImpl = async (url) => {
    const raw = String(url || '');
    if (raw.includes('wikipedia.org/api/rest_v1/page/summary')) {
      return jsonResponse({
        title: 'Tomate',
        extract: 'Plante potagère.',
        content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Tomate' } },
      });
    }
    if (raw.includes('wikidata.org/w/api.php')) {
      return jsonResponse({ search: [{ id: 'Q-SINGER' }, { id: 'Q-TAXON' }] });
    }
    if (raw.includes('Special:EntityData/Q-SINGER')) {
      return jsonResponse({
        entities: {
          'Q-SINGER': {
            labels: { fr: { value: 'Tomate' } },
            descriptions: { fr: { value: 'chanteur brésilien' } },
            claims: {},
          },
        },
      });
    }
    if (raw.includes('Special:EntityData/Q-TAXON')) {
      return jsonResponse({
        entities: {
          'Q-TAXON': {
            labels: { fr: { value: 'Tomate' } },
            descriptions: { fr: { value: 'espèce de plante' } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }],
              P105: [{ mainsnak: { datavalue: { value: { id: 'Q7432' } } } }],
              P225: [{ mainsnak: { datavalue: { value: 'Solanum lycopersicum' } } }],
            },
          },
        },
      });
    }
    if (raw.includes('api.gbif.org/v1/species/match')) {
      return jsonResponse({ confidence: 90, scientificName: 'Solanum lycopersicum', canonicalName: 'Tomate', usageKey: 2930132 });
    }
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) {
      return jsonResponse({ result: [{ id: 'COL-OK', name: 'Solanum lycopersicum' }] });
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  const result = await buildSpeciesAutofill('tomate', { fetchImpl, timeoutMs: 1200 });
  assert.equal(result.fields.scientific_name, 'Solanum lycopersicum');
  assert.ok(!String(result.fields.description || '').toLowerCase().includes('chanteur'));
});
