/** Métadonnées des imports catalogue du carnet ForetMap. */

export const IMPORT_TYPE_META = {
  plant: { label: 'Espèce', tab: 'plants', icon: '🌿' },
  glossary: { label: 'Glossaire', tab: 'glossary', icon: '📖' },
  tutorial: { label: 'Tutoriel', tab: 'tuto', icon: '📘' },
};

export function importTypeMeta(resourceType) {
  return (
    IMPORT_TYPE_META[String(resourceType || '').toLowerCase()] || {
      label: 'Ressource',
      tab: null,
      icon: '📌',
    }
  );
}

export function importTargetNav(resourceType, resourceRef) {
  const meta = importTypeMeta(resourceType);
  if (!meta.tab) return null;
  return {
    tab: meta.tab,
    focusType: String(resourceType || '').toLowerCase(),
    focusRef: String(resourceRef || ''),
  };
}

export const JOURNAL_EMBED_TYPE_LABELS = {
  plant: 'Espèce (id fiche)',
  glossary: 'Terme de glossaire',
  tutorial: 'Tutoriel (id)',
  module_stub: 'Rappel de module',
};

export const MODULE_STUB_OPTIONS = [
  { value: 'plants', label: 'Biodiversité' },
  { value: 'glossary', label: 'Glossaire' },
  { value: 'tutorials', label: 'Tutoriels' },
  { value: 'foodweb', label: 'Réseau trophique' },
  { value: 'visit', label: 'Visite' },
  { value: 'quiz', label: 'Quiz' },
];
