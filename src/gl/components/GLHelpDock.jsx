import { GLHelpDialog } from './GLHelpDialog.jsx';
import { useGLTour } from '../context/GLTourContext.jsx';

/**
 * Point d'appel de l'aide d'un onglet GL : un bouton « ? » flottant, discret, qui ouvre
 * l'aide en modale — et, quand l'onglet a une visite guidée, permet de la relancer.
 *
 * Le composant existe pour tenir le **positionnement** et le branchement au parcours hors
 * de `GLHelpDialog`, qui reste réutilisable ailleurs (une page voulant son propre bouton).
 */
export function GLHelpDock({ tab, isStaff = false }) {
  const tour = useGLTour();
  if (!tab) return null;
  const canRunTour = !!tour?.hasTour?.(tab);
  return (
    <div className="gl-help-dock" data-gl-help-dock={tab}>
      <GLHelpDialog
        helpKey={`tab:${tab}`}
        isStaff={isStaff}
        onStartTour={canRunTour ? () => tour.startTour(tab, { force: true }) : null}
      />
    </div>
  );
}
