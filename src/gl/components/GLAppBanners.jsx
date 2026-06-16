import React from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { FixedToast } from '../../shared/components/FixedToast.jsx';

/**
 * Bannières et toasts du shell AppGL — extraits de `src/gl/AppGL.jsx` (O5).
 *
 * Composant feuille purement piloté par props : erreur globale, aperçu
 * « vue joueur » du staff, prise de contrôle (impersonation), narration MJ
 * et toast de changement de tour. L'état (toasts temporisés, session,
 * mode de vue) reste dans `AppGL` — aucun état déplacé.
 */
export function GLAppBanners({
  error,
  isStaffPlayerPreview,
  impersonationBanner,
  impersonatedDisplayName,
  onStopImpersonation,
  narrationText,
  turnTeamLabel,
}) {
  return (
    <>
      {error ? <div className="gl-error-banner">{error}</div> : null}

      {isStaffPlayerPreview ? (
        <div className="role-preview-banner fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>
            🎮
          </span>
          <div className="role-preview-banner__text">
            <strong>Vue joueur (aperçu)</strong>
            <span>
              Navigation limitée aux onglets joueur. Tes droits MJ/admin restent actifs côté
              serveur.
            </span>
          </div>
        </div>
      ) : null}

      {impersonationBanner ? (
        <div
          className="role-preview-banner role-preview-banner--impersonation fade-in"
          role="status"
        >
          <span className="role-preview-banner__icon" aria-hidden>
            👤
          </span>
          <div className="role-preview-banner__text" style={{ flex: '1 1 200px' }}>
            <strong>{impersonationBanner.title}</strong>
            <span>
              Tu navigues avec l’identité de{' '}
              <strong>{String(impersonatedDisplayName || 'joueur')}</strong>. Les actions sont
              enregistrées pour ce compte.
            </span>
          </div>
          <div className="impersonation-banner-actions">
            <GLButton
              type="button"
              size="sm"
              onClick={() => {
                onStopImpersonation?.();
              }}
            >
              {impersonationBanner.stopLabel}
            </GLButton>
          </div>
        </div>
      ) : null}

      {narrationText ? (
        <div className="gl-narration-banner fade-in" role="status">
          <strong>Narration du MJ :</strong> {narrationText}
        </div>
      ) : null}

      {turnTeamLabel ? (
        <FixedToast className="fm-toast--turn gl-turn-toast">
          C’est au tour de <strong>{turnTeamLabel}</strong>.
        </FixedToast>
      ) : null}
    </>
  );
}
