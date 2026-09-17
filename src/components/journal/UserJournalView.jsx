import { useCallback, useState } from 'react';
import { AccountDeletedError } from '../../services/api';
import { userJournalAdapter } from '../../services/userJournalAdapter.js';
import { useJournalFeed } from '../../shared/journal/useJournalFeed.js';
import { JournalFeedToolbar } from '../../shared/journal/JournalFeedToolbar.jsx';
import { JournalBookView } from '../../shared/journal/JournalBookView.jsx';
import { UserJournalArticleCard } from './UserJournalArticleCard.jsx';
import { UserJournalImportCard } from './UserJournalImportCard.jsx';
import { FM_JOURNAL_UI } from './journalUi.js';
import { HelpPanel } from '../HelpPanel.jsx';
import { useHelp } from '../../hooks/useHelp.js';
import { resolveHelpPanelSection } from '../../utils/helpResolve.js';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { importTypeMeta } from '../../utils/fmJournalMeta.js';
import { getBuildBrand } from '../../shared/brand/brandNames.js';

/**
 * Carnet ForetMap : fil lecture-first (articles + éléments appris), édition ciblée,
 * impression livre.
 */
export function UserJournalView({
  zones = [],
  onForceLogout = null,
  onNavigateTab = null,
  isTeacher = false,
  bookOwnerLabel = 'Mon carnet',
}) {
  const publicSettings = usePublicSettings();
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher });
  const helpJournal = resolveHelpPanelSection('journal', publicSettings);
  const [bookOpen, setBookOpen] = useState(false);
  const onError = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
    },
    [onForceLogout],
  );
  const feed = useJournalFeed(userJournalAdapter, { onError });

  if (bookOpen) {
    return (
      <JournalBookView
        articles={feed.articles}
        imports={feed.imports}
        adapter={userJournalAdapter}
        ui={FM_JOURNAL_UI}
        ownerLabel={bookOwnerLabel}
        productLabel={getBuildBrand().appName || 'ForetMap'}
        yearbook
        onClose={() => setBookOpen(false)}
        importTypeMeta={importTypeMeta}
      />
    );
  }

  return (
    <section className="fm-journal fade-in" data-testid="user-journal">
      <header className="fm-journal__header">
        <div className="fm-journal__header-row">
          <h2>Mon carnet</h2>
          {isHelpEnabled ? (
            <HelpPanel
              sectionId="journal"
              title={helpJournal.title}
              entries={helpJournal.items}
              isTeacher={isTeacher}
              isPulsing={!hasSeenSection('journal')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          ) : null}
        </div>
        <p className="hint fm-journal__intro">
          Feuillette ton carnet : articles et éléments appris. Écris un article, importe une espèce
          ou un terme marqué comme appris. Les professeurs peuvent le consulter pour t’accompagner.
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
        {feed.totalCount > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => setBookOpen(true)}>
            Imprimer mon carnet
          </button>
        ) : null}
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
                editing={String(feed.editingId) === String(entry.data.id)}
                onStartEdit={(id) => feed.setEditingId(id)}
                onStopEdit={() => feed.setEditingId(null)}
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
