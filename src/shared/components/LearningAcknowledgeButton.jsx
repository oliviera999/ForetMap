import React, { useCallback, useEffect, useState } from 'react';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from '../../components/DialogShell';

/**
 * Bouton + modal de confirmation pour marquer un contenu comme lu / appris / étudié.
 */
export function LearningAcknowledgeButton({
  itemTitle = '',
  labelAction = 'Marquer comme lu',
  labelDone = '✓ Lu',
  titleDone = 'Contenu confirmé',
  confirmIntro,
  confirmCheckboxLabel = 'Je confirme avoir lu et compris ce contenu.',
  isDone = false,
  disabled = false,
  onSubmit,
  onDone,
  buttonClassName = 'btn btn-secondary btn-sm',
  doneClassName = 'task-chip tuto-read-badge',
  overlayClassName = 'modal-overlay modal-overlay--tuto-read-ack',
  dialogClassName = 'log-modal fade-in tuto-read-ack-modal',
  submitLabel = 'Confirmer',
  submittingLabel = 'Enregistrement…',
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useOverlayHistoryBack(modalOpen, () => {
    if (!saving) setModalOpen(false);
  });

  useEffect(() => {
    if (!modalOpen) {
      setChecked(false);
      setError('');
    }
  }, [modalOpen]);

  const submit = useCallback(async () => {
    if (!checked || typeof onSubmit !== 'function') return;
    setSaving(true);
    setError('');
    try {
      await onSubmit();
      onDone?.();
      setModalOpen(false);
    } catch (e) {
      setError(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [checked, onSubmit, onDone]);

  if (disabled) return null;

  if (isDone) {
    return (
      <span className={doneClassName} title={titleDone}>
        {labelDone}
      </span>
    );
  }

  const intro = confirmIntro || (
    <>
      En validant, tu t&apos;engages à avoir lu et compris{' '}
      <strong>« {itemTitle || 'ce contenu'} »</strong>.
    </>
  );

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setModalOpen(true)}>
        {labelAction}
      </button>
      {modalOpen ? (
        <DialogShell
          open={modalOpen}
          onClose={() => !saving && setModalOpen(false)}
          overlayClassName={overlayClassName}
          dialogClassName={dialogClassName}
          ariaLabelledBy="learning-ack-title"
          closeOnOverlay={!saving}
          showCloseButton
          closeButtonLabel="Fermer"
          closeButtonDisabled={saving}
        >
          <h3 id="learning-ack-title">Confirmer</h3>
          <p className="tuto-read-ack-intro">{intro}</p>
          <label className="tuto-read-ack-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={saving}
            />
            <span>{confirmCheckboxLabel}</span>
          </label>
          {error ? <p className="tuto-read-ack-error">{error}</p> : null}
          <div className="tuto-read-ack-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!checked || saving}
              onClick={submit}
            >
              {saving ? submittingLabel : submitLabel}
            </button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}
