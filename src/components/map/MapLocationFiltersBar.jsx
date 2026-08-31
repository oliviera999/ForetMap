import { useEffect, useMemo, useRef, useState } from 'react';

import { DialogShell } from '../DialogShell.jsx';
import { MapLocationFilterFields } from './MapLocationFilterFields.jsx';
import { useMapLocationFiltersPanel } from '../../hooks/useMapLocationFiltersPanel.js';
import {
  MAP_LOCATION_FILTER_DEFAULTS,
  countActiveMapLocationFilters,
  isMapLocationFilterActive,
} from '../../utils/mapLocationFilters.js';
import {
  activeMapLocationFilterChips,
  clearMapLocationFilterKey,
} from '../../utils/mapLocationFilterSummary.js';

/**
 * Barre recherche + filtres pour zones et repères sur la carte (mode consultation).
 */
export function MapLocationFiltersBar({
  filters,
  setFilters,
  speciesOptions = [],
  categoryOptions = [],
  zoneMatchCount = 0,
  markerMatchCount = 0,
  searchInputRef = null,
}) {
  const { compact, open, toggle, close } = useMapLocationFiltersPanel();
  const [draftText, setDraftText] = useState(filters.text || '');
  const internalRef = useRef(null);
  const inputRef = searchInputRef || internalRef;

  useEffect(() => {
    setDraftText(filters.text || '');
  }, [filters.text]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((prev) => {
        if ((prev.text || '') === draftText) return prev;
        return { ...prev, text: draftText };
      });
    }, 200);
    return () => window.clearTimeout(t);
  }, [draftText, setFilters]);

  const chips = useMemo(
    () => activeMapLocationFilterChips(filters, speciesOptions, categoryOptions),
    [filters, speciesOptions, categoryOptions],
  );
  const structuredCount = countActiveMapLocationFilters(filters);
  const filterActive = isMapLocationFilterActive(filters);

  const clearFilter = (key) => {
    setFilters((prev) => clearMapLocationFilterKey(prev, key));
  };

  const clearAll = () => {
    setDraftText('');
    setFilters({ ...MAP_LOCATION_FILTER_DEFAULTS });
  };

  const fields = (
    <MapLocationFilterFields
      filters={filters}
      setFilters={setFilters}
      speciesOptions={speciesOptions}
      categoryOptions={categoryOptions}
    />
  );

  const countLabel =
    filterActive && (zoneMatchCount > 0 || markerMatchCount > 0)
      ? `${zoneMatchCount} zone${zoneMatchCount !== 1 ? 's' : ''} · ${markerMatchCount} repère${markerMatchCount !== 1 ? 's' : ''}`
      : filterActive
        ? 'Aucun résultat'
        : '';

  return (
    <div className="task-filters task-filters--compactable map-location-filters">
      <div className="task-filters-bar map-location-filters-bar">
        <input
          ref={inputRef}
          className="task-filters-search map-location-filters-search"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Zone, repère, espèce…"
          aria-label="Rechercher une zone ou un repère"
          type="search"
          enterKeyHint="search"
        />
        <button
          type="button"
          className={`btn btn-sm task-filters-toggle ${structuredCount > 0 ? 'btn-primary' : 'btn-ghost'}`}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={!compact && open ? 'map-location-filters-panel' : undefined}
          aria-label={
            structuredCount > 0
              ? `Filtres (${structuredCount} actif${structuredCount > 1 ? 's' : ''})`
              : 'Filtres'
          }
        >
          <span aria-hidden="true">⚙️</span>
          <span className="task-filters-toggle__label" aria-hidden="true">
            Filtres
          </span>
          {structuredCount > 0 && (
            <span className="task-filters-count" aria-hidden="true">
              {structuredCount}
            </span>
          )}
        </button>
        {countLabel ? (
          <span className="map-location-filters-count" aria-live="polite">
            {countLabel}
          </span>
        ) : null}
        {filterActive && (
          <button
            type="button"
            className="btn btn-sm btn-ghost map-location-filters-clear"
            onClick={clearAll}
            aria-label="Effacer recherche et filtres"
            title="Effacer"
          >
            ✕
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="task-filters-chips" role="group" aria-label="Filtres actifs">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="task-filters-chip"
              onClick={() => clearFilter(chip.key)}
              aria-label={chip.removeLabel}
              title={chip.removeLabel}
            >
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            type="button"
            className="task-filters-chip task-filters-chip--reset"
            onClick={clearAll}
            aria-label="Effacer tous les filtres"
          >
            Tout effacer
          </button>
        </div>
      )}

      {!compact && open && (
        <div
          id="map-location-filters-panel"
          className="task-filters-panel map-location-filters-panel"
        >
          {fields}
        </div>
      )}

      {compact && (
        <DialogShell
          open={open}
          onClose={close}
          className="modal-overlay task-filters-sheet-overlay"
          panelClassName="task-filters-sheet map-location-filters-sheet"
          ariaLabel="Filtres carte"
        >
          <div className="task-filters-sheet__head">
            <h2 className="task-filters-sheet__title">Filtres carte</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Fermer
            </button>
          </div>
          {fields}
          <div className="task-filters-sheet__actions">
            <button type="button" className="btn btn-primary" onClick={close}>
              Appliquer
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}
