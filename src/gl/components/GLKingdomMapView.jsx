import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

function pointsToSvgPolygon(points) {
  if (!Array.isArray(points)) return '';
  return points.map((p) => `${Number(p.x)},${Number(p.y)}`).join(' ');
}

export function GLKingdomMapView({ chapter, canManage }) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftColor, setDraftColor] = useState('#22c55e');
  const [draftPoints, setDraftPoints] = useState('10,10 90,10 50,90');

  const chapterId = chapter?.id;

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

  function parsePointsInput(text) {
    return String(text || '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const [xRaw, yRaw] = token.split(',');
        return { x: Number(xRaw), y: Number(yRaw) };
      });
  }

  async function createZone(event) {
    event.preventDefault();
    if (!chapterId) return;
    const points = parsePointsInput(draftPoints);
    try {
      await apiGL('/api/gl/kingdom-map/zones', 'POST', {
        chapterId,
        label: draftLabel.trim() || 'Zone',
        color: draftColor,
        points,
      });
      setDraftLabel('');
      await reload();
    } catch (err) {
      setError(err.message || 'Création impossible');
    }
  }

  async function deleteZone(id) {
    try {
      await apiGL(`/api/gl/kingdom-map/zones/${id}`, 'DELETE');
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  if (!chapter) {
    return (
      <section className="gl-panel">
        <h2>Carte du royaume</h2>
        <p className="gl-hint">Aucun chapitre sélectionné.</p>
      </section>
    );
  }

  return (
    <section className="gl-panel">
      <h2>Carte du royaume — {chapter.title}</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-kingdom-map">
        <img src={chapter.map_image_url || '/maps/map-foret.svg'} alt={chapter.title} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="gl-kingdom-map-overlay">
          {zones.map((zone) => (
            <polygon
              key={zone.id}
              points={pointsToSvgPolygon(zone.points)}
              fill={zone.color || '#22c55e'}
              fillOpacity="0.3"
              stroke={zone.color || '#22c55e'}
              strokeWidth="0.5"
              data-zone-id={zone.id}
            />
          ))}
        </svg>
      </div>
      <ul className="gl-kingdom-map-zones">
        {zones.map((zone) => (
          <li key={zone.id}>
            <strong>{zone.label}</strong>
            {canManage ? (
              <button type="button" onClick={() => deleteZone(zone.id)}>
                Supprimer
              </button>
            ) : null}
          </li>
        ))}
        {zones.length === 0 ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>🏰</span>
            Aucune zone.
          </li>
        ) : null}
      </ul>
      {canManage ? (
        <form className="gl-form" onSubmit={createZone}>
          <label>
            Label
            <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
          </label>
          <label>
            Couleur
            <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
          </label>
          <label>
            Points (format `x,y x,y x,y`)
            <input value={draftPoints} onChange={(event) => setDraftPoints(event.target.value)} />
          </label>
          <button type="submit">Ajouter une zone</button>
        </form>
      ) : null}
    </section>
  );
}
