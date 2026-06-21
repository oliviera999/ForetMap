import React, { useId, useRef, useState } from 'react';
import { DialogShell } from '../components/DialogShell.jsx';
import { api } from '../../services/api.js';
import { apiGL } from '../../gl/services/apiGL.js';

/**
 * Modale d'import ZIP pack mascotte (visite ou GL).
 * @param {{
 *   open: boolean,
 *   variant: 'visit' | 'gl',
 *   mapId?: string,
 *   chapterId?: number | null,
 *   targetPackId?: string | number | null,
 *   targetPackLabel?: string,
 *   onClose: () => void,
 *   onImported: (result: Record<string, unknown>) => void,
 * }} props
 */
export default function MascotPackArchiveImportDialog({
  open,
  variant,
  mapId = '',
  chapterId = null,
  targetPackId = null,
  targetPackLabel = '',
  onClose,
  onImported,
}) {
  const titleId = useId();
  const fileRef = useRef(null);
  const [mode, setMode] = useState('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);

  const analyzePath =
    variant === 'gl'
      ? '/api/gl/mascots/packs/import/analyze'
      : '/api/visit/mascot-packs/import/analyze';
  const importPath =
    variant === 'gl' ? '/api/gl/mascots/packs/import' : '/api/visit/mascot-packs/import';

  const reset = () => {
    setError('');
    setAnalysis(null);
    setMode('create');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error('Lecture fichier impossible'));
      reader.readAsDataURL(file);
    });

  const buildArchivePayload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error('Sélectionnez un fichier .zip');
    if (!/\.zip$/i.test(file.name)) throw new Error('Le fichier doit être une archive .zip');
    const fileDataBase64 = await readFileAsBase64(file);
    return { fileName: file.name, fileDataBase64 };
  };

  const onAnalyze = async () => {
    setBusy(true);
    setError('');
    setAnalysis(null);
    try {
      const archive = await buildArchivePayload();
      const call = variant === 'gl' ? apiGL : api;
      const body = { archive };
      const result = await call(analyzePath, 'POST', body);
      setAnalysis(result);
      if (result?.ok === false) {
        setError('Archive lisible mais pack invalide — corrigez la source avant import.');
      }
    } catch (e) {
      setError(e.message || 'Analyse impossible');
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    setError('');
    try {
      const archive = await buildArchivePayload();
      const call = variant === 'gl' ? apiGL : api;
      const body = {
        mode,
        archive,
      };
      if (variant === 'visit') {
        body.map_id = String(mapId || '').trim();
        if (mode === 'replace' && targetPackId) body.target_pack_id = String(targetPackId);
      } else {
        if (chapterId != null) body.chapterId = chapterId;
        if (mode === 'replace' && targetPackId != null) body.target_pack_id = Number(targetPackId);
      }
      const result = await call(importPath, 'POST', body);
      onImported(result);
      reset();
      onClose();
    } catch (e) {
      setError(e.message || 'Import impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const canReplace = Boolean(targetPackId);
  const warnings = Array.isArray(analysis?.warnings) ? analysis.warnings : [];

  return (
    <DialogShell open={open} onClose={handleClose} ariaLabelledBy={titleId}>
      <div className="dialog-panel" style={{ maxWidth: 480 }}>
        <h3 id={titleId}>Importer un pack mascotte (ZIP)</h3>
        <p className="section-sub" style={{ fontSize: '0.85rem' }}>
          Archive portable ForetMap (JSON + images). Analysez d’abord pour vérifier le contenu.
        </p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="section-sub" style={{ display: 'block', marginBottom: 4 }}>
            Fichier .zip
          </span>
          <input ref={fileRef} type="file" accept=".zip,application/zip" disabled={busy} />
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
          <legend className="section-sub" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
            Mode d’import
          </legend>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <input
              type="radio"
              name="mascot-import-mode"
              value="create"
              checked={mode === 'create'}
              disabled={busy}
              onChange={() => setMode('create')}
            />{' '}
            Nouveau brouillon
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="radio"
              name="mascot-import-mode"
              value="replace"
              checked={mode === 'replace'}
              disabled={busy || !canReplace}
              onChange={() => setMode('replace')}
            />{' '}
            Remplacer le pack sélectionné
            {canReplace ? (
              <span className="section-sub"> ({targetPackLabel || targetPackId})</span>
            ) : (
              <span className="section-sub"> (sélectionnez un pack)</span>
            )}
          </label>
        </fieldset>
        {analysis ? (
          <div
            role="status"
            style={{
              fontSize: '0.82rem',
              marginBottom: 10,
              padding: 8,
              background: 'rgba(26,71,49,0.06)',
            }}
          >
            <p style={{ margin: '0 0 4px' }}>
              <strong>Analyse :</strong> {analysis.ok === false ? 'pack invalide' : 'prêt'}
              {' · '}
              {Number(analysis.assetCount) || 0} image(s)
              {analysis.label ? ` · ${analysis.label}` : ''}
              {analysis.name ? ` · ${analysis.name}` : ''}
            </p>
            {warnings.length > 0 ? (
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="text-danger" role="alert" style={{ fontSize: '0.85rem' }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={handleClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onAnalyze}
          >
            Analyser
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || analysis?.ok === false}
            onClick={onImport}
          >
            Importer
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
