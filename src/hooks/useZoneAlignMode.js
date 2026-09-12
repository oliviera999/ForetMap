import { useCallback, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
  ZONE_ALIGN_DEFAULT_THRESHOLD_PCT,
  normalizeNeighborZones,
  previewAlignSelectedZones,
} from '../utils/zoneNeighborSnap.js';

/**
 * Mode « Aligner » : sélection de zones proches, aperçu global, puis sauvegarde.
 *
 * @param {object} params
 * @param {string} params.mode
 * @param {(mode: string) => void} params.setMode
 * @param {Array<object>} params.zones zones de la carte active
 * @param {() => Promise<*>} params.onRefresh
 * @param {(msg: string) => void} params.setToast
 * @param {number} [params.thresholdPct]
 */
function useZoneAlignMode({
  mode: _mode,
  setMode,
  zones,
  onRefresh,
  setToast,
  thresholdPct = ZONE_ALIGN_DEFAULT_THRESHOLD_PCT,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const clearAlignSession = useCallback(() => {
    setSelectedIds(new Set());
    setPreview(null);
    setSaving(false);
  }, []);

  const enterAlignMode = useCallback(() => {
    clearAlignSession();
    setMode('align-zones');
  }, [clearAlignSession, setMode]);

  const exitAlignMode = useCallback(() => {
    clearAlignSession();
    setMode('view');
  }, [clearAlignSession, setMode]);

  const toggleZoneId = useCallback((zoneId) => {
    const id = String(zoneId);
    setPreview(null);
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedZones = useMemo(() => {
    if (!selectedIds.size) return [];
    return (zones || []).filter((z) => selectedIds.has(String(z.id)));
  }, [zones, selectedIds]);

  const computePreview = useCallback(() => {
    if (selectedZones.length < 2) {
      setToast('Sélectionne au moins deux zones proches');
      setPreview(null);
      return null;
    }
    const result = previewAlignSelectedZones(selectedZones, { thresholdPct });
    if (!result) {
      setToast('Aucune zone proche à aligner dans la sélection');
      setPreview(null);
      return null;
    }
    setPreview(result);
    setToast(
      `Aperçu : ${result.clusterCount} groupe${result.clusterCount > 1 ? 's' : ''} · ${result.movedVertexCount} sommet${result.movedVertexCount > 1 ? 's' : ''} déplacé${result.movedVertexCount > 1 ? 's' : ''}`,
    );
    return result;
  }, [selectedZones, setToast, thresholdPct]);

  const discardPreview = useCallback(() => {
    setPreview(null);
  }, []);

  const applyPreview = useCallback(async () => {
    if (!preview?.aligned?.length) {
      setToast('Calcule d’abord un aperçu');
      return;
    }
    setSaving(true);
    try {
      for (const z of preview.aligned) {
        await api(`/api/zones/${z.id}`, 'PUT', { points: z.points });
      }
      await onRefresh?.();
      setToast(
        `${preview.aligned.length} zone${preview.aligned.length > 1 ? 's' : ''} alignée${preview.aligned.length > 1 ? 's' : ''} ✓`,
      );
      exitAlignMode();
    } catch (err) {
      setToast(err?.message || 'Échec de l’alignement');
    } finally {
      setSaving(false);
    }
  }, [preview, onRefresh, setToast, exitAlignMode]);

  const neighborCandidates = useMemo(() => normalizeNeighborZones(zones || []), [zones]);

  return {
    alignSelectedIds: selectedIds,
    alignPreview: preview,
    alignSaving: saving,
    alignSelectedCount: selectedIds.size,
    enterAlignMode,
    exitAlignMode,
    toggleAlignZoneId: toggleZoneId,
    computeAlignPreview: computePreview,
    discardAlignPreview: discardPreview,
    applyAlignPreview: applyPreview,
    clearAlignSession,
    neighborCandidates,
    neighborSnapRadiusPct: NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
    alignThresholdPct: thresholdPct,
  };
}

export default useZoneAlignMode;
