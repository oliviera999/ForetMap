'use strict';

/**
 * Assainissement serveur du HTML des fiches tutoriels (C5, audit
 * `docs/AUDIT_STABILITE_PERF_2026-09.md`).
 *
 * `GET /api/tutorials/:id/view` sert en `text/html`, sur l'origine de l'application, un
 * contenu **importé** (fichier déposé ou `html_content` saisi). Sans assainissement, un
 * script glissé dans une fiche s'exécutait avec l'origine de l'application chez chaque
 * élève qui l'ouvrait — et le jeton de session vit dans `localStorage`. Le HTML est donc
 * assaini AVANT enrichissement (auto-liens de glossaire, scripts propres à l'application,
 * cf. `routes/tutorials.js`), en profil « document entier » :
 *  - retirés : scripts, gestionnaires `on*`, URL `javascript:`, iframes/objets/embeds
 *    (défauts DOMPurify), plus les formulaires (aucune fiche légitime n'en poste) ;
 *  - conservés : la structure du document, ses `<style>` (les fiches sont des documents
 *    typés), images, liens `target="_blank"` (réécrits côté aperçu), attributs `data-*`.
 *
 * Outil : DOMPurify via `isomorphic-dompurify` — déjà en dépendance, même moteur que
 * l'assainissement Markdown côté client (`src/shared/platform/markdown.js`). Source :
 * https://github.com/cure53/DOMPurify (licence Apache-2.0/MPL-2.0). Chargement paresseux :
 * jsdom pèse en mémoire au boot (même motif que exceljs/pdfkit, audit §4).
 */

let cachedDompurify = null;
function getDompurify() {
  if (!cachedDompurify) {
    cachedDompurify = require('isomorphic-dompurify');
  }
  return cachedDompurify;
}

const SANITIZE_OPTIONS = Object.freeze({
  WHOLE_DOCUMENT: true,
  FORBID_TAGS: ['form', 'input', 'textarea', 'select', 'button', 'dialog'],
  ADD_ATTR: ['target'],
});

const DOCTYPE_RE = /^\s*<!doctype\s+html[^>]*>/i;

/**
 * @param {string} html document ou fragment HTML importé (non fiable)
 * @returns {string} même contenu, sans vecteur d'exécution de script
 */
function sanitizeTutorialViewHtml(html) {
  const source = String(html == null ? '' : html);
  if (!source.trim()) return source;
  const sanitized = getDompurify().sanitize(source, SANITIZE_OPTIONS);
  // DOMPurify ne resserialise pas le doctype : on le restitue pour que les fiches qui en
  // avaient un gardent leur mode de rendu (standards, pas quirks).
  if (DOCTYPE_RE.test(source)) {
    return `<!doctype html>${sanitized}`;
  }
  return sanitized;
}

module.exports = {
  sanitizeTutorialViewHtml,
};
