// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  autolinkLoreHtmlTextNodes,
  autolinkLorePlainText,
  buildLoreGlossaryLinkEntries,
  mergeLoreGlossaryLinkItems,
  renderGlMarkdownWithLoreGlossaryLinks,
  renderGlPlainTextWithLoreGlossaryLinks,
} from '../../src/utils/glLoreGlossaryAutolink.js';

/**
 * Le module lore balaie des chaînes (`termAutolink`) : ce fichier tourne en
 * environnement **node**, sans `document`, pour garantir qu'aucune dépendance
 * au DOM ne revient (l'ancienne version passait par `document.createElement`).
 */
const LORE_ITEMS = [
  { lore_code: 'LO0001', terme: 'Sylphe', variantes: 'sylphes' },
  { lore_code: 'LO0002', terme: 'Royaume', variantes: '' },
];

describe('glLoreGlossaryAutolink (sans DOM)', () => {
  test('le test s’exécute réellement sans document global', () => {
    expect(typeof document).toBe('undefined');
  });

  test('buildLoreGlossaryLinkEntries ignore les items sans lore_code', () => {
    const entries = buildLoreGlossaryLinkEntries([...LORE_ITEMS, { terme: 'Orphelin' }]);
    // Ordre défini par la longueur du libellé le plus long (tronc commun) : on compare sans ordre.
    expect(entries.map((entry) => entry.code).sort()).toEqual(['LO0001', 'LO0002']);
  });

  test('autolinkLorePlainText produit l’ancre lore attendue', () => {
    const entries = buildLoreGlossaryLinkEntries(LORE_ITEMS);
    expect(autolinkLorePlainText('Deux sylphes.', entries)).toBe(
      'Deux <a href="#" class="gl-lore-glossary-link" data-gl-lore-code="LO0001">sylphes</a>.',
    );
  });

  test('autolinkLoreHtmlTextNodes ne touche ni aux balises ni au contenu des ancres', () => {
    const entries = buildLoreGlossaryLinkEntries(LORE_ITEMS);
    const html = '<p title="royaume"><a href="https://x.test">Royaume</a> du royaume</p>';
    const linked = autolinkLoreHtmlTextNodes(html, entries);
    expect((linked.match(/data-gl-lore-code="LO0002"/g) || []).length).toBe(1);
    expect(linked).toContain('<p title="royaume">');
    expect(linked).toContain('<a href="https://x.test">Royaume</a>');
  });

  test('renderGlMarkdownWithLoreGlossaryLinks rend le markdown puis lie (balayage de chaîne)', () => {
    const rendered = renderGlMarkdownWithLoreGlossaryLinks(
      'Le **royaume** des sylphes.',
      LORE_ITEMS,
    );
    expect(rendered).toContain('<strong>');
    expect(rendered).toContain('data-gl-lore-code="LO0002"');
    expect(rendered).toContain('data-gl-lore-code="LO0001"');
    expect(rendered).toContain('class="gl-lore-glossary-link"');
  });

  test('renderGlMarkdownWithLoreGlossaryLinks sans terme renvoie le HTML tel quel', () => {
    expect(renderGlMarkdownWithLoreGlossaryLinks('Bonjour', [])).toBe('<p>Bonjour</p>\n');
    expect(renderGlMarkdownWithLoreGlossaryLinks('', LORE_ITEMS)).toBe('');
  });

  test('renderGlPlainTextWithLoreGlossaryLinks échappe le HTML avant de lier puis assainit', () => {
    const rendered = renderGlPlainTextWithLoreGlossaryLinks(
      'Un sylphe <img src=x onerror=alert(1)> & <script>alert(2)</script>',
      LORE_ITEMS,
    );
    expect(rendered).not.toMatch(/<img/i);
    expect(rendered).not.toMatch(/<script/i);
    expect(rendered).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(rendered).toContain('&amp;');
    expect(rendered).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(rendered).toContain(
      '<a href="#" class="gl-lore-glossary-link" data-gl-lore-code="LO0001">sylphe</a>',
    );
  });

  test('mergeLoreGlossaryLinkItems fusionne sur lore_code sans doublon', () => {
    const merged = mergeLoreGlossaryLinkItems(LORE_ITEMS, [
      { lore_code: 'LO0001', terme: 'Sylphe (doublon)' },
      { lore_code: 'LO0009', terme: 'Grimoire' },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.find((item) => item.lore_code === 'LO0001').terme).toBe('Sylphe');
  });
});
