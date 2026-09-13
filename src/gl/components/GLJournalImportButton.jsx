import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { JournalImportButton } from '../../shared/journal/JournalImportButton.jsx';
import { GL_JOURNAL_UI } from './journalUi.js';

// L'import dans le carnet est réservé aux joueurs GL (pas aux invités/MJ).
function isGlPlayerSession() {
  try {
    const raw = localStorage.getItem('gl_session');
    if (!raw) return false;
    return JSON.parse(raw)?.auth?.userType === 'gl_player';
  } catch {
    return false;
  }
}

const TEXTS = {
  hint: 'Marque-le comme appris (parfois après un court quiz) pour l’ajouter à ton journal.',
  done: '✓ Dans mon journal',
  add: '+ Ajouter à mon journal',
  ariaLabel: (title) => (title ? `Ajouter « ${title} » à mon journal` : 'Ajouter à mon journal'),
};

/**
 * Bouton « Importer dans mon journal » d'un élément du site. L'import n'est possible qu'une
 * fois l'élément marqué appris/lu/découvert (contrôlé côté serveur, mais on guide aussi
 * l'utilisateur ici). Bouton partagé avec ForetMap ; ici la garde de session joueur,
 * l'adaptateur et les textes G&L.
 *
 * @param {string} resourceType - 'species' | 'glossary' | 'tutorial' | 'lore_glossary' | 'feuillet' | 'content_page' | 'ecosystem'
 * @param {string|number} resourceRef - code/slug/id stable de la ressource
 * @param {string} [title] - libellé figé (le serveur retombe sur le titre BDD sinon)
 * @param {boolean} learned - l'élément est-il déjà acquis par le joueur ?
 * @param {boolean} [alreadyImported] - déjà présent dans le carnet ?
 * @param {boolean} [enabled=true] - module carnet actif ?
 */
export function GLJournalImportButton(props) {
  return (
    <JournalImportButton
      {...props}
      canImport={isGlPlayerSession()}
      adapter={playerJournalAdapter}
      ui={GL_JOURNAL_UI}
      texts={TEXTS}
    />
  );
}
