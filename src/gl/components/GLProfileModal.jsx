import React from 'react';
import { GLProfileEditor } from './GLProfileEditor.jsx';

export function GLProfileModal({ open, onClose, auth, profile, config, onSessionUpdated, onReloadProfile }) {
  if (!open) return null;
  return (
    <div className="gl-action-modal" role="dialog" aria-label="Mon profil GL">
      <div className="gl-action-modal-body gl-profile-modal-body">
        <div className="gl-profile-modal-head">
          <h2>Mon profil</h2>
          <button type="button" className="gl-btn-secondary" onClick={onClose}>Fermer</button>
        </div>
        <GLProfileEditor
          auth={auth}
          profile={profile}
          config={config}
          onSessionUpdated={onSessionUpdated}
          onReloadProfile={onReloadProfile}
        />
      </div>
    </div>
  );
}
