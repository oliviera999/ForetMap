import React, { useCallback, useMemo } from 'react';
import { LearningAcknowledgeButton } from '../../shared/components/LearningAcknowledgeButton.jsx';
import { apiGL } from '../services/apiGL.js';
import { createGlGatingHandlers } from '../../shared/utils/learningGatingChallengeClient.js';

/**
 * Accusé de progression GL (espèce, glossaire, tutoriel) avec confirmation explicite.
 */
export function GLLearningAcknowledgeButton({
  acknowledgePath,
  onAcknowledged,
  requestBody,
  resourceType = null,
  resourceRef = null,
  enableGating = true,
  ...rest
}) {
  const gatingHandlers = useMemo(() => createGlGatingHandlers(apiGL), []);

  const submit = useCallback(async () => {
    const data = await apiGL(acknowledgePath, 'POST', { confirm: true, ...(requestBody || {}) });
    onAcknowledged?.(data);
    return data;
  }, [acknowledgePath, onAcknowledged, requestBody]);

  const gatingResource = useMemo(() => {
    if (!resourceType || resourceRef == null || resourceRef === '') return null;
    return { resourceType, resourceRef: String(resourceRef) };
  }, [resourceType, resourceRef]);

  return (
    <LearningAcknowledgeButton
      buttonClassName="gl-btn gl-btn--secondary gl-btn--sm gl-learning-ack__btn"
      doneClassName="gl-badge gl-learning-badge"
      overlayClassName="fm-modal-overlay gl-learning-ack-overlay"
      dialogClassName="fm-modal-panel gl-learning-ack-modal fade-in"
      submitLabel="Confirmer"
      submittingLabel="Enregistrement…"
      choiceClassName="gl-qcm-choice learning-gating-quiz__choice"
      primaryBtnClassName="gl-btn gl-btn--primary gl-btn--sm"
      ghostBtnClassName="gl-btn gl-btn--ghost gl-btn--sm"
      gatingHandlers={gatingHandlers}
      gatingResource={gatingResource}
      enableGating={enableGating}
      onSubmit={submit}
      {...rest}
    />
  );
}
