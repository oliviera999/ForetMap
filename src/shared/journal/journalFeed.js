/**
 * Fil unifié du carnet (ForetMap « Mon carnet », G&L « Mon journal ») : fonctions pures,
 * sans React ni réseau. Les deux vues portaient la même copie de ce tri / filtre / recherche
 * (audit 2026-09-13, §4.5) ; la logique vit ici, une fois, et se teste sans rendu.
 */

export const DEFAULT_JOURNAL_LIMITS = Object.freeze({ maxChars: 0, maxAssets: 0 });

/** Horodatage numérique tolérant : `0` pour une date absente ou invalide. */
export function timeValue(value) {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function includesQuery(value, q) {
  return String(value || '')
    .toLowerCase()
    .includes(q);
}

/**
 * Construit le fil affiché : articles + imports, filtrés par type, par recherche plein texte,
 * épinglés d'abord puis ordre chronologique choisi.
 *
 * @param {object} params
 * @param {Array<object>} params.articles
 * @param {Array<object>} params.imports
 * @param {'all'|'article'|'import'} [params.kindFilter='all']
 * @param {string} [params.search='']
 * @param {'recent'|'oldest'} [params.sortOrder='recent']
 * @returns {Array<{ kind: 'article'|'import', at: number, data: object }>}
 */
export function buildJournalTimeline({
  articles = [],
  imports = [],
  kindFilter = 'all',
  search = '',
  sortOrder = 'recent',
}) {
  let items = [
    ...articles.map((a) => ({ kind: 'article', at: timeValue(a.createdAt), data: a })),
    ...imports.map((i) => ({ kind: 'import', at: timeValue(i.createdAt), data: i })),
  ];
  if (kindFilter !== 'all') items = items.filter((it) => it.kind === kindFilter);
  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (q) {
    items = items.filter((it) =>
      it.kind === 'article'
        ? includesQuery(it.data.title, q) || includesQuery(it.data.bodyMarkdown, q)
        : includesQuery(it.data.title, q) || includesQuery(it.data.resourceRef, q),
    );
  }
  items.sort((x, y) => {
    const px = x.data.pinned ? 1 : 0;
    const py = y.data.pinned ? 1 : 0;
    if (px !== py) return py - px;
    return sortOrder === 'oldest' ? x.at - y.at : y.at - x.at;
  });
  return items;
}
