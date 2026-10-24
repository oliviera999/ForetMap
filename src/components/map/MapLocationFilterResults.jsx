import { useEffect, useState } from 'react';

/**
 * Liste cliquable des zones / repères correspondant aux filtres.
 *
 * `collapsedByDefault` : repliée tant que les filtres sont ceux posés d'office (catégories
 * par défaut de la carte) ; se déplie dès que l'utilisateur modifie les filtres.
 */
export function MapLocationFilterResults({ items = [], collapsedByDefault = false, onSelectItem }) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault);

  useEffect(() => {
    setCollapsed(collapsedByDefault);
  }, [collapsedByDefault]);

  if (!items.length) return null;

  return (
    <div className="map-location-filter-results">
      <button
        type="button"
        className="map-location-filter-results__toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span>Résultats ({items.length})</span>
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <ul
          className="map-location-filter-results__list"
          role="listbox"
          aria-label="Lieux correspondants"
        >
          {items.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <button
                type="button"
                className="map-location-filter-results__item"
                role="option"
                onClick={() => onSelectItem?.(row)}
              >
                <span className="map-location-filter-results__emoji" aria-hidden="true">
                  {row.emoji}
                </span>
                <span className="map-location-filter-results__body">
                  <span className="map-location-filter-results__title">{row.title}</span>
                  {row.subtitle ? (
                    <span className="map-location-filter-results__subtitle">{row.subtitle}</span>
                  ) : null}
                </span>
                <span className="map-location-filter-results__kind">
                  {row.kind === 'zone' ? 'Zone' : 'Repère'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
