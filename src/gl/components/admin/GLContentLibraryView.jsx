import React, { useMemo, useRef, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { MediaLibraryMenu } from '../../../components/MediaLibraryMenu.jsx';
import { GLButton } from '../ui/GLButton.jsx';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function canUseClipboard() {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

function previewSummary(entry) {
  if (!entry?.preview) return '—';
  if (entry.kind === 'media') {
    return `${entry.preview.mediaType || 'média'} → ${entry.preview.relativePath || entry.preview.url || ''}`;
  }
  const totals = entry.preview;
  if (totals.valid != null) {
    return `${totals.valid}/${totals.received || '?'} ligne(s) valide(s)`;
  }
  if (totals.upserted != null) {
    return `${totals.upserted} élément(s) prêt(s)`;
  }
  if (totals.feuillets) {
    return `${totals.feuillets.upserted || 0} feuillet(s), ${totals.plateaux?.upserted || 0} plateau(x)`;
  }
  return 'Analyse OK';
}

function kindBadgeClass(kind) {
  if (kind === 'media') return 'gl-content-library-kind gl-content-library-kind--media';
  if (kind === 'unknown' || kind === 'unsupported') return 'gl-content-library-kind gl-content-library-kind--unknown';
  return 'gl-content-library-kind gl-content-library-kind--catalog';
}

export function GLContentLibraryView({ onOpenSubTab }) {
  const fileInputRef = useRef(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [archiveFile, setArchiveFile] = useState(null);
  const [analysisEntries, setAnalysisEntries] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [mediaReloadKey, setMediaReloadKey] = useState(0);

  const applyableEntries = useMemo(
    () => analysisEntries.filter((entry) => entry.canApply && !entry.error),
    [analysisEntries]
  );

  const fetchMediaLibrary = async () => {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  };

  const uploadMediaLibrary = async (mediaData) => {
    await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
    setMsg('Média ajouté à la bibliothèque');
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

  function entryKey(entry, index) {
    return `${entry.fileName}:${index}`;
  }

  function toggleEntry(key, checked) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function selectAllApplyable() {
    setSelectedKeys(new Set(applyableEntries.map((entry, index) => entryKey(entry, analysisEntries.indexOf(entry)))));
  }

  async function buildPayloadFromFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) throw new Error('Sélectionnez au moins un fichier');
    if (list.length === 1 && /\.zip$/i.test(list[0].name || '')) {
      const fileDataBase64 = await fileToDataUrl(list[0]);
      return {
        mode: 'archive',
        archiveFile: list[0],
        payload: { archive: { fileName: list[0].name, fileDataBase64 } },
      };
    }
    const encoded = [];
    for (const file of list) {
      encoded.push({
        fileName: file.name,
        fileDataBase64: await fileToDataUrl(file),
      });
    }
    return { mode: 'files', archiveFile: null, payload: { files: encoded } };
  }

  async function runAnalyze() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const built = await buildPayloadFromFiles(selectedFiles);
      setArchiveFile(built.archiveFile);
      const data = await apiGL('/api/gl/admin/content-library/analyze', 'POST', built.payload);
      const entries = Array.isArray(data?.entries) ? data.entries : [];
      setAnalysisEntries(entries);
      const keys = new Set();
      entries.forEach((entry, index) => {
        if (entry.canApply && !entry.error) keys.add(entryKey(entry, index));
      });
      setSelectedKeys(keys);
      setMsg(`Analyse terminée : ${entries.length} fichier(s), ${data?.summary?.applyable || 0} applicable(s).`);
    } catch (e) {
      setErr(e.message || 'Analyse impossible');
      setAnalysisEntries([]);
      setSelectedKeys(new Set());
    } finally {
      setBusy(false);
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
      for (let index = 0; index < analysisEntries.length; index += 1) {
        const entry = analysisEntries[index];
        const key = entryKey(entry, index);
        if (!selectedKeys.has(key)) continue;
        const row = {
          fileName: entry.fileName,
          kind: entry.kind,
          mimeType: entry.mimeType || null,
        };
        if (!archiveFile) {
          const sourceFile = selectedFiles.find((file) => file.name === entry.fileName);
          if (!sourceFile) {
            throw new Error(`Fichier source introuvable pour ${entry.fileName}`);
          }
          row.fileDataBase64 = await fileToDataUrl(sourceFile);
        }
        entries.push(row);
      }
      const applyBody = { entries };
      if (archiveFile) {
        applyBody.archive = {
          fileName: archiveFile.name,
          fileDataBase64: await fileToDataUrl(archiveFile),
        };
      }
      const data = await apiGL('/api/gl/admin/content-library/apply', 'POST', applyBody);
      const applied = Number(data?.summary?.applied || 0);
      const failed = Number(data?.summary?.failed || 0);
      setMsg(`Application terminée : ${applied} réussi(s), ${failed} échec(s).`);
      if (applied > 0) setMediaReloadKey((value) => value + 1);
      if (failed > 0) {
        const details = (data?.results || [])
          .filter((row) => !row.ok)
          .map((row) => `${row.fileName}: ${row.error}`)
          .join(' · ');
        setErr(details || 'Certains fichiers n’ont pas pu être importés');
      }
    } catch (e) {
      setErr(e.message || 'Application impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gl-content-library">
      <p className="gl-hint">
        Bibliothèque globale partagée avec ForetMap (images, audio, vidéo) et imports catalogue G&amp;L (XLSX).
        L’analyse classe les fichiers sans écrire en base ; l’application est explicite.
      </p>
      {err ? <p className="gl-error">{err}</p> : null}
      {msg ? <p className="gl-success">{msg}</p> : null}

      <section className="gl-content-library__section">
        <h3>Consulter</h3>
        <MediaLibraryMenu
          key={mediaReloadKey}
          title="Bibliothèque globale (images, audio, vidéo)"
          fetchItems={fetchMediaLibrary}
          uploadDataUrl={uploadMediaLibrary}
          removeItem={deleteMediaLibrary}
          onPickUrl={copyUrl}
          canUpload
          canRemove
          defaultOpen
          showToggle={false}
          manageHint="Clique sur un média pour copier son URL. Les imports en masse sont disponibles ci-dessous."
        />
      </section>

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
                  setSelectedFiles(next);
                  setArchiveFile(next.length === 1 && /\.zip$/i.test(next[0]?.name || '') ? next[0] : null);
                  setAnalysisEntries([]);
                  setSelectedKeys(new Set());
                  event.target.value = '';
                }}
              />
            </label>
            <GLButton type="button" disabled={busy || selectedFiles.length === 0} onClick={runAnalyze}>
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
            <GLButton type="button" disabled={busy || applyableEntries.length === 0} onClick={selectAllApplyable}>
              Tout sélectionner (applicables)
            </GLButton>
          </div>
          {selectedFiles.length > 0 ? (
            <ul className="gl-content-library__file-list">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}`}>{file.name} ({Math.round(file.size / 1024)} Ko)</li>
              ))}
            </ul>
          ) : (
            <p className="gl-hint">Aucun fichier sélectionné.</p>
          )}
        </div>

        {analysisEntries.length > 0 ? (
          <div className="gl-content-library__report">
            <table className="gl-content-library__table">
              <thead>
                <tr>
                  <th />
                  <th>Fichier</th>
                  <th>Nature</th>
                  <th>Résumé (dry-run)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {analysisEntries.map((entry, index) => {
                  const key = entryKey(entry, index);
                  const warnings = Array.isArray(entry.warnings) ? entry.warnings : [];
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          disabled={busy || !entry.canApply || !!entry.error}
                          onChange={(event) => toggleEntry(key, event.target.checked)}
                        />
                      </td>
                      <td>
                        <strong>{entry.fileName}</strong>
                        <div className="gl-hint">{Math.round((entry.size || 0) / 1024)} Ko</div>
                      </td>
                      <td>
                        <span className={kindBadgeClass(entry.kind)}>{entry.kindLabel || entry.kind}</span>
                        {entry.mediaType ? <span className="gl-hint"> ({entry.mediaType})</span> : null}
                      </td>
                      <td>
                        {entry.error ? <span className="gl-error">{entry.error}</span> : previewSummary(entry)}
                        {warnings.length ? (
                          <ul className="gl-content-library__warnings">
                            {warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td>
                        {entry.subTab && onOpenSubTab ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onOpenSubTab(entry.subTab)}
                          >
                            Ouvrir {entry.kindLabel}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
