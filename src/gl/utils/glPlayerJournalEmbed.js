/**
 * Registre des encarts insérables dans un article du journal G&L (sélecteur partagé
 * `src/shared/journal/JournalEmbedPicker.jsx`) : sort (avec les codes du chapitre courant en
 * suggestions), espèce, terme du glossaire, chapitre, ou rappel « module narratif à venir ».
 * @type {import('../../shared/journal/JournalEmbedPicker.jsx').JournalEmbedType[]}
 */
export const JOURNAL_EMBED_TYPES = [
  {
    value: 'spell',
    label: 'Sortilège',
    fieldLabel: 'Code sort (ex. SL001) ou choix chapitre',
    placeholder: 'SL001',
    suggestions: (context) => (Array.isArray(context?.chapterSpells) ? context.chapterSpells : []),
  },
  {
    value: 'species',
    label: 'Espèce (biodiversité)',
    fieldLabel: 'Code espèce (ex. SP0001)',
    placeholder: 'SP0001',
  },
  {
    value: 'glossary',
    label: 'Terme du glossaire scientifique',
    fieldLabel: 'Code glossaire (ex. GL001)',
    placeholder: 'GL001',
  },
  {
    value: 'chapter',
    label: 'Chapitre / scène',
    input: 'number',
    fieldLabel: 'Identifiant chapitre',
    placeholder: '1',
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
