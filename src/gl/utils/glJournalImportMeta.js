// Métadonnées d'affichage des éléments importés dans le carnet : libellé FR,
// icône et onglet GL cible (navigation « Voir »). Les onglets GL sont plats
// (cf. app-runtime : 'biodiversite', 'ecosystemes', 'glossary', 'lore-glossary',
// 'tutorials', 'selene-carnet', 'world'/'rules'…).

export const IMPORT_TYPE_META = {
  species: { label: 'Fiche biodiversité', tab: 'biodiversite', icon: '🦋' },
  ecosystem: { label: 'Écosystème', tab: 'ecosystemes', icon: '🌍' },
  glossary: { label: 'Définition', tab: 'glossary', icon: '📖' },
  lore_glossary: { label: 'Lexique lore', tab: 'lore-glossary', icon: '✨' },
  tutorial: { label: 'Tutoriel', tab: 'tutorials', icon: '🎓' },
  feuillet: { label: 'Feuillet de Sélène', tab: 'selene-carnet', icon: '📜' },
  content_page: { label: 'Page du monde', tab: null, icon: '📄' },
};

export function importTypeMeta(resourceType) {
  return IMPORT_TYPE_META[resourceType] || { label: 'Élément du site', tab: null, icon: '📎' };
}

// Onglet GL cible pour « Voir » (les pages de contenu utilisent leur slug comme id d'onglet).
export function importTargetTab(resourceType, resourceRef) {
  if (resourceType === 'content_page') return String(resourceRef || '') || null;
  return IMPORT_TYPE_META[resourceType]?.tab || null;
}

// Cible de navigation « profonde » pour « Voir » : l'onglet ET l'élément précis à
// ouvrir (focusType/focusRef, exploités par AppGL pour piloter modal/popover/scroll).
// Pour content_page, l'onglet EST déjà la page (pas de focus intra-onglet).
export function importTargetNav(resourceType, resourceRef) {
  const ref = resourceRef == null ? '' : String(resourceRef);
  const tab = importTargetTab(resourceType, resourceRef);
  if (!tab) return null;
  if (resourceType === 'content_page') return { tab, focusType: null, focusRef: null };
  return { tab, focusType: resourceType, focusRef: ref || null };
}
