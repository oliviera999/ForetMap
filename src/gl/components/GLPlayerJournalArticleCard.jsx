import React, { useCallback, useMemo, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import {
  applyJournalEmbed,
  applyMarkdownHtmlImage,
  renderMarkdownToSafeHtml,
} from '../../utils/markdown.js';
import { compressImageWithPreset, isLikelyImageFile } from '../../utils/image.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalEmbedPicker } from './GLPlayerJournalEmbedPicker.jsx';
import { useGlJournalEmbedTitles } from '../hooks/useGlJournalEmbedTitles.js';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

/**
 * Éditeur d'un article de carnet : titre optionnel, texte markdown et/ou
 * illustrations. Auto-save (titre + corps) par article, ajout/retrait de médias,
 * insertion d'encarts (sorts / espèces / glossaire / chapitre).
 */
export function GLPlayerJournalArticleCard({
  article,
  limits,
  chapterSpells = [],
  onDelete,
  onTogglePin,
}) {
  const textareaRef = useRef(null);
  const [title, setTitle] = useState(article.title || '');
  const [body, setBody] = useState(article.bodyMarkdown || '');
  const [assets, setAssets] = useState(Array.isArray(article.assets) ? article.assets : []);
  const [usage, setUsage] = useState(article.usage || { charCount: 0, assetCount: 0 });
  const [updatedAt, setUpdatedAt] = useState(article.updatedAt || null);
  const [saveError, setSaveError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [embedPickerOpen, setEmbedPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const pinned = !!article.pinned;

  const maxChars = Number(limits?.maxChars) || 0;
  const maxAssets = Number(limits?.maxAssets) || 0;

  const charCount = useMemo(() => [...body].length, [body]);
  const charsOver = maxChars > 0 && charCount > maxChars;
  const assetsFull = maxAssets > 0 && (usage.assetCount || 0) >= maxAssets;

  const previewHtml = useMemo(() => {
    if (!showPreview || !body.trim()) return '';
    return renderMarkdownToSafeHtml(body, { allowImages: true, allowJournalEmbeds: true });
  }, [body, showPreview]);
  const hydratedPreview = useGlJournalEmbedTitles(previewHtml);

  const persist = useCallback(async () => {
    const data = await apiGL(`/api/gl/player-journal/me/articles/${article.id}`, 'PUT', {
      title,
      bodyMarkdown: body,
    });
    const saved = data?.article;
    const nextTitle = saved?.title ?? title;
    const nextBody = typeof saved?.bodyMarkdown === 'string' ? saved.bodyMarkdown : body;
    setTitle(nextTitle);
    setBody(nextBody);
    if (saved?.usage) setUsage(saved.usage);
    if (Array.isArray(saved?.assets)) setAssets(saved.assets);
    if (saved?.updatedAt) setUpdatedAt(saved.updatedAt);
    return { title: nextTitle, body: nextBody };
  }, [article.id, title, body]);

  const autoSaveValue = useMemo(() => ({ title, body }), [title, body]);

  const { status: saveStatus, error: autoSaveError } = useDebouncedAutoSave({
    value: autoSaveValue,
    resetKey: article.id,
    canSave: () => {
      if (charsOver) return `Texte trop long (${charCount} / ${maxChars} caractères)`;
      return true;
    },
    onSave: persist,
  });

  function handleBodyChange(next) {
    setBody(next);
    if (autoSaveError) setSaveError('');
  }

  async function handleImageUpload(file) {
    if (!file || !isLikelyImageFile(file)) {
      setSaveError('Format d’image non reconnu (JPEG, PNG ou WebP).');
      return;
    }
    if (assetsFull) {
      setSaveError(`Nombre maximum d’illustrations atteint (${maxAssets}).`);
      return;
    }
    setUploading(true);
    setSaveError('');
    try {
      const mediaData = await compressImageWithPreset(file, 'glInline');
      const saved = await apiGL(`/api/gl/player-journal/me/articles/${article.id}/assets`, 'POST', {
        imageData: mediaData,
      });
      const url = String(saved?.asset?.url || '').trim();
      if (!url) throw new Error('URL illustration manquante');
      const el = textareaRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? start;
      const result = applyMarkdownHtmlImage(
        body,
        start,
        end,
        url,
        file.name || 'Illustration',
        null,
      );
      handleBodyChange(result.value);
      setUsage((u) => ({ ...u, assetCount: saved?.usage?.assetCount ?? (u.assetCount || 0) + 1 }));
      if (saved?.asset) setAssets((prev) => [...prev, saved.asset]);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    } catch (err) {
      setSaveError(err.message || 'Import image impossible');
    } finally {
      setUploading(false);
    }
  }

  function insertEmbed(type, ref) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const result = applyJournalEmbed(body, start, end, type, ref);
    handleBodyChange(result.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  async function removeAsset(assetId) {
    try {
      const res = await apiGL(
        `/api/gl/player-journal/me/articles/${article.id}/assets/${assetId}`,
        'DELETE',
      );
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setUsage((u) => ({
        ...u,
        assetCount: res?.usage?.assetCount ?? Math.max(0, (u.assetCount || 0) - 1),
      }));
    } catch (err) {
      setSaveError(err.message || 'Suppression impossible');
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete?.(article.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleTogglePin() {
    if (pinning) return;
    setPinning(true);
    try {
      await onTogglePin?.(article.id, !pinned);
    } finally {
      setPinning(false);
    }
  }

  return (
    <article className={`gl-panel gl-player-journal__article fade-in${pinned ? ' is-pinned' : ''}`}>
      <header className="gl-player-journal__article-head">
        <input
          type="text"
          className="gl-player-journal__article-title"
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de l’article (optionnel)"
          aria-label="Titre de l’article"
        />
        {onTogglePin ? (
          <GLButton
            type="button"
            variant="secondary"
            onClick={handleTogglePin}
            disabled={pinning}
            aria-pressed={pinned}
            aria-label={pinned ? 'Désépingler l’article' : 'Épingler l’article'}
          >
            {pinned ? '📌 Épinglé' : 'Épingler'}
          </GLButton>
        ) : null}
        <GLButton
          type="button"
          variant="secondary"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Supprimer l’article"
        >
          {deleting ? 'Suppression…' : 'Supprimer'}
        </GLButton>
      </header>

      <p className="gl-hint gl-player-journal__article-meta">
        {updatedAt ? <>Modifié le {formatDateTime(updatedAt)}</> : null}
        {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
        {maxChars > 0 ? (
          <>
            {' '}
            · {charCount} / {maxChars} caractères
          </>
        ) : null}
        {saveStatus === 'saving' || saveStatus === 'pending' ? (
          <> · Enregistrement…</>
        ) : (
          <>
            {' '}
            <AutoSaveStatus status={saveStatus} className="gl-player-journal__saved" />
          </>
        )}
      </p>

      {saveError || autoSaveError ? <p className="gl-error">{saveError || autoSaveError}</p> : null}

      <div className="gl-player-journal__toolbar gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={() => setEmbedPickerOpen(true)}>
          Insérer un élément
        </GLButton>
        <label
          className="gl-btn gl-btn--secondary"
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? 'Envoi…' : 'Ajouter une image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={uploading || assetsFull}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              handleImageUpload(file);
            }}
          />
        </label>
        <GLButton type="button" variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Masquer l’aperçu' : 'Aperçu'}
        </GLButton>
      </div>

      <textarea
        ref={textareaRef}
        className="gl-player-journal__textarea"
        rows={10}
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
        placeholder="Écris ici, ou publie simplement des images…"
        aria-label="Contenu de l’article"
      />

      {showPreview && previewHtml ? (
        <div className="gl-player-journal__preview">
          <h3>Aperçu</h3>
          <div className="gl-markdown" dangerouslySetInnerHTML={{ __html: hydratedPreview }} />
        </div>
      ) : null}

      {assets.length > 0 ? (
        <details className="gl-player-journal__assets">
          <summary>Illustrations de l’article ({assets.length})</summary>
          <ul>
            {assets.map((asset) => (
              <li key={asset.id}>
                <img
                  src={asset.url}
                  alt=""
                  loading="lazy"
                  className="gl-player-journal__asset-thumb"
                />
                <GLButton type="button" variant="secondary" onClick={() => removeAsset(asset.id)}>
                  Supprimer
                </GLButton>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <GLPlayerJournalEmbedPicker
        open={embedPickerOpen}
        onClose={() => setEmbedPickerOpen(false)}
        onInsert={insertEmbed}
        chapterSpells={chapterSpells}
      />
    </article>
  );
}
