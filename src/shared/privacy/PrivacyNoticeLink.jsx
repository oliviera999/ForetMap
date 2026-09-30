import { privacyNoticeHref } from './privacyNoticePath.js';
import './privacy-notice.css';

/**
 * Lien « Vos données » vers la notice publique du produit (audit sécurité/RGPD du
 * 30/09/2026, RG1). Posé sur les écrans de connexion, le formulaire d'inscription et les
 * pages « À propos » : l'information doit être trouvable **avant** de créer un compte.
 *
 * Cible tactile ≥ 44 px (`.privacy-notice-link`), comme toute commande du projet.
 *
 * @param {object} props
 * @param {string} [props.className] classes supplémentaires.
 * @param {import('react').ReactNode} [props.children] libellé (défaut « Vos données »).
 */
export function PrivacyNoticeLink({ className = '', children = 'Vos données' }) {
  return (
    <a
      className={`privacy-notice-link${className ? ` ${className}` : ''}`}
      href={privacyNoticeHref()}
      data-testid="privacy-notice-link"
    >
      {children}
    </a>
  );
}
