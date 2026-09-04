import { HelpDock } from '../../shared/help/HelpDock.jsx';
import { useGlNarrator } from '../hooks/useGlNarrator.js';
import { useGlHelpContent } from '../hooks/useGlHelpContent.js';
import { renderGlHelpBody } from './glHelpBody.jsx';

/**
 * Aide contextuelle GL **appelée** par un bouton « ? », sur le modèle du `HelpPanel`
 * de ForetMap.
 *
 * Remplace, pour les onglets, l'encadré replié en bas de page : un texte qu'il fallait
 * aller chercher sous le contenu n'était lu que par ceux qui descendaient jusqu'à lui.
 * Le bouton pulse tant que l'aide de l'onglet n'a jamais été ouverte, puis se calme —
 * la mémoire par clé (`gl_help_seen:`) est celle de l'ancien encadré, donc un onglet
 * déjà consulté ne redemande pas l'attention.
 *
 * Depuis le lot 7 du plan de convergence, l'appel, la mémoire « déjà lu » et le rendu de la
 * modale viennent du **dock d'aide partagé** (`src/shared/help/HelpDock.jsx`) : ce module ne
 * garde que ce qui est propre à G&L — le contenu serveur, le narrateur et les classes de
 * thème. ForetMap et le Plan Lyautey utilisent le même dock.
 *
 * L'encadré inline (`GLHelpPanel`) reste utilisé là où l'aide fait partie de la page
 * elle-même, comme le carnet personnel.
 */
export function GLHelpDialog({ helpKey, isStaff = false, onStartTour = null }) {
  const { title, body } = useGlHelpContent(helpKey, { isStaff });
  const { narrator } = useGlNarrator();

  if (!helpKey || !String(body || '').trim()) return null;

  return (
    <HelpDock
      helpKey={helpKey}
      title={title}
      body={renderGlHelpBody(body)}
      storagePrefix="gl_help_seen:"
      onStartTour={onStartTour}
      narrator={narrator}
      className={null}
      buttonClassName="gl-help-btn"
      overlayClassName="gl-help-dialog-overlay"
      dialogClassName="gl-help-dialog fade-in"
      classNames={{
        title: 'gl-help-dialog__title',
        portrait: 'gl-help-dialog__portrait',
        body: 'gl-help-dialog__body',
        actions: 'gl-help-dialog__actions',
        tourCta: 'gl-help-dialog__tour-cta',
      }}
    />
  );
}
