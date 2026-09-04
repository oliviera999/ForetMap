import { useCallback, useEffect, useState } from 'react';
import { useOverlayHistoryBack } from '../platform/useOverlayHistoryBack';
import { DialogShell } from './DialogShell.jsx';
import { LearningGatingQuestionPanel } from './LearningGatingQuestionPanel.jsx';
import { LearningGatingStateIcon } from './LearningGatingStateIcon.jsx';
import { IconCheck, IconLock } from '../icons.jsx';
import { gatingState } from '../utils/learningGatingState.js';
import {
  pendingChallengeQuestions,
  buildGatingQuizIntroMessage,
  buildGatingRules,
  isCooldownLocked,
  buildCooldownLockMessage,
} from '../utils/learningGatingChallengeClient.js';

/**
 * Texte d'annonce du bouton, d'après le résumé de conditionnement de la ressource.
 * Renvoie une pastille courte (lue visuellement) et un intitulé complet (infobulle
 * et lecteurs d'écran). Rien à annoncer → deux chaînes vides.
 *
 * L'état vient du module commun `learningGatingState`, partagé avec la pastille d'icône :
 * les deux ne peuvent donc pas raconter deux histoires différentes sur la même ressource.
 *
 * `summary.announce === false` (réglage prof « Annoncer le contrôle sur le bouton »,
 * résolu côté serveur) éteint l'annonce sans rien changer au conditionnement lui-même.
 */
export function buildButtonAnnounce(summary, itemTitle = '') {
  const none = { announceBadge: '', announceTitle: '' };
  if (!summary || summary.announce === false) return none;

  const state = gatingState(summary);
  // Rien à annoncer sur une ressource non conditionnée ou déjà acquise : la pastille
  // d'état, elle, montre encore le « ✓ » — c'est une information, pas un avertissement.
  if (state.kind === 'none' || state.kind === 'acquired') return none;

  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  if (state.kind === 'locked') {
    const days = Math.max(1, Number(summary.remaining_days) || 1);
    return {
      announceBadge: '🔒',
      announceTitle: `Validation de ${label} bloquée encore ${days === 1 ? '1 jour' : `${days} jours`} après une erreur.`,
    };
  }

  const ask = Math.max(0, Number(summary.ask_count) || 0);
  if (ask <= 0) return none;
  const total = Math.max(ask, Number(summary.pending_count) || ask);
  const badge = ask === 1 ? '1 question' : `${ask} questions`;
  const reste =
    total > ask ? ` (${total} au total pour valider ${label})` : ` avant de valider ${label}`;
  return {
    announceBadge: badge,
    announceTitle: `Contrôle de compréhension : ${badge} à réussir${reste}.`,
  };
}

/**
 * Bouton + modal de confirmation pour marquer un contenu comme lu / appris / étudié.
 * Si `gatingHandlers` et `gatingResource` sont fournis, un quiz gating précède la confirmation.
 */
export function LearningAcknowledgeButton({
  itemTitle = '',
  /** Coque d'affichage — même interface que `DialogShell`. ForetMap injecte son popover. */
  Shell = DialogShell,
  /** Résumé du contrôle connu AVANT le clic (route /api/learning/gating/summary). */
  gatingSummary = null,
  labelAction = 'Marquer comme lu',
  labelDone = (
    <>
      <IconCheck size={14} /> Lu
    </>
  ),
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
  const [cooldown, setCooldown] = useState(null);
  const [challenge, setChallenge] = useState(null);
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
    setCooldown(null);
    setChallenge(null);
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
      setChallenge(challenge || null);
      if (challenge?.required && isCooldownLocked(challenge.cooldown)) {
        setCooldown(challenge.cooldown);
        setFlowPhase('locked');
        return;
      }
      // Conservé même déverrouillé : `retry_days` dit à l'élève ce qu'une erreur coûterait.
      setCooldown(challenge?.cooldown || null);
      const pending = pendingChallengeQuestions(challenge);
      if (pending.length > 0) {
        setPendingQuestions(pending);
        setQuestionIndex(0);
        setFlowPhase('quizIntro');
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

  // Annonce portée par le bouton : sans elle, l'élève ne découvrait le contrôle
  // qu'une fois la fenêtre ouverte — il s'engageait sans savoir ce qui l'attendait.
  const { announceBadge, announceTitle } = buildButtonAnnounce(gatingSummary, itemTitle);

  const currentQuestion = pendingQuestions[questionIndex] || null;
  const gatingRules = buildGatingRules(challenge);
  const quizIntroMessage = buildGatingQuizIntroMessage(
    pendingQuestions.length,
    itemTitle,
    cooldown?.retry_days,
  );

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={openModal}
        title={announceTitle || undefined}
      >
        {labelAction}
        {announceBadge ? (
          <span className="learning-gating-announce" aria-hidden="true">
            {/* Le module pur annonce « 🔒 » (chaîne testée/partagée) : le chrome le rend en SVG. */}
            {announceBadge === '🔒' ? <IconLock size={12} /> : announceBadge}
          </span>
        ) : (
          // Pas d'annonce à faire : reste la pastille d'état, qui dit le « déjà acquis »
          // (que l'annonce ne dit jamais) et prend le relais si l'annonce est éteinte.
          // Les afficher toutes les deux ferait doublon sur le même bouton.
          <LearningGatingStateIcon summary={gatingSummary} done={isDone} />
        )}
      </button>
      {announceTitle ? <span className="sr-only">{announceTitle}</span> : null}
      {modalOpen ? (
        <Shell
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

          {flowPhase === 'locked' ? (
            <>
              <h3 id="learning-ack-title">Réessaie plus tard</h3>
              <p className="tuto-read-ack-intro learning-gating-quiz__cooldown" role="alert">
                {buildCooldownLockMessage(cooldown, itemTitle)}
              </p>
              <div className="tuto-read-ack-actions">
                <button
                  type="button"
                  className={primaryBtnClassName || 'btn btn-primary btn-sm'}
                  onClick={closeModal}
                >
                  Fermer
                </button>
              </div>
            </>
          ) : null}

          {flowPhase === 'quizIntro' ? (
            <>
              <h3 id="learning-ack-title">Contrôle de compréhension</h3>
              <p className="tuto-read-ack-intro learning-gating-quiz-intro">{quizIntroMessage}</p>
              <ul className="learning-gating-rules">
                {gatingRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <div className="tuto-read-ack-actions">
                <button
                  type="button"
                  className={ghostBtnClassName || 'btn btn-ghost btn-sm'}
                  onClick={closeModal}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className={primaryBtnClassName || 'btn btn-primary btn-sm'}
                  onClick={() => setFlowPhase('quiz')}
                >
                  Commencer
                </button>
              </div>
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
                resourceType={gatingResource?.resourceType || null}
                resourceRef={gatingResource?.resourceRef ?? null}
                itemTitle={itemTitle}
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
        </Shell>
      ) : null}
    </>
  );
}
