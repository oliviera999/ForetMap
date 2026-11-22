import { useState } from 'react';
import {
  IconDownload,
  IconImage,
  IconSearch,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '../../shared/icons.jsx';

/**
 * Outils du graphe du réseau trophique (sortis de `FoodWebGraph.jsx`, flux C3) : zoom,
 * recherche d'une espèce à isoler, export PNG / SVG. Partagés avec G&L par `FoodWebGraph`.
 */
export function FoodWebGraphZoomSearch({
  onZoom,
  onReset,
  search,
  onSearchChange,
  onSubmit,
  matches,
  addMode,
  /** Libellé du bouton de recherche ; `null` : « Ajouter » / « Isoler » (comportement actuel). */
  submitLabel = null,
}) {
  return (
    <>
      <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Zoom">
        <button
          type="button"
          className="pedago-foodweb-graph__tbtn"
          onClick={() => onZoom(1 / 1.2)}
          aria-label="Dézoomer"
          title="Dézoomer"
        >
          <IconZoomOut size={14} />
        </button>
        <button
          type="button"
          className="pedago-foodweb-graph__tbtn"
          onClick={onReset}
          aria-label="Réinitialiser la vue et les positions"
          title="Réinitialiser la vue et les positions"
        >
          <IconZoomReset size={14} />
        </button>
        <button
          type="button"
          className="pedago-foodweb-graph__tbtn"
          onClick={() => onZoom(1.2)}
          aria-label="Zoomer"
          title="Zoomer"
        >
          <IconZoomIn size={14} />
        </button>
      </div>
      <form
        className="pedago-foodweb-graph__search"
        onSubmit={onSubmit}
        role="search"
        aria-label="Recherche dans le graphe"
      >
        <input
          type="search"
          className="pedago-foodweb-graph__search-input"
          placeholder="Rechercher une espèce…"
          aria-label="Rechercher une espèce"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          list="fw-graph-search-list"
          autoComplete="off"
        />
        <datalist id="fw-graph-search-list">
          {matches.map((node) => (
            <option key={node.id} value={node.name} />
          ))}
        </datalist>
        <button
          type="submit"
          className="pedago-foodweb-graph__tbtn"
          disabled={matches.length === 0}
        >
          <IconSearch size={14} /> {submitLabel || (addMode ? 'Ajouter' : 'Isoler')}
        </button>
      </form>
    </>
  );
}

/** Export : boutons sur grand écran, menu « Plus… » sur téléphone. */
export function FoodWebGraphExportControls({ onPng, onSvg }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <div
        className="pedago-foodweb-graph__tbgroup pedago-foodweb-graph__export--desktop"
        role="group"
        aria-label="Export"
      >
        <button type="button" className="pedago-foodweb-graph__tbtn" onClick={onPng}>
          <IconImage size={14} /> PNG
        </button>
        <button type="button" className="pedago-foodweb-graph__tbtn" onClick={onSvg}>
          <IconDownload size={14} /> SVG
        </button>
      </div>
      <div className="pedago-foodweb-graph__more pedago-foodweb-graph__export--mobile">
        <button
          type="button"
          className="pedago-foodweb-graph__tbtn"
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen((o) => !o)}
        >
          Plus…
        </button>
        {moreOpen ? (
          <div className="pedago-foodweb-graph__more-menu" role="menu">
            <button
              type="button"
              className="pedago-foodweb-graph__tbtn"
              role="menuitem"
              onClick={() => {
                onPng();
                setMoreOpen(false);
              }}
            >
              <IconImage size={14} /> PNG
            </button>
            <button
              type="button"
              className="pedago-foodweb-graph__tbtn"
              role="menuitem"
              onClick={() => {
                onSvg();
                setMoreOpen(false);
              }}
            >
              <IconDownload size={14} /> SVG
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
