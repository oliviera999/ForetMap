/**
 * Registre des encarts insérables dans un article du journal G&L.
 * @type {import('../../shared/journal/JournalEmbedPicker.jsx').JournalEmbedType[]}
 */
export const JOURNAL_EMBED_TYPES = [
  {
    value: 'spell',
    label: 'Sortilège',
    input: 'search',
    fieldLabel: 'Rechercher un sortilège',
    placeholder: 'ex. Clairière',
    suggestions: (context) => (Array.isArray(context?.chapterSpells) ? context.chapterSpells : []),
  },
  {
    value: 'species',
    label: 'Espèce (biodiversité)',
    input: 'search',
    fieldLabel: 'Rechercher une espèce',
    placeholder: 'ex. Renard',
  },
  {
    value: 'glossary',
    label: 'Terme du glossaire scientifique',
    input: 'search',
    fieldLabel: 'Rechercher un terme',
    placeholder: 'ex. Biome',
  },
  {
    value: 'chapter',
    label: 'Chapitre / scène',
    input: 'search',
    fieldLabel: 'Rechercher un chapitre',
    placeholder: 'ex. Seuil',
  },
  {
    value: 'module_stub',
    label: 'Module (à venir)',
    input: 'none',
    defaultRef: 'narrative',
    hint: 'Place un rappel « module narratif à venir » dans ton carnet. Tu pourras le remplacer plus tard par un vrai encart.',
  },
];

export const JOURNAL_EMBED_TYPE_LABELS = Object.fromEntries(
  JOURNAL_EMBED_TYPES.map((t) => [t.value, t.label]),
);
