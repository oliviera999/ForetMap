/**
 * Batterie pré-saisie : espèces courantes (vernaculaire FR) avec fetch mocké.
 * Ne dépend pas des clés Pl@ntNet / OpenAI / Trefle du .env local.
 */
require('./helpers/setup');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildSpeciesAutofill, pickScientificSeed } = require('../lib/speciesAutofill');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

/** Entité Wikidata taxon minimale (P31 taxon, P105 espèce, P225). */
function taxonEntityJson(id, labelFr, descFr, scientific) {
  return {
    entities: {
      [id]: {
        labels: { fr: { value: labelFr } },
        descriptions: { fr: { value: descFr } },
        sitelinks: { frwiki: { title: labelFr } },
        claims: {
          P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }],
          P105: [{ mainsnak: { datavalue: { value: { id: 'Q7432' } } } }],
          P225: [{ mainsnak: { datavalue: { value: scientific } } }],
        },
      },
    },
  };
}

/**
 * @param {object} f
 * @param {string} f.query — requête vernaculaire (ex. aubergine)
 * @param {string} f.scientific — binôme attendu
 * @param {number} f.usageKey — clé GBIF fictive stable par espèce
 * @param {string} f.wikidataId — Q-id fictif
 * @param {string} f.family
 * @param {string} f.order
 * @param {string} f.kingdom
 * @param {string} f.wikipediaExtract — ≥ 48 car. pour éviter Wikipedia EN si non mockée
 * @param {string} [f.wdLabel]
 * @param {string} [f.iNatCommon]
 */
function createAutofillFetchMock(f) {
  const q = f.query;
  const sci = f.scientific;
  return async (url) => {
    const raw = String(url);

    if (raw.includes('fr.wikipedia.org/api/rest_v1/page/summary')) {
      if (raw.includes(encodeURIComponent(q))) {
        return jsonResponse({
          title: f.wdLabel || q.charAt(0).toUpperCase() + q.slice(1),
          extract: f.wikipediaExtract,
          thumbnail: { source: `https://upload.wikimedia.org/wikipedia/commons/thumb/mock/${f.usageKey}.jpg/320px-mock.jpg` },
          content_urls: { desktop: { page: `https://fr.wikipedia.org/wiki/${encodeURIComponent(q)}` } },
        });
      }
    }

    if (raw.includes('wbsearchentities') && raw.includes(`search=${encodeURIComponent(q)}`)) {
      return jsonResponse({ search: [{ id: f.wikidataId }] });
    }

    if (raw.includes(`Special:EntityData/${f.wikidataId}.json`)) {
      return jsonResponse(
        taxonEntityJson(
          f.wikidataId,
          f.wdLabel || q.charAt(0).toUpperCase() + q.slice(1),
          'espèce de plantes à fleurs',
          sci,
        ),
      );
    }

    if (raw.includes('action=wbgetentities')) {
      return jsonResponse({
        entities: {
          Q16521: { labels: { fr: { value: 'taxon' } } },
          Q7432: { labels: { fr: { value: 'espèce' } } },
        },
      });
    }

    if (raw.includes('api.gbif.org/v1/species/match') && raw.includes(`name=${encodeURIComponent(q)}`)) {
      return jsonResponse({
        confidence: 96,
        canonicalName: f.wdLabel || q,
        scientificName: sci,
        family: f.family,
        order: f.order,
        kingdom: f.kingdom,
        usageKey: f.usageKey,
      });
    }

    if (raw.includes(`/species/${f.usageKey}/descriptions`)) {
      return jsonResponse({
        results: [
          { type: 'habit', language: 'fra', description: f.gbifHabit || 'plante herbacée bisannuelle ou vivace' },
          { type: 'native range', language: 'fra', description: f.gbifRange || 'zones tempérées et subtropicales' },
        ],
      });
    }

    if (
      raw.includes(`api.gbif.org/v1/species/${f.usageKey}`)
      && !raw.includes('vernacularNames')
      && !raw.includes('/descriptions')
    ) {
      return jsonResponse({ taxonomicStatus: 'ACCEPTED', remarks: '' });
    }

    if (raw.includes(`/species/${f.usageKey}/vernacularNames`)) {
      return jsonResponse({
        results: [
          { vernacularName: f.wdLabel || q.charAt(0).toUpperCase() + q.slice(1), language: 'fre' },
          { vernacularName: f.extraVernacular || 'Appellation régionale (test)', language: 'fra' },
        ],
      });
    }

    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search') && raw.includes(`q=${encodeURIComponent(sci)}`)) {
      return jsonResponse({
        result: [{
          id: `COL-FM-${f.usageKey}`,
          name: sci,
          classification: [
            { rank: 'kingdom', name: f.kingdom },
            { rank: 'order', name: f.order },
            { rank: 'family', name: f.family },
          ],
        }],
      });
    }

    if (raw.includes('api.inaturalist.org/v1/taxa')) {
      if (raw.includes(`q=${encodeURIComponent(q)}`) || raw.includes(`q=${encodeURIComponent(sci)}`)) {
        return jsonResponse({
          results: [{
            id: Math.floor(50000 + (f.usageKey % 9000)),
            rank: 'species',
            name: sci,
            preferred_common_name: f.iNatCommon || q.charAt(0).toUpperCase() + q.slice(1),
            observations_count: 18000,
            matched_term: q,
            default_photo: {
              url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${f.usageKey}/medium.jpg`,
              license_code: 'cc-by',
              attribution: '(c) Test communautaire, CC BY',
            },
            wikipedia_summary: `Taxon ${sci} fréquent en milieu cultivé et naturel (données de test).`,
          }],
        });
      }
    }

    if (raw.includes('en.wikipedia.org/api/rest_v1/page/summary')) {
      return jsonResponse({
        title: sci,
        extract:
          `${sci} is a widespread species used in agriculture and gardens; long extract for tests.`,
        content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${encodeURIComponent(sci.replace(/ /g, '_'))}` } },
      });
    }

    throw new Error(`URL non mockée pour « ${q} » : ${raw}`);
  };
}

const LONG_WIKI = (name) =>
  `${name} : espèce ou culture très répandue en Europe et ailleurs ; description volontairement longue pour les tests (> 48 caractères).`;

const FIXTURES = [
  {
    query: 'aubergine',
    scientific: 'Solanum melongena',
    usageKey: 3084924,
    wikidataId: 'Q7540',
    family: 'Solanaceae',
    order: 'Solanales',
    kingdom: 'Plantae',
    wikipediaExtract: LONG_WIKI("L'aubergine"),
    extraVernacular: 'Melongène',
  },
  {
    query: 'carotte',
    scientific: 'Daucus carota',
    usageKey: 3034820,
    wikidataId: 'Q81',
    family: 'Apiaceae',
    order: 'Apiales',
    kingdom: 'Plantae',
    wikipediaExtract: LONG_WIKI('La carotte sauvage et cultivée'),
    iNatCommon: 'Carotte cultivée',
  },
  {
    query: 'laitue',
    scientific: 'Lactuca sativa',
    usageKey: 3080344,
    wikidataId: 'Q83193',
    family: 'Asteraceae',
    order: 'Asterales',
    kingdom: 'Plantae',
    wikipediaExtract: LONG_WIKI('La laitue potagère'),
  },
  {
    query: 'blé',
    scientific: 'Triticum aestivum',
    usageKey: 2705059,
    wikidataId: 'Q11577',
    family: 'Poaceae',
    order: 'Poales',
    kingdom: 'Plantae',
    wikipediaExtract: LONG_WIKI('Le blé tendre'),
    wdLabel: 'Blé tendre',
  },
  {
    query: 'poireau',
    scientific: 'Allium porrum',
    usageKey: 2855758,
    wikidataId: 'Q177746',
    family: 'Amaryllidaceae',
    order: 'Asparagales',
    kingdom: 'Plantae',
    wikipediaExtract: LONG_WIKI('Le poireau'),
  },
];

describe('Pré-saisie — espèces communes (mocks HTTP)', () => {
  const savedEnv = {};

  before(() => {
    const keys = [
      'SPECIES_AUTOFILL_PLANTNET',
      'PLANTNET_API_KEY',
      'SPECIES_AUTOFILL_OPENAI',
      'OPENAI_API_KEY',
      'SPECIES_AUTOFILL_TREFLE',
      'TREFLE_TOKEN',
    ];
    for (const k of keys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  after(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  for (const spec of FIXTURES) {
    test(`vernaculaire « ${spec.query} » → nom scientifique GBIF/Wikidata cohérent`, async () => {
      const fetchImpl = createAutofillFetchMock(spec);
      const result = await buildSpeciesAutofill(spec.query, { fetchImpl, timeoutMs: 2500 });
      assert.equal(result.query, spec.query);
      assert.equal(result.fields.scientific_name, spec.scientific, `scientific_name pour ${spec.query}`);
      assert.ok(result.confidence > 0.2, `confiance > 0 pour ${spec.query}`);
      assert.ok((result.sources || []).some((s) => s.source === 'gbif'), `source gbif pour ${spec.query}`);
      assert.ok((result.sources || []).some((s) => s.source === 'wikidata'), `source wikidata pour ${spec.query}`);
      assert.ok((result.sources || []).some((s) => s.source === 'wikipedia'), `source wikipedia pour ${spec.query}`);
      assert.ok((result.photos || []).length >= 1, `au moins une photo pour ${spec.query}`);
    });
  }

  test('indices formulaire : hint scientifique binomial prioritaire pour pickScientificSeed', () => {
    assert.equal(
      pickScientificSeed('pomme de terre', [], { scientific_name: 'Solanum tuberosum', name: 'pomme de terre' }),
      'Solanum tuberosum',
    );
  });

  test('filtrage sources : wikipedia + gbif seuls pour « tomate » (mock)', async () => {
    const tomate = {
      query: 'tomate',
      scientific: 'Solanum lycopersicum',
      usageKey: 2930132,
      wikidataId: 'Q23501',
      family: 'Solanaceae',
      order: 'Solanales',
      kingdom: 'Plantae',
      wikipediaExtract: LONG_WIKI('La tomate potagère'),
    };
    const urls = [];
    const inner = createAutofillFetchMock(tomate);
    const fetchImpl = async (u) => {
      urls.push(String(u));
      return inner(u);
    };
    const result = await buildSpeciesAutofill('tomate', {
      fetchImpl,
      timeoutMs: 2500,
      sourcesAllowed: ['wikipedia', 'gbif'],
    });
    assert.ok(!urls.some((u) => u.includes('wikidata.org')), 'Wikidata ne doit pas être appelé');
    assert.ok(!urls.some((u) => u.includes('inaturalist.org')), 'iNaturalist ne doit pas être appelé');
    assert.ok(urls.some((u) => u.includes('wikipedia.org')), 'Wikipedia doit être appelé');
    assert.ok(urls.some((u) => u.includes('api.gbif.org/v1/species/match')), 'GBIF match doit être appelé');
    assert.equal(result.fields.scientific_name, 'Solanum lycopersicum');
  });
});
