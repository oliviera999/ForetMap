/**
 * Concatène des classes CSS en ignorant les valeurs vides / fausses.
 * Douze copies locales de `joinClassNames` coexistaient (dont cinq dans `src/shared/ui/`),
 * en deux variantes équivalentes — audit du 13/09/2026, §4.3.
 * @param {...unknown} parts
 * @returns {string}
 */
export function joinClassNames(...parts) {
  return parts
    .map((v) => (v == null || v === false ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' ');
}
