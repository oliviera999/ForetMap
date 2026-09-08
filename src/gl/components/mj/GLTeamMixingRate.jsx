import { useEffect, useState } from 'react';

import { apiGL } from '../../services/apiGL.js';
import { formatMixingRate } from '../../utils/glTeamCompositionRecipes.js';

/**
 * Indicateur de brassage cumulé de la classe (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 7.4) :
 * part des binômes possibles entre joueurs actifs déjà réunis dans une équipe, toutes parties
 * confondues. Purement informatif, aucun score individuel.
 */
export function GLTeamMixingRate({ gameId, refreshKey = 0 }) {
  const [mixing, setMixing] = useState(null);

  useEffect(() => {
    if (!gameId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGL(`/api/gl/games/${gameId}/teams/compose/mixing-rate`, 'GET');
        if (!cancelled) setMixing(data || null);
      } catch {
        if (!cancelled) setMixing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, refreshKey]);

  const label = formatMixingRate(mixing);
  if (!label) return null;
  return (
    <p className="gl-hint gl-team-mixing" data-testid="gl-team-mixing" role="status">
      Brassage de la classe : {label}.
    </p>
  );
}

export default GLTeamMixingRate;
