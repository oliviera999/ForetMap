import React, { useCallback, useEffect, useState } from 'react';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from './DialogShell.jsx';
import { LearningGatingQuestionPanel } from './LearningGatingQuestionPanel.jsx';
import { pendingChallengeQuestions } from '../utils/learningGatingChallengeClient.js';

/**
 * Bouton + modal de confirmation pour marquer un contenu comme lu / appris / étudié.
 * Si `gatingHandlers` et `gatingResource` sont fournis, un quiz gating précède la confirmation.
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
  gatingHandlers = null,
  gatingResource = null,
  enableGating = true,
  buttonClassName = 'btn btn-secondary btn-sm',
  doneClassName = 'task-chip tuto-read-badge',
  overlayClassName = 'modal-overlay modal-overlay--tuto-read-ack',
  dialogClassName = 'log-modal fade-in tuto-read-ack-modal',
  submitLabel = 'Confirmer',
  submittingLabel = 'Enregistrement…',
  choiceClassName,
  primaryBtnClassName,
  ghostBtnClassName,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [flowPhase, setFlowPhase] = useState('loading');
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const busy = saving;

  useOverlayHistoryBack(modalOpen, () => {
    if (!busy) setModalOpen(false);
  });

  const resetModal = useCallback(() => {
    setChecked(false);
    setError('');
    setPendingQuestions([]);
    setQuestionIndex(0);
    setFlowPhase('loading');
  }, []);

  useEffect(() => {
    if (!modalOpen) resetModal();
  }, [modalOpen, resetModal]);

  const openModal = useCallback(async () => {
    setModalOpen(true);
    setFlowPhase('loading');
    setError('');

    const canGate =
      enableGating &&
      gatingHandlers &&
      gatingResource?.resourceType &&
      gatingResource?.resourceRef != null &&
      gatingResource.resourceRef !== '';

    if (!canGate) {
      setFlowPhase('confirm');
      return;
    }

    try {
      const challenge = await gatingHandlers.fetchChallenge(
        gatingResource.resourceType,
        gatingResource.resourceRef,
      );
      const pending = pendingChallengeQuestions(challenge);
      if (pending.length > 0) {
        setPendingQuestions(pending);
        setQuestionIndex(0);
        setFlowPhase('quiz');
      } else {
        setFlowPhase('confirm');
      }
    } catch (e) {
      setError(e?.message || 'Impossible de charger le contrôle de compréhension');
      setFlowPhase('confirm');
    }
  }, [enableGating, gatingHandlers, gatingResource]);

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

  const handleQuestionPassed = useCallback(() => {
    if (questionIndex + 1 < pendingQuestions.length) {
      setQuestionIndex((i) => i + 1);
      return;
    }
    setFlowPhase('confirm');
  }, [questionIndex, pendingQuestions.length]);

  const closeModal = useCallback(() => {
    if (!busy) setModalOpen(false);
  }, [busy]);

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

  const currentQuestion = pendingQuestions[questionIndex] || null;

  return (
    <>
      <button type="button" className={buttonClassName} onClick={openModal}>
        {labelAction}
      </button>
      {modalOpen ? (
        <DialogShell
          open={modalOpen}
          onClose={closeModal}
          overlayClassName={overlayClassName}
          dialogClassName={dialogClassName}
          ariaLabelledBy="learning-ack-title"
          closeOnOverlay={!busy}
          showCloseButton
          closeButtonLabel="Fermer"
          closeButtonDisabled={busy}
        >
          {flowPhase === 'loading' ? (
            <>
              <h3 id="learning-ack-title">Chargement…</h3>
              <p className="tuto-read-ack-intro">Préparation du contrôle de compréhension…</p>
            </>
          ) : null}

          {flowPhase === 'quiz' && currentQuestion && gatingHandlers ? (
            <>
              <h3 id="learning-ack-title">Vérifie ta compréhension</h3>
              <LearningGatingQuestionPanel
                key={`${currentQuestion.question_code}-${questionIndex}`}
                questionCode={currentQuestion.question_code}
                questionDataset={currentQuestion.question_dataset || null}
                questionIndex={questionIndex}
                questionTotal={pendingQuestions.length}
                presentQuestion={gatingHandlers.presentQuestion}
                answerQuestion={gatingHandlers.answerQuestion}
                onPassed={handleQuestionPassed}
                onAbandon={closeModal}
                choiceClassName={choiceClassName}
                primaryBtnClassName={primaryBtnClassName}
                ghostBtnClassName={ghostBtnClassName}
              />
            </>
          ) : null}

          {flowPhase === 'confirm' ? (
            <>
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
                  className={ghostBtnClassName || 'btn btn-ghost btn-sm'}
                  disabled={saving}
                  onClick={closeModal}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className={primaryBtnClassName || 'btn btn-primary btn-sm'}
                  disabled={!checked || saving}
                  onClick={submit}
                >
                  {saving ? submittingLabel : submitLabel}
                </button>
              </div>
            </>
          ) : null}
        </DialogShell>
      ) : null}
    </>
  );
}
