import React from 'react';
import { stageBadge } from '../../utils/badges';

/**
 * En-tête présentationnel de ZoneInfoModal : titre de la zone, pastille d'état,
 * et (pour les profs sur une zone non spéciale) les actions Copie / Supprimer.
 * Composant sans état : la logique métier reste dans ZoneInfoModal.
 */
function ZoneInfoModalHeader({
  zone,
  displayStage,
  isTeacher,
  duplicating = false,
  onDuplicate = null,
  onDelete,
  onClose,
  onDuplicateError,
}) {
  const showTeacherActions = isTeacher && !zone.special;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{zone.name}</h3>
        <div style={{ marginTop: 3 }}>{stageBadge(displayStage)}</div>
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
              }}>
              {duplicating ? '…' : '📋 Copie'}
            </button>
          )}
          <button type="button" className="btn btn-danger btn-sm"
            onClick={() => { if (confirm(`Supprimer "${zone.name}" ?`)) { onDelete(zone.id); onClose(); } }}>
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

export { ZoneInfoModalHeader };
