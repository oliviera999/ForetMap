import React, { lazy, Suspense } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { resolveVisitMascotEntry, getDefaultVisitMascotId } from '../utils/visitMascotCatalog.js';
import VisitMascotFallbackSvg from './VisitMascotFallbackSvg.jsx';

// Renderers lourds chargés à la demande : seul le renderer effectivement sélectionné est
// téléchargé (rive ~166 KB, sprite_cut ~102 KB). Le fallback SVG (eager) sert de placeholder
// Suspense pendant le chargement du chunk — comportement visuel identique à l'ancien fallback.
const VisitMapMascotRive = lazy(() => import('./VisitMapMascotRive.jsx'));
const VisitMapMascotSpritesheet = lazy(() => import('./VisitMapMascotSpritesheet.jsx'));
const VisitMapMascotSpriteCut = lazy(() => import('./VisitMapMascotSpriteCut.jsx'));

function VisitMapMascotRenderer({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotId = '',
  extraCatalogEntries = [],
}) {
  const selectedMascot =
    resolveVisitMascotEntry(mascotId, extraCatalogEntries) ||
    resolveVisitMascotEntry(getDefaultVisitMascotId(), extraCatalogEntries);
  const selectedMascotId = selectedMascot?.id || getDefaultVisitMascotId();
  const fallbackSilhouette = selectedMascot?.fallbackSilhouette || 'gnome';
  const fallbackVariant = selectedMascot?.fallbackVariant || 'forest';
  const fallback = (
    <VisitMascotFallbackSvg silhouette={fallbackSilhouette} variant={fallbackVariant} />
  );
  const renderer = selectedMascot?.renderer;

  let Active;
  if (renderer === 'spritesheet') Active = VisitMapMascotSpritesheet;
  else if (renderer === 'sprite_cut') Active = VisitMapMascotSpriteCut;
  else Active = VisitMapMascotRive;

  // Remount complet (Suspense + renderer lazy) à chaque changement de mascotte ou de type
  // de renderer — évite sprites/états résiduels quand plusieurs instances coexistent (grille
  // onboarding, catalogue GL) ou lors d’un changement dans l’aperçu studio.
  const remountKey = `${selectedMascotId}:${renderer || 'rive'}`;

  return (
    <Suspense key={remountKey} fallback={fallback}>
      <Active
        key={remountKey}
        mascotState={mascotState}
        mascotConfig={selectedMascot}
        fallback={fallback}
        mascotId={selectedMascotId}
      />
    </Suspense>
  );
}

export default VisitMapMascotRenderer;
