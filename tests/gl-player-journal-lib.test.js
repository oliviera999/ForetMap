'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractJournalEmbeds,
  countJournalChars,
  isAllowedJournalImageUrl,
  stripDisallowedImageUrls,
} = require('../lib/glPlayerJournal');

test('extractJournalEmbeds parse les balises aside', () => {
  const body = '<aside class="gl-journal-embed" data-gl-embed-type="spell" data-gl-ref="SL001"></aside>';
  const embeds = extractJournalEmbeds(body);
  assert.strictEqual(embeds.length, 1);
  assert.deepStrictEqual(embeds[0], { type: 'spell', ref: 'SL001' });
});

test('countJournalChars compte les caractères UTF-8', () => {
  assert.strictEqual(countJournalChars('café'), 4);
});

test('isAllowedJournalImageUrl accepte le préfixe joueur', () => {
  assert.strictEqual(isAllowedJournalImageUrl('/uploads/gl-player-journal/12/x.png', 12), true);
  assert.strictEqual(isAllowedJournalImageUrl('/uploads/other/x.png', 12), false);
});

test('stripDisallowedImageUrls retire les images hors préfixe', () => {
  const out = stripDisallowedImageUrls(
    '![a](/uploads/other/x.png) <img src="/uploads/gl-player-journal/3/a.jpg" alt="ok" />',
    3
  );
  assert.ok(!out.includes('/uploads/other/'));
  assert.ok(out.includes('/uploads/gl-player-journal/3/'));
});
