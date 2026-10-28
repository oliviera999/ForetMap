/**
 * Mention « À confirmer » sur une photo de fiche (pré-saisie intégrée d'emblée).
 * Visible de tous ; le bouton de validation n'apparaît que pour un professeur habilité.
 */
export function PlantPhotoPendingBadge({ photoId = null, canConfirm = false, onConfirm = null }) {
  return (
    <div className="plant-photo-pending" data-testid="plant-photo-pending">
      <span className="plant-photo-pending__label">À confirmer</span>
      <span className="plant-photo-pending__hint">
        Photo proposée — un professeur doit vérifier qu’elle montre bien l’espèce.
      </span>
      {canConfirm && photoId != null && typeof onConfirm === 'function' ? (
        <button
          type="button"
          className="btn btn-primary btn-sm plant-photo-pending__confirm"
          onClick={() => onConfirm(photoId)}
        >
          Confirmer la photo
        </button>
      ) : null}
    </div>
  );
}
