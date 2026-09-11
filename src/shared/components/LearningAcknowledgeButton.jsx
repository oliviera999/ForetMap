import { useCallback, useEffect, useState } from 'react';
import { useOverlayHistoryBack } from '../platform/useOverlayHistoryBack';
import { DialogShell } from './DialogShell.jsx';
import { LearningGatingQuestionPanel } from './LearningGatingQuestionPanel.jsx';
import { LearningGatingStateIcon } from './LearningGatingStateIcon.jsx';
import { IconCheck, IconLock } from '../icons.jsx';
import { gatingState } from '../utils/learningGatingState.js';
import { cooldownRemainingLabel } from '../utils/cooldownDuration.js';
import { notifyLearningGatingChanged } from '../utils/learningGatingEvents.js';
import {
  pendingChallengeQuestions,
  buildGatingQuizIntroMessage,
  buildGatingRules,
  isCooldownLocked,
  buildCooldownLockMessage,
  buildSessionPausedMessage,
} from '../utils/learningGatingChallengeClient.js';
import { oluAcknowledgeAside, oluAsideKindForResource } from '../utils/oluLearningVoice.js';

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
    const remaining = cooldownRemainingLabel(summary) || 'quelques minutes';
    return {
      announceBadge: '🔒',
      announceTitle: `Validation de ${label} bloquée encore ${remaining} après une erreur.`,
    };
  }

  const ask = Math.max(0, Number(summary.ask_count) || 0);
  if (ask <= 0) return none;
  const total = Math.max(ask, Number(summary.pending_count) || ask);
  const badge = ask === 1 ? '1 question' : `${ask} questions`;
  // `ask_count` n'est que ce qui sera posé MAINTENANT : dire « 3 questions à réussir » quand
  // il en faut 8 était faux. Les deux nombres sont donc énoncés, chacun à sa place.
  const title =
    total > ask
      ? `Contrôle de compréhension : ${badge} maintenant, ${total} au total à réussir avant de valider ${label}.`
      : `Contrôle de compréhension : ${badge} à réussir avant de valider ${label}.`;
  return { announceBadge: badge, announceTitle: title };
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
  /**
   * Pool de pointes d'OLU sous la phrase d'engagement (`glossary` | `species` | `tutorial` |
   * `observation`). Par défaut, il est déduit du type de ressource du conditionnement : les
   * points d'entrée ForetMap et G&L n'ont ainsi rien à câbler, et aucun ne peut oublier.
   * `oluAsideKind={''}` éteint la pointe sur un écran précis.
   */
  oluAsideKind = null,
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
      // Sans challenge, on ne sait pas si un contrôle est exigé : passer à la confirmation
      // promettait une validation que le serveur allait refuser (D3). On le dit, et on
      // propose de réessayer.
      setError(e?.message || 'Impossible de charger le contrôle de compréhension');
      setFlowPhase('error');
    }
  }, [enableGating, gatingHandlers, gatingResource]);

  /** Relit le challenge après un refus du serveur (403 : questions manquantes ou verrou). */
  const reloadChallengeAfterRefusal = useCallback(
    async (body) => {
      if (body?.cooldown && isCooldownLocked(body.cooldown)) {
        setCooldown(body.cooldown);
        setFlowPhase('locked');
        return;
      }
      if (!gatingHandlers || !gatingResource) return;
      const next = await gatingHandlers.fetchChallenge(
        gatingResource.resourceType,
        gatingResource.resourceRef,
      );
      setChallenge(next || null);
      setCooldown(next?.cooldown || null);
      if (next?.required && isCooldownLocked(next.cooldown)) {
        setFlowPhase('locked');
        return;
      }
      // Le nombre annoncé vient du challenge relu (`pending_count` = bonnes réponses encore
      // attendues selon le mode effectif). Le compter sur `missing_question_codes` annonçait
      // « 3 questions à réussir » là où le mode « une suffit » n'en attendait qu'une.
      const stillPending = Math.max(0, Number(next?.pending_count) || 0);
      if (stillPending > 0) {
        setError(
          `Le contrôle n'est pas encore validé : ${stillPending} question${
            stillPending > 1 ? 's' : ''
          } à réussir.`,
        );
      }
      const pending = pendingChallengeQuestions(next);
      if (pending.length > 0) {
        setPendingQuestions(pending);
        setQuestionIndex(0);
        setChecked(false);
        setFlowPhase('quizIntro');
      }
    },
    [gatingHandlers, gatingResource],
  );

  const submit = useCallback(async () => {
    if (!checked || typeof onSubmit !== 'function') return;
    setSaving(true);
    setError('');
    try {
      await onSubmit();
      onDone?.();
      // Les annonces (pastilles, badges) se rechargent d'elles-mêmes.
      notifyLearningGatingChanged({ ...(gatingResource || {}), kind: 'acknowledged' });
      setModalOpen(false);
    } catch (e) {
      // 403 du serveur : le contrôle n'est pas (plus) satisfait — questions manquantes ou
      // verrou posé entre-temps. On relit l'état plutôt que d'afficher une erreur sèche.
      const body = e?.body;
      if (e?.status === 403 && body && (body.cooldown || body.missing_question_codes)) {
        // Message du serveur d'abord (il connaît le mode effectif : « une des questions »,
        // « N questions », verrou) ; la relecture ci-dessous le précise avec le compte réel.
        setError(e?.message || 'Validation refusée');
        try {
          await reloadChallengeAfterRefusal(body);
        } catch (_) {
          /* l'erreur ci-dessus reste affichée */
        }
        return;
      }
      setError(e?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [checked, onSubmit, onDone, gatingResource, reloadChallengeAfterRefusal]);

  const handleQuestionPassed = useCallback(() => {
    // Une bonne réponse change le résumé (une question de moins à réussir) : les pastilles
    // des listes ouvertes derrière se mettent à jour sans fermer la fenêtre (D4).
    notifyLearningGatingChanged({ ...(gatingResource || {}), kind: 'answered' });
    if (questionIndex + 1 < pendingQuestions.length) {
      setQuestionIndex((i) => i + 1);
      return;
    }
    // Plafond « questions posées d'affilée » : la série est finie mais le contrôle ne l'est
    // pas. Passer à la confirmation promettait une validation que le serveur refusait par un
    // 403 — l'écran le dit maintenant, et propose d'enchaîner la série suivante.
    const pendingTotal = Math.max(0, Number(challenge?.pending_count) || 0);
    if (pendingTotal > pendingQuestions.length) {
      setFlowPhase('sessionPaused');
      return;
    }
    setFlowPhase('confirm');
  }, [questionIndex, pendingQuestions.length, gatingResource, challenge]);

  /**
   * Erreur en portée « question seule » : seule la question ratée est bloquée. On redemande
   * l'état au serveur — lui seul sait s'il reste des questions posables ou si la fiche attend
   * la levée la plus proche.
   */
  const handleQuestionLocked = useCallback(async () => {
    if (!gatingHandlers || !gatingResource) return;
    setFlowPhase('loading');
    try {
      const next = await gatingHandlers.fetchChallenge(
        gatingResource.resourceType,
        gatingResource.resourceRef,
      );
      setChallenge(next || null);
      setCooldown(next?.cooldown || null);
      if (next?.required && isCooldownLocked(next.cooldown)) {
        setFlowPhase('locked');
        return;
      }
      const pending = pendingChallengeQuestions(next);
      if (pending.length > 0) {
        setPendingQuestions(pending);
        setQuestionIndex(0);
        setFlowPhase('quiz');
      } else {
        setFlowPhase('confirm');
      }
    } catch (e) {
      setError(e?.message || 'Impossible de recharger le contrôle de compréhension');
      setFlowPhase('confirm');
    }
  }, [gatingHandlers, gatingResource]);

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

  // La pointe d'OLU vient APRÈS l'engagement (charte §2.2bis-2 : l'utile d'abord, la chute
  // ensuite) — quelqu'un qui lit en diagonale repart quand même avec ce à quoi il s'engage.
  // La case à cocher, elle, reste telle quelle : c'est l'élève qui la dit, pas OLU.
  const asideKind =
    oluAsideKind == null ? oluAsideKindForResource(gatingResource?.resourceType) : oluAsideKind;
  const oluAside = asideKind
    ? oluAcknowledgeAside(asideKind, String(gatingResource?.resourceRef ?? itemTitle ?? ''))
    : '';

  // Annonce portée par le bouton : sans elle, l'élève ne découvrait le contrôle
  // qu'une fois la fenêtre ouverte — il s'engageait sans savoir ce qui l'attendait.
  const { announceBadge, announceTitle } = buildButtonAnnounce(gatingSummary, itemTitle);

  const currentQuestion = pendingQuestions[questionIndex] || null;
  const gatingRules = buildGatingRules(challenge);
  // Bonnes réponses encore attendues AVANT cette série : la série peut n'en couvrir
  // qu'une partie (plafond « questions posées d'affilée »).
  const pendingTotal = Math.max(pendingQuestions.length, Number(challenge?.pending_count) || 0);
  // Le challenge porte le délai effectif (heures) ; le bloc `cooldown` seul sert de repli.
  const quizIntroMessage = buildGatingQuizIntroMessage(
    pendingQuestions.length,
    itemTitle,
    challenge || cooldown,
    String(gatingResource?.resourceRef ?? itemTitle ?? ''),
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

          {flowPhase === 'error' ? (
            <>
              <h3 id="learning-ack-title">Contrôle indisponible</h3>
              <p className="tuto-read-ack-error" role="alert">
                {error || 'Impossible de charger le contrôle de compréhension.'}
              </p>
              <div className="tuto-read-ack-actions">
                <button
                  type="button"
                  className={ghostBtnClassName || 'btn btn-ghost btn-sm'}
                  onClick={closeModal}
                >
                  Fermer
                </button>
                <button
                  type="button"
                  className={primaryBtnClassName || 'btn btn-primary btn-sm'}
                  onClick={openModal}
                >
                  Réessayer
                </button>
              </div>
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
              {error ? (
                <p className="tuto-read-ack-error" role="alert">
                  {error}
                </p>
              ) : null}
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
                pendingTotal={pendingTotal}
                resourceType={gatingResource?.resourceType || null}
                resourceRef={gatingResource?.resourceRef ?? null}
                itemTitle={itemTitle}
                presentQuestion={gatingHandlers.presentQuestion}
                answerQuestion={gatingHandlers.answerQuestion}
                onPassed={handleQuestionPassed}
                onAbandon={closeModal}
                onQuestionLocked={handleQuestionLocked}
                choiceClassName={choiceClassName}
                primaryBtnClassName={primaryBtnClassName}
                ghostBtnClassName={ghostBtnClassName}
              />
            </>
          ) : null}

          {flowPhase === 'sessionPaused' ? (
            <>
              <h3 id="learning-ack-title">Série terminée</h3>
              <p className="tuto-read-ack-intro learning-gating-quiz__progress" role="status">
                {buildSessionPausedMessage(
                  pendingTotal - pendingQuestions.length,
                  itemTitle,
                  String(gatingResource?.resourceRef ?? itemTitle ?? ''),
                )}
              </p>
              <div className="tuto-read-ack-actions">
                <button
                  type="button"
                  className={ghostBtnClassName || 'btn btn-ghost btn-sm'}
                  onClick={closeModal}
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  className={primaryBtnClassName || 'btn btn-primary btn-sm'}
                  onClick={openModal}
                >
                  Continuer le contrôle
                </button>
              </div>
            </>
          ) : null}

          {flowPhase === 'confirm' ? (
            <>
              <h3 id="learning-ack-title">Confirmer</h3>
              <p className="tuto-read-ack-intro">{intro}</p>
              {oluAside ? <p className="tuto-read-ack-olu">{oluAside}</p> : null}
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
