// Tests SANS BDD du helper serveur `lib/zoneEmoji.js` (colonne zones.emoji, audit C4).
const test = require('node:test');
const assert = require('node:assert');
const { splitLeadingZoneEmoji, resolveZoneEmojiForWrite } = require('../lib/zoneEmoji');

test('splitLeadingZoneEmoji : préfixe simple, séquence ZWJ, absence, artefact U+1FE0F', () => {
  assert.deepStrictEqual(splitLeadingZoneEmoji('🌳 Verger'), { emoji: '🌳', name: 'Verger' });
  assert.deepStrictEqual(splitLeadingZoneEmoji('👩‍🏫 Salle'), { emoji: '👩‍🏫', name: 'Salle' });
  assert.deepStrictEqual(splitLeadingZoneEmoji('Verger'), { emoji: '', name: 'Verger' });
  // Artefact U+1FE0F (réparation erronée de U+FE0F) : réparé avant détection.
  const corrupted = `🕷${String.fromCodePoint(0x1fe0f)} Terrarium`;
  assert.deepStrictEqual(splitLeadingZoneEmoji(corrupted), { emoji: '🕷️', name: 'Terrarium' });
});

test('resolveZoneEmojiForWrite : explicite > dérivé > existant, vide = effacement', () => {
  assert.strictEqual(resolveZoneEmojiForWrite('💧', '🌳 Verger', '🌿'), '💧');
  assert.strictEqual(resolveZoneEmojiForWrite(undefined, '🌳 Verger', '🌿'), '🌳');
  assert.strictEqual(resolveZoneEmojiForWrite(undefined, 'Verger', '🌿'), '🌿');
  assert.strictEqual(resolveZoneEmojiForWrite('', '🌳 Verger', '🌿'), '');
});
