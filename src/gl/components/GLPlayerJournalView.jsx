import { useMemo } from 'react';
import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { useJournalFeed } from '../../shared/journal/useJournalFeed.js';
import { JournalFeedToolbar } from '../../shared/journal/JournalFeedToolbar.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalArticleCard } from './GLPlayerJournalArticleCard.jsx';
import { GLPlayerJournalImportCard } from './GLPlayerJournalImportCard.jsx';
import { GL_JOURNAL_UI } from './journalUi.js';
import { GLHelpPanel } from './GLHelpPanel.jsx';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';

/**
 * « Mon journal » G&L : fil unifié articles + imports. Données et actions dans
 * `useJournalFeed` (partagé avec ForetMap) ; ici les textes, l'aide contextuelle et
 * l'habillage G&L, plus les sorts du chapitre courant proposés à l'insertion.
 */
export function GLPlayerJournalView({ gameState, onNavigateTab }) {
  const feed = useJournalFeed(playerJournalAdapter);
  const { title: helpTitle, body: helpBody } = useGlHelpContent('tab:my-journal');

  const chapterSpells = useMemo(() => {
    const rows = Array.isArray(gameState?.game?.chapter_spells)
      ? gameState.game.chapter_spells
      : [];
    return rows.map((r) => String(r.spell_code || r.spellCode || '').trim()).filter(Boolean);
  }, [gameState?.game?.chapter_spells]);

  return (
    <section className="gl-panel gl-player-journal fade-in">
      <header className="gl-player-journal__header">
        <div>
          <h2>Mon journal</h2>
          <p className="gl-hint gl-player-journal__intro">
            Ton carnet personnel, en ordre chronologique : clique sur « Nouvel article » pour noter
            ce que tu veux (texte, images ou médias seuls). Tu peux aussi importer ici les éléments
            du site que tu as appris (feuillets, écosystèmes, fiches biodiversité, tutos,
            définitions…) depuis leur page. Le maître du jeu peut te consulter pour t’accompagner.
          </p>
        </div>
      </header>

      <GLHelpPanel helpKey="tab:my-journal" title={helpTitle} body={helpBody} defaultOpen={false} />

      <div className="gl-player-journal__actions gl-inline-actions">
        <GLButton type="button" onClick={feed.createArticle} disabled={feed.creating}>
          {feed.creating ? 'Création…' : '+ Nouvel article'}
        </GLButton>
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
              d’une définition… clique « Marquer comme appris » (parfois après un petit quiz qui
              valide ta lecture), puis « + Ajouter à mon journal ». Il apparaîtra ici.
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
