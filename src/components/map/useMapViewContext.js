/**
 * Contexte de la carte de travail : données du jardin (avec leurs valeurs par défaut),
 * réglages du site lus par la carte, et carte active (image de fond et ses replis, marge du
 * cadre).
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MARKER_EMOJIS, parseEmojiListSetting } from '../../constants/emojis';
import { buildMapImageCandidates } from '../../utils/mapImageCandidates';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import {
  filterPlacesByHiddenCategories,
  hiddenCategoryIdsByMap,
} from '../../utils/mapCategoryIds.js';

const NO_MAPS = [];

/**
 * Données du jardin et lieux de la carte active.
 *
 * Les lieux dont toutes les catégories sont cachées sur leur carte
 * (`maps[].hidden_category_ids`, réglage « Cartographie → Cartes ») sont retirés ici, en
 * amont de tout le reste de la carte de travail (scène, recherche, parcours, badges).
 *
 * @param {object[]} [maps] catalogue des cartes (`GET /api/maps`)
 */
export function useMapViewData(maps = NO_MAPS) {
  const { canParticipateContextComments = true } = useSession();
  const {
    zones: allZones = [],
    markers: allMarkers = [],
    tasks = [],
    tutorials = [],
    plants = [],
    activeMapId = '',
  } = useData();
  const hiddenByMap = useMemo(() => hiddenCategoryIdsByMap(maps), [maps]);
  const zones = useMemo(
    () => filterPlacesByHiddenCategories(allZones, hiddenByMap),
    [allZones, hiddenByMap],
  );
  const markers = useMemo(
    () => filterPlacesByHiddenCategories(allMarkers, hiddenByMap),
    [allMarkers, hiddenByMap],
  );
  const markersOnActiveMap = useMemo(
    () => (markers || []).filter((m) => m.map_id === activeMapId),
    [markers, activeMapId],
  );
  const zonesOnActiveMap = useMemo(
    () => (zones || []).filter((z) => z.map_id === activeMapId),
    [zones, activeMapId],
  );
  return {
    canParticipateContextComments,
    zones,
    markers,
    tasks,
    tutorials,
    plants,
    activeMapId,
    markersOnActiveMap,
    zonesOnActiveMap,
  };
}

/** Réglages publics lus par la carte (emojis de lieu, mascotte, commentaires, cap). */
export function useMapViewSettings() {
  const publicSettings = usePublicSettings();
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis || publicSettings?.map?.location_emojis || '',
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis],
  );
  const emojiParsingList = useMemo(
    () => [...new Set([...markerEmojis, ...MARKER_EMOJIS])],
    [markerEmojis],
  );
  return {
    publicSettings,
    markerEmojis,
    emojiParsingList,
    visitMascotDefaultId: String(publicSettings?.visit?.mascot?.default_id || '').trim(),
    mascotDialogSettings: publicSettings?.visit?.mascot?.dialog,
    contextCommentsEnabled: publicSettings?.modules?.context_comments_enabled !== false,
    headingUpSiteEnabled: publicSettings?.map?.heading_up_enabled,
  };
}

/**
 * Carte active : image de fond (avec ses candidates de repli, remises à zéro à chaque
 * carte), libellé, géoréférencement et marge du cadre (8 px par défaut, 32 au plus).
 */
export function useMapViewActiveMap(maps, activeMapId) {
  const activeMap = maps.find((m) => m.id === activeMapId);
  const mapImageCandidates = useMemo(() => buildMapImageCandidates(activeMap), [activeMap]);
  const [mapImageIdx, setMapImageIdx] = useState(0);
  const mapImageSrc = mapImageCandidates[Math.min(mapImageIdx, mapImageCandidates.length - 1)];
  /** Image de fond introuvable : on passe à la candidate suivante (s'il en reste une). */
  const onMapImageError = useCallback(
    () => setMapImageIdx((idx) => (idx < mapImageCandidates.length - 1 ? idx + 1 : idx)),
    [mapImageCandidates.length],
  );
  useEffect(() => {
    setMapImageIdx(0);
  }, [mapImageCandidates]);
  const mapFramePaddingPx = useMemo(() => {
    const custom = Number(activeMap?.frame_padding_px);
    if (Number.isFinite(custom) && custom >= 0) return Math.min(custom, 32);
    return 8;
  }, [activeMap?.frame_padding_px]);
  return {
    activeMap,
    activeMapLabel: activeMap?.label,
    activeMapGeoref: activeMap?.georef,
    mapImageSrc,
    onMapImageError,
    mapFramePaddingPx,
  };
}
