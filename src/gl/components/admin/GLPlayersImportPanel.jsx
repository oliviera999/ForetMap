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

export function GLPlayersImportPanel({ onReload }) {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);

  async function downloadTemplate(format) {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const filename = format === 'xlsx' ? 'foretmap-gl-modele-joueurs.xlsx' : 'foretmap-gl-modele-joueurs.csv';
      await downloadGlFile(
        `/api/gl/admin/players/import/template?format=${encodeURIComponent(format)}`,
        filename
      );
      setInfo(`Modèle ${format.toUpperCase()} téléchargé.`);
    } catch (err) {
      setError(err.message || 'Erreur de téléchargement');
    } finally {
      setLoading(false);
    }
  }

  async function runImport(event) {
    event.preventDefault();
    if (!file) {
      setError('Sélectionnez un fichier CSV/XLSX');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    setReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(file);
      const result = await apiGL('/api/gl/admin/players/import', 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
      });
      setReport(result?.report || null);
      setInfo(dryRun ? 'Simulation terminée.' : 'Import terminé.');
      if (!dryRun) await onReload?.();
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gl-admin-section gl-animate-in">
      <h3>Import joueurs (CSV / XLSX)</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={() => downloadTemplate('csv')} disabled={loading}>
          Modèle CSV
        </GLButton>
        <GLButton type="button" variant="secondary" onClick={() => downloadTemplate('xlsx')} disabled={loading}>
          Modèle XLSX
        </GLButton>
      </div>

      <form className="gl-form" onSubmit={runImport}>
        <GLField label="Fichier à importer">
          <GLInput
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </GLField>
        <GLField label="Mode">
          <GLSelect value={dryRun ? 'dry' : 'apply'} onChange={(e) => setDryRun(e.target.value === 'dry')}>
            <option value="dry">Simulation (dry-run)</option>
            <option value="apply">Importer réellement</option>
          </GLSelect>
        </GLField>
        <GLButton type="submit" disabled={loading}>{loading ? 'Traitement…' : 'Lancer l’import'}</GLButton>
      </form>

      {report ? (
        <div className="gl-admin-import-report">
          <p>
            Reçues: <strong>{report?.totals?.received || 0}</strong> · Valides: <strong>{report?.totals?.valid || 0}</strong> ·
            Créées: <strong>{report?.totals?.created || 0}</strong>
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
