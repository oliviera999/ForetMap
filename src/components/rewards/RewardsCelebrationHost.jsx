import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { RewardCelebration } from '../../shared/rewards/RewardCelebration.jsx';
import { useRewardsCelebration } from '../../shared/rewards/useRewardsCelebration.js';

/** Relecture au retour sur l'onglet du navigateur, au plus toutes les 2 minutes. */
const REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Célébration à l'arrivée dans l'application (ForetMap) : les badges pas encore vus sont
 * fêtés dans une petite fenêtre, avec une phrase d'OLU, sans attendre que l'élève ouvre
 * « Mes badges ». Relu quand l'élève revient sur l'onglet (au plus toutes les 2 minutes).
 *
 * `GET /api/rewards/me` évalue aussi les badges sans événement déclencheur (exploration,
 * reportage, collectif) : ils arrivent donc ici. Module éteint (`enabled` faux) : aucun appel.
 * À la fermeture, `POST /api/rewards/me/seen`. Un badge n'est fêté qu'une fois par page
 * (`useRewardsCelebration`), même si « Mes badges » est ouvert juste après.
 */
export function RewardsCelebrationHost({ enabled = false }) {
  const narrator = usePublicSettings()?.content?.help?.narrator || null;
  const [rewards, setRewards] = useState([]);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    lastLoad.current = Date.now();
    return api('/api/rewards/me')
      .then((data) => setRewards(Array.isArray(data?.rewards) ? data.rewards : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRewards([]);
      return undefined;
    }
    load();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoad.current < REFRESH_MIN_INTERVAL_MS) return;
      load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, load]);

  const onSeen = useCallback(() => {
    api('/api/rewards/me/seen', 'POST').catch(() => {});
  }, []);
  const { pending, close } = useRewardsCelebration(enabled ? rewards : [], { onSeen });
  if (!enabled || !pending.length) return null;
  return (
    <div className="reward-celebration-host" data-testid="reward-celebration-host">
      <RewardCelebration rewards={pending} narrator={narrator} onClose={close} />
    </div>
  );
}
