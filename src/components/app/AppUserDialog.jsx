import { Suspense } from 'react';
import { DialogShell } from '../DialogShell';
import { IconClose } from '../../shared/icons.jsx';

/**
 * Coquille commune des modales « utilisateur » du shell (statistiques, profil) :
 * overlay, bouton de fermeture et zone défilante étaient recopiés à l'identique
 * dans App.jsx. Le contenu est enveloppé d'un `Suspense` car ces vues sont lazy.
 *
 * @param {object} props
 * @param {boolean} props.open Modale ouverte.
 * @param {() => void} props.onClose Fermeture (croix et clic sur l'overlay).
 * @param {string} props.ariaLabel Libellé accessible du dialogue.
 * @param {string} props.closeLabel Libellé accessible du bouton de fermeture.
 * @param {React.ReactNode} props.children Contenu de la modale.
 */
export function AppUserDialog({ open, onClose, ariaLabel, closeLabel, children }) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal log-modal--with-close fade-in"
      ariaLabel={ariaLabel}
      closeOnOverlay
    >
      <div className="log-modal__head">
        <button type="button" className="modal-close" aria-label={closeLabel} onClick={onClose}>
          <IconClose size={16} />
        </button>
      </div>
      <div className="log-modal__scroll">
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </DialogShell>
  );
}
