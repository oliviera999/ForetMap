import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { Tooltip } from '../../shared/components/Tooltip.jsx';
import { IconEye, IconUser } from '../../shared/icons.jsx';
import { describeAppPreview } from '../../utils/appPreview.js';
import { getRoleTerms } from '../../utils/n3-terminology.js';

/**
 * Bannières d'aperçu — extraites de `src/App.jsx` (O6).
 *
 * Composant feuille piloté par props pour le rôle (`authClaims`, `isTeacher`,
 * `roleViewMode`, handlers dans `App`) ; le niveau d'affichage biodiversité est lu dans
 * le contexte, comme dans le menu Aperçu de l'en-tête.
 *
 * Deux bandeaux :
 *   - prise de contrôle admin (impersonation) ;
 *   - aperçu actif (vue de rôle et/ou niveau biodiversité), avec sortie en un clic.
 */
export function RolePreviewBanners({
  authClaims,
  sessionUser = null,
  isTeacher,
  roleViewMode,
  roleTerms = getRoleTerms(),
  helpText,
  onStopImpersonation,
  onRoleViewModeSelect,
}) {
  const { teacherPreview, setTeacherPreview } = useBiodivPedago();
  const preview = describeAppPreview({ roleViewMode, teacherPreview, roleTerms });
  const showPreview = Boolean(isTeacher) && preview.active;

  const details = [];
  if (roleViewMode === 'student') {
    details.push(
      `Navigation en bas, écrans comme un ${roleTerms.studentSingular} (sans les onglets ${roleTerms.teacherShort} du haut).`,
    );
  } else if (roleViewMode === 'teacher') {
    details.push('Interface un peu épurée (moins de boutons admin visibles).');
  }
  if (preview.levelActive) {
    details.push('Biodiversité (fiches, quiz, glossaire, réseau) affichée à ce niveau.');
  }
  details.push('Tes droits réels restent actifs quand tu agis.');

  function exitPreview() {
    if (preview.levelActive) setTeacherPreview(null);
    if (preview.roleActive) onRoleViewModeSelect?.('native');
  }

  return (
    <>
      {authClaims?.impersonating && (
        <div
          className="role-preview-banner role-preview-banner--impersonation fade-in"
          role="status"
        >
          <span className="role-preview-banner__icon" aria-hidden>
            <IconUser size={18} />
          </span>
          <div className="role-preview-banner__text" style={{ flex: '1 1 200px' }}>
            <strong>Prise de contrôle (admin)</strong>
            <span>
              Tu navigues avec l’identité de{' '}
              <strong>
                {String(
                  authClaims?.displayName || sessionUser?.displayName || 'utilisateur',
                ).trim()}
              </strong>
              {authClaims?.roleDisplayName ? ` (profil ${authClaims.roleDisplayName})` : ''}
              {authClaims?.userType === 'student'
                ? ' (n3beur)'
                : authClaims?.userType === 'teacher'
                  ? ' (n3boss)'
                  : ''}
              . Les actions sont enregistrées pour ce compte.
            </span>
          </div>
          <div className="impersonation-banner-actions">
            <Tooltip text={helpText('header.impersonationStop')}>
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

      {showPreview && (
        <div
          className={`role-preview-banner role-preview-banner--preview${roleViewMode === 'teacher' ? ' role-preview-banner--teacher' : ''} fade-in`}
          role="status"
          data-testid="app-preview-banner"
        >
          <span className="role-preview-banner__icon" aria-hidden>
            <IconEye size={18} />
          </span>
          <div className="role-preview-banner__text">
            <strong>Aperçu : {preview.summary}</strong>
            <span>{details.join(' ')}</span>
          </div>
          <div className="role-preview-banner__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exitPreview}>
              Quitter l’aperçu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
