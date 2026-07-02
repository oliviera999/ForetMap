import React, { useState } from 'react';
import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';

/**
 * Panneau « Import {studentPlural} (CSV / XLSX) » (administration des profils).
 * Autonome (§6.1) : possède l'état d'import (fichier, simulation, rapport) et les
 * appels API (modèles à télécharger, `POST /api/students/import`). Le parent ne
 * fournit que le contexte (`roleTerms`, `canImport`) et les retours (`setErr`/`setMsg`
 * vers les bandeaux, `onImported()` → rechargement). Comportement inchangé.
 */
function StudentImportPanel({ roleTerms, canImport, setErr, setMsg, onImported }) {
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [dryRunImport, setDryRunImport] = useState(false);

  const downloadStudentsTemplate = async (format) => {
    try {
      await downloadApiFile(
        `/api/students/import/template?format=${encodeURIComponent(format)}`,
        format === 'xlsx' ? 'foretmap-modele-n3beurs.xlsx' : 'foretmap-modele-n3beurs.csv',
      );
    } catch (e) {
      setErr(e.message || 'Erreur lors du téléchargement du modèle');
    }
  };

  const importStudents = async () => {
    if (!importFile) {
      setErr('Choisissez un fichier CSV ou XLSX');
      return;
    }
    setImportLoading(true);
    setImportReport(null);
    setErr('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
        reader.readAsDataURL(importFile);
      });
      const result = await api('/api/students/import', 'POST', {
        fileName: importFile.name,
        fileDataBase64: base64,
        dryRun: dryRunImport,
      });
      setImportReport(result.report || null);
      if ((result.report?.totals?.created || 0) > 0) {
        setMsg(`${result.report.totals.created} ${roleTerms.studentSingular}(s) créé(s)`);
      } else if (dryRunImport) {
        setMsg('Simulation terminée');
      } else {
        setMsg('Import terminé');
      }
      await onImported();
    } catch (e) {
      setErr('Erreur import: ' + (e.message || 'inconnue'));
    }
    setImportLoading(false);
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        opacity: canImport ? 1 : 0.65,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--forest)' }}>
        Import {roleTerms.studentPlural} (CSV / XLSX)
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#6b7280' }}>
        Téléchargez un modèle vierge, complétez-le puis importez le fichier.
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '.8rem', color: '#9a3412' }}>
        Le modèle contient une ligne d&apos;exemple: pensez à la remplacer ou la supprimer avant
        l&apos;import.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadStudentsTemplate('csv')}>
          📄 Modèle CSV
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadStudentsTemplate('xlsx')}>
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
            checked={dryRunImport}
            onChange={(e) => setDryRunImport(e.target.checked)}
          />
          Simulation (sans création)
        </label>
        <button
          className="btn btn-primary btn-sm"
          onClick={importStudents}
          disabled={importLoading || !canImport}
        >
          {importLoading ? 'Import…' : 'Importer'}
        </button>
      </div>
      {importFile && (
        <p style={{ margin: '8px 0 0', fontSize: '.8rem', color: '#6b7280' }}>
          Fichier sélectionné: <strong>{importFile.name}</strong>
        </p>
      )}
      {importReport && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: '#f8fafc',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '.85rem', color: '#1f2937', marginBottom: 4 }}>
            Reçus: <strong>{importReport.totals?.received || 0}</strong> · Valides:{' '}
            <strong>{importReport.totals?.valid || 0}</strong> · Créés:{' '}
            <strong>{importReport.totals?.created || 0}</strong> · Déjà existants:{' '}
            <strong>{importReport.totals?.skipped_existing || 0}</strong> · Invalides:{' '}
            <strong>{importReport.totals?.skipped_invalid || 0}</strong>
          </div>
          {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
            <div style={{ maxHeight: 120, overflow: 'auto', fontSize: '.8rem', color: '#991b1b' }}>
              {importReport.errors.slice(0, 15).map((item, idx) => (
                <div key={`${item.row}-${item.field}-${idx}`}>
                  Ligne {item.row} ({item.field}): {item.error}
                </div>
              ))}
              {importReport.errors.length > 15 && (
                <div>… {importReport.errors.length - 15} erreur(s) supplémentaire(s)</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { StudentImportPanel };
