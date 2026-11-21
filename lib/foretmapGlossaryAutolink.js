'use strict';

/**
 * Auto-liens du glossaire ForetMap (tutoriels HTML servis par
 * `GET /api/tutorials/:id/view`).
 *
 * Ce module n'est plus qu'un **adaptateur** : toute la logique vit dans le noyau
 * unique `src/shared/glossary/termAutolinkCore.js`, dont `lib/shared/termAutolinkCore.js`
 * est le miroir CJS (généré par `npm run sync:shared-cores`, enchaîné par le build).
 * Auparavant, ce fichier était un fork copié-collé qui avait divergé en silence :
 * son filtre `SKIP_TAGS` était inopérant (audit A3/A5 — du CSS corrompu servi aux
 * élèves) et ses regex étaient recompilées à chaque nœud texte (audit A4).
 *
 * La surface exportée historique est conservée (`buildGlossaryLinkEntries`,
 * `autolinkPlainText`, `autolinkHtmlTextNodes`, `injectGlossaryAutolinkScript`) ; s'y ajoute
 * la barrière de vocabulaire du collège (`filterGlossaryItemsByDepth`,
 * `glossaryDepthMaxForLearner`, `createGlossaryEntriesByDepth`, `glossaryDepthCacheKey`).
 */

const { createTermAutolink } = require('./shared/termAutolinkCore');
const { glossaryNiveauEntryPalier } = require('./pedagoScales');
const { palierRuleFor } = require('./shared/pedagoVisibilityCore');

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
 * Barrière de vocabulaire douce (chantier collège, flux C2) — miroir CJS de
 * `isGlossaryNiveauWithinDepth` de `src/utils/foretmapGlossaryAutolink.js` (parité testée).
 * `depthMax` nul ou inconnu : pas de filtre ; terme sans profondeur connue : gardé.
 * @param {string|null|undefined} termNiveau
 * @param {string|null|undefined} depthMax
 * @returns {boolean}
 */
function isGlossaryNiveauWithinDepth(termNiveau, depthMax) {
  const maxPalier = glossaryNiveauEntryPalier(depthMax);
  if (maxPalier == null) return true;
  const termPalier = glossaryNiveauEntryPalier(termNiveau);
  if (termPalier == null) return true;
  return termPalier <= maxPalier;
}

/**
 * Items dans le palier (même tableau si aucun filtre ne s'applique).
 * @param {Array<{ niveau?: string|null }>} items
 * @param {string|null|undefined} depthMax
 */
function filterGlossaryItemsByDepth(items, depthMax) {
  const list = Array.isArray(items) ? items : [];
  if (glossaryNiveauEntryPalier(depthMax) == null) return list;
  return list.filter((item) => isGlossaryNiveauWithinDepth(item?.niveau, depthMax));
}

/**
 * Profondeur maximale du glossaire pour un apprenant (`resolveLearnerLevel` /
 * `loadLearnerLevelForRequest`) : règle `glossary_depth_max` de la table de visibilité.
 * `null` = pas de filtre (lycée, université, et tout le monde tant que la table vaut S0).
 * @param {object|string|null|undefined} learner
 * @returns {string|null}
 */
function glossaryDepthMaxForLearner(learner) {
  const value = palierRuleFor('glossary_depth_max', learner);
  return glossaryNiveauEntryPalier(value) == null ? null : value;
}

/**
 * Clé de cache d'une profondeur maximale : `'all'` sans filtre, sinon la valeur canonique.
 * Sert à distinguer les sorties mises en cache (HTML de tutoriel enrichi) par palier.
 * @param {string|null|undefined} depthMax
 */
function glossaryDepthCacheKey(depthMax) {
  if (glossaryNiveauEntryPalier(depthMax) == null) return 'all';
  return String(depthMax).trim().toLowerCase();
}

/**
 * Index d'auto-lien **par palier** construit sur une seule lecture des termes : les entrées
 * (regex précompilées) sont calculées une fois par profondeur demandée, puis mémorisées.
 * Les lignes doivent porter `niveau` en plus de `glossary_code`, `terme`, `variantes`.
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string, niveau?: string }>} rows
 * @returns {(depthMax?: string|null) => Array<{ code: string, labels: string[] }>}
 */
function createGlossaryEntriesByDepth(rows) {
  const byKey = new Map();
  return function entriesForDepth(depthMax) {
    const key = glossaryDepthCacheKey(depthMax);
    if (!byKey.has(key)) {
      byKey.set(
        key,
        buildGlossaryLinkEntries(filterGlossaryItemsByDepth(rows, key === 'all' ? null : key)),
      );
    }
    return byKey.get(key);
  };
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
 * La CSP de la vue tutoriel autorise ce script par son empreinte sha256 (`lib/csp.js`) :
 * il doit rester le contenu exact de la balise `<script>` injectée.
 */
const GLOSSARY_AUTOLINK_SCRIPT_BODY = `
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
`;

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
  const script = `<script>${GLOSSARY_AUTOLINK_SCRIPT_BODY}</script>`;
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
  GLOSSARY_AUTOLINK_SCRIPT_BODY,
  isGlossaryNiveauWithinDepth,
  filterGlossaryItemsByDepth,
  glossaryDepthMaxForLearner,
  glossaryDepthCacheKey,
  createGlossaryEntriesByDepth,
};
