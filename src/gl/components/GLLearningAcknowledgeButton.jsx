import React, { useCallback, useMemo } from 'react';
import { LearningAcknowledgeButton } from '../../shared/components/LearningAcknowledgeButton.jsx';
import { apiGL } from '../services/apiGL.js';
import { createGlGatingHandlers } from '../../shared/utils/learningGatingChallengeClient.js';
import { LearningQuizPopover } from '../../shared/components/LearningQuizPopover.jsx';
import { useGlGatingSummary } from '../hooks/useGlGatingSummary.js';

/**
 * Accusé de progression GL (espèce, glossaire, tutoriel) avec confirmation explicite.
 *
 * Le popover du contrôle de compréhension était réservé à ForetMap : G&L ouvrait une
 * modale pleine largeur, alors que le composant sous-jacent est le même. Il est désormais
 * partagé (`LearningQuizPopover`), rhabillé par variables CSS dans `gl-theme.css`.
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

  // Annonce AVANT le clic, comme côté ForetMap. Chacun des quatre points d'entrée G&L
  // n'affiche qu'un bouton pour la ressource ouverte : le résumé est donc demandé ici,
  // une fois par écran, plutôt que d'être câblé quatre fois de la même façon.
  const summaryRefs = useMemo(
    () => (gatingResource ? [gatingResource.resourceRef] : []),
    [gatingResource],
  );
  const { summaries: gatingSummaries } = useGlGatingSummary(
    gatingResource?.resourceType || '',
    summaryRefs,
    !!gatingResource && enableGating,
  );
  const gatingSummary = gatingResource
    ? gatingSummaries.get(gatingResource.resourceRef) || null
    : null;

  return (
    <LearningAcknowledgeButton
      buttonClassName="gl-btn gl-btn--secondary gl-btn--sm gl-learning-ack__btn"
      doneClassName="gl-badge gl-learning-badge"
      Shell={LearningQuizPopover}
      overlayClassName="fm-quiz-popover fm-quiz-popover--ack gl-learning-ack-overlay"
      dialogClassName="fm-quiz-popover__panel gl-learning-ack-modal animate-pop"
      submitLabel="Confirmer"
      submittingLabel="Enregistrement…"
      choiceClassName="gl-qcm-choice learning-gating-quiz__choice"
      primaryBtnClassName="gl-btn gl-btn--primary gl-btn--sm"
      ghostBtnClassName="gl-btn gl-btn--ghost gl-btn--sm"
      gatingHandlers={gatingHandlers}
      gatingResource={gatingResource}
      gatingSummary={gatingSummary}
      enableGating={enableGating}
      onSubmit={submit}
      {...rest}
    />
  );
}
