import React, { useMemo, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import VisitMapMascotSpriteCut from './VisitMapMascotSpriteCut.jsx';
import VisitMascotFallbackSvg from './VisitMascotFallbackSvg.jsx';

const STATE_OPTIONS = Object.values(VISIT_MASCOT_STATE).sort();

/**
 * Prévisualisation mascotte pack v1 après validation Zod.
 * @param {{ validated: { ok: true, pack: object, spriteCut: object } | null, title?: string }} props
 */
export default function MascotPackPreviewPanel({ validated, title = 'Prévisualisation' }) {
  const [previewState, setPreviewState] = useState(VISIT_MASCOT_STATE.IDLE);

  const mascotConfig = useMemo(() => {
    if (!validated?.ok) return null;
    return {
      id: validated.pack.id,
      renderer: 'sprite_cut',
      fallbackSilhouette: validated.pack.fallbackSilhouette || 'gnome',
      spriteCut: validated.spriteCut,
    };
  }, [validated]);

  const statesWithFrames = useMemo(() => {
    if (!mascotConfig?.spriteCut?.stateFrames) return [];
    return STATE_OPTIONS.filter((s) => mascotConfig.spriteCut.stateFrames[s]);
  }, [mascotConfig]);

  React.useEffect(() => {
    if (statesWithFrames.length > 0 && !statesWithFrames.includes(previewState)) {
      setPreviewState(statesWithFrames[0]);
    }
  }, [statesWithFrames, previewState]);

  if (!mascotConfig) return null;

  return (
    <section className="mascot-pack-wysiwyg__preview" style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: '1.05rem', marginTop: 0 }}>{title}</h3>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          État :{' '}
          <select
            value={previewState}
            onChange={(e) => setPreviewState(e.target.value)}
            className="form-select"
            style={{ minWidth: 160 }}
          >
            {statesWithFrames.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          Silhouette secours : {mascotConfig.fallbackSilhouette}
        </span>
      </div>
      <div
        className="visit-mascot-preview-body visit-mascot-preview-body--motion-idle"
        style={{
          width: 120,
          height: 130,
          border: '1px dashed rgba(26,71,49,0.35)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(248,250,245,0.95)',
        }}
      >
        <VisitMapMascotSpriteCut
          mascotId={mascotConfig.id}
          mascotState={previewState}
          mascotConfig={mascotConfig}
          fallback={(
            <VisitMascotFallbackSvg
              silhouette={mascotConfig.fallbackSilhouette}
              variant="forest"
            />
          )}
        />
      </div>
    </section>
  );
}
