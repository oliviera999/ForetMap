import React, { useMemo } from 'react';
import { hasQcmAnswerFeedback } from '../../gl/utils/glQcmDisplay.js';
import { GLGlossaryInlineText } from '../../gl/components/GLGlossaryMarkdown.jsx';
import { GLLoreGlossaryInlineText } from '../../gl/components/GLLoreGlossaryMarkdown.jsx';
import { mergeGlossaryLinkItems } from '../../utils/glGlossaryAutolink.js';
import { mergeLoreGlossaryLinkItems } from '../../utils/glLoreGlossaryAutolink.js';

function isLoreQcmCode(code) {
  return /^LQCM\d+$/i.test(String(code || '').trim());
}

/**
 * Modale d'aperçu QCM partagée (GL + ForetMap pédagogie).
 */
export function QcmPreviewModal({
  previewCode,
  presentLoading,
  answerLoading,
  presentation,
  feedback,
  selectedChoiceId,
  onReload,
  onSelectChoice,
  onSubmitAnswer,
  onClose,
  onCloseFromFeedback,
  FeedbackBlock,
  Button,
  classNames = {},
  qcmSet = null,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
}) {
  const {
    root = 'gl-qcm-modal gl-qcm-modal--inline',
    body = 'gl-qcm-modal__body',
    question = 'gl-qcm-modal__question',
    choices = 'gl-qcm-modal__choices',
    choice = 'gl-qcm-choice',
    actions = 'gl-inline-actions',
    hint = 'gl-hint',
    error = 'gl-error',
    glossary = 'gl-qcm-modal__glossary',
  } = classNames;

  const resolvedQcmSet = qcmSet || (isLoreQcmCode(previewCode) ? 'lore' : 'biome');
  const isLore = resolvedQcmSet === 'lore';
  const hasGlossaryUi = Boolean(onOpenGlossaryTerm || onOpenLoreTerm);
  const InlineText = isLore ? GLLoreGlossaryInlineText : GLGlossaryInlineText;
  const mergedGlossaryItems = useMemo(
    () =>
      mergeGlossaryLinkItems(glossaryLinkItems, [
        ...(presentation?.glossaryTerms || []),
        ...(feedback?.glossaryTerms || []),
      ]),
    [glossaryLinkItems, presentation?.glossaryTerms, feedback?.glossaryTerms],
  );
  const mergedLoreGlossaryItems = useMemo(
    () =>
      mergeLoreGlossaryLinkItems(loreGlossaryLinkItems, [
        ...(presentation?.loreGlossaryTerms || []),
        ...(feedback?.loreGlossaryTerms || []),
      ]),
    [loreGlossaryLinkItems, presentation?.loreGlossaryTerms, feedback?.loreGlossaryTerms],
  );
  const inlineGlossaryProps = isLore
    ? { loreGlossaryItems: mergedLoreGlossaryItems, onOpenLoreTerm }
    : { glossaryItems: mergedGlossaryItems, onOpenGlossaryTerm };
  const linkedTerms = isLore
    ? presentation?.loreGlossaryTerms || feedback?.loreGlossaryTerms || []
    : presentation?.glossaryTerms || feedback?.glossaryTerms || [];

  if (!previewCode) return null;
  return (
    <div className={root} role="dialog" aria-label="Aperçu QCM">
      <div className={body}>
        <h4>Aperçu — {previewCode}</h4>
        {presentLoading ? <p className={hint}>Chargement…</p> : null}
        {hasQcmAnswerFeedback(feedback) ? (
          <>
            <FeedbackBlock
              result={feedback}
              qcmSet={resolvedQcmSet}
              glossaryLinkItems={mergedGlossaryItems}
              loreGlossaryLinkItems={mergedLoreGlossaryItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              onOpenLoreTerm={onOpenLoreTerm}
            />
            {hasGlossaryUi && linkedTerms.length > 0 ? (
              <div className={glossary}>
                <strong>Termes liés :</strong>
                <div className="gl-glossary-chips">
                  {linkedTerms.map((term) => (
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
                  ))}
                </div>
              </div>
            ) : null}
            <div className={actions}>
              <Button type="button" onClick={onReload}>
                Nouvelle présentation
              </Button>
              <Button type="button" variant="ghost" onClick={onCloseFromFeedback}>
                Fermer
              </Button>
            </div>
          </>
        ) : (
          <>
            {presentation?.question ? (
              hasGlossaryUi ? (
                <InlineText
                  className={question}
                  text={presentation.question}
                  {...inlineGlossaryProps}
                  tag="p"
                />
              ) : (
                <p className={question}>{presentation.question}</p>
              )
            ) : null}
            {presentation?.choices?.length ? (
              <div className={choices}>
                {presentation.choices.map((c) => (
                  <label key={c.id} className={choice}>
                    <input
                      type="radio"
                      name="preview-choice"
                      checked={selectedChoiceId === c.id}
                      onChange={() => onSelectChoice(c.id)}
                    />
                    {hasGlossaryUi ? (
                      <InlineText text={c.text} {...inlineGlossaryProps} />
                    ) : (
                      <span>{c.text}</span>
                    )}
                  </label>
                ))}
              </div>
            ) : null}
            {hasGlossaryUi && linkedTerms.length > 0 ? (
              <div className={glossary}>
                <strong>{isLore ? 'Lexique lore :' : 'Glossaire :'}</strong>
                <div className="gl-glossary-chips">
                  {linkedTerms.map((term) => (
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
                  ))}
                </div>
              </div>
            ) : null}
            <div className={actions}>
              <Button type="button" onClick={onReload}>
                Re-mélanger
              </Button>
              <Button
                type="button"
                onClick={onSubmitAnswer}
                disabled={answerLoading || selectedChoiceId == null}
              >
                Valider
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Fermer
              </Button>
            </div>
            {feedback?.error ? <p className={error}>{feedback.error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
