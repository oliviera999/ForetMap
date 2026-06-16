import React from 'react';
import { Tooltip } from '../Tooltip';
import { HELP_TOOLTIPS } from '../../constants/help';

/**
 * Bannières d'aperçu de rôle — extraites de `src/App.jsx` (O6).
 *
 * Composant feuille purement piloté par props : l'état (`authClaims`,
 * `isTeacher`, `roleViewMode`) et le handler `onStopImpersonation`
 * (= `stopAdminImpersonation`) restent dans `App` — aucun état déplacé.
 *
 * Trois bandeaux mutuellement exclusifs par construction côté App :
 *   - prise de contrôle admin (impersonation) ;
 *   - aperçu « vue n3beur » ;
 *   - aperçu « vue n3boss ».
 */
export function RolePreviewBanners({
  authClaims,
  isTeacher,
  roleViewMode,
  helpText,
  onStopImpersonation,
}) {
  return (
    <>
      {authClaims?.impersonating && (
        <div
          className="role-preview-banner role-preview-banner--impersonation fade-in"
          role="status"
        >
          <span className="role-preview-banner__icon" aria-hidden>
            👤
          </span>
          <div className="role-preview-banner__text" style={{ flex: '1 1 200px' }}>
            <strong>Prise de contrôle (admin)</strong>
            <span>
              Tu navigues avec l’identité de{' '}
              <strong>{String(authClaims?.roleDisplayName || 'utilisateur').trim()}</strong>
              {authClaims?.userType === 'student'
                ? ' (n3beur)'
                : authClaims?.userType === 'teacher'
                  ? ' (n3boss)'
                  : ''}
              . Les actions sont enregistrées pour ce compte.
            </span>
          </div>
          <div className="impersonation-banner-actions">
            <Tooltip text={helpText(HELP_TOOLTIPS.header.impersonationStop)}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onStopImpersonation();
                }}
              >
                Revenir à mon compte admin
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {isTeacher && roleViewMode === 'student' && (
        <div className="role-preview-banner fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>
            🎓
          </span>
          <div className="role-preview-banner__text">
            <strong>Vue n3beur (aperçu)</strong>
            <span>
              Navigation en bas, écrans comme un n3beur (sans les onglets n3boss du haut). Tes vrais
              droits n3boss restent actifs côté serveur.
            </span>
          </div>
        </div>
      )}
      {isTeacher && roleViewMode === 'teacher' && (
        <div className="role-preview-banner role-preview-banner--teacher fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>
            🧑‍🏫
          </span>
          <div className="role-preview-banner__text">
            <strong>Vue n3boss (aperçu)</strong>
            <span>
              Interface un peu épurée (moins de boutons admin visibles). Tes permissions réelles
              s’appliquent toujours quand tu agis.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
