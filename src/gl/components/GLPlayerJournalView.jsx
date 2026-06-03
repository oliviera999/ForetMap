import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import {
  applyJournalEmbed,
  applyMarkdownHtmlImage,
  renderMarkdownToSafeHtml,
} from '../../utils/markdown.js';
import { compressImageWithPreset, isLikelyImageFile } from '../../utils/image.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLPlayerJournalEmbedPicker } from './GLPlayerJournalEmbedPicker.jsx';
import { GLHelpPanel } from './GLHelpPanel.jsx';

function formatQuota(current, max) {
  return `${Number(current || 0).toLocaleString('fr-FR')} / ${Number(max || 0).toLocaleString('fr-FR')}`;
}

export function GLPlayerJournalView({ gameState }) {
  const textareaRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [body, setBody] = useState('');
  const [limits, setLimits] = useState({ maxChars: 20000, maxAssets: 30 });
  const [usage, setUsage] = useState({ charCount: 0, assetCount: 0 });
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [embedPickerOpen, setEmbedPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const chapterSpells = useMemo(() => {
    const rows = Array.isArray(gameState?.game?.chapter_spells) ? gameState.game.chapter_spells : [];
    return rows.map((r) => String(r.spell_code || r.spellCode || '').trim()).filter(Boolean);
  }, [gameState?.game?.chapter_spells]);

  const charCount = useMemo(() => [...body].length, [body]);
  const charsOver = charCount > limits.maxChars;
  const assetsOver = usage.assetCount > limits.maxAssets;

  const previewHtml = useMemo(() => {
    if (!showPreview || !body.trim()) return '';
    return renderMarkdownToSafeHtml(body, { allowImages: true, allowJournalEmbeds: true });
  }, [body, showPreview]);

  const reload = useCallback(async () => {
    setLoading(true);
    setSaveError('');
    try {
      const data = await apiGL('/api/gl/player-journal/me');
      setBody(String(data?.bodyMarkdown || ''));
      setLimits(data?.limits || { maxChars: 20000, maxAssets: 30 });
      setUsage(data?.usage || { charCount: 0, assetCount: 0 });
      setAssets(Array.isArray(data?.assets) ? data.assets : []);
    } catch (err) {
      setSaveError(err.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(async (markdown) => {
    if (charsOver) {
      setSaveError(`Texte trop long (${charCount} / ${limits.maxChars} caractères)`);
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const data = await apiGL('/api/gl/player-journal/me', 'PUT', { bodyMarkdown: markdown });
      setBody(String(data?.bodyMarkdown || markdown));
      setLimits(data?.limits || limits);
      setUsage(data?.usage || usage);
      setAssets(Array.isArray(data?.assets) ? data.assets : []);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    } catch (err) {
      setSaveError(err.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [charCount, charsOver, limits, usage]);

  const scheduleSave = useCallback((markdown) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persist(markdown);
    }, 800);
  }, [persist]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  function handleBodyChange(next) {
    setBody(next);
    if (!charsOver) scheduleSave(next);
  }

  async function handleImageUpload(file) {
    if (!file || !isLikelyImageFile(file)) {
      setSaveError('Format d’image non reconnu (JPEG, PNG ou WebP).');
      return;
    }
    if (usage.assetCount >= limits.maxAssets) {
      setSaveError(`Nombre maximum d’illustrations atteint (${limits.maxAssets}).`);
      return;
    }
    setUploading(true);
    setSaveError('');
    try {
      const mediaData = await compressImageWithPreset(file, 'glInline');
      const saved = await apiGL('/api/gl/player-journal/me/assets', 'POST', { imageData: mediaData });
      const url = String(saved?.asset?.url || '').trim();
      if (!url) throw new Error('URL illustration manquante');
      const el = textareaRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? start;
      const result = applyMarkdownHtmlImage(body, start, end, url, file.name || 'Illustration', null);
      handleBodyChange(result.value);
      setUsage((u) => ({
        ...u,
        assetCount: saved?.usage?.assetCount ?? u.assetCount + 1,
      }));
      if (saved?.asset) {
        setAssets((prev) => [...prev, saved.asset]);
      }
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
      const res = await apiGL(`/api/gl/player-journal/me/assets/${assetId}`, 'DELETE');
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setUsage((u) => ({
        ...u,
        assetCount: res?.usage?.assetCount ?? Math.max(0, u.assetCount - 1),
      }));
    } catch (err) {
      setSaveError(err.message || 'Suppression impossible');
    }
  }

  if (loading) {
    return (
      <section className="gl-panel gl-player-journal">
        <h2>Mon journal</h2>
        <p className="gl-hint">Chargement de ton carnet…</p>
      </section>
    );
  }

  return (
    <section className="gl-panel gl-player-journal fade-in">
      <header className="gl-player-journal__header">
        <div>
          <h2>Mon journal</h2>
          <p className="gl-hint gl-player-journal__intro">
            Ton carnet personnel : notes libres, illustrations et rappels de sorts, espèces ou termes
            du glossaire. Tu peux le modifier à tout moment. Le maître du jeu peut le consulter pour
            t’accompagner (recette, pas pour noter).
          </p>
        </div>
      </header>

      <GLHelpPanel helpKey="tab:my-journal" title="Aide — Mon journal" defaultOpen={false}>
        <ul className="gl-help-list">
          <li>Le texte accepte le <strong>markdown</strong> (titres, listes, liens).</li>
          <li><strong>Illustration</strong> : bouton « Ajouter une image » (compte dans le quota).</li>
          <li><strong>Encart</strong> : référence un sort, une espèce, un terme ou un chapitre du site.</li>
          <li>La sauvegarde est <strong>automatique</strong> après une courte pause de frappe.</li>
        </ul>
      </GLHelpPanel>

      <div className="gl-player-journal__quotas" aria-live="polite">
        <span className={charsOver ? 'gl-player-journal__quota is-over' : 'gl-player-journal__quota'}>
          Caractères&nbsp;: {formatQuota(charCount, limits.maxChars)}
        </span>
        <span className={assetsOver ? 'gl-player-journal__quota is-over' : 'gl-player-journal__quota'}>
          Illustrations&nbsp;: {formatQuota(usage.assetCount, limits.maxAssets)}
        </span>
        {saving ? <span className="gl-hint">Enregistrement…</span> : null}
        {saveOk ? <span className="gl-hint gl-player-journal__saved">Enregistré ✓</span> : null}
      </div>

      {saveError ? <p className="gl-error">{saveError}</p> : null}

      <div className="gl-player-journal__toolbar gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={() => setEmbedPickerOpen(true)}>
          Insérer un élément
        </GLButton>
        <label className="gl-btn gl-btn--secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? 'Envoi…' : 'Ajouter une image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={uploading || usage.assetCount >= limits.maxAssets}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              handleImageUpload(file);
            }}
          />
        </label>
        <GLButton
          type="button"
          variant="secondary"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? 'Masquer l’aperçu' : 'Aperçu'}
        </GLButton>
        <GLButton
          type="button"
          onClick={() => persist(body)}
          disabled={saving || charsOver}
        >
          Enregistrer
        </GLButton>
      </div>

      <label className="gl-player-journal__editor-label" htmlFor="gl-player-journal-body">
        Contenu du carnet
        <textarea
          id="gl-player-journal-body"
          ref={textareaRef}
          className="gl-player-journal__textarea"
          rows={16}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="Écris ici tes notes, souvenirs de partie, sorts préférés…"
          aria-describedby="gl-player-journal-quotas-hint"
        />
      </label>
      <p id="gl-player-journal-quotas-hint" className="gl-hint">
        Les images doivent être ajoutées via le bouton dédié pour respecter le quota d’illustrations.
      </p>

      {showPreview && previewHtml ? (
        <div className="gl-player-journal__preview">
          <h3>Aperçu</h3>
          <div
            className="gl-markdown"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      ) : null}

      {assets.length > 0 ? (
        <details className="gl-player-journal__assets">
          <summary>Mes illustrations ({assets.length})</summary>
          <ul>
            {assets.map((asset) => (
              <li key={asset.id}>
                <img src={asset.url} alt="" loading="lazy" className="gl-player-journal__asset-thumb" />
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
    </section>
  );
}
