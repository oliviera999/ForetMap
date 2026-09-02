import { FloatingDock } from './FloatingDock.jsx';

/**
 * Bandeau d'information contextuel (forum, commentaires) monté dans le FloatingDock
 * partagé (audit UI, D-3) : l'anti-chevauchement avec la navigation basse et les autres
 * commandes flottantes est garanti par le dock (z-layers + variables communes), au lieu
 * d'une copie manuelle de ses constantes dans une classe dédiée.
 */
export function AppInlineToast({ children }) {
  if (children == null || children === '') return null;
  return (
    <FloatingDock label="Notifications">
      <div
        className="fm-toast fm-toast--inline"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {children}
      </div>
    </FloatingDock>
  );
}
