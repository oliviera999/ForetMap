import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { describe, test, expect } from 'vitest';

import { DESKTOP_SPLIT_MIN_WIDTH } from '../../src/constants/app-runtime.js';

/**
 * Cliquet de style : breakpoints et tokens typographiques communs.
 *
 * `src/index.css` documente une liste canonique de seuils (480 / 640 / 720 / 1023-1024, plus
 * les paires min/max complémentaires) avec un miroir JS (`DESKTOP_SPLIT_MIN_WIDTH`). Les media
 * queries ne pouvant pas lire de `var()`, rien n'empêchait d'écrire un nouveau seuil au fil
 * des lots : les feuilles en portent aujourd'hui une vingtaine hors liste. Ces tests figent
 * l'existant et interdisent d'en ajouter.
 *
 * Même logique pour la typographie : `gl-base.css` recopiait à l'octet près 19 tokens de
 * `index.css`. Ils vivent désormais dans `src/shared/styles/typography-tokens.css`, chargée
 * par les deux entrées ; une redéclaration côté produit est exactement ce qui les ferait
 * diverger à nouveau.
 */
const STYLE_DIRS = ['src/shared/styles', 'src/gl/styles'];
const ROOT_STYLESHEETS = ['src/index.css'];

/**
 * Seuils canoniques (cf. commentaire « BREAKPOINTS CANONIQUES » de src/index.css) : les
 * paires min/max complémentaires (640/641, 700/701, 767/768, 1023/1024) sont volontaires.
 */
const CANONICAL_BREAKPOINTS = [480, 640, 641, 700, 701, 720, 767, 768, 1023, 1024];

/**
 * Dette connue, à résorber — ne pas en ajouter.
 *
 * Photographie de l'état des feuilles au moment où le cliquet a été posé, seuil par seuil et
 * feuille par feuille. Un seuil ajouté (ou un seuil toléré repris dans une autre feuille)
 * fait échouer le test ; un seuil résorbé doit aussi être retiré d'ici, le test le signale.
 */
const LEGACY_BREAKPOINTS_TOLERATED = {
  'src/index.css': [
    380, 390, 400, 440, 500, 520, 560, 620, 680, 760, 860, 900, 960, 980, 1080, 1100, 1280,
  ],
  'src/gl/styles/gl-admin.css': [900],
  'src/gl/styles/gl-theme.css': [520, 600, 860, 900, 1100],
  'src/shared/styles/motion.css': [769],
  // Règle déplacée telle quelle depuis index.css (pastille de version) : même seuil, pas un ajout.
  'src/shared/styles/version-badge.css': [380],
};

const TYPOGRAPHY_TOKENS_PATH = 'src/shared/styles/typography-tokens.css';
/** Les 19 tokens communs : déclarés une seule fois, dans `typography-tokens.css`. */
const TYPOGRAPHY_TOKENS = [
  '--text-2xs',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--fw-regular',
  '--fw-medium',
  '--fw-semibold',
  '--fw-bold',
  '--lh-tight',
  '--lh-normal',
  '--lh-relaxed',
  '--ink-soft',
  '--ink-faint',
  '--font-emoji-stack',
  '--font-sans-with-emoji',
];
/** Feuilles racines de chaque produit : elles gardent `--font-sans` et rien d'autre. */
const PRODUCT_ROOT_SHEETS = ['src/index.css', 'src/gl/styles/gl-base.css'];

const normalizeRelPath = (relPath) => String(relPath).replace(/\\/g, '/');

const readText = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');

/** Retire les commentaires CSS pour ne pas confondre documentation et règles actives. */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Toutes les feuilles de style contrôlées, chemins normalisés et triés. */
function listStylesheets() {
  const files = [];
  for (const dir of STYLE_DIRS) {
    for (const name of readdirSync(resolve(process.cwd(), dir))) {
      if (name.endsWith('.css')) files.push(join(dir, name));
    }
  }
  files.push(...ROOT_STYLESHEETS);
  return files.map((f) => normalizeRelPath(f)).sort();
}

/**
 * Seuils `min-width` / `max-width` en px de chaque `@media` d'une feuille, dédoublonnés.
 * Couvre la syntaxe classique `(max-width: 640px)` et la syntaxe d'intervalle
 * (`(width >= 640px)`, `(640px < width)`).
 */
function extractBreakpoints(css) {
  const found = new Set();
  for (const [prelude] of stripCssComments(css).matchAll(/@media[^{;]*/g)) {
    for (const [, px] of prelude.matchAll(/\b(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      found.add(Number(px));
    }
    for (const [, left, right] of prelude.matchAll(
      /(\d+(?:\.\d+)?)px\s*[<>]=?\s*width|\bwidth\s*[<>]=?\s*(\d+(?:\.\d+)?)px/g,
    )) {
      found.add(Number(left ?? right));
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Vrai si la feuille déclare le token (`--nom:`), hors commentaires et hors simple `var()`. */
function declaresToken(css, token) {
  const escaped = token.replace(/[-]/g, '\\-');
  return new RegExp(`(?<![\\w-])${escaped}\\s*:`).test(stripCssComments(css));
}

describe('breakpoints — liste canonique et dette tolérée', () => {
  test('le miroir JS du seuil desktop est un seuil canonique', () => {
    expect(CANONICAL_BREAKPOINTS).toContain(DESKTOP_SPLIT_MIN_WIDTH);
  });

  test('aucune feuille n’introduit de seuil hors liste canonique ou tolérée', () => {
    const offenders = [];
    for (const file of listStylesheets()) {
      const tolerated = LEGACY_BREAKPOINTS_TOLERATED[file] ?? [];
      for (const px of extractBreakpoints(readText(file))) {
        if (!CANONICAL_BREAKPOINTS.includes(px) && !tolerated.includes(px)) {
          offenders.push(`${file}: ${px}px`);
        }
      }
    }
    // Un nouveau seuil se remplace par le seuil canonique le plus proche, il ne s'ajoute
    // pas à LEGACY_BREAKPOINTS_TOLERATED.
    expect(offenders).toEqual([]);
  });

  test('chaque seuil toléré est encore utilisé (sinon le retirer de la liste)', () => {
    const stale = [];
    for (const [file, seuils] of Object.entries(LEGACY_BREAKPOINTS_TOLERATED)) {
      const present = extractBreakpoints(readText(file));
      for (const px of seuils) {
        if (!present.includes(px)) stale.push(`${file}: ${px}px`);
      }
    }
    expect(stale).toEqual([]);
  });

  test('la liste tolérée ne recense aucun seuil déjà canonique', () => {
    for (const [file, seuils] of Object.entries(LEGACY_BREAKPOINTS_TOLERATED)) {
      const overlap = seuils.filter((px) => CANONICAL_BREAKPOINTS.includes(px));
      expect(`${file} → ${overlap.join(', ')}`).toBe(`${file} → `);
    }
  });
});

describe('typography-tokens.css — tokens typographiques communs', () => {
  test('la feuille commune déclare exactement les 19 tokens, et pas --font-sans', () => {
    const css = readText(TYPOGRAPHY_TOKENS_PATH);
    for (const token of TYPOGRAPHY_TOKENS) {
      expect(`${token}: ${declaresToken(css, token)}`).toBe(`${token}: true`);
    }
    // `--font-sans` reste par produit (DM Sans côté ForetMap, Caudex côté G&L).
    expect(declaresToken(css, '--font-sans')).toBe(false);
    const declared = [...stripCssComments(css).matchAll(/(?<![\w-])(--[a-z0-9-]+)\s*:/g)].map(
      ([, name]) => name,
    );
    expect([...new Set(declared)].sort()).toEqual([...TYPOGRAPHY_TOKENS].sort());
  });

  test('aucune feuille produit ne redéclare un token commun', () => {
    for (const file of listStylesheets().filter((f) => f !== TYPOGRAPHY_TOKENS_PATH)) {
      const css = readText(file);
      for (const token of TYPOGRAPHY_TOKENS) {
        expect(`${file} → ${token}: ${declaresToken(css, token)}`).toBe(
          `${file} → ${token}: false`,
        );
      }
    }
  });

  test('chaque feuille racine produit garde sa propre --font-sans', () => {
    for (const file of PRODUCT_ROOT_SHEETS) {
      expect(`${file}: ${declaresToken(readText(file), '--font-sans')}`).toBe(`${file}: true`);
    }
  });

  test('les deux entrées chargent la feuille commune', () => {
    // ForetMap : `@import` en tête de index.css (avant toute règle, comme l'exige CSS).
    expect(stripCssComments(readText('src/index.css'))).toMatch(
      /^\s*@import\s+'\.\/shared\/styles\/typography-tokens\.css';/,
    );
    // G&L : import ESM dans main.jsx, avant gl-base.css qui consomme les tokens.
    const glMain = readText('src/gl/main.jsx');
    const tokensAt = glMain.indexOf("import '../shared/styles/typography-tokens.css';");
    const baseAt = glMain.indexOf("import './styles/gl-base.css';");
    expect(tokensAt).toBeGreaterThan(-1);
    expect(baseAt).toBeGreaterThan(tokensAt);
  });
});
