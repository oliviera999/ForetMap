import { useCallback, useMemo, useState } from 'react';

/**
 * Clés déjà célébrées pendant la vie de la page, **tous écrans confondus** : l'accueil de
 * l'application et « Mes badges » peuvent recevoir les mêmes badges non vus avant que
 * `seen_at` soit posé ; un badge n'est fêté qu'une fois.
 */
const celebratedKeys = new Set();

/** Remise à zéro (tests). */
export function resetCelebratedRewards() {
  celebratedKeys.clear();
}

/**
 * Badges à célébrer parmi `rewards` (ceux marqués `seen: false`, pas encore fêtés dans la
 * page). `close()` les marque fêtés et appelle `onSeen` (le produit pose `seen_at` par sa
 * route : `POST /api/rewards/me/seen` pour la forêt). Commun ForetMap + Gnomes & Licornes.
 *
 * @param {object[]} rewards badges décrits (`key`, `seen`)
 * @param {{ onSeen?: Function }} [options]
 * @returns {{ pending: object[], close: () => void }}
 */
export function useRewardsCelebration(rewards, { onSeen } = {}) {
  const [closedAt, setClosedAt] = useState(0);
  const pending = useMemo(
    () =>
      (Array.isArray(rewards) ? rewards : []).filter(
        (r) => r && r.seen === false && !celebratedKeys.has(r.key),
      ),
    // `closedAt` relit l'ensemble partagé après une fermeture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rewards, closedAt],
  );
  const close = useCallback(() => {
    for (const r of pending) celebratedKeys.add(r.key);
    setClosedAt(Date.now());
    onSeen?.();
  }, [pending, onSeen]);
  return { pending, close };
}
