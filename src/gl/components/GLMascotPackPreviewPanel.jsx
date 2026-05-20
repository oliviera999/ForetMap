import React from 'react';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';

export function GLMascotPackPreviewPanel({ pack }) {
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
      <div className="gl-inline-actions">
        <GLMascotRenderer mascotId={id} mascotState="idle" size={72} />
        <GLMascotRenderer mascotId={id} mascotState="walking" size={72} />
        <GLMascotRenderer mascotId={id} mascotState="talking" size={72} />
      </div>
    </section>
  );
}
