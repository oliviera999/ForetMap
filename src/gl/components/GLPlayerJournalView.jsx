import { useMemo, useState } from 'react';
import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { useJournalFeed } from '../../shared/journal/useJournalFeed.js';
import { JournalFeedToolbar } from '../../shared/journal/JournalFeedToolbar.jsx';
import { JournalBookView } from '../../shared/journal/JournalBookView.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalArticleCard } from './GLPlayerJournalArticleCard.jsx';
import { GLPlayerJournalImportCard } from './GLPlayerJournalImportCard.jsx';
import { GL_JOURNAL_UI } from './journalUi.js';
import { GLHelpPanel } from './GLHelpPanel.jsx';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';
import { importTypeMeta } from '../utils/glJournalImportMeta.js';

/**
 * « Mon journal » G&L : lecture-first, édition ciblée, impression livre.
 */
export function GLPlayerJournalView({ gameState, onNavigateTab }) {
  const feed = useJournalFeed(playerJournalAdapter);
  const { title: helpTitle, body: helpBody } = useGlHelpContent('tab:my-journal');
  const [bookOpen, setBookOpen] = useState(false);

  const chapterSpells = useMemo(() => {
    const rows = Array.isArray(gameState?.game?.chapter_spells)
      ? gameState.game.chapter_spells
      : [];
    return rows.map((r) => String(r.spell_code || r.spellCode || '').trim()).filter(Boolean);
  }, [gameState?.game?.chapter_spells]);

  const ownerLabel =
    gameState?.player?.display_name ||
    gameState?.player?.pseudo ||
    gameState?.me?.pseudo ||
    'Mon journal';

  if (bookOpen) {
    return (
      <JournalBookView
        articles={feed.articles}
        imports={feed.imports}
        adapter={playerJournalAdapter}
        ui={GL_JOURNAL_UI}
        ownerLabel={ownerLabel}
        productLabel="Gnomes & Licornes"
        yearbook
        onClose={() => setBookOpen(false)}
        importTypeMeta={importTypeMeta}
      />
    );
  }

  return (
    <section className="gl-panel gl-player-journal fade-in">
      <header className="gl-player-journal__header">
        <div>
          <h2>Mon journal</h2>
          <p className="gl-hint gl-player-journal__intro">
            Feuillette ton carnet : articles et éléments appris. Écris ce que tu veux, ou importe un
            feuillet, une espèce, une définition… une fois marqué comme appris. Le maître du jeu
            peut te consulter pour t’accompagner.
          </p>
        </div>
      </header>

      <GLHelpPanel helpKey="tab:my-journal" title={helpTitle} body={helpBody} defaultOpen={false} />

      <div className="gl-player-journal__actions gl-inline-actions">
        <GLButton type="button" onClick={feed.createArticle} disabled={feed.creating}>
          {feed.creating ? 'Création…' : '+ Nouvel article'}
        </GLButton>
        {feed.totalCount > 0 ? (
          <GLButton type="button" variant="secondary" onClick={() => setBookOpen(true)}>
            Imprimer mon journal
          </GLButton>
        ) : null}
        {feed.error ? (
          <GLButton type="button" variant="secondary" onClick={feed.reload}>
            Réessayer
          </GLButton>
        ) : null}
      </div>

      {!feed.loading && feed.totalCount > 0 ? (
        <JournalFeedToolbar
          feed={feed}
          ui={GL_JOURNAL_UI}
          searchLabel="Rechercher dans mon journal"
        />
      ) : null}

      {feed.error ? <p className="gl-error">{feed.error}</p> : null}

      {feed.loading ? (
        <p className="gl-hint">Chargement de ton carnet…</p>
      ) : feed.totalCount === 0 ? (
        <div className="gl-player-journal__empty">
          <p className="gl-hint">Ton carnet est encore vide. Deux façons de le remplir :</p>
          <ul className="gl-hint">
            <li>
              <strong>Écris un article</strong> — clique sur « + Nouvel article » (texte, images, ou
              les deux).
            </li>
            <li>
              <strong>Importe un élément appris</strong> — sur la page d’un feuillet, d’une espèce,
              d’une définition… clique « Marquer comme appris », puis « + Ajouter à mon journal ».
            </li>
          </ul>
        </div>
      ) : feed.timeline.length === 0 ? (
        <p className="gl-hint gl-player-journal__empty">
          Aucune entrée ne correspond à ta recherche ou à ce filtre.
        </p>
      ) : (
        <div className="gl-player-journal__articles">
          {feed.timeline.map((entry) =>
            entry.kind === 'article' ? (
              <GLPlayerJournalArticleCard
                key={`a-${entry.data.id}`}
                article={entry.data}
                limits={feed.limits}
                chapterSpells={chapterSpells}
                editing={String(feed.editingId) === String(entry.data.id)}
                onStartEdit={(id) => feed.setEditingId(id)}
                onStopEdit={() => feed.setEditingId(null)}
                onDelete={feed.deleteArticle}
                onTogglePin={feed.pinArticle}
              />
            ) : (
              <GLPlayerJournalImportCard
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
