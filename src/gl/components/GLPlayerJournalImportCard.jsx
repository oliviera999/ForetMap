import { JournalImportCard } from '../../shared/journal/JournalImportCard.jsx';
import { importTypeMeta, importTargetNav } from '../utils/glJournalImportMeta.js';
import { GL_JOURNAL_UI } from './journalUi.js';

const META = { importTypeMeta, importTargetNav };

/**
 * Carte d'un élément du site importé dans le journal (lecture seule) :
 * type + titre réel + lien « Voir » vers l'onglet d'origine + retrait.
 */
export function GLPlayerJournalImportCard(props) {
  return <JournalImportCard {...props} meta={META} ui={GL_JOURNAL_UI} />;
}
