import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Cliquet de style : ordre des piles emoji et absence de preload de la police.
 *
 * `docs/AUDIT_EMOJIS_APPLE_2026-09-17.md` (§ 7, option A) fixe deux invariants que rien, côté
 * build ou tests d'écran, ne ferait tomber bruyamment :
 *
 *  1. `'Apple Color Emoji'` passe AVANT `'ForetMapColorEmoji'` dans toute pile qui cite les
 *     deux. WebKit n'implémente ni COLRv1 ni COLRv0 : replacer la police auto-hébergée en tête
 *     renverrait tous les appareils Apple sur sa table OT-SVG, la voie instable. Les machines
 *     non-Apple n'ont pas `'Apple Color Emoji'` : leur rendu ne dépend pas de cet ordre.
 *  2. Aucune entrée HTML ne précharge la police. Un `preload` de police est inconditionnel et
 *     part avant l'analyse du CSS : il annule l'`unicode-range` du `@font-face` et impose
 *     5,7 Mo à des appareils qui, désormais, ne demandent jamais ce fichier.
 *
 * Les deux se réécrivent d'un geste au fil d'un lot de style ; d'où ce cliquet.
 */
const SELF_HOSTED = 'ForetMapColorEmoji';
const APPLE = 'Apple Color Emoji';

/** Feuilles qui déclarent une pile `font-family` citant la police emoji auto-hébergée. */
const STYLESHEETS = [
  'src/index.css',
  'src/shared/styles/typography-tokens.css',
  'src/gl/styles/gl-base.css',
  'src/plan/styles/plan.css',
];

/** Entrées HTML des trois produits (registre `lib/products.js`). */
const HTML_ENTRIES = ['index.vite.html', 'gl.html', 'plan.html', 'staff.html'];

const readText = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');

/**
 * Déclarations `font-family` / `--font-*` d'une feuille qui citent la police auto-hébergée.
 * Le `@font-face` lui-même (`font-family: 'ForetMapColorEmoji';`) n'est pas une pile : il
 * nomme la famille et ne cite qu'elle.
 */
function emojiStacksOf(css) {
  return [...css.matchAll(/(?:font-family|--font-[a-z-]+)\s*:\s*([^;{}]+);/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter((stack) => stack.includes(SELF_HOSTED) && stack.includes(APPLE));
}

describe('piles emoji : la police du système Apple passe en premier', () => {
  for (const sheet of STYLESHEETS) {
    test(`${sheet} — 'Apple Color Emoji' avant '${SELF_HOSTED}'`, () => {
      const stacks = emojiStacksOf(readText(sheet));
      // Une feuille qui ne citerait plus la police du tout est une régression silencieuse.
      expect(stacks.length).toBeGreaterThan(0);
      for (const stack of stacks) {
        expect(stack.indexOf(APPLE), stack).toBeLessThan(stack.indexOf(SELF_HOSTED));
      }
    });
  }

  test("aucune pile du dépôt ne remet '" + SELF_HOSTED + "' devant", () => {
    const offenders = STYLESHEETS.flatMap((sheet) =>
      emojiStacksOf(readText(sheet))
        .filter((stack) => stack.indexOf(SELF_HOSTED) < stack.indexOf(APPLE))
        .map((stack) => `${sheet} : ${stack}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('livraison de la police emoji', () => {
  for (const entry of HTML_ENTRIES) {
    test(`${entry} ne précharge pas la police emoji`, () => {
      const html = readText(entry).replace(/<!--[\s\S]*?-->/g, '');
      expect(html).not.toMatch(/rel=["']preload["'][\s\S]*?noto-color-emoji/);
      expect(html).not.toMatch(/noto-color-emoji[\s\S]*?rel=["']preload["']/);
    });
  }

  test('le @font-face garde son unicode-range (sinon la police part sur tout le parc)', () => {
    for (const sheet of STYLESHEETS) {
      const css = readText(sheet);
      if (!css.includes(`font-family: '${SELF_HOSTED}'`)) continue;
      expect(css, sheet).toMatch(/unicode-range:/);
    }
  });
});
