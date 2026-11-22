import { GRAPH_PRESET_LABELS } from './foodWebGraphModel.js';

const PRESET_KEYS = ['alimentaire', 'relations', 'all'];

/**
 * Filtres du réseau trophique (sortis de `FoodWebView.jsx`, flux C3) : cadrage, carte, zone,
 * type d'interaction (cadrage « Tout » seulement) et affichage graphe / liste.
 */
export function FoodWebFilters({
  graphPreset,
  onPresetChange,
  maps,
  mapId,
  onMapChange,
  zones,
  zoneId,
  onZoneChange,
  interactionFilter,
  onInteractionFilterChange,
  interactionTypes,
  typeLabel,
  viewMode,
  onViewModeChange,
}) {
  return (
    <div className="pedago-filters card pedago-foodweb__filters">
      <div
        className="pedago-filter-field pedago-foodweb__presets"
        role="group"
        aria-label="Cadrage du réseau"
      >
        <span>Cadrage</span>
        <div className="pedago-foodweb__preset-btns">
          {PRESET_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`pedago-chip-btn${graphPreset === key ? ' active' : ''}`}
              aria-pressed={graphPreset === key}
              onClick={() => onPresetChange(key)}
            >
              {GRAPH_PRESET_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      {maps.length > 0 ? (
        <label className="pedago-filter-field">
          <span>Carte</span>
          <select
            className="form-select"
            value={mapId}
            onChange={(e) => onMapChange(e.target.value)}
          >
            <option value="">Toutes les cartes</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mapId && zones.length > 0 ? (
        <label className="pedago-filter-field">
          <span>Zone</span>
          <select
            className="form-select"
            value={zoneId}
            onChange={(e) => onZoneChange(e.target.value)}
          >
            <option value="">Toute la carte</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name || `Zone ${z.id}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {graphPreset === 'all' ? (
        <label className="pedago-filter-field">
          <span>Type d&apos;interaction</span>
          <select
            className="form-select"
            value={interactionFilter}
            onChange={(e) => onInteractionFilterChange(e.target.value)}
          >
            <option value="">Tous</option>
            {interactionTypes.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="pedago-filter-field">
        <span>Affichage</span>
        <select
          className="form-select"
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value)}
        >
          <option value="graph">Graphe</option>
          <option value="list">Liste</option>
        </select>
      </label>
    </div>
  );
}
