import { useMemo } from 'react';
import { MascotSpeaker } from '../components/MascotSpeaker.jsx';
import { SpeechBubble } from '../components/SpeechBubble.jsx';
import { rewardShortLabel } from './rewardsCore.js';
import { oluRewardLine } from '../utils/oluRewardsVoice.js';

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * Célébration des badges nouvellement obtenus (non encore vus), **regroupée** quand
 * plusieurs arrivent ensemble. Composant commun ForetMap + Gnomes & Licornes : le produit
 * passe son narrateur (`content.help.narrator` côté forêt) et, au besoin, ses phrases de
 * famille (`extraPools`, voir `oluRewardsVoice.js`).
 *
 * OLU dit une phrase **après** la liste des badges (l'information d'abord, §2.2bis) ; sans
 * narrateur (`narrator` absent ou coupé), la bulle reste, sans portrait ni nom. Fenêtre
 * courte, fermée par l'élève ; animation et machine à écrire coupées si
 * `prefers-reduced-motion: reduce`.
 */
export function RewardCelebration({ rewards = [], onClose, narrator = null, extraPools = null }) {
  const reduced = useMemo(prefersReducedMotion, []);
  const line = useMemo(() => oluRewardLine(rewards, { extraPools }), [rewards, extraPools]);
  if (!rewards.length) return null;
  const title = rewards.length === 1 ? 'Nouveau badge !' : `${rewards.length} nouveaux badges !`;
  const speakerName = narrator && narrator.enabled !== false ? narrator.speakerName || '' : '';
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
      {line ? (
        <div className="reward-celebration__olu" data-testid="reward-celebration-olu">
          <MascotSpeaker narrator={narrator} expression="content" size="face" />
          <SpeechBubble speakerName={speakerName} text={line} typewriter={!reduced} />
        </div>
      ) : null}
      <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
        Super !
      </button>
    </div>
  );
}
