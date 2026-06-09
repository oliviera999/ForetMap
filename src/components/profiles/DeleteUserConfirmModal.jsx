import React from 'react';
import { DialogShell } from '../DialogShell';

/**
 * Modale de confirmation « Supprimer le/la … » (administration des profils).
 * Extrait de profiles-views.jsx (O6) — présentationnel pur. Comportement inchangé.
 */
function DeleteUserConfirmModal({ confirmStudent, roleTerms, onConfirm, onCancel }) {
  if (!confirmStudent) return null;
  return (
    <DialogShell
      open={!!confirmStudent}
      onClose={onCancel}
      overlayClassName="modal-overlay modal-overlay--centered"
      dialogClassName="log-modal log-modal--dialog fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Confirmer la suppression"
      closeOnOverlay
    >
        <h3 style={{ marginBottom: 8 }}>Supprimer le/la {roleTerms.studentSingular} ?</h3>
        <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 6, lineHeight: 1.5 }}>
          <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>
        </p>
        <p style={{ fontSize: '.85rem', color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
          Ses assignations de tâches seront également supprimées.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={onConfirm}>Supprimer</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Annuler</button>
        </div>
    </DialogShell>
  );
}

export { DeleteUserConfirmModal };
