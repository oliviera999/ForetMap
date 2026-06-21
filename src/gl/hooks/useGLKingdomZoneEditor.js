import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  findNearestEdgeInsertion,
  insertPctPointAt,
  normalizePctPoint,
  normalizePctPoints,
  removePctPointAt,
} from '../../shared/pct-map/pctPolygon.js';
import { usePctPolygonEditSession } from '../../shared/pct-map/usePctPolygonEditSession.js';
import { duplicateMapLabel, offsetPctPoints } from '../utils/glMapDuplicate.js';

export const GL_KINGDOM_ZONE_DEFAULT_COLOR = '#22c55e';
const DEFAULT_MUSIC_VOLUME = 0.7;

export function readZoneMusicUrl(zone) {
  const urls = readZoneMusicUrls(zone);
  return urls[0] || '';
}

export function readZoneMusicUrls(zone) {
  const urls = zone?.musicUrls ?? zone?.music_urls;
  if (Array.isArray(urls)) {
    return urls.map((url) => String(url || '').trim()).filter(Boolean);
  }
  const legacy = zone?.musicUrl ?? zone?.music_url ?? null;
  if (legacy == null) return [];
  const s = String(legacy).trim();
  return s.length > 0 ? [s] : [];
}

export function readZoneMusicVolume(zone) {
  const raw = zone?.musicVolume ?? zone?.music_volume;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MUSIC_VOLUME;
  return Math.max(0, Math.min(1, n));
}

export function readZonePopoverMarkdown(zone) {
  return String(zone?.popoverMarkdown ?? zone?.popover_markdown ?? '');
}

export function readZonePopoverImages(zone) {
  const images = zone?.popoverImages ?? zone?.popover_images;
  return Array.isArray(images)
    ? images
        .map((img, index) => ({
          url: String(img?.url || '').trim(),
          caption: img?.caption != null ? String(img.caption) : '',
          sortOrder: Number.isFinite(Number(img?.sortOrder ?? img?.sort_order))
            ? Number(img.sortOrder ?? img.sort_order)
            : index,
        }))
        .filter((img) => img.url)
    : [];
}

export function zoneHasPopoverDraft(markdown, images) {
  if (String(markdown || '').trim()) return true;
  return Array.isArray(images) && images.some((img) => String(img?.url || '').trim());
}

/** Payload de création pour dupliquer une zone royaume (contenu + contour décalés). */
export function zoneDuplicateCreatePayloadFromZone(zone, { offset } = {}) {
  if (!zone) return null;
  return {
    label: duplicateMapLabel(zone.label),
    color: zone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR,
    points: offsetPctPoints(zone.points, offset),
    musicUrls: readZoneMusicUrls(zone),
    musicVolume: readZoneMusicVolume(zone),
    popoverMarkdown: readZonePopoverMarkdown(zone) || null,
    popoverImages: readZonePopoverImages(zone),
    description: zone.description ?? null,
  };
}

/**
 * État UI édition zones royaume (polygones %).
 * @param {object} options
 * @param {Array} options.zones
 * @param {boolean} [options.canManage=true]
 * @param {boolean} [options.zoneMusicEnabled=false]
 * @param {function} [options.onCreateZone]
 * @param {function} [options.onUpdateZone]
 * @param {function} [options.onDeleteZone]
 * @param {function} [options.onPreviewZoneMusic]
 */
export function useGLKingdomZoneEditor({
  zones = [],
  canManage = true,
  zoneMusicEnabled = false,
  onCreateZone,
  onUpdateZone,
  onDeleteZone,
  onPreviewZoneMusic,
}) {
  const [mode, setMode] = useState('view');
  const [drawPoints, setDrawPoints] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftColor, setDraftColor] = useState(GL_KINGDOM_ZONE_DEFAULT_COLOR);
  const [draftMusicUrls, setDraftMusicUrls] = useState([]);
  const [draftMusicVolumePct, setDraftMusicVolumePct] = useState(70);
  const [draftPopoverMarkdown, setDraftPopoverMarkdown] = useState('');
  const [draftPopoverImages, setDraftPopoverImages] = useState([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);
  const [insertVertexMode, setInsertVertexMode] = useState(false);

  const selectedZone = useMemo(
    () =>
      (Array.isArray(zones)
        ? zones.find((zone) => Number(zone.id) === Number(selectedZoneId))
        : null) || null,
    [zones, selectedZoneId],
  );

  const shapeSession = usePctPolygonEditSession({
    onSave: async (points) => {
      if (!selectedZoneId) return;
      await onUpdateZone?.(selectedZoneId, { points });
    },
  });

  const isEditingShape = shapeSession.active && mode === 'edit-shape';
  const zoneEditActive = mode === 'draw' || isEditingShape;

  useEffect(() => {
    if (!selectedZone) {
      setDraftLabel('');
      setDraftColor(GL_KINGDOM_ZONE_DEFAULT_COLOR);
      setDraftMusicUrls([]);
      setDraftMusicVolumePct(Math.round(DEFAULT_MUSIC_VOLUME * 100));
      setDraftPopoverMarkdown('');
      setDraftPopoverImages([]);
      return;
    }
    setDraftLabel(selectedZone.label || '');
    setDraftColor(selectedZone.color || GL_KINGDOM_ZONE_DEFAULT_COLOR);
    setDraftMusicUrls(readZoneMusicUrls(selectedZone));
    setDraftMusicVolumePct(Math.round(readZoneMusicVolume(selectedZone) * 100));
    setDraftPopoverMarkdown(readZonePopoverMarkdown(selectedZone));
    setDraftPopoverImages(readZonePopoverImages(selectedZone));
  }, [selectedZone]);

  const displayZones = useMemo(() => {
    if (!Array.isArray(zones)) return [];
    if (!isEditingShape || !selectedZoneId) return zones;
    return zones.map((zone) => {
      if (Number(zone.id) !== Number(selectedZoneId)) return zone;
      return { ...zone, points: shapeSession.points };
    });
  }, [zones, isEditingShape, selectedZoneId, shapeSession.points]);

  const selectZone = useCallback(
    (zoneId) => {
      if (isEditingShape) return;
      setSelectedZoneId(zoneId);
      setMode('edit');
      setSelectedVertexIndex(null);
      setInsertVertexMode(false);
    },
    [isEditingShape],
  );

  const startShapeEdit = useCallback(() => {
    if (!selectedZone?.points?.length) return;
    shapeSession.start(selectedZone.points);
    setMode('edit-shape');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [selectedZone, shapeSession]);

  const cancelShapeEdit = useCallback(() => {
    shapeSession.discard();
    setMode('edit');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [shapeSession]);

  const saveShapeEdit = useCallback(async () => {
    await shapeSession.save();
    setMode('edit');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [shapeSession]);

  const createZone = useCallback(async () => {
    if (!canManage) return;
    if (drawPoints.length < 3) return;
    await onCreateZone?.({
      label: draftLabel.trim() || 'Zone',
      color: draftColor || GL_KINGDOM_ZONE_DEFAULT_COLOR,
      points: normalizePctPoints(drawPoints),
    });
    setDrawPoints([]);
    setDraftLabel('');
    setMode('view');
  }, [canManage, drawPoints, draftLabel, draftColor, onCreateZone]);

  const saveZoneMeta = useCallback(async () => {
    if (!selectedZoneId) return;
    const payload = {
      label: draftLabel.trim() || 'Zone',
      color: draftColor || GL_KINGDOM_ZONE_DEFAULT_COLOR,
    };
    if (zoneMusicEnabled) {
      const urls = draftMusicUrls.map((url) => String(url || '').trim()).filter(Boolean);
      payload.musicUrls = urls;
      payload.musicVolume = Math.max(0, Math.min(1, Number(draftMusicVolumePct) / 100));
    }
    payload.popoverMarkdown = draftPopoverMarkdown.trim() || null;
    payload.popoverImages = draftPopoverImages
      .filter((img) => String(img?.url || '').trim())
      .map((img, index) => ({
        url: String(img.url).trim(),
        caption: String(img.caption || '').trim() || null,
        sortOrder: index,
      }));
    await onUpdateZone?.(selectedZoneId, payload);
  }, [
    selectedZoneId,
    draftLabel,
    draftColor,
    zoneMusicEnabled,
    draftMusicUrls,
    draftMusicVolumePct,
    draftPopoverMarkdown,
    draftPopoverImages,
    onUpdateZone,
  ]);

  const clearZoneMusic = useCallback(async () => {
    if (!selectedZoneId) return;
    setDraftMusicUrls([]);
    await onUpdateZone?.(selectedZoneId, { musicUrls: [] });
  }, [selectedZoneId, onUpdateZone]);

  const previewDraftMusic = useCallback(() => {
    const urls = draftMusicUrls.map((url) => String(url || '').trim()).filter(Boolean);
    if (urls.length === 0) return;
    onPreviewZoneMusic?.(urls, Math.max(0, Math.min(1, Number(draftMusicVolumePct) / 100)));
  }, [draftMusicUrls, draftMusicVolumePct, onPreviewZoneMusic]);

  const removeSelectedVertex = useCallback(() => {
    if (!isEditingShape || selectedVertexIndex == null) return;
    const next = removePctPointAt(shapeSession.points, selectedVertexIndex);
    if (next.length === shapeSession.points.length) return;
    shapeSession.setPoints(next);
    shapeSession.scheduleRecordHistory();
    setSelectedVertexIndex(null);
  }, [isEditingShape, selectedVertexIndex, shapeSession]);

  const handleMapClick = useCallback(
    (pct, event) => {
      if (!canManage) return;
      if (
        event.target.closest('.gl-pct-edit-pt') ||
        event.target.closest('.gl-pct-edit-zone-translate')
      )
        return;

      if (isEditingShape) {
        if (insertVertexMode) {
          const hit = findNearestEdgeInsertion(shapeSession.points, pct, 4);
          if (hit) {
            shapeSession.setPoints(
              insertPctPointAt(shapeSession.points, hit.insertIndex, hit.point),
            );
            shapeSession.scheduleRecordHistory();
            setSelectedVertexIndex(hit.insertIndex);
          } else {
            const next = [...shapeSession.points, normalizePctPoint(pct)];
            shapeSession.setPoints(next);
            shapeSession.scheduleRecordHistory();
            setSelectedVertexIndex(next.length - 1);
          }
          setInsertVertexMode(false);
        }
        return;
      }

      if (event.target.closest('.gl-kingdom-zone-polygon')) return;

      if (mode === 'draw') {
        setDrawPoints((prev) => [...prev, normalizePctPoint(pct)]);
      }
    },
    [canManage, isEditingShape, insertVertexMode, shapeSession, mode],
  );

  const editStrokeColor = draftColor || selectedZone?.color || GL_KINGDOM_ZONE_DEFAULT_COLOR;
  const mapCursor = mode === 'draw' || insertVertexMode ? 'crosshair' : 'default';

  const cancelDrawMode = useCallback(() => {
    setMode('view');
    setSelectedZoneId(null);
    setDrawPoints([]);
  }, []);

  const toggleDrawMode = useCallback(() => {
    const nextMode = mode === 'draw' ? 'view' : 'draw';
    setMode(nextMode);
    setSelectedZoneId(null);
    setDrawPoints([]);
  }, [mode]);

  return {
    mode,
    setMode,
    drawPoints,
    setDrawPoints,
    selectedZoneId,
    selectedZone,
    draftLabel,
    setDraftLabel,
    draftColor,
    setDraftColor,
    draftMusicUrls,
    setDraftMusicUrls,
    draftMusicVolumePct,
    setDraftMusicVolumePct,
    draftPopoverMarkdown,
    setDraftPopoverMarkdown,
    draftPopoverImages,
    setDraftPopoverImages,
    selectedVertexIndex,
    setSelectedVertexIndex,
    insertVertexMode,
    setInsertVertexMode,
    shapeSession,
    isEditingShape,
    zoneEditActive,
    displayZones,
    selectZone,
    startShapeEdit,
    cancelShapeEdit,
    saveShapeEdit,
    createZone,
    saveZoneMeta,
    clearZoneMusic,
    previewDraftMusic,
    removeSelectedVertex,
    handleMapClick,
    editStrokeColor,
    mapCursor,
    cancelDrawMode,
    toggleDrawMode,
  };
}
