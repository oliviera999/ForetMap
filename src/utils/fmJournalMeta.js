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
 * Registre des encarts insérables dans un article (sélecteur partagé
 * `src/shared/journal/JournalEmbedPicker.jsx`) : une fiche espèce, un terme, un tutoriel ou
 * un rappel de module (choix dans une liste).
 * @type {import('../shared/journal/JournalEmbedPicker.jsx').JournalEmbedType[]}
 */
export const JOURNAL_EMBED_TYPES = [
  {
    value: 'plant',
    label: 'Espèce (id fiche)',
    fieldLabel: 'Identifiant de fiche espèce',
    placeholder: 'ex. 12',
  },
  {
    value: 'glossary',
    label: 'Terme de glossaire',
    fieldLabel: 'Code glossaire',
    placeholder: 'ex. COMPOST',
  },
  {
    value: 'tutorial',
    label: 'Tutoriel (id)',
    fieldLabel: 'Identifiant du tutoriel',
    placeholder: 'ex. 12',
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
