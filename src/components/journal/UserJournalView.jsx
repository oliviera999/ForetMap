import { useCallback } from 'react';
import { AccountDeletedError } from '../../services/api';
import { userJournalAdapter } from '../../services/userJournalAdapter.js';
import { useJournalFeed } from '../../shared/journal/useJournalFeed.js';
import { JournalFeedToolbar } from '../../shared/journal/JournalFeedToolbar.jsx';
import { UserJournalArticleCard } from './UserJournalArticleCard.jsx';
import { UserJournalImportCard } from './UserJournalImportCard.jsx';
import { FM_JOURNAL_UI } from './journalUi.js';

/**
 * Carnet ForetMap (parité « Mon journal » G&L) : fil unifié articles + imports.
 * Données et actions dans `useJournalFeed` (partagé) ; ici les textes et l'habillage.
 */
export function UserJournalView({ zones = [], onForceLogout = null, onNavigateTab = null }) {
  const onError = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
    },
    [onForceLogout],
  );
  const feed = useJournalFeed(userJournalAdapter, { onError });

  return (
    <section className="fm-journal fade-in" data-testid="user-journal">
      <header className="fm-journal__header">
        <h2>Mon carnet</h2>
        <p className="hint">
          Ton carnet personnel : articles (texte enrichi et photos), et imports des espèces, termes
          de glossaire et tutoriels que tu as marqués comme appris. Les professeurs peuvent le
          consulter pour t’accompagner.
        </p>
      </header>

      <div className="fm-journal__actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={feed.createArticle}
          disabled={feed.creating}
        >
          {feed.creating ? 'Création…' : '+ Nouvel article'}
        </button>
        {feed.error ? (
          <button type="button" className="btn btn-secondary" onClick={feed.reload}>
            Réessayer
          </button>
        ) : null}
      </div>

      {!feed.loading && feed.totalCount > 0 ? (
        <JournalFeedToolbar feed={feed} ui={FM_JOURNAL_UI} />
      ) : null}

      {feed.error ? <p className="auth-error">{feed.error}</p> : null}

      {feed.loading ? (
        <p className="hint">Chargement de ton carnet…</p>
      ) : feed.totalCount === 0 ? (
        <div className="fm-journal__empty">
          <p className="hint">Ton carnet est encore vide. Deux façons de le remplir :</p>
          <ul className="hint">
            <li>
              <strong>Écris un article</strong> — « + Nouvel article » (texte, images, ou les deux).
            </li>
            <li>
              <strong>Importe un élément appris</strong> — sur une fiche espèce, un terme du
              glossaire ou un tutoriel, marque-le comme appris puis « Ajouter au carnet ».
            </li>
          </ul>
        </div>
      ) : feed.timeline.length === 0 ? (
        <p className="hint fm-journal__empty">Aucune entrée ne correspond à ta recherche.</p>
      ) : (
        <div className="fm-journal__feed">
          {feed.timeline.map((entry) =>
            entry.kind === 'article' ? (
              <UserJournalArticleCard
                key={`a-${entry.data.id}`}
                article={entry.data}
                limits={feed.limits}
                zones={zones}
                onDelete={feed.deleteArticle}
                onTogglePin={feed.pinArticle}
                onForceLogout={onForceLogout}
              />
            ) : (
              <UserJournalImportCard
                key={`i-${entry.data.id}`}
                item={entry.data}
                onNavigateTab={onNavigateTab}
                onDelete={feed.deleteImport}
                onTogglePin={feed.pinImport}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
