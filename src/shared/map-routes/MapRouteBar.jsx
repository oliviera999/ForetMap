import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../ui/Button.jsx';

import { routeStepTitle } from './mapRouteSteps.js';

/**
 * Hauteur de repli de la barre, en px, pour le recadrage de la carte au-dessus.
 *
 * Ce n'est qu'un **repli** : la barre mesure sa propre hauteur et la remonte par `onHeight`.
 * La constante seule sous-estimait la réalité de près du double — 148 px annoncés contre 275
 * mesurés sur un téléphone de 844 px, et 420 le texte d'étape déplié —, si bien que la carte
 * recadrait l'étape courante **sous** la barre, le défaut déjà corrigé pour les feuilles
 * basses (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2,
 * `docs/AUDIT_PARCOURS_2026-09-17.md` §2.7).
 */
export const MAP_ROUTE_BAR_FOCUS_INSET_PX = 148;

/**
 * Barre d'étape du mode parcours : ancrée en bas, carte restée utilisable.
 * Dual-class `map-*` / `plan-*` : le Plan n'importe pas index.css.
 */
export function MapRouteBar({
  route,
  steps,
  index,
  onGoToIndex,
  onExit,
  distanceLabel = '',
  canLocate = false,
  hintLocate = 'Le lieu est mis en avant sur le plan. Utilisez « Me situer » puis avancez.',
  hintManual = 'Repère-toi sur le plan (lieu mis en avant), puis Suivant.',
  testId = 'map-route-bar',
  onHeight,
}) {
  const [textExpanded, setTextExpanded] = useState(false);

  /**
   * Hauteur réelle occupée, remontée à la surface qui recadre la carte. Elle change avec le
   * texte d'étape, son dépliage et la largeur de l'écran : une constante ne peut pas suivre.
   */
  const barRef = useRef(null);
  const reportHeight = useCallback(() => {
    if (!onHeight || !barRef.current) return;
    onHeight(Math.round(barRef.current.getBoundingClientRect().height));
  }, [onHeight]);
  useEffect(() => {
    if (!onHeight) return undefined;
    reportHeight();
    const node = barRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(reportHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
      onHeight(0);
    };
  }, [onHeight, reportHeight]);
  const total = steps.length;
  const entry = steps[index] || null;
  const title = entry ? routeStepTitle(entry) : route.title;
  const stepText = entry?.step?.step_text ? String(entry.step.step_text).trim() : '';
  const longText = stepText.length > 120;

  return (
    <aside
      ref={barRef}
      className="map-route-bar plan-route-bar"
      data-testid={testId}
      aria-label={`Parcours ${route.title}`}
    >
      <div className="map-route-bar__head plan-route-bar__head">
        <div className="map-route-bar__titles plan-route-bar__titles">
          <p className="map-route-bar__route plan-route-bar__route">{route.title}</p>
          {entry ? (
            <h2 className="map-route-bar__step plan-route-bar__step">
              <span className="map-route__step-number plan-route__step-number" aria-hidden>
                {entry.number}
              </span>
              <span>{title}</span>
            </h2>
          ) : (
            <p className="map-route__empty plan-route__empty">
              {route.description || 'Ce parcours n’a pas encore d’étape affichable.'}
            </p>
          )}
        </div>
        <button type="button" className="map-route-bar__quit plan-route-bar__quit" onClick={onExit}>
          Quitter
        </button>
      </div>
      {stepText ? (
        <p
          className={`map-route-bar__text plan-route-bar__text${textExpanded ? ' is-expanded' : ''}`}
        >
          {longText && !textExpanded ? `${stepText.slice(0, 110).trim()}…` : stepText}
          {longText ? (
            <button
              type="button"
              className="map-route-bar__more plan-route-bar__more"
              onClick={() => setTextExpanded((v) => !v)}
            >
              {textExpanded ? 'Réduire' : 'Lire plus'}
            </button>
          ) : null}
        </p>
      ) : null}
      {distanceLabel ? (
        <p className="map-route-bar__hint plan-route-bar__hint">
          À {distanceLabel} à vol d’oiseau.
        </p>
      ) : (
        <p className="map-route-bar__hint plan-route-bar__hint">
          {canLocate ? hintLocate : hintManual}
        </p>
      )}
      <div className="map-route__actions plan-route__actions">
        <Button variant="secondary" disabled={index <= 0} onClick={() => onGoToIndex(index - 1)}>
          Précédent
        </Button>
        <span className="map-route__counter plan-route__counter" aria-live="polite">
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
