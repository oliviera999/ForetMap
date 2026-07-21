import React, { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

/**
 * Sélecteur pour associer un feuillet du carnet de Sélène à une zone polygonale
 * du royaume. On choisit d'abord un chapitre, puis l'une de ses zones, et le
 * bouton « Associer » persiste le lien (ou le détache si la zone est vide).
 *
 * @param {string} feuilletCode code du feuillet à lier
 * @param {number|null|''} kingdomZoneId id de la zone actuellement liée
 * @param {(nextZoneIdOrNull: number|null) => void} onLinked callback après succès
 */
export function GLFeuilletKingdomZonePicker({ feuilletCode, kingdomZoneId, onLinked }) {
  const [chapters, setChapters] = useState([]);
  const [chapterId, setChapterId] = useState('');
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Libellé lisible d'un chapitre (schéma variable selon la source).
  const chapterLabel = (c) => c.name || c.titre || c.slug || '#' + c.id;

  // Chargement des chapitres au montage.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGL('/api/gl/chapters')
      .then((res) => {
        if (cancelled) return;
        setChapters(Array.isArray(res) ? res : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setChapters([]);
        setError(err.message || 'Chapitres indisponibles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Chargement des zones du chapitre sélectionné.
  useEffect(() => {
    let cancelled = false;
    if (!chapterId) {
      setZones([]);
      return undefined;
    }
    setLoading(true);
    setError('');
    apiGL(`/api/gl/kingdom-map/zones?chapterId=${encodeURIComponent(chapterId)}`)
      .then((res) => {
        if (cancelled) return;
        setZones(Array.isArray(res?.zones) ? res.zones : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setZones([]);
        setError(err.message || 'Zones indisponibles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // Associe (ou détache si zone vide) le feuillet à la zone choisie.
  async function handleAssociate() {
    const nextZoneId = selectedZoneId ? Number(selectedZoneId) : null;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiGL(
        '/api/gl/lore/admin/feuillets/' + encodeURIComponent(feuilletCode) + '/kingdom-zone',
        'PUT',
        { kingdomZoneId: nextZoneId },
      );
      if (typeof onLinked === 'function') onLinked(nextZoneId);
      setSuccess(nextZoneId == null ? 'Zone détachée.' : 'Zone associée.');
    } catch (err) {
      setError(err.message || 'Association impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gl-feuillet-kingdom-zone-picker">
      {kingdomZoneId ? <p className="gl-hint">Zone actuellement liée : #{kingdomZoneId}</p> : null}

      <GLSelect
        aria-label="Chapitre"
        value={chapterId}
        disabled={loading || saving}
        onChange={(e) => {
          setChapterId(e.target.value);
          setSelectedZoneId('');
          setSuccess('');
        }}
      >
        <option value="">— Choisir un chapitre —</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {chapterLabel(c)}
          </option>
        ))}
      </GLSelect>

      <GLSelect
        aria-label="Zone du royaume"
        value={selectedZoneId}
        disabled={loading || saving || !chapterId}
        onChange={(e) => {
          setSelectedZoneId(e.target.value);
          setSuccess('');
        }}
      >
        <option value="">— Aucune zone —</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label || 'Zone ' + z.id}
          </option>
        ))}
      </GLSelect>

      <GLButton onClick={handleAssociate} loading={saving} disabled={loading}>
        Associer
      </GLButton>

      <div className="gl-feuillet-kingdom-zone-picker__meta">
        {loading ? <span className="gl-hint">Chargement…</span> : null}
        {success ? <span className="gl-hint">{success}</span> : null}
        {error ? <span className="gl-error">{error}</span> : null}
      </div>
    </div>
  );
}
