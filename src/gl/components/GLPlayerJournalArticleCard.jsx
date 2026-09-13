import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { useJournalArticleEditor } from '../../shared/journal/useJournalArticleEditor.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalEmbedPicker } from './GLPlayerJournalEmbedPicker.jsx';
import { useGlJournalEmbedTitles } from '../hooks/useGlJournalEmbedTitles.js';
import { formatDateTime } from '../../shared/utils/formatDateTime.js';

/**
 * Éditeur d'un article de carnet : titre optionnel, texte markdown et/ou illustrations.
 * Logique dans `useJournalArticleEditor` (partagée avec ForetMap) ; ici l'habillage G&L et
 * le champ propre au produit — les sorts du chapitre proposés à l'insertion.
 */
export function GLPlayerJournalArticleCard({
  article,
  limits,
  chapterSpells = [],
  onDelete,
  onTogglePin,
}) {
  const ed = useJournalArticleEditor({
    article,
    limits,
    adapter: playerJournalAdapter,
    onDelete,
    onTogglePin,
  });
  const hydratedPreview = useGlJournalEmbedTitles(ed.previewHtml);

  return (
    <article
      className={`gl-panel gl-player-journal__article fade-in${ed.pinned ? ' is-pinned' : ''}`}
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
        {onTogglePin ? (
          <GLButton
            type="button"
            variant="secondary"
            onClick={ed.handleTogglePin}
            disabled={ed.pinning}
            aria-pressed={ed.pinned}
            aria-label={ed.pinned ? 'Désépingler l’article' : 'Épingler l’article'}
          >
            {ed.pinned ? '📌 Épinglé' : 'Épingler'}
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
        {ed.updatedAt ? <>Modifié le {formatDateTime(ed.updatedAt)}</> : null}
        {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
        {ed.maxChars > 0 ? (
          <>
            {' '}
            · {ed.charCount} / {ed.maxChars} caractères
          </>
        ) : null}
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
