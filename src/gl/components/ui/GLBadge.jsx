import { joinClassNames } from '../../../shared/utils/classNames.js';
export function GLBadge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={joinClassNames('gl-badge', `gl-badge--${tone}`, className)}>{children}</span>
  );
}
