import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { useJournalArticleEditor } from '../../shared/journal/useJournalArticleEditor.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalEmbedPicker } from './GLPlayerJournalEmbedPicker.jsx';
import { useGlJournalEmbedTitles } from '../hooks/useGlJournalEmbedTitles.js';
import { buildEditorMetaParts } from '../../shared/journal/journalArticleMeta.js';
import { JournalArticleReadCard } from '../../shared/journal/JournalArticleReadCard.jsx';
import { GL_JOURNAL_UI } from './journalUi.js';

/**
 * Article du carnet G&L : lecture par défaut, édition sur demande.
 * Champ propre — sorts du chapitre pour l’insertion.
 */
export function GLPlayerJournalArticleCard({
  article,
  limits,
  chapterSpells = [],
  editing = false,
  onStartEdit = null,
  onStopEdit = null,
  onDelete,
  onTogglePin,
}) {
  if (!editing) {
    return (
      <JournalArticleReadCard
        article={article}
        adapter={playerJournalAdapter}
        ui={GL_JOURNAL_UI}
        onEdit={onStartEdit}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
      />
    );
  }

  return (
    <GLPlayerJournalArticleEditor
      article={article}
      limits={limits}
      chapterSpells={chapterSpells}
      onDelete={onDelete}
      onTogglePin={onTogglePin}
      onStopEdit={onStopEdit}
    />
  );
}

function GLPlayerJournalArticleEditor({
  article,
  limits,
  chapterSpells = [],
  onDelete,
  onTogglePin,
  onStopEdit = null,
}) {
  const ed = useJournalArticleEditor({
    article,
    limits,
    adapter: playerJournalAdapter,
    onDelete,
    onTogglePin,
  });
  const hydratedPreview = useGlJournalEmbedTitles(ed.previewHtml);
  const metaParts = buildEditorMetaParts({
    updatedAt: ed.updatedAt,
    createdAt: article.createdAt,
    maxChars: ed.maxChars,
    charCount: ed.charCount,
  });

  return (
    <article
      className={`gl-panel gl-player-journal__article fade-in${ed.pinned ? ' is-pinned' : ''}`}
      data-testid="journal-article-edit"
    >
      <header className="gl-player-journal__article-head">
        <input
          type="text"
          className="gl-player-journal__article-title"
          value={ed.title}
          maxLength={255}
          onChange={(e) => ed.setTitle(e.target.value)}
          placeholder="Titre de l’article (optionnel)"
          aria-label="Titre de l’article"
        />
        {onStopEdit ? (
          <GLButton
            type="button"
            variant="secondary"
            onClick={onStopEdit}
            aria-label="Terminer l’édition"
          >
            Terminer
          </GLButton>
        ) : null}
        {onTogglePin ? (
          <GLButton
            type="button"
            variant="secondary"
            onClick={ed.handleTogglePin}
            disabled={ed.pinning}
            aria-pressed={ed.pinned}
            aria-label={ed.pinned ? 'Désépingler l’article' : 'Épingler l’article'}
          >
            {ed.pinned ? 'Épinglé' : 'Épingler'}
          </GLButton>
        ) : null}
        <GLButton
          type="button"
          variant="secondary"
          onClick={ed.handleDelete}
          disabled={ed.deleting}
          aria-label="Supprimer l’article"
        >
          {ed.deleting ? 'Suppression…' : 'Supprimer'}
        </GLButton>
      </header>

      <p className="gl-hint gl-player-journal__article-meta">
        {metaParts.length ? metaParts.join(' · ') : null}
        {ed.saveStatus === 'saving' || ed.saveStatus === 'pending' ? (
          <> · Enregistrement…</>
        ) : (
          <>
            {' '}
            <AutoSaveStatus status={ed.saveStatus} className="gl-player-journal__saved" />
          </>
        )}
      </p>

      {ed.saveError || ed.autoSaveError ? (
        <p className="gl-error">{ed.saveError || ed.autoSaveError}</p>
      ) : null}

      <div className="gl-player-journal__toolbar gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={() => ed.setEmbedPickerOpen(true)}>
          Insérer un élément
        </GLButton>
        <label
          className="gl-btn gl-btn--secondary"
          style={{ cursor: ed.uploading ? 'wait' : 'pointer' }}
        >
          {ed.uploading ? 'Envoi…' : 'Ajouter une image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={ed.uploading || ed.assetsFull}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              ed.handleImageUpload(file);
            }}
          />
        </label>
        <GLButton type="button" variant="secondary" onClick={() => ed.setShowPreview((v) => !v)}>
          {ed.showPreview ? 'Masquer l’aperçu' : 'Aperçu'}
        </GLButton>
      </div>

      <textarea
        ref={ed.textareaRef}
        className="gl-player-journal__textarea"
        rows={10}
        value={ed.body}
        onChange={(e) => ed.handleBodyChange(e.target.value)}
        placeholder="Écris ici, ou publie simplement des images…"
        aria-label="Contenu de l’article"
      />

      {ed.showPreview && ed.previewHtml ? (
        <div className="gl-player-journal__preview">
          <h3>Aperçu</h3>
          <div className="gl-markdown" dangerouslySetInnerHTML={{ __html: hydratedPreview }} />
        </div>
      ) : null}

      {ed.assets.length > 0 ? (
        <details className="gl-player-journal__assets">
          <summary>Illustrations de l’article ({ed.assets.length})</summary>
          <ul>
            {ed.assets.map((asset) => (
              <li key={asset.id}>
                <img
                  src={asset.url}
                  alt=""
                  loading="lazy"
                  className="gl-player-journal__asset-thumb"
                />
                <GLButton
                  type="button"
                  variant="secondary"
                  onClick={() => ed.removeAsset(asset.id)}
                >
                  Supprimer
                </GLButton>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <GLPlayerJournalEmbedPicker
        open={ed.embedPickerOpen}
        onClose={() => ed.setEmbedPickerOpen(false)}
        onInsert={ed.insertEmbed}
        chapterSpells={chapterSpells}
      />
    </article>
  );
}
