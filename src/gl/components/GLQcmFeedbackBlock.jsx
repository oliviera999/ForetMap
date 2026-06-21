import React from 'react';
import { getQcmFeedbackText } from '../utils/glQcmDisplay.js';
import { GLGlossaryInlineText } from './GLGlossaryMarkdown.jsx';
import { GLLoreGlossaryInlineText } from './GLLoreGlossaryMarkdown.jsx';

/**
 * Bloc de retour pédagogique après validation d'une réponse QCM.
 */
export function GLQcmFeedbackBlock({
  result,
  scoreDelta = 0,
  className = '',
  qcmSet = 'biome',
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
}) {
  const text = getQcmFeedbackText(result);
  if (!text) return null;

  const correct = Boolean(result?.correct);
  const scoreSuffix = Number(scoreDelta) > 0 ? ` (+${Number(scoreDelta)} point)` : '';
  const isLore = qcmSet === 'lore';
  const InlineText = isLore ? GLLoreGlossaryInlineText : GLGlossaryInlineText;
  const inlineProps = isLore
    ? { loreGlossaryItems: loreGlossaryLinkItems, onOpenLoreTerm }
    : { glossaryItems: glossaryLinkItems, onOpenGlossaryTerm };

  return (
    <div
      className={`gl-qcm-feedback-block ${correct ? 'gl-qcm-feedback-block--ok' : 'gl-qcm-feedback-block--ko'} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className={`gl-qcm-feedback ${correct ? 'gl-qcm-feedback--ok' : 'gl-qcm-feedback--ko'}`}>
        <InlineText text={`${text}${scoreSuffix}`} {...inlineProps} />
      </p>
    </div>
  );
}
