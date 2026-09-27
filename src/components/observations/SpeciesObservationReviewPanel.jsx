import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import {
  attachObservationEvidence,
  decideSpeciesObservation,
  listObservationInteractionCandidates,
  listSpeciesObservationsForReview,
} from '../../services/observationsApi';
import { IconEye } from '../../shared/icons.jsx';
import { AuthedImage } from '../AuthedImage.jsx';
import {
  OBSERVATION_STATUS_LABELS,
  OBSERVATION_STATUS_SHORT,
  OBSERVATION_TEXTS as T,
  detectionModeLabel,
} from './observationTexts.js';
import './speciesObservations.css';

const STATUS_FILTERS = Object.freeze([
  { value: 'soumise', label: 'À valider' },
  { value: 'validee', label: 'Validées' },
  { value: 'refusee', label: 'Non retenues' },
  { value: 'all', label: 'Toutes' },
]);

function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function speciesLabel(o) {
  return o.plant_name
    ? `${o.plant_emoji ? `${o.plant_emoji} ` : ''}${o.plant_name}`
    : 'Espèce non précisée';
}

/** Preuve d'une relation du réseau trophique : liste chargée à l'ouverture. */
function EvidencePicker({ observation, onToast }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listObservationInteractionCandidates(observation.id);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setItems([]);
      onToast?.(`Erreur : ${err?.message || 'relations indisponibles'}`);
    }
  }, [observation.id, onToast]);

  useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  const attach = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      const out = await attachObservationEvidence(observation.id, choice);
      onToast?.(
        out?.upgraded ? 'Relation marquée « observée sur le site » ✓' : 'Preuve rattachée ✓',
      );
      setChoice('');
      await load();
    } catch (err) {
      onToast?.(`Erreur : ${err?.message || 'rattachement impossible'}`);
    } finally {
      setBusy(false);
    }
  };

  const label = (i) =>
    `${i.from.emoji || ''} ${i.from.name} → ${i.to ? `${i.to.emoji || ''} ${i.to.name}` : '…'} (${i.interaction_type})`;

  return (
    <details
      className="species-obs-evidence"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{T.evidenceTitle}</summary>
      <p className="species-obs-intro">{T.evidenceHint}</p>
      {items === null ? <p className="species-obs-intro">Chargement…</p> : null}
      {items && items.length === 0 ? (
        <p className="species-obs-intro">Aucune relation du réseau pour cette espèce.</p>
      ) : null}
      {items && items.some((i) => i.attached) ? (
        <ul className="species-obs-intro">
          {items
            .filter((i) => i.attached)
            .map((i) => (
              <li key={i.id}>
                {label(i)}
                {i.evidence_level === 'observe_site' ? ' — observée sur le site' : ''}
              </li>
            ))}
        </ul>
      ) : null}
      {items && items.some((i) => !i.attached) ? (
        <div className="species-obs-evidence__row">
          <select
            aria-label="Relation à documenter"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">— Choisir une relation —</option>
            {items
              .filter((i) => !i.attached)
              .map((i) => (
                <option key={i.id} value={String(i.id)}>
                  {label(i)}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!choice || busy}
            onClick={() => void attach()}
          >
            {T.evidenceAttach}
          </button>
        </div>
      ) : null}
    </details>
  );
}

/** Carte d'une observation dans la file d'examen, avec la décision si elle est soumise. */
function ReviewCard({ observation: o, plantOptions, onDecided, onOpenPlant, onToast }) {
  const [plantId, setPlantId] = useState(o.plant_id ? String(o.plant_id) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = o.status === 'soumise';

  const decide = async (decision) => {
    setBusy(true);
    try {
      const out = await decideSpeciesObservation(o.id, {
        decision,
        plantId: decision === 'validee' && plantId ? Number(plantId) : null,
        note,
      });
      onToast?.(
        decision === 'validee'
          ? `Observation validée : ${out?.observation?.plant_name || 'espèce'} confirmée sur le site ✓`
          : 'Observation non retenue',
      );
      await onDecided?.();
    } catch (err) {
      onToast?.(`Erreur : ${err?.message || 'décision impossible'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="species-obs-card" data-testid="species-obs-review-item">
      <div className="species-obs-card__head">
        <span className="species-obs-card__title">
          {o.plant_id && onOpenPlant ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onOpenPlant(o.plant_id)}
            >
              {speciesLabel(o)}
            </button>
          ) : (
            speciesLabel(o)
          )}
        </span>
        <span className={`species-obs-status species-obs-status--${o.status}`}>
          {OBSERVATION_STATUS_SHORT[o.status] || o.status}
        </span>
      </div>
      <p className="species-obs-card__meta">
        {o.observer_name || 'Élève'} · {formatDate(o.observed_at)}
        {o.map_label ? ` · ${o.map_label}` : ''}
        {o.zone_name || o.marker_label ? ` · ${o.zone_name || o.marker_label}` : ''}
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
      {!pending ? (
        <p className="species-obs-card__note">
          {OBSERVATION_STATUS_LABELS[o.status]}
          {o.validator_name ? ` par ${o.validator_name}` : ''}
          {o.decided_at ? ` le ${formatDate(o.decided_at)}` : ''}
          {o.decision_note ? ` — ${o.decision_note}` : ''}
        </p>
      ) : (
        <div className="species-obs-review__decision">
          <label className="species-obs-intro" htmlFor={`species-obs-review-plant-${o.id}`}>
            Espèce retenue
          </label>
          <select
            id={`species-obs-review-plant-${o.id}`}
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
          >
            <option value="">— À choisir avant de valider —</option>
            {plantOptions.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.emoji ? `${p.emoji} ` : ''}
                {p.name}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Note pour l’élève"
            value={note}
            maxLength={1000}
            placeholder={T.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="species-obs-card__actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !plantId}
              onClick={() => void decide('validee')}
            >
              {T.validate}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void decide('refusee')}
            >
              {T.refuse}
            </button>
          </div>
        </div>
      )}
      {o.plant_id && o.status !== 'refusee' ? (
        <EvidencePicker observation={o} onToast={onToast} />
      ) : null}
    </li>
  );
}

/**
 * Panneau enseignant « Observations à valider » (gestion de la biodiversité).
 *
 * Réservé à `observations.validate` : le serveur est l'autorité — un refus (403, ou 503 quand
 * le module est éteint) masque le panneau, sans prop à faire transiter depuis le shell. Module
 * éteint, le validateur garde la file, avec un bandeau. Filtres carte (défaut : carte active)
 * et statut ; rechargé quand une observation change (temps réel).
 *
 * @param {object} props
 * @param {Array<{ id: string, label?: string }>} [props.maps]
 * @param {(plantId: number) => void} [props.onOpenPlant]
 * @param {(message: string) => void} [props.onToast]
 */
export function SpeciesObservationReviewPanel({ maps = [], onOpenPlant = null, onToast = null }) {
  const { activeMapId = null, plants = [] } = useData();
  const publicSettings = usePublicSettings();
  const moduleOff = publicSettings?.modules?.species_observations_enabled === false;
  const [mapFilter, setMapFilter] = useState(activeMapId || '');
  const [status, setStatus] = useState('soumise');
  const [data, setData] = useState({ items: [], counts: { soumise: 0, validee: 0, refusee: 0 } });
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  const plantOptions = useMemo(
    () =>
      (Array.isArray(plants) ? plants : [])
        .filter((p) => p && p.id != null)
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr')),
    [plants],
  );

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const out = await listSpeciesObservationsForReview({ mapId: mapFilter || null, status });
      if (seq !== seqRef.current) return;
      setData({
        items: Array.isArray(out?.items) ? out.items : [],
        counts: out?.counts || { soumise: 0, validee: 0, refusee: 0 },
      });
      setError('');
    } catch (err) {
      if (seq !== seqRef.current) return;
      // 403/401 : pas validateur ; 503 : module éteint et pas validateur.
      if ([401, 403, 503].includes(Number(err?.status))) {
        setForbidden(true);
        return;
      }
      setError(err?.message || 'Chargement impossible');
    }
  }, [mapFilter, status]);

  useEffect(() => {
    void load();
    const onRealtime = (e) => {
      if (e?.detail?.domain === 'observations') void load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => {
      seqRef.current += 1;
      window.removeEventListener('foretmap_realtime', onRealtime);
    };
  }, [load]);

  if (forbidden) return null;
  const pendingCount = Number(data.counts?.soumise) || 0;

  return (
    <details className="species-obs-review" data-testid="species-obs-review">
      <summary>
        <IconEye size={14} /> {T.reviewTitle} ({pendingCount})
      </summary>
      <p className="species-obs-intro">{T.reviewIntro}</p>
      {moduleOff ? (
        <p className="species-obs-intro" role="note" data-testid="species-obs-module-off">
          {T.moduleOffBanner}
        </p>
      ) : null}
      <div className="species-obs-review__filters">
        <select aria-label="Carte" value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
          <option value="">Toutes les cartes</option>
          {(Array.isArray(maps) ? maps : []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
        <select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
              {f.value !== 'all' ? ` (${Number(data.counts?.[f.value]) || 0})` : ''}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="species-obs-error" role="alert">
          {error}
        </p>
      ) : null}
      {data.items.length === 0 && !error ? (
        <p className="species-obs-intro">{T.reviewEmpty}</p>
      ) : null}
      <ul className="species-obs-list">
        {data.items.map((o) => (
          <ReviewCard
            key={o.id}
            observation={o}
            plantOptions={plantOptions}
            onDecided={load}
            onOpenPlant={onOpenPlant}
            onToast={onToast}
          />
        ))}
      </ul>
    </details>
  );
}
