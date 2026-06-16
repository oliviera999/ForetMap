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

export function GLSpeciesImportPanel() {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [syncBiomes, setSyncBiomes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  const [stats, setStats] = useState(null);
  const [exportStatut, setExportStatut] = useState('actif');
  const [exportBiomeSlug, setExportBiomeSlug] = useState('');

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
      '/api/gl/admin/species/import/template',
      'foretmap-gl-modele-biocenose.xlsx',
      'Modèle XLSX téléchargé (feuilles especes et biomes_stats).',
    );
  }

  function downloadExport() {
    const params = new URLSearchParams();
    if (exportStatut === 'all') params.set('statut', 'all');
    if (exportBiomeSlug.trim()) params.set('biomeSlug', exportBiomeSlug.trim());
    const query = params.toString();
    return runDownload(
      `/api/gl/admin/species/export${query ? `?${query}` : ''}`,
      'foretmap-gl-export-biocenose.xlsx',
      'Export XLSX généré.',
    );
  }

  async function loadStats() {
    try {
      const data = await apiGL('/api/gl/admin/species/stats');
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
      const result = await apiGL('/api/gl/admin/species/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
        syncBiomes,
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
      <h3>Import biocénose — espèces / biomes (XLSX)</h3>
      <p className="gl-hint">
        Catalogue espèces par biome (affiché dans la biocénose joueur). Fichier attendu : feuilles{' '}
        <code>especes</code> et <code>biomes_stats</code> (voir <code>data/gl/README.md</code>).
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      {stats ? (
        <p className="gl-hint">
          Catalogue actuel : <strong>{stats.total || 0}</strong> espèce(s) actives.
        </p>
      ) : null}

      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Modèle XLSX
        </GLButton>
        <GLField label="Export — statut">
          <GLSelect value={exportStatut} onChange={(e) => setExportStatut(e.target.value)}>
            <option value="actif">Espèces actives</option>
            <option value="all">Tous les statuts</option>
          </GLSelect>
        </GLField>
        <GLField label="Export — biome (optionnel)">
          <GLInput
            value={exportBiomeSlug}
            onChange={(e) => setExportBiomeSlug(e.target.value)}
            placeholder="sahara"
          />
        </GLField>
        <GLButton type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter le catalogue
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
          <GLSelect
            value={dryRun ? 'dry' : 'apply'}
            onChange={(e) => setDryRun(e.target.value === 'dry')}
          >
            <option value="dry">Simulation (dry-run)</option>
            <option value="apply">Importer réellement</option>
          </GLSelect>
        </GLField>
        <GLField label="Synchroniser les biomes">
          <GLSelect
            value={syncBiomes ? 'yes' : 'no'}
            onChange={(e) => setSyncBiomes(e.target.value === 'yes')}
          >
            <option value="yes">Oui (feuille biomes_stats)</option>
            <option value="no">Non</option>
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
            {' · '}
            Biomes sync: <strong>{report?.totals?.biomes_synced || 0}</strong>
          </p>
          {Array.isArray(report?.preview) && report.preview.length > 0 ? (
            <ul>
              {report.preview.map((item) => (
                <li key={item.species_code}>
                  {item.species_code} — {item.nom_commun} ({item.biome_slug})
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
