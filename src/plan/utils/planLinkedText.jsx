/**
 * Composant de rendu des textes éditoriaux du Plan. La politique de lien et le découpage
 * vivent dans `planLinkedText.js` (module pur, testé par `tests/plan-linked-text.test.js` —
 * `node:test` ne charge pas le JSX).
 */
import { splitPlanTextBlocks } from './planLinkedText.js';

const EXTERNAL_LINK_HINT = '(ouvre un nouvel onglet)';

/** Segments d'une ligne → nœuds React (liens cliquables, texte échappé par React). */
function renderSegments(segments, keyPrefix) {
  return segments.map((segment, index) =>
    segment.type === 'link' ? (
      <a
        key={`${keyPrefix}l${index}`}
        className="plan-place__link"
        href={segment.href}
        {...(segment.kind === 'external'
          ? {
              target: '_blank',
              rel: 'noopener noreferrer',
              'aria-label': `${segment.label} ${EXTERNAL_LINK_HINT}`,
            }
          : {})}
      >
        {segment.label}
      </a>
    ) : (
      <span key={`${keyPrefix}t${index}`}>{segment.value}</span>
    ),
  );
}

/**
 * Rend un texte du Plan : paragraphes, listes à puces et liens.
 *
 * Un texte d'une seule ligne rend exactement ce qu'il rendait avant la mise en blocs — un
 * `Tag` unique portant `className`. Dès qu'il en compte plusieurs, ou qu'il contient des
 * puces, le rendu devient une suite de blocs enveloppée dans un `<div>` qui reprend la
 * classe : les consignes rédigées dans la console (`location_notes`) gardent alors sur
 * proflyautey l'aération qu'elles ont sur la carte de travail et dans la Visite.
 *
 * @param {{ text?: string, className?: string, tag?: string }} props
 */
export function PlanLinkedText({ text, className = '', tag: Tag = 'p' }) {
  const blocks = splitPlanTextBlocks(text);
  if (!blocks.length) return null;

  const isSingleLineParagraph =
    blocks.length === 1 && blocks[0].type === 'paragraph' && blocks[0].lines.length === 1;
  if (isSingleLineParagraph) {
    return (
      <Tag className={className || undefined}>{renderSegments(blocks[0].lines[0], '0-0-')}</Tag>
    );
  }

  return (
    <div className={className || undefined}>
      {blocks.map((block, blockIndex) =>
        block.type === 'list' ? (
          <ul className="plan-place__list" key={`b${blockIndex}`}>
            {block.lines.map((segments, lineIndex) => (
              <li key={`b${blockIndex}i${lineIndex}`}>
                {renderSegments(segments, `${blockIndex}-${lineIndex}-`)}
              </li>
            ))}
          </ul>
        ) : (
          <Tag className="plan-place__para" key={`b${blockIndex}`}>
            {block.lines.map((segments, lineIndex) => (
              // Retour à la ligne simple = saut de ligne, comme `marked` avec `breaks: true`.
              <span key={`b${blockIndex}i${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderSegments(segments, `${blockIndex}-${lineIndex}-`)}
              </span>
            ))}
          </Tag>
        ),
      )}
    </div>
  );
}
