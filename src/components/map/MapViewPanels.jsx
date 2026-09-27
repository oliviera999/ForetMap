/**
 * Panneaux autour de la scène de la carte de travail : liste des parcours, recherche et
 * filtres de lieux, reprise et barre d'étape d'un parcours. Plus le style du cadre et le
 * curseur selon le mode.
 *
 * Extraits de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), rendu inchangé. Chacun n'apparaît qu'en mode
 * navigation (`mode === 'view'`), comme avant.
 */
import { MapRoutePicker } from '../../shared/map-routes/MapRoutePicker.jsx';
import { MapRouteBar } from '../../shared/map-routes/MapRouteBar.jsx';
import { isMapLocationFilterActive } from '../../utils/mapLocationFilters.js';
import { MapLocationFiltersBar } from './MapLocationFiltersBar.jsx';
import { MapLocationFilterResults } from './MapLocationFilterResults.jsx';

/** Curseur de la carte selon le mode (navigation, tracé, sommets, alignement, repère). */
const MAP_CURSOR_BY_MODE = {
  view: 'grab',
  'draw-zone': 'crosshair',
  'edit-points': 'default',
  'align-zones': 'pointer',
};

export function mapCursorForMode(mode) {
  return MAP_CURSOR_BY_MODE[mode] || 'cell';
}

/** Style du cadre de la scène : marge uniforme, ou sans marge haute quand la carte est intégrée. */
export function mapCanvasOuterStyle({ embedded, framePaddingPx }) {
  return {
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    ...(embedded
      ? {
          paddingTop: 0,
          paddingLeft: framePaddingPx,
          paddingRight: framePaddingPx,
          paddingBottom: framePaddingPx,
        }
      : { padding: framePaddingPx }),
  };
}

/** Liste des parcours de la carte (hors plein écran). */
export function MapViewRoutePickerRow({ visible, routes, places, open, onToggle, onStart }) {
  if (!visible) return null;
  return (
    <div className="map-view-routes-row" data-testid="map-view-routes-row">
      {/*
        Hors de la barre d'outils (`overflow-x: auto` + `overflow-y: hidden`) : même
        motif que `.plan-filters` — sinon la liste Parcours est coupée / passée sous la
        carte, et la puce disparaît dans le défilement horizontal des commandes.
      */}
      <MapRoutePicker
        routes={routes}
        places={places}
        open={open}
        onToggle={onToggle}
        onStart={onStart}
      />
    </div>
  );
}

/** Recherche et filtres de lieux, avec la liste des résultats quand un filtre est actif. */
export function MapViewLocationSearch({
  visible,
  filters,
  setFilters,
  speciesOptions,
  categoryOptions,
  zoneMatchCount,
  markerMatchCount,
  searchInputRef,
  resultItems,
  onSelectItem,
}) {
  if (!visible) return null;
  return (
    <>
      <MapLocationFiltersBar
        filters={filters}
        setFilters={setFilters}
        speciesOptions={speciesOptions}
        categoryOptions={categoryOptions}
        zoneMatchCount={zoneMatchCount}
        markerMatchCount={markerMatchCount}
        searchInputRef={searchInputRef}
      />
      {isMapLocationFilterActive(filters) && resultItems.length > 0 ? (
        <MapLocationFilterResults items={resultItems} onSelectItem={onSelectItem} />
      ) : null}
    </>
  );
}

/** Reprise d'un parcours quitté, puis barre d'étape du parcours en cours. */
export function MapViewRouteControls({
  visible,
  activeRoute,
  resumableRouteSlug,
  onResume,
  steps,
  index,
  onGoToIndex,
  onExit,
  onHeight,
  canLocate,
  distanceLabel,
}) {
  if (!visible) return null;
  return (
    <>
      {!activeRoute && resumableRouteSlug ? (
        <div className="map-route-resume">
          <button
            type="button"
            className="btn btn-sm btn-primary map-route-resume__btn"
            onClick={onResume}
          >
            Reprendre le parcours
          </button>
        </div>
      ) : null}
      {activeRoute ? (
        <MapRouteBar
          route={activeRoute}
          steps={steps}
          index={index}
          onGoToIndex={onGoToIndex}
          onExit={onExit}
          onHeight={onHeight}
          canLocate={canLocate}
          distanceLabel={distanceLabel}
          hintLocate="Le lieu est mis en avant sur la carte. Utilisez « Me suivre » puis avancez."
          hintManual="Le lieu est mis en avant sur la carte. Avance puis Suivant."
        />
      ) : null}
    </>
  );
}
