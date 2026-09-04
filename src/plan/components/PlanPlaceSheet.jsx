import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { Button } from '../../shared/ui/Button.jsx';

/**
 * Fiche d'un lieu du plan (lot 4), en feuille basse à crans : un aperçu (nom + accroche)
 * qui laisse la carte visible, puis le détail en glissant vers le haut.
 *
 * « Y aller » (lot 6) trace une **ligne droite** entre la position et le lieu, avec la
 * distance : le plan ne connaît pas encore les chemins, et une direction honnête vaut mieux
 * qu'un itinéraire inventé. Le bouton reste désactivé quand la carte n'est pas calée pour la
 * localisation, avec la raison en clair.
 *
 * @param {object} props
 * @param {object|null} props.place lieu sélectionné (`null` = feuille fermée).
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, label: string, emoji: string, color: string }>} props.categories
 * @param {boolean} [props.canLocate] la carte est calée et le navigateur sait localiser.
 * @param {(place: object) => void} [props.onGoTo]
 * @param {boolean} [props.isTarget] ce lieu est déjà visé.
 * @param {string} [props.distanceLabel] distance à vol d'oiseau, déjà mise en forme.
 * @param {string} [props.shareUrl] lien profond du lieu (`?lieu=`).
 */
export function PlanPlaceSheet({
  place,
  onClose,
  categories,
  canLocate = false,
  onGoTo = null,
  isTarget = false,
  distanceLabel = '',
  shareUrl = '',
}) {
  if (!place) return null;
  const emoji = String(place.emoji || '').trim() || (place.kind === 'zone' ? '🗺️' : '📍');
  const detailsTitle = String(place.visit_details_title || '').trim() || 'Détails';
  const detailsText = String(place.visit_details_text || '').trim();
  const shortDescription = String(place.visit_short_description || '').trim();
  const description = String(place.description || place.note || '').trim();
  const photo = place.map_lead_photo;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        <span className="plan-place__heading">
          <span className="plan-place__emoji" aria-hidden>
            {emoji}
          </span>
          {place.name}
        </span>
      }
      ariaLabel={place.name}
      snapPoints={['peek', 'half', 'full']}
      initialSnap="peek"
      className="plan-sheet plan-place-sheet"
      testId="plan-place-sheet"
      closeLabel="Fermer la fiche du lieu"
      wideAsDialog
      footer={
        <div className="plan-place__actions">
          <Button
            variant="primary"
            block
            disabled={!canLocate}
            title={
              canLocate
                ? 'Afficher la direction et la distance depuis votre position'
                : 'Ce plan n’est pas calé pour la localisation'
            }
            className="plan-place__go"
            onClick={() => onGoTo?.(place)}
          >
            {isTarget && distanceLabel ? `Y aller · ${distanceLabel}` : 'Y aller'}
          </Button>
          <p className="plan-place__go-hint">
            {canLocate
              ? 'Direction à vol d’oiseau depuis votre position, pas un itinéraire.'
              : 'Ce plan n’est pas encore calé pour afficher votre position.'}
          </p>
        </div>
      }
    >
      {place.visit_subtitle ? <p className="plan-place__subtitle">{place.visit_subtitle}</p> : null}
      {categories.length > 0 ? (
        <ul className="plan-place__categories">
          {categories.map((category) => (
            <li key={category.id} className="plan-place__category">
              {category.emoji ? <span aria-hidden>{category.emoji}</span> : null} {category.label}
            </li>
          ))}
        </ul>
      ) : null}
      {photo?.image_url ? (
        <img
          className="plan-place__photo"
          src={photo.thumb_url || photo.image_url}
          alt={photo.caption || `Photo de ${place.name}`}
          loading="lazy"
        />
      ) : null}
      {shortDescription ? <p className="plan-place__lead">{shortDescription}</p> : null}
      {detailsText ? (
        <section className="plan-place__details">
          <h3 className="plan-place__details-title">{detailsTitle}</h3>
          <p className="plan-place__details-text">{detailsText}</p>
        </section>
      ) : null}
      {!shortDescription && !detailsText && description ? (
        <p className="plan-place__lead">{description}</p>
      ) : null}
      {place.search_aliases?.length ? (
        <p className="plan-place__aliases">Aussi appelé : {place.search_aliases.join(', ')}</p>
      ) : null}
      {shareUrl ? <p className="plan-place__share">Lien direct : {shareUrl}</p> : null}
    </BottomSheet>
  );
}
