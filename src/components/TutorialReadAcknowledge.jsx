import React, { useCallback, useMemo } from 'react';
import { api, AccountDeletedError, getAuthToken } from '../services/api';
import { LearningAcknowledgeButton } from '../shared/components/LearningAcknowledgeButton.jsx';
import { createFmGatingHandlers } from '../shared/utils/learningGatingChallengeClient.js';

/**
 * Bouton + modal pour marquer un tutoriel comme lu après confirmation explicite.
 * N’affiche rien si aucune session (pas de jeton).
 */
export function TutorialReadAcknowledgeButton({
  tutorialId,
  tutorialTitle,
  isRead,
  onAcknowledged,
  onForceLogout,
}) {
  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const gatingHandlers = useMemo(() => createFmGatingHandlers(api), []);
  const gatingResource = useMemo(
    () => ({ resourceType: 'tutorial', resourceRef: String(tutorialId) }),
    [tutorialId],
  );

  const submit = useCallback(async () => {
    await api(`/api/tutorials/${tutorialId}/acknowledge-read`, 'POST', { confirm: true });
    onAcknowledged?.(Number(tutorialId));
  }, [tutorialId, onAcknowledged]);

  const handleError = useCallback(
    (e) => {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      throw e;
    },
    [onForceLogout],
  );

  if (!hasToken) return null;

  return (
    <LearningAcknowledgeButton
      itemTitle={tutorialTitle}
      labelAction="✓ Marquer comme lu"
      labelDone="✓ Lu"
      titleDone="Tu as confirmé avoir lu et compris ce tutoriel"
      confirmIntro={
        <>
          En validant, tu t&apos;engages à avoir lu et compris le tutoriel{' '}
          <strong>« {tutorialTitle || 'ce tutoriel'} »</strong>.
        </>
      }
      confirmCheckboxLabel="Je confirme avoir lu et compris ce contenu."
      isDone={isRead}
      gatingHandlers={gatingHandlers}
      gatingResource={gatingResource}
      enableGating={!isRead}
      onSubmit={async () => {
        try {
          await submit();
        } catch (e) {
          handleError(e);
        }
      }}
    />
  );
}

/** Charge les IDs de tutoriels marqués lus pour l’utilisateur connecté (tableau vide si pas de jeton). */
export async function fetchTutorialReadIds() {
  if (!getAuthToken()) return [];
  try {
    const res = await api('/api/tutorials/me/read-ids');
    const ids = Array.isArray(res?.tutorial_ids) ? res.tutorial_ids : [];
    return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}
