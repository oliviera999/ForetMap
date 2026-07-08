import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLQcmFeedbackBlock } from './GLQcmFeedbackBlock.jsx';
import { shouldShowQcmAnswerPhase } from '../utils/glQcmDisplay.js';
import { GLGlossaryInlineText } from './GLGlossaryMarkdown.jsx';
import { GLLoreGlossaryInlineText } from './GLLoreGlossaryMarkdown.jsx';
import { mergeGlossaryLinkItems } from '../../utils/glGlossaryAutolink.js';
import { mergeLoreGlossaryLinkItems } from '../../utils/glLoreGlossaryAutolink.js';

function isLoreQcmCode(code) {
  return /^LQCM\d+$/i.test(String(code || '').trim());
}

export function GLQcmPopover({
  open,
  marker,
  gameId,
  teamId = null,
  presentation,
  questionCode,
  qcmSet = null,
  loading,
  error: externalError,
  result,
  onClose,
  onOpenGlossaryTerm,
  onOpenLoreTerm,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onAnswered,
  onReshuffle,
  onSubmitResult,
  /** Variables CSS marque (hors `.gl-app` car portail `document.body`) */
  themeStyle = null,
}) {
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [answerResult, setAnswerResult] = useState(null);

  useEffect(() => {
    if (open) {
      setSelectedChoiceId(null);
      setError('');
      setAnswerResult(null);
    }
  }, [open, questionCode, presentation?.presentationToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function submitAnswer() {
    if (!questionCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const body = {
        questionCode,
        presentationToken: presentation.presentationToken,
        choiceId: selectedChoiceId,
        markerId: marker?.id ?? null,
      };
      if (teamId != null) body.teamId = Number(teamId);
      const data = gameId
        ? await apiGL(`/api/gl/games/${gameId}/qcm/answer`, 'POST', body)
        : await apiGL(`/api/gl/qcm/questions/${encodeURIComponent(questionCode)}/answer`, 'POST', {
            presentationToken: body.presentationToken,
            choiceId: body.choiceId,
          });
      setAnswerResult(data);
      onSubmitResult?.(data);
      if (gameId && data?.correct) {
        queueMicrotask(() => onAnswered?.(data));
      }
    } catch (err) {
      setError(err.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }

  // Les Hooks doivent précéder tout return conditionnel (react-hooks/rules-of-hooks).
  const displayResult = answerResult ?? result;
  const mergedGlossaryItems = useMemo(
    () =>
      mergeGlossaryLinkItems(glossaryLinkItems, [
        ...(presentation?.glossaryTerms || []),
        ...(displayResult?.glossaryTerms || []),
      ]),
    [glossaryLinkItems, presentation?.glossaryTerms, displayResult?.glossaryTerms],
  );
  const mergedLoreGlossaryItems = useMemo(
    () =>
      mergeLoreGlossaryLinkItems(loreGlossaryLinkItems, [
        ...(presentation?.loreGlossaryTerms || []),
        ...(displayResult?.loreGlossaryTerms || []),
      ]),
    [loreGlossaryLinkItems, presentation?.loreGlossaryTerms, displayResult?.loreGlossaryTerms],
  );

  if (!open || typeof document === 'undefined') return null;

  const displayError = externalError || error;
  const showAnswer = shouldShowQcmAnswerPhase(displayResult);
  const showChoices = !loading && !showAnswer && presentation;
  const resolvedQcmSet =
    qcmSet || presentation?.qcmSet || (isLoreQcmCode(questionCode) ? 'lore' : 'biome');
  const isLore = resolvedQcmSet === 'lore';
  const InlineText = isLore ? GLLoreGlossaryInlineText : GLGlossaryInlineText;
  const inlineGlossaryProps = isLore
    ? { loreGlossaryItems: mergedLoreGlossaryItems, onOpenLoreTerm: onOpenLoreTerm }
    : { glossaryItems: mergedGlossaryItems, onOpenGlossaryTerm: onOpenGlossaryTerm };

  return createPortal(
    <div
      className="gl-qcm-popover-overlay"
      role="presentation"
      style={themeStyle || undefined}
      onClick={() => onClose?.()}
    >
      <div
        className="gl-qcm-popover"
        role="dialog"
        aria-label="Question"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gl-qcm-popover__body">
          <header className="gl-qcm-popover__header">
            <h3>{marker?.label || 'Question'}</h3>
            {loading ? <p className="gl-hint">Chargement de la question…</p> : null}
            {displayError ? <p className="gl-error">{displayError}</p> : null}
          </header>
          {showChoices ? (
            <>
              <div className="gl-qcm-popover__scroll">
                {questionCode ? <p className="gl-hint">Question {questionCode}</p> : null}
                <InlineText
                  className="gl-qcm-modal__question"
                  text={presentation.question}
                  {...inlineGlossaryProps}
                  tag="p"
                />
                {presentation.photoUrl ? (
                  <figure className="gl-qcm-modal__photo-wrap">
                    <img src={presentation.photoUrl} alt="" className="gl-qcm-modal__photo" />
                    {presentation.photoCredit || presentation.photoLicence ? (
                      <figcaption className="gl-qcm-modal__photo-credit">
                        {[presentation.photoCredit, presentation.photoLicence]
                          .filter(Boolean)
                          .join(' — ')}
                      </figcaption>
                    ) : null}
                  </figure>
                ) : null}
                <div className="gl-qcm-modal__choices">
                  {presentation.choices.map((choice) => (
                    <label key={choice.id} className="gl-qcm-choice">
                      <input
                        type="radio"
                        name="qcm-popover-choice"
                        checked={selectedChoiceId === choice.id}
                        onChange={() => setSelectedChoiceId(choice.id)}
                      />
                      <InlineText text={choice.text} {...inlineGlossaryProps} />
                    </label>
                  ))}
                </div>
                {(isLore ? presentation.loreGlossaryTerms : presentation.glossaryTerms)?.length >
                0 ? (
                  <div className="gl-qcm-modal__glossary">
                    <strong>{isLore ? 'Lexique lore :' : 'Glossaire scientifique :'}</strong>
                    <div className="gl-glossary-chips">
                      {(isLore ? presentation.loreGlossaryTerms : presentation.glossaryTerms).map(
                        (term) => (
                          <button
                            key={isLore ? term.lore_code : term.glossary_code}
                            type="button"
                            className="gl-glossary-chip"
                            onClick={() =>
                              isLore
                                ? onOpenLoreTerm?.(term.lore_code)
                                : onOpenGlossaryTerm?.(term.glossary_code)
                            }
                          >
                            {term.terme}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <footer className="gl-qcm-popover__footer">
                <GLButton
                  type="button"
                  className="gl-qcm-popover__submit"
                  onClick={submitAnswer}
                  disabled={submitting || selectedChoiceId == null}
                  loading={submitting}
                >
                  {submitting ? 'Envoi…' : "C'est cette réponse !"}
                </GLButton>
                <div className="gl-inline-actions">
                  <GLButton type="button" variant="ghost" onClick={onReshuffle}>
                    Re-mélanger
                  </GLButton>
                  <GLButton type="button" variant="ghost" onClick={onClose}>
                    Fermer
                  </GLButton>
                </div>
              </footer>
            </>
          ) : null}
          {showAnswer ? (
            <>
              <div className="gl-qcm-popover__scroll">
                {questionCode ? <p className="gl-hint">Question {questionCode}</p> : null}
                <GLQcmFeedbackBlock
                  result={displayResult}
                  scoreDelta={displayResult?.scoreDelta}
                  qcmSet={resolvedQcmSet}
                  glossaryLinkItems={mergedGlossaryItems}
                  loreGlossaryLinkItems={mergedLoreGlossaryItems}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                  onOpenLoreTerm={onOpenLoreTerm}
                />
                {((isLore ? displayResult.loreGlossaryTerms : displayResult.glossaryTerms) || [])
                  .length > 0 ? (
                  <div className="gl-qcm-modal__glossary">
                    <strong>Termes liés :</strong>
                    <div className="gl-glossary-chips">
                      {(isLore ? displayResult.loreGlossaryTerms : displayResult.glossaryTerms).map(
                        (term) => (
                          <button
                            key={isLore ? term.lore_code : term.glossary_code}
                            type="button"
                            className="gl-glossary-chip"
                            onClick={() =>
                              isLore
                                ? onOpenLoreTerm?.(term.lore_code)
                                : onOpenGlossaryTerm?.(term.glossary_code)
                            }
                          >
                            {term.terme}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <footer className="gl-qcm-popover__footer">
                <div className="gl-inline-actions">
                  {!displayResult.correct ? (
                    <GLButton type="button" onClick={onReshuffle}>
                      Réessayer
                    </GLButton>
                  ) : null}
                  <GLButton type="button" onClick={onClose}>
                    Fermer
                  </GLButton>
                </div>
              </footer>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
