import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';
import { Button } from '../../shared/ui/Button.jsx';

/**
 * Fiche d'un lieu du plan (lot 4), en feuille basse à crans : un aperçu (nom + accroche)
 * qui laisse la carte visible, puis le détail en glissant vers le haut.
 *
 * Le bouton « Y aller » est présent mais **désactivé** : la position sur le plan arrive au
 * lot 6 (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6). Annoncer la fonction sans la simuler.
 *
 * @param {object} props
 * @param {object|null} props.place lieu sélectionné (`null` = feuille fermée).
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, label: string, emoji: string, color: string }>} props.categories
 * @param {string} [props.shareUrl] lien profond du lieu (`?lieu=`).
 */
export function PlanPlaceSheet({ place, onClose, categories, shareUrl = '' }) {
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
            disabled
            title="Bientôt : votre position sur le plan"
            className="plan-place__go"
          >
            Y aller
          </Button>
          <p className="plan-place__go-hint">Bientôt : votre position sur le plan.</p>
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
