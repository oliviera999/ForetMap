import { JournalEmbedPicker } from '../../shared/journal/JournalEmbedPicker.jsx';
import { JOURNAL_EMBED_TYPES } from '../../utils/fmJournalMeta.js';
import { FM_JOURNAL_UI } from './journalUi.js';

/** Sélecteur d'encarts du carnet ForetMap : dialogue partagé, registre de types et thème du produit. */
export function UserJournalEmbedPicker(props) {
  return (
    <JournalEmbedPicker
      {...props}
      types={JOURNAL_EMBED_TYPES}
      title="Insérer un élément"
      ui={FM_JOURNAL_UI}
    />
  );
}
