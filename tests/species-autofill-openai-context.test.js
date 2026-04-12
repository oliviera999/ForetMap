require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOpenAiPartialContext } = require('../lib/speciesAutofill');

test('buildOpenAiPartialContext agrège Wikipedia, Wikidata et GBIF', () => {
  const text = buildOpenAiPartialContext({
    wikiFrRes: { fields: { description: 'Plante cultivée pour ses fruits.' } },
    primaryResults: [
      { source: 'wikidata', fields: { name: 'Tomate', description: 'Espèce de Solanum.' } },
    ],
    gbifRes: { fields: { scientific_name: 'Solanum lycopersicum', name: 'Solanum lycopersicum', group_3: 'Solanaceae' } },
    gbifTraitsPack: { fields: { habitat: 'Cultures, climat tempéré.' } },
    secondaryResults: [
      { source: 'gbif_vernacular', fields: { second_name: 'Tomate, Tomate-cerise' } },
    ],
  });
  assert.match(text, /\[Wikipedia FR\]/);
  assert.match(text, /\[Wikidata\]/);
  assert.match(text, /Solanum lycopersicum/);
  assert.match(text, /\[GBIF — traits/);
  assert.match(text, /Noms vernaculaires GBIF/);
});

test('buildOpenAiPartialContext borne la longueur totale', () => {
  const long = 'x'.repeat(5000);
  const text = buildOpenAiPartialContext({
    wikiFrRes: { fields: { description: long } },
    primaryResults: [],
    gbifRes: null,
    gbifTraitsPack: null,
    secondaryResults: [],
  });
  assert.ok(text.length <= 3000);
});

test('buildOpenAiPartialContext inclut les indices formulaire', () => {
  const text = buildOpenAiPartialContext({
    wikiFrRes: null,
    primaryResults: [],
    gbifRes: null,
    gbifTraitsPack: null,
    secondaryResults: [],
    hints: { name: 'Tomate cerise', scientific_name: 'Solanum lycopersicum' },
  });
  assert.match(text, /\[Indices utilisateur\]/);
  assert.match(text, /Tomate cerise/);
  assert.match(text, /Solanum lycopersicum/);
});

test('buildOpenAiPartialContext inclut le texte de recherche sans Wikipedia ni GBIF', () => {
  const text = buildOpenAiPartialContext({
    wikiFrRes: null,
    primaryResults: [],
    gbifRes: null,
    gbifTraitsPack: null,
    secondaryResults: [],
    hints: {},
    searchQuery: 'tomate',
  });
  assert.match(text, /\[Texte de recherche pré-saisie\]/);
  assert.match(text, /tomate/i);
});
