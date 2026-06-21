import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { apiGLMultipart, formatBytesLabel } from '../../services/apiGLUpload.js';
import {
  ANALYZE_UPLOAD_CONCURRENCY,
  DEFAULT_CONTENT_LIBRARY_LIMITS,
  findSelectedSourceFile,
  mergeAnalyzeResponses,
  resolveSelectionMode,
  runPool,
  validateContentLibrarySelection,
} from '../../utils/contentLibraryClient.js';
import { MediaLibraryMenu } from '../../../components/MediaLibraryMenu.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLContentLibraryAuditPanel } from './GLContentLibraryAuditPanel.jsx';
import { GLContentLibraryAnalysisTable } from './GLContentLibraryAnalysisTable.jsx';
import {
  FILE_STATUS_LABEL,
  canUseClipboard,
  createFileRow,
  entryKey,
} from '../../utils/glContentLibraryDisplay.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

export function GLContentLibraryView({ onOpenSubTab }) {
  const fileInputRef = useRef(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [limits, setLimits] = useState(DEFAULT_CONTENT_LIBRARY_LIMITS);
  const [selectionWarnings, setSelectionWarnings] = useState([]);
  const [fileRows, setFileRows] = useState([]);
  const [archiveFile, setArchiveFile] = useState(null);
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [mediaReloadKey, setMediaReloadKey] = useState(0);
  const [auditReport, setAuditReport] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const selectedFiles = useMemo(() => fileRows.map((row) => row.file), [fileRows]);

  const applyableEntries = useMemo(
    () => analysisEntries.filter((entry) => entry.canApply && !entry.error),
    [analysisEntries],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGL('/api/gl/admin/content-library/limits');
        if (cancelled || !data) return;
        setLimits({
          maxArchiveBytes: data.maxArchiveBytes || DEFAULT_CONTENT_LIBRARY_LIMITS.maxArchiveBytes,
          maxFileBytes: data.maxFileBytes || DEFAULT_CONTENT_LIBRARY_LIMITS.maxFileBytes,
          maxDecompressedBytes:
            data.maxDecompressedBytes || DEFAULT_CONTENT_LIBRARY_LIMITS.maxDecompressedBytes,
          maxFileCount: data.maxFileCount || DEFAULT_CONTENT_LIBRARY_LIMITS.maxFileCount,
        });
      } catch (_) {
        /* constantes locales */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMediaLibrary = async () => {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  };

  const fetchMediaUsage = async () => {
    const data = await apiGL('/api/gl/admin/media-library/usage');
    return data && typeof data.usage === 'object' ? data.usage : {};
  };

  const uploadMediaLibrary = async (mediaData, options = {}) => {
    const saved = await apiGL('/api/gl/admin/media-library', 'POST', {
      media_data: mediaData,
      original_name: options.originalName || null,
    });
    const warnings = Array.isArray(saved?.assetWarnings)
      ? saved.assetWarnings.map((w) => w.message).filter(Boolean)
      : [];
    setMsg(
      warnings.length
        ? `Média ajouté à la bibliothèque — ⚠ ${warnings.join(' · ')}`
        : 'Média ajouté à la bibliothèque',
    );
  };

  const runConventionAudit = async () => {
    setAuditBusy(true);
    setErr('');
    try {
      const data = await apiGL('/api/gl/admin/media-library/audit');
      setAuditReport(data?.report || null);
    } catch (e) {
      setErr(e.message || 'Audit impossible');
    } finally {
      setAuditBusy(false);
    }
  };

  const deleteMediaLibrary = async (relativePath) => {
    await apiGL('/api/gl/admin/media-library', 'DELETE', { relative_path: relativePath });
    setMsg('Média supprimé de la bibliothèque');
  };

  const copyUrl = async (url) => {
    const mediaUrl = String(url || '').trim();
    if (!mediaUrl) return;
    setErr('');
    if (!canUseClipboard()) {
      setMsg(`URL du média : ${mediaUrl}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(mediaUrl);
      setMsg('URL du média copiée');
    } catch (e) {
      setErr(e.message || 'Copie impossible');
    }
  };

  function toggleEntry(key, checked) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function selectAllApplyable() {
    setSelectedKeys(
      new Set(
        applyableEntries.map((entry, index) => entryKey(entry, analysisEntries.indexOf(entry))),
      ),
    );
  }

  function updateFileRow(fileName, patch) {
    setFileRows((prev) =>
      prev.map((row) => (row.file.name === fileName ? { ...row, ...patch } : row)),
    );
  }

  async function analyzeArchive(zipFile) {
    updateFileRow(zipFile.name, { status: 'uploading', progress: 0, error: null });
    const formData = new FormData();
    formData.append('archive', zipFile, zipFile.name);
    setBusyLabel(`Envoi — ${zipFile.name}`);
    const data = await apiGLMultipart('/api/gl/admin/content-library/analyze', formData, {
      limits,
      onProgress: (percent) => {
        updateFileRow(zipFile.name, { status: 'uploading', progress: percent });
      },
    });
    updateFileRow(zipFile.name, { status: 'ok', progress: 100 });
    return data;
  }

  async function analyzeSingleFile(file, index, total) {
    updateFileRow(file.name, { status: 'uploading', progress: 0, error: null });
    const formData = new FormData();
    formData.append('files', file, file.name);
    setBusyLabel(`Envoi ${index + 1}/${total} — ${file.name}`);
    try {
      const data = await apiGLMultipart('/api/gl/admin/content-library/analyze', formData, {
        limits,
        onProgress: (percent) => {
          updateFileRow(file.name, { status: 'uploading', progress: percent });
        },
      });
      updateFileRow(file.name, { status: 'ok', progress: 100 });
      return data;
    } catch (e) {
      updateFileRow(file.name, {
        status: 'error',
        progress: 0,
        error: e.message || 'Analyse impossible',
      });
      throw e;
    }
  }

  async function runAnalyze() {
    const validation = validateContentLibrarySelection(selectedFiles, limits);
    setSelectionWarnings(validation.warnings);
    if (!validation.ok) {
      setErr(validation.errors.join(' · '));
      return;
    }

    const { mode, files, zipFile } = validation.resolved;
    setBusy(true);
    setErr('');
    setMsg('');
    setArchiveFile(zipFile);
    setAnalysisEntries([]);
    setSelectedKeys(new Set());

    try {
      let merged;
      if (mode === 'archive') {
        setBusyLabel(`Analyse — ${zipFile.name}`);
        merged = await analyzeArchive(zipFile);
      } else {
        setBusyLabel('Analyse des fichiers…');
        const responses = await runPool(files, ANALYZE_UPLOAD_CONCURRENCY, async (file, index) => {
          updateFileRow(file.name, { status: 'analyzing', progress: 100 });
          return analyzeSingleFile(file, index, files.length);
        });
        merged = mergeAnalyzeResponses(responses, files);
      }

      const entries = Array.isArray(merged?.entries) ? merged.entries : [];
      setAnalysisEntries(entries);
      const keys = new Set();
      entries.forEach((entry, index) => {
        if (entry.canApply && !entry.error) keys.add(entryKey(entry, index));
      });
      setSelectedKeys(keys);
      setMsg(
        `Analyse terminée : ${entries.length} fichier(s), ${merged?.summary?.applyable || 0} applicable(s).`,
      );
    } catch (e) {
      setErr(e.message || 'Analyse impossible');
      setAnalysisEntries([]);
      setSelectedKeys(new Set());
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function runApply() {
    if (selectedKeys.size === 0) {
      setErr('Sélectionnez au moins un fichier à appliquer');
      return;
    }

    setBusy(true);
    setErr('');
    setMsg('');

    try {
      const entries = [];
      const filesToSend = [];
      let applyIndex = 0;

      for (let index = 0; index < analysisEntries.length; index += 1) {
        const entry = analysisEntries[index];
        const key = entryKey(entry, index);
        if (!selectedKeys.has(key)) continue;
        applyIndex += 1;
        const sourceFileName = entry.sourceFileName || entry.fileName;
        entries.push({
          fileName: sourceFileName,
          kind: entry.kind,
          mimeType: entry.mimeType || null,
        });
        if (!archiveFile) {
          const sourceFile = findSelectedSourceFile(selectedFiles, entry);
          if (!sourceFile) {
            throw new Error(`Fichier source introuvable pour ${sourceFileName}`);
          }
          filesToSend.push(sourceFile);
        }
      }

      const formData = new FormData();
      formData.append('entries', JSON.stringify(entries));

      if (archiveFile) {
        formData.append('archive', archiveFile, archiveFile.name);
        setBusyLabel(`Application — archive ${archiveFile.name}`);
      } else {
        for (const file of filesToSend) {
          formData.append('files', file, file.name);
        }
        setBusyLabel(`Application ${applyIndex} fichier(s)…`);
      }

      const data = await apiGLMultipart('/api/gl/admin/content-library/apply', formData, {
        limits,
        onProgress: (percent) => {
          setBusyLabel(`${archiveFile ? 'Application archive' : 'Application'} — ${percent} %`);
        },
      });

      const applied = Number(data?.summary?.applied || 0);
      const failed = Number(data?.summary?.failed || 0);
      setMsg(`Application terminée : ${applied} réussi(s), ${failed} échec(s).`);
      if (applied > 0) setMediaReloadKey((value) => value + 1);

      const failedRows = (data?.results || []).filter((row) => !row.ok);
      if (failedRows.length > 0) {
        setAnalysisEntries((prev) =>
          prev.map((entry) => {
            const failed = failedRows.find((row) => row.fileName === entry.fileName);
            if (!failed) return entry;
            return { ...entry, error: failed.error || entry.error || 'Application impossible' };
          }),
        );
        const details = failedRows.map((row) => `${row.fileName}: ${row.error}`).join(' · ');
        setErr(details || 'Certains fichiers n’ont pas pu être importés');
      }
    } catch (e) {
      setErr(e.message || 'Application impossible');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  const limitsBanner = `ZIP jusqu'à ${formatBytesLabel(limits.maxArchiveBytes)} · fichier unitaire ${formatBytesLabel(limits.maxFileBytes)} · ${limits.maxFileCount} fichiers · analyse sans écriture BDD`;

  return (
    <div className="gl-content-library">
      <p className="gl-hint">
        Médiathèque Gnomes &amp; Licornes (images, audio, vidéo) et imports catalogue G&amp;L
        (XLSX). Cloisonnée : séparée de la médiathèque ForetMap. L’analyse classe les fichiers sans
        écrire en base ; l’application est explicite.
      </p>
      <p className="gl-content-library__limits-banner">{limitsBanner}</p>
      {err ? <p className="gl-error">{err}</p> : null}
      {msg ? <p className="gl-success">{msg}</p> : null}
      {busy && busyLabel ? <p className="gl-hint">{busyLabel}</p> : null}

      <section className="gl-content-library__section">
        <h3>Consulter</h3>
        <MediaLibraryMenu
          key={mediaReloadKey}
          title="Médiathèque Gnomes & Licornes (images, audio, vidéo)"
          fetchItems={fetchMediaLibrary}
          fetchUsage={fetchMediaUsage}
          uploadDataUrl={uploadMediaLibrary}
          removeItem={deleteMediaLibrary}
          onPickUrl={copyUrl}
          canUpload
          canRemove
          defaultOpen
          showToggle={false}
          layout="gallery"
          enableGalleryBulkActions
          manageHint="Clique sur une miniature pour copier l’URL. Chaque média indique s’il est utilisé et où. Cochez plusieurs médias pour les supprimer en lot, ou videz la bibliothèque si besoin."
        />
      </section>

      <GLContentLibraryAuditPanel
        report={auditReport}
        busy={auditBusy}
        onRun={runConventionAudit}
      />

      <section className="gl-content-library__section">
        <h3>Import en masse</h3>
        <div className="gl-content-library__dropzone">
          <p className="gl-hint">
            Déposez plusieurs fichiers ou une archive ZIP. Les médias iront dans la médiathèque ;
            les XLSX seront reconnus (espèces, glossaire, QCM, chapitres, carnet Sélène…).
          </p>
          <div className="gl-content-library__actions">
            <label className="btn btn-secondary btn-sm">
              Choisir fichiers ou ZIP
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*,.zip,.xlsx,.xls,.csv"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(event) => {
                  const next = Array.from(event.target.files || []);
                  const resolved = resolveSelectionMode(next);
                  setFileRows(resolved.files.map(createFileRow));
                  setArchiveFile(resolved.zipFile);
                  setSelectionWarnings(
                    resolved.ignoredCount > 0
                      ? [
                          `Archive ZIP détectée : les ${resolved.ignoredCount} autre(s) fichier(s) seront ignorés.`,
                        ]
                      : [],
                  );
                  setAnalysisEntries([]);
                  setSelectedKeys(new Set());
                  setErr('');
                  setMsg('');
                  event.target.value = '';
                }}
              />
            </label>
            <GLButton type="button" disabled={busy || fileRows.length === 0} onClick={runAnalyze}>
              Analyser
            </GLButton>
            <GLButton
              type="button"
              variant="primary"
              disabled={busy || selectedKeys.size === 0}
              onClick={runApply}
            >
              Appliquer la sélection
            </GLButton>
            <GLButton
              type="button"
              disabled={busy || applyableEntries.length === 0}
              onClick={selectAllApplyable}
            >
              Tout sélectionner (applicables)
            </GLButton>
          </div>
          {selectionWarnings.length > 0 ? (
            <ul className="gl-content-library__warnings">
              {selectionWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {fileRows.length > 0 ? (
            <ul className="gl-content-library__file-list">
              {fileRows.map((row) => (
                <li
                  key={`${row.file.name}-${row.file.size}`}
                  className="gl-content-library__file-item"
                >
                  <div className="gl-content-library__file-head">
                    <span>{row.file.name}</span>
                    <span className="gl-hint">
                      {formatBytesLabel(row.file.size)} ·{' '}
                      {FILE_STATUS_LABEL[row.status] || row.status}
                    </span>
                  </div>
                  {row.status === 'uploading' || row.status === 'analyzing' ? (
                    <div
                      className="gl-content-library__progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={row.progress}
                    >
                      <div
                        className="gl-content-library__progress-bar"
                        style={{ width: `${row.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {row.error ? <div className="gl-error">{row.error}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="gl-hint">Aucun fichier sélectionné.</p>
          )}
        </div>

        <GLContentLibraryAnalysisTable
          entries={analysisEntries}
          selectedKeys={selectedKeys}
          busy={busy}
          onToggle={toggleEntry}
          onOpenSubTab={onOpenSubTab}
        />
      </section>
    </div>
  );
}

export { TINY_PNG_DATA_URL };
