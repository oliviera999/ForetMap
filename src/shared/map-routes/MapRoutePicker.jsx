import { useMemo } from 'react';

import { resolveRouteSteps } from './mapRouteSteps.js';

/**
 * Puce « Parcours » et liste des parcours publiés sur une surface (Plan, Visite, Carte).
 *
 * Un parcours **sans étape affichable** n'est pas proposé, et le nombre annoncé est celui des
 * étapes **réellement affichables** : celles dont le lieu est présent dans `places`, exactement
 * ce que comptera la barre d'étape. Sans `places` (`null` / `undefined`), on retombe sur les
 * étapes servies par l'API — utile pendant le premier rendu avant l'arrivée des lieux.
 * Un tableau vide, lui, filtre vraiment (aucun lieu connu → aucune offre).
 * (`docs/AUDIT_PARCOURS_2026-09.md` §2.4, versant client).
 */
export function MapRoutePicker({ routes, places, onStart, open, onToggle, className = '' }) {
  const offered = useMemo(
    () =>
      (routes || [])
        .map((route) => ({
          route,
          count:
            places == null ? (route?.steps || []).length : resolveRouteSteps(route, places).length,
        }))
        .filter((entry) => entry.count > 0),
    [routes, places],
  );
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
          {offered.map(({ route, count }) => (
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
                  {count} étape{count > 1 ? 's' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
