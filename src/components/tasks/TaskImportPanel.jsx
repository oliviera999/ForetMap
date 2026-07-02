import React, { useState } from 'react';

import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { fileToDataUrl } from '../../utils/fileToDataUrl.js';

/**
 * Panneau n3boss « Import tâches/projets (CSV / XLSX) » de la vue Tâches.
 *
 * Extrait de `tasks-views.jsx` (O6) : état (fichier, simulation, rapport) et
 * handlers (modèles à télécharger, import) entièrement autonomes — seuls
 * `setToast` et `onRefresh` viennent du parent.
 */
export function TaskImportPanel({ setToast, onRefresh }) {
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);

  const downloadImportTemplate = async (format) => {
    try {
      await downloadApiFile(
        `/api/tasks/import/template?format=${encodeURIComponent(format)}`,
        format === 'xlsx'
          ? 'foretmap-modele-taches-projets.xlsx'
          : 'foretmap-modele-taches-projets.csv',
      );
    } catch (e) {
      setToast('Zut, le modèle ne part pas : ' + (e.message || 'inconnue'));
    }
  };

  const runImportTasksProjects = async () => {
    if (!importFile) {
      setToast('Choisis d’abord un fichier CSV ou XLSX, stp.');
      return;
    }
    setImporting(true);
    setImportReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(importFile);
      const result = await api('/api/tasks/import', 'POST', {
        fileName: importFile.name,
        fileDataBase64,
        dryRun: importDryRun,
      });
      setImportReport(result?.report || null);
      if (importDryRun) {
        setToast('Simulation terminée — regarde le rapport ci-dessous ✓');
      } else {
        const createdProjects = Number(result?.report?.totals?.created_projects || 0);
        const createdTasks = Number(result?.report?.totals?.created_tasks || 0);
        setToast(
          `Import OK : ${createdProjects} projet(s), ${createdTasks} tâche(s) — la forêt grossit !`,
        );
        await onRefresh();
      }
    } catch (e) {
      setToast('Import bloqué : ' + (e.message || 'inconnue'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <details className="plant-more" style={{ marginBottom: 10 }}>
      <summary>Import tâches/projets (CSV / XLSX)</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <p style={{ margin: 0, fontSize: '.85rem', color: '#6b7280' }}>
          Le fichier peut contenir des lignes de type <strong>project</strong> et{' '}
          <strong>task</strong>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadImportTemplate('csv')}
            disabled={importing}
          >
            📄 Modèle CSV
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadImportTemplate('xlsx')}
            disabled={importing}
          >
            📗 Modèle XLSX
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(e) => {
              setImportFile(e.target.files?.[0] || null);
              setImportReport(null);
            }}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '.85rem',
              color: '#374151',
            }}
          >
            <input
              type="checkbox"
              checked={importDryRun}
              onChange={(e) => setImportDryRun(e.target.checked)}
            />
            Simulation (sans création)
          </label>
          <button
            className="btn btn-primary btn-sm"
            onClick={runImportTasksProjects}
            disabled={importing}
          >
            {importing ? 'Import...' : 'Importer'}
          </button>
        </div>
        {importFile && (
          <p style={{ margin: 0, fontSize: '.8rem', color: '#6b7280' }}>
            Fichier sélectionné: <strong>{importFile.name}</strong>
          </p>
        )}
        {importReport && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div style={{ fontSize: '.85rem', color: '#1f2937', marginBottom: 4 }}>
              Reçues: <strong>{importReport?.totals?.received || 0}</strong> · Valides:{' '}
              <strong>{importReport?.totals?.valid || 0}</strong> · Projets créés:{' '}
              <strong>{importReport?.totals?.created_projects || 0}</strong> · Tâches créées:{' '}
              <strong>{importReport?.totals?.created_tasks || 0}</strong> · Déjà existants:{' '}
              <strong>{importReport?.totals?.skipped_existing || 0}</strong> · Invalides:{' '}
              <strong>{importReport?.totals?.skipped_invalid || 0}</strong>
            </div>
            {Array.isArray(importReport?.errors) && importReport.errors.length > 0 && (
              <div
                style={{ maxHeight: 120, overflow: 'auto', fontSize: '.8rem', color: '#991b1b' }}
              >
                {importReport.errors.slice(0, 15).map((item, idx) => (
                  <div key={`${item.row}-${item.field}-${idx}`}>
                    Ligne {item.row} ({item.field}): {item.error}
                  </div>
                ))}
                {importReport.errors.length > 15 && (
                  <div>... {importReport.errors.length - 15} erreur(s) supplémentaire(s)</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
