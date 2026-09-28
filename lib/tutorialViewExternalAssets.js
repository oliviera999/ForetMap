'use strict';

/**
 * Ressources tierces d'une fiche tutoriel affichée (audit RGPD du 28/09/2026, § 7).
 *
 * Appliqué APRÈS l'assainissement (qui retire déjà toute balise `<link>`) :
 *  - la feuille des polices servies par l'application est toujours ajoutée : les fiches
 *    retrouvent leurs polices sans rien demander à Google ;
 *  - en mode `local` du réglage `privacy.external_assets_mode`, les `@import` Google Fonts
 *    glissés dans un `<style>` sont neutralisés et les images Wikimedia passent par le relais
 *    `GET /api/media/remote`.
 */

const LOCAL_FONTS_HREF = '/fonts/local-fonts.css';
const LOCAL_FONTS_LINK = `<link rel="stylesheet" href="${LOCAL_FONTS_HREF}" data-foretmap-local-fonts>`;

const GOOGLE_FONTS_IMPORT_RE =
  /@import\s+(?:url\(\s*)?["']?https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^;]*;/gi;
const WIKIMEDIA_SRC_RE =
  /(\s(?:src|poster)\s*=\s*)(["'])(https:\/\/(?:upload|commons)\.wikimedia\.org\/[^"']*)\2/gi;

function decodeAttributeEntities(value) {
  return value.replace(/&amp;/g, '&');
}

function injectLocalFontsLink(html) {
  if (html.includes('data-foretmap-local-fonts')) return html;
  if (/<head[^>]*>/i.test(html))
    return html.replace(/<head[^>]*>/i, (m) => `${m}${LOCAL_FONTS_LINK}`);
  return `${LOCAL_FONTS_LINK}${html}`;
}

/**
 * @param {string} html HTML déjà assaini
 * @param {'local'|'external'} mode
 */
function localizeTutorialExternalAssets(html, mode = 'local') {
  let out = injectLocalFontsLink(String(html || ''));
  if (mode === 'external') return out;
  out = out.replace(GOOGLE_FONTS_IMPORT_RE, '');
  out = out.replace(WIKIMEDIA_SRC_RE, (_m, prefix, quote, url) => {
    const relayed = `/api/media/remote?url=${encodeURIComponent(decodeAttributeEntities(url))}`;
    return `${prefix}${quote}${relayed}${quote}`;
  });
  return out;
}

module.exports = {
  LOCAL_FONTS_HREF,
  localizeTutorialExternalAssets,
};
