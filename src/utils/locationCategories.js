/**
 * Catégories de lieux côté client — dérivations pures sur les zones et repères.
 *
 * Le backend renvoie `categories` (objets complets), `category_ids` et
 * `is_infrastructure` sur chaque zone et chaque repère. Ces helpers tolèrent les
 * charges utiles partielles (une zone fraîchement créée localement, un repère issu
 * d'un cache antérieur) pour éviter de faire dépendre l'affichage d'un rechargement.
 */

/** Identifiants de catégories d'un lieu, quelle que soit la forme reçue. */
export function locationCategoryIds(item) {
  if (!item) return [];
  if (Array.isArray(item.category_ids) && item.category_ids.length) {
    return item.category_ids.map((id) => String(id));
  }
  return (item.categories || []).map((c) => String(c?.id ?? '')).filter(Boolean);
}

/** Catégories complètes d'un lieu (objets), triées comme le backend les renvoie. */
export function locationCategories(item) {
  return (item?.categories || []).filter(Boolean);
}

/** Libellés (et emojis) des catégories — alimente la recherche libre. */
export function locationCategoryLabels(item) {
  const parts = [];
  for (const cat of locationCategories(item)) {
    if (cat.label) parts.push(String(cat.label));
    if (cat.emoji) parts.push(String(cat.emoji));
  }
  return parts;
}

/**
 * Lieu d'infrastructure (bâtiment, mare, compostage…) : au moins une catégorie
 * porte `is_infrastructure`. Remplace l'ancien drapeau `zone.special`, encore
 * accepté en repli tant que des charges utiles antérieures circulent.
 */
export function isInfrastructureLocation(item) {
  if (!item) return false;
  if (typeof item.is_infrastructure === 'boolean') return item.is_infrastructure;
  if (locationCategories(item).some((c) => c?.is_infrastructure)) return true;
  return !!item.special;
}

/** Première catégorie d'un lieu : porte la couleur et la pastille de la légende. */
export function primaryLocationCategory(item) {
  return locationCategories(item)[0] || null;
}

/** Résumé texte des catégories d'un lieu (sous-titre de résultat de recherche). */
export function locationCategoriesSummary(item) {
  const labels = locationCategories(item)
    .map((c) => String(c?.label || '').trim())
    .filter(Boolean);
  return labels.join(' · ');
}

/**
 * Options du filtre carte : catégories réellement portées par les lieux affichés,
 * complétées par le catalogue de la carte (une catégorie encore inutilisée reste
 * proposée pour que le prof voie qu'elle existe).
 * @param {object[]} zones
 * @param {object[]} markers
 * @param {object[]} [catalog] catalogue `/api/map-categories`
 */
export function collectMapCategoryOptions(zones = [], markers = [], catalog = []) {
  const byId = new Map();
  const ingest = (cat) => {
    const id = cat?.id != null ? String(cat.id) : '';
    if (!id || byId.has(id)) return;
    byId.set(id, {
      id,
      label: String(cat.label || id),
      emoji: String(cat.emoji || ''),
      color: String(cat.color || ''),
      is_infrastructure: !!cat.is_infrastructure,
      sort_order: Number(cat.sort_order) || 0,
    });
  };
  for (const cat of catalog) ingest(cat);
  for (const z of zones) for (const cat of locationCategories(z)) ingest(cat);
  for (const m of markers) for (const cat of locationCategories(m)) ingest(cat);
  return [...byId.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'fr'),
  );
}

/** Le lieu porte-t-il au moins une des catégories demandées (OU logique) ? */
export function locationHasAnyCategory(item, categoryIds) {
  if (!categoryIds?.length) return true;
  const ids = new Set(locationCategoryIds(item));
  return categoryIds.some((id) => ids.has(String(id)));
}

/** Trie les catégories par `sort_order` croissant, puis libellé (locale fr). Ne mute pas. */
export function sortLocationCategories(list) {
  return [...(list || [])].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.label || '').localeCompare(String(b.label || ''), 'fr'),
  );
}

/**
 * Calcule les `sort_order` à persister pour déplacer une catégorie d'un cran
 * (`direction` = -1 monter / +1 descendre). Renvoie `null` si impossible, sinon
 * `{ category_ids }` dans le nouvel ordre (pour `PUT /api/map-categories/reorder`)
 * et `patches` `{ id, sort_order }` des lignes qui changent vraiment.
 */
/**
 * Densifie `sort_order` = index après un nouvel ordre (↑↓ ou glisser-déposer).
 * @param {object[]} previousOrder liste avant déplacement (pour calculer `patches`)
 * @param {object[]} nextOrder liste après déplacement
 */
export function categoryReorderResult(previousOrder, nextOrder) {
  const prev = Array.isArray(previousOrder) ? previousOrder : [];
  const next = Array.isArray(nextOrder) ? nextOrder : [];
  if (!next.length) return null;
  const patches = [];
  next.forEach((c, i) => {
    if (c?.id == null) return;
    const was = prev.find((x) => String(x.id) === String(c.id));
    if (Number(was?.sort_order) === i) return;
    patches.push({ id: c.id, sort_order: i });
  });
  return {
    category_ids: next.map((c) => String(c.id)),
    patches,
  };
}

export function buildCategoryReorderPatches(sortedCategories, categoryId, direction) {
  const cats = Array.isArray(sortedCategories) ? sortedCategories : [];
  const target = String(categoryId ?? '');
  const idx = cats.findIndex((c) => String(c?.id ?? '') === target);
  if (idx < 0 || !target) return null;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= cats.length) return null;
  const arr = [...cats];
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  return categoryReorderResult(cats, arr);
}

/**
 * Déplace une catégorie de `fromIndex` vers `toIndex` (glisser-déposer).
 * @returns {{ category_ids: string[], patches: Array<{id, sort_order}> } | null}
 */
export function buildCategoryReorderByMove(sortedCategories, fromIndex, toIndex) {
  const cats = Array.isArray(sortedCategories) ? sortedCategories : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= cats.length ||
    to >= cats.length ||
    from === to
  ) {
    return null;
  }
  const arr = [...cats];
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return categoryReorderResult(cats, arr);
}
