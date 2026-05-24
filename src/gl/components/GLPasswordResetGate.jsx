import React from 'react';
import { GLPasswordChangeForm } from './GLPasswordChangeForm.jsx';

export function GLPasswordResetGate({ open, onCompleted }) {
  if (!open) return null;
  return (
    <div className="gl-action-modal" role="dialog" aria-label="Mise a jour mot de passe obligatoire">
      <div className="gl-action-modal-body gl-profile-gate gl-animate-pop">
        <h3>Mise a jour du mot de passe requise</h3>
        <p className="gl-hint">
          Votre compte joueur demande un nouveau mot de passe avant de continuer.
        </p>
        <GLPasswordChangeForm isAdmin={false} onChanged={onCompleted} />
      </div>
    </div>
  );
}
