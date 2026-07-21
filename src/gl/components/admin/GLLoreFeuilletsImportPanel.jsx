import React, { useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

export function GLLoreFeuilletsImportPanel() {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  // Suivi du téléchargement en cours ('template' | 'export' | null) pour l'état
  // des boutons et l'affichage des erreurs — indispensable sur mobile où un
  // échec silencieux donnait l'impression d'un « export vide ».
  const [downloading, setDownloading] = useState(null);

  async function downloadFile(kind, path, filename) {
    setError('');
    setInfo('');
    setDownloading(kind);
    try {
      await downloadGlFile(path, filename);
      setInfo('Téléchargement lancé — vérifiez vos fichiers reçus.');
    } catch (err) {
      setError(err.message || 'Téléchargement impossible');
    } finally {
      setDownloading(null);
    }
  }

  async function runImport(event) {
    event.preventDefault();
    if (!file) {
      setError('Sélectionnez un fichier XLSX');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const result = await apiGL('/api/gl/lore/admin/feuillets/import', 'POST', {
        fileName: file.name,
        fileDataBase64: await fileToDataUrl(file),
        dryRun,
      });
      setReport(result?.report || result);
      setInfo(dryRun ? 'Simulation terminée.' : 'Import appliqué.');
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gl-admin-import-panel">
      <h3>Import carnet Sélène (XLSX)</h3>
      <p className="gl-hint">
        Feuilles attendues : feuillets, plateaux (cf. data/gl/corpus-feuillets-selene.xlsx).
      </p>
      <div className="gl-admin-import-actions">
        <GLButton
          type="button"
          disabled={loading || !!downloading}
          onClick={() =>
            downloadFile(
              'template',
              '/api/gl/lore/admin/feuillets/import/template',
              'modele-feuillets-selene.xlsx',
            )
          }
        >
          {downloading === 'template' ? 'Préparation…' : 'Modèle XLSX'}
        </GLButton>
        <GLButton
          type="button"
          disabled={loading || !!downloading}
          onClick={() =>
            downloadFile(
              'export',
              '/api/gl/lore/admin/feuillets/export',
              'export-feuillets-selene.xlsx',
            )
          }
        >
          {downloading === 'export' ? 'Export en cours…' : 'Exporter le catalogue'}
        </GLButton>
      </div>
      <form onSubmit={runImport}>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <label>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Simulation (dry-run)
        </label>
        <GLButton type="submit" disabled={loading}>
          {loading ? 'Import…' : 'Importer'}
        </GLButton>
      </form>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-success">{info}</p> : null}
      {report ? <pre className="gl-admin-report">{JSON.stringify(report, null, 2)}</pre> : null}
    </section>
  );
}
