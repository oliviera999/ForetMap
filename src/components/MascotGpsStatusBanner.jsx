import {
  IconBan,
  IconCheck,
  IconHourglass,
  IconSignalLow,
  IconVisit,
  IconWarning,
  IconWrench,
} from '../shared/icons.jsx';
/**
 * Légende textuelle du statut de suivi GPS de la mascotte, affichée sous la barre d'outils carte.
 * Ne s'affiche que lorsque le suivi est actif. Chaque état a une icône distincte et un libellé clair.
 *
 * @param {{ gps: {
 *   active: boolean,
 *   status: 'idle'|'prompt'|'granted'|'denied'|'unavailable',
 *   feedback: 'ok'|'out_of_bounds'|'low_accuracy'|'bad_georef'|null,
 *   accuracy: number|null,
 *   error: string|null,
 * } | null }} props
 */
export function MascotGpsStatusBanner({ gps }) {
  if (!gps || !gps.active) return null;

  const accuracyTxt =
    typeof gps.accuracy === 'number' && Number.isFinite(gps.accuracy)
      ? ` (±${Math.round(gps.accuracy)} m)`
      : '';

  let icon = <IconCheck size={14} />;
  let label = `Suivi GPS actif${accuracyTxt}`;
  let tone = '#166534';
  let background = '#ecfdf3';
  let border = '#86efac';

  if (gps.status === 'denied') {
    icon = <IconBan size={14} />;
    label = 'Localisation refusée — autorisez l’accès à la position dans le navigateur';
    tone = '#b91c1c';
    background = '#fef2f2';
    border = '#fecaca';
  } else if (gps.feedback === 'bad_georef') {
    icon = <IconWrench size={14} />;
    label = 'Le calage GPS de ce plan est incohérent — signalez-le à un professeur';
    tone = '#b91c1c';
    background = '#fef2f2';
    border = '#fecaca';
  } else if (!gps.feedback && gps.error) {
    // Échec d'acquisition (position indisponible, délai dépassé) : sans cette branche,
    // « Acquisition… » resterait affiché indéfiniment (audit C2).
    icon = <IconWarning size={14} />;
    label = gps.error;
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  } else if (gps.status === 'prompt' && !gps.feedback) {
    icon = <IconHourglass size={14} />;
    label = 'Acquisition de la position GPS…';
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  } else if (gps.feedback === 'out_of_bounds') {
    icon = <IconVisit size={14} />;
    label = 'Vous semblez hors de la zone du plan — rapprochez-vous pour réapparaître';
    tone = '#92400e';
    background = '#fffbeb';
    border = '#fde68a';
  } else if (gps.feedback === 'low_accuracy') {
    icon = <IconSignalLow size={14} />;
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
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--fw-semibold)',
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
