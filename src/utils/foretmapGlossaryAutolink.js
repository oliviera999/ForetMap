/**
 * Auto-liens du glossaire **ForetMap** dans du Markdown ou du texte brut.
 *
 * Pendant exact de `src/utils/glGlossaryAutolink.js` (GL) : même tronc commun
 * (`createTermAutolink`), trois points de variation seulement.
 *
 * La classe CSS `fm-glossary-inline-link` est volontairement **la même** que celle
 * produite côté serveur pour les tutoriels (`lib/foretmapGlossaryAutolink.js`) :
 * un seul style pour un seul geste, quel que soit l'écran.
 */
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from '../shared/platform/markdown.js';
import { createTermAutolink } from '../shared/glossary/termAutolinkCore.js';
import { glossaryNiveauEntryPalier } from './pedagoScales.js';

const autolink = createTermAutolink({
  codeField: 'glossary_code',
  cssClass: 'fm-glossary-inline-link',
  dataAttr: 'data-glossary-code',
});

/**
 * Barrière de vocabulaire **douce** (chantier collège, flux C2) : un terme est « dans le
 * palier » si son palier d'entrée (`GLOSSARY_NIVEAU_ENTRY` : `base` → cycle 3,
 * `approfondissement` → cycle 4, `avance` → seconde) ne dépasse pas celui de la profondeur
 * maximale `depthMax` (règle `glossary_depth_max` de la table de visibilité).
 *
 * Prudence : `depthMax` nul ou inconnu = pas de filtre ; terme sans profondeur connue = gardé.
 * Le filtre ne touche que l'auto-lien et la liste par défaut, jamais la fiche d'un terme.
 * Miroir serveur : `lib/foretmapGlossaryAutolink.js` (parité vérifiée par les tests).
 *
 * @param {string|null|undefined} termNiveau profondeur du terme (`glossary_terms.niveau`)
 * @param {string|null|undefined} depthMax profondeur maximale du palier, ou `null`
 * @returns {boolean}
 */
export function isGlossaryNiveauWithinDepth(termNiveau, depthMax) {
  const maxPalier = glossaryNiveauEntryPalier(depthMax);
  if (maxPalier == null) return true;
  const termPalier = glossaryNiveauEntryPalier(termNiveau);
  if (termPalier == null) return true;
  return termPalier <= maxPalier;
}

/**
 * Vrai si `depthMax` pose une barrière (profondeur connue) ; `null` ou inconnue : aucune.
 * Sert aussi de signal du mode « collège simplifié » des fiches de glossaire.
 * @param {string|null|undefined} depthMax
 */
export function hasGlossaryDepthBarrier(depthMax) {
  return glossaryNiveauEntryPalier(depthMax) != null;
}

/**
 * Items de glossaire dont la profondeur est dans le palier (copie ; même tableau si aucun
 * filtre ne s'applique, pour garder les mémoïsations stables).
 * @template {{ niveau?: string|null }} T
 * @param {T[]} items
 * @param {string|null|undefined} depthMax
 * @returns {T[]}
 */
export function filterGlossaryItemsByDepth(items, depthMax) {
  const list = Array.isArray(items) ? items : [];
  if (glossaryNiveauEntryPalier(depthMax) == null) return list;
  return list.filter((item) => isGlossaryNiveauWithinDepth(item?.niveau, depthMax));
}

/**
 * Fusionne l'index glossaire (auto-lien) avec des termes déjà liés à un contenu
 * (par ex. `presentation.glossaryTerms` d'une question de quiz).
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} baseItems
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} extraTerms
 */
export function mergeGlossaryLinkItems(baseItems = [], extraTerms = []) {
  return autolink.mergeItems(baseItems, extraTerms);
}

/**
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} items
 * @returns {Array<{ code: string, labels: string[] }>}
 */
export function buildGlossaryLinkEntries(items) {
  return autolink.buildEntries(items);
}

/**
 * @param {string} text
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkPlainText(text, entries) {
  return autolink.autolinkPlainText(text, entries);
}

/**
 * @param {string} html
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkHtmlTextNodes(html, entries) {
  return autolink.autolinkHtmlTextNodes(html, entries);
}

/**
 * Markdown ForetMap rendu en HTML sûr, puis auto-lié.
 * @param {string} markdown
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string}
 */
export function renderMarkdownWithGlossaryLinks(markdown, glossaryItems, options = {}) {
  const html = renderMarkdownToSafeHtml(markdown, {
    allowImages: options?.allowImages,
    allowGlossaryLinks: true,
  });
  const entries = buildGlossaryLinkEntries(glossaryItems);
  return autolinkHtmlTextNodes(html, entries);
}

/**
 * Texte **brut** ForetMap (énoncé de quiz, description d'interaction…) : le HTML
 * est échappé **avant** insertion des liens, puis le tout repasse au sanitizer.
 * @param {string} text
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @returns {string}
 */
export function renderPlainTextWithGlossaryLinks(text, glossaryItems) {
  const safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const entries = buildGlossaryLinkEntries(glossaryItems);
  const linked = autolinkPlainText(safe, entries);
  return sanitizeRichHtml(linked, { allowGlossaryLinks: true });
}
