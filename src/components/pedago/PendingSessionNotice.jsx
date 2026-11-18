import { useEffect, useState } from 'react';

import { api } from '../../services/api.js';
import { peekPendingSessionSlug } from '../../utils/pedagoSessionLink.js';

/**
 * Écran de connexion : annonce la séance qui attend (lien `?seance=slug`, QR de la classe).
 * Sans ce mot, l'élève se connectait sans savoir qu'une séance allait s'ouvrir — et
 * « Visiter sans compte » ne la lance jamais (le passage et la reprise demandent un compte).
 *
 * @param {{ guestVisitOffered?: boolean }} props
 */
export function PendingSessionNotice({ guestVisitOffered = false }) {
  const [slug] = useState(() => peekPendingSessionSlug());
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    api(`/api/pedago-sessions/${encodeURIComponent(slug)}`)
      .then((session) => {
        if (!cancelled && session?.title) setTitle(String(session.title));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug) return null;
  return (
    <div className="auth-pending-session" role="status" data-testid="auth-pending-session">
      <p className="auth-pending-session__title">
        🧭 Une séance t’attend{title ? ` : « ${title} »` : ''}.
      </p>
      <p className="auth-pending-session__hint">
        Connecte-toi pour la commencer : ta progression sera gardée, tu pourras la reprendre plus
        tard.
        {guestVisitOffered ? ' La visite sans compte ne lance pas les séances.' : ''}
      </p>
    </div>
  );
}
