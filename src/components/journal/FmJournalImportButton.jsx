import { getAuthToken } from '../../services/api';
import { userJournalAdapter } from '../../services/userJournalAdapter.js';
import { JournalImportButton } from '../../shared/journal/JournalImportButton.jsx';
import { FM_JOURNAL_UI } from './journalUi.js';

const TEXTS = {
  hint: 'Marque-le comme appris pour l’ajouter à ton carnet.',
  done: '✓ Dans mon carnet',
  add: '+ Ajouter au carnet',
  ariaLabel: (title) => (title ? `Ajouter « ${title} » au carnet` : 'Ajouter au carnet'),
};

/**
 * Bouton « Ajouter au carnet » (ForetMap) — réservé aux sessions authentifiées. Bouton partagé
 * avec G&L ; ici la garde de session, l'adaptateur et les textes du produit.
 */
export function FmJournalImportButton(props) {
  const canImport = typeof getAuthToken === 'function' && !!getAuthToken();
  return (
    <JournalImportButton
      {...props}
      canImport={canImport}
      adapter={userJournalAdapter}
      ui={FM_JOURNAL_UI}
      texts={TEXTS}
    />
  );
}
