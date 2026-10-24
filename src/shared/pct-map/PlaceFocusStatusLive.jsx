/**
 * Annonce polie pendant le zoom sur un lieu (ANIM-15) : le délai clic → fiche
 * (350 ms à ~1 s) n'était sinon jamais annoncé aux lecteurs d'écran.
 *
 * @param {{ message?: string }} props
 */
export function PlaceFocusStatusLive({ message = '' }) {
  return (
    <p className="fm-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message || ''}
    </p>
  );
}
