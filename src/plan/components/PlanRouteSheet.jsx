import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { Button } from '../../shared/ui/Button.jsx';

import { routeStepTitle } from '../utils/planRoutes.js';

/**
 * Feuille du **mode parcours** (lot 8, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6) : l'étape
 * courante, son texte, et les commandes « précédent » / « suivant ».
 *
 * Aucune validation, aucun enregistrement : on avance, on saute, on quitte. L'avancement vit
 * sur l'appareil, et rien n'est envoyé au serveur.
 *
 * @param {object} props
 * @param {object} props.route parcours actif.
 * @param {Array<object>} props.steps étapes résolues (`resolveRouteSteps`).
 * @param {number} props.index position courante.
 * @param {(next: number) => void} props.onGoToIndex
 * @param {() => void} props.onExit quitter le parcours.
 * @param {string} [props.distanceLabel] distance jusqu'à l'étape (lot 6).
 */
export function PlanRouteSheet({ route, steps, index, onGoToIndex, onExit, distanceLabel = '' }) {
  const total = steps.length;
  const entry = steps[index] || null;
  const title = entry ? routeStepTitle(entry) : route.title;
  return (
    <BottomSheet
      open
      onClose={onExit}
      title={route.title}
      snapPoints={['peek', 'half', 'full']}
      initialSnap="peek"
      className="plan-sheet plan-route-sheet"
      testId="plan-route-sheet"
      closeLabel="Quitter le parcours"
      wideAsDialog
      footer={
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
      }
    >
      {route.audience ? <p className="plan-route__audience">{route.audience}</p> : null}
      {entry ? (
        <>
          <h3 className="plan-route__step-title">
            <span className="plan-route__step-number" aria-hidden>
              {entry.number}
            </span>
            {title}
          </h3>
          {entry.place?.name && entry.place.name !== title ? (
            <p className="plan-route__place">{entry.place.name}</p>
          ) : null}
          {entry.step.step_text ? (
            <p className="plan-route__step-text">{entry.step.step_text}</p>
          ) : null}
          {distanceLabel ? (
            <p className="plan-route__distance">À {distanceLabel} à vol d’oiseau.</p>
          ) : null}
        </>
      ) : (
        <p className="plan-route__empty">
          {route.description || 'Ce parcours n’a pas encore d’étape affichable.'}
        </p>
      )}
      <Button variant="ghost" block onClick={onExit} className="plan-route__exit">
        Quitter le parcours
      </Button>
    </BottomSheet>
  );
}
