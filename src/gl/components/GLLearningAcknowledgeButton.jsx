import React, { useCallback } from 'react';
import { LearningAcknowledgeButton } from '../../shared/components/LearningAcknowledgeButton.jsx';
import { apiGL } from '../services/apiGL.js';

/**
 * Accusé de progression GL (espèce, glossaire, tutoriel) avec confirmation explicite.
 */
export function GLLearningAcknowledgeButton({
  acknowledgePath,
  onAcknowledged,
  ...rest
}) {
  const submit = useCallback(async () => {
    await apiGL(acknowledgePath, 'POST', { confirm: true });
    onAcknowledged?.();
  }, [acknowledgePath, onAcknowledged]);

  return (
    <LearningAcknowledgeButton
      buttonClassName="gl-btn gl-btn--secondary gl-btn--sm gl-learning-ack__btn"
      doneClassName="gl-badge gl-learning-badge"
      overlayClassName="gl-learning-ack-overlay"
      dialogClassName="gl-action-modal gl-learning-ack-modal"
      submitLabel="Confirmer"
      submittingLabel="Enregistrement…"
      onSubmit={submit}
      {...rest}
    />
  );
}
