import React from 'react';
import VisitMapMascotRenderer from '../../components/VisitMapMascotRenderer.jsx';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';

function isGlMascotId(id) {
  return typeof id === 'string' && id.startsWith('gl-');
}

export function GLMascotRenderer({ mascotId, mascotState, size = 48 }) {
  if (isGlMascotId(mascotId)) {
    return <GLMascotAvatar mascotId={mascotId} size={size} />;
  }
  return <VisitMapMascotRenderer mascotState={mascotState} mascotId={mascotId} />;
}
