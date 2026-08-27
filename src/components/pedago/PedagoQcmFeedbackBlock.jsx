import { getQcmFeedbackText, shouldShowQcmAnswerPhase } from '../../shared/qcm/qcmFeedback.js';
import { GlossaryInlineText } from '../GlossaryMarkdown.jsx';

/**
 * Retour pédagogique après validation d'une réponse QCM (style ForetMap).
 *
 * Avec `glossaryItems` + `onOpenGlossaryTerm`, les termes du glossaire cités dans
 * le feedback deviennent cliquables ; sans ces props, le rendu est inchangé.
 */
export function PedagoQcmFeedbackBlock({
  result,
  className = '',
  glossaryItems = null,
  onOpenGlossaryTerm = undefined,
}) {
  const text = getQcmFeedbackText(result);
  if (!text) return null;
  const correct = Boolean(result?.correct);
  const withGlossary =
    Array.isArray(glossaryItems) &&
    glossaryItems.length > 0 &&
    typeof onOpenGlossaryTerm === 'function';

  return (
    <div
      className={`pedago-qcm-feedback ${correct ? 'pedago-qcm-feedback--ok' : 'pedago-qcm-feedback--ko'} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {withGlossary ? (
        <GlossaryInlineText
          tag="p"
          className="pedago-qcm-feedback__text"
          text={text}
          glossaryItems={glossaryItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
        />
      ) : (
        <p className="pedago-qcm-feedback__text">{text}</p>
      )}
    </div>
  );
}

/** @deprecated Préférer `shouldShowQcmAnswerPhase` depuis `shared/qcm/qcmFeedback`. */
export const shouldShowPedagoQcmAnswerPhase = shouldShowQcmAnswerPhase;
