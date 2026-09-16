import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fou de style : le sélecteur de carte doit porter la typographie de la barre d'outils.
 *
 * `.map-switch-select` est un `<select>` posé au milieu de pilules et boutons réglés sur
 * `--map-toolbar-font-size` (--text-xs). Sans déclaration explicite il retombe sur la règle
 * globale `input, select, textarea` — `--text-base`, et même `16px !important` sous 1024px ou
 * sur pointeur grossier : ~40 % de plus que ses voisins, ce qui se lit comme une fonte
 * différente. Le cliquet interdit de retirer l'alignement.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Corps de la première règle `<selector> { … }` trouvée, sans la règle englobante. */
function ruleBody(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `règle ${selector} absente de index.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('index.css — typographie du sélecteur de carte', () => {
  test('`.map-switch-select` reprend la fonte et la taille de la barre', () => {
    const body = ruleBody('.map-switch-select');
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(body).toMatch(/font-size:\s*var\(--map-toolbar-font-size\)/);
  });

  test('la taille bat la règle anti-zoom `input, select, textarea` (16px !important)', () => {
    const body = ruleBody('.map-switch-select');
    expect(body).toMatch(/font-size:\s*var\(--map-toolbar-font-size\)\s*!important/);
  });

  test('la barre compacte compacte aussi le sélecteur, pas seulement les boutons', () => {
    expect(css).toMatch(
      /\.map-view-root--solo \.map-view-toolbar \.map-switch-select\s*\{[^}]*min-height:30px/,
    );
  });
});
