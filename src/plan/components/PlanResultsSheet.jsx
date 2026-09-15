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
 * @param {(place: object) => string} [props.distanceOf] distance à vol d'oiseau depuis la
 *   position, déjà formatée — chaîne vide quand la position n'est pas active. Voir le bloc
 *   ci-dessous : c'est ce qui distingue cinq « WC » autrement identiques.
 */
export function PlanResultsSheet({
  open,
  onClose,
  query,
  results,
  onSelect,
  categoriesOf,
  distanceOf = null,
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
            /**
             * Distance à vol d'oiseau, quand la position est active
             * (`docs/AUDIT_PLAN_AFFICHAGE_2026-09-13.md` N4) : en production, cinq repères
             * « WC » s'affichent en cinq lignes strictement identiques — même emoji, même nom,
             * ni sous-titre ni catégorie distinctive. Il fallait ouvrir les cinq fiches l'une
             * après l'autre pour savoir laquelle était la plus proche. La distance étant déjà
             * calculée pour « Y aller », l'afficher ici ne coûte rien et tranche la question.
             *
             * Elle est **dans le bouton**, donc dans son nom accessible : « WC 120 m » se
             * distingue de « WC 40 m » aussi bien au lecteur d'écran qu'à l'œil.
             */
            const distance = distanceOf ? distanceOf(place) : '';
            return (
              <li key={`${place.kind}:${place.id}`} className="plan-results__item">
                <button type="button" className="plan-results__btn" onClick={() => onSelect(place)}>
                  <span className="plan-results__emoji" aria-hidden>
                    {emoji}
                  </span>
                  <span className="plan-results__text">
                    <span className="plan-results__name">
                      {name}
                      {distance ? <span className="plan-results__distance">{distance}</span> : null}
                    </span>
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
