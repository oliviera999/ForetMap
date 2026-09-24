// Logique pure de l'éditeur de texte ForetMap (`src/components/RichTextEditor.jsx`),
// testée sans DOM dans `tests/rich-text-formatting.test.js`.

const FORMATTING_PATTERNS = [
  /^\s{0,3}#{1,6}\s+\S/m,
  /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+\S/m,
  /^\s{0,3}>/m,
  /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/m,
  /\*\*[^*\n]+\*\*|__[^_\n]+__/,
  /(^|[^*\w])\*[^*\s](?:[^*\n]*[^*\s])?\*(?!\*)/,
  /(^|[^_\w])_[^_\s](?:[^_\n]*[^_\s])?_(?!\w)/,
  /\[[^\]\n]+\]\([^)\s]+\)/,
  /<(?:strong|em|b|i|h[1-6]|ul|ol|blockquote|hr|a)\b/i,
];

/**
 * Le texte Markdown contient-il déjà de la mise en forme (titre, liste, gras, lien…) ?
 * Sert à déplier d'office la barre de mise en forme, repliée pour un texte simple.
 *
 * @param {unknown} markdown
 * @returns {boolean}
 */
export function hasMarkdownFormatting(markdown) {
  const text = String(markdown ?? '');
  if (!text.trim()) return false;
  return FORMATTING_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Remplace les blocs `<div>` d'un `contenteditable` par des paragraphes.
 *
 * Selon le navigateur, la touche Entrée crée un `<div>` ; l'assainissement ne garde pas
 * cette balise et collerait les deux lignes (« abc<div>def</div> » → « abcdef »).
 *
 * @param {unknown} html
 * @returns {string}
 */
export function divBlocksToParagraphs(html) {
  return String(html ?? '')
    .replace(/<div(?:\s[^>]*)?>/gi, '<p>')
    .replace(/<\/div\s*>/gi, '</p>');
}

/**
 * Libellé lisible d'un raccourci clavier (« Ctrl+B », « Cmd+B » sur Mac).
 *
 * @param {string} key
 * @param {{ mac?: boolean, shift?: boolean }} [options]
 * @returns {string}
 */
export function formatShortcut(key, { mac = false, shift = false } = {}) {
  const parts = [mac ? 'Cmd' : 'Ctrl'];
  if (shift) parts.push('Maj');
  parts.push(String(key || '').toUpperCase());
  return parts.join('+');
}

/**
 * Infobulle d'un bouton : « Gras (Ctrl+B) », ou le libellé seul sans raccourci.
 *
 * @param {string} label
 * @param {string} [shortcut]
 * @returns {string}
 */
export function toolTitle(label, shortcut) {
  return shortcut ? `${label} (${shortcut})` : label;
}

/**
 * Complète une adresse tapée sans protocole (« www.exemple.fr », « exemple.fr/page ») par
 * `https://`. Les chemins internes (`/tutoriels/3`), `mailto:` et `tel:` restent intacts.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLinkInput(value) {
  const url = String(value ?? '').trim();
  if (!url || url.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#:]|$)/i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Échappe un texte pour l'insérer dans du HTML (contenu ou valeur d'attribut).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
