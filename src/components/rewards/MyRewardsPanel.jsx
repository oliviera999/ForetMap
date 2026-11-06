import { useMemo, useState } from 'react';
import { RewardCelebration } from './RewardCelebration.jsx';
import {
  countEarnedEntries,
  earnedOf,
  formatAwardDate,
  groupCatalogueByFamily,
  progressLabel,
} from './rewardsUi.js';

function TierPills({ entry, earned }) {
  if (!entry.tiers?.length) return null;
  const reached = new Set(earned.map((r) => r.tier));
  return (
    <span className="reward-tiers" aria-label="Paliers">
      {entry.tiers.map((t, i) => {
        const got = reached.has(i + 1);
        return (
          <span
            key={t.label}
            className={`reward-tier${got ? ' reward-tier--earned' : ''}`}
            title={`${t.label} : ${t.threshold}`}
            data-earned={got ? 'true' : 'false'}
          >
            <span aria-hidden="true">{t.emoji}</span> {t.label}
            {!got && <span className="fm-visually-hidden"> (à venir)</span>}
          </span>
        );
      })}
    </span>
  );
}

function ProgressBar({ entry, progress }) {
  if (!progress || progress.nextThreshold == null) return null;
  const pct = Math.min(100, Math.round((progress.value / progress.nextThreshold) * 100));
  const label = progressLabel(entry, progress);
  return (
    <div className="reward-progress">
      <div
        className="reward-progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.nextThreshold}
        aria-valuenow={Math.min(progress.value, progress.nextThreshold)}
        aria-label={`${entry.title} : ${label}`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="reward-progress__label">{label}</span>
    </div>
  );
}

function RewardCard({ entry, earned, progress }) {
  const got = earned.length > 0;
  const last = earned[earned.length - 1];
  return (
    <li
      className={`reward-card${got ? '' : ' reward-card--locked'}`}
      data-earned={got ? 'true' : 'false'}
      data-reward={entry.key}
    >
      <div className="reward-card__head">
        <span className="reward-card__emoji" aria-hidden="true">
          {got ? entry.emoji : '🔒'}
        </span>
        <span className="reward-card__title">
          {entry.title}
          {!got && <span className="fm-visually-hidden"> (à obtenir)</span>}
        </span>
        {entry.source === 'manual' && got && earned.length > 1 && (
          <span className="reward-card__count">× {earned.length}</span>
        )}
      </div>
      <p className="reward-card__desc">{entry.description}</p>
      <TierPills entry={entry} earned={earned} />
      <ProgressBar entry={entry} progress={progress} />
      {got && last?.awardedAt && (
        <p className="reward-card__date">Obtenu le {formatAwardDate(last.awardedAt)}</p>
      )}
      {entry.source === 'manual' &&
        earned
          .filter((r) => r.note)
          .map((r) => (
            <p key={r.key} className="reward-card__note">
              « {r.note} »
            </p>
          ))}
    </li>
  );
}

/**
 * « Mes badges » (élève) : badges regroupés par famille, paliers obtenus en couleur et à venir
 * en gris, progression vers le palier suivant, date d'obtention, mot de l'adulte (badges
 * manuels). Les badges pas encore vus déclenchent une célébration regroupée ; à sa fermeture,
 * `onSeen` marque les annonces vues (`POST /api/rewards/me/seen`).
 */
export function MyRewardsPanel({ data, onSeen }) {
  const catalogue = Array.isArray(data?.catalogue) ? data.catalogue : [];
  const rewards = Array.isArray(data?.rewards) ? data.rewards : [];
  const progressByKey = useMemo(
    () => new Map((data?.progress || []).map((p) => [p.key, p])),
    [data?.progress],
  );
  const groups = useMemo(
    () => groupCatalogueByFamily(catalogue, data?.families),
    [catalogue, data?.families],
  );
  const unseen = useMemo(() => rewards.filter((r) => r.seen === false), [rewards]);
  const [celebrated, setCelebrated] = useState(false);
  if (!catalogue.length) return null;
  const earnedCount = countEarnedEntries(catalogue, rewards);
  return (
    <section className="pedago-rewards" aria-label="Mes badges" data-testid="pedago-rewards">
      <h2 className="pedago-sessions__panel-title">
        Mes badges ({earnedCount}/{catalogue.length})
      </h2>
      {!celebrated && unseen.length > 0 && (
        <RewardCelebration
          rewards={unseen}
          onClose={() => {
            setCelebrated(true);
            onSeen?.();
          }}
        />
      )}
      {groups.map((g) => (
        <div key={g.key} className="reward-family" data-family={g.key}>
          <h3 className="reward-family__title">{g.label}</h3>
          <ul className="reward-family__list">
            {g.entries.map((entry) => (
              <RewardCard
                key={entry.key}
                entry={entry}
                earned={earnedOf(entry, rewards)}
                progress={progressByKey.get(entry.key)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
