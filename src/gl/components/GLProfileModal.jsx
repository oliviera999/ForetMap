import React from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { GLProfileEditor } from './GLProfileEditor.jsx';
import { GLButton } from './ui/GLButton.jsx';

export function GLProfileModal({ open, onClose, auth, profile, config, onSessionUpdated, onReloadProfile, onOpenStats = null }) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel gl-profile-modal-body animate-pop"
      ariaLabel="Mon profil GL"
    >
      <div className="gl-profile-modal-head">
        <h2>Mon profil</h2>
        <div className="gl-profile-modal-actions">
          {typeof onOpenStats === 'function' ? (
            <GLButton type="button" variant="secondary" onClick={onOpenStats}>
              Mes statistiques
            </GLButton>
          ) : null}
          <GLButton type="button" variant="secondary" onClick={onClose}>Fermer</GLButton>
        </div>
      </div>
      <GLProfileEditor
        auth={auth}
        profile={profile}
        config={config}
        onSessionUpdated={onSessionUpdated}
        onReloadProfile={onReloadProfile}
      />
    </DialogShell>
  );
}
