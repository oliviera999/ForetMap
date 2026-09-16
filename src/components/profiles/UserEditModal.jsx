import { useMemo, useState } from 'react';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { Tooltip } from '../../shared/components/Tooltip.jsx';
import { resolveTooltipKey } from '../../utils/helpResolve';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { buildUserEditInitialFields } from '../../utils/profilesUserFields.js';
import { IconWarning } from '../../shared/icons.jsx';
import { UserIdentitySummary } from './UserIdentitySummary.jsx';

const EMPTY_FIELDS = {
  firstName: '',
  lastName: '',
  pseudo: '',
  email: '',
  description: '',
  affiliation: 'both',
};

/**
 * Fiche d'un compte (administration des profils).
 *
 * P11 de l'audit UX : la modale s'intitulait « Modifier le compte » et n'était qu'un
 * formulaire, alors que le besoin premier est de **consulter** — qui est cette personne, quels
 * droits, quel groupe. Elle est désormais structurée en trois sections : **Droits & groupes**
 * (lecture, et rattachement si l'acteur en a le droit), **Identité** (le formulaire), et
 * **Actions**.
 *
 * P12 : le mot de passe n'est plus un champ aligné entre « Description » et « Affiliation »,
 * et l'impersonation n'est plus collée au bouton « Enregistrer ». Les deux sont des actions
 * explicites, isolées en pied de fiche, avec leur propre validation.
 *
 * Autonome (§6.1) : pilotée par `user` (fiche fusionnée, `null` pendant le chargement) et
 * `loadState`. Les champs du formulaire sont un état interne initialisé paresseusement au
 * montage — le parent monte/démonte la modale (clé par utilisateur) à chaque ouverture.
 */
function UserEditModal({
  user,
  loadState,
  err,
  affiliationOptions,
  authPerms,
  saving,
  impersonateLoading,
  passwordSaving = false,
  groupOptions = [],
  canManageGroups = false,
  onClose,
  onSave,
  onResetPassword,
  onImpersonate,
  onAttachGroup,
  onDetachGroup,
}) {
  const publicSettings = usePublicSettings();
  const [initialFields] = useState(() => (user ? buildUserEditInitialFields(user) : EMPTY_FIELDS));
  const [editFirstName, setEditFirstName] = useState(initialFields.firstName);
  const [editLastName, setEditLastName] = useState(initialFields.lastName);
  const [editPseudo, setEditPseudo] = useState(initialFields.pseudo);
  const [editEmail, setEditEmail] = useState(initialFields.email);
  const [editDescription, setEditDescription] = useState(initialFields.description);
  const [editAffiliation, setEditAffiliation] = useState(initialFields.affiliation);
  const [editPassword, setEditPassword] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);

  const affiliationOptionsForEdit = useMemo(() => {
    const base = affiliationOptions;
    if (!editAffiliation || base.some((o) => o.value === editAffiliation)) return base;
    return [...base, { value: editAffiliation, label: `${editAffiliation} (valeur en base)` }];
  }, [affiliationOptions, editAffiliation]);

  const busy = saving || passwordSaving;

  const submit = () => {
    onSave({
      firstName: editFirstName,
      lastName: editLastName,
      pseudo: editPseudo,
      email: editEmail,
      description: editDescription,
      affiliation: editAffiliation,
    });
  };

  const submitPassword = async () => {
    await onResetPassword(editPassword);
    setEditPassword('');
    setPasswordOpen(false);
  };

  return (
    <DialogShell
      open
      onClose={() => {
        if (!busy && loadState !== 'loading') onClose();
      }}
      overlayClassName="modal-overlay modal-overlay--centered"
      dialogClassName="log-modal log-modal--dialog fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Fiche du compte"
      closeOnOverlay={!busy && loadState !== 'loading'}
    >
      <h3 style={{ marginBottom: 8 }}>
        {loadState === 'ready' && user ? `Fiche de ${user.display_name}` : 'Fiche du compte'}
      </h3>
      {loadState === 'loading' && (
        <p style={{ margin: '12px 0', fontSize: 'var(--text-base)', color: 'var(--ink-soft)' }}>
          Chargement des données du compte…
        </p>
      )}
      {loadState === 'ready' && user && (
        <>
          {err && (
            <div className="auth-error" style={{ marginBottom: 12 }} role="alert">
              <IconWarning size={14} /> {err}
            </div>
          )}

          <section className="profiles-user-section">
            <h4 className="profiles-user-section__title">Droits &amp; groupes</h4>
            <UserIdentitySummary
              user={user}
              groupOptions={groupOptions}
              canManageGroups={canManageGroups}
              disabled={busy}
              onAttachGroup={onAttachGroup}
              onDetachGroup={onDetachGroup}
            />
          </section>

          <section className="profiles-user-section">
            <h4 className="profiles-user-section__title">Identité</h4>
            <form
              className="profiles-admin-create-grid"
              style={{ display: 'grid', gap: 10 }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-first">Prénom (obligatoire)</label>
                <input
                  id="edit-user-first"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-last">Nom (obligatoire)</label>
                <input
                  id="edit-user-last"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-pseudo">Pseudo</label>
                <input
                  id="edit-user-pseudo"
                  value={editPseudo}
                  onChange={(e) => setEditPseudo(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  placeholder={editPseudo ? undefined : 'Aucun pseudo en base'}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-email">Email</label>
                <input
                  id="edit-user-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  placeholder={editEmail ? undefined : 'Aucun email en base'}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-desc">Description</label>
                <MarkdownTextarea
                  id="edit-user-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={busy}
                  maxLength={300}
                  rows={2}
                  autoComplete="off"
                  placeholder={editDescription ? undefined : 'Aucune description en base'}
                />
              </div>
              {user.user_type === 'student' && (
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="edit-user-aff">Affiliation</label>
                  <select
                    id="edit-user-aff"
                    value={editAffiliation}
                    onChange={(e) => setEditAffiliation(e.target.value)}
                    disabled={busy}
                  >
                    {affiliationOptionsForEdit.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 6, gridColumn: '1 / -1' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={onClose}
                  disabled={busy}
                >
                  Annuler
                </button>
              </div>
            </form>
          </section>

          <section className="profiles-user-section profiles-user-section--actions">
            <h4 className="profiles-user-section__title">Actions</h4>
            {!passwordOpen ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPasswordOpen(true)}
                disabled={busy}
              >
                Réinitialiser le mot de passe
              </button>
            ) : (
              <div className="profiles-user-password">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="edit-user-pw">Nouveau mot de passe</label>
                  <input
                    id="edit-user-pw"
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={submitPassword}
                    disabled={busy || !editPassword.trim()}
                  >
                    {passwordSaving ? 'Application…' : 'Appliquer'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditPassword('');
                      setPasswordOpen(false);
                    }}
                    disabled={busy}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {authPerms.includes('admin.impersonate') && (
              <div style={{ marginTop: 12 }}>
                <Tooltip text={resolveTooltipKey('profiles.impersonateUser', publicSettings, true)}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || impersonateLoading}
                    onClick={() => {
                      onImpersonate();
                    }}
                  >
                    {impersonateLoading ? 'Connexion…' : 'Voir comme cet utilisateur'}
                  </button>
                </Tooltip>
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--ink-soft)',
                    margin: '8px 0 0',
                    lineHeight: 'var(--lh-normal)',
                  }}
                >
                  L’interface reflète le compte choisi (support ou diagnostic). Utilise le bandeau
                  orange en haut pour retrouver ta session administrateur.
                </p>
              </div>
            )}
          </section>
        </>
      )}
      {loadState === 'loading' && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      )}
    </DialogShell>
  );
}

export { UserEditModal };
