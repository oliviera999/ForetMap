import { joinClassNames } from '../../../shared/utils/classNames.js';
export function GLSurface({
  as: Tag = 'section',
  variant = 'elevated',
  className = '',
  children,
  ...props
}) {
  return (
    <Tag className={joinClassNames('gl-surface', `gl-surface--${variant}`, className)} {...props}>
      {children}
    </Tag>
  );
}
