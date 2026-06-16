import React from 'react';

/**
 * Panneau « Import {studentPlural} (CSV / XLSX) » (administration des profils).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur : tout l’état et les
 * handlers sont fournis par ProfilesAdminView via les props. Comportement inchangé.
 */
function StudentImportPanel({
  roleTerms,
  canImport,
  importFile,
  importLoading,
  importReport,
  dryRunImport,
  setImportFile,
  setImportReport,
  setDryRunImport,
  downloadStudentsTemplate,
  importStudents,
}) {
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
