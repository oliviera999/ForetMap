import { useCallback, useMemo, useState } from 'react';
import { AccountDeletedError } from '../../services/api';
import { userJournalAdapter } from '../../services/userJournalAdapter.js';
import { useJournalArticleEditor } from '../../shared/journal/useJournalArticleEditor.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useFmJournalEmbedTitles } from '../../hooks/useFmJournalEmbedTitles.js';
import { useAuthedHtmlImages } from '../../hooks/useAuthedHtmlImages.js';
import { AuthedImage } from '../AuthedImage.jsx';
import { UserJournalEmbedPicker } from './UserJournalEmbedPicker.jsx';
import { buildEditorMetaParts } from '../../shared/journal/journalArticleMeta.js';
import { JournalArticleReadCard } from '../../shared/journal/JournalArticleReadCard.jsx';
import { FM_JOURNAL_UI } from './journalUi.js';

const EMBED_OPTIONS = { variant: 'fm' };

/** Brouillon écrit sans réseau (`utils/journalDraftQueue.js`) : ce que l'élève doit savoir. */
function draftStatusLine(article) {
  if (!article?.local) return null;
  return article.offlineError
    ? `Pas encore envoyé : ${article.offlineError}`
    : 'Gardé sur l’appareil — partira tout seul au retour du réseau';
}

/**
 * Article du carnet ForetMap : lecture par défaut, édition sur demande.
 * Champ propre au produit — la zone. Un brouillon écrit sans réseau (`article.local`) le dit,
 * et n'est pas épinglable tant qu'il n'est pas envoyé.
 *
 * @param {import('../../shared/journal/journalAdapter.js').JournalAdapter} [adapter]
 *   adaptateur du fil (celui de `UserJournalView` tolère l'absence de réseau)
 */
export function UserJournalArticleCard({
  article,
  limits,
  zones = [],
  editing = false,
  onStartEdit = null,
  onStopEdit = null,
  onDelete,
  onTogglePin,
  onForceLogout,
  adapter = userJournalAdapter,
}) {
  const togglePin = article.local ? null : onTogglePin;
  if (!editing) {
    const metaLine = [article.zoneName || null, draftStatusLine(article)]
      .filter(Boolean)
      .join(' · ');
    return (
      <JournalArticleReadCard
        article={article}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        onEdit={onStartEdit}
        onDelete={onDelete}
        onTogglePin={togglePin}
        extraMetaLine={metaLine || null}
      />
    );
  }

  return (
    <UserJournalArticleEditor
      article={article}
      limits={limits}
      zones={zones}
      onDelete={onDelete}
      onTogglePin={togglePin}
      onForceLogout={onForceLogout}
      onStopEdit={onStopEdit}
      adapter={adapter}
    />
  );
}

function UserJournalArticleEditor({
  article,
  limits,
  zones = [],
  onDelete,
  onTogglePin,
  onForceLogout,
  onStopEdit = null,
  adapter = userJournalAdapter,
}) {
  const [zoneId, setZoneId] = useState(article.zoneId || '');
  const extraValue = useMemo(() => ({ zoneId: zoneId || null }), [zoneId]);
  const onSaved = useCallback((saved) => {
    if (saved?.zoneId !== undefined) setZoneId(saved.zoneId || '');
  }, []);
  const onApiError = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
    },
    [onForceLogout],
  );

  const ed = useJournalArticleEditor({
    article,
    limits,
    adapter,
    extraValue,
    onSaved,
    onApiError,
    embedOptions: EMBED_OPTIONS,
    onDelete,
    onTogglePin,
  });
  const hydratedPreview = useFmJournalEmbedTitles(ed.previewHtml);
  // Les illustrations sont servies derrière JWT : un `dangerouslySetInnerHTML` n'envoie
  // pas le Bearer, d'où la réécriture en URL blob.
  const previewWithImages = useAuthedHtmlImages(hydratedPreview);
  const metaParts = buildEditorMetaParts({
    updatedAt: ed.updatedAt,
    createdAt: article.createdAt,
    maxChars: ed.maxChars,
    charCount: ed.charCount,
  });

  return (
    <article
      className={`card fm-journal__article fade-in${ed.pinned ? ' is-pinned' : ''}`}
      data-testid="journal-article-edit"
    >
      <header className="fm-journal__article-head">
        <input
          type="text"
          className="fm-journal__article-title"
          value={ed.title}
          maxLength={255}
          onChange={(e) => ed.setTitle(e.target.value)}
          placeholder="Titre de l’article (optionnel)"
          aria-label="Titre de l’article"
        />
        {onStopEdit ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onStopEdit}
            aria-label="Terminer l’édition"
          >
            Terminer
          </button>
        ) : null}
        {onTogglePin ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={ed.handleTogglePin}
            disabled={ed.pinning}
            aria-pressed={ed.pinned}
            aria-label={ed.pinned ? 'Désépingler l’article' : 'Épingler l’article'}
          >
            {ed.pinned ? 'Épinglé' : 'Épingler'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={ed.handleDelete}
          disabled={ed.deleting}
          aria-label="Supprimer l’article"
        >
          {ed.deleting ? 'Suppression…' : 'Supprimer'}
        </button>
      </header>

      {zones.length > 0 ? (
        <label className="fm-journal-field">
          Zone (optionnel)
          <select value={zoneId || ''} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">— Aucune —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name || z.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <p className="hint fm-journal__article-meta">
        {metaParts.length ? metaParts.join(' · ') : null}{' '}
        <AutoSaveStatus status={ed.saveStatus} className="fm-journal__saved" />
      </p>

      {article.local ? (
        <p className="hint fm-journal__draft-status" role="status">
          {draftStatusLine(article)}
        </p>
      ) : null}

      {ed.saveError || ed.autoSaveError ? (
        <p className="auth-error">{ed.saveError || ed.autoSaveError}</p>
      ) : null}

      <div className="fm-journal__toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => ed.setEmbedPickerOpen(true)}
        >
          Insérer un élément
        </button>
        <label
          className="btn btn-secondary btn-sm"
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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => ed.setShowPreview((v) => !v)}
        >
          {ed.showPreview ? 'Masquer l’aperçu' : 'Aperçu'}
        </button>
      </div>

      <textarea
        ref={ed.textareaRef}
        className="fm-journal__textarea"
        rows={10}
        value={ed.body}
        onChange={(e) => ed.handleBodyChange(e.target.value)}
        placeholder="Écris ici, ou publie simplement des images…"
        aria-label="Contenu de l’article"
      />

      {ed.showPreview && ed.previewHtml ? (
        <div className="fm-journal__preview">
          <h3>Aperçu</h3>
          <div
            className="fm-journal-markdown"
            dangerouslySetInnerHTML={{ __html: previewWithImages }}
          />
        </div>
      ) : null}

      {ed.assets.length > 0 ? (
        <details className="fm-journal__assets">
          <summary>Illustrations ({ed.assets.length})</summary>
          <ul>
            {ed.assets.map((asset) => (
              <li key={asset.id}>
                <AuthedImage
                  src={asset.url}
                  alt=""
                  loading="lazy"
                  className="fm-journal__asset-thumb"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => ed.removeAsset(asset.id)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <UserJournalEmbedPicker
        open={ed.embedPickerOpen}
        onClose={() => ed.setEmbedPickerOpen(false)}
        onInsert={ed.insertEmbed}
      />
    </article>
  );
}
