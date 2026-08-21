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

/** Marqueur d'idempotence : une fiche déjà enrichie n'est pas enrichie deux fois. */
const GLOSSARY_STYLE_MARKER = 'data-fm-glossary-style';

/**
 * Feuille de style minimale des auto-liens, injectée **dans l'iframe** : aucune CSS de
 * l'application n'y pénètre, les termes héritaient donc du style `a` de chaque fiche —
 * souvent aucun (audit A8), et l'élève ne voyait pas que le mot était cliquable.
 *
 * Volontairement discrète (soulignement pointillé + `cursor: help`, la convention
 * « définition disponible ») pour ne pas défigurer les chartes très typées de `tutos/`.
 * **Pas de `!important`** : la balise étant insérée en fin de `<body>`, elle est la
 * dernière du document et l'emporte donc déjà à spécificité égale sur le `<style>` de
 * tête de la fiche ; une fiche qui cible ses liens plus précisément garde délibérément
 * la main sur son rendu.
 */
const GLOSSARY_STYLE = `<style ${GLOSSARY_STYLE_MARKER}>
a.fm-glossary-inline-link {
  color: #2d6a4f;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: help;
}
a.fm-glossary-inline-link:hover,
a.fm-glossary-inline-link:focus {
  text-decoration-style: solid;
  background: rgba(82, 183, 136, 0.16);
  border-radius: 3px;
}
</style>`;

/**
 * Injecte, dans le HTML du tutoriel, la feuille de style des auto-liens puis le script
 * qui relaie le clic sur un terme vers l'application parente (l'iframe est servie par la
 * même origine). L'ordre style → script est délibéré : le HTML se termine par
 * `</script></body>`, ce sur quoi s'appuient les tests du lot 1.
 * @param {string} html
 * @returns {string}
 */
function injectGlossaryAutolinkScript(html) {
  const source = String(html == null ? '' : html);
  if (source.includes(GLOSSARY_STYLE_MARKER)) return source;
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
  if (/<\/body>/i.test(source)) {
    // Style puis script, tous deux avant `</body>` : le style est ainsi la dernière
    // feuille du document (il l'emporte à spécificité égale sur celle de la fiche) et
    // le document se termine toujours par `</script></body>`.
    return source.replace(/<\/body>/i, `${GLOSSARY_STYLE}${script}</body>`);
  }
  // Repli fragment (pas de `</body>`) : le script reste collé au contenu comme avant,
  // le style ferme la marche.
  return `${source}${script}${GLOSSARY_STYLE}`;
}

module.exports = {
  buildGlossaryLinkEntries,
  autolinkPlainText,
  autolinkHtmlTextNodes,
  injectGlossaryAutolinkScript,
};
