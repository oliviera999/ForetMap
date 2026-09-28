import { LocationCategoryBadges } from './LocationCategoryPicker.jsx';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { zoneEmojiOf, zoneTitleOf } from '../../utils/zoneDisplay.js';
import { LocationHeaderActions } from './LocationModalParts.jsx';
import { IconDrawZone } from '../../shared/icons.jsx';
import { formatSurface, zoneSurfaceM2 } from '../../utils/zoneSurface.js';

/**
 * En-tête présentationnel de ZoneInfoModal : titre de la zone, pastilles de
 * catégories, et (pour les profs) les actions Contour / Copie / Supprimer — y compris
 * sur les zones d'infrastructure, éditables. Composant sans état : la logique métier
 * reste dans ZoneInfoModal.
 */
function ZoneInfoModalHeader({
  zone,
  isTeacher,
  georef = null,
  duplicating = false,
  onDuplicate = null,
  onEditPoints = null,
  onDelete,
  onClose,
  onDuplicateError,
}) {
  const { confirm } = useAppDialogs();
  const showTeacherActions = isTeacher;
  const surfaceLabel = isTeacher ? formatSurface(zoneSurfaceM2(zone, georef)) : null;

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
        {surfaceLabel ? (
          <div
            className="zone-info-surface"
            title="Estimation calculée à partir du calage GPS de la carte"
            style={{ marginTop: 2, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}
          >
            Surface : {surfaceLabel}
          </div>
        ) : null}
        <div style={{ marginTop: 3 }}>
          <LocationCategoryBadges item={zone} />
        </div>
      </div>
      {showTeacherActions && (
        <LocationHeaderActions
          leadingAction={
            onEditPoints ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Modifier le contour de la zone"
                title="Modifier le contour de la zone sur la carte"
                onClick={() => {
                  onEditPoints(zone);
                  onClose();
                }}
              >
                <IconDrawZone size={15} /> Contour
              </button>
            ) : null
          }
          duplicating={duplicating}
          duplicateTitle="Créer une copie sur la même carte (contour légèrement décalé)"
          onDuplicateClick={
            onDuplicate
              ? async () => {
                  try {
                    await onDuplicate(zone);
                  } catch (_) {
                    onDuplicateError?.();
                  }
                }
              : null
          }
          deleteAriaLabel="Supprimer la zone"
          onDeleteClick={async () => {
            if (await confirm({ message: `Supprimer "${zone.name}" ?`, danger: true })) {
              onDelete(zone.id);
              onClose();
            }
          }}
        />
      )}
    </div>
  );
}

export { ZoneInfoModalHeader };
