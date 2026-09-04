// Noyau partagé ForetMap / GL : primitives de l'édition riche
// (`src/components/RichTextEditor.jsx`, `src/gl/components/ui/GLRichTextEditor.jsx`).
//
// **Périmètre : la conversion, jamais le composant.** Les deux éditeurs gardent
// leur JSX, leur barre d'outils et leur état — GL porte en plus l'insertion
// d'images inline, les cadres et la résolution des sources d'affichage.
//
// Ce qui est mutualisé ici est strictement ce qui était **identique à l'octet
// près** dans les deux fichiers : la configuration Turndown de base, la
// conversion HTML → Markdown, la comparaison de HTML insensible aux espaces et
// l'exécution de commande d'édition.
//
// Ce qui reste délibérément dans chaque composant :
//   - `markdownToEditableHtml` : signatures et comportements différents (GL
//     résout les sources d'affichage et annote le HTML) ;
//   - `syncFromDom` : ForetMap tronque sur `maxLength` et propage `name`,
//     GL non ;
//   - l'effet de synchronisation `value` → DOM : structurellement identique,
//     mais son seul appel variable est `markdownToEditableHtml`. Le factoriser
//     supposerait d'injecter cette fonction pour **deux** appelants — de la
//     machinerie, pas une abstraction (cf. `docs/PARTAGE_FM_GL.md` §8).

import TurndownService from 'turndown';
import { sanitizeRichHtml } from '../platform/markdown.js';

/** Options Turndown communes aux deux éditeurs. */
export const RICH_TEXT_TURNDOWN_OPTIONS = Object.freeze({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
});

/**
 * Instance Turndown configurée pour l'édition riche.
 *
 * Renvoie une instance **neuve** : chaque produit peut y ajouter ses propres
 * règles (`addRule`) sans contaminer l'autre — GL le fait pour ses images.
 *
 * @returns {TurndownService}
 */
export function createRichTextTurndownService() {
  const service = new TurndownService({ ...RICH_TEXT_TURNDOWN_OPTIONS });
  service.remove(['script', 'style']);
  service.keep(['hr']);
  return service;
}

/**
 * HTML d'éditeur → Markdown, en passant par l'assainissement.
 *
 * @param {TurndownService} turndownService instance du produit (règles comprises)
 * @param {string} html contenu brut de la surface éditable
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string} Markdown rogné
 */
export function htmlToMarkdownWith(turndownService, html, { allowImages = false } = {}) {
  const sanitized = sanitizeRichHtml(html, { allowImages });
  const markdown = turndownService.turndown(sanitized);
  return String(markdown || '').trim();
}

/**
 * Normalise un HTML pour comparaison : espaces réduits, bords rognés.
 *
 * Sert à éviter de réécrire `innerHTML` — donc de perdre la position du curseur —
 * quand seule la mise en forme des espaces diffère.
 *
 * @param {string} html
 * @returns {string}
 */
export function normalizeHtmlForCompare(html) {
  return String(html || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exécute une commande d'édition, sans échouer hors navigateur.
 *
 * @param {string} command
 * @param {string|null} [commandValue]
 * @returns {boolean} `false` si `document.execCommand` est indisponible
 */
export function runExecCommand(command, commandValue = null) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  return document.execCommand(command, false, commandValue);
}
