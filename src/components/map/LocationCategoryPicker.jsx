/**
 * Sélecteur de catégories d'un lieu (zone ou repère) — cases à cocher.
 *
 * Le catalogue fourni contient déjà les catégories utilisables sur la carte
 * courante (globales + propres à la carte) ; `kind` restreint à celles qui
 * s'appliquent au type de lieu édité.
 *
 * @param {object} props
 * @param {'zone'|'marker'} props.kind
 * @param {object[]} props.catalog catalogue `/api/map-categories`
 * @param {string[]} props.value identifiants sélectionnés
 * @param {(next: string[]) => void} props.onChange
 */
export function LocationCategoryPicker({ kind, catalog = [], value = [], onChange, disabled }) {
  const options = catalog.filter(
    (cat) => cat && (cat.applies_to === 'both' || cat.applies_to === kind),
  );
  const selected = new Set(value.map((id) => String(id)));

  const toggle = (categoryId) => {
    const next = selected.has(categoryId)
      ? value.filter((id) => String(id) !== categoryId)
      : [...value, categoryId];
    onChange(next.map((id) => String(id)));
  };

  if (options.length === 0) {
    return (
      <div className="field">
        <label>Catégories</label>
        <p className="hint">
          Aucune catégorie disponible sur cette carte. Elles se créent dans Réglages → « Catégories
          de lieux ».
        </p>
      </div>
    );
  }

  return (
    <div className="field">
      <label id={`location-categories-${kind}`}>Catégories</label>
      <div
        className="location-category-picker"
        role="group"
        aria-labelledby={`location-categories-${kind}`}
      >
        {options.map((cat) => (
          <label key={cat.id} className="location-category-picker__option">
            <input
              type="checkbox"
              checked={selected.has(String(cat.id))}
              disabled={disabled}
              onChange={() => toggle(String(cat.id))}
            />
            <span
              className="location-category-picker__swatch"
              style={{ background: cat.color || 'transparent' }}
              aria-hidden="true"
            />
            <span>
              {cat.emoji ? <span aria-hidden="true">{cat.emoji} </span> : null}
              {cat.label}
              {cat.is_infrastructure ? (
                <span className="location-category-picker__infra"> (infrastructure)</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Pastilles en lecture seule des catégories d'un lieu (entête de modale, légende). */
export function LocationCategoryBadges({ item, emptyLabel = '' }) {
  const categories = item?.categories || [];
  if (categories.length === 0) {
    return emptyLabel ? <span className="location-category-badge--empty">{emptyLabel}</span> : null;
  }
  return (
    <span className="location-category-badges">
      {categories.map((cat) => (
        <span
          key={cat.id}
          className="location-category-badge"
          style={cat.color ? { background: cat.color } : undefined}
          title={cat.description || undefined}
        >
          {cat.emoji ? <span aria-hidden="true">{cat.emoji} </span> : null}
          {cat.label}
        </span>
      ))}
    </span>
  );
}
