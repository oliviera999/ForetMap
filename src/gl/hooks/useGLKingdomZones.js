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

  const createZone = useCallback(
    async ({
      label,
      color,
      points,
      musicUrl,
      musicUrls,
      musicVolume,
      popoverMarkdown,
      popoverImages,
      description,
    }) => {
      const id = chapterId != null ? Number(chapterId) : null;
      if (!id) return;
      const payload = {
        chapterId: id,
        label: label || 'Zone',
        color,
        points,
      };
      if (description != null) payload.description = description;
      if (popoverMarkdown !== undefined) payload.popoverMarkdown = popoverMarkdown;
      if (popoverImages !== undefined) payload.popoverImages = popoverImages;
      if (zoneMusicEnabled) {
        // Playlist multi-pistes (modèle courant) ; `musicUrl` (singulier) conservé en repli legacy.
        if (musicUrls !== undefined) payload.musicUrls = musicUrls;
        else if (musicUrl) payload.musicUrl = musicUrl;
        if (musicVolume != null) payload.musicVolume = musicVolume;
      }
      await apiGL('/api/gl/kingdom-map/zones', 'POST', payload);
      setError('');
      await reload();
    },
    [chapterId, zoneMusicEnabled, reload],
  );

  const updateZone = useCallback(
    async (zoneId, patch) => {
      if (!zoneId) return;
      const payload = {};
      if (patch?.label != null) payload.label = patch.label;
      if (patch?.color != null) payload.color = patch.color;
      if (patch?.points != null) payload.points = patch.points;
      // Playlist multi-pistes : `musicUrls` (pluriel) doit être transmis tel quel à l'API,
      // sinon la sélection de piste n'est jamais persistée. `musicUrl` reste un repli legacy.
      if (patch?.musicUrls !== undefined) payload.musicUrls = patch.musicUrls;
      if (patch?.musicUrl !== undefined) payload.musicUrl = patch.musicUrl;
      if (patch?.musicVolume != null) payload.musicVolume = patch.musicVolume;
      if (patch?.popoverMarkdown !== undefined) payload.popoverMarkdown = patch.popoverMarkdown;
      if (patch?.popoverImages !== undefined) payload.popoverImages = patch.popoverImages;
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
    },
    [reload],
  );

  const deleteZone = useCallback(
    async (zoneId) => {
      try {
        await apiGL(`/api/gl/kingdom-map/zones/${zoneId}`, 'DELETE');
        setError('');
        await reload();
      } catch (err) {
        setError(err.message || 'Suppression de la zone impossible');
        throw err;
      }
    },
    [reload],
  );

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
