import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  safeLocalStorageReadJson,
  safeLocalStorageRemoveItem,
  safeLocalStorageWriteJson,
} from '../platform/browserStorage.js';

import { nextRouteIndex, resolveRouteSteps } from './mapRouteSteps.js';

/**
 * Lecture défensive de la reprise mémorisée : la valeur vient du navigateur, elle peut avoir
 * été écrite par une version antérieure — ou à la main.
 */
function readStoredResume(storageKey) {
  if (!storageKey) return null;
  const raw = safeLocalStorageReadJson(storageKey, null);
  const slug = String(raw?.slug || '').trim();
  if (!slug) return null;
  const index = Number(raw?.index);
  return { slug, index: Number.isFinite(index) && index > 0 ? Math.floor(index) : 0 };
}

/**
 * État du mode parcours (parcours actif, étape courante, aperçu d'un lieu, reprise), partagé
 * par les **trois** surfaces : Visite, carte de travail et les deux plans.
 *
 * Il n'y avait pas de partage jusqu'ici : ce hook servait la Visite et la carte, tandis que
 * `src/plan/AppPlan.jsx` portait sa propre copie de l'état — divergente sur trois points
 * (toast de sortie, mesure d'usage, aperçu d'un lieu pendant le parcours), et qu'il aurait
 * fallu corriger deux fois (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.5). Les trois apports du
 * plan sont repris ici, sous forme de rappels optionnels : une surface qui ne les fournit pas
 * se comporte exactement comme avant.
 *
 * **Reprise.** Quitter un parcours mémorise le parcours *et l'étape* : « Reprendre » rend la
 * main là où on l'a laissée, et non à l'étape 1 comme auparavant (§2.2). Avec `storageKey`,
 * la reprise survit à un rechargement de page — le cas du visiteur qui a scanné un QR code et
 * verrouille son téléphone entre deux étapes. Rien d'autre n'est enregistré, et rien ne part
 * vers le serveur : c'est la promesse faite au visiteur.
 *
 * @param {object} options
 * @param {Array<object>} options.routes parcours publiés (étapes déjà filtrées côté serveur si possible)
 * @param {Array<object>} options.places lieux `{ kind, id, name, ... }`
 * @param {(entry: object|null) => void} [options.onStepPlace] appelé quand l'étape courante change
 * @param {() => void} [options.onStartExtra] nettoyage UI au démarrage (fermer une liste, un groupe…)
 * @param {() => void} [options.onExitExtra] nettoyage UI à la sortie
 * @param {(slug: string) => void} [options.onExit] appelé après la sortie (toast de rappel)
 * @param {(event: 'route_start'|'route_step', detail: string) => void} [options.onUsage] mesure d'usage
 * @param {string} [options.storageKey] clé de persistance de la reprise ; absente = mémoire seule
 */
export function useMapRouteMode({
  routes = [],
  places = [],
  onStepPlace,
  onStartExtra,
  onExitExtra,
  onExit,
  onUsage,
  storageKey = '',
} = {}) {
  const [activeRouteSlug, setActiveRouteSlug] = useState('');
  const [routeIndex, setRouteIndex] = useState(0);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [resume, setResume] = useState(() => readStoredResume(storageKey));
  /** Lieu consulté **pendant** un parcours : l'étape courante garde la sélection. */
  const [peekPlace, setPeekPlace] = useState(null);

  const activeRoute = useMemo(
    () => (activeRouteSlug ? routes.find((r) => r.slug === activeRouteSlug) || null : null),
    [activeRouteSlug, routes],
  );
  const routeSteps = useMemo(
    () => (activeRoute ? resolveRouteSteps(activeRoute, places) : []),
    [activeRoute, places],
  );
  const currentRouteEntry = routeSteps[routeIndex] || null;

  /**
   * Un rafraîchissement du contenu peut raccourcir un parcours en cours (une étape dont le
   * lieu vient d'être retiré). Sans rebornage, la position resterait au-delà de la dernière
   * étape et la barre basculerait sur « pas encore d'étape affichable »
   * (`docs/AUDIT_PARCOURS_2026-09.md` §2.6).
   */
  useEffect(() => {
    setRouteIndex((current) => nextRouteIndex(current, routeSteps.length, 0));
  }, [routeSteps.length]);

  useEffect(() => {
    onStepPlace?.(currentRouteEntry || null);
    // Changer d'étape rend la main au parcours : l'aperçu ouvert sur un autre lieu se ferme.
    if (currentRouteEntry) setPeekPlace(null);
  }, [currentRouteEntry, onStepPlace]);

  /** Mémorise la reprise sur l'appareil (ou l'efface), sans jamais faire échouer un rendu. */
  const persistResume = useCallback(
    (value) => {
      if (!storageKey) return;
      if (value?.slug) safeLocalStorageWriteJson(storageKey, value);
      else safeLocalStorageRemoveItem(storageKey);
    },
    [storageKey],
  );

  /** Démarre un parcours à une étape donnée (0 depuis la puce, la position mémorisée à la reprise). */
  const startRouteAt = useCallback(
    (route, index) => {
      if (!route?.slug) return;
      setRoutePickerOpen(false);
      setPeekPlace(null);
      setResume(null);
      persistResume(null);
      onStartExtra?.();
      setRouteIndex(Math.max(0, Number(index) || 0));
      setActiveRouteSlug(route.slug);
      onUsage?.('route_start', route.slug);
    },
    [onStartExtra, onUsage, persistResume],
  );

  const startRoute = useCallback((route) => startRouteAt(route, 0), [startRouteAt]);

  /** Index courant lu au moment de la sortie, sans faire dépendre `exitRoute` du rendu. */
  const routeIndexRef = useRef(0);
  routeIndexRef.current = routeIndex;

  const exitRoute = useCallback(() => {
    const slug = activeRouteSlug;
    const index = routeIndexRef.current;
    setActiveRouteSlug('');
    setRouteIndex(0);
    setPeekPlace(null);
    onExitExtra?.();
    if (!slug) return;
    const next = { slug, index };
    setResume(next);
    persistResume(next);
    onExit?.(slug);
  }, [activeRouteSlug, onExit, onExitExtra, persistResume]);

  const resumeRoute = useCallback(() => {
    const route = routes.find((r) => r.slug === resume?.slug);
    if (route) startRouteAt(route, resume?.index || 0);
  }, [routes, resume, startRouteAt]);

  const goToRouteIndex = useCallback(
    (next) => {
      const index = nextRouteIndex(next, routeSteps.length, 0);
      setRouteIndex(index);
      onUsage?.('route_step', `${activeRouteSlug}#${index + 1}`);
    },
    [routeSteps.length, activeRouteSlug, onUsage],
  );

  /**
   * Quitte le parcours si la carte change (évite un slug d'une autre carte) et **relit** la
   * reprise mémorisée pour la carte désormais affichée.
   *
   * Elle n'est pas effacée : `storageKey` porte déjà l'identifiant de carte, et l'effacer
   * ici viderait le stockage au montage — l'effet qui appelle cette fonction se déclenche une
   * première fois avec la carte initiale, avant tout changement.
   */
  const resetForMapChange = useCallback(() => {
    setActiveRouteSlug('');
    setRouteIndex(0);
    setRoutePickerOpen(false);
    setPeekPlace(null);
    setResume(readStoredResume(storageKey));
  }, [storageKey]);

  /**
   * La clé de reprise change quand la carte change, même sans passer par
   * `resetForMapChange` : on relit alors la reprise de la nouvelle carte, plutôt que de
   * garder en mémoire celle de la précédente.
   */
  const storageKeyRef = useRef(storageKey);
  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    setResume(readStoredResume(storageKey));
  }, [storageKey]);

  /**
   * Une reprise mémorisée qui ne désigne plus rien (parcours dépublié, supprimé, renommé, ou
   * carte changée depuis) ne doit pas laisser un bouton « Reprendre » qui ne fait rien.
   * Le contenu chargé fait foi ; on attend qu'il arrive avant de conclure.
   */
  useEffect(() => {
    if (!resume?.slug || routes.length === 0) return;
    if (routes.some((route) => route.slug === resume.slug)) return;
    setResume(null);
    persistResume(null);
  }, [routes, resume, persistResume]);

  return {
    activeRoute,
    activeRouteSlug,
    routeSteps,
    routeIndex,
    currentRouteEntry,
    routePickerOpen,
    setRoutePickerOpen,
    resumableRouteSlug: resume?.slug || '',
    resumableRouteIndex: resume?.index || 0,
    peekPlace,
    setPeekPlace,
    startRoute,
    startRouteAt,
    exitRoute,
    resumeRoute,
    goToRouteIndex,
    resetForMapChange,
  };
}
