import React, { useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

export function GLChapterCharteImportPanel({ onImportApplied }) {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  const [exportSlug, setExportSlug] = useState('');

  async function runDownload(path, filename, successMessage) {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await downloadGlFile(path, filename);
      setInfo(successMessage);
    } catch (err) {
      setError(err.message || 'Erreur de téléchargement');
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    return runDownload(
      '/api/gl/chapters/admin/charte/import/template',
      'foretmap-gl-modele-chapitres-charte.xlsx',
      'Modèle XLSX téléchargé (feuille chapitres_charte).'
    );
  }

  function downloadExport() {
    const params = new URLSearchParams();
    if (exportSlug.trim()) params.set('slug', exportSlug.trim());
    const query = params.toString();
    return runDownload(
      `/api/gl/chapters/admin/charte/export${query ? `?${query}` : ''}`,
      'foretmap-gl-export-chapitres-charte.xlsx',
      'Export XLSX généré.'
    );
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
    setReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(file);
      const result = await apiGL('/api/gl/chapters/admin/charte/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
      });
      setReport(result?.report || null);
      setInfo(dryRun ? 'Simulation terminée.' : 'Import terminé.');
      if (!dryRun && typeof onImportApplied === 'function') {
        await onImportApplied();
      }
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Import / export charte chapitres (XLSX)</h3>
      <p className="gl-hint">
        Couleurs du thème (héritage plateforme si vide), image de carte et cadre. Feuille
        {' '}
        <code>chapitres_charte</code>
        . Cellule vide = ne pas modifier ; « reset » ou « - » = réinitialiser une couleur.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Modèle XLSX
        </GLButton>
        <GLField label="Export — slug (optionnel)">
          <GLInput
            value={exportSlug}
            onChange={(e) => setExportSlug(e.target.value)}
            placeholder="foret-temperee"
          />
        </GLField>
        <GLButton type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter les chartes
        </GLButton>
      </div>

      <form className="gl-form" onSubmit={runImport}>
        <GLField label="Fichier XLSX">
          <GLInput
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </GLField>
        <GLField label="Mode">
          <GLSelect value={dryRun ? 'dry' : 'apply'} onChange={(e) => setDryRun(e.target.value === 'dry')}>
            <option value="dry">Simulation (dry-run)</option>
            <option value="apply">Importer réellement</option>
          </GLSelect>
        </GLField>
        <GLButton type="submit" disabled={loading}>
          {loading ? 'Traitement…' : 'Lancer l’import'}
        </GLButton>
      </form>

      {report ? (
        <div className="gl-admin-import-report">
          <p>
            Reçues: <strong>{report?.totals?.received || 0}</strong>
            {' · '}
            Valides: <strong>{report?.totals?.valid || 0}</strong>
            {' · '}
            Créées: <strong>{report?.totals?.created || 0}</strong>
            {' · '}
            Mises à jour: <strong>{report?.totals?.updated || 0}</strong>
          </p>
          {Array.isArray(report?.preview) && report.preview.length > 0 ? (
            <ul>
              {report.preview.map((item) => (
                <li key={item.slug}>
                  {item.slug}
                  {item.title ? ` — ${item.title}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(report?.errors) && report.errors.length > 0 ? (
            <ul>
              {report.errors.slice(0, 20).map((item, idx) => (
                <li key={`${item.row}-${item.field}-${idx}`}>
                  Ligne {item.row} — {item.field}: {item.error}
                </li>
              ))}
            </ul>
          ) : (
            <p className="gl-hint">Aucune erreur détectée.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
