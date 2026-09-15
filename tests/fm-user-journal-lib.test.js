'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeArticleTitle,
  countJournalChars,
  extractJournalEmbeds,
  isImportableResourceType,
  isAllowedJournalImageUrl,
  rewriteJournalImageUrls,
  journalAssetFileUrl,
  EMBED_TYPES,
  resolveJournalEmbedCards,
  resolveJournalEmbedTitles,
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

test('isAllowedJournalImageUrl — préfixe disque et route API', () => {
  const userId = 'u-journal-1';
  assert.strictEqual(
    isAllowedJournalImageUrl(`/uploads/user-journal/${userId}/12-0.png`, userId),
    true,
  );
  assert.strictEqual(isAllowedJournalImageUrl('/api/user-journal/assets/9/file', userId), true);
  assert.strictEqual(isAllowedJournalImageUrl('/uploads/other/x.png', userId), false);
});

test('rewriteJournalImageUrls — /uploads → route API', () => {
  const body = '![p](/uploads/user-journal/u1/12-0.png)';
  const out = rewriteJournalImageUrls(body, [{ id: 9, asset_path: 'user-journal/u1/12-0.png' }]);
  assert.strictEqual(out, `![p](${journalAssetFileUrl(9)})`);
});

test('resolveJournalEmbedCards — module_stub sans BDD (titres dérivés)', async () => {
  const { titles, cards } = await resolveJournalEmbedCards([
    { type: 'module_stub', ref: 'plants' },
    { type: 'module_stub', ref: 'quiz' },
  ]);
  assert.strictEqual(titles['module_stub|plants'], 'Biodiversité');
  assert.strictEqual(cards['module_stub|plants'].label, 'Module');
  assert.strictEqual(cards['module_stub|plants'].excerpt, null);
  assert.strictEqual(titles['module_stub|quiz'], 'Quiz');
  const titlesOnly = await resolveJournalEmbedTitles([{ type: 'module_stub', ref: 'visit' }]);
  assert.strictEqual(titlesOnly['module_stub|visit'], 'Visite');
});
