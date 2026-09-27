import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountDeletedError } from '../../services/api';
import {
  createSpeciesObservation,
  deleteSpeciesObservation,
  listMySpeciesObservations,
} from '../../services/observationsApi';
import {
  flushSpeciesObservationQueue,
  listQueuedSpeciesObservations,
  removeQueuedSpeciesObservation,
  speciesObservationRequestBody,
} from '../../utils/speciesObservationQueue.js';
import { AuthedImage } from '../AuthedImage.jsx';
import { currentObservationUserId } from './SpeciesObservationForm.jsx';
import {
  OBSERVATION_STATUS_LABELS,
  OBSERVATION_TEXTS as T,
  detectionModeLabel,
} from './observationTexts.js';
import './speciesObservations.css';

function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function placeOf(item) {
  return item.zone_name || item.marker_label || item.place_label || '';
}

function sendQueued(item) {
  return createSpeciesObservation(speciesObservationRequestBody(item));
}

/** Rejoue les observations du compte gardées sans réseau (un seul rejeu à la fois). */
export function flushQueuedSpeciesObservations() {
  return flushSpeciesObservationQueue(sendQueued, currentObservationUserId()).catch(() => null);
}

/**
 * « Mes observations » : les observations envoyées (avec leur statut et la note de
 * l'enseignant) et celles qui attendent le réseau sur cet appareil. Rejoue la file au montage
 * et au retour du réseau ; se recharge quand une observation change (temps réel).
 *
 * @param {object} props
 * @param {number|null} [props.plantId] ne montrer que cette espèce (fiche)
 * @param {() => void} [props.onForceLogout]
 */
export function MySpeciesObservations({ plantId = null, onForceLogout = null }) {
  const [items, setItems] = useState([]);
  const [queued, setQueued] = useState(() =>
    listQueuedSpeciesObservations(currentObservationUserId()),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setQueued(listQueuedSpeciesObservations(currentObservationUserId()));
    try {
      const data = await listMySpeciesObservations();
      if (seq !== seqRef.current) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      if (seq !== seqRef.current) return;
      if (err instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      setError(err?.message || 'Chargement impossible');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [onForceLogout]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      await flushQueuedSpeciesObservations();
      if (!cancelled) await load();
    };
    void sync();
    const onOnline = () => void sync();
    const onRealtime = (e) => {
      if (e?.detail?.domain === 'observations') void load();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => {
      cancelled = true;
      seqRef.current += 1;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('foretmap_realtime', onRealtime);
    };
  }, [load]);

  const remove = async (id) => {
    try {
      await deleteSpeciesObservation(id);
      await load();
    } catch (err) {
      setError(err?.message || 'Suppression impossible');
    }
  };

  const pid = plantId == null ? null : Number(plantId);
  const visible = pid ? items.filter((o) => o.plant_id === pid) : items;
  const visibleQueued = pid ? queued.filter((q) => q.plant_id === pid) : queued;

  return (
    <div className="species-obs-my">
      {error ? (
        <p className="species-obs-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && visible.length === 0 && visibleQueued.length === 0 ? (
        <p className="species-obs-intro">Chargement…</p>
      ) : null}
      {!loading && visible.length === 0 && visibleQueued.length === 0 && !error ? (
        <p className="species-obs-intro">{T.myListEmpty}</p>
      ) : null}
      <ul className="species-obs-list" aria-label={T.myListTitle}>
        {visibleQueued.map((q) => (
          <li key={q.client_uuid} className="species-obs-card" data-testid="species-obs-queued">
            <div className="species-obs-card__head">
              <span className="species-obs-card__title">
                {q.plant_label || 'Espèce non précisée'}
              </span>
              <span
                className={`species-obs-status species-obs-status--${q.refused ? 'offline-refused' : 'offline'}`}
              >
                {q.refused ? T.refusedOffline : T.pendingOffline}
              </span>
            </div>
            <p className="species-obs-card__meta">
              {formatDate(q.observed_at)}
              {placeOf(q) ? ` · ${placeOf(q)}` : ''}
            </p>
            {q.text ? <p className="species-obs-card__text">{q.text}</p> : null}
            {q.refused && q.error ? <p className="species-obs-error">{q.error}</p> : null}
            <div className="species-obs-card__actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  removeQueuedSpeciesObservation(q.client_uuid);
                  setQueued(listQueuedSpeciesObservations(currentObservationUserId()));
                }}
              >
                {T.deleteLabel}
              </button>
            </div>
          </li>
        ))}
        {visible.map((o) => (
          <li key={o.id} className="species-obs-card" data-testid="species-obs-item">
            <div className="species-obs-card__head">
              <span className="species-obs-card__title">
                {o.plant_name
                  ? `${o.plant_emoji ? `${o.plant_emoji} ` : ''}${o.plant_name}`
                  : 'Espèce non précisée'}
              </span>
              <span className={`species-obs-status species-obs-status--${o.status}`}>
                {OBSERVATION_STATUS_LABELS[o.status] || o.status}
              </span>
            </div>
            <p className="species-obs-card__meta">
              {formatDate(o.observed_at)}
              {o.map_label ? ` · ${o.map_label}` : ''}
              {placeOf(o) ? ` · ${placeOf(o)}` : ''}
              {o.detection_mode ? ` · ${detectionModeLabel(o.detection_mode)}` : ''}
            </p>
            {o.text ? <p className="species-obs-card__text">{o.text}</p> : null}
            {Array.isArray(o.photos) && o.photos.length > 0 ? (
              <div className="species-obs-card__photos">
                {o.photos.map((ph) => (
                  <AuthedImage key={ph.id} src={ph.url} alt="Photo de l’observation" />
                ))}
              </div>
            ) : null}
            {o.decision_note ? (
              <p className="species-obs-card__note">
                <strong>{T.teacherNote} :</strong> {o.decision_note}
              </p>
            ) : null}
            {o.status !== 'validee' ? (
              <div className="species-obs-card__actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void remove(o.id)}
                >
                  {T.deleteLabel}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
