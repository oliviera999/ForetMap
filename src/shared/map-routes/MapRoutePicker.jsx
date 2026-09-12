/**
 * Puce « Parcours » et liste des parcours publiés sur une surface (Plan, Visite, Carte).
 *
 * Un parcours **sans étape affichable** n'est pas proposé.
 */
export function MapRoutePicker({ routes, onStart, open, onToggle, className = '' }) {
  const offered = (routes || []).filter((route) => (route?.steps || []).length > 0);
  if (offered.length === 0) return null;
  return (
    <div className={`map-routes plan-routes${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={`map-chip map-chip--routes plan-chip plan-chip--routes${open ? ' is-active' : ''}`}
        aria-expanded={open}
        data-testid="map-route-picker"
        onClick={() => onToggle(!open)}
      >
        Parcours
        <span className="map-chip__count plan-chip__count">{offered.length}</span>
      </button>
      {open ? (
        <ul className="map-routes__list plan-routes__list">
          {offered.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                className="map-routes__item plan-routes__item"
                onClick={() => onStart(route)}
              >
                <span className="map-routes__title plan-routes__title">{route.title}</span>
                {route.audience ? (
                  <span className="map-routes__audience plan-routes__audience">
                    {route.audience}
                  </span>
                ) : null}
                <span className="map-routes__steps plan-routes__steps">
                  {route.steps.length} étape{route.steps.length > 1 ? 's' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
