// Correspondance type de ressource → champ de la réponse /api/gl/learning/me,
// partagée par le hook de progression et les contrôles « marquer / importer ».

export const LEARNING_TYPE_TO_FIELD = {
  species: 'species_codes',
  glossary: 'glossary_codes',
  tutorial: 'tutorial_ids',
  lore_glossary: 'lore_glossary_codes',
  feuillet: 'feuillet_codes',
  content_page: 'content_page_slugs',
  ecosystem: 'ecosystem_slugs',
};

export function isLearnedIn(res, type, ref) {
  const field = LEARNING_TYPE_TO_FIELD[type];
  if (!field) return false;
  const arr = Array.isArray(res?.[field]) ? res[field] : [];
  const key = String(ref == null ? '' : ref).trim();
  return arr.map((x) => String(x).trim()).includes(key);
}
