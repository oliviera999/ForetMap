import React, { useState } from 'react';

/**
 * Sous-onglets « Saisie manuelle » / « Import XLSX » pour un catalogue GL (glossaire, espèces, etc.).
 */
export function GLContentCatalogPanel({ manualLabel, importLabel, ManualPanel, ImportPanel }) {
  const [mode, setMode] = useState('manual');

  return (
    <div className="gl-content-catalog-panel">
      <nav className="gl-subtabs gl-subtabs--nested">
        <button
          type="button"
          className={mode === 'manual' ? 'is-active' : ''}
          onClick={() => setMode('manual')}
        >
          {manualLabel}
        </button>
        <button
          type="button"
          className={mode === 'import' ? 'is-active' : ''}
          onClick={() => setMode('import')}
        >
          {importLabel}
        </button>
      </nav>
      {mode === 'manual' ? <ManualPanel /> : <ImportPanel />}
    </div>
  );
}
