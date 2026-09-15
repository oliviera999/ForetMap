/** Métadonnées des imports catalogue et des encarts du carnet ForetMap. */

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

export const MODULE_STUB_OPTIONS = [
  { value: 'plants', label: 'Biodiversité' },
  { value: 'glossary', label: 'Glossaire' },
  { value: 'tutorials', label: 'Tutoriels' },
  { value: 'foodweb', label: 'Réseau trophique' },
  { value: 'visit', label: 'Visite' },
  { value: 'quiz', label: 'Quiz' },
];

/**
 * @type {import('../shared/journal/JournalEmbedPicker.jsx').JournalEmbedType[]}
 */
export const JOURNAL_EMBED_TYPES = [
  {
    value: 'plant',
    label: 'Espèce',
    input: 'search',
    fieldLabel: 'Rechercher une espèce',
    placeholder: 'ex. Noisetier',
  },
  {
    value: 'glossary',
    label: 'Terme de glossaire',
    input: 'search',
    fieldLabel: 'Rechercher un terme',
    placeholder: 'ex. Compost',
  },
  {
    value: 'tutorial',
    label: 'Tutoriel',
    input: 'search',
    fieldLabel: 'Rechercher un tutoriel',
    placeholder: 'ex. Arrosage',
  },
  {
    value: 'module_stub',
    label: 'Rappel de module',
    input: 'select',
    fieldLabel: 'Module',
    options: MODULE_STUB_OPTIONS,
    defaultRef: 'plants',
  },
];

export const JOURNAL_EMBED_TYPE_LABELS = Object.fromEntries(
  JOURNAL_EMBED_TYPES.map((t) => [t.value, t.label]),
);
