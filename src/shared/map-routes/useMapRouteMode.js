import { useCallback, useEffect, useMemo, useState } from 'react';

import { nextRouteIndex, resolveRouteSteps } from './mapRouteSteps.js';

/**
 * État du mode parcours (slug actif, index, reprise) partagé Visite / Carte / Plan.
 *
 * @param {object} options
 * @param {Array<object>} options.routes parcours publiés (étapes déjà filtrées côté serveur si possible)
 * @param {Array<object>} options.places lieux `{ kind, id, name, ... }`
 * @param {(entry: object|null) => void} [options.onStepPlace] appelé quand l'étape courante change
 * @param {() => void} [options.onExitExtra] nettoyage UI à la sortie
 */
export function useMapRouteMode({ routes = [], places = [], onStepPlace, onExitExtra } = {}) {
  const [activeRouteSlug, setActiveRouteSlug] = useState('');
  const [routeIndex, setRouteIndex] = useState(0);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [resumableRouteSlug, setResumableRouteSlug] = useState('');

  const activeRoute = useMemo(
    () => (activeRouteSlug ? routes.find((r) => r.slug === activeRouteSlug) || null : null),
    [activeRouteSlug, routes],
  );
  const routeSteps = useMemo(
    () => (activeRoute ? resolveRouteSteps(activeRoute, places) : []),
    [activeRoute, places],
  );
  const currentRouteEntry = routeSteps[routeIndex] || null;

  useEffect(() => {
    setRouteIndex((current) => nextRouteIndex(current, routeSteps.length, 0));
  }, [routeSteps.length]);

  useEffect(() => {
    onStepPlace?.(currentRouteEntry || null);
  }, [currentRouteEntry, onStepPlace]);

  const startRoute = useCallback((route) => {
    setRoutePickerOpen(false);
    setResumableRouteSlug('');
    setRouteIndex(0);
    setActiveRouteSlug(route.slug);
  }, []);

  const exitRoute = useCallback(() => {
    const slug = activeRouteSlug;
    setActiveRouteSlug('');
    setRouteIndex(0);
    onExitExtra?.();
    if (slug) setResumableRouteSlug(slug);
  }, [activeRouteSlug, onExitExtra]);

  const resumeRoute = useCallback(() => {
    const route = routes.find((r) => r.slug === resumableRouteSlug);
    if (route) startRoute(route);
  }, [routes, resumableRouteSlug, startRoute]);

  const goToRouteIndex = useCallback(
    (next) => {
      setRouteIndex(nextRouteIndex(next, routeSteps.length, 0));
    },
    [routeSteps.length],
  );

  /** Quitte le parcours si la carte change (évite un slug d'une autre carte). */
  const resetForMapChange = useCallback(() => {
    setActiveRouteSlug('');
    setRouteIndex(0);
    setRoutePickerOpen(false);
    setResumableRouteSlug('');
  }, []);

  return {
    activeRoute,
    activeRouteSlug,
    routeSteps,
    routeIndex,
    currentRouteEntry,
    routePickerOpen,
    setRoutePickerOpen,
    resumableRouteSlug,
    startRoute,
    exitRoute,
    resumeRoute,
    goToRouteIndex,
    resetForMapChange,
  };
}
