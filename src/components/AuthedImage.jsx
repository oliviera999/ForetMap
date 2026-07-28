import React from 'react';
import { useAuthedImageSrc } from '../hooks/useAuthedImageSrc.js';

/**
 * `<img>` pour les médias ForetMap servis derrière une auth Bearer (journaux de
 * tâche, carnet d'observations). Voir `useAuthedImageSrc`.
 *
 * @param {{
 *   path: string|null|undefined,
 *   alt?: string,
 *   className?: string,
 *   style?: React.CSSProperties,
 *   loading?: 'lazy'|'eager',
 *   decoding?: 'async'|'auto'|'sync',
 *   onClick?: (event: React.MouseEvent<HTMLImageElement>, resolvedSrc: string) => void,
 * }} props
 */
export function AuthedImage({
  path,
  alt = '',
  className,
  style,
  loading = 'lazy',
  decoding = 'async',
  onClick,
}) {
  const { src, error } = useAuthedImageSrc(path);
  if (!src || error) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      decoding={decoding}
      onClick={onClick ? (event) => onClick(event, src) : undefined}
    />
  );
}
