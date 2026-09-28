'use strict';

/**
 * Polices servies par l'application pour les pages hors build Vite — les fiches tutoriels
 * (audit RGPD du 28/09/2026, § 7 : plus aucun appel à Google Fonts).
 *
 * Les fichiers viennent des paquets npm Fontsource (https://fontsource.org, polices sous
 * licence SIL Open Font License 1.1) : aucun binaire n'est versionné dans le dépôt. La feuille
 * `GET /fonts/local-fonts.css` est assemblée au premier appel à partir de leurs CSS, en
 * réécrivant les `url(./files/…)` vers `GET /fonts/files/:pkg/:file`.
 */

const fs = require('fs');
const path = require('path');

const FONTSOURCE_ROOT = path.join(__dirname, '..', 'node_modules', '@fontsource');
const LOCAL_FONTS_PUBLIC_PREFIX = '/fonts';

/** Variantes demandées par les fiches (`tutos/*.html`) : paquet → feuilles `<graisse>[-italic]`. */
const TUTORIAL_FONT_VARIANTS = Object.freeze({
  'playfair-display': ['400-italic', '700'],
  'dm-sans': ['300', '400', '500'],
  'dm-mono': ['400', '500'],
  'bebas-neue': ['400'],
  'special-elite': ['400'],
});

/** Sous-ensembles utiles au français (le reste alourdirait la feuille sans servir). */
const SUBSETS = Object.freeze(['latin', 'latin-ext']);

const FONT_FILE_RE = /^[a-z0-9-]+\.(woff2|woff)$/;

function readVariantCss(pkg, variant) {
  const out = [];
  for (const subset of SUBSETS) {
    const file = path.join(FONTSOURCE_ROOT, pkg, `${subset}-${variant}.css`);
    if (fs.existsSync(file)) out.push(fs.readFileSync(file, 'utf8'));
  }
  return out.join('\n');
}

let cachedCss = null;

function buildLocalFontsCss() {
  if (cachedCss != null) return cachedCss;
  const parts = [
    '/* Polices auto-hébergées — Fontsource (https://fontsource.org), licence SIL OFL 1.1. */',
  ];
  for (const [pkg, variants] of Object.entries(TUTORIAL_FONT_VARIANTS)) {
    for (const variant of variants) {
      const css = readVariantCss(pkg, variant);
      if (!css) continue;
      parts.push(
        css.replace(
          /url\(\.\/files\/([^)]+)\)/g,
          (_m, file) => `url(${LOCAL_FONTS_PUBLIC_PREFIX}/files/${pkg}/${file})`,
        ),
      );
    }
  }
  cachedCss = parts.join('\n');
  return cachedCss;
}

/**
 * Chemin absolu d'un fichier de police servable, ou `null` : seuls les paquets de la liste et
 * les noms de fichiers `woff`/`woff2` simples sont acceptés (aucune traversée possible).
 */
function resolveLocalFontFile(pkg, file) {
  if (!Object.prototype.hasOwnProperty.call(TUTORIAL_FONT_VARIANTS, pkg)) return null;
  if (!FONT_FILE_RE.test(String(file || ''))) return null;
  const absolute = path.join(FONTSOURCE_ROOT, pkg, 'files', file);
  return fs.existsSync(absolute) ? absolute : null;
}

module.exports = {
  LOCAL_FONTS_PUBLIC_PREFIX,
  TUTORIAL_FONT_VARIANTS,
  buildLocalFontsCss,
  resolveLocalFontFile,
};
