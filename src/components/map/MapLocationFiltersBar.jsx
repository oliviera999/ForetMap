import { useEffect, useMemo, useRef, useState } from 'react';

import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
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
import { IconClose, IconFilter } from '../../shared/icons.jsx';

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
          <IconFilter size={14} />
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
            <IconClose size={14} />
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
              <IconClose size={14} />
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
        <BottomSheet
          open={open}
          onClose={close}
          title={
            <>
              <IconFilter size={14} /> Filtres
            </>
          }
          ariaLabel="Filtres carte"
          closeLabel="Fermer les filtres"
          className="task-filters-sheet map-location-filters-sheet"
          initialSnap="half"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearAll}
                disabled={!filterActive}
              >
                Réinitialiser
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={close}>
                Voir la carte
              </button>
            </>
          }
        >
          {fields}
        </BottomSheet>
      )}
    </div>
  );
}
