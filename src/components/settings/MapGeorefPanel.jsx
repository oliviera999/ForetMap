import { useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import {
  assessAnchorsGeoPlausibility,
  isValidAnchors,
  pctToGeo,
  planSizeMeters,
} from '../../utils/mapGeoTransform.js';
import {
  formatGeoCoordinate,
  parseGeoCoordinate,
  parseGeoPair,
} from '../../utils/geoCoordParse.js';

const EMPTY_POINT = { xp: null, yp: null, lat: '', lng: '' };
const CALAGE_FIELDS = ['xp', 'yp', 'lat', 'lng'];

/**
 * État d'un point : `xp`/`yp` sont des nombres (posés au clic), `lat`/`lng` restent le
 * **texte saisi** tant que l'utilisateur tape — il n'est réécrit qu'à la sortie du champ.
 * Sans cela, une virgule décimale ou une saisie en cours seraient effacées à chaque frappe.
 */
function toPointState(anchor) {
  return {
    xp: Number.isFinite(anchor?.xp) ? anchor.xp : null,
    yp: Number.isFinite(anchor?.yp) ? anchor.yp : null,
    lat: formatGeoCoordinate(anchor?.lat),
    lng: formatGeoCoordinate(anchor?.lng),
  };
}

function toAnchorsArray(points) {
  return points.map((p) => ({
    xp: Number(p.xp),
    yp: Number(p.yp),
    lat: parseGeoCoordinate(p.lat, 'lat'),
    lng: parseGeoCoordinate(p.lng, 'lng'),
  }));
}

function isPointComplete(p) {
  return (
    Number.isFinite(Number(p.xp)) &&
    p.xp != null &&
    Number.isFinite(Number(p.yp)) &&
    p.yp != null &&
    parseGeoCoordinate(p.lat, 'lat') != null &&
    parseGeoCoordinate(p.lng, 'lng') != null
  );
}

function hasAnyCalibrationValue(points) {
  return points.some((p) =>
    CALAGE_FIELDS.some((field) => p[field] != null && String(p[field]).trim() !== ''),
  );
}

/** Champ renseigné mais illisible (ou hors bornes) → message d'aide sous la ligne. */
function coordFieldError(text, axis) {
  if (text == null || String(text).trim() === '') return null;
  if (parseGeoCoordinate(text, axis) != null) return null;
  return axis === 'lat'
    ? 'Latitude non reconnue (attendu : −90 à 90, ex. 48,8534 ou 48°51\'12"N)'
    : 'Longitude non reconnue (attendu : −180 à 180, ex. 2,3488 ou 2°17\'40"E)';
}

/**
 * Outil de calage GPS d'un plan (mode prof) : poser 3 points de référence en cliquant
 * sur l'image du plan, renseigner leurs coordonnées GPS (saisie ou capture « ma position »),
 * puis activer le suivi. Les 3 ancres définissent la transformation affine côté élève.
 *
 * @param {{ map: object, imageUrl: string, busy?: boolean,
 *           onSaved?: (msg: string) => void, onError?: (msg: string) => void }} props
 */
export function MapGeorefPanel({ map, imageUrl, busy = false, onSaved, onError }) {
  const initial = Array.isArray(map.georef) ? map.georef : [];
  const [points, setPoints] = useState(() =>
    [0, 1, 2].map((i) => (initial[i] ? toPointState(initial[i]) : { ...EMPTY_POINT })),
  );
  const [gpsEnabled, setGpsEnabled] = useState(!!map.gps_enabled);
  const [activePoint, setActivePoint] = useState(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);
  const geo = useGeolocation();

  const hasCalibrationDraft = hasAnyCalibrationValue(points);

  // État dérivé du calage, recalculé uniquement quand la saisie change : validité,
  // plausibilité géographique (échelles/alignement, audit C1) et aperçus de contrôle.
  const { completePoints, anchorsValid, plausibility, planSize, centerPreview } = useMemo(() => {
    const complete = points.filter(isPointComplete);
    const anchors = toAnchorsArray(complete);
    const valid = complete.length === 3 && isValidAnchors(anchors);
    return {
      completePoints: complete,
      anchorsValid: valid,
      plausibility: valid ? assessAnchorsGeoPlausibility(anchors) : null,
      planSize: valid ? planSizeMeters(anchors) : null,
      centerPreview: valid ? pctToGeo(50, 50, anchors) : null,
    };
  }, [points]);

  const plausibilityError =
    plausibility && !plausibility.ok
      ? plausibility.reason === 'geo_collinear'
        ? 'Calage incohérent : les trois points GPS sont alignés ou confondus — choisissez des repères formant un vrai triangle sur le terrain.'
        : `Calage incohérent : les distances GPS ne correspondent pas aux distances sur le plan (échelles incompatibles, facteur ${Math.round(plausibility.scaleRatio)}). Vérifiez les coordonnées de chaque point.`
      : null;

  const updatePoint = (index, patch) => {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  // Index du premier point sans position (xp/yp) posée, ou -1 si tous placés.
  const firstUnplaced = points.findIndex((p) => p.xp == null || p.yp == null);
  // Point qui sera posé au prochain clic : celui armé manuellement, sinon le prochain non placé.
  const armTarget = activePoint != null ? activePoint : firstUnplaced >= 0 ? firstUnplaced : null;

  const handleMapClick = (e) => {
    if (!imgRef.current || armTarget == null) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const xp = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yp = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    updatePoint(armTarget, { xp: Number(xp.toFixed(2)), yp: Number(yp.toFixed(2)) });
    // Avance automatiquement vers le prochain point sans position.
    const next = points.findIndex((p, i) => i !== armTarget && (p.xp == null || p.yp == null));
    setActivePoint(next >= 0 ? next : null);
  };

  /**
   * Saisie d'une coordonnée : le texte est conservé tel quel (virgule, DMS, saisie en
   * cours). Si l'utilisateur colle une **paire** (« 48.8534, 2.3488 », un lien Google
   * Maps…), les deux champs de la ligne sont renseignés d'un coup.
   */
  const handleCoordInput = (index, field, text) => {
    const pair = parseGeoPair(text);
    if (pair) {
      updatePoint(index, {
        lat: formatGeoCoordinate(pair.lat),
        lng: formatGeoCoordinate(pair.lng),
      });
      return;
    }
    updatePoint(index, { [field]: text });
  };

  /** Sortie de champ : réaffichage canonique (degrés décimaux, point décimal). */
  const handleCoordBlur = (index, field) => {
    const raw = points[index]?.[field];
    if (raw == null || String(raw).trim() === '') return;
    const parsed = parseGeoCoordinate(raw, field);
    if (parsed == null) return;
    const normalized = formatGeoCoordinate(parsed);
    if (normalized !== raw) updatePoint(index, { [field]: normalized });
  };

  const applyMyPositionTo = (index) => {
    if (!geo.supported) {
      onError?.('Géolocalisation non disponible sur cet appareil.');
      return;
    }
    if (geo.position) {
      updatePoint(index, {
        lat: formatGeoCoordinate(geo.position.lat),
        lng: formatGeoCoordinate(geo.position.lng),
      });
    } else {
      geo.start();
      onError?.('Acquisition de la position en cours… réessaie dans un instant.');
    }
  };

  const save = async () => {
    if (!anchorsValid && hasCalibrationDraft) {
      onError?.(
        'Calage GPS incomplet : complétez les 3 points ou rechargez la page pour annuler les modifications.',
      );
      return;
    }
    if (gpsEnabled && !anchorsValid) {
      onError?.('3 points complets et distincts sont requis pour activer le suivi GPS.');
      return;
    }
    if (plausibilityError) {
      onError?.(plausibilityError);
      return;
    }
    setSaving(true);
    try {
      const anchors = anchorsValid ? toAnchorsArray(completePoints) : [];
      await api(`/api/settings/admin/maps/${encodeURIComponent(map.id)}/georef`, 'PUT', {
        anchors,
        gps_enabled: gpsEnabled && anchorsValid,
      });
      onSaved?.('Calage GPS enregistré.');
    } catch (e) {
      onError?.(e.message || 'Échec enregistrement du calage GPS.');
    }
    setSaving(false);
  };

  const disabled = busy || saving;

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed #d1d5db',
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 'var(--text-base)' }}>
        📍 Calage GPS (suivi mascotte)
      </h4>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
        Cliquez directement sur le plan pour placer les 3 repères (point suivant auto-sélectionné),
        puis indiquez leurs coordonnées GPS. « Point N » re-cible un repère précis ; « Ma position »
        renseigne les coordonnées du terrain.
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
        Formats acceptés : point <em>ou</em> virgule décimale (<code>48.8534</code>,{' '}
        <code>48,8534</code>), hémisphère (<code>48.8534 N</code>, <code>7.5898 O</code>) et
        degrés-minutes-secondes (<code>48°51&apos;12&quot;N</code>). Vous pouvez aussi coller la
        paire complète (<code>48.8534, 2.3488</code>) ou un lien Google Maps / OpenStreetMap dans
        l&apos;un des deux champs : les deux se remplissent.
      </p>

      {imageUrl ? (
        <div
          data-no-lightbox
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            cursor: armTarget != null ? 'crosshair' : 'default',
            border: armTarget != null ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#f8fafc',
          }}
        >
          <img
            ref={imgRef}
            data-no-lightbox
            src={imageUrl}
            alt={`Plan ${map.label}`}
            onClick={handleMapClick}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
          {armTarget != null ? (
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                right: 8,
                background: 'rgba(37, 99, 235, 0.92)',
                color: 'white',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--fw-bold)',
                padding: '6px 10px',
                borderRadius: 8,
                pointerEvents: 'none',
                textAlign: 'center',
              }}
            >
              Cliquez sur le plan pour placer le point {armTarget + 1}
            </div>
          ) : null}
          {points.map((p, i) =>
            p.xp != null && p.yp != null ? (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${p.xp}%`,
                  top: `${p.yp}%`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#2563eb',
                  color: 'white',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--fw-bold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                }}
              >
                {i + 1}
              </span>
            ) : null,
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {points.map((p, i) => {
          const latError = coordFieldError(p.lat, 'lat');
          const lngError = coordFieldError(p.lng, 'lng');
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${armTarget === i ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActivePoint(i)}
                  disabled={disabled}
                  style={{ minWidth: 76 }}
                  title={`Cibler le point ${i + 1} pour le (re)placer sur le plan`}
                >
                  {armTarget === i ? `▶ Point ${i + 1}` : `Point ${i + 1}`}
                </button>
                {/* `type="text"` volontaire : un champ `number` est reformaté par la locale du
                    navigateur (le point saisi redevient une virgule) et vide sa valeur dès que
                    la saisie ne colle pas au format attendu. */}
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="latitude"
                  value={p.lat ?? ''}
                  onChange={(e) => handleCoordInput(i, 'lat', e.target.value)}
                  onBlur={() => handleCoordBlur(i, 'lat')}
                  disabled={disabled}
                  style={{ width: 120, borderColor: latError ? '#dc2626' : undefined }}
                  aria-label={`Latitude point ${i + 1}`}
                  aria-invalid={latError ? 'true' : undefined}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="longitude"
                  value={p.lng ?? ''}
                  onChange={(e) => handleCoordInput(i, 'lng', e.target.value)}
                  onBlur={() => handleCoordBlur(i, 'lng')}
                  disabled={disabled}
                  style={{ width: 120, borderColor: lngError ? '#dc2626' : undefined }}
                  aria-label={`Longitude point ${i + 1}`}
                  aria-invalid={lngError ? 'true' : undefined}
                />
                {geo.supported ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => applyMyPositionTo(i)}
                    disabled={disabled}
                    title="Renseigner avec la position GPS actuelle"
                  >
                    📡 Ma position
                  </button>
                ) : null}
                <span style={{ fontSize: 'var(--text-xs)', color: '#9ca3af' }}>
                  {p.xp != null ? `x${p.xp} y${p.yp}` : 'non placé'}
                </span>
              </div>
              {latError || lngError ? (
                <p
                  role="alert"
                  style={{ margin: '0 0 2px 82px', fontSize: 'var(--text-xs)', color: '#dc2626' }}
                >
                  {latError || lngError}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          fontSize: 'var(--text-sm)',
        }}
      >
        <input
          type="checkbox"
          checked={gpsEnabled}
          onChange={(e) => setGpsEnabled(e.target.checked)}
          disabled={disabled || !anchorsValid}
        />
        Activer le suivi GPS pour ce plan {anchorsValid ? '' : '(3 points valides requis)'}
      </label>

      {geo.position ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: '#16a34a' }}>
          Position actuelle : {geo.position.lat.toFixed(5)}, {geo.position.lng.toFixed(5)} (±
          {Math.round(geo.position.accuracy)} m)
        </p>
      ) : null}
      {centerPreview ? (
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Contrôle : centre du plan ≈ {centerPreview.lat.toFixed(5)}, {centerPreview.lng.toFixed(5)}
        </p>
      ) : null}
      {planSize ? (
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Échelle déduite : plan ≈ {Math.round(planSize.widthM)} m × {Math.round(planSize.heightM)}{' '}
          m — si ces dimensions ne ressemblent pas au terrain, un point est mal renseigné.
        </p>
      ) : null}
      {plausibilityError ? (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: '#dc2626' }}>
          ⚠️ {plausibilityError}
        </p>
      ) : null}

      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>
          {saving ? 'Enregistrement…' : 'Enregistrer le calage GPS'}
        </button>
      </div>
    </div>
  );
}

export default MapGeorefPanel;
