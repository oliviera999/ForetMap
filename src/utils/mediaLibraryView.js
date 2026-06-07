export const MEDIA_LIBRARY_SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Plus récent' },
  { value: 'updated_asc', label: 'Plus ancien' },
  { value: 'name_asc', label: 'Nom A → Z' },
  { value: 'name_desc', label: 'Nom Z → A' },
  { value: 'size_desc', label: 'Plus volumineux' },
  { value: 'size_asc', label: 'Plus léger' },
  { value: 'type_asc', label: 'Type puis nom' },
];

export const MEDIA_LIBRARY_TYPE_FILTERS = [
  { value: 'all', label: 'Tous les types' },
  { value: 'image', label: 'Images' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Vidéo' },
];

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function compareStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });
}

function compareDates(a, b) {
  const left = Date.parse(a) || 0;
  const right = Date.parse(b) || 0;
  return left - right;
}

function compareNumbers(a, b) {
  return (Number(a) || 0) - (Number(b) || 0);
}

export function filterMediaLibraryItems(items = [], options = {}) {
  const filter = String(options.filter || 'all');
  const query = normalizeSearchText(options.query);

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (filter !== 'all' && String(item.mediaType || '') !== filter) return false;
    if (!query) return true;
    const haystack = normalizeSearchText(item.filename || item.relativePath || item.url);
    return haystack.includes(query);
  });
}

export function sortMediaLibraryItems(items = [], sort = 'updated_desc') {
  const list = [...(Array.isArray(items) ? items : [])];
  list.sort((left, right) => {
    switch (sort) {
      case 'updated_asc':
        return compareDates(left.updatedAt, right.updatedAt);
      case 'name_asc':
        return compareStrings(left.filename, right.filename);
      case 'name_desc':
        return compareStrings(right.filename, left.filename);
      case 'size_desc':
        return compareNumbers(right.size, left.size) || compareStrings(left.filename, right.filename);
      case 'size_asc':
        return compareNumbers(left.size, right.size) || compareStrings(left.filename, right.filename);
      case 'type_asc':
        return compareStrings(left.mediaType, right.mediaType)
          || compareStrings(left.filename, right.filename);
      case 'updated_desc':
      default:
        return compareDates(right.updatedAt, left.updatedAt);
    }
  });
  return list;
}

export function filterAndSortMediaLibraryItems(items = [], options = {}) {
  return sortMediaLibraryItems(
    filterMediaLibraryItems(items, options),
    options.sort || 'updated_desc'
  );
}

export function formatMediaLibrarySize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  if (value >= 1024) return `${Math.round(value / 1024)} Ko`;
  return `${value} o`;
}

export function pruneMediaLibrarySelection(selectedPaths, items = []) {
  const valid = new Set((Array.isArray(items) ? items : []).map((item) => item.relativePath));
  return new Set([...(selectedPaths || [])].filter((path) => valid.has(path)));
}

/** Sélecteur intégré (onPickUrl) → galerie ; gestion seule sans picker → liste par défaut. */
export function resolveMediaLibraryLayout({ layout = 'list', onPickUrl } = {}) {
  if (layout === 'gallery') return 'gallery';
  if (typeof onPickUrl === 'function') return 'gallery';
  return 'list';
}
