'use strict';

/**
 * Ressources tierces d'une fiche tutoriel affichée (audit RGPD du 28/09/2026, § 7 ;
 * lot B 24/10/2026).
 *
 * Appliqué APRÈS l'assainissement (qui retire déjà toute balise `<link>`) :
 *  - la feuille des polices servies par l'application est toujours ajoutée ;
 *  - en mode `local`, les `@import` Google Fonts sont neutralisés et toute URL `https:`
 *    tierce (`src`, `poster`, `srcset`, `url()` CSS) passe par le relais `/api/media/remote`.
 */

const LOCAL_FONTS_HREF = '/fonts/local-fonts.css';
const LOCAL_FONTS_LINK = `<link rel="stylesheet" href="${LOCAL_FONTS_HREF}" data-foretmap-local-fonts>`;

const GOOGLE_FONTS_IMPORT_RE =
  /@import\s+(?:url\(\s*)?["']?https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^;]*;/gi;

function decodeAttributeEntities(value) {
  return value.replace(/&amp;/g, '&');
}

function injectLocalFontsLink(html) {
  if (html.includes('data-foretmap-local-fonts')) return html;
  if (/<head[^>]*>/i.test(html))
    return html.replace(/<head[^>]*>/i, (m) => `${m}${LOCAL_FONTS_LINK}`);
  return `${LOCAL_FONTS_LINK}${html}`;
}

function relayHttpsUrl(raw) {
  const text = decodeAttributeEntities(String(raw || '').trim());
  if (!/^https:\/\//i.test(text)) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== 'https:') return null;
    return `/api/media/remote?url=${encodeURIComponent(u.toString())}`;
  } catch {
    return null;
  }
}

function rewriteSrcset(value) {
  return String(value || '')
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const bits = trimmed.split(/\s+/);
      const url = bits[0];
      const relayed = relayHttpsUrl(url);
      if (!relayed) return trimmed;
      bits[0] = relayed;
      return bits.join(' ');
    })
    .join(', ');
}

function rewriteCssUrls(css) {
  return String(css || '').replace(/url\(\s*(['"]?)(https:\/\/[^)'"]+)\1\s*\)/gi, (m, q, url) => {
    const relayed = relayHttpsUrl(url);
    if (!relayed) return m;
    return `url(${q}${relayed}${q})`;
  });
}

/**
 * @param {string} html HTML déjà assaini
 * @param {'local'|'external'} mode
 */
function localizeTutorialExternalAssets(html, mode = 'local') {
  let out = injectLocalFontsLink(String(html || ''));
  if (mode === 'external') return out;
  out = out.replace(GOOGLE_FONTS_IMPORT_RE, '');
  out = out.replace(
    /(\s(?:src|poster)\s*=\s*)(["'])(https:\/\/[^"']*)\2/gi,
    (m, prefix, quote, url) => {
      const relayed = relayHttpsUrl(url);
      return relayed ? `${prefix}${quote}${relayed}${quote}` : m;
    },
  );
  out = out.replace(/(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi, (m, prefix, quote, value) => {
    return `${prefix}${quote}${rewriteSrcset(value)}${quote}`;
  });
  out = out.replace(/(style\s*=\s*)(["'])([^"']*)\2/gi, (m, prefix, quote, css) => {
    return `${prefix}${quote}${rewriteCssUrls(css)}${quote}`;
  });
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, css) =>
    m.replace(css, rewriteCssUrls(css)),
  );
  return out;
}

module.exports = {
  LOCAL_FONTS_HREF,
  localizeTutorialExternalAssets,
};
