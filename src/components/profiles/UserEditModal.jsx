import React from 'react';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { Tooltip } from '../Tooltip';
import { HELP_TOOLTIPS, resolveRoleText } from '../../constants/help';

/**
 * Modale « Modifier le compte » (administration des profils).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur : tout l’état et les
 * handlers sont fournis par ProfilesAdminView via les props. Comportement inchangé.
 */
function UserEditModal({
  editModalOpen,
  editUserLoadState,
  editingUser,
  err,
  editFirstName,
  editLastName,
  editPseudo,
  editEmail,
  editDescription,
  editAffiliation,
  editPassword,
  editLoading,
  impersonateLoading,
  affiliationOptionsForEdit,
  authPerms,
  setEditFirstName,
  setEditLastName,
  setEditPseudo,
  setEditEmail,
  setEditDescription,
  setEditAffiliation,
  setEditPassword,
  closeEditUser,
  saveEditUser,
  startImpersonation,
}) {
  if (!editModalOpen) return null;
  return (
    <DialogShell
      open={editModalOpen}
      onClose={() => {
        if (!editLoading && editUserLoadState !== 'loading') closeEditUser();
      }}
      overlayClassName="modal-overlay modal-overlay--centered"
      dialogClassName="log-modal log-modal--dialog fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Modifier le compte"
      closeOnOverlay={!editLoading && editUserLoadState !== 'loading'}
    >
        <h3 style={{ marginBottom: 8 }}>Modifier le compte</h3>
        {editUserLoadState === 'loading' && (
          <p style={{ margin: '12px 0', fontSize: '.9rem', color: '#64748b' }}>Chargement des données du compte…</p>
        )}
        {editUserLoadState === 'ready' && editingUser && (
          <>
            <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 12, lineHeight: 1.45 }}>
              <strong>{editingUser.display_name}</strong>
              <span style={{ color: '#94a3b8' }}> ({editingUser.user_type})</span>
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
                saveEditUser();
              }}
            >
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-first">Prénom (obligatoire)</label>
                <input
                  id="edit-user-first"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  disabled={editLoading}
                  autoComplete="off"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-last">Nom (obligatoire)</label>
                <input
                  id="edit-user-last"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  disabled={editLoading}
                  autoComplete="off"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-pseudo">Pseudo</label>
                <input
                  id="edit-user-pseudo"
                  value={editPseudo}
                  onChange={(e) => setEditPseudo(e.target.value)}
                  disabled={editLoading}
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
                  disabled={editLoading}
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
                  disabled={editLoading}
                  maxLength={300}
                  rows={2}
                  autoComplete="off"
                  placeholder={editDescription ? undefined : 'Aucune description en base'}
                />
              </div>
              {editingUser.user_type === 'student' && (
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="edit-user-aff">Affiliation</label>
                  <select id="edit-user-aff" value={editAffiliation} onChange={(e) => setEditAffiliation(e.target.value)} disabled={editLoading}>
                    {affiliationOptionsForEdit.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="edit-user-pw">Nouveau mot de passe (laisser vide pour ne pas changer)</label>
                <input id="edit-user-pw" type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={editLoading} autoComplete="new-password" />
              </div>
              {authPerms.includes('admin.impersonate') && (
                <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  <Tooltip text={resolveRoleText(HELP_TOOLTIPS.profiles.impersonateUser, true)}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={editLoading || impersonateLoading}
                      onClick={() => { startImpersonation(); }}
                    >
                      {impersonateLoading ? 'Connexion…' : 'Voir comme cet utilisateur'}
                    </button>
                  </Tooltip>
                  <p style={{ fontSize: '.72rem', color: '#64748b', margin: '8px 0 0', lineHeight: 1.45 }}>
                    L’interface reflète le compte choisi (support ou diagnostic). Utilise le bandeau orange en haut pour retrouver ta session administrateur.
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 6, gridColumn: '1 / -1' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={editLoading}>
                  {editLoading ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeEditUser} disabled={editLoading}>
                  Annuler
                </button>
              </div>
            </form>
          </>
        )}
        {editUserLoadState === 'loading' && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={closeEditUser}>
              Annuler
            </button>
          </div>
        )}
    </DialogShell>
  );
}

export { UserEditModal };
