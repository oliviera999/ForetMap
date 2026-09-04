import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { placeDisplayParts } from '../utils/planPlaces.js';

/**
 * Résultats de recherche du plan (lot 4), en feuille basse : la liste occupe la moitié basse
 * de l'écran et laisse voir la carte, le pouce reste sur la zone atteignable.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.query saisie en cours (message de liste vide).
 * @param {string|null} [props.title] titre imposé (liste des lieux d'un groupe, lot 5).
 * @param {Array<{ place: object }>} props.results résultats classés (`searchPlaces`).
 * @param {(place: object) => void} props.onSelect
 * @param {(place: object) => Array<{ id: string, label: string, emoji: string }>} props.categoriesOf
 */
export function PlanResultsSheet({
  open,
  onClose,
  query,
  results,
  onSelect,
  categoriesOf,
  title = null,
}) {
  const count = results.length;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title || (query ? `Résultats (${count})` : 'Tous les lieux')}
      snapPoints={['peek', 'half', 'full']}
      initialSnap="half"
      className="plan-sheet plan-results-sheet"
      testId="plan-results-sheet"
      closeLabel="Fermer les résultats"
      wideAsDialog
    >
      {count === 0 ? (
        <p className="plan-results__empty">
          {query
            ? `Aucun lieu ne correspond à « ${query} ». Essayez un autre mot, ou parcourez les catégories.`
            : 'Aucun lieu à afficher pour ce filtre.'}
        </p>
      ) : (
        <ul className="plan-results">
          {results.map(({ place }) => {
            const categories = categoriesOf(place);
            const { emoji, name } = placeDisplayParts(place);
            return (
              <li key={`${place.kind}:${place.id}`} className="plan-results__item">
                <button type="button" className="plan-results__btn" onClick={() => onSelect(place)}>
                  <span className="plan-results__emoji" aria-hidden>
                    {emoji}
                  </span>
                  <span className="plan-results__text">
                    <span className="plan-results__name">{name}</span>
                    {place.visit_subtitle ? (
                      <span className="plan-results__subtitle">{place.visit_subtitle}</span>
                    ) : null}
                    {categories.length > 0 ? (
                      <span className="plan-results__categories">
                        {categories.map((c) => c.label).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
