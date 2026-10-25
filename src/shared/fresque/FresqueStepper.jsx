import {
  canGoToStep,
  lotOfStep,
  FRESQUE_STEP_DISCOVER,
  FRESQUE_STEP_UNDERSTAND,
} from './fresqueCore.js';

export function stepLabel(step) {
  if (step === FRESQUE_STEP_DISCOVER) return 'Découvrir';
  if (step === FRESQUE_STEP_UNDERSTAND) return 'Comprendre';
  const lot = lotOfStep(step);
  return lot ? `Lot ${lot}` : step;
}

/**
 * Bandeau d'étapes : montre où en est l'élève ; on peut revenir voir une étape passée, pas
 * sauter une étape future (règle officielle : un lot s'ouvre quand le précédent est posé).
 */
export function FresqueStepper({ model, state, onGoTo, disabled = false }) {
  const currentIndex = model.steps.indexOf(state.step);
  return (
    <ol className="fm-fresque-stepper" aria-label="Étapes de la fresque">
      {model.steps.map((step, index) => {
        const current = step === state.step;
        const reachable = canGoToStep(model, state, step);
        const done = !current && index < currentIndex;
        const className = [
          'fm-fresque-step',
          current ? 'fm-fresque-step--current' : '',
          done ? 'fm-fresque-step--done' : '',
          !reachable ? 'fm-fresque-step--locked' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={step}>
            <button
              type="button"
              className={className}
              aria-current={current ? 'step' : undefined}
              aria-disabled={!reachable || disabled ? 'true' : undefined}
              disabled={disabled}
              onClick={() => {
                if (reachable && !current) onGoTo?.(step);
              }}
              data-testid={`fm-fresque-step-${step}`}
            >
              {done ? <span aria-hidden="true">✓</span> : null}
              {stepLabel(step)}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
