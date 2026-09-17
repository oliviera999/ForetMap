/**
 * Composant de rendu des textes éditoriaux du Plan. La politique de lien et le découpage
 * vivent dans `planLinkedText.js` (module pur, testé par `tests/plan-linked-text.test.js` —
 * `node:test` ne charge pas le JSX).
 */
import { splitPlanTextLinks } from './planLinkedText.js';

const EXTERNAL_LINK_HINT = '(ouvre un nouvel onglet)';

/**
 * Rend un texte du Plan, liens compris.
 *
 * @param {{ text?: string, className?: string, tag?: string }} props
 */
export function PlanLinkedText({ text, className = '', tag: Tag = 'p' }) {
  const segments = splitPlanTextLinks(text);
  if (!segments.length) return null;
  return (
    <Tag className={className || undefined}>
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <a
            key={`l${index}`}
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
          <span key={`t${index}`}>{segment.value}</span>
        ),
      )}
    </Tag>
  );
}
