import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  /**
   * Étape où l'on a quitté : « Reprendre le parcours » reprenait à l'étape 1, alors que le
   * bouton promet la reprise (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.2). Quitter à l'étape 7
   * sur 9 pour regarder un autre lieu obligeait à toucher « Suivant » six fois.
   */
  const resumableRouteIndexRef = useRef(0);

  const activeRoute = useMemo(
    () => (activeRouteSlug ? routes.find((r) => r.slug === activeRouteSlug) || null : null),
    [activeRouteSlug, routes],
  );
  const routeSteps = useMemo(
    () => (activeRoute ? resolveRouteSteps(activeRoute, places) : []),
    [activeRoute, places],
  );
  const currentRouteEntry = routeSteps[routeIndex] || null;
  /** Index courant en lecture impérative : `exitRoute` le retient sans se redéclarer à chaque étape. */
  const routeIndexRef = useRef(routeIndex);
  routeIndexRef.current = routeIndex;

  useEffect(() => {
    setRouteIndex((current) => nextRouteIndex(current, routeSteps.length, 0));
  }, [routeSteps.length]);

  useEffect(() => {
    onStepPlace?.(currentRouteEntry || null);
  }, [currentRouteEntry, onStepPlace]);

  /** Départ d'un parcours : toujours à la première étape (c'est « Reprendre » qui restitue). */
  const startRoute = useCallback((route) => {
    setRoutePickerOpen(false);
    setResumableRouteSlug('');
    resumableRouteIndexRef.current = 0;
    setRouteIndex(0);
    setActiveRouteSlug(route.slug);
  }, []);

  const exitRoute = useCallback(() => {
    const slug = activeRouteSlug;
    resumableRouteIndexRef.current = slug ? routeIndexRef.current : 0;
    setActiveRouteSlug('');
    setRouteIndex(0);
    onExitExtra?.();
    if (slug) setResumableRouteSlug(slug);
  }, [activeRouteSlug, onExitExtra]);

  /** Reprise : on retrouve l'étape quittée, et non la première. */
  const resumeRoute = useCallback(() => {
    const route = routes.find((r) => r.slug === resumableRouteSlug);
    if (!route) return;
    const resumeIndex = resumableRouteIndexRef.current;
    setRoutePickerOpen(false);
    setResumableRouteSlug('');
    setActiveRouteSlug(route.slug);
    // Le rebornage sur le nombre d'étapes réellement résolues est fait par l'effet ci-dessus :
    // un parcours dont des lieux ont disparu depuis la sortie ne peut pas reprendre dans le vide.
    setRouteIndex(resumeIndex);
  }, [routes, resumableRouteSlug]);

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
    resumableRouteIndexRef.current = 0;
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
