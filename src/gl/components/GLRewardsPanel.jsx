import '../styles/gl-rewards.css';
import { RewardsPanel } from '../../shared/rewards/RewardsPanel.jsx';
import { useGlRewards } from '../hooks/useGlRewards.js';
import { useGlNarrator } from '../hooks/useGlNarrator.js';
import { isModuleEnabled } from '../constants/modules.js';
import { GL_REWARDS_OLU_POOLS } from '../constants/glRewardsOlu.js';

/**
 * « Mes badges » Gnomes & Licornes : le panneau commun (`src/shared/rewards/RewardsPanel.jsx`)
 * alimenté par `GET /api/gl/rewards/me`, avec le narrateur G&L (Olu) et les phrases de ses
 * familles. Les badges pas encore vus déclenchent la célébration regroupée ; à sa fermeture,
 * `POST /api/gl/rewards/me/seen`.
 *
 * Privé : rien n'est rendu (ni chargé) en **projection**, module éteint, ou pour un compte
 * qui n'est pas un joueur (403). Aucun classement, aucune ressource.
 *
 * @param {{ modules?: object, title?: string, headingLevel?: 2|3, testId?: string }} props
 */
export function GLRewardsPanel({
  modules = null,
  title = 'Mes badges',
  headingLevel = 3,
  testId = 'gl-rewards',
}) {
  const enabled = modules ? isModuleEnabled(modules, 'rewardsEnabled') : true;
  const { data, markSeen, projection } = useGlRewards({ enabled });
  const { narrator, frozen } = useGlNarrator();
  if (!enabled || projection || !data) return null;
  return (
    <div className="gl-rewards" data-testid={testId}>
      <RewardsPanel
        data={data}
        onSeen={markSeen}
        title={title}
        headingLevel={headingLevel}
        // Olu se fige tant que l'oiseau témoin joue : la célébration garde sa liste, sans bulle.
        narrator={frozen ? { ...(narrator || {}), enabled: false } : narrator}
        extraPools={GL_REWARDS_OLU_POOLS}
        testId={`${testId}-panel`}
      />
    </div>
  );
}
