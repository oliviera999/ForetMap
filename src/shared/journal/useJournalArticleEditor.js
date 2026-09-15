import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppDialogs } from '../components/AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../hooks/useDebouncedAutoSave.js';
import {
  applyJournalEmbed,
  applyMarkdownHtmlImage,
  renderMarkdownToSafeHtml,
} from '../platform/markdown.js';
import { compressImageWithPreset, isLikelyImageFile } from '../platform/image.js';

/**
 * Éditeur d'un article de carnet — toute la logique, aucun rendu : titre et corps auto-
 * enregistrés, illustrations (ajout compressé, retrait), insertion d'encarts à la position
 * du curseur, aperçu Markdown, états « suppression » / « épinglage ». Les deux produits en
 * portaient chacun une copie (audit 2026-09-13, §4.5) ; la carte produit ne garde que son
 * habillage et ses champs propres (zone côté ForetMap, sorts du chapitre côté G&L).
 *
 * @param {object} params
 * @param {object} params.article
 * @param {{ maxChars?: number, maxAssets?: number }} [params.limits]
 * @param {import('./journalAdapter.js').JournalAdapter} params.adapter
 * @param {object} [params.extraValue] champs produit joints à l'auto-save et au `PUT` (ex. `{ zoneId }`)
 * @param {(saved: object) => void} [params.onSaved] reçoit l'article renvoyé par le serveur
 * @param {(err: Error) => void} [params.onApiError] hook d'erreur produit (compte supprimé…)
 * @param {object} [params.embedOptions] options d'`applyJournalEmbed` (ex. `{ variant: 'fm' }`)
 * @param {(articleId: string|number) => Promise<unknown>} [params.onDelete]
 * @param {(articleId: string|number, pinned: boolean) => Promise<unknown>} [params.onTogglePin]
 */
export function useJournalArticleEditor({
  article,
  limits,
  adapter,
  extraValue = null,
  onSaved,
  onApiError,
  embedOptions,
  onDelete,
  onTogglePin,
}) {
  const { confirm } = useAppDialogs();
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

  // Sérialisation stable des champs produit : une même valeur ne relance pas l'auto-save.
  const extraKey = JSON.stringify(extraValue ?? null);
  const extraFields = useMemo(() => (extraValue ? { ...extraValue } : {}), [extraKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async () => {
    try {
      const data = await adapter.updateArticle(article.id, {
        title,
        bodyMarkdown: body,
        ...extraFields,
      });
      const saved = data?.article;
      const nextTitle = saved?.title ?? title;
      const nextBody = typeof saved?.bodyMarkdown === 'string' ? saved.bodyMarkdown : body;
      setTitle(nextTitle);
      setBody(nextBody);
      if (saved?.usage) setUsage(saved.usage);
      if (Array.isArray(saved?.assets)) setAssets(saved.assets);
      if (saved?.updatedAt) setUpdatedAt(saved.updatedAt);
      if (saved) onSaved?.(saved);
      return { title: nextTitle, body: nextBody, ...extraFields };
    } catch (err) {
      onApiError?.(err);
      throw err;
    }
  }, [adapter, article.id, title, body, extraFields, onSaved, onApiError]);

  const autoSaveValue = useMemo(
    () => ({ title, body, ...extraFields }),
    [title, body, extraFields],
  );

  const { status: saveStatus, error: autoSaveError } = useDebouncedAutoSave({
    value: autoSaveValue,
    resetKey: article.id,
    canSave: () => {
      if (charsOver) return `Texte trop long (${charCount} / ${maxChars} caractères)`;
      return true;
    },
    onSave: persist,
  });

  const handleBodyChange = useCallback(
    (next) => {
      setBody(next);
      if (autoSaveError) setSaveError('');
    },
    [autoSaveError],
  );

  /** Remplace la sélection courante du textarea et y ramène le curseur. */
  const applyAtSelection = useCallback(
    (transform) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? start;
      const result = transform(body, start, end);
      handleBodyChange(result.value);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [body, handleBodyChange],
  );

  const handleImageUpload = useCallback(
    async (file) => {
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
        const saved = await adapter.addArticleAsset(article.id, mediaData);
        const url = String(saved?.asset?.url || '').trim();
        if (!url) throw new Error('URL illustration manquante');
        applyAtSelection((value, start, end) =>
          applyMarkdownHtmlImage(value, start, end, url, file.name || 'Illustration', null),
        );
        setUsage((u) => ({
          ...u,
          assetCount: saved?.usage?.assetCount ?? (u.assetCount || 0) + 1,
        }));
        if (saved?.asset) setAssets((prev) => [...prev, saved.asset]);
      } catch (err) {
        onApiError?.(err);
        setSaveError(err.message || 'Import image impossible');
      } finally {
        setUploading(false);
      }
    },
    [adapter, article.id, assetsFull, maxAssets, applyAtSelection, onApiError],
  );

  const insertEmbed = useCallback(
    (type, ref) => {
      applyAtSelection((value, start, end) =>
        applyJournalEmbed(value, start, end, type, ref, embedOptions),
      );
    },
    [applyAtSelection, embedOptions],
  );

  const removeAsset = useCallback(
    async (assetId) => {
      if (!(await confirm({ message: 'Supprimer cette illustration ?', danger: true }))) {
        return;
      }
      try {
        const res = await adapter.removeArticleAsset(article.id, assetId);
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        setUsage((u) => ({
          ...u,
          assetCount: res?.usage?.assetCount ?? Math.max(0, (u.assetCount || 0) - 1),
        }));
      } catch (err) {
        onApiError?.(err);
        setSaveError(err.message || 'Suppression impossible');
      }
    },
    [adapter, article.id, onApiError, confirm],
  );

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    if (
      !(await confirm({
        message: 'Supprimer cet article ? Cette action est définitive.',
        danger: true,
      }))
    ) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete?.(article.id);
    } finally {
      setDeleting(false);
    }
  }, [deleting, onDelete, article.id, confirm]);

  const handleTogglePin = useCallback(async () => {
    if (pinning) return;
    setPinning(true);
    try {
      await onTogglePin?.(article.id, !pinned);
    } finally {
      setPinning(false);
    }
  }, [pinning, onTogglePin, article.id, pinned]);

  return {
    textareaRef,
    title,
    setTitle,
    body,
    handleBodyChange,
    assets,
    usage,
    updatedAt,
    saveError,
    autoSaveError,
    saveStatus,
    uploading,
    showPreview,
    setShowPreview,
    embedPickerOpen,
    setEmbedPickerOpen,
    deleting,
    pinning,
    pinned,
    maxChars,
    maxAssets,
    charCount,
    charsOver,
    assetsFull,
    previewHtml,
    handleImageUpload,
    insertEmbed,
    removeAsset,
    handleDelete,
    handleTogglePin,
  };
}
