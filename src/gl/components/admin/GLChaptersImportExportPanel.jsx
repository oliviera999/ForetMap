import React, { useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

const SCOPE_OPTIONS = [
  { value: 'content', label: 'Contenu éditorial (chapitres)' },
  { value: 'content_markers', label: 'Contenu + repères carte' },
  { value: 'full', label: 'Export complet (repères, zones, charte)' },
];

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

export function GLChaptersImportExportPanel({ onImportApplied }) {
  const [scope, setScope] = useState('content');
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [syncReperes, setSyncReperes] = useState(false);
  const [syncZones, setSyncZones] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  const [exportSlug, setExportSlug] = useState('');

  const showMarkerSync = scope !== 'content';
  const showZoneSync = scope === 'full';

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
    const params = new URLSearchParams({ scope });
    return runDownload(
      `/api/gl/chapters/admin/import/template?${params.toString()}`,
      'foretmap-gl-modele-chapitres.xlsx',
      'Modèle XLSX téléchargé.'
    );
  }

  function downloadExport() {
    const params = new URLSearchParams({ scope });
    if (exportSlug.trim()) params.set('slug', exportSlug.trim());
    return runDownload(
      `/api/gl/chapters/admin/export?${params.toString()}`,
      'foretmap-gl-export-chapitres.xlsx',
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
      const result = await apiGL('/api/gl/chapters/admin/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
        syncReperes: showMarkerSync ? syncReperes : false,
        syncZones: showZoneSync ? syncZones : false,
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
      <h3>Import / export chapitres (XLSX)</h3>
      <p className="gl-hint">
        Fichier multi-feuilles selon la portée choisie (
        <code>chapitres</code>
        {scope !== 'content' ? ', reperes' : ''}
        {scope === 'full' ? ', zones_royaume, chapitres_charte' : ''}
        ). Voir <code>data/gl/README.md</code>.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <GLField label="Portée export / modèle">
        <GLSelect value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </GLSelect>
      </GLField>

      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Modèle XLSX
        </GLButton>
        <GLField label="Export (slug optionnel)">
          <GLInput
            value={exportSlug}
            onChange={(e) => setExportSlug(e.target.value)}
            placeholder="Tous les chapitres"
          />
        </GLField>
        <GLButton type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter
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
        {showMarkerSync ? (
          <label className="gl-checkbox-row">
            <input
              type="checkbox"
              checked={syncReperes}
              onChange={(e) => setSyncReperes(e.target.checked)}
            />
            {' '}
            Synchroniser les repères (supprimer ceux absents du fichier, par chapitre)
          </label>
        ) : null}
        {showZoneSync ? (
          <label className="gl-checkbox-row">
            <input
              type="checkbox"
              checked={syncZones}
              onChange={(e) => setSyncZones(e.target.checked)}
            />
            {' '}
            Synchroniser les zones royaume (supprimer celles absentes du fichier, par chapitre)
          </label>
        ) : null}
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
            Créés: <strong>{report?.totals?.created || 0}</strong>
            {' · '}
            Mis à jour: <strong>{report?.totals?.updated || 0}</strong>
            {' · '}
            Repères: <strong>{report?.totals?.markers_synced || 0}</strong>
            {report?.totals?.markers_deleted > 0 ? (
              <>
                {' '}
                (supprimés: <strong>{report.totals.markers_deleted}</strong>)
              </>
            ) : null}
            {' · '}
            Zones: <strong>{report?.totals?.zones_synced || 0}</strong>
            {report?.totals?.zones_deleted > 0 ? (
              <>
                {' '}
                (supprimées: <strong>{report.totals.zones_deleted}</strong>)
              </>
            ) : null}
            {' · '}
            Charte: <strong>{report?.totals?.charte_updated || 0}</strong>
          </p>
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
