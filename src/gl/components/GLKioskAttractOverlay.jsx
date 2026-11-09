import { GLDiceCube } from './GLDiceCube.jsx';

/**
 * Écran d'accueil d'une **borne de démonstration** (`?kiosque=1`) : plein écran, trois dés
 * qui roulent, une seule consigne. Un geste n'importe où l'efface et ouvre le plateau de
 * démonstration ; après la période d'inactivité, la page se recharge et il revient.
 *
 * C'est un bouton, pas un décor : la borne se pilote au doigt comme au clavier.
 */
export function GLKioskAttractOverlay({ title, subtitle, onStart }) {
  return (
    <button
      type="button"
      className="gl-kiosk-attract fade-in"
      data-testid="gl-kiosk-attract"
      onClick={() => onStart?.()}
    >
      <span className="gl-kiosk-attract__dice" aria-hidden="true">
        <GLDiceCube rolling staggerIndex={0} />
        <GLDiceCube rolling staggerIndex={1} />
        <GLDiceCube rolling staggerIndex={2} />
      </span>
      <span className="gl-kiosk-attract__title">{title || 'Gnomes & Licornes'}</span>
      {subtitle ? <span className="gl-kiosk-attract__subtitle">{subtitle}</span> : null}
      <span className="gl-kiosk-attract__cta">Touchez l’écran pour commencer</span>
    </button>
  );
}
