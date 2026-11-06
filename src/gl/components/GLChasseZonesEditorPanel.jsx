import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { plateauBoardImg, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { resolveGlBoardImageUrl } from '../utils/glLegacyMediaUrl.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';
import { buildChasseZonesExportJson } from '../utils/glFeuilletZoneExport.js';

/**
 * « Tenir à deux » — éditeur des polygones de chasse (28 zones à dessiner au 06/11).
 * Liste des zones du plateau (titre privé, feuillet, géométrie prête ou non) ; un clic sur
 * « Dessiner », puis des clics sur le plateau posent les sommets ; « Enregistrer » envoie
 * `PUT /api/gl/admin/chasse-zones/:zoneKey/polygone` (centroïde et rang de case calculés
 * par le serveur). « Exporter le JSON » réécrit `chasse-zones.json` à versionner.
 */
export function GLChasseZonesEditorPanel({ plateauNumber, mapImageUrl = null }) {
  const assetsReady = useGlAssetsReady();
  const mapGestures = useGlPctMapGestures();
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [drawingKey, setDrawingKey] = useState(null);
  const [draftPoints, setDraftPoints] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!plateauNumber) return;
    try {
      const data = await apiGL(`/api/gl/admin/chasse-zones?plateau=${plateauNumber}`);
      setZones(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Zones de chasse indisponibles');
    }
  }, [plateauNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const conventionBoard = useMemo(() => {
    if (!assetsReady || !plateauNumber) return null;
    return plateauBoardImg(plateauNumber);
  }, [assetsReady, plateauNumber]);

  const imageUrl = useMemo(
    () =>
      resolveGlBoardImageUrl({
        mapImageUrl,
        conventionBoard,
        conventionChapter: null,
        placeholderUrl: GL_ASSET_PLACEHOLDER_URL,
      }),
    [mapImageUrl, conventionBoard],
  );

  const handleMapClick = useCallback(
    (pct) => {
      if (!drawingKey || !pct) return;
      const x = Math.max(0, Math.min(1, Number(pct.xp ?? pct.x) / 100));
      const y = Math.max(0, Math.min(1, Number(pct.yp ?? pct.y) / 100));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setDraftPoints((prev) => [...prev, [Number(x.toFixed(4)), Number(y.toFixed(4))]]);
    },
    [drawingKey],
  );

  async function save() {
    if (!drawingKey || draftPoints.length < 3) return;
    setBusy(true);
    try {
      await apiGL(`/api/gl/admin/chasse-zones/${encodeURIComponent(drawingKey)}/polygone`, 'PUT', {
        polygone: draftPoints,
      });
      setDrawingKey(null);
      setDraftPoints([]);
      await load();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function clearZone(zoneKey) {
    setBusy(true);
    try {
      await apiGL(`/api/gl/admin/chasse-zones/${encodeURIComponent(zoneKey)}/polygone`, 'PUT', {
        polygone: null,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Effacement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function exportJson() {
    try {
      const data = await apiGL('/api/gl/admin/chasse-zones');
      const json = buildChasseZonesExportJson(Array.isArray(data?.items) ? data.items : []);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'chasse-zones.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Export impossible');
    }
  }

  const ready = zones.filter((z) => z.geometriePrete).length;

  return (
    <section className="gl-chasse-zones-editor" data-testid="gl-chasse-zones-editor">
      <header className="gl-inline-actions">
        <h4>
          Zones de chasse — plateau {plateauNumber} ({ready}/{zones.length} dessinées)
        </h4>
        <GLButton type="button" variant="secondary" onClick={exportJson} disabled={busy}>
          Exporter le JSON
        </GLButton>
      </header>
      <p className="gl-hint">
        Les polygones ne sont jamais envoyés aux élèves. Une zone sans géométrie n’est pas chassable
        tant qu’elle n’est pas dessinée.
      </p>
      {error ? <p className="gl-error-banner">{error}</p> : null}
      <div className="gl-chasse-zones-editor__layout">
        <GLPctMapCanvas
          imageUrl={imageUrl}
          imageAlt={`Plateau ${plateauNumber} — zones de chasse`}
          mapGestures={mapGestures}
          className="gl-board gl-chasse-zones-editor__canvas"
          cursor={drawingKey ? 'crosshair' : 'default'}
          onMapClick={handleMapClick}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="gl-feuillet-zone-overlay"
            aria-hidden="true"
          >
            {zones
              .filter((z) => Array.isArray(z.polygone) && z.polygone.length >= 3)
              .map((z) => (
                <polygon
                  key={z.zoneKey}
                  className="gl-feuillet-zone-polygon is-read"
                  points={z.polygone.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                />
              ))}
            {draftPoints.length ? (
              <polygon
                className="gl-feuillet-zone-polygon is-selected"
                points={draftPoints.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
              />
            ) : null}
            {draftPoints.map(([x, y], idx) => (
              <circle
                key={idx}
                cx={x * 100}
                cy={y * 100}
                r={0.6}
                className="gl-chasse-zone-vertex"
              />
            ))}
          </svg>
        </GLPctMapCanvas>
        <ul className="gl-chasse-zones-editor__list">
          {zones.map((z) => (
            <li key={z.zoneKey} className={z.geometriePrete ? 'is-ready' : 'is-missing'}>
              <div>
                <strong>{z.zoneKey}</strong> · {z.feuilletCode} ·{' '}
                {z.geometriePrete ? `prête (case ${z.rangCase ?? '?'})` : 'à dessiner'}
                <p className="gl-hint">{z.titrePrive}</p>
              </div>
              <span className="gl-inline-actions">
                {drawingKey === z.zoneKey ? (
                  <>
                    <GLButton
                      type="button"
                      disabled={busy || draftPoints.length < 3}
                      onClick={save}
                    >
                      Enregistrer ({draftPoints.length} pts)
                    </GLButton>
                    <GLButton
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setDrawingKey(null);
                        setDraftPoints([]);
                      }}
                    >
                      Annuler
                    </GLButton>
                  </>
                ) : (
                  <GLButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDrawingKey(z.zoneKey);
                      setDraftPoints([]);
                    }}
                  >
                    Dessiner
                  </GLButton>
                )}
                {z.geometriePrete && drawingKey !== z.zoneKey ? (
                  <GLButton
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => clearZone(z.zoneKey)}
                  >
                    Effacer
                  </GLButton>
                ) : null}
              </span>
            </li>
          ))}
          {!zones.length ? (
            <li className="gl-hint">Aucune zone importée pour ce plateau (`gl:import:tenir`).</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
