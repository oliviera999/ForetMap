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
export function MapLocationFilterFields({
  filters,
  setFilters,
  speciesOptions = [],
  categoryOptions = [],
}) {
  const set = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const toggleCategory = (categoryId) => {
    setFilters((prev) => {
      const cur = prev.categoryIds || [];
      const next = cur.includes(categoryId)
        ? cur.filter((id) => id !== categoryId)
        : [...cur, categoryId];
      return { ...prev, categoryIds: next };
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

      {categoryOptions.length > 0 && (
        <fieldset className="map-location-filters-fieldset">
          <legend>Catégories</legend>
          <div className="map-location-filters-checks">
            {categoryOptions.map((cat) => (
              <label key={cat.id} className="map-location-filters-check">
                <input
                  type="checkbox"
                  checked={(filters.categoryIds || []).includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                />
                <span>
                  {cat.emoji ? <span aria-hidden="true">{cat.emoji} </span> : null}
                  {cat.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="map-location-filters-check map-location-filters-check--solo">
        <input
          type="checkbox"
          checked={!!filters.infrastructureOnly}
          onChange={(e) => set({ infrastructureOnly: e.target.checked })}
        />
        <span>Infrastructures uniquement</span>
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
