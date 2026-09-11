import { useState } from 'react';

import { Button } from '../../shared/ui/Button.jsx';

import { routeStepTitle } from '../utils/planRoutes.js';

/** Hauteur approximative de la barre (px scène) pour le recentrage carte au-dessus. */
export const PLAN_ROUTE_BAR_FOCUS_INSET_PX = 148;

/**
 * Barre d'étape du **mode parcours** : ancrée en bas, carte restée utilisable (pas de
 * BottomSheet / `inert`). Remplace l'ancienne feuille pleine largeur qui masquait le lieu.
 *
 * @param {object} props
 * @param {object} props.route
 * @param {Array<object>} props.steps
 * @param {number} props.index
 * @param {(next: number) => void} props.onGoToIndex
 * @param {() => void} props.onExit
 * @param {string} [props.distanceLabel]
 * @param {boolean} [props.canLocate]
 */
export function PlanRouteBar({
  route,
  steps,
  index,
  onGoToIndex,
  onExit,
  distanceLabel = '',
  canLocate = false,
}) {
  const [textExpanded, setTextExpanded] = useState(false);
  const total = steps.length;
  const entry = steps[index] || null;
  const title = entry ? routeStepTitle(entry) : route.title;
  const stepText = entry?.step?.step_text ? String(entry.step.step_text).trim() : '';
  const longText = stepText.length > 120;

  return (
    <aside
      className="plan-route-bar"
      data-testid="plan-route-sheet"
      aria-label={`Parcours ${route.title}`}
    >
      <div className="plan-route-bar__head">
        <div className="plan-route-bar__titles">
          <p className="plan-route-bar__route">{route.title}</p>
          {entry ? (
            <h2 className="plan-route-bar__step">
              <span className="plan-route__step-number" aria-hidden>
                {entry.number}
              </span>
              <span>{title}</span>
            </h2>
          ) : (
            <p className="plan-route__empty">
              {route.description || 'Ce parcours n’a pas encore d’étape affichable.'}
            </p>
          )}
        </div>
        <button type="button" className="plan-route-bar__quit" onClick={onExit}>
          Quitter
        </button>
      </div>

      {stepText ? (
        <p className={`plan-route-bar__text${textExpanded ? ' is-expanded' : ''}`}>
          {longText && !textExpanded ? `${stepText.slice(0, 110).trim()}…` : stepText}
          {longText ? (
            <button
              type="button"
              className="plan-route-bar__more"
              onClick={() => setTextExpanded((v) => !v)}
            >
              {textExpanded ? 'Réduire' : 'Lire plus'}
            </button>
          ) : null}
        </p>
      ) : null}

      {distanceLabel ? (
        <p className="plan-route-bar__hint">À {distanceLabel} à vol d’oiseau.</p>
      ) : (
        <p className="plan-route-bar__hint">
          {canLocate
            ? 'Le lieu est mis en avant sur le plan. Utilisez « Me situer » puis avancez.'
            : 'Repère-toi sur le plan (lieu mis en avant), puis Suivant.'}
        </p>
      )}

      <div className="plan-route__actions">
        <Button variant="secondary" disabled={index <= 0} onClick={() => onGoToIndex(index - 1)}>
          Précédent
        </Button>
        <span className="plan-route__counter" aria-live="polite">
          {total > 0 ? `Étape ${index + 1} sur ${total}` : 'Aucune étape'}
        </span>
        <Button
          variant="primary"
          disabled={total === 0 || index >= total - 1}
          onClick={() => onGoToIndex(index + 1)}
        >
          Suivant
        </Button>
      </div>
    </aside>
  );
}
