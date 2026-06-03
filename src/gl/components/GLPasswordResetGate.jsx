import React from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { GLPasswordChangeForm } from './GLPasswordChangeForm.jsx';

export function GLPasswordResetGate({ open, onCompleted }) {
  return (
    <DialogShell
      open={open}
      onClose={() => {}}
      closeOnOverlay={false}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel gl-profile-gate animate-pop"
      ariaLabel="Mise a jour mot de passe obligatoire"
    >
      <h3>Mise a jour du mot de passe requise</h3>
      <p className="gl-hint">
        Votre compte joueur demande un nouveau mot de passe avant de continuer.
      </p>
      <GLPasswordChangeForm isAdmin={false} onChanged={onCompleted} />
    </DialogShell>
  );
}
