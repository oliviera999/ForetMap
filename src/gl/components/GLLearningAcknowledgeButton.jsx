import React, { useCallback } from 'react';
import { LearningAcknowledgeButton } from '../../shared/components/LearningAcknowledgeButton.jsx';
import { apiGL } from '../services/apiGL.js';

/**
 * Accusé de progression GL (espèce, glossaire, tutoriel) avec confirmation explicite.
 */
export function GLLearningAcknowledgeButton({
  acknowledgePath,
  onAcknowledged,
  requestBody,
  ...rest
}) {
  const submit = useCallback(async () => {
    const data = await apiGL(acknowledgePath, 'POST', { confirm: true, ...(requestBody || {}) });
    onAcknowledged?.(data);
    return data;
  }, [acknowledgePath, onAcknowledged, requestBody]);

  return (
    <LearningAcknowledgeButton
      buttonClassName="gl-btn gl-btn--secondary gl-btn--sm gl-learning-ack__btn"
      doneClassName="gl-badge gl-learning-badge"
      overlayClassName="fm-modal-overlay gl-learning-ack-overlay"
      dialogClassName="fm-modal-panel gl-learning-ack-modal fade-in"
      submitLabel="Confirmer"
      submittingLabel="Enregistrement…"
      onSubmit={submit}
      {...rest}
    />
  );
}
