/**
 * Typographie des étiquettes de la carte de travail : tailles d'emoji et de nom selon la
 * hauteur affichée du plan, le zoom, le pointeur et la préférence « taille du texte » de
 * l'utilisateur ; variables CSS du calque d'étiquettes.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useMemo } from 'react';
import {
  resolveMapOverlayTypography,
  resolveMapOverlayCssVariables,
} from '../../utils/mapOverlayTypography';
import { resolveMapOverlayLabelLayout } from '../../utils/mapOverlayZoneLabels.js';
import { useMapOverlayTextSizePreference } from '../../hooks/useMapOverlayTextSizePreference.js';

/** Réglages `map` du site, ou `null` s'ils sont absents ou mal formés. */
function mapSettingsOf(publicSettings) {
  return publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
}

/**
 * @param {object} options
 * @param {object} options.publicSettings réglages publics du site
 * @param {number} options.iw largeur de l'image du plan (px, échelle 1)
 * @param {number} options.ih hauteur de l'image du plan (px, échelle 1)
 * @param {number} options.fitScale échelle « ajustée » du plan au repos
 * @param {number} options.cs échelle courante (zoom)
 * @param {number} options.inv inverse de l'échelle courante
 * @param {boolean} options.isCoarsePointer pointeur tactile
 */
export function useMapViewTypography({
  publicSettings,
  iw,
  ih,
  fitScale,
  cs,
  inv,
  isCoarsePointer,
}) {
  // Hauteur affichée du plan AU REPOS (ajusté), indépendante du zoom : dimensionne les étiquettes
  // à une taille stable, le grossissement au zoom étant porté séparément par `mapZoomRatio`.
  const safeFitScale = fitScale > 0 ? fitScale : 1;
  const mapFitHeightPx = ih * safeFitScale;
  const mapFitWidthPx = iw * safeFitScale;
  const mapZoomRatio = cs / safeFitScale;
  const {
    percent: mapTextSizePercent,
    label: mapTextSizeLabel,
    cycle: cycleMapTextSize,
  } = useMapOverlayTextSizePreference();
  const mapSettings = mapSettingsOf(publicSettings);
  /** Pastilles violettes tutoriel : OFF par défaut (`ui.map.show_tutorial_dots`). */
  const showTutorialDots = !!mapSettings?.show_tutorial_dots;
  const { mapEmojiLabelCenterGap, mapEmojiFontPx, mapLabelFontPx, markerLabelMarginTop } =
    resolveMapOverlayTypography(mapSettings, mapFitHeightPx, {
      worldScale: cs,
      zoomRatio: mapZoomRatio,
      fitWidthPx: mapFitWidthPx,
      isCoarsePointer,
      userTextSizePercent: mapTextSizePercent,
    });
  const mapOverlayLabelLayout = useMemo(
    () => resolveMapOverlayLabelLayout(mapSettings, { inv, isCoarsePointer }),
    [mapSettings, inv, isCoarsePointer],
  );
  const mapOverlayCssVars = useMemo(
    () =>
      resolveMapOverlayCssVariables(mapSettings, mapFitHeightPx, {
        fitWidthPx: mapFitWidthPx,
        isCoarsePointer,
        userTextSizePercent: mapTextSizePercent,
      }),
    [mapSettings, mapFitHeightPx, mapFitWidthPx, isCoarsePointer, mapTextSizePercent],
  );
  /** SharedMapStage : plateau dans la taille de police, pas via `scale(--map-overlay-scale)`. */
  const workFitExtraStyle = useMemo(
    () =>
      resolveMapOverlayCssVariables(mapSettings, mapFitHeightPx, {
        fitWidthPx: mapFitWidthPx,
        isCoarsePointer,
        userTextSizePercent: mapTextSizePercent,
        plateauAsTransform: false,
      }),
    [mapSettings, mapFitHeightPx, mapFitWidthPx, isCoarsePointer, mapTextSizePercent],
  );
  return {
    showTutorialDots,
    mapTextSizeLabel,
    cycleMapTextSize,
    mapEmojiLabelCenterGap,
    mapEmojiFontPx,
    mapLabelFontPx,
    markerLabelMarginTop,
    mapOverlayLabelLayout,
    mapOverlayCssVars,
    workFitExtraStyle,
  };
}
