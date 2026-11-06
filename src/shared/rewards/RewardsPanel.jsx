import { useMemo } from 'react';
import { RewardCelebration } from './RewardCelebration.jsx';
import { useRewardsCelebration } from './useRewardsCelebration.js';
import {
  countEarnedEntries,
  earnedOf,
  formatAwardDate,
  groupCatalogueByFamily,
  progressLabel,
} from './rewardsCore.js';

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
 * Panneau de badges — **commun aux produits** (ForetMap, Gnomes & Licornes) : badges regroupés
 * par famille, paliers obtenus en couleur et à venir en gris, progression vers le palier
 * suivant, date d'obtention, mot de l'adulte (badges décernés).
 *
 * `data` a la forme de la réponse `GET /api/rewards/me` (`rewards`, `progress`, `catalogue`,
 * `families`) ; chaque produit la charge depuis sa propre route.
 *
 *  - `readOnly` : consultation (statistiques, fiche d'un élève vue par un adulte) — aucune
 *    célébration, aucun `onSeen` ;
 *  - sinon, les badges pas encore vus déclenchent une célébration regroupée (une seule fois par
 *    page, voir `useRewardsCelebration`) ; à sa fermeture, `onSeen` marque les annonces vues.
 *
 * @param {{ data: object, onSeen?: Function, readOnly?: boolean, title?: string,
 *   narrator?: object|null, extraPools?: object|null, headingLevel?: 2|3,
 *   testId?: string }} props
 */
export function RewardsPanel({
  data,
  onSeen,
  readOnly = false,
  title = 'Mes badges',
  narrator = null,
  extraPools = null,
  headingLevel = 2,
  testId = 'pedago-rewards',
}) {
  const catalogue = useMemo(
    () => (Array.isArray(data?.catalogue) ? data.catalogue : []),
    [data?.catalogue],
  );
  const rewards = useMemo(
    () => (Array.isArray(data?.rewards) ? data.rewards : []),
    [data?.rewards],
  );
  const progressByKey = useMemo(
    () => new Map((data?.progress || []).map((p) => [p.key, p])),
    [data?.progress],
  );
  const groups = useMemo(
    () => groupCatalogueByFamily(catalogue, data?.families),
    [catalogue, data?.families],
  );
  const { pending, close } = useRewardsCelebration(readOnly ? [] : rewards, { onSeen });
  if (!catalogue.length) return null;
  const earnedCount = countEarnedEntries(catalogue, rewards);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const FamilyHeading = headingLevel === 3 ? 'h4' : 'h3';
  return (
    <section className="pedago-rewards" aria-label={title} data-testid={testId}>
      <Heading className="pedago-sessions__panel-title">
        {title} ({earnedCount}/{catalogue.length})
      </Heading>
      {pending.length > 0 && (
        <RewardCelebration
          rewards={pending}
          narrator={narrator}
          extraPools={extraPools}
          onClose={close}
        />
      )}
      {groups.map((g) => (
        <div key={g.key} className="reward-family" data-family={g.key}>
          <FamilyHeading className="reward-family__title">{g.label}</FamilyHeading>
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
