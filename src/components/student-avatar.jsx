import { useEffect, useState } from 'react';
import {
  NEUTRAL_AVATAR_URL,
  getDefaultAvatarUrl,
  getStudentAvatarUrl,
  resolveAvatarPath,
} from '../utils/avatar';

/**
 * Avatar d'un compte : photo déposée, sinon avatar par défaut dessiné par le serveur
 * (`default_avatar_url`). En cas d'échec de chargement (URL signée expirée, hors ligne), repli
 * en cascade : photo → avatar par défaut → silhouette neutre embarquée. Aucune requête ne part
 * vers un service tiers.
 */
function StudentAvatar({ student, size = 28, style = {}, className = '' }) {
  const primaryUrl = getStudentAvatarUrl(student);
  const defaultUrl = getDefaultAvatarUrl(student);
  const [src, setSrc] = useState(primaryUrl);

  useEffect(() => {
    setSrc(primaryUrl);
  }, [primaryUrl]);

  const pathKey = resolveAvatarPath(student) || '';
  const imgKey = `${pathKey}|${student?.id || ''}`;

  const handleError = () => {
    setSrc((current) => {
      // Dernier repli atteint : on s'y tient (pas d'aller-retour avec l'avatar par défaut).
      if (current === NEUTRAL_AVATAR_URL) return current;
      if (current !== defaultUrl) return defaultUrl;
      return NEUTRAL_AVATAR_URL;
    });
  };

  return (
    <img
      key={imgKey}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={`student-avatar ${className}`.trim()}
      onError={handleError}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        border: '1px solid rgba(255,255,255,.4)',
        ...style,
      }}
    />
  );
}

export { StudentAvatar };
