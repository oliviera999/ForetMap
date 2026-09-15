import { JournalReadModal } from '../../shared/journal/JournalReadModal.jsx';
import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { importTypeMeta } from '../utils/glJournalImportMeta.js';
import { GL_JOURNAL_UI } from './journalUi.js';

const META = { importTypeMeta };

function playerLabel(player, playerId) {
  if (!player) return playerId ? `Joueur #${playerId}` : 'Joueur';
  const pseudo = String(player.pseudo || '').trim();
  const name = `${player.firstName || ''} ${player.lastName || ''}`.trim();
  if (pseudo && name) return `${pseudo} (${name})`;
  return pseudo || name || `Joueur #${player.id}`;
}

const TEXTS = {
  subjectLabel: playerLabel,
  fileName: (player) => `carnet-${player?.pseudo || player?.id || 'joueur'}.md`,
  empty: 'Ce joueur n’a pas encore rédigé d’article dans son carnet.',
  productLabel: 'Gnomes & Licornes',
};

/**
 * Lecture du carnet d'un joueur par le maître du jeu + export Markdown : modale partagée
 * avec ForetMap ; ici l'adaptateur et les libellés G&L.
 */
export function GLPlayerJournalReadModal({ playerId, open, onClose }) {
  return (
    <JournalReadModal
      subjectId={playerId}
      open={open}
      onClose={onClose}
      adapter={playerJournalAdapter}
      meta={META}
      ui={GL_JOURNAL_UI}
      texts={TEXTS}
    />
  );
}
