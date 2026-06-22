const test = require('node:test');
const assert = require('node:assert');

test('repairSupplementaryPlaneEmojiMojibake — ne corrompt pas U+FE0F ni les emojis déjà corrects', async () => {
  const { repairSupplementaryPlaneEmojiMojibake, GL_SOUFFLE_EMOJI } =
    await import('../src/shared/emojiMojibakeCore.js');

  const alreadyFixed = String.fromCodePoint(0x1f32b) + '\uFE0F';
  assert.strictEqual(repairSupplementaryPlaneEmojiMojibake(alreadyFixed), GL_SOUFFLE_EMOJI);
  assert.strictEqual(repairSupplementaryPlaneEmojiMojibake('➡️'), '➡️');

  const misrepaired = String.fromCodePoint(0x1f32b) + String.fromCodePoint(0x1fe0f);
  assert.strictEqual(repairSupplementaryPlaneEmojiMojibake(misrepaired), GL_SOUFFLE_EMOJI);
});

test('repairSupplementaryPlaneEmojiMojibake — Souffle et Trame GL', async () => {
  const { repairSupplementaryPlaneEmojiMojibake, GL_SOUFFLE_EMOJI, GL_TRAME_EMOJI } =
    await import('../src/shared/emojiMojibakeCore.js');

  const corruptedSouffle = String.fromCodePoint(0xf32b) + '\uFE0F';
  const corruptedTrame = String.fromCodePoint(0xf9f5);

  assert.strictEqual(repairSupplementaryPlaneEmojiMojibake(corruptedSouffle), GL_SOUFFLE_EMOJI);
  assert.strictEqual(repairSupplementaryPlaneEmojiMojibake(corruptedTrame), GL_TRAME_EMOJI);

  const grimoire =
    'Aux cases Souffle (' +
    corruptedSouffle +
    '), il éprouve les deux peuples différemment ; aux cases Trame (' +
    corruptedTrame +
    '),';
  const repaired = repairSupplementaryPlaneEmojiMojibake(grimoire);
  assert.ok(repaired.includes(GL_SOUFFLE_EMOJI));
  assert.ok(repaired.includes(GL_TRAME_EMOJI));
  assert.ok(!repaired.includes(corruptedSouffle));
  assert.ok(!repaired.includes(corruptedTrame));
});

test('normalizeMarkerEmoji répare le mojibake plateau', async () => {
  const { normalizeMarkerEmoji } = await import('../src/shared/glMarkerAppearanceCore.js');
  const corrupted = String.fromCodePoint(0xf32b) + '\uFE0F';
  assert.strictEqual(normalizeMarkerEmoji(corrupted), '🌫️');
});

test('renderMarkdownToSafeHtml répare le mojibake dans le grimoire', async () => {
  const { renderMarkdownToSafeHtml } = await import('../src/utils/markdown.js');
  const corrupted = String.fromCodePoint(0xf9f5);
  const html = renderMarkdownToSafeHtml(`Trame (${corrupted})`);
  assert.ok(html.includes('🧵'));
  assert.ok(!html.includes(corrupted));
});
