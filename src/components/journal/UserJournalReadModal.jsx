import { JournalReadModal } from '../../shared/journal/JournalReadModal.jsx';
import { userJournalAdapter } from '../../services/userJournalAdapter.js';
import { useAuthedHtmlImages } from '../../hooks/useAuthedHtmlImages.js';
import { AuthedImage } from '../AuthedImage.jsx';
import { importTypeMeta } from '../../utils/fmJournalMeta.js';
import { FM_JOURNAL_UI } from './journalUi.js';

const META = { importTypeMeta };

function userLabel(user, userId) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    String(user?.pseudo || '').trim() ||
    `Utilisateur #${userId}`
  );
}

const TEXTS = {
  subjectLabel: userLabel,
  fileName: (_user, userId) => `carnet-${userId}.md`,
  empty: 'Ce compte n’a pas encore rédigé d’article dans son carnet.',
};

function zoneLine(article) {
  return article?.zoneName ? `Zone : ${article.zoneName}` : null;
}

/**
 * Lecture d'un carnet par un professeur (statistiques) + export Markdown : modale partagée
 * avec G&L ; ici l'adaptateur, les libellés ForetMap et la zone rattachée à l'article.
 */
export function UserJournalReadModal({ userId, open, onClose }) {
  return (
    <JournalReadModal
      subjectId={userId}
      open={open}
      onClose={onClose}
      adapter={userJournalAdapter}
      meta={META}
      ui={FM_JOURNAL_UI}
      texts={TEXTS}
      articleExtraLine={zoneLine}
      ImageComponent={AuthedImage}
      useHtmlImages={useAuthedHtmlImages}
    />
  );
}
