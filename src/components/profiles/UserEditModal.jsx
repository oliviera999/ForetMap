import React, { useMemo, useState } from 'react';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { Tooltip } from '../Tooltip';
import { resolveTooltipKey } from '../../utils/helpResolve';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { buildUserEditInitialFields } from '../../utils/profilesUserFields.js';

const EMPTY_FIELDS = {
  firstName: '',
  lastName: '',
  pseudo: '',
  email: '',
  description: '',
  affiliation: 'both',
};

/**
 * Modale « Modifier le compte » (administration des profils).
 * Autonome (§6.1) : pilotée par `user` (fiche fusionnée, `null` pendant le chargement) et
 * `loadState`. Les champs du formulaire sont un état interne initialisé paresseusement au
 * montage — le parent monte/démonte la modale (clé par utilisateur) à chaque ouverture.
 * `onSave(fields)` remonte les champs saisis ; l'appel API et `err` restent au parent.
 */
function UserEditModal({
  user,
  loadState,
  err,
  affiliationOptions,
  authPerms,
  saving,
  impersonateLoading,
  onClose,
  onSave,
  onImpersonate,
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

  const affiliationOptionsForEdit = useMemo(() => {
    const base = affiliationOptions;
    if (!editAffiliation || base.some((o) => o.value === editAffiliation)) return base;
    return [...base, { value: editAffiliation, label: `${editAffiliation} (valeur en base)` }];
  }, [affiliationOptions, editAffiliation]);

  const submit = () => {
    onSave({
      firstName: editFirstName,
      lastName: editLastName,
      pseudo: editPseudo,
      email: editEmail,
      description: editDescription,
      affiliation: editAffiliation,
      password: editPassword,
    });
  };

  return (
    <DialogShell
      open
      onClose={() => {
        if (!saving && loadState !== 'loading') onClose();
      }}
      overlayClassName="modal-overlay modal-overlay--centered"
      dialogClassName="log-modal log-modal--dialog fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Modifier le compte"
      closeOnOverlay={!saving && loadState !== 'loading'}
    >
      <h3 style={{ marginBottom: 8 }}>Modifier le compte</h3>
      {loadState === 'loading' && (
        <p style={{ margin: '12px 0', fontSize: '.9rem', color: '#64748b' }}>
          Chargement des données du compte…
        </p>
      )}
      {loadState === 'ready' && user && (
        <>
          <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 12, lineHeight: 1.45 }}>
            <strong>{user.display_name}</strong>
            <span style={{ color: '#94a3b8' }}> ({user.user_type})</span>
          </p>
          {err && (
            <div className="auth-error" style={{ marginBottom: 12 }} role="alert">
              ⚠️ {err}
            </div>
          )}
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
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="edit-user-last">Nom (obligatoire)</label>
              <input
                id="edit-user-last"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="edit-user-pseudo">Pseudo</label>
              <input
                id="edit-user-pseudo"
                value={editPseudo}
                onChange={(e) => setEditPseudo(e.target.value)}
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                  disabled={saving}
                >
                  {affiliationOptionsForEdit.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="edit-user-pw">
                Nouveau mot de passe (laisser vide pour ne pas changer)
              </label>
              <input
                id="edit-user-pw"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            {authPerms.includes('admin.impersonate') && (
              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <Tooltip text={resolveTooltipKey('profiles.impersonateUser', publicSettings, true)}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={saving || impersonateLoading}
                    onClick={() => {
                      onImpersonate();
                    }}
                  >
                    {impersonateLoading ? 'Connexion…' : 'Voir comme cet utilisateur'}
                  </button>
                </Tooltip>
                <p
                  style={{
                    fontSize: '.72rem',
                    color: '#64748b',
                    margin: '8px 0 0',
                    lineHeight: 1.45,
                  }}
                >
                  L’interface reflète le compte choisi (support ou diagnostic). Utilise le bandeau
                  orange en haut pour retrouver ta session administrateur.
                </p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 6, gridColumn: '1 / -1' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={onClose}
                disabled={saving}
              >
                Annuler
              </button>
            </div>
          </form>
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
