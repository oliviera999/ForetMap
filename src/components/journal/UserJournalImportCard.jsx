import { JournalImportCard } from '../../shared/journal/JournalImportCard.jsx';
import { importTypeMeta, importTargetNav } from '../../utils/fmJournalMeta.js';
import { FM_JOURNAL_UI } from './journalUi.js';

const META = { importTypeMeta, importTargetNav };

/** Carte d'import du carnet ForetMap : carte partagée, métadonnées et thème du produit. */
export function UserJournalImportCard(props) {
  return <JournalImportCard {...props} meta={META} ui={FM_JOURNAL_UI} />;
}
