/**
 * Position du lecteur sur la carte de travail : point GPS, carte orientée selon le cap
 * (« heading-up »), échelle et rose des vents, et contrat `gps` attendu par la barre
 * d'outils et la bannière d'état.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 *
 * Position sur la carte de travail (lot 6) : le noyau partagé, le même que le Plan. « Me
 * suivre » n'est **plus lié à la mascotte** — un point de position s'affiche même quand la
 * mascotte est masquée ; quand elle est affichée, elle suit en plus. La position reste
 * 100 % côté client.
 */
import { useEffect, useMemo } from 'react';
import { useMapPosition } from '../../shared/pct-map/useMapPosition.js';
import { useHeadingUpPreference } from '../../shared/pct-map/useHeadingUpPreference.js';
import { useScaleCompassPreference } from '../../shared/pct-map/useScaleCompassPreference.js';
import { headingUpOrientationDeg } from '../../shared/pct-map/pctMapOrientation.js';

/**
 * @param {object} options
 * @param {object|undefined} options.activeMap carte active (`georef`, drapeaux GPS / cap / échelle)
 * @param {string} options.mode mode de la carte (`view` seul active GPS, cap et échelle)
 * @param {boolean} options.headingUpSiteEnabled réglage du site `map.heading_up_enabled`
 * @param {{ deg: number }|null} options.mapOrientation orientation appliquée par le moteur
 * @param {Function} options.setMapOrientation pilote du calque d'orientation
 * @param {boolean} options.showMapMascot mascotte à l'écran (elle suit alors la position)
 * @param {Function} options.moveMapMascotTo déplacement de la mascotte
 */
export function useMapViewPosition({
  activeMap,
  mode,
  headingUpSiteEnabled,
  mapOrientation,
  setMapOrientation,
  showMapMascot,
  moveMapMascotTo,
}) {
  const isView = mode === 'view';
  const mapPosition = useMapPosition({
    georef: activeMap?.georef ?? null,
    gpsEnabled: !!activeMap?.gps_enabled && isView,
  });
  const headingUpAllowed =
    !!headingUpSiteEnabled && !!activeMap?.heading_up_enabled && !!mapPosition.available && isView;
  const headingUpPref = useHeadingUpPreference({
    storageKey: 'foretmap:heading-up',
    allowed: headingUpAllowed,
  });
  const headingUpEffective = headingUpPref.effective && mapPosition.active;
  const scaleCompassAllowed = !!activeMap?.georef && !!activeMap?.scale_compass_enabled && isView;
  const scaleCompassPref = useScaleCompassPreference({
    storageKey: 'foretmap:scale-compass',
    allowed: scaleCompassAllowed,
  });
  // Angle **continu** : la transition CSS du calque d'orientation doit prendre le chemin le plus
  // court (`unwrapHeadingDeg`), sinon la carte fait un tour complet au passage de 359° à 1°.
  const headingForMapDeg =
    mapPosition.screenHeadingUnwrappedDeg ??
    mapPosition.smoothedScreenHeadingDeg ??
    mapPosition.screenHeadingDeg ??
    null;
  const targetOrientationDeg = headingUpEffective ? headingUpOrientationDeg(headingForMapDeg) : 0;
  // Angle **réellement appliqué** au calque : la rose des vents doit pointer le même cap que la
  // carte pendant que celle-ci pivote, et non l'angle visé un rendu plus tôt.
  const mapOrientationDeg = mapOrientation?.deg || 0;
  useEffect(() => {
    if (!headingUpEffective) {
      setMapOrientation({ deg: 0, originPct: null });
      return;
    }
    setMapOrientation({
      deg: targetOrientationDeg,
      originPct: mapPosition.displayPct || null,
    });
    // Dépendances au niveau des coordonnées : un nouvel objet `displayPct` de même valeur ne
    // doit pas relancer l'orientation (comportement d'origine).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    headingUpEffective,
    mapPosition.displayPct?.xp,
    mapPosition.displayPct?.yp,
    targetOrientationDeg,
    setMapOrientation,
  ]);
  // La mascotte suit la position quand elle est à l'écran (comportement d'origine).
  useEffect(() => {
    if (!showMapMascot || !mapPosition.positionPct) return;
    if (mapPosition.feedback !== 'ok') return;
    moveMapMascotTo(mapPosition.positionPct.xp, mapPosition.positionPct.yp);
  }, [showMapMascot, mapPosition.positionPct, mapPosition.feedback, moveMapMascotTo]);
  /** Forme attendue par la barre d'outils et la bannière d'état (contrat inchangé). */
  const mascotGps = useMemo(
    () => ({
      supported: mapPosition.supported,
      available: mapPosition.available,
      active: mapPosition.active,
      status: mapPosition.status,
      feedback: mapPosition.feedback === 'acquiring' ? null : mapPosition.feedback,
      accuracy: mapPosition.accuracyM,
      error: mapPosition.error,
      toggle: mapPosition.toggle,
      headingAvailable: mapPosition.headingAvailable,
      headingUpAllowed,
      headingUpEffective,
      headingUpUserEnabled: headingUpPref.userEnabled,
      toggleHeadingUp: () => headingUpPref.setEnabled(!headingUpPref.userEnabled),
    }),
    [mapPosition, headingUpAllowed, headingUpEffective, headingUpPref],
  );
  return {
    mapPosition,
    headingUpAllowed,
    headingUpPref,
    headingUpEffective,
    scaleCompassAllowed,
    scaleCompassPref,
    mapOrientationDeg,
    mascotGps,
  };
}
