import React, { useEffect, useState } from 'react';
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

export function GLSpellsImportPanel() {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [syncCategories, setSyncCategories] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  const [stats, setStats] = useState(null);
  const [exportStatut, setExportStatut] = useState('all');

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
      '/api/gl/admin/spells/import/template',
      'foretmap-gl-modele-sortileges.xlsx',
      'Modèle XLSX téléchargé (feuilles sortileges et categories_stats).',
    );
  }

  function downloadExport() {
    const params = new URLSearchParams();
    if (exportStatut !== 'all') params.set('statut', exportStatut);
    const query = params.toString();
    return runDownload(
      `/api/gl/admin/spells/export${query ? `?${query}` : ''}`,
      'foretmap-gl-export-sortileges.xlsx',
      'Export XLSX généré.',
    );
  }

  async function loadStats() {
    try {
      const data = await apiGL('/api/gl/admin/spells/stats');
      setStats(data);
    } catch (_) {
      setStats(null);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

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
      const result = await apiGL('/api/gl/admin/spells/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
        syncCategories,
      });
      setReport(result?.report || null);
      setInfo(dryRun ? 'Simulation terminée.' : 'Import terminé.');
      if (!dryRun) await loadStats();
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Import sortilèges (XLSX)</h3>
      <p className="gl-hint">
        Catalogue des sorts (onglet joueur Sortilèges). Fichier attendu : feuilles{' '}
        <code>sortileges</code> et <code>categories_stats</code> (voir{' '}
        <code>data/gl/README.md</code>).
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}
      {stats ? (
        <p className="gl-hint">
          Catalogue actuel : <strong>{stats.total}</strong> sort(s) réparti(s) par catégorie.
        </p>
      ) : null}
      <div className="gl-inline-actions gl-inline-actions--wrap">
        <GLButton type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Télécharger le modèle
        </GLButton>
        <GLField label="Export — statut">
          <GLSelect value={exportStatut} onChange={(e) => setExportStatut(e.target.value)}>
            <option value="all">Tous</option>
            <option value="officiel">Officiels</option>
            <option value="propose">Proposés</option>
          </GLSelect>
        </GLField>
        <GLButton type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter le catalogue
        </GLButton>
      </div>
      <form className="gl-form" onSubmit={runImport}>
        <GLField label="Fichier XLSX">
          <GLInput
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </GLField>
        <label className="gl-checkbox-row">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Simulation (dry-run) sans écriture en base
        </label>
        <label className="gl-checkbox-row">
          <input
            type="checkbox"
            checked={syncCategories}
            onChange={(e) => setSyncCategories(e.target.checked)}
          />
          Synchroniser les catégories depuis <code>categories_stats</code>
        </label>
        <GLButton type="submit" disabled={loading || !file}>
          {loading ? 'Import…' : dryRun ? 'Simuler l’import' : 'Appliquer l’import'}
        </GLButton>
      </form>
      {report ? <pre className="gl-import-report">{JSON.stringify(report, null, 2)}</pre> : null}
    </section>
  );
}
