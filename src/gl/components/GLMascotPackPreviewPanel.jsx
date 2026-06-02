import React, { useMemo } from 'react';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';
import { validateGlMascotPackForUi } from '../../shared/mascot-pack/glPackValidationUi.js';
import { MascotPackSpriteCutPreview } from '../../shared/mascot-pack/MascotPackSpriteCutPreview.jsx';
import { glMascotPackSpriteCutToVisitValidation } from '../../utils/glMascotPackToVisit.js';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

export function GLMascotPackPreviewPanel({ pack }) {
  const visitValidated = useMemo(() => {
    if (!pack?.payload) return null;
    const ui = validateGlMascotPackForUi(pack.payload);
    if (!ui.ok || ui.pack.renderer !== 'sprite_cut') return null;
    const mapped = glMascotPackSpriteCutToVisitValidation(ui.pack, { relaxAssetPrefix: true });
    return mapped.ok ? mapped : null;
  }, [pack]);

  if (!pack) {
    return <p className="gl-hint">Sélectionnez un pack pour afficher la preview.</p>;
  }

  const id = pack?.payload?.id || `pack-${pack.id}`;

  return (
    <section className="gl-panel">
      <h3>Preview pack</h3>
      <p>
        <strong>{pack.name}</strong> ({pack.payload?.renderer || 'fallback'})
      </p>
      {visitValidated?.ok ? (
        <MascotPackSpriteCutPreview
          validated={visitValidated}
          title="Preview sprite_cut"
          stateOptions={Object.values(VISIT_MASCOT_STATE)}
          defaultState={VISIT_MASCOT_STATE.IDLE}
          previewClassName="gl-panel"
        />
      ) : (
        <div className="gl-inline-actions">
          <GLMascotRenderer mascotId={id} mascotState="idle" size={72} />
          <GLMascotRenderer mascotId={id} mascotState="walking" size={72} />
          <GLMascotRenderer mascotId={id} mascotState="talking" size={72} />
        </div>
      )}
    </section>
  );
}
