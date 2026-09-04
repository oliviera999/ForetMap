import React, { useCallback } from 'react';

/**
 * Pastille d'un groupe de repères : compteur, emoji du repère représentatif, couleur de la
 * catégorie majoritaire. Mémoïsée, handler stable par groupe.
 */
const PctClusterButton = React.memo(function PctClusterButton({ cluster, onClusterClick, color }) {
  const handleClick = useCallback(
    (event) => onClusterClick?.(cluster, event),
    [cluster, onClusterClick],
  );
  const emoji = String(cluster.lead?.emoji || '').trim() || '📍';
  return (
    <button
      type="button"
      className="fm-pct-cluster"
      style={{
        left: `${cluster.x_pct}%`,
        top: `${cluster.y_pct}%`,
        ...(color ? { borderColor: color } : null),
      }}
      aria-label={`${cluster.count} lieux regroupés, dont ${cluster.lead?.label || cluster.lead?.name || 'un lieu'}`}
      onClick={handleClick}
    >
      <span className="fm-pct-cluster__emoji" aria-hidden>
        {emoji}
      </span>
      <span className="fm-pct-cluster__count">{cluster.count}</span>
    </button>
  );
});

/**
 * Calque des **groupes** de repères (lot 5, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.3).
 *
 * Reçoit le résultat de `clusterMarkers` : les groupes de taille 1 sont délégués au rendu de
 * repère du produit (`renderMarker`), les autres deviennent une pastille de groupe. Le produit
 * décide de ce que fait un tap sur un groupe (zoom sur l'enveloppe, ou liste des lieux).
 *
 * @param {object} props
 * @param {Array<object>} props.clusters groupes (`clusterMarkers`).
 * @param {(cluster: object, event: object) => void} props.onClusterClick
 * @param {(marker: object) => import('react').ReactNode} props.renderMarker rendu d'un repère seul.
 * @param {(cluster: object) => string} [props.colorOf] couleur de la catégorie majoritaire.
 */
function PctClusterLayerImpl({ clusters, onClusterClick, renderMarker, colorOf = null }) {
  return (clusters || []).map((cluster) =>
    cluster.count > 1 ? (
      <PctClusterButton
        key={cluster.id}
        cluster={cluster}
        onClusterClick={onClusterClick}
        color={colorOf ? colorOf(cluster) : ''}
      />
    ) : (
      renderMarker(cluster.lead)
    ),
  );
}

export const PctClusterLayer = React.memo(PctClusterLayerImpl);
PctClusterLayer.displayName = 'PctClusterLayer';
