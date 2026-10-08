import { useCallback, useEffect, useRef } from 'react';

import { usePlaceFocusSequence } from '../../shared/pct-map/usePlaceFocusSequence.js';
import { usePlaceFocusFx } from '../../shared/pct-map/usePlaceFocusFx.js';
import { BOARD_FOCUS_DEFAULTS } from '../utils/glBoardFocus.js';

/**
 * Plateau GL : zoom bref sur le repère / la zone d'arrivée **avant** le popover, puis retour à la
 * vue d'avant (`useGLBoardFocusRestore`) quand les popovers d'arrivée sont refermés.
 *
 * `beforePresent(target)` est passé aux hooks d'arrivée : ils l'attendent avant d'afficher leur
 * popover. Une séquence rendue caduque (nouvelle arrivée) laisse sa promesse en suspens : la
 * présentation la plus récente l'emporte.
 *
 * `fx` est l'état des effets du zoom (emoji, projecteur, étincelles), à rendre par
 * `PctPlaceFocusFx` dans le calque du plateau.
 *
 * @param {object} options
 * @param {object} options.mapGestures moteur du plateau (`useGlPctMapGestures`)
 * @param {{ enabled?: boolean, durationMs?: number, restoreOnClose?: boolean,
 *   fx?: { emoji?: boolean, spotlight?: boolean, sparkles?: boolean } }} [options.settings]
 * @param {string|number} [options.resetKey] changement de plateau : la vue mémorisée est oubliée.
 */
export function useGLBoardFocus({ mapGestures, settings = BOARD_FOCUS_DEFAULTS, resetKey = '' }) {
  const gesturesRef = useRef(mapGestures);
  gesturesRef.current = mapGestures;
  const getViewport = useCallback(() => gesturesRef.current || null, []);
  const placeFx = usePlaceFocusFx(settings?.fx ?? BOARD_FOCUS_DEFAULTS.fx);
  const focus = usePlaceFocusSequence({
    getViewport,
    enabled: settings?.enabled !== false,
    durationMs: settings?.durationMs ?? BOARD_FOCUS_DEFAULTS.durationMs,
    restoreOnClose: settings?.restoreOnClose !== false,
    resetKey: String(resetKey ?? ''),
    onFx: placeFx.onFx,
  });

  const beforePresent = useCallback(
    (target) => new Promise((resolve) => focus.focusThenOpen(target, resolve)),
    [focus],
  );

  return { beforePresent, restore: focus.restore, forget: focus.forget, fx: placeFx.fx };
}

/**
 * Ramène la vue d'avant le zoom quand le dernier popover d'arrivée se referme.
 * @param {boolean} popoverOpen
 * @param {() => void} restore
 */
export function useGLBoardFocusRestore(popoverOpen, restore) {
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (popoverOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    restore?.();
  }, [popoverOpen, restore]);
}
