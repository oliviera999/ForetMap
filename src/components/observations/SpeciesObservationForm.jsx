import { useMemo, useRef, useState } from 'react';
import {
  AccountDeletedError,
  getAuthClaims,
  isLikelyNetworkTransportFailure,
} from '../../services/api';
import {
  createSpeciesObservation,
  uploadSpeciesObservationPhoto,
} from '../../services/observationsApi';
import { compressImageWithPreset, isLikelyImageFile } from '../../shared/platform/image';
import { isDeviceOffline } from '../../shared/networkStatus.js';
import {
  enqueueSpeciesObservation,
  newSpeciesObservationClientUuid,
  SPECIES_OBSERVATION_TEXT_MAX,
} from '../../utils/speciesObservationQueue.js';
import { deleteOfflinePhoto, putOfflinePhoto } from '../../utils/offlinePhotoStore.js';
import { notifyOutboxChanged } from '../../services/offlineOutbox.js';
import { ObservationPhotoField } from './ObservationPhotoField.jsx';
import { DETECTION_MODE_OPTIONS, OBSERVATION_TEXTS as T } from './observationTexts.js';
import './speciesObservations.css';

/** Identifiant du compte connecté (même règle que la file « Espèce observée »). */
export function currentObservationUserId() {
  const claims = typeof getAuthClaims === 'function' ? getAuthClaims() : null;
  const id = claims?.canonicalUserId ?? claims?.userId;
  return id == null ? '' : String(id);
}

/** Date locale de l'appareil, `AAAA-MM-JJ` (valeur par défaut du champ date). */
export function todayLocalDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isOffline() {
  return isDeviceOffline();
}

function placeValue(kind, id) {
  return id ? `${kind}:${id}` : '';
}

function parsePlaceValue(value) {
  const [kind, ...rest] = String(value || '').split(':');
  const id = rest.join(':');
  if (!id) return { zoneId: null, markerId: null };
  return kind === 'marker' ? { zoneId: null, markerId: id } : { zoneId: id, markerId: null };
}

/**
 * Formulaire « Signaler une observation » : espèce, lieu, date, mode de détection, texte et
 * photo facultative. En ligne, l'observation part tout de suite (puis sa photo) ; sans réseau,
 * elle est gardée sur l'appareil avec sa clé `client_uuid` et partira toute seule
 * (`utils/speciesObservationQueue.js`), sa photo gardée à part (`utils/offlinePhotoStore.js`).
 *
 * @param {object} props
 * @param {string} props.mapId carte de l'observation
 * @param {Array<{id: number, name: string, emoji?: string}>} [props.plants] espèces proposées
 * @param {Array<{id: string, name: string, map_id?: string}>} [props.zones]
 * @param {Array<{id: string, label?: string, map_id?: string}>} [props.markers]
 * @param {number|null} [props.initialPlantId] espèce présélectionnée (fiche espèce)
 * @param {{ kind: 'zone'|'marker', id: string }|null} [props.initialPlace] lieu présélectionné
 * @param {(outcome: { observation?: object, queued?: boolean, message: string }) => void} props.onDone
 * @param {() => void} props.onCancel
 * @param {() => void} [props.onForceLogout]
 */
export function SpeciesObservationForm({
  mapId,
  plants = [],
  zones = [],
  markers = [],
  initialPlantId = null,
  initialPlace = null,
  onDone,
  onCancel,
  onForceLogout = null,
}) {
  const [clientUuid] = useState(() => newSpeciesObservationClientUuid());
  const [plantId, setPlantId] = useState(initialPlantId ? String(initialPlantId) : '');
  const [place, setPlace] = useState(
    initialPlace ? placeValue(initialPlace.kind, initialPlace.id) : '',
  );
  const [observedAt, setObservedAt] = useState(() => todayLocalDate());
  const [mode, setMode] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const galleryFileRef = useRef(null);
  const cameraFileRef = useRef(null);

  const plantOptions = useMemo(
    () =>
      (Array.isArray(plants) ? plants : [])
        .filter((p) => p && p.id != null)
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr')),
    [plants],
  );
  const zoneOptions = useMemo(
    () =>
      (Array.isArray(zones) ? zones : []).filter((z) => z?.id && (!z.map_id || z.map_id === mapId)),
    [zones, mapId],
  );
  const markerOptions = useMemo(
    () =>
      (Array.isArray(markers) ? markers : []).filter(
        (m) => m?.id && (!m.map_id || m.map_id === mapId),
      ),
    [markers, mapId],
  );

  const plantLabel = () => {
    const hit = plantOptions.find((p) => String(p.id) === plantId);
    return hit ? `${hit.emoji ? `${hit.emoji} ` : ''}${hit.name}` : '';
  };
  const placeLabel = () => {
    const { zoneId, markerId } = parsePlaceValue(place);
    if (zoneId) return zoneOptions.find((z) => String(z.id) === zoneId)?.name || '';
    if (markerId) return markerOptions.find((m) => String(m.id) === markerId)?.label || '';
    return '';
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isLikelyImageFile(file)) return;
    compressImageWithPreset(file, 'plant')
      .then((dataUrl) => setPhoto(dataUrl))
      .catch((err) => setError(err?.message || 'Photo illisible'));
  };

  const buildBody = () => {
    const { zoneId, markerId } = parsePlaceValue(place);
    const body = { client_uuid: clientUuid, map_id: mapId, observed_at: observedAt };
    if (zoneId) body.zone_id = zoneId;
    if (markerId) body.marker_id = markerId;
    if (plantId) body.plant_id = Number(plantId);
    if (mode) body.detection_mode = mode;
    if (text.trim()) body.text = text.trim();
    return body;
  };

  const queueOffline = async (body) => {
    const userId = currentObservationUserId();
    const photoKept = photo
      ? await putOfflinePhoto(clientUuid, { userId, dataUrl: photo, kind: 'species_observation' })
      : false;
    const kept = enqueueSpeciesObservation({
      ...body,
      text: body.text || '',
      user_id: userId,
      plant_label: plantLabel(),
      place_label: placeLabel(),
      has_photo: photoKept,
    });
    if (!kept) {
      if (photoKept) await deleteOfflinePhoto(clientUuid);
      setError(T.queueFailed);
      return;
    }
    notifyOutboxChanged({ reason: 'queued', kind: 'species_observation' });
    onDone?.({
      queued: true,
      message: photo && !photoKept ? T.queuedWithoutPhoto : T.queued,
    });
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (saving) return;
    if (!plantId && !text.trim()) {
      setError(T.needSpeciesOrText);
      return;
    }
    setError('');
    const body = buildBody();
    if (isOffline()) {
      setSaving(true);
      await queueOffline(body);
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      const { observation } = await createSpeciesObservation(body);
      let message = T.sent;
      if (photo && observation?.id) {
        try {
          await uploadSpeciesObservationPhoto(observation.id, photo);
        } catch (_) {
          message = T.sentWithoutPhoto;
        }
      }
      onDone?.({ observation, message });
    } catch (err) {
      if (err instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      if (isLikelyNetworkTransportFailure(err)) {
        await queueOffline(body);
        return;
      }
      setError(err?.message || 'Envoi impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="species-obs-form" onSubmit={submit} noValidate>
      <p className="species-obs-intro">{T.formIntro}</p>
      <div className="field">
        <label htmlFor="species-obs-plant">{T.speciesLabel}</label>
        <select id="species-obs-plant" value={plantId} onChange={(e) => setPlantId(e.target.value)}>
          <option value="">{T.speciesUnknown}</option>
          {plantOptions.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.emoji ? `${p.emoji} ` : ''}
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="species-obs-place">{T.placeLabel}</label>
        <select id="species-obs-place" value={place} onChange={(e) => setPlace(e.target.value)}>
          <option value="">{T.placeNone}</option>
          {zoneOptions.length > 0 ? (
            <optgroup label="Zones">
              {zoneOptions.map((z) => (
                <option key={`zone-${z.id}`} value={placeValue('zone', z.id)}>
                  {z.name || 'Zone'}
                </option>
              ))}
            </optgroup>
          ) : null}
          {markerOptions.length > 0 ? (
            <optgroup label="Repères">
              {markerOptions.map((m) => (
                <option key={`marker-${m.id}`} value={placeValue('marker', m.id)}>
                  {m.label?.trim() ? m.label : 'Repère'}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div className="field">
        <label htmlFor="species-obs-date">{T.dateLabel}</label>
        <input
          id="species-obs-date"
          type="date"
          value={observedAt}
          max={todayLocalDate()}
          onChange={(e) => setObservedAt(e.target.value || todayLocalDate())}
        />
      </div>
      <div className="field">
        <label htmlFor="species-obs-mode">{T.modeLabel}</label>
        <select id="species-obs-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">{T.modeNone}</option>
          {DETECTION_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="species-obs-text">{T.textLabel}</label>
        <textarea
          id="species-obs-text"
          value={text}
          maxLength={SPECIES_OBSERVATION_TEXT_MAX}
          placeholder={T.textPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="species-obs-field-label">{T.photoLabel}</span>
        <ObservationPhotoField
          preview={photo}
          galleryFileRef={galleryFileRef}
          cameraFileRef={cameraFileRef}
          onFile={handleFile}
          onRemove={() => setPhoto(null)}
        />
        {photo && isOffline() ? <p className="species-obs-intro">{T.photoOfflineHint}</p> : null}
      </div>
      {error ? (
        <p className="species-obs-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="species-obs-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '…' : T.submit}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          {T.cancel}
        </button>
      </div>
    </form>
  );
}
