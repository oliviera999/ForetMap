import { describe, test, expect } from 'vitest';
import { createTermAutolink } from '../../src/utils/glTermAutolink.js';
import {
  mergeGlossaryLinkItems,
  buildGlossaryLinkEntries,
  autolinkPlainText,
  autolinkHtmlTextNodes,
} from '../../src/utils/glGlossaryAutolink.js';
import {
  mergeLoreGlossaryLinkItems,
  buildLoreGlossaryLinkEntries,
  autolinkLorePlainText,
  renderGlMarkdownWithLoreGlossaryLinks,
} from '../../src/utils/glLoreGlossaryAutolink.js';

const GLOSSARY_ITEMS = [
  { glossary_code: 'GL0001', terme: 'Biome', variantes: 'biomes' },
  { glossary_code: 'GL0002', terme: 'Écosystème', variantes: 'ecosysteme' },
];

const LORE_ITEMS = [
  { lore_code: 'LO0001', terme: 'Sylphe', variantes: 'sylphes' },
  { lore_code: 'LO0002', terme: 'Royaume', variantes: '' },
];

describe('createTermAutolink : configuration glossaire SVT', () => {
  const glossary = createTermAutolink({
    codeField: 'glossary_code',
    cssClass: 'gl-glossary-inline-link',
    dataAttr: 'data-gl-glossary-code',
  });

  test('buildEntries trie les entrées par longueur de label décroissante', () => {
    const entries = glossary.buildEntries(GLOSSARY_ITEMS);
    expect(entries[0].code).toBe('GL0002');
  });

  test('autolinkPlainText génère une ancre avec classe et attribut data attendus', () => {
    const entries = glossary.buildEntries(GLOSSARY_ITEMS);
    const linked = glossary.autolinkPlainText('Le biome tropical.', entries);
    expect(linked).toBe(
      'Le <a href="#" class="gl-glossary-inline-link" data-gl-glossary-code="GL0001">biome</a> tropical.',
    );
  });

  test('mergeItems ajoute un terme lié absent de la base', () => {
    const merged = glossary.mergeItems(GLOSSARY_ITEMS, [
      { glossary_code: 'GL0099', terme: 'Fennec' },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.some((item) => item.glossary_code === 'GL0099')).toBe(true);
  });
});

describe('createTermAutolink : configuration glossaire lore', () => {
  const lore = createTermAutolink({
    codeField: 'lore_code',
    cssClass: 'gl-lore-glossary-link',
    dataAttr: 'data-gl-lore-code',
  });

  test('autolinkPlainText utilise la classe et l’attribut data du lore', () => {
    const entries = lore.buildEntries(LORE_ITEMS);
    const linked = lore.autolinkPlainText('Un sylphe passe.', entries);
    expect(linked).toBe(
      'Un <a href="#" class="gl-lore-glossary-link" data-gl-lore-code="LO0001">sylphe</a> passe.',
    );
  });

  test('mergeItems s’appuie sur lore_code', () => {
    const merged = lore.mergeItems(LORE_ITEMS, [{ lore_code: 'LO0009', terme: 'Grimoire' }]);
    expect(merged.some((item) => item.lore_code === 'LO0009')).toBe(true);
  });
});

describe('modules publics : surface d’API préservée', () => {
  test('glGlossaryAutolink délègue à la fabrique sans changer le HTML', () => {
    const entries = buildGlossaryLinkEntries(GLOSSARY_ITEMS);
    expect(autolinkPlainText('un biome', entries)).toBe(
      'un <a href="#" class="gl-glossary-inline-link" data-gl-glossary-code="GL0001">biome</a>',
    );
    // Contenu déjà dans une ancre : non re-lié.
    const html = '<a href="https://example.org">Biome</a> et biome';
    const linked = autolinkHtmlTextNodes(html, entries);
    expect((linked.match(/data-gl-glossary-code="GL0001"/g) || []).length).toBe(1);
    expect(mergeGlossaryLinkItems(GLOSSARY_ITEMS, []).length).toBe(2);
  });

  test('glLoreGlossaryAutolink délègue à la fabrique sans changer le HTML', () => {
    const entries = buildLoreGlossaryLinkEntries(LORE_ITEMS);
    expect(autolinkLorePlainText('un sylphe', entries)).toBe(
      'un <a href="#" class="gl-lore-glossary-link" data-gl-lore-code="LO0001">sylphe</a>',
    );
    expect(mergeLoreGlossaryLinkItems(LORE_ITEMS, []).length).toBe(2);
    const rendered = renderGlMarkdownWithLoreGlossaryLinks('Le royaume est vaste.', LORE_ITEMS);
    expect(rendered).toContain('data-gl-lore-code="LO0002"');
    expect(rendered).toContain('class="gl-lore-glossary-link"');
  });
});
