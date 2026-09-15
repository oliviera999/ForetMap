/**
 * Sérialisation des listes d'ids de catégories dans les réglages
 * (`ui.*.default_category_ids`, `ui.plan.hidden_category_ids`) : `;` / `,` / espaces.
 */

/** @param {unknown} raw */
export function parseCategoryIdsSetting(raw) {
  return String(raw || '')
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @param {Iterable<string|number>|null|undefined} ids */
export function formatCategoryIdsSetting(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.join(';');
}
