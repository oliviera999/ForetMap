import { computePhaseProgress } from '../../shared/taskTaxonomyCore.js';

/**
 * Frise des cinq phases d'un projet (migration 329) : tâches validées / total par phase,
 * phase courante mise en évidence (première phase non terminée). Une phase sans aucune tâche
 * est en pointillé, avec l'infobulle « Aucune tâche prévue pour cette phase » — signal
 * pédagogique : « Transmettre » est souvent oubliée.
 *
 * Rien n'est affiché tant qu'aucune tâche du projet n'a de phase.
 */
export function TaskPhaseTimeline({ tasks }) {
  const progress = computePhaseProgress(tasks);
  if (!progress.phases.some((p) => p.total > 0)) return null;
  return (
    <ol
      className="task-phase-timeline"
      aria-label="Phases du projet"
      data-testid="task-phase-timeline"
    >
      {progress.phases.map((p) => {
        const empty = p.total === 0;
        const current = progress.currentPhase === p.key;
        const done = !empty && p.validated === p.total;
        const classes = [
          'task-phase-step',
          empty && 'task-phase-step--empty',
          current && 'task-phase-step--current',
          done && 'task-phase-step--done',
        ]
          .filter(Boolean)
          .join(' ');
        const status = empty
          ? 'Aucune tâche prévue pour cette phase'
          : `${p.validated} validée${p.validated > 1 ? 's' : ''} sur ${p.total}`;
        return (
          <li
            key={p.key}
            className={classes}
            title={status}
            aria-current={current ? 'step' : undefined}
            data-phase={p.key}
          >
            <span className="task-phase-step__label">{p.label}</span>
            <span className="task-phase-step__count">
              {empty ? '—' : `${p.validated}/${p.total}`}
              <span className="fm-visually-hidden">{` : ${status}${current ? ' (phase en cours)' : ''}`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Regroupe les tâches d'un projet par phase, dans l'ordre de la démarche, puis « Sans phase »
 * (ordre d'origine conservé dans chaque groupe). Liste plate (un seul groupe `null`) si aucune
 * tâche n'a de phase.
 * @returns {Array<{ key: string|null, label: string, tasks: object[] }>}
 */
export function groupTasksByPhase(tasks) {
  const progress = computePhaseProgress(tasks);
  const list = tasks || [];
  if (!progress.phases.some((p) => p.total > 0)) return [{ key: null, label: '', tasks: list }];
  const groups = progress.phases
    .map((p) => ({
      key: p.key,
      label: p.label,
      tasks: list.filter((t) => t?.project_phase === p.key),
    }))
    .filter((g) => g.tasks.length > 0);
  const known = new Set(progress.phases.map((p) => p.key));
  const unphased = list.filter((t) => !known.has(t?.project_phase));
  if (unphased.length) groups.push({ key: null, label: 'Sans phase', tasks: unphased });
  return groups;
}
