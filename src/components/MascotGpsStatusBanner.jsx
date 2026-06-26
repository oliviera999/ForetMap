import React from 'react';

/**
 * Légende textuelle du statut de suivi GPS de la mascotte, affichée sous la barre d'outils carte.
 * Ne s'affiche que lorsque le suivi est actif. Chaque état a une icône distincte et un libellé clair.
 *
 * @param {{ gps: {
 *   active: boolean,
 *   status: 'idle'|'prompt'|'granted'|'denied'|'unavailable',
 *   feedback: 'ok'|'out_of_bounds'|'low_accuracy'|null,
 *   accuracy: number|null,
 * } | null }} props
 */
export function MascotGpsStatusBanner({ gps }) {
  if (!gps || !gps.active) return null;

  const accuracyTxt =
    typeof gps.accuracy === 'number' && Number.isFinite(gps.accuracy)
      ? ` (±${Math.round(gps.accuracy)} m)`
      : '';

  let icon = '✅';
  let label = `Suivi GPS actif${accuracyTxt}`;
  let tone = '#166534';
  let background = '#ecfdf3';
  let border = '#86efac';

  if (gps.status === 'denied') {
    icon = '⛔';
    label = 'Localisation refusée — autorisez l’accès à la position dans le navigateur';
    tone = '#b91c1c';
    background = '#fef2f2';
    border = '#fecaca';
  } else if (gps.status === 'prompt' && !gps.feedback) {
    icon = '⏳';
    label = 'Acquisition de la position GPS…';
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  } else if (gps.feedback === 'out_of_bounds') {
    icon = '🧭';
    label = 'Vous semblez hors de la zone du plan — rapprochez-vous pour réapparaître';
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  } else if (gps.feedback === 'low_accuracy') {
    icon = '📶';
    label = `Signal GPS faible — position trop imprécise${accuracyTxt}, la mascotte attend un meilleur signal`;
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  }

  return (
    <p
      className="map-view-gps-status"
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '8px 12px 0',
        padding: '6px 10px',
        fontSize: '.8rem',
        fontWeight: 600,
        color: tone,
        background,
        border: `1px solid ${border}`,
        borderRadius: 8,
      }}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </p>
  );
}

export default MascotGpsStatusBanner;
