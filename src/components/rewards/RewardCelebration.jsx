import { useMemo } from 'react';
import { rewardShortLabel } from './rewardsUi.js';

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * Petite célébration des badges nouvellement obtenus (non encore vus), **regroupée** quand
 * plusieurs arrivent ensemble. Fenêtre courte, fermée par l'élève ; l'animation est coupée
 * si `prefers-reduced-motion: reduce`.
 */
export function RewardCelebration({ rewards = [], onClose }) {
  const reduced = useMemo(prefersReducedMotion, []);
  if (!rewards.length) return null;
  const title = rewards.length === 1 ? 'Nouveau badge !' : `${rewards.length} nouveaux badges !`;
  return (
    <div
      className={`reward-celebration${reduced ? '' : ' reward-celebration--animated'}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-testid="reward-celebration"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <p className="reward-celebration__title">
        <span aria-hidden="true">🎉</span> {title}
      </p>
      <ul className="reward-celebration__list">
        {rewards.map((r) => (
          <li key={r.key}>
            {rewardShortLabel(r)}
            {r.note ? <span className="reward-celebration__note"> — « {r.note} »</span> : null}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
        Super !
      </button>
    </div>
  );
}
