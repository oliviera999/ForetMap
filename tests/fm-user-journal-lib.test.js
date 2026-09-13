'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeArticleTitle,
  countJournalChars,
  extractJournalEmbeds,
  isImportableResourceType,
  EMBED_TYPES,
} = require('../lib/fmUserJournal');

test('normalizeArticleTitle — tronque et vide → null', () => {
  assert.strictEqual(normalizeArticleTitle('  Bonjour  '), 'Bonjour');
  assert.strictEqual(normalizeArticleTitle(''), null);
  assert.strictEqual(normalizeArticleTitle('x'.repeat(300)).length, 255);
});

test('countJournalChars — compte les points de code', () => {
  assert.strictEqual(countJournalChars('abc'), 3);
  assert.strictEqual(countJournalChars('🙂'), 1);
});

test('extractJournalEmbeds — format neutre FM', () => {
  const md =
    'Hello\n\n<aside class="journal-embed" data-embed-type="plant" data-ref="12"></aside>\n';
  const embeds = extractJournalEmbeds(md);
  assert.strictEqual(embeds.length, 1);
  assert.strictEqual(embeds[0].type, 'plant');
  assert.strictEqual(embeds[0].ref, '12');
});

test('extractJournalEmbeds — compat gl-journal-embed', () => {
  const md =
    '<aside class="gl-journal-embed" data-gl-embed-type="glossary" data-gl-ref="COMPOST"></aside>';
  const embeds = extractJournalEmbeds(md);
  assert.strictEqual(embeds[0].type, 'glossary');
  assert.strictEqual(embeds[0].ref, 'COMPOST');
});

test('isImportableResourceType — types FM', () => {
  assert.strictEqual(isImportableResourceType('plant'), true);
  assert.strictEqual(isImportableResourceType('glossary'), true);
  assert.strictEqual(isImportableResourceType('tutorial'), true);
  assert.strictEqual(isImportableResourceType('spell'), false);
  assert.ok(EMBED_TYPES.has('module_stub'));
});
