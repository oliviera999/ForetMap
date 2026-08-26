import React, { useCallback, useMemo } from 'react';
import { api, AccountDeletedError, getAuthToken } from '../../services/api';
import { LearningAcknowledgeButton } from '../../shared/components/LearningAcknowledgeButton.jsx';
import { LearningQuizPopover } from '../../shared/components/LearningQuizPopover.jsx';
import { createFmGatingHandlers } from '../../shared/utils/learningGatingChallengeClient.js';

/**
 * Bouton « J'ai appris ce terme » sur une fiche du glossaire ForetMap.
 *
 * Le glossaire était purement consultatif : rien ne distinguait un terme travaillé d'un
 * terme jamais ouvert, et surtout, le conditionnement n'avait aucun geste de validation
 * auquel se rattacher — un lien bloquant sur un terme restait inerte à jamais. Gnomes &
 * Licornes savait valider un terme depuis longtemps ; ForetMap le fait maintenant aussi,
 * avec le même bouton partagé, le même popover et les mêmes pastilles d'état.
 *
 * N'affiche rien sans session : un visiteur anonyme n'a rien à valider.
 */
export function GlossaryTermLearnedAcknowledgeButton({
  glossaryCode,
  termLabel,
  isLearned = false,
  onAcknowledged,
  onForceLogout,
  /** Résumé du conditionnement pour ce terme (chargé en lot par la vue). */
  gatingSummary = null,
}) {
  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();
  const gatingHandlers = useMemo(() => createFmGatingHandlers(api), []);
  const gatingResource = useMemo(
    () => ({ resourceType: 'glossary', resourceRef: String(glossaryCode || '') }),
    [glossaryCode],
  );

  const submit = useCallback(async () => {
    const code = String(glossaryCode || '').trim();
    if (!code) throw new Error('Terme invalide — recharge la page ou rouvre le glossaire.');
    await api(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`, 'POST', {
      confirm: true,
    });
    onAcknowledged?.(code);
  }, [glossaryCode, onAcknowledged]);

  if (!hasToken || !glossaryCode) return null;

  return (
    <LearningAcknowledgeButton
      itemTitle={termLabel}
      labelAction="✓ J’ai appris ce terme"
      labelDone="✓ Appris"
      titleDone="Tu as confirmé avoir appris ce terme"
      confirmIntro={
        <>
          En validant, tu t&apos;engages à avoir lu et compris le terme{' '}
          <strong>« {termLabel || 'ce terme'} »</strong>.
        </>
      }
      confirmCheckboxLabel="Je confirme avoir lu et compris cette définition."
      isDone={isLearned}
      gatingHandlers={gatingHandlers}
      gatingResource={gatingResource}
      gatingSummary={gatingSummary}
      enableGating={!isLearned}
      Shell={LearningQuizPopover}
      overlayClassName="fm-quiz-popover fm-quiz-popover--ack"
      dialogClassName="fm-quiz-popover__panel animate-pop"
      onSubmit={async () => {
        try {
          await submit();
        } catch (e) {
          if (e instanceof AccountDeletedError) onForceLogout?.();
          throw e;
        }
      }}
    />
  );
}

/** Codes des termes déjà appris par l'utilisateur connecté (tableau vide si pas de jeton). */
export async function fetchLearnedGlossaryCodes() {
  if (!getAuthToken()) return [];
  try {
    const res = await api('/api/glossary/me/learned-codes');
    return Array.isArray(res?.glossary_codes) ? res.glossary_codes.map((c) => String(c)) : [];
  } catch {
    return [];
  }
}
