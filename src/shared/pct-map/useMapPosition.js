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
  pickTravelHeadingDeg,
  screenHeadingDeg,
} from './positionGeometry.js';
import {
  HEADING_DEAD_BAND_DEG,
  smoothHeadingOverTime,
  unwrapHeadingDeg,
} from './pctMapOrientation.js';
import { destinationLatLng, nextFilteredGeoFix } from './geoPositionFilter.js';
import {
  POSITION_EXTRAPOLATION_MAX_M,
  POSITION_EXTRAPOLATION_MIN_SPEED_MS,
  easePctToward,
  extrapolatedPct,
  pctDistance,
} from './positionSmoothing.js';

/**
 * Cadence de publication du cap (ms). La boussole émet jusqu'à 60 fois par seconde : republier
 * à ce rythme re-rendrait toute la carte à chaque image, pour des fractions de degré. On lisse
 * dans une ref, on publie huit fois par seconde, et la transition CSS du calque d'orientation
 * comble les intervalles (`mapOrientationStyle({ animated: true })`).
 */
const HEADING_PUBLISH_INTERVAL_MS = 120;

/**
 * Au-delà de ce silence (ms), la dernière mesure GPS ne dit plus rien du déplacement : on
 * revient à la boussole plutôt que de figer une flèche sur une direction périmée.
 */
const GPS_HEADING_STALE_MS = 4000;

/**
 * Cadence de publication du repère (ms). Même raisonnement que pour le cap : on calcule dans
 * une ref, on publie une douzaine de fois par seconde, et la transition CSS du repère comble
 * les intervalles. Marcher ne coûte donc pas soixante rendus par seconde.
 */
const POSITION_PUBLISH_INTERVAL_MS = 80;

/**
 * Déplacement (en % de plan) sous lequel republier ne montrerait rien : à cette échelle, le
 * repère n'a pas bougé d'un pixel.
 */
const POSITION_PUBLISH_DEAD_BAND_PCT = 0.02;

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
  /** Dernière mesure filtrée (Kalman 1-D + rejet des sauts) — la seule qui soit affichée. */
  const [fix, setFix] = useState(null);
  const fixRef = useRef(null);
  fixRef.current = fix;
  /** Dernier échantillon boussole brut, hors React : il arrive trop vite pour un rendu. */
  const compassRef = useRef(null);
  /** Dernière mesure projetée et sa vitesse sur le plan : l'ancre du rendu continu. */
  const anchorRef = useRef(null);
  /** Position réellement dessinée, rattrapée image après image. */
  const renderRef = useRef(null);
  const [smoothPct, setSmoothPct] = useState(null);
  /**
   * Réglage « mouvement réduit » de l'appareil : la personne a demandé qu'on ne fasse rien
   * glisser. Le repère se pose alors sur chaque mesure, sans rattrapage ni prolongation.
   */
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotionRef.current = !!media.matches;
    };
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);
  /** Cap lissé courant (géographique), sa version écran continue, et la source retenue. */
  const headingRef = useRef({ geoDeg: null, unwrapped: null, source: null, at: 0 });
  const [heading, setHeading] = useState({
    geoDeg: null,
    screenDeg: null,
    unwrapped: null,
    source: null,
  });

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
      if (next != null) compassRef.current = next;
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
    setFix(null);
    anchorRef.current = null;
    renderRef.current = null;
    setSmoothPct(null);
    compassRef.current = null;
    headingRef.current = { geoDeg: null, unwrapped: null, source: null, at: 0 };
    setHeading({ geoDeg: null, screenDeg: null, unwrapped: null, source: null });
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

  /**
   * Passe en suivi si la position est déjà active (ex. activation de l'orientation
   * boussole : coller le GPS au centre). Sans effet si inactif / en acquisition.
   */
  const ensureFollow = useCallback(() => {
    setMode((prev) => (prev === 'on' ? 'follow' : prev));
  }, []);

  // La carte perd son éligibilité (changement de carte, calage retiré) : on coupe.
  useEffect(() => {
    if (!available && mode !== 'off') stop();
  }, [available, mode, stop]);

  /**
   * Filtrage des mesures avant tout affichage : rejet des sauts invraisemblables, puis lissage
   * de Kalman pondéré par la précision annoncée (`geoPositionFilter.js`). C'est ici que se joue
   * l'essentiel de la stabilité du point : sans ce filtre, le capteur fait trembler la position
   * de plusieurs mètres à l'arrêt, et le mode suivi promène la carte avec lui.
   */
  useEffect(() => {
    if (!active || !geo.position) return;
    const next = nextFilteredGeoFix(fixRef.current, geo.position);
    if (!next || next.rejected) return;
    fixRef.current = next;
    setFix(next);
  }, [active, geo.position]);

  /** Position projetée sur le plan, avec son diagnostic. */
  const projected = useMemo(() => {
    if (!active || !available || !fix) return null;
    if (!georefState.plausible) return { code: 'bad_georef' };
    const { lat, lng, accuracy } = fix;
    const pct = applyGeoTransform(georefState.transform, lat, lng);
    if (!pct) return { code: 'bad_georef' };
    const placed = clampPositionToMap(pct);
    const lowAccuracy = Number.isFinite(accuracy) && accuracy > accuracyThresholdM;
    // Vitesse **sur le plan** : le point atteint en une seconde le long de la route suivie,
    // passé par le même calage. Le plan peut être tourné ou d'échelle différente en x et en y,
    // la projection s'en charge — un calcul d'angle à la main s'y serait trompé.
    const speed = Number(fix.speed);
    const course = Number(fix.heading);
    let velocityPct = null;
    if (
      Number.isFinite(speed) &&
      speed >= POSITION_EXTRAPOLATION_MIN_SPEED_MS &&
      Number.isFinite(course)
    ) {
      const ahead = destinationLatLng({ lat, lng }, course, speed);
      const pctAhead = ahead && applyGeoTransform(georefState.transform, ahead.lat, ahead.lng);
      if (pctAhead) velocityPct = { xp: pctAhead.xp - pct.xp, yp: pctAhead.yp - pct.yp };
    }
    return {
      code: placed.offMap ? 'out_of_bounds' : lowAccuracy ? 'low_accuracy' : 'ok',
      pct,
      velocityPct,
      display: placed,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      haloPct: accuracyRadiusPct(accuracy, georefState.planSize),
    };
  }, [active, available, fix, georefState, accuracyThresholdM]);

  /**
   * Continuité du repère (`positionSmoothing.js`) : chaque mesure **déplace une cible** que le
   * rendu rejoint en douceur, et cette cible avance seule entre deux mesures tant que le
   * capteur annonce un déplacement. Le repère cesse donc de sauter une fois par seconde — et,
   * en mode suivi, la carte avec lui.
   *
   * La borne de distance est exprimée en % de plan à partir de sa taille réelle : huit mètres
   * de prolongation, jamais plus, quelle que soit la vitesse annoncée.
   */
  const maxExtrapolationPct = useMemo(() => {
    const widthM = Number(georefState?.planSize?.widthM);
    const heightM = Number(georefState?.planSize?.heightM);
    if (!(widthM > 0) || !(heightM > 0)) return 0;
    return POSITION_EXTRAPOLATION_MAX_M * Math.max(100 / widthM, 100 / heightM);
  }, [georefState]);

  useEffect(() => {
    if (!projected?.pct) return;
    anchorRef.current = {
      pct: projected.pct,
      velocityPct: reducedMotionRef.current ? null : projected.velocityPct,
      at: Date.now(),
    };
    // Mouvement réduit : la personne a demandé qu'on ne fasse pas glisser les choses.
    if (reducedMotionRef.current) {
      renderRef.current = { pct: projected.pct, at: Date.now() };
      setSmoothPct(projected.pct);
    }
  }, [projected]);

  useEffect(() => {
    if (!active || reducedMotionRef.current) return undefined;
    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const now = Date.now();
      const target = extrapolatedPct(anchor, now, { maxPct: maxExtrapolationPct });
      const previous = renderRef.current;
      const next = easePctToward(previous?.pct || null, target, now - (previous?.at || now));
      renderRef.current = { pct: next, at: now };
      setSmoothPct((prev) =>
        pctDistance(prev, next) < POSITION_PUBLISH_DEAD_BAND_PCT ? prev : next,
      );
    };
    const timer = setInterval(tick, POSITION_PUBLISH_INTERVAL_MS);
    tick();
    return () => clearInterval(timer);
  }, [active, maxExtrapolationPct]);

  /** Position à dessiner : la position lissée tant qu'on en a une, la mesure sinon. */
  const displayPct = useMemo(() => {
    if (!projected?.pct) return null;
    return clampPositionToMap(smoothPct || projected.pct);
  }, [projected, smoothPct]);

  // Diagnostic affiché : refus, calage incohérent, erreur d'acquisition, acquisition en
  // cours, hors plan, signal faible — les six états repris de la bannière ForetMap.
  const lastCodeRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    let code = null;
    if (geo.status === 'denied') code = 'denied';
    else if (projected?.code && projected.code !== 'ok') code = projected.code;
    else if (geo.error) code = 'error';
    else if (!fix) code = 'acquiring';
    else code = 'ok';
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code;
      setFeedback(code);
    }
  }, [active, geo.status, geo.error, fix, projected]);

  // Première position obtenue : on quitte l'état « acquisition ».
  useEffect(() => {
    if (mode === 'acquiring' && projected?.pct) setMode('on');
  }, [mode, projected]);

  /**
   * Cap affiché : **vers où l'on se dirige**, et non vers où l'appareil est tourné dès que la
   * marche donne un sens à la question (`pickTravelHeadingDeg`). Le tout est lissé à constante
   * de temps — indépendante de la cadence du capteur — puis publié huit fois par seconde au
   * plus, et seulement si le cap a bougé d'au moins un degré : c'est ce qui sépare une carte
   * qui tourne doucement d'une carte qui vibre.
   */
  const northOffsetDeg = georefState?.northOffsetDeg || 0;
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      const now = Date.now();
      const state = headingRef.current;
      const current = fixRef.current;
      const gpsFresh = current && now - Number(current.timestamp || 0) < GPS_HEADING_STALE_MS;
      const picked = pickTravelHeadingDeg({
        gpsHeadingDeg: gpsFresh ? current.heading : null,
        speedMs: gpsFresh ? current.speed : null,
        compassHeadingDeg: headingEnabled ? compassRef.current : null,
        previousSource: state.source,
      });
      const dtMs = state.at ? now - state.at : HEADING_PUBLISH_INTERVAL_MS;
      const geoDeg =
        picked.headingDeg == null
          ? null
          : smoothHeadingOverTime(state.geoDeg, picked.headingDeg, dtMs, { deadBandDeg: 0 });
      const screenDeg = screenHeadingDeg(geoDeg, northOffsetDeg);
      const unwrapped = unwrapHeadingDeg(state.unwrapped, screenDeg);
      headingRef.current = { geoDeg, unwrapped, source: picked.source, at: now };
      setHeading((prev) => {
        const appeared = (prev.screenDeg == null) !== (screenDeg == null);
        const turned =
          prev.unwrapped != null &&
          unwrapped != null &&
          Math.abs(unwrapped - prev.unwrapped) >= HEADING_DEAD_BAND_DEG;
        if (!appeared && !turned && prev.source === picked.source) return prev;
        return { geoDeg, screenDeg, unwrapped, source: picked.source };
      });
    };
    const timer = setInterval(tick, HEADING_PUBLISH_INTERVAL_MS);
    tick();
    return () => clearInterval(timer);
  }, [active, headingEnabled, northOffsetDeg]);

  const screenHeading = heading.screenDeg;

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
    /**
     * Position à dessiner : lissée et prolongée entre deux mesures (`positionSmoothing.js`),
     * collée au bord et fléchée quand on est hors du plan.
     */
    displayPct,
    accuracyM: projected?.accuracy ?? null,
    haloPct: projected?.haloPct || 0,
    /** Cap géographique lissé (déplacement si le GPS le donne, boussole sinon). */
    headingDeg: heading.geoDeg,
    /** Cap écran lissé, normalisé [0, 360[. */
    screenHeadingDeg: screenHeading,
    /** Même cap, conservé pour les appelants antérieurs au lissage temporel. */
    smoothedScreenHeadingDeg: screenHeading,
    /**
     * Même cap, **continu** : ne repasse jamais par zéro, pour qu'une transition CSS prenne
     * toujours le chemin le plus court (`unwrapHeadingDeg`).
     */
    screenHeadingUnwrappedDeg: heading.unwrapped,
    /** `gps` (route suivie) | `compass` (orientation de l'appareil) | `null`. */
    headingSource: heading.source,
    /** Cap exploitable pour l'orientation de la carte. */
    headingAvailable: screenHeading != null,
    planSize: georefState?.planSize || null,
    toggle,
    stop,
    notifyManualPan,
    ensureFollow,
  };
}
