import { useCallback, useMemo } from 'react';
import {
  api,
  AccountDeletedError,
  getAuthToken,
  getAuthUserId,
  isLikelyNetworkTransportFailure,
} from '../services/api';
import { LearningAcknowledgeButton } from '../shared/components/LearningAcknowledgeButton.jsx';
import { createFmGatingHandlers } from '../shared/utils/learningGatingChallengeClient.js';
import { LearningQuizPopover } from '../shared/components/LearningQuizPopover.jsx';
import { IconCheck } from '../shared/icons.jsx';
import { FmLearnAndImportSlot } from './journal/FmLearnAndImportSlot.jsx';
import { withPedagoSessionScope } from '../utils/pedagoSessionScope.js';
import { enqueueTutorialRead, queuedTutorialReadIds } from '../utils/tutorialReadQueue.js';
import { notifyOutboxChanged } from '../services/offlineOutbox.js';

/** Épreuve et validation annoncent la séance en cours : elle impose son niveau. */
const gatingApi = withPedagoSessionScope(api);

/**
 * Une lecture peut être gardée sans réseau seulement si le résumé du contrôle, chargé avant le
 * clic, dit qu'aucun contrôle n'est à passer (ou qu'il est déjà réussi) : les questions sont
 * tirées et corrigées par le serveur.
 * @param {object|null} summary résumé du contrôle de compréhension
 */
export function tutorialReadCanWaitOffline(summary) {
  return !!summary && (!summary.required || !!summary.satisfied);
}

/**
 * Bouton + modal pour marquer un tutoriel comme lu après confirmation explicite.
 * N’affiche rien si aucune session (pas de jeton). Sans réseau, la lecture est gardée sur
 * l'appareil (`utils/tutorialReadQueue.js`) et part au retour du réseau.
 */
export function TutorialReadAcknowledgeButton({
  tutorialId,
  tutorialTitle,
  isRead,
  onAcknowledged,
  onForceLogout,
  /** Résumé du conditionnement pour ce tutoriel (chargé en lot par la vue). */
  gatingSummary = null,
}) {
  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const gatingHandlers = useMemo(() => createFmGatingHandlers(gatingApi), []);
  const gatingResource = useMemo(
    () => ({ resourceType: 'tutorial', resourceRef: String(tutorialId) }),
    [tutorialId],
  );
  const canWaitOffline = tutorialReadCanWaitOffline(gatingSummary);
  const confirmWhenChallengeUnavailable = useCallback(
    (err) => canWaitOffline && isLikelyNetworkTransportFailure(err),
    [canWaitOffline],
  );

  const submit = useCallback(async () => {
    try {
      await gatingApi(`/api/tutorials/${tutorialId}/acknowledge-read`, 'POST', { confirm: true });
    } catch (e) {
      const userId = getAuthUserId();
      const kept =
        canWaitOffline &&
        isLikelyNetworkTransportFailure(e) &&
        !!userId &&
        enqueueTutorialRead({
          user_id: userId,
          tutorial_id: Number(tutorialId),
          tutorial_title: tutorialTitle || '',
        });
      if (!kept) throw e;
      notifyOutboxChanged({ reason: 'queued', kind: 'tutorial_read' });
    }
    onAcknowledged?.(Number(tutorialId));
  }, [tutorialId, tutorialTitle, canWaitOffline, onAcknowledged]);

  const handleError = useCallback(
    (e) => {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      throw e;
    },
    [onForceLogout],
  );

  if (!hasToken) return null;

  return (
    <FmLearnAndImportSlot
      resourceType="tutorial"
      resourceRef={tutorialId}
      title={tutorialTitle}
      learned={!!isRead}
    >
      <LearningAcknowledgeButton
        itemTitle={tutorialTitle}
        labelAction={
          <>
            <IconCheck size={14} /> Marquer comme lu
          </>
        }
        labelDone={
          <>
            <IconCheck size={14} /> Lu
          </>
        }
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
        gatingSummary={gatingSummary}
        enableGating={!isRead}
        confirmWhenChallengeUnavailable={confirmWhenChallengeUnavailable}
        Shell={LearningQuizPopover}
        overlayClassName="fm-quiz-popover fm-quiz-popover--ack"
        dialogClassName="fm-quiz-popover__panel animate-pop"
        onSubmit={async () => {
          try {
            await submit();
          } catch (e) {
            handleError(e);
          }
        }}
      />
    </FmLearnAndImportSlot>
  );
}

/**
 * Charge les IDs de tutoriels marqués lus pour l’utilisateur connecté (tableau vide si pas de
 * jeton). Les lectures gardées sans réseau et pas encore envoyées comptent comme lues.
 */
export async function fetchTutorialReadIds() {
  if (!getAuthToken()) return [];
  const queued = [...queuedTutorialReadIds(getAuthUserId())];
  try {
    const res = await api('/api/tutorials/me/read-ids');
    const ids = Array.isArray(res?.tutorial_ids) ? res.tutorial_ids : [];
    const fromServer = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    return [...new Set([...fromServer, ...queued])];
  } catch {
    return queued;
  }
}
