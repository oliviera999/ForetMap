'use strict';

/**
 * Auto-liens du glossaire ForetMap (tutoriels HTML servis par
 * `GET /api/tutorials/:id/view`).
 *
 * Ce module n'est plus qu'un **adaptateur** : toute la logique vit dans le tronc
 * commun `src/utils/termAutolink.js`, dont `lib/term-autolink/termAutolink.js` est
 * le miroir CJS (généré par `npm run sync:term-autolink-lib`, enchaîné par le build).
 * Auparavant, ce fichier était un fork copié-collé qui avait divergé en silence :
 * son filtre `SKIP_TAGS` était inopérant (audit A3/A5 — du CSS corrompu servi aux
 * élèves) et ses regex étaient recompilées à chaque nœud texte (audit A4).
 *
 * La surface exportée est inchangée (`buildGlossaryLinkEntries`,
 * `autolinkPlainText`, `autolinkHtmlTextNodes`, `injectGlossaryAutolinkScript`).
 */

const { createTermAutolink } = require('./term-autolink/termAutolink');

const autolink = createTermAutolink({
  codeField: 'glossary_code',
  cssClass: 'fm-glossary-inline-link',
  dataAttr: 'data-glossary-code',
});

/**
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} items
 * @returns {Array<{ code: string, labels: string[] }>}
 */
function buildGlossaryLinkEntries(items) {
  return autolink.buildEntries(items);
}

/**
 * @param {string} text
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
function autolinkPlainText(text, entries) {
  return autolink.autolinkPlainText(text, entries);
}

/**
 * @param {string} html
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
function autolinkHtmlTextNodes(html, entries) {
  return autolink.autolinkHtmlTextNodes(html, entries);
}

/**
 * Injecte, dans le HTML du tutoriel, le script qui relaie le clic sur un terme
 * vers l'application parente (l'iframe est servie par la même origine).
 * @param {string} html
 * @returns {string}
 */
function injectGlossaryAutolinkScript(html) {
  const script = `<script>
(function(){
  document.addEventListener('click', function(ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a.fm-glossary-inline-link') : null;
    if (!el) return;
    ev.preventDefault();
    var code = el.getAttribute('data-glossary-code');
    if (!code) return;
    try { parent.postMessage({ type: 'foretmap:glossary', code: code }, window.location.origin); } catch (_) {}
  });
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return `${html}${script}`;
}

module.exports = {
  buildGlossaryLinkEntries,
  autolinkPlainText,
  autolinkHtmlTextNodes,
  injectGlossaryAutolinkScript,
};
