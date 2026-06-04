import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function useGLKingdomZones(chapterId, { zoneMusicEnabled = false } = {}) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    const id = chapterId != null ? Number(chapterId) : null;
    if (!id) {
      setZones([]);
      setError('');
      return;
    }
    setLoading(true);
    try {
      const data = await apiGL(`/api/gl/kingdom-map/zones?chapterId=${id}`);
      setZones(Array.isArray(data?.zones) ? data.zones : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des zones impossible');
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const fetchMediaLibrary = useCallback(async () => {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  }, []);

  const uploadMediaLibrary = useCallback(async (mediaData) => {
    await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
  }, []);

  const removeMediaLibrary = useCallback(async (relativePath) => {
    await apiGL('/api/gl/admin/media-library', 'DELETE', { relative_path: relativePath });
  }, []);

  const createZone = useCallback(async ({ label, color, points, musicUrl, musicVolume }) => {
    const id = chapterId != null ? Number(chapterId) : null;
    if (!id) return;
    const payload = {
      chapterId: id,
      label: label || 'Zone',
      color,
      points,
    };
    if (zoneMusicEnabled && musicUrl) {
      payload.musicUrl = musicUrl;
      payload.musicVolume = musicVolume;
    }
    await apiGL('/api/gl/kingdom-map/zones', 'POST', payload);
    setError('');
    await reload();
  }, [chapterId, zoneMusicEnabled, reload]);

  const updateZone = useCallback(async (zoneId, patch) => {
    if (!zoneId) return;
    const payload = {};
    if (patch?.label != null) payload.label = patch.label;
    if (patch?.color != null) payload.color = patch.color;
    if (patch?.points != null) payload.points = patch.points;
    if (patch?.musicUrl !== undefined) payload.musicUrl = patch.musicUrl;
    if (patch?.musicVolume != null) payload.musicVolume = patch.musicVolume;
    if (Object.keys(payload).length === 0) return;
    try {
      await apiGL(`/api/gl/kingdom-map/zones/${zoneId}`, 'PUT', payload);
      setError('');
      await reload();
    } catch (err) {
      setError(err.message || 'Mise à jour de la zone impossible');
      await reload();
      throw err;
    }
  }, [reload]);

  const deleteZone = useCallback(async (zoneId) => {
    try {
      await apiGL(`/api/gl/kingdom-map/zones/${zoneId}`, 'DELETE');
      setError('');
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression de la zone impossible');
      throw err;
    }
  }, [reload]);

  return {
    zones,
    error,
    loading,
    reload,
    createZone,
    updateZone,
    deleteZone,
    fetchMediaLibrary,
    uploadMediaLibrary,
    removeMediaLibrary,
  };
}
