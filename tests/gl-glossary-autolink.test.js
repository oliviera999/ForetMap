'use strict';

const { before, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let buildGlossaryLinkEntries;
let autolinkPlainText;
let autolinkHtmlTextNodes;
let renderGlMarkdownWithGlossaryLinks;

const SAMPLE_ITEMS = [
  {
    glossary_code: 'GL0001',
    terme: 'Biome',
    variantes: 'biomes',
  },
  {
    glossary_code: 'GL0002',
    terme: 'Écosystème',
    variantes: 'ecosysteme',
  },
];

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/glGlossaryAutolink.js')).href);
  buildGlossaryLinkEntries = mod.buildGlossaryLinkEntries;
  autolinkPlainText = mod.autolinkPlainText;
  autolinkHtmlTextNodes = mod.autolinkHtmlTextNodes;
  renderGlMarkdownWithGlossaryLinks = mod.renderGlMarkdownWithGlossaryLinks;
});

describe('glGlossaryAutolink', () => {
  test('buildGlossaryLinkEntries trie par longueur de label', () => {
    const entries = buildGlossaryLinkEntries(SAMPLE_ITEMS);
    assert.ok(entries.length >= 2);
    assert.equal(entries[0].code, 'GL0002');
  });

  test('autolinkPlainText insère un lien data-gl-glossary-code', () => {
    const entries = buildGlossaryLinkEntries(SAMPLE_ITEMS);
    const linked = autolinkPlainText('Le biome tropical abrite un écosystème riche.', entries);
    assert.match(linked, /data-gl-glossary-code="GL0001"/);
    assert.match(linked, /data-gl-glossary-code="GL0002"/);
    assert.match(linked, /class="gl-glossary-inline-link"/);
  });

  test('autolinkHtmlTextNodes ignore le contenu déjà dans un lien', () => {
    const entries = buildGlossaryLinkEntries(SAMPLE_ITEMS);
    const html = '<a href="https://example.org">Biome</a> et biome';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.match(linked, /href="https:\/\/example\.org"/);
    assert.equal((linked.match(/data-gl-glossary-code="GL0001"/g) || []).length, 1);
  });

  test('renderGlMarkdownWithGlossaryLinks fonctionne sur markdown', () => {
    const html = renderGlMarkdownWithGlossaryLinks(
      'Un **biome** est une zone climatique.',
      SAMPLE_ITEMS,
      { allowImages: false }
    );
    assert.match(html, /<strong>/);
    assert.match(html, /data-gl-glossary-code="GL0001"/);
  });
});
