import { useCallback, useEffect, useMemo, useRef } from 'react';

import { placeFocusTarget } from './placeFocusTarget.js';

/**
 * Séquence « zoom sur le lieu, puis fiche, puis retour à la vue d'avant », commune aux cartes
 * (carte de travail, Visite, Plan, plateaux GL).
 *
 * - `focusThenOpen(place, open)` mémorise la vue courante (une seule fois tant qu'une fiche est
 *   ouverte : enchaîner plusieurs lieux garde la vue d'origine), cadre le lieu, puis appelle
 *   `open()`. Un geste qui interrompt le zoom n'empêche pas l'ouverture.
 * - `restore()` ramène la vue mémorisée en douceur, puis l'oublie.
 * - Désactivée (`enabled: false`), la séquence ouvre tout de suite et ne touche pas à la vue.
 *
 * Le moteur de vue est lu à l'appel (`getViewport()`), pas capturé : les produits le reçoivent
 * par un pont (`onViewportChange`) qui change d'identité au fil des rendus.
 *
 * `onFx(event)` accompagne les vols **réellement animés** d'effets visuels
 * (`usePlaceFocusFx`) : `{ type: 'in' | 'out', place, fromScale, toScale, durationMs }`, et
 * `{ type: 'cancel' }` quand la séquence est abandonnée sans retour animé.
 *
 * @param {object} options
 * @param {() => ({ flyToPctBounds?: Function, restoreViewAnimated?: Function,
 *   getViewSnapshot?: Function }|null)} options.getViewport
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.durationMs=350]
 * @param {number} [options.maxZoom=4] zoom maximal, en multiple de la carte entière.
 * @param {boolean} [options.restoreOnClose=true]
 * @param {string} [options.resetKey] changement de carte : la vue mémorisée est oubliée.
 * @param {(event: object) => void} [options.onFx]
 */
export function usePlaceFocusSequence({
  getViewport,
  enabled = true,
  durationMs = 350,
  maxZoom = 4,
  restoreOnClose = true,
  resetKey = '',
  onFx = null,
} = {}) {
  const optsRef = useRef({});
  optsRef.current = { getViewport, enabled, durationMs, maxZoom, restoreOnClose, onFx };
  const snapshotRef = useRef(null);
  /** Dernier lieu cadré : c'est sur lui que l'effet de retour « atterrit ». */
  const placeRef = useRef(null);
  /** Jeton de séquence : un nouveau clic ou une fermeture rend caduque l'ouverture en attente. */
  const tokenRef = useRef(0);

  useEffect(() => {
    snapshotRef.current = null;
    placeRef.current = null;
    tokenRef.current += 1;
    optsRef.current.onFx?.({ type: 'cancel' });
  }, [resetKey]);

  useEffect(
    () => () => {
      tokenRef.current += 1;
    },
    [],
  );

  const focusThenOpen = useCallback((place, open, { insets = null } = {}) => {
    const o = optsRef.current;
    const token = ++tokenRef.current;
    const run = () => {
      if (token === tokenRef.current) open?.();
    };
    if (!o.enabled) {
      run();
      return;
    }
    const vp = o.getViewport?.() || null;
    const target = placeFocusTarget(place, { maxZoom: o.maxZoom });
    if (!vp || typeof vp.flyToPctBounds !== 'function' || !target) {
      run();
      return;
    }
    if (!snapshotRef.current) snapshotRef.current = vp.getViewSnapshot?.() || null;
    placeRef.current = place;
    const flight = vp.flyToPctBounds(target.points, {
      insets,
      maxZoom: target.maxZoom,
      duration: o.durationMs,
      onPlan: (plan) => o.onFx?.({ type: 'in', place, ...plan }),
    });
    // Rien à animer (cadre non mesuré, mouvement réduit) : la fiche s'ouvre dans le même tour.
    if (flight && typeof flight.then === 'function') flight.then(run, run);
    else run();
  }, []);

  const restore = useCallback(() => {
    const o = optsRef.current;
    tokenRef.current += 1;
    const snapshot = snapshotRef.current;
    const place = placeRef.current;
    snapshotRef.current = null;
    placeRef.current = null;
    if (!o.enabled || !o.restoreOnClose || !snapshot) {
      o.onFx?.({ type: 'cancel' });
      return;
    }
    const vp = o.getViewport?.() || null;
    let announced = false;
    vp?.restoreViewAnimated?.(snapshot, {
      duration: o.durationMs,
      onPlan: (plan) => {
        announced = true;
        o.onFx?.({ type: 'out', place, ...plan });
      },
    });
    if (!announced) o.onFx?.({ type: 'cancel' });
  }, []);

  /** Oublie la vue mémorisée et toute ouverture en attente, sans bouger la carte. */
  const forget = useCallback(() => {
    tokenRef.current += 1;
    snapshotRef.current = null;
    placeRef.current = null;
    optsRef.current.onFx?.({ type: 'cancel' });
  }, []);

  const hasSnapshot = useCallback(() => snapshotRef.current != null, []);

  return useMemo(
    () => ({ focusThenOpen, restore, forget, hasSnapshot }),
    [focusThenOpen, restore, forget, hasSnapshot],
  );
}
