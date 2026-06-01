import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useGLZoneMusic } from '../hooks/useGLZoneMusic.js';
import { GLKingdomZoneEditor } from './GLKingdomZoneEditor.jsx';

export function GLKingdomMapView({ chapter, chapters = [], canManage, onChapterChange, zoneMusicEnabled = false }) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState(chapter?.id ? Number(chapter.id) : null);
  const { previewUrl, stopAll } = useGLZoneMusic({
    enabled: zoneMusicEnabled,
    userMuted: false,
    activeZone: null,
  });

  useEffect(() => {
    if (!zoneMusicEnabled) stopAll();
    return () => stopAll();
  }, [zoneMusicEnabled, stopAll]);

  const handlePreviewZoneMusic = useCallback((url, volume) => {
    if (!zoneMusicEnabled || !url) return;
    previewUrl(url, volume);
  }, [zoneMusicEnabled, previewUrl]);

  const handleSelectedZoneChange = useCallback((zone) => {
    if (!zoneMusicEnabled || canManage) return;
    const url = zone?.musicUrl ?? zone?.music_url ?? null;
    if (url) {
      const vol = zone?.musicVolume ?? zone?.music_volume ?? 0.7;
      previewUrl(String(url), Number(vol));
    } else {
      stopAll();
    }
  }, [zoneMusicEnabled, canManage, previewUrl, stopAll]);

  useEffect(() => {
    if (!chapter?.id) return;
    setSelectedChapterId((prev) => (prev == null ? Number(chapter.id) : prev));
  }, [chapter]);

  useEffect(() => {
    onChapterChange?.(selectedChapterId != null ? Number(selectedChapterId) : null);
  }, [selectedChapterId, onChapterChange]);

  const chapterOptions = useMemo(
    () => (Array.isArray(chapters) ? chapters : []).map((item) => ({
      id: Number(item.id),
      label: item.title || item.slug || `Chapitre ${item.id}`,
      mapImageUrl: item.map_image_url || '/maps/map-foret.svg',
    })),
    [chapters]
  );
  const activeChapter = useMemo(() => {
    if (selectedChapterId != null) {
      return chapterOptions.find((item) => Number(item.id) === Number(selectedChapterId)) || null;
    }
    return chapter?.id ? {
      id: Number(chapter.id),
      label: chapter.title || chapter.slug || `Chapitre ${chapter.id}`,
      mapImageUrl: chapter.map_image_url || '/maps/map-foret.svg',
    } : null;
  }, [chapter, chapterOptions, selectedChapterId]);
  const chapterId = activeChapter?.id;

  const reload = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await apiGL(`/api/gl/kingdom-map/zones?chapterId=${chapterId}`);
      setZones(Array.isArray(data?.zones) ? data.zones : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
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

  async function createZone({ label, color, points, musicUrl, musicVolume }) {
    if (!chapterId) return;
    try {
      const payload = {
        chapterId,
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
    } catch (err) {
      setError(err.message || 'Création impossible');
    }
  }

  async function updateZone(id, patch) {
    if (!id) return;
    try {
      const payload = {};
      if (patch?.label != null) payload.label = patch.label;
      if (patch?.color != null) payload.color = patch.color;
      if (patch?.points != null) payload.points = patch.points;
      if (patch?.musicUrl !== undefined) payload.musicUrl = patch.musicUrl;
      if (patch?.musicVolume != null) payload.musicVolume = patch.musicVolume;
      if (Object.keys(payload).length > 0) {
        await apiGL(`/api/gl/kingdom-map/zones/${id}`, 'PUT', payload);
      }
      setError('');
      await reload();
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
      await reload();
    }
  }

  async function deleteZone(id) {
    try {
      await apiGL(`/api/gl/kingdom-map/zones/${id}`, 'DELETE');
      setError('');
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  if (!activeChapter) {
    return (
      <section className="gl-panel">
        <h2>Carte du royaume</h2>
        <p className="gl-hint">Aucun chapitre sélectionné.</p>
      </section>
    );
  }

  return (
    <section className="gl-panel">
      <h2>Carte du royaume — {activeChapter.label}</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {canManage ? (
        <div className="gl-form">
          <label>
            Chapitre édité
            <select
              value={selectedChapterId ?? ''}
              onChange={(event) => setSelectedChapterId(Number(event.target.value || 0) || null)}
            >
              {chapterOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <GLKingdomZoneEditor
        imageUrl={activeChapter.mapImageUrl}
        chapterTitle={activeChapter.label}
        zones={zones}
        canManage={canManage}
        onCreateZone={createZone}
        onUpdateZone={updateZone}
        onDeleteZone={deleteZone}
        fetchMediaLibrary={canManage ? fetchMediaLibrary : undefined}
        uploadMediaLibrary={canManage ? uploadMediaLibrary : undefined}
        removeMediaLibrary={canManage ? removeMediaLibrary : undefined}
        zoneMusicEnabled={zoneMusicEnabled}
        onSelectedZoneChange={handleSelectedZoneChange}
        onPreviewZoneMusic={handlePreviewZoneMusic}
      />
      {canManage ? (
        <p className="gl-hint">
          Dessinez une zone par clics successifs (minimum 3 points), puis « Modifier le contour » pour déplacer, ajouter ou retirer des sommets.
          {zoneMusicEnabled ? ' Associez une piste audio par zone pour l’ambiance sur la carte de jeu.' : ''}
        </p>
      ) : (
        <p className="gl-hint">
          Vue en lecture seule de la carte royaume.
          {zoneMusicEnabled ? ' Sélectionnez une zone pour préécouter sa musique.' : ''}
        </p>
      )}
    </section>
  );
}
