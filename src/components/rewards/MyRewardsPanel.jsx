import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { RewardsPanel } from '../../shared/rewards/RewardsPanel.jsx';

/**
 * « Mes badges » (ForetMap) : panneau commun (`src/shared/rewards/RewardsPanel.jsx`) avec le
 * narrateur de la forêt. `readOnly` pour une consultation sans célébration (statistiques,
 * fiche d'un élève).
 */
export function MyRewardsPanel(props) {
  const narrator = usePublicSettings()?.content?.help?.narrator || null;
  return <RewardsPanel narrator={narrator} {...props} />;
}
