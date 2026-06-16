import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { groupPlantLocationsByMap } from '../../utils/plantCatalogHelpers.js';
import { buildMapImageCandidates } from '../../utils/mapImageCandidates';
import { parseZonePointsJson, computeBiodivMapFitRect } from '../../utils/biodivMapGeometry.js';

/**
 * Mini-cartes d'emplacement (zones / repères) des fiches biodiversité — extraites de
 * `foretmap-views.jsx` (O6). Rendu d'aperçu en lecture seule : image de plan (avec repli de
 * candidats) + polygones de zones et points de repères en SVG normalisé.
 */

export function BiodivLocationMapBlock({ mapId, maps, zones, markers }) {
  const activeMap = maps.find((m) => m.id === mapId);
  const candidates = useMemo(() => buildMapImageCandidates(activeMap), [activeMap]);

  const [ci, setCi] = useState(0);
  useEffect(() => {
    setCi(0);
  }, [mapId, activeMap?.map_image_url]);

  const drawableZones = useMemo(
    () => (zones || []).filter((z) => parseZonePointsJson(z.points).length >= 3),
    [zones],
  );
  const drawableMarkers = useMemo(
    () =>
      (markers || []).filter((mk) => {
        const x = Number(mk.x_pct);
        const y = Number(mk.y_pct);
        return Number.isFinite(x) && Number.isFinite(y);
      }),
    [markers],
  );

  const onImgError = useCallback(() => {
    setCi((c) => (c < candidates.length - 1 ? c + 1 : c));
  }, [candidates.length]);

  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const stageRef = useRef(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setStageBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(
    () => computeBiodivMapFitRect(imgNatural.w, imgNatural.h, stageBox.w, stageBox.h),
    [imgNatural.w, imgNatural.h, stageBox.w, stageBox.h],
  );

  // Court-circuit APRES tous les hooks (Rules of Hooks) : evite le crash "rendered fewer/more
  // hooks than expected" quand zones/markers passent de vide a non-vide entre deux refetch.
  if (drawableZones.length === 0 && drawableMarkers.length === 0) return null;

  const src = candidates[Math.min(ci, candidates.length - 1)];
  const label = activeMap?.label || mapId;

  return (
    <div className="biodiv-location-map-wrap">
      <div className="biodiv-location-map-label">{label}</div>
      <div
        ref={stageRef}
        className="biodiv-location-map-stage"
        role="img"
        aria-label={`Aperçu des emplacements sur le plan ${label}`}
      >
        <div
          className="biodiv-location-map-fit-layer"
          style={
            fit.width > 0 && fit.height > 0
              ? { left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height }
              : { left: 0, top: 0, width: '100%', height: '100%' }
          }
        >
          <img
            src={src}
            alt=""
            className="biodiv-location-map-img"
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgNatural({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 });
            }}
            onError={onImgError}
          />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="biodiv-location-map-svg"
            aria-hidden="true"
          >
            {drawableZones.map((z) => {
              const pts = parseZonePointsJson(z.points);
              const p = pts.map((pt) => `${pt.xp},${pt.yp}`).join(' ');
              return (
                <polygon
                  key={z.id}
                  points={p}
                  fill="rgba(99,102,241,0.22)"
                  stroke="#6366f1"
                  strokeWidth="0.45"
                />
              );
            })}
            {drawableMarkers.map((m) => (
              <circle
                key={m.id}
                className="biodiv-location-marker-dot"
                cx={Number(m.x_pct)}
                cy={Number(m.y_pct)}
                r={2.4}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export function PlantLocationPreviewMaps({ maps, zones, markers }) {
  const groups = useMemo(
    () => [...groupPlantLocationsByMap(zones, markers).entries()],
    [zones, markers],
  );
  if (groups.length === 0) return null;
  return (
    <div className="biodiv-location-maps">
      {groups.map(([mid, data]) => (
        <BiodivLocationMapBlock
          key={mid}
          mapId={mid}
          maps={maps}
          zones={data.zones}
          markers={data.markers}
        />
      ))}
    </div>
  );
}
