import React from 'react';

import { DialogShell } from '../DialogShell';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';

/**
 * Dialogue de confirmation des actions sensibles sur tâches / projets (suppression,
 * désinscription…) — extrait de `tasks-views.jsx` (O6).
 *
 * Monté en permanence par `TasksView` (les hooks a11y / historique restent appelés
 * inconditionnellement, comme avant l'extraction) ; ne rend rien sans `confirmTask`
 * (`{ task, label, action }`). `onClose` remet `confirmTask` à null côté parent.
 */
export function TaskConfirmDialog({ confirmTask, onClose }) {
  const confirmDialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(!!confirmTask, onClose);
  if (!confirmTask) return null;
  return (
    <DialogShell
      open={!!confirmTask}
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      ariaLabel="Confirmation d'action"
      closeOnOverlay
      dialogRef={confirmDialogRef}
    >
      <h3 style={{ marginBottom: 8 }}>Confirmation</h3>
      <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 20, lineHeight: 1.5 }}>
        {confirmTask.label}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-danger"
          style={{ flex: 1 }}
          onClick={async () => {
            const a = confirmTask.action;
            onClose();
            await a();
          }}
        >
          Confirmer
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
          Annuler
        </button>
      </div>
    </DialogShell>
  );
}
