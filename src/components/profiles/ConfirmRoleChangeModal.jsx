import { DialogShell } from '../DialogShell';
import { IconWarning } from '../../shared/icons.jsx';
import { isSensitiveRole } from '../../utils/profilesUserGroups.js';

/**
 * Confirmation d'une attribution de profil **sensible** (P3 de l'audit UX).
 *
 * Le sélecteur de la liste enregistre au changement, sans annulation possible : passer un
 * compte en `admin` ou en `prof` d'un clic de travers accorde des droits durables en silence.
 * Cette modale n'intercepte que ces cas — les profils élèves restent en application directe.
 *
 * `pending` : { users: [{ id, user_type, display_name, role_slug }], role: { id, display_name,
 * slug }, reason: 'grant' | 'revoke' }. En lot, `reason` vaut `'revoke'` quand la sélection
 * contient des comptes à profil sensible et que le profil cible ne l'est pas : le titre et le
 * texte disent alors ce qui est perdu, pas seulement ce qui est donné.
 */
export function ConfirmRoleChangeModal({ pending, saving = false, onConfirm, onCancel }) {
  if (!pending) return null;
  const users = Array.isArray(pending.users) ? pending.users : [];
  const count = users.length;
  const roleLabel = pending.role?.display_name || pending.role?.slug || '—';
  const isRevoke = pending.reason === 'revoke';
  const sensitiveCount = users.filter((u) => isSensitiveRole(u.role_slug)).length;

  return (
    <DialogShell
      open
      onClose={saving ? () => {} : onCancel}
      overlayClassName="modal-overlay modal-overlay--centered"
      dialogClassName="log-modal log-modal--dialog fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Confirmer le changement de profil"
      closeOnOverlay={!saving}
    >
      <h3 style={{ marginBottom: 8 }}>
        <IconWarning size={16} />{' '}
        {isRevoke ? 'Retirer un profil sensible ?' : 'Attribuer un profil sensible ?'}
      </h3>
      <p
        style={{ fontSize: 'var(--text-base)', margin: '0 0 10px', lineHeight: 'var(--lh-normal)' }}
      >
        {count === 1 ? (
          <>
            <strong>{users[0].display_name}</strong>
            {isRevoke ? ' perdra son profil ' : ' recevra le profil '}
            <strong>
              {isRevoke ? users[0].role_display_name || users[0].role_slug : roleLabel}
            </strong>
            {isRevoke ? ` et passera à « ${roleLabel} ».` : '.'}
          </>
        ) : (
          <>
            <strong>{count} comptes</strong> passeront au profil <strong>{roleLabel}</strong>
            {isRevoke && sensitiveCount > 0
              ? ` — dont ${sensitiveCount} ${sensitiveCount > 1 ? 'perdront' : 'perdra'} un profil d’administration ou d’encadrement.`
              : '.'}
          </>
        )}
      </p>
      {count > 1 && (
        <ul className="profiles-confirm-role__list">
          {users.slice(0, 8).map((u) => (
            <li key={`${u.user_type}-${u.id}`}>{u.display_name}</li>
          ))}
          {count > 8 && <li className="profiles-confirm-role__more">… et {count - 8} autres</li>}
        </ul>
      )}
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-faint)',
          margin: '0 0 20px',
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Ce profil ouvre des droits d’administration ou d’encadrement. L’opération est tracée dans le
        journal d’audit et n’est pas annulable depuis cet écran.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? 'Application…' : 'Confirmer'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: 1 }}
          onClick={onCancel}
          disabled={saving}
        >
          Annuler
        </button>
      </div>
    </DialogShell>
  );
}
