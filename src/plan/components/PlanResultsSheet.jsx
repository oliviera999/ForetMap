import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { placeDisplayParts } from '../utils/planPlaces.js';

/** Champs de correspondance qui n'ont pas besoin d'être expliqués (le nom saute aux yeux). */
const OBVIOUS_MATCH_FIELDS = new Set(['name', 'alias']);

/** Libellé de la provenance d'une correspondance, quand ce n'est ni le nom ni un alias. */
function matchOriginLabel(matchedFields) {
  const fields = new Set(matchedFields || []);
  for (const field of fields) if (OBVIOUS_MATCH_FIELDS.has(field)) return '';
  if (fields.has('category')) return 'trouvé par sa catégorie';
  if (fields.has('subtitle') || fields.has('text')) return 'trouvé dans la description';
  return '';
}

/**
 * Résultats de recherche du plan (lot 4), en feuille basse : la liste occupe la moitié basse
 * de l'écran et laisse voir la carte, le pouce reste sur la zone atteignable.
 *
 * La feuille est **non bloquante** (`blockBackground={false}`) : la carte reste manipulable
 * derrière et, surtout, le champ de recherche qui vient de l'ouvrir garde le curseur — sans
 * quoi la saisie était purement et simplement impossible
 * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N1 et N2).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.query saisie en cours (message de liste vide).
 * @param {string|null} [props.title] titre imposé (liste des lieux d'un groupe, lot 5).
 * @param {Array<{ place: object, matchedFields?: string[], hiddenByFilter?: boolean }>} props.results
 *   résultats classés (`searchPlaces`).
 * @param {(place: object) => void} props.onSelect
 * @param {(place: object) => Array<{ id: string, label: string, emoji: string }>} props.categoriesOf
 * @param {(place: object) => string} [props.distanceOf] distance à vol d'oiseau depuis la
 *   position, déjà formatée — chaîne vide quand la position n'est pas active. Voir le bloc
 *   ci-dessous : c'est ce qui distingue cinq « WC » autrement identiques.
 * @param {number} [props.totalCount] nombre de lieux que la liste **pourrait** montrer : au-delà
 *   de la limite d'affichage, le titre le dit au lieu de prétendre montrer « tous les lieux »
 *   (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N9).
 * @param {boolean} [props.filterActive] au moins une catégorie est cochée.
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
  totalCount = null,
  filterActive = false,
}) {
  const count = results.length;
  const truncated = totalCount != null && totalCount > count;
  const browseTitle = truncated
    ? `${count} lieux sur ${totalCount}`
    : filterActive
      ? `Lieux affichés (${count})`
      : 'Tous les lieux';
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title || (query ? `Résultats (${count})` : browseTitle)}
      snapPoints={['peek', 'half', 'full']}
      initialSnap="half"
      blockBackground={false}
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
          {results.map(({ place, matchedFields, hiddenByFilter }) => {
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
            const origin = query ? matchOriginLabel(matchedFields) : '';
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
                    {hiddenByFilter || origin ? (
                      <span className="plan-results__hints">
                        {hiddenByFilter ? (
                          <span className="plan-results__hidden">masqué par vos filtres</span>
                        ) : null}
                        {origin ? <span className="plan-results__origin">{origin}</span> : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {truncated ? (
        <p className="plan-results__more">
          Affinez la recherche pour atteindre les {totalCount - count} autres lieux.
        </p>
      ) : null}
    </BottomSheet>
  );
}
