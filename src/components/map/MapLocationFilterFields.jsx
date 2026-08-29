import { STAGE_LABELS } from '../../constants/garden.js';

const STAGE_OPTIONS = ['empty', 'growing', 'ready', 'special'];

const KIND_OPTIONS = [
  { value: 'both', label: 'Tout' },
  { value: 'zones', label: 'Zones' },
  { value: 'markers', label: 'Repères' },
];

const TRI_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'yes', label: 'Avec' },
  { value: 'no', label: 'Sans' },
];

/**
 * Champs de filtrage zones / repères (panneau ou feuille modale).
 */
export function MapLocationFilterFields({ filters, setFilters, speciesOptions = [] }) {
  const set = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const toggleStage = (stage) => {
    setFilters((prev) => {
      const cur = prev.stages || [];
      const next = cur.includes(stage) ? cur.filter((s) => s !== stage) : [...cur, stage];
      return { ...prev, stages: next };
    });
  };

  return (
    <div className="task-filters-fields map-location-filters-fields">
      <fieldset className="map-location-filters-fieldset">
        <legend>Type</legend>
        <div className="map-location-filters-pills" role="group" aria-label="Type de lieu">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn-sm ${filters.kinds === opt.value ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={filters.kinds === opt.value}
              onClick={() => set({ kinds: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="map-location-filters-fieldset">
        <legend>État des zones</legend>
        <div className="map-location-filters-checks">
          {STAGE_OPTIONS.map((stage) => (
            <label key={stage} className="map-location-filters-check">
              <input
                type="checkbox"
                checked={(filters.stages || []).includes(stage)}
                onChange={() => toggleStage(stage)}
              />
              <span>{STAGE_LABELS[stage] || stage}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="map-location-filters-check map-location-filters-check--solo">
        <input
          type="checkbox"
          checked={!!filters.specialOnly}
          onChange={(e) => set({ specialOnly: e.target.checked })}
        />
        <span>Zones spéciales (infra) uniquement</span>
      </label>

      <label className="map-location-filters-select-wrap">
        <span>Espèce présente</span>
        <select
          value={filters.speciesId || ''}
          onChange={(e) => set({ speciesId: e.target.value })}
          aria-label="Filtrer par espèce"
        >
          <option value="">Toutes</option>
          {speciesOptions.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.label}
            </option>
          ))}
        </select>
      </label>

      <label className="map-location-filters-select-wrap">
        <span>Tâches liées</span>
        <select
          value={filters.hasTasks || ''}
          onChange={(e) => set({ hasTasks: e.target.value })}
          aria-label="Filtrer par présence de tâches"
        >
          {TRI_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="map-location-filters-select-wrap">
        <span>Tutoriels liés</span>
        <select
          value={filters.hasTutorials || ''}
          onChange={(e) => set({ hasTutorials: e.target.value })}
          aria-label="Filtrer par présence de tutoriels"
        >
          {TRI_OPTIONS.map((o) => (
            <option key={`t-${o.value || 'all'}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
