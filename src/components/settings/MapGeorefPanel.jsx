import React, { useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { isValidAnchors, pctToGeo } from '../../utils/mapGeoTransform.js';

const EMPTY_POINT = { xp: null, yp: null, lat: null, lng: null };
const CALAGE_FIELDS = ['xp', 'yp', 'lat', 'lng'];

function toAnchorsArray(points) {
  return points.map((p) => ({
    xp: Number(p.xp),
    yp: Number(p.yp),
    lat: Number(p.lat),
    lng: Number(p.lng),
  }));
}

function isPointComplete(p) {
  return [p.xp, p.yp, p.lat, p.lng].every((v) => v != null && Number.isFinite(Number(v)));
}

function hasAnyCalibrationValue(points) {
  return points.some((p) => CALAGE_FIELDS.some((field) => p[field] != null && p[field] !== ''));
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
  const [points, setPoints] = useState(() => {
    const base = [0, 1, 2].map((i) => ({ ...EMPTY_POINT, ...(initial[i] || {}) }));
    return base;
  });
  const [gpsEnabled, setGpsEnabled] = useState(!!map.gps_enabled);
  const [activePoint, setActivePoint] = useState(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);
  const geo = useGeolocation();

  const completePoints = points.filter(isPointComplete);
  const hasCalibrationDraft = hasAnyCalibrationValue(points);
  const anchorsValid =
    completePoints.length === 3 && isValidAnchors(toAnchorsArray(completePoints));

  // Aperçu de contrôle : recalcule la position GPS du centre du plan via la transformation.
  const centerPreview = useMemo(() => {
    if (!anchorsValid) return null;
    return pctToGeo(50, 50, toAnchorsArray(completePoints));
  }, [anchorsValid, completePoints]);

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

  const applyMyPositionTo = (index) => {
    if (!geo.supported) {
      onError?.('Géolocalisation non disponible sur cet appareil.');
      return;
    }
    if (geo.position) {
      updatePoint(index, {
        lat: Number(geo.position.lat.toFixed(7)),
        lng: Number(geo.position.lng.toFixed(7)),
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
      <h4 style={{ margin: '0 0 6px', fontSize: '.92rem' }}>📍 Calage GPS (suivi mascotte)</h4>
      <p style={{ margin: '0 0 8px', fontSize: '.75rem', color: '#6b7280' }}>
        Cliquez directement sur le plan pour placer les 3 repères (point suivant auto-sélectionné),
        puis indiquez leurs coordonnées GPS. « Point N » re-cible un repère précis ; « Ma position »
        renseigne les coordonnées du terrain.
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
                fontSize: '.78rem',
                fontWeight: 700,
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
                  fontSize: '.7rem',
                  fontWeight: 700,
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
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <input
              type="number"
              step="any"
              placeholder="latitude"
              value={p.lat ?? ''}
              onChange={(e) =>
                updatePoint(i, { lat: e.target.value === '' ? null : Number(e.target.value) })
              }
              disabled={disabled}
              style={{ width: 120 }}
              aria-label={`Latitude point ${i + 1}`}
            />
            <input
              type="number"
              step="any"
              placeholder="longitude"
              value={p.lng ?? ''}
              onChange={(e) =>
                updatePoint(i, { lng: e.target.value === '' ? null : Number(e.target.value) })
              }
              disabled={disabled}
              style={{ width: 120 }}
              aria-label={`Longitude point ${i + 1}`}
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
            <span style={{ fontSize: '.7rem', color: '#9ca3af' }}>
              {p.xp != null ? `x${p.xp} y${p.yp}` : 'non placé'}
            </span>
          </div>
        ))}
      </div>

      <label
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '.82rem' }}
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
        <p style={{ margin: '6px 0 0', fontSize: '.72rem', color: '#16a34a' }}>
          Position actuelle : {geo.position.lat.toFixed(5)}, {geo.position.lng.toFixed(5)} (±
          {Math.round(geo.position.accuracy)} m)
        </p>
      ) : null}
      {centerPreview ? (
        <p style={{ margin: '4px 0 0', fontSize: '.72rem', color: '#6b7280' }}>
          Contrôle : centre du plan ≈ {centerPreview.lat.toFixed(5)}, {centerPreview.lng.toFixed(5)}
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
