import { describe, test, expect } from 'vitest';
import {
  clampEmojiInput,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../../src/constants/emojis.js';

describe('clampEmojiInput — coupe en points de code, jamais au milieu d’une séquence', () => {
  test('tronque en points de code (pas en unités UTF-16)', () => {
    // 🌳 = 1 point de code mais 2 unités UTF-16 : 3 emojis = 3 points de code.
    expect(clampEmojiInput('🌳🌳🌳', 2)).toBe('🌳🌳');
  });

  test('ne laisse jamais un liant ZWJ orphelin en fin de coupe', () => {
    // 👩‍🏫 = 👩 + ZWJ + 🏫 (3 points de code). Coupe à 2 → le ZWJ final est retiré.
    expect(clampEmojiInput('👩‍🏫', 2)).toBe('👩');
  });

  test('laisse intacte une valeur sous la limite', () => {
    expect(clampEmojiInput('👩‍🏫', 16)).toBe('👩‍🏫');
    expect(clampEmojiInput('', 16)).toBe('');
    expect(clampEmojiInput(null, 16)).toBe('');
  });
});

describe('détection d’emoji de zone — répare le mojibake avant analyse', () => {
  test('détecte un préfixe corrompu U+1FE0F (réparation erronée de U+FE0F)', () => {
    // '🕷' + U+1FE0F : l'artefact est réparé en U+FE0F avant détection.
    const corrupted = `🕷${String.fromCodePoint(0x1fe0f)} Terrarium`;
    expect(detectLeadingMarkerEmoji(corrupted, [])).toBe('🕷️');
    expect(stripLeadingMarkerEmoji(corrupted, [])).toBe('Terrarium');
  });

  test('détecte un emoji tronqué hors BMP (16 bits bas seulement)', () => {
    // 🌫 (U+1F32B) stocké corrompu en U+F32B : réparé puis détecté.
    const corrupted = `${String.fromCharCode(0xf32b)} Brumisation`;
    expect(detectLeadingMarkerEmoji(corrupted, [])).toBe('🌫');
    expect(stripLeadingMarkerEmoji(corrupted, [])).toBe('Brumisation');
  });

  test('comportement inchangé sur un nom sain', () => {
    expect(detectLeadingMarkerEmoji('🌳 Verger', ['🌳'])).toBe('🌳');
    expect(stripLeadingMarkerEmoji('🌳 Verger', ['🌳'])).toBe('Verger');
    expect(detectLeadingMarkerEmoji('Verger', ['🌳'])).toBe(null);
  });
});
