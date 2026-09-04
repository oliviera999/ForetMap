import { useMemo } from 'react';
import { hasQcmAnswerFeedback } from './qcmFeedback.js';
import { QcmQuestionPhoto } from './QcmQuestionPhoto.jsx';
import { glossaryPropsWhileAnswering } from './quizGlossaryReveal.js';

function isLoreQcmCode(code) {
  return /^LQCM\d+$/i.test(String(code || '').trim());
}

/** Rendu inline neutre (texte brut) quand aucun adaptateur glossaire produit n'est fourni. */
function PlainInlineText({ text, className = '', tag: Tag = 'span' }) {
  return <Tag className={className}>{text}</Tag>;
}

/** Fusion neutre : concaténation simple (les adaptateurs produit dédoublonnent par code). */
function concatGlossaryItems(baseItems = [], extraTerms = []) {
  return [
    ...(Array.isArray(baseItems) ? baseItems : []),
    ...(Array.isArray(extraTerms) ? extraTerms : []),
  ];
}

/**
 * Adaptateur glossaire injecté par le produit (autoliens G&L : cf.
 * `src/gl/components/admin/glQcmPreviewGlossaryUi.js`). Sans adaptateur, le texte est rendu brut.
 * @typedef {{
 *   GlossaryInlineText?: import('react').ComponentType<any>,
 *   LoreGlossaryInlineText?: import('react').ComponentType<any>,
 *   mergeGlossaryLinkItems?: (baseItems: any[], extraTerms: any[]) => any[],
 *   mergeLoreGlossaryLinkItems?: (baseItems: any[], extraTerms: any[]) => any[],
 * }} QcmPreviewGlossaryUi
 */

/**
 * Modale d'aperçu QCM partagée (GL + ForetMap pédagogie).
 * @param {object} props
 * @param {QcmPreviewGlossaryUi|null} [props.glossaryUi] adaptateur glossaire du produit
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
  glossaryUi = null,
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
    photoFigure = 'qcm-preview__photo',
    photoImg = 'qcm-preview__photo-img',
    photoCaption = 'qcm-preview__photo-caption',
  } = classNames;

  const resolvedQcmSet = qcmSet || (isLoreQcmCode(previewCode) ? 'lore' : 'biome');
  const isLore = resolvedQcmSet === 'lore';
  const hasGlossaryUi = Boolean(onOpenGlossaryTerm || onOpenLoreTerm);
  const InlineText =
    (isLore ? glossaryUi?.LoreGlossaryInlineText : glossaryUi?.GlossaryInlineText) ||
    PlainInlineText;
  const mergeGlossaryLinkItems = glossaryUi?.mergeGlossaryLinkItems || concatGlossaryItems;
  const mergeLoreGlossaryLinkItems = glossaryUi?.mergeLoreGlossaryLinkItems || concatGlossaryItems;
  const mergedGlossaryItems = useMemo(
    () =>
      mergeGlossaryLinkItems(glossaryLinkItems, [
        ...(presentation?.glossaryTerms || []),
        ...(feedback?.glossaryTerms || []),
      ]),
    [
      mergeGlossaryLinkItems,
      glossaryLinkItems,
      presentation?.glossaryTerms,
      feedback?.glossaryTerms,
    ],
  );
  const mergedLoreGlossaryItems = useMemo(
    () =>
      mergeLoreGlossaryLinkItems(loreGlossaryLinkItems, [
        ...(presentation?.loreGlossaryTerms || []),
        ...(feedback?.loreGlossaryTerms || []),
      ]),
    [
      mergeLoreGlossaryLinkItems,
      loreGlossaryLinkItems,
      presentation?.loreGlossaryTerms,
      feedback?.loreGlossaryTerms,
    ],
  );
  const inlineGlossaryProps = isLore
    ? { loreGlossaryItems: mergedLoreGlossaryItems, onOpenLoreTerm }
    : { glossaryItems: mergedGlossaryItems, onOpenGlossaryTerm };
  const linkedTerms = isLore
    ? presentation?.loreGlossaryTerms || feedback?.loreGlossaryTerms || []
    : presentation?.glossaryTerms || feedback?.glossaryTerms || [];
  // Aperçu prof : il doit montrer ce que l'élève verra, y compris le fait que le
  // glossaire n'est pas consultable avant la réponse (cf. `quizGlossaryReveal`).
  const answeringGlossaryProps = glossaryPropsWhileAnswering(
    inlineGlossaryProps,
    hasQcmAnswerFeedback(feedback),
  );

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
                  {...answeringGlossaryProps}
                  tag="p"
                />
              ) : (
                <p className={question}>{presentation.question}</p>
              )
            ) : null}
            <QcmQuestionPhoto
              presentation={presentation}
              showLegende
              figureClassName={photoFigure}
              imgClassName={photoImg}
              captionClassName={photoCaption}
            />
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
                      <InlineText text={c.text} {...answeringGlossaryProps} />
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
