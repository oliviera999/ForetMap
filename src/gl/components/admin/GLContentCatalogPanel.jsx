import React, { useState } from 'react';

/**
 * Sous-onglets « Saisie manuelle » / « Import XLSX » pour un catalogue GL (glossaire, espèces, etc.).
 * Un onglet « Vue d'ensemble » optionnel peut être ajouté (OverviewPanel) : quand il est
 * fourni, il devient l'onglet affiché par défaut.
 */
export function GLContentCatalogPanel({
  manualLabel,
  importLabel,
  overviewLabel,
  ManualPanel,
  ImportPanel,
  OverviewPanel,
}) {
  const hasOverview = !!OverviewPanel;
  const [mode, setMode] = useState(hasOverview ? 'overview' : 'manual');

  return (
    <div className="gl-content-catalog-panel">
      <nav className="gl-subtabs gl-subtabs--nested">
        {hasOverview ? (
          <button
            type="button"
            className={mode === 'overview' ? 'is-active' : ''}
            onClick={() => setMode('overview')}
          >
            {overviewLabel || "Vue d'ensemble"}
          </button>
        ) : null}
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
      {mode === 'overview' && hasOverview ? (
        <OverviewPanel />
      ) : mode === 'manual' ? (
        <ManualPanel />
      ) : (
        <ImportPanel />
      )}
    </div>
  );
}
