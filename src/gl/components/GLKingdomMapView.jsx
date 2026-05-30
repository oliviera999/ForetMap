import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLKingdomZoneEditor } from './GLKingdomZoneEditor.jsx';

export function GLKingdomMapView({ chapter, chapters = [], canManage, onChapterChange }) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState(chapter?.id ? Number(chapter.id) : null);
  const [optimisticPatchByZoneId, setOptimisticPatchByZoneId] = useState({});

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

  async function createZone({ label, color, points }) {
    if (!chapterId) return;
    try {
      await apiGL('/api/gl/kingdom-map/zones', 'POST', {
        chapterId,
        label: label || 'Zone',
        color,
        points,
      });
      setError('');
      await reload();
    } catch (err) {
      setError(err.message || 'Création impossible');
    }
  }

  async function updateZone(id, patch, options = {}) {
    if (!id) return;
    const optimistic = options?.optimistic === true;
    if (optimistic && patch?.points) {
      setOptimisticPatchByZoneId((prev) => ({ ...prev, [id]: patch.points }));
      return;
    }
    try {
      const payload = {};
      if (patch?.label != null) payload.label = patch.label;
      if (patch?.color != null) payload.color = patch.color;
      if (patch?.points != null) payload.points = patch.points;
      if (Object.keys(payload).length > 0) {
        await apiGL(`/api/gl/kingdom-map/zones/${id}`, 'PUT', payload);
      }
      setOptimisticPatchByZoneId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setError('');
      if (options?.flushOptimistic) {
        await reload();
      } else if (Object.keys(payload).length > 0) {
        await reload();
      }
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
      setOptimisticPatchByZoneId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
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

  const displayZones = useMemo(
    () => zones.map((zone) => ({
      ...zone,
      points: optimisticPatchByZoneId[zone.id] || zone.points,
    })),
    [zones, optimisticPatchByZoneId]
  );

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
        zones={displayZones}
        canManage={canManage}
        onCreateZone={createZone}
        onUpdateZone={updateZone}
        onDeleteZone={deleteZone}
      />
      {canManage ? (
        <p className="gl-hint">
          Dessinez une zone par clics successifs sur la carte (minimum 3 points), puis ajustez les sommets en mode édition.
        </p>
      ) : (
        <p className="gl-hint">Vue en lecture seule de la carte royaume.</p>
      )}
    </section>
  );
}
