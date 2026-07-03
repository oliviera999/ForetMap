/**
 * Pick-list « Zones et repères » partagée (cases à cocher, sous-titres conditionnels).
 *
 * Mutualise la structure `task-form-pick-list` dupliquée entre `TaskFormModal`,
 * `TaskProjectFormModal` et `TutorialEditorPanel` (audit 2026-07, P1). Composant
 * feuille prop-driven : les listes passées (`zones`/`markers`) sont déjà filtrées
 * par carte (cf. `filterSelectableZones`/`filterSelectableMarkers`), la sélection
 * et les toggles restent détenus par le parent.
 */

/** Zones sélectionnables : non spéciales, limitées à la carte si `mapId` est renseigné. */
export function filterSelectableZones(zones, mapId) {
  return zones.filter((z) => !z.special && (!mapId || z.map_id === mapId));
}

/** Repères sélectionnables : limités à la carte si `mapId` est renseigné. */
export function filterSelectableMarkers(markers, mapId) {
  return markers.filter((m) => !mapId || m.map_id === mapId);
}

/**
 * Ajoute/retire un id (chaîne trimée) d'une liste de sélection.
 * Retourne `null` si l'id est vide (le parent garde alors l'état inchangé).
 */
export function toggledLocationIds(ids, rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Libellé repère par défaut : emoji du repère (repli 📍) + label. */
function defaultMarkerLabel(m) {
  return (
    <>
      {m.emoji ? `${m.emoji} ` : '📍 '}
      {m.label}
    </>
  );
}

function normalizedIdSet(ids) {
  return new Set((ids || []).map((id) => String(id ?? '').trim()));
}

export function LocationPickList({
  zones = [],
  markers = [],
  selectedZoneIds = [],
  selectedMarkerIds = [],
  onToggleZone,
  onToggleMarker,
  zoneLabel,
  markerLabel = defaultMarkerLabel,
  emptyText = 'Aucune zone ni repère pour cette carte.',
}) {
  const zoneIdSet = normalizedIdSet(selectedZoneIds);
  const markerIdSet = normalizedIdSet(selectedMarkerIds);
  return (
    <div className="task-form-pick-list">
      {zones.length === 0 && markers.length === 0 ? (
        <p className="task-form-pick-empty">{emptyText}</p>
      ) : (
        <>
          {zones.length > 0 && (
            <>
              {markers.length > 0 && (
                <div className="task-form-pick-subheading" aria-hidden="true">
                  Zones
                </div>
              )}
              {zones.map((z) => (
                <label key={z.id} className="task-form-pick-item">
                  <input
                    type="checkbox"
                    className="task-form-pick-checkbox"
                    checked={zoneIdSet.has(String(z.id ?? '').trim())}
                    onChange={() => onToggleZone(z.id)}
                  />
                  <span className="task-form-pick-text">{zoneLabel(z)}</span>
                </label>
              ))}
            </>
          )}
          {markers.length > 0 && (
            <>
              {zones.length > 0 && (
                <div className="task-form-pick-subheading" aria-hidden="true">
                  Repères
                </div>
              )}
              {markers.map((m) => (
                <label key={m.id} className="task-form-pick-item">
                  <input
                    type="checkbox"
                    className="task-form-pick-checkbox"
                    checked={markerIdSet.has(String(m.id ?? '').trim())}
                    onChange={() => onToggleMarker(m.id)}
                  />
                  <span className="task-form-pick-text">{markerLabel(m)}</span>
                </label>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
