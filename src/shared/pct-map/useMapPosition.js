import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGeolocation } from '../platform/useGeolocation.js';
import {
  applyGeoTransform,
  assessAnchorsGeoPlausibility,
  pctToGeo,
  planSizeMeters,
  solveAffineFromAnchors,
} from './pctGeoTransform.js';
import {
  accuracyRadiusPct,
  clampPositionToMap,
  headingFromDeviceOrientation,
  northOffsetFromProjection,
  screenHeadingDeg,
} from './positionGeometry.js';

/**
 * Position de la personne sur une carte « % image » — noyau carte partagé (lot 6 du plan de
 * convergence, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §4.2).
 *
 * Généralise `useMascotGpsFollow` (ForetMap), qui ne savait que déplacer une mascotte : ici la
 * position est une donnée, et le produit décide de ce qu'il en fait — point bleu sur le plan,
 * mascotte qui suit, ou rien. La position reste **100 % côté client** : elle n'est jamais
 * envoyée au serveur.
 *
 * Le bouton « Me situer » a quatre états, exposés par `mode` :
 * `off` (inactif) → `acquiring` (acquisition) → `on` (position affichée) → `follow` (la carte
 * suit). Un déplacement manuel de la carte repasse de `follow` à `on` (`notifyManualPan`).
 *
 * @param {object} options
 * @param {Array|null} options.georef ancres de calage de la carte (`maps.geo_anchors_json`).
 * @param {boolean} options.gpsEnabled la carte est déclarée géolocalisable.
 * @param {number} [options.accuracyThresholdM=50] au-delà, la position est jugée trop imprécise.
 * @param {boolean} [options.heading=true] écouter le cap de l'appareil (boussole).
 * @returns {object} état de position et commandes.
 */
export function useMapPosition({
  georef,
  gpsEnabled,
  accuracyThresholdM = 50,
  heading: headingEnabled = true,
} = {}) {
  const geo = useGeolocation();
  const [mode, setMode] = useState('off');
  const [feedback, setFeedback] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(null);

  /** Calage résolu une fois par jeu d'ancres (pas à chaque position du capteur). */
  const georefState = useMemo(() => {
    const transform = solveAffineFromAnchors(georef);
    if (!transform) return null;
    const size = planSizeMeters(georef);
    const center = pctToGeo(50, 50, georef);
    return {
      transform,
      plausible: assessAnchorsGeoPlausibility(georef).ok,
      planSize: size,
      northOffsetDeg: northOffsetFromProjection(
        (lat, lng) => applyGeoTransform(transform, lat, lng),
        center || { lat: 0, lng: 0 },
      ),
    };
  }, [georef]);

  const available = !!gpsEnabled && !!georefState && geo.supported;
  const active = mode !== 'off';

  /**
   * Cap de l'appareil : `deviceorientationabsolute` quand le navigateur le propose, sinon
   * `deviceorientation`. iOS demande une permission explicite, réclamée au premier appui sur
   * « Me situer » (`requestHeadingPermission`) ; sans elle, on se passe simplement de flèche.
   */
  useEffect(() => {
    if (!headingEnabled || !active || typeof window === 'undefined') return undefined;
    const onOrientation = (event) => {
      const next = headingFromDeviceOrientation(event);
      if (next != null) setDeviceHeading(next);
    };
    const eventName =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, onOrientation, true);
    return () => window.removeEventListener(eventName, onOrientation, true);
  }, [headingEnabled, active]);

  const requestHeadingPermission = useCallback(async () => {
    const DeviceOrientationEventRef =
      typeof window === 'undefined' ? null : window.DeviceOrientationEvent;
    if (typeof DeviceOrientationEventRef?.requestPermission !== 'function') return true;
    try {
      const result = await DeviceOrientationEventRef.requestPermission();
      return result === 'granted';
    } catch (_) {
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    setMode('off');
    setFeedback(null);
    setDeviceHeading(null);
    geo.stop();
  }, [geo]);

  /** Cycle du bouton : inactif → acquisition/actif → suivi → inactif. */
  const toggle = useCallback(() => {
    if (mode === 'off') {
      if (!available) {
        setFeedback(geo.supported ? 'unavailable' : 'unsupported');
        return;
      }
      setMode('acquiring');
      setFeedback(null);
      geo.start();
      if (headingEnabled) requestHeadingPermission();
      return;
    }
    if (mode === 'follow') {
      stop();
      return;
    }
    setMode('follow');
  }, [mode, available, geo, headingEnabled, requestHeadingPermission, stop]);

  /** Un déplacement manuel de la carte quitte le suivi, sans couper la position. */
  const notifyManualPan = useCallback(() => {
    setMode((prev) => (prev === 'follow' ? 'on' : prev));
  }, []);

  // La carte perd son éligibilité (changement de carte, calage retiré) : on coupe.
  useEffect(() => {
    if (!available && mode !== 'off') stop();
  }, [available, mode, stop]);

  /** Position projetée sur le plan, avec son diagnostic. */
  const projected = useMemo(() => {
    if (!active || !available || !geo.position) return null;
    if (!georefState.plausible) return { code: 'bad_georef' };
    const { lat, lng, accuracy } = geo.position;
    const pct = applyGeoTransform(georefState.transform, lat, lng);
    if (!pct) return { code: 'bad_georef' };
    const placed = clampPositionToMap(pct);
    const lowAccuracy = Number.isFinite(accuracy) && accuracy > accuracyThresholdM;
    return {
      code: placed.offMap ? 'out_of_bounds' : lowAccuracy ? 'low_accuracy' : 'ok',
      pct,
      display: placed,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      haloPct: accuracyRadiusPct(accuracy, georefState.planSize),
    };
  }, [active, available, geo.position, georefState, accuracyThresholdM]);

  // Diagnostic affiché : refus, calage incohérent, erreur d'acquisition, acquisition en
  // cours, hors plan, signal faible — les six états repris de la bannière ForetMap.
  const lastCodeRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    let code = null;
    if (geo.status === 'denied') code = 'denied';
    else if (projected?.code && projected.code !== 'ok') code = projected.code;
    else if (geo.error) code = 'error';
    else if (!geo.position) code = 'acquiring';
    else code = 'ok';
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code;
      setFeedback(code);
    }
  }, [active, geo.status, geo.error, geo.position, projected]);

  // Première position obtenue : on quitte l'état « acquisition ».
  useEffect(() => {
    if (mode === 'acquiring' && projected?.pct) setMode('on');
  }, [mode, projected]);

  const screenHeading = useMemo(
    () => screenHeadingDeg(deviceHeading, georefState?.northOffsetDeg || 0),
    [deviceHeading, georefState],
  );

  return {
    supported: geo.supported,
    available,
    /** `off` | `acquiring` | `on` | `follow` */
    mode,
    active,
    following: mode === 'follow',
    status: geo.status,
    /** `denied` | `bad_georef` | `out_of_bounds` | `low_accuracy` | `acquiring` | `error` | `ok` */
    feedback,
    error: geo.error,
    /** Position réelle sur le plan (peut être hors [0, 100]). */
    positionPct: projected?.pct || null,
    /** Position à dessiner : collée au bord et fléchée quand on est hors du plan. */
    displayPct: projected?.display || null,
    accuracyM: projected?.accuracy ?? null,
    haloPct: projected?.haloPct || 0,
    headingDeg: deviceHeading,
    screenHeadingDeg: screenHeading,
    planSize: georefState?.planSize || null,
    toggle,
    stop,
    notifyManualPan,
  };
}
