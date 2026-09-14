import { useMemo } from 'react';
import { JournalEmbedPicker } from '../../shared/journal/JournalEmbedPicker.jsx';
import { JOURNAL_EMBED_TYPES } from '../utils/glPlayerJournalEmbed.js';
import { GL_JOURNAL_UI } from './journalUi.js';

/**
 * Sélecteur d'encarts du journal G&L : dialogue partagé, registre de types du produit ; les
 * sorts du chapitre courant sont proposés en suggestions du champ « Sortilège ».
 */
export function GLPlayerJournalEmbedPicker({ chapterSpells = [], ...props }) {
  const context = useMemo(() => ({ chapterSpells }), [chapterSpells]);
  return (
    <JournalEmbedPicker
      {...props}
      types={JOURNAL_EMBED_TYPES}
      context={context}
      title="Insérer un élément du site"
      ui={GL_JOURNAL_UI}
    />
  );
}
