import { useCallback, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import {
  applyJournalEmbed,
  applyMarkdownHtmlImage,
  renderMarkdownToSafeHtml,
} from '../../shared/platform/markdown.js';
import { compressImageWithPreset, isLikelyImageFile } from '../../shared/platform/image.js';
import { useFmJournalEmbedTitles } from '../../hooks/useFmJournalEmbedTitles.js';
import { UserJournalEmbedPicker } from './UserJournalEmbedPicker.jsx';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

export function UserJournalArticleCard({
  article,
  limits,
  zones = [],
  onDelete,
  onTogglePin,
  onForceLogout,
}) {
  const textareaRef = useRef(null);
  const [title, setTitle] = useState(article.title || '');
  const [body, setBody] = useState(article.bodyMarkdown || '');
  const [zoneId, setZoneId] = useState(article.zoneId || '');
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
  const hydratedPreview = useFmJournalEmbedTitles(previewHtml);

  const handleApiError = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      throw err;
    },
    [onForceLogout],
  );

  const persist = useCallback(async () => {
    try {
      const data = await api(`/api/user-journal/me/articles/${article.id}`, 'PUT', {
        title,
        bodyMarkdown: body,
        zoneId: zoneId || null,
      });
      const saved = data?.article;
      const nextTitle = saved?.title ?? title;
      const nextBody = typeof saved?.bodyMarkdown === 'string' ? saved.bodyMarkdown : body;
      setTitle(nextTitle);
      setBody(nextBody);
      if (saved?.zoneId !== undefined) setZoneId(saved.zoneId || '');
      if (saved?.usage) setUsage(saved.usage);
      if (Array.isArray(saved?.assets)) setAssets(saved.assets);
      if (saved?.updatedAt) setUpdatedAt(saved.updatedAt);
      return { title: nextTitle, body: nextBody, zoneId };
    } catch (err) {
      handleApiError(err);
      return undefined;
    }
  }, [article.id, title, body, zoneId, handleApiError]);

  const autoSaveValue = useMemo(() => ({ title, body, zoneId }), [title, body, zoneId]);

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
      const saved = await api(`/api/user-journal/me/articles/${article.id}/assets`, 'POST', {
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
      if (err instanceof AccountDeletedError) onForceLogout?.();
      setSaveError(err.message || 'Import image impossible');
    } finally {
      setUploading(false);
    }
  }

  function insertEmbed(type, ref) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const result = applyJournalEmbed(body, start, end, type, ref, { variant: 'fm' });
    handleBodyChange(result.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  async function removeAsset(assetId) {
    try {
      const res = await api(
        `/api/user-journal/me/articles/${article.id}/assets/${assetId}`,
        'DELETE',
      );
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setUsage((u) => ({
        ...u,
        assetCount: res?.usage?.assetCount ?? Math.max(0, (u.assetCount || 0) - 1),
      }));
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      setSaveError(err.message || 'Suppression impossible');
    }
  }

  return (
    <article className={`card fm-journal__article fade-in${pinned ? ' is-pinned' : ''}`}>
      <header className="fm-journal__article-head">
        <input
          type="text"
          className="fm-journal__article-title"
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de l’article (optionnel)"
          aria-label="Titre de l’article"
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            if (pinning) return;
            setPinning(true);
            try {
              await onTogglePin?.(article.id, !pinned);
            } finally {
              setPinning(false);
            }
          }}
          disabled={pinning}
          aria-pressed={pinned}
        >
          {pinned ? '📌 Épinglé' : 'Épingler'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            if (deleting) return;
            setDeleting(true);
            try {
              await onDelete?.(article.id);
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
        >
          {deleting ? 'Suppression…' : 'Supprimer'}
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
        {updatedAt ? <>Modifié le {formatDateTime(updatedAt)}</> : null}
        {article.createdAt ? <> · créé le {formatDateTime(article.createdAt)}</> : null}
        {article.zoneName ? <> · {article.zoneName}</> : null}{' '}
        <AutoSaveStatus status={saveStatus} className="fm-journal__saved" />
      </p>

      {saveError || autoSaveError ? (
        <p className="auth-error">{saveError || autoSaveError}</p>
      ) : null}

      <div className="fm-journal__toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setEmbedPickerOpen(true)}
        >
          Insérer un élément
        </button>
        <label
          className="btn btn-secondary btn-sm"
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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? 'Masquer l’aperçu' : 'Aperçu'}
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="fm-journal__textarea"
        rows={10}
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
        placeholder="Écris ici, ou publie simplement des images…"
        aria-label="Contenu de l’article"
      />

      {showPreview && previewHtml ? (
        <div className="fm-journal__preview">
          <h3>Aperçu</h3>
          <div
            className="fm-journal-markdown"
            dangerouslySetInnerHTML={{ __html: hydratedPreview }}
          />
        </div>
      ) : null}

      {assets.length > 0 ? (
        <details className="fm-journal__assets">
          <summary>Illustrations ({assets.length})</summary>
          <ul>
            {assets.map((asset) => (
              <li key={asset.id}>
                <img src={asset.url} alt="" loading="lazy" className="fm-journal__asset-thumb" />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeAsset(asset.id)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <UserJournalEmbedPicker
        open={embedPickerOpen}
        onClose={() => setEmbedPickerOpen(false)}
        onInsert={insertEmbed}
      />
    </article>
  );
}
