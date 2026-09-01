import { LocationCategoryBadges } from './LocationCategoryPicker.jsx';
import { zoneEmojiOf, zoneTitleOf } from '../../utils/zoneDisplay.js';

/**
 * En-tête présentationnel de ZoneInfoModal : titre de la zone, pastilles de
 * catégories, et (pour les profs) les actions Copie / Supprimer — y compris sur
 * les zones d'infrastructure, éditables. Composant sans état : la logique métier
 * reste dans ZoneInfoModal.
 */
function ZoneInfoModalHeader({
  zone,
  isTeacher,
  duplicating = false,
  onDuplicate = null,
  onDelete,
  onClose,
  onDuplicateError,
}) {
  const showTeacherActions = isTeacher;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Emoji rendu dans la pile emoji (plus via Playfair Display avec le nom brut) —
            colonne `zones.emoji` en priorité, repli sur le préfixe du nom (audit C4). */}
        <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>
          {zoneEmojiOf(zone) ? (
            <>
              <span className="emoji-glyph" aria-hidden>
                {zoneEmojiOf(zone)}
              </span>{' '}
            </>
          ) : null}
          {zoneEmojiOf(zone) ? zoneTitleOf(zone) : zone.name}
        </h3>
        <div style={{ marginTop: 3 }}>
          <LocationCategoryBadges item={zone} />
        </div>
      </div>
      {showTeacherActions && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onDuplicate && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={duplicating}
              title="Créer une copie sur la même carte (contour légèrement décalé)"
              onClick={async () => {
                try {
                  await onDuplicate(zone);
                } catch (_) {
                  onDuplicateError?.();
                }
              }}
            >
              {duplicating ? '…' : '📋 Copie'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (confirm(`Supprimer "${zone.name}" ?`)) {
                onDelete(zone.id);
                onClose();
              }
            }}
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

export { ZoneInfoModalHeader };
