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
      <div className="gl-subtabs gl-subtabs--nested gl-subtabs--scroll" role="tablist">
        {hasOverview ? (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'overview'}
            className={mode === 'overview' ? 'is-active' : ''}
            onClick={() => setMode('overview')}
          >
            {overviewLabel || "Vue d'ensemble"}
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'manual'}
          className={mode === 'manual' ? 'is-active' : ''}
          onClick={() => setMode('manual')}
        >
          {manualLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'import'}
          className={mode === 'import' ? 'is-active' : ''}
          onClick={() => setMode('import')}
        >
          {importLabel}
        </button>
      </div>
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
