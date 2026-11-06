import {
  TASK_CATEGORIES,
  TASK_FORMATS,
  PROJECT_PHASES,
  RECURRING_TASK_FORMAT,
  categoryInfo,
  formatInfo,
  phaseInfo,
} from '../../shared/taskTaxonomyCore.js';

function SuggestedMark() {
  return <span className="task-taxo-suggested">suggéré</span>;
}

/**
 * Champs **métier** (grille de 8 boutons), **format** (3 boutons) et **phase de projet**
 * (visible seulement si un projet est choisi) du formulaire de tâche (migration 329).
 * Composant contrôlé : l'état dérivé vient de `resolveTaskTaxonomyFormState`.
 *
 * Boutons à bascule (`aria-pressed`) d'au moins 44 px ; l'emoji est décoratif, le libellé
 * porte le sens.
 */
export function TaskFormTaxonomyField({
  state,
  phase = '',
  required = false,
  onCategory,
  onFormat,
  onPhase,
}) {
  const hintCategory = categoryInfo(state.hintCategory);
  const hintFormat = formatInfo(state.hintFormat);
  const currentPhase = phaseInfo(phase);
  return (
    <div className="task-taxo" data-testid="task-form-taxonomy">
      <fieldset className="task-taxo-field">
        <legend>
          Métier{required ? ' *' : ''} {state.categorySuggested && <SuggestedMark />}
        </legend>
        <div className="task-taxo-grid" role="group" aria-label="Métier de la tâche">
          {TASK_CATEGORIES.map((c) => {
            const selected = state.category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                className={`task-taxo-option${selected ? ' task-taxo-option--selected' : ''}`}
                aria-pressed={selected}
                title={c.description}
                onClick={() => onCategory(c.key)}
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            );
          })}
        </div>
        {hintCategory && (
          <p className="task-taxo-hint">
            Suggestion : {hintCategory.emoji} {hintCategory.label}{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onCategory(hintCategory.key)}
            >
              Appliquer
            </button>
          </p>
        )}
      </fieldset>
      <fieldset className="task-taxo-field">
        <legend>
          Format{required ? ' *' : ''} {state.formatSuggested && <SuggestedMark />}
        </legend>
        <div
          className="task-taxo-grid task-taxo-grid--formats"
          role="group"
          aria-label="Format de la tâche"
        >
          {TASK_FORMATS.map((f) => {
            const selected = state.format === f.key;
            const disabled = state.formatLocked && f.key !== RECURRING_TASK_FORMAT;
            return (
              <button
                key={f.key}
                type="button"
                className={`task-taxo-option${selected ? ' task-taxo-option--selected' : ''}`}
                aria-pressed={selected}
                disabled={disabled}
                title={f.description}
                onClick={() => onFormat(f.key)}
              >
                <span aria-hidden="true">{f.emoji}</span> {f.label}
                <span className="task-taxo-option__desc">{f.description}</span>
              </button>
            );
          })}
        </div>
        {state.formatLocked && (
          <p className="task-taxo-hint">Une tâche récurrente est toujours une Routine.</p>
        )}
        {hintFormat && (
          <p className="task-taxo-hint">
            Suggestion : {hintFormat.emoji} {hintFormat.label}{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onFormat(hintFormat.key)}
            >
              Appliquer
            </button>
          </p>
        )}
        {state.looksLikeProject && (
          <p className="task-taxo-warning" role="status">
            Cette tâche ressemble à un projet : la découper en étapes ?
          </p>
        )}
      </fieldset>
      {state.phaseVisible && (
        <div className="field">
          <label htmlFor="task-form-project-phase">Phase dans le projet</label>
          <select
            id="task-form-project-phase"
            value={phase}
            onChange={(e) => onPhase(e.target.value)}
          >
            <option value="">Sans phase</option>
            {PROJECT_PHASES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          {currentPhase && <p className="task-taxo-hint">{currentPhase.phrase}</p>}
        </div>
      )}
    </div>
  );
}
